/**
 * Popup Controller
 * Stateless UI — all state fetched from background on open, all writes go to background.
 * No SettingsManager or TemplateManager instances. Preview renders from form values directly.
 */

class PopupController {
  constructor() {
    // Local copies of authoritative state — populated from background, never written locally
    this.currentSettings  = {};
    this.currentTemplates = [];
    this.downloadHistory  = [];
    this.currentTab       = 'downloads';

    // Selected element id in the inspector
    this.inspectorElementId = null;

    // Debounce handles
    this._saveTimeout    = null;
    this._previewTimeout = null;

    this.pdfGenerator = new PDFLabelGenerator();

    this.init();
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  async init() {
    try {
      await this._loadStateFromBackground();
      this._setupTabSwitching();
      this._setupEventListeners();
      this._restoreLastTab();
      await this._loadDownloadHistory();
      this._schedulePreview();

      // Listen for background pushes (settings changed from content tab)
      chrome.runtime.onMessage.addListener((request) => {
        if (request.action === 'stateUpdated') {
          this.currentSettings  = request.settings;
          this.currentTemplates = request.templates;
          this._populateSettingsPanel();
          this._schedulePreview();
        }
      });
    } catch (error) {
      console.error('Popup init failed:', error);
      this._showError('Failed to initialize extension popup');
    }
  }

  // ─── Background Communication ──────────────────────────────────────────────

  async _loadStateFromBackground() {
    const [settingsResp, templatesResp] = await Promise.all([
      chrome.runtime.sendMessage({ action: 'getSettings' }),
      chrome.runtime.sendMessage({ action: 'getAllTemplates' })
    ]);

    if (settingsResp.success)  this.currentSettings  = settingsResp.data;
    if (templatesResp.success) this.currentTemplates = templatesResp.data;
  }

  async _saveToBackground(settings) {
    try {
      await chrome.runtime.sendMessage({ action: 'saveSettings', settings });
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  // ─── Tab Switching ─────────────────────────────────────────────────────────

  _setupTabSwitching() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`${tab}-tab`)?.classList.add('active');
        this.currentTab = tab;
        this._saveTabPreference(tab);

        if (tab === 'settings') {
          this._populateSettingsPanel();
          this._schedulePreview();
        } else if (tab === 'manual') {
          this._populateManualTemplateSelector();
        }
      });
    });
  }

  _restoreLastTab() {
    const last = this.currentSettings.globalSettings?.lastSelectedTab || 'downloads';
    this.currentTab = last;
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === last);
    });
    document.querySelectorAll('.tab-content').forEach(c => {
      c.classList.toggle('active', c.id === `${last}-tab`);
    });
    if (last === 'settings') {
      this._populateSettingsPanel();
      this._schedulePreview();
    } else if (last === 'manual') {
      this._populateManualTemplateSelector();
    }
  }

  _saveTabPreference(tab) {
    const settings = this._readFormSettings();
    settings.globalSettings = { ...settings.globalSettings, lastSelectedTab: tab };
    this._debouncedSave(settings);
  }

  // ─── Event Listeners ───────────────────────────────────────────────────────

  _setupEventListeners() {
    // Toggle extension
    document.getElementById('toggle-extension')?.addEventListener('click', async () => {
      const resp = await chrome.runtime.sendMessage({ action: 'toggleExtension' });
      if (resp.success) this._updateToggleButton(resp.enabled);
    });

    // Downloads tab
    document.getElementById('clear-history')?.addEventListener('click', () => this._clearHistory());

    // Manual entry tab
    document.getElementById('generate-manual')?.addEventListener('click', (e) => {
      e.preventDefault();
      this._generateManualLabel();
    });
    document.getElementById('load-sample')?.addEventListener('click', () => this._loadSampleData());
    document.getElementById('clear-form')?.addEventListener('click',  () => this._clearManualForm());

    // Settings tab — template selector
    document.getElementById('template-dropdown-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleTemplateDropdown();
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.hybrid-selector')) {
        document.getElementById('template-dropdown').style.display = 'none';
      }
    });
    document.getElementById('create-template-btn')?.addEventListener('click', () => {
      this._createNewTemplate();
    });

    // Settings tab — global settings form (any change triggers debounced save + preview)
    const settingsForm = document.getElementById('settings-form');
    if (settingsForm) {
      settingsForm.addEventListener('change', () => this._onSettingsFormChange());
      settingsForm.addEventListener('input',  () => this._onSettingsFormChange());
    }

    // Inspector element selector
    document.getElementById('element-select')?.addEventListener('change', (e) => {
      this.inspectorElementId = e.target.value;
      this._renderInspector();
    });

    // Add/remove element buttons
    document.getElementById('add-element-btn')?.addEventListener('click', () => this._addElement());

    // Reset button
    document.getElementById('reset-settings')?.addEventListener('click', () => this._resetSettings());
  }

  // ─── Settings Panel ────────────────────────────────────────────────────────

  _populateSettingsPanel() {
    const globalSettings = this.currentSettings.globalSettings || {};
    const selectedId     = this.currentSettings.selectedTemplateId || 'thermal_57x32';

    // Update template name display
    const selected = this._getTemplateById(selectedId);
    const nameInput = document.getElementById('template-name-input');
    if (nameInput) nameInput.value = selected?.name || '';

    // Global settings
    this._setVal('default-barcode',       globalSettings.barcodeFormat  || 'CODE128');
    this._setVal('pdf-dpi',               globalSettings.pdfDPI         || 300);
    this._setChecked('auto-extract',      globalSettings.autoExtract    !== false);
    this._setChecked('auto-open-tabs',    globalSettings.autoOpenTabs   || false);
    this._setChecked('debug-mode',        globalSettings.debugMode      || false);

    // Template dimensions (display only)
    if (selected) {
      this._setVal('template-width',  selected.width  || '');
      this._setVal('template-height', selected.height || '');
      this._setVal('template-units',  selected.units  || 'mm');
      const isBuiltIn = !selected.userCreated;
      ['template-width', 'template-height'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.readOnly = isBuiltIn;
      });
      const unitsEl = document.getElementById('template-units');
      if (unitsEl) unitsEl.disabled = isBuiltIn;
    }

    // Element selector + inspector
    this._populateElementSelector(selected);
    this._renderInspector();
  }

  _populateElementSelector(template) {
    const select = document.getElementById('element-select');
    if (!select) return;

    const elements = template?.elements || [];
    select.innerHTML = elements.length === 0
      ? '<option value="">No elements</option>'
      : elements.map(el => {
          const typeDef = ElementRegistry[el.type];
          const label   = typeDef ? typeDef.label : el.type;
          const field   = el.dataField ? ` (${el.dataField})` : (el.value ? ` "${el.value}"` : '');
          return `<option value="${el.id}">${label}${field}</option>`;
        }).join('');

    // Keep current selection if still valid, otherwise pick first
    const stillValid = elements.some(e => e.id === this.inspectorElementId);
    if (!stillValid) {
      this.inspectorElementId = elements[0]?.id || null;
    }
    select.value = this.inspectorElementId || '';
  }

  // ─── Inspector ─────────────────────────────────────────────────────────────

  _renderInspector() {
    const panel = document.getElementById('inspector-panel');
    if (!panel) return;

    const selectedId = this.currentSettings.selectedTemplateId || 'thermal_57x32';
    const template   = this._getTemplateById(selectedId);
    const element    = template?.elements?.find(e => e.id === this.inspectorElementId);

    if (!element) {
      panel.innerHTML = '<p class="inspector-empty">Select an element to edit</p>';
      return;
    }

    const typeDef = ElementRegistry[element.type];
    if (!typeDef) {
      panel.innerHTML = `<p class="inspector-empty">Unknown element type: ${element.type}</p>`;
      return;
    }

    const rows = typeDef.controls.map(ctrl => {
      const val = element[ctrl.prop] ?? ctrl.default ?? '';
      return `
        <div class="inspector-row">
          <label class="inspector-label">${ctrl.label}</label>
          ${this._renderControl(ctrl, val, element.id)}
        </div>`;
    }).join('');

    const isEnabled = element.enabled !== false;

    panel.innerHTML = `
      <div class="inspector-header">
        <span class="inspector-type">${typeDef.label}</span>
        <div class="inspector-actions">
          <button class="inspector-eye${isEnabled ? '' : ' eye-off'}"
            data-prop="enabled" data-element-id="${element.id}"
            title="${isEnabled ? 'Hide element' : 'Show element'}">${isEnabled ? '👁' : '👁\u200D🗨'}</button>
          <button class="inspector-delete" data-element-id="${element.id}" title="Delete">✕</button>
        </div>
      </div>
      <div class="inspector-controls">${rows}</div>
    `;

    // Wire up controls
    panel.querySelectorAll('.inspector-control').forEach(input => {
      const handler = () => this._onInspectorChange(input);
      input.addEventListener('change', handler);
      input.addEventListener('input',  handler);
    });

    panel.querySelector('.inspector-eye')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const elementId = btn.dataset.elementId;
      const selectedId = this.currentSettings.selectedTemplateId || 'thermal_57x32';
      const template   = this._getTemplateById(selectedId);
      const el         = template?.elements?.find(e => e.id === elementId);
      if (!el) return;
      el.enabled = el.enabled === false; // toggle
      if (template.userCreated) this._debouncedSave(null, template);
      this._schedulePreview();
      this._renderInspector(); // re-render to flip icon
    });

    panel.querySelector('.inspector-delete')?.addEventListener('click', (e) => {
      this._deleteElement(e.target.dataset.elementId);
    });
  }

  _renderControl(ctrl, value, elementId) {
    const attrs = `data-prop="${ctrl.prop}" data-element-id="${elementId}" class="inspector-control setting-input"`;

    switch (ctrl.type) {
      case 'select': {
        const options = ctrl.options.map(o =>
          `<option value="${o}" ${o === value ? 'selected' : ''}>${o}</option>`
        ).join('');
        return `<select ${attrs}>${options}</select>`;
      }
      case 'checkbox':
        return `<input type="checkbox" ${attrs} ${value ? 'checked' : ''}>`;
      case 'number': {
        const min  = ctrl.min  !== undefined ? `min="${ctrl.min}"`  : '';
        const max  = ctrl.max  !== undefined ? `max="${ctrl.max}"`  : '';
        const step = ctrl.step !== undefined ? `step="${ctrl.step}"` : '';
        return `<input type="number" ${attrs} value="${value}" ${min} ${max} ${step}>`;
      }
      case 'text':
      default:
        return `<input type="text" ${attrs} value="${value}">`;
    }
  }

  _onInspectorChange(input) {
    const elementId = input.dataset.elementId;
    const prop      = input.dataset.prop;
    const value     = input.type === 'checkbox'
      ? input.checked
      : (input.type === 'number' ? parseFloat(input.value) : input.value);

    // Mutate the in-memory template element
    const selectedId = this.currentSettings.selectedTemplateId || 'thermal_57x32';
    const template   = this._getTemplateById(selectedId);
    if (!template) return;

    const element = template.elements.find(e => e.id === elementId);
    if (!element) return;

    element[prop] = value;

    // Persist and re-render preview
    if (template.userCreated) {
      this._debouncedSave(null, template);
    }
    this._schedulePreview();
  }

  _deleteElement(elementId) {
    const selectedId = this.currentSettings.selectedTemplateId;
    const template   = this._getTemplateById(selectedId);
    if (!template || !template.userCreated) return;

    template.elements = template.elements.filter(e => e.id !== elementId);
    if (this.inspectorElementId === elementId) {
      this.inspectorElementId = template.elements[0]?.id || null;
    }

    this._populateElementSelector(template);
    this._renderInspector();
    this._debouncedSave(null, template);
    this._schedulePreview();
  }

  _addElement() {
    const selectedId = this.currentSettings.selectedTemplateId;
    const template   = this._getTemplateById(selectedId);
    if (!template || !template.userCreated) {
      this._showError('Only custom templates can be edited. Duplicate this template first.');
      return;
    }

    // Show type picker (simple prompt for now)
    const type = window.prompt(
      `Element type:\n${ElementRegistry.types.join(', ')}`
    )?.trim();

    if (!type || !ElementRegistry[type]) return;

    const newElement = ElementRegistry.createElement(type);
    template.elements.push(newElement);
    this.inspectorElementId = newElement.id;

    this._populateElementSelector(template);
    this._renderInspector();
    this._debouncedSave(null, template);
    this._schedulePreview();
  }

  // ─── Template Dropdown ─────────────────────────────────────────────────────

  async _toggleTemplateDropdown() {
    const dropdown = document.getElementById('template-dropdown');
    if (!dropdown) return;

    if (dropdown.style.display !== 'block') {
      const selectedId = this.currentSettings.selectedTemplateId;
      dropdown.innerHTML = this.currentTemplates.map(t => `
        <div class="template-dropdown-item ${t.id === selectedId ? 'selected' : ''}"
             data-id="${t.id}">
          ${t.name}${t.userCreated ? ' <span class="custom-badge">Custom</span>' : ''}
        </div>
      `).join('');

      dropdown.querySelectorAll('.template-dropdown-item').forEach(item => {
        item.addEventListener('click', () => this._selectTemplate(item.dataset.id));
      });

      dropdown.style.display = 'block';
    } else {
      dropdown.style.display = 'none';
    }
  }

  async _selectTemplate(templateId) {
    document.getElementById('template-dropdown').style.display = 'none';

    // Update local state
    this.currentSettings = { ...this.currentSettings, selectedTemplateId: templateId };
    this.inspectorElementId = null;

    // Persist to background
    await this._saveToBackground(this.currentSettings);

    // Refresh UI
    this._populateSettingsPanel();
    this._schedulePreview();
  }

  async _createNewTemplate() {
    const name = window.prompt('Template name:')?.trim();
    if (!name) return;

    const resp = await chrome.runtime.sendMessage({
      action: 'createTemplate',
      templateData: {
        name,
        baseName: name,
        width: 57, height: 32, units: 'mm',
        orientation: 'landscape',
        elements: [
          { id: ElementRegistry.generateId(), type: 'barcode',
            dataField: 'fnsku', enabled: true,
            x: 4, y: 2, width: 49, height: 12, format: 'CODE128' },
          { id: ElementRegistry.generateId(), type: 'data_text',
            dataField: 'fnsku', enabled: true,
            x: 28.5, y: 17, fontSize: 8, align: 'center', bold: false }
        ]
      }
    });

    if (resp.success) {
      const templatesResp = await chrome.runtime.sendMessage({ action: 'getAllTemplates' });
      if (templatesResp.success) this.currentTemplates = templatesResp.data;
      await this._selectTemplate(resp.data.id);
    } else {
      this._showError('Failed to create template: ' + resp.error);
    }
  }

  // ─── Settings Form Changes ─────────────────────────────────────────────────

  _onSettingsFormChange() {
    const settings = this._readFormSettings();
    this._debouncedSave(settings);
    this._schedulePreview();
  }

  _readFormSettings() {
    return {
      selectedTemplateId: this.currentSettings.selectedTemplateId || 'thermal_57x32',
      globalSettings: {
        ...(this.currentSettings.globalSettings || {}),
        barcodeFormat:  this._getVal('default-barcode') || 'CODE128',
        pdfDPI:         parseInt(this._getVal('pdf-dpi')) || 300,
        autoExtract:    document.getElementById('auto-extract')?.checked   !== false,
        autoOpenTabs:   document.getElementById('auto-open-tabs')?.checked || false,
        debugMode:      document.getElementById('debug-mode')?.checked     || false,
        lastSelectedTab: this.currentTab
      }
    };
  }

  _debouncedSave(settings = null, updatedTemplate = null) {
    clearTimeout(this._saveTimeout);
    this._saveTimeout = setTimeout(async () => {
      try {
        if (settings) {
          this.currentSettings = { ...this.currentSettings, ...settings };
          await this._saveToBackground(this.currentSettings);
        }
        if (updatedTemplate) {
          await chrome.runtime.sendMessage({
            action: 'updateTemplate',
            templateId: updatedTemplate.id,
            templateData: updatedTemplate
          });
        }
        this._showSavingIndicator(false);
      } catch (error) {
        console.error('Save failed:', error);
      }
    }, 500);
    this._showSavingIndicator(true);
  }

  async _resetSettings() {
    if (!confirm('Reset all settings to defaults?')) return;
    const resp = await chrome.runtime.sendMessage({
      action: 'saveSettings',
      settings: {
        selectedTemplateId: 'thermal_57x32',
        globalSettings: {
          barcodeFormat: 'CODE128', autoExtract: true,
          autoOpenTabs: false, debugMode: false, pdfDPI: 300
        }
      }
    });
    if (resp.success) {
      await this._loadStateFromBackground();
      this._populateSettingsPanel();
      this._schedulePreview();
    }
  }

  // ─── PDF Preview ───────────────────────────────────────────────────────────

  _schedulePreview() {
    clearTimeout(this._previewTimeout);
    this._previewTimeout = setTimeout(() => this._renderPreview(), 150);
  }

  async _renderPreview() {
    const previewEl = document.getElementById('label-preview');
    if (!previewEl || this.currentTab !== 'settings') return;

    const settings  = this._readFormSettings();
    const template  = this._getTemplateById(settings.selectedTemplateId);
    if (!template) return;

    try {
      previewEl.innerHTML = '<div class="preview-loading">Rendering…</div>';

      const sampleData = this._getSampleData();
      const doc  = await this.pdfGenerator.generateLabels(sampleData, 1, settings, template);
      const blob = doc.output('blob');
      const url  = URL.createObjectURL(blob);

      previewEl.innerHTML = `<iframe class="preview-frame" src="${url}" title="Label preview"></iframe>`;
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (error) {
      previewEl.innerHTML = `<div class="preview-error">Preview error: ${error.message}</div>`;
    }
  }

  _getSampleData() {
    return {
      sku:       'SAMPLE-SKU',
      fnsku:     'X002HB9ZDL',
      asin:      'B0FXH65FKG',
      title:     'Sample Product Title',
      condition: 'NEW',
      imageUrl:  null
    };
  }

  // ─── Manual Label ──────────────────────────────────────────────────────────

  async _generateManualLabel() {
    const data = this._collectManualFormData();
    if (!this._validateManualForm(data)) return;

    try {
      const templateId = document.getElementById('manual-template-select')?.value
        || this.currentSettings.selectedTemplateId
        || 'thermal_57x32';

      const template = this._getTemplateById(templateId);
      if (!template) throw new Error('Template not found');

      const settings = this._readFormSettings();
      const doc      = await this.pdfGenerator.generateLabels(data, data.quantity, settings, template);
      const blob     = doc.output('blob');
      const url      = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href     = url;
      a.download = `${data.sku}_label.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      await chrome.runtime.sendMessage({
        action: 'addToDownloadHistory',
        data: { ...data, timestamp: new Date().toISOString() }
      });

      this._showSuccess(`Generated ${data.quantity} label(s) for ${data.sku}`);
    } catch (error) {
      this._showError('Failed to generate label: ' + error.message);
    }
  }

  _collectManualFormData() {
    return {
      sku:       document.getElementById('manual-sku')?.value.trim()       || '',
      fnsku:     document.getElementById('manual-fnsku')?.value.trim().toUpperCase() || '',
      asin:      document.getElementById('manual-asin')?.value.trim().toUpperCase() || '',
      title:     document.getElementById('manual-title')?.value.trim()     || '',
      condition: document.getElementById('manual-condition')?.value.trim() || 'NEW',
      quantity:  parseInt(document.getElementById('manual-quantity')?.value) || 1
    };
  }

  _validateManualForm(data) {
    let valid = true;
    document.querySelectorAll('.form-group').forEach(g => g.classList.remove('error', 'success'));

    if (!data.sku)  { this._fieldError('manual-sku', 'SKU is required'); valid = false; }
    else this._fieldSuccess('manual-sku');

    if (!data.fnsku) { this._fieldError('manual-fnsku', 'FNSKU is required'); valid = false; }
    else if (!/^[A-Z0-9]{10}$/.test(data.fnsku)) {
      this._fieldError('manual-fnsku', 'Must be 10 alphanumeric characters'); valid = false;
    } else this._fieldSuccess('manual-fnsku');

    if (data.asin && !/^B[0-9A-Z]{9}$/.test(data.asin)) {
      this._fieldError('manual-asin', 'Invalid ASIN format'); valid = false;
    }

    if (data.quantity < 1 || data.quantity > 1000) {
      this._fieldError('manual-quantity', 'Must be 1–1000'); valid = false;
    } else this._fieldSuccess('manual-quantity');

    return valid;
  }

  _populateManualTemplateSelector() {
    const select = document.getElementById('manual-template-select');
    if (!select) return;
    select.innerHTML = '<option value="">Use Active Template</option>' +
      this.currentTemplates.map(t =>
        `<option value="${t.id}">${t.name}${t.userCreated ? ' (Custom)' : ''}</option>`
      ).join('');
  }

  _loadSampleData() {
    this._setVal('manual-sku',       '2xArmyFBA');
    this._setVal('manual-fnsku',     'X002HB9ZDL');
    this._setVal('manual-asin',      'B0FXH65FKG');
    this._setVal('manual-title',     'Sample Product — Eclipse Solar Glasses');
    this._setVal('manual-condition', 'NEW');
    this._setVal('manual-quantity',  '2');
    document.querySelectorAll('.form-group').forEach(g => g.classList.remove('error', 'success'));
    this._showSuccess('Sample data loaded');
  }

  _clearManualForm() {
    document.getElementById('manual-entry-form')?.reset();
    this._setVal('manual-quantity', '1');
    document.querySelectorAll('.form-group').forEach(g => g.classList.remove('error', 'success'));
  }

  // ─── Download History ──────────────────────────────────────────────────────

  async _loadDownloadHistory() {
    const resp = await chrome.runtime.sendMessage({ action: 'getDownloadHistory' });
    this.downloadHistory = resp.success ? resp.data : [];
    this._renderDownloadsList();
  }

  _renderDownloadsList() {
    const list  = document.getElementById('downloads-list');
    const count = document.getElementById('downloads-count');
    if (!list) return;

    if (count) count.textContent = `${this.downloadHistory.length} label${this.downloadHistory.length !== 1 ? 's' : ''}`;

    if (this.downloadHistory.length === 0) {
      list.innerHTML = `
        <div class="no-downloads">
          <p>No labels generated yet</p>
          <p class="hint">Use Manual Entry or visit Amazon Seller Central</p>
        </div>`;
      return;
    }

    list.innerHTML = this.downloadHistory.map((item, i) => `
      <div class="download-item">
        <div class="download-info">
          <span class="download-sku">${item.sku}</span>
          <span class="download-fnsku">${item.fnsku}</span>
          <span class="download-qty">×${item.quantity}</span>
          <span class="download-date">${this._formatDate(item.timestamp)}</span>
        </div>
        <button class="remove-item-btn" data-index="${i}" title="Remove">✕</button>
      </div>
    `).join('');

    list.querySelectorAll('.remove-item-btn').forEach(btn => {
      btn.addEventListener('click', () => this._removeHistoryItem(parseInt(btn.dataset.index)));
    });
  }

  async _removeHistoryItem(index) {
    await chrome.runtime.sendMessage({ action: 'removeFromDownloadHistory', index });
    this.downloadHistory.splice(index, 1);
    this._renderDownloadsList();
  }

  async _clearHistory() {
    if (!confirm('Clear all download history?')) return;
    await chrome.runtime.sendMessage({ action: 'clearDownloadHistory' });
    this.downloadHistory = [];
    this._renderDownloadsList();
  }

  _formatDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  }

  // ─── Toggle Button ─────────────────────────────────────────────────────────

  _updateToggleButton(enabled) {
    const btn = document.getElementById('toggle-extension');
    if (btn) btn.querySelector('.toggle-icon').textContent = enabled ? '⏸️' : '▶️';
  }

  // ─── Saving Indicator ──────────────────────────────────────────────────────

  _showSavingIndicator(saving) {
    const el = document.getElementById('auto-save-indicator');
    if (el) el.style.display = saving ? 'flex' : 'none';
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  _getTemplateById(id) {
    return this.currentTemplates.find(t => t.id === id) || null;
  }

  _getVal(id) {
    return document.getElementById(id)?.value || '';
  }

  _setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }

  _setChecked(id, val) {
    const el = document.getElementById(id);
    if (el) el.checked = !!val;
  }

  _fieldError(id, msg) {
    const field = document.getElementById(id);
    const group = field?.closest('.form-group');
    group?.classList.add('error');
    const hint = group?.querySelector('.form-hint');
    if (hint) hint.textContent = msg;
  }

  _fieldSuccess(id) {
    document.getElementById(id)?.closest('.form-group')?.classList.add('success');
  }

  _showSuccess(msg) { this._showNotification(msg, 'success'); }
  _showError(msg)   { this._showNotification(msg, 'error');   }

  _showNotification(message, type = 'info') {
    const el = document.createElement('div');
    el.className   = `popup-notification ${type}`;
    el.textContent = message;
    document.body.appendChild(el);
    const delay = type === 'error' ? 6000 : 3000;
    setTimeout(() => el.remove(), delay);
  }
}

document.addEventListener('DOMContentLoaded', () => new PopupController());
