/**
 * UI Controller
 * Stateless client — fetches config from background at click time.
 * No SettingsManager or TemplateManager instances.
 * Modifier key listeners are stored as named refs and removed on cleanup.
 */

class UIController {
  constructor(dataExtractor, pdfGenerator) {
    this.dataExtractor   = dataExtractor;
    this.pdfGenerator    = pdfGenerator;
    this.activeModifiers = new Set();
    this.configDialog    = null;

    // Named handlers so we can remove them exactly on cleanup
    this._onKeyDown = (e) => {
      if (e.ctrlKey)  this.activeModifiers.add('ctrl');
      if (e.shiftKey) this.activeModifiers.add('shift');
      this._updateButtonStates();
    };
    this._onKeyUp = (e) => {
      if (!e.ctrlKey)  this.activeModifiers.delete('ctrl');
      if (!e.shiftKey) this.activeModifiers.delete('shift');
      this._updateButtonStates();
    };
    this._onBlur = () => {
      this.activeModifiers.clear();
      this._updateButtonStates();
    };

    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup',   this._onKeyUp);
    window.addEventListener('blur',      this._onBlur);
  }

  // ─── Button Creation ───────────────────────────────────────────────────────

  createSmartButton(rowElement) {
    const container = document.createElement('div');
    container.className = 'smart-label-container';

    const button = document.createElement('button');
    button.className = 'smart-print-btn';
    button.innerHTML = '🖨️';
    button.title = 'Print FNSKU Label';

    const quantityInput = document.createElement('input');
    quantityInput.type      = 'number';
    quantityInput.min       = '1';
    quantityInput.max       = '1000';
    quantityInput.value     = '1';
    quantityInput.className = 'quantity-input';
    quantityInput.title     = 'Number of labels';

    quantityInput.addEventListener('click', (e) => e.stopPropagation());
    quantityInput.addEventListener('change', (e) => {
      const v = parseInt(e.target.value);
      if (v < 1)    e.target.value = '1';
      if (v > 1000) e.target.value = '1000';
    });

    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._handleButtonClick(rowElement, quantityInput.value);
    });

    container.appendChild(button);
    container.appendChild(quantityInput);
    return container;
  }

  // ─── Click Handler ────────────────────────────────────────────────────────

  async _handleButtonClick(rowElement, quantity) {
    const qty = parseInt(quantity) || 1;

    try {
      this._setButtonLoading(rowElement, true);

      if (this.activeModifiers.has('shift')) {
        await this._openConfigDialog(rowElement);
        return;
      }

      // Extract product data from the row
      const productData = this.dataExtractor.extractProductData(rowElement);
      const validation  = this.dataExtractor.validateData(productData);
      if (!validation.isValid) throw new Error(validation.errors.join(', '));

      // Fetch fresh config from background — the single source of truth
      const resp = await chrome.runtime.sendMessage({ action: 'getLabelConfig' });
      if (!resp.success) throw new Error(resp.error || 'Failed to get label config');

      const { settings, template } = resp.data;
      const doc = await this.pdfGenerator.generateLabels(productData, qty, settings, template);

      if (this.activeModifiers.has('ctrl')) {
        this.pdfGenerator.openPDFInNewTab(doc);
        this.showNotification('Label opened in new tab', 'success');
      } else {
        this.pdfGenerator.savePDF(doc, `${productData.sku}_label.pdf`);
        this.showNotification(`Downloaded ${qty} label(s) for ${productData.sku}`, 'success');
      }

      // Fire-and-forget history write
      chrome.runtime.sendMessage({
        action: 'addToDownloadHistory',
        data: { ...productData, quantity: qty }
      });

    } catch (error) {
      console.error('Label generation error:', error);
      this.showNotification(`Error: ${error.message}`, 'error');
    } finally {
      this._setButtonLoading(rowElement, false);
    }
  }

  // ─── Config Dialog (Shift+Click) ──────────────────────────────────────────

  async _openConfigDialog(rowElement) {
    if (this.configDialog) {
      this.configDialog.remove();
      this.configDialog = null;
    }

    // Fetch fresh config for dialog population
    const resp = await chrome.runtime.sendMessage({ action: 'getLabelConfig' });
    const { settings, template } = resp.success ? resp.data : { settings: {}, template: null };

    const templatesResp = await chrome.runtime.sendMessage({ action: 'getAllTemplates' });
    const templates = templatesResp.success ? templatesResp.data : [];

    this.configDialog = this._buildConfigDialog(rowElement, settings, template, templates);
    document.body.appendChild(this.configDialog);
    this.configDialog.querySelector('select, input')?.focus();
  }

  _buildConfigDialog(rowElement, settings, activeTemplate, templates) {
    const globalSettings = settings.globalSettings || {};
    const dialog = document.createElement('div');
    dialog.className = 'fnsku-config-dialog';

    const templateOptions = templates.map(t =>
      `<option value="${t.id}" ${t.id === activeTemplate?.id ? 'selected' : ''}>${t.name}</option>`
    ).join('');

    dialog.innerHTML = `
      <div class="dialog-overlay"></div>
      <div class="dialog-content">
        <div class="dialog-header">
          <h3>Label Settings</h3>
          <button class="close-btn" type="button">×</button>
        </div>
        <div class="dialog-body">
          <div class="config-section">
            <label>Template</label>
            <select id="dlg-template" class="config-input">${templateOptions}</select>
          </div>
          <div class="config-section">
            <label>Barcode Format</label>
            <select id="dlg-barcode" class="config-input">
              <option value="CODE128" ${globalSettings.barcodeFormat === 'CODE128' ? 'selected' : ''}>CODE128</option>
              <option value="CODE39"  ${globalSettings.barcodeFormat === 'CODE39'  ? 'selected' : ''}>CODE39</option>
              <option value="EAN13"   ${globalSettings.barcodeFormat === 'EAN13'   ? 'selected' : ''}>EAN13</option>
            </select>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="save-btn"       type="button">Save</button>
          <button class="save-print-btn" type="button">Save &amp; Print</button>
        </div>
      </div>
    `;

    const close = () => { dialog.remove(); this.configDialog = null; };

    dialog.querySelector('.close-btn').addEventListener('click', close);
    dialog.querySelector('.dialog-overlay').addEventListener('click', close);
    dialog.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

    const saveSettings = async () => {
      const templateId    = dialog.querySelector('#dlg-template').value;
      const barcodeFormat = dialog.querySelector('#dlg-barcode').value;
      try {
        await chrome.runtime.sendMessage({
          action: 'saveSettings',
          settings: {
            selectedTemplateId: templateId,
            globalSettings: { ...globalSettings, barcodeFormat }
          }
        });
        this.showNotification('Settings saved', 'success');
      } catch {
        this.showNotification('Failed to save settings', 'error');
      }
    };

    dialog.querySelector('.save-btn').addEventListener('click', async () => {
      await saveSettings();
      close();
    });

    dialog.querySelector('.save-print-btn').addEventListener('click', async () => {
      await saveSettings();
      close();
      if (rowElement) {
        const qty = rowElement.closest('.smart-label-row')
          ?.previousElementSibling
          ?.querySelector('.quantity-input')?.value || '1';
        setTimeout(() => this._handleButtonClick(rowElement, qty), 150);
      }
    });

    return dialog;
  }

  closeConfigurationDialog() {
    this.configDialog?.remove();
    this.configDialog = null;
  }

  // ─── State Push from Background ───────────────────────────────────────────

  onStateUpdated(settings, templates) {
    // Content script is stateless — nothing to cache.
    // If config dialog is open, we could refresh it, but simplest is to leave it.
  }

  // ─── Modifier Key Visual Feedback ─────────────────────────────────────────

  _updateButtonStates() {
    document.querySelectorAll('.smart-print-btn').forEach(button => {
      button.classList.remove('ctrl-held', 'shift-held');
      if (this.activeModifiers.has('ctrl'))  button.classList.add('ctrl-held');
      if (this.activeModifiers.has('shift')) button.classList.add('shift-held');

      let tooltip = 'Print FNSKU Label';
      if (this.activeModifiers.has('shift')) tooltip = 'Open Label Settings';
      else if (this.activeModifiers.has('ctrl')) tooltip = 'Open in New Tab';
      button.title = tooltip;
    });
  }

  _setButtonLoading(rowElement, loading) {
    // rowElement is the product row; button is in the sibling smart-label-row
    const labelRow = rowElement.nextElementSibling;
    const button   = labelRow?.querySelector('.smart-print-btn');
    if (!button) return;

    if (loading) {
      button.disabled   = true;
      button.innerHTML  = '⏳';
      button.classList.add('loading');
    } else {
      button.disabled   = false;
      button.innerHTML  = '🖨️';
      button.classList.remove('loading');
    }
  }

  // ─── Notifications ────────────────────────────────────────────────────────

  showNotification(message, type = 'info') {
    const el = document.createElement('div');
    el.className   = `fnsku-notification ${type}`;
    el.textContent = message;
    document.body.appendChild(el);

    const delay = type === 'error' ? 7000 : type === 'warning' ? 5000 : 3000;
    setTimeout(() => el.remove(), delay);
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  cleanup() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup',   this._onKeyUp);
    window.removeEventListener('blur',      this._onBlur);
    this.closeConfigurationDialog();
  }
}

window.UIController = UIController;
