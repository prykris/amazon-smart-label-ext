/**
 * UI Controller
 * Handles smart button creation, modifier key detection, and configuration dialog
 */

class UIController {
  constructor(dataExtractor, pdfGenerator, settingsManager = null, templateManager = null) {
    this.dataExtractor = dataExtractor;
    this.pdfGenerator = pdfGenerator;
    this.settingsManager = settingsManager;
    this.templateManager = templateManager;
    this.activeModifiers = new Set();
    this.configDialog = null;
    this.settings = {};

    this.initializeEventListeners();
    this.loadSettings();
  }

  /**
   * Initialize global event listeners for modifier keys
   */
  initializeEventListeners() {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey) this.activeModifiers.add('ctrl');
      if (e.shiftKey) this.activeModifiers.add('shift');
      this.updateButtonStates();
    });

    document.addEventListener('keyup', (e) => {
      if (!e.ctrlKey) this.activeModifiers.delete('ctrl');
      if (!e.shiftKey) this.activeModifiers.delete('shift');
      this.updateButtonStates();
    });

    // Clear modifiers on window blur
    window.addEventListener('blur', () => {
      this.activeModifiers.clear();
      this.updateButtonStates();
    });
  }

  /**
   * Create smart print button for a product row
   * @param {HTMLElement} rowElement - Product row element
   * @returns {HTMLElement} Button container
   */
  createSmartButton(rowElement) {
    const container = document.createElement('div');
    container.className = 'smart-label-container';

    // Create button
    const button = document.createElement('button');
    button.className = 'smart-print-btn';
    button.innerHTML = '🖨️';
    button.title = 'Print FNSKU Label';

    // Create quantity input
    const quantityInput = document.createElement('input');
    quantityInput.type = 'number';
    quantityInput.min = '1';
    quantityInput.max = '1000';
    quantityInput.value = '1';
    quantityInput.className = 'quantity-input';
    quantityInput.title = 'Number of labels';

    // Prevent event bubbling on quantity input
    quantityInput.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    quantityInput.addEventListener('change', (e) => {
      const value = parseInt(e.target.value);
      if (value < 1) e.target.value = '1';
      if (value > 1000) e.target.value = '1000';
    });

    // Button click handler
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleButtonClick(rowElement, quantityInput.value);
    });

    // Assemble container
    container.appendChild(button);
    container.appendChild(quantityInput);

    return container;
  }

  /**
   * Handle smart button click with modifier key detection
   * @param {HTMLElement} rowElement - Product row element
   * @param {string} quantity - Number of labels to generate
   */
  async handleButtonClick(rowElement, quantity) {
    const qty = parseInt(quantity) || 1;

    try {
      // Show loading state
      this.setButtonLoading(rowElement, true);

      if (this.activeModifiers.has('shift')) {
        // Shift + Click: Open configuration dialog
        this.openConfigurationDialog(rowElement);
      } else {
        // Extract product data
        const productData = this.dataExtractor.extractProductData(rowElement);
        const validation = this.dataExtractor.validateData(productData);

        if (!validation.isValid) {
          throw new Error(validation.errors.join(', '));
        }

        // Generate PDF (PDF generator gets all settings from SettingsManager)
        const doc = await this.pdfGenerator.generateLabels(productData, qty);

        if (this.activeModifiers.has('ctrl')) {
          // Ctrl + Click: Open in new tab
          this.pdfGenerator.openPDFInNewTab(doc);
          this.showNotification('Label opened in new tab', 'success');
        } else {
          // Normal click: Download
          const filename = `${productData.sku}_label.pdf`;
          this.pdfGenerator.savePDF(doc, filename);
          this.showNotification(`Downloaded ${qty} label(s) for ${productData.sku}`, 'success');
        }

        // Add to download history
        await this.addToDownloadHistory({
          sku: productData.sku,
          fnsku: productData.fnsku,
          asin: productData.asin,
          title: productData.title,
          quantity: qty
        });
      }
    } catch (error) {
      console.error('Label generation error:', error);
      this.showNotification(`Error: ${error.message}`, 'error');
    } finally {
      this.setButtonLoading(rowElement, false);
    }
  }

  /**
   * Update button states based on active modifiers
   */
  updateButtonStates() {
    const buttons = document.querySelectorAll('.smart-print-btn');

    buttons.forEach(button => {
      // Remove all modifier classes
      button.classList.remove('ctrl-held', 'shift-held');

      // Update tooltip
      let tooltip = 'Print FNSKU Label';

      if (this.activeModifiers.has('shift')) {
        button.classList.add('shift-held');
        tooltip = 'Open Label Settings';
      } else if (this.activeModifiers.has('ctrl')) {
        button.classList.add('ctrl-held');
        tooltip = 'Print to New Tab';
      }

      // Add quantity info to tooltip
      const container = button.closest('.smart-label-container');
      if (container) {
        const quantityInput = container.querySelector('.quantity-input');
        if (quantityInput && !this.activeModifiers.has('shift')) {
          tooltip += ` (Qty: ${quantityInput.value})`;
        }
      }

      button.title = tooltip;
    });
  }

  /**
   * Set button loading state
   * @param {HTMLElement} rowElement - Product row element
   * @param {boolean} loading - Loading state
   */
  setButtonLoading(rowElement, loading) {
    const button = rowElement.querySelector('.smart-print-btn');
    if (button) {
      if (loading) {
        button.disabled = true;
        button.innerHTML = '⏳';
        button.classList.add('loading');
      } else {
        button.disabled = false;
        button.innerHTML = '🖨️';
        button.classList.remove('loading');
      }
    }
  }

  /**
   * Open configuration dialog
   * @param {HTMLElement} rowElement - Product row element (optional, for context)
   */
  openConfigurationDialog(rowElement = null) {
    if (this.configDialog) {
      this.configDialog.remove();
    }

    this.configDialog = this.createConfigurationDialog(rowElement);
    document.body.appendChild(this.configDialog);

    // Focus first input
    const firstInput = this.configDialog.querySelector('input, select');
    if (firstInput) {
      firstInput.focus();
    }
  }

  /**
   * Create configuration dialog
   * @param {HTMLElement} rowElement - Product row element (optional)
   * @returns {HTMLElement} Dialog element
   */
  async createConfigurationDialog(rowElement) {
    const dialog = document.createElement('div');
    dialog.className = 'fnsku-config-dialog';

    // Get available templates
    const templates = await this.getAvailableTemplates();
    const templateOptions = templates.map(template =>
      `<option value="${template.id}">${template.name}</option>`
    ).join('');

    dialog.innerHTML = `
      <div class="dialog-overlay"></div>
      <div class="dialog-content">
        <div class="dialog-header">
          <h3>Label Configuration</h3>
          <button class="close-btn" type="button">×</button>
        </div>
        
        <div class="dialog-body">
          <div class="config-section">
            <h4>Label Template</h4>
            <select id="template-select" class="config-input">
              ${templateOptions}
            </select>
          </div>
          
          <div class="config-section">
            <h4>Barcode Settings</h4>
            <select id="barcode-format" class="config-input">
              <option value="CODE128">CODE128</option>
              <option value="CODE39">CODE39</option>
              <option value="EAN13">EAN13</option>
            </select>
          </div>
          
          <div class="config-section">
            <h4>Content Options</h4>
            <div class="checkbox-group">
              <label>
                <input type="checkbox" id="include-barcode" class="config-checkbox">
                Include barcode
              </label>
              <label>
                <input type="checkbox" id="include-fnsku" class="config-checkbox">
                Include FNSKU
              </label>
              <label>
                <input type="checkbox" id="include-sku" class="config-checkbox">
                Include SKU
              </label>
              <label>
                <input type="checkbox" id="include-title" class="config-checkbox">
                Include title
              </label>
              <label>
                <input type="checkbox" id="include-image" class="config-checkbox">
                Include product image
              </label>
            </div>
          </div>
          
          <div class="config-section">
            <h4>App Settings</h4>
            <div class="checkbox-group">
              <label>
                <input type="checkbox" id="auto-extract" class="config-checkbox">
                Auto-extract on page load
              </label>
              <label>
                <input type="checkbox" id="auto-open-tabs" class="config-checkbox">
                Auto-open tabs
              </label>
              <label>
                <input type="checkbox" id="debug-mode" class="config-checkbox">
                Debug mode
              </label>
            </div>
          </div>
        </div>
        
        <div class="dialog-footer">
          <button class="save-btn" type="button">Save Settings</button>
          <button class="save-print-btn" type="button">Save & Print</button>
        </div>
      </div>
    `;

    // Load current settings
    await this.populateConfigDialog(dialog);

    // Event listeners
    this.setupConfigDialogEvents(dialog, rowElement);

    return dialog;
  }

  /**
   * Populate configuration dialog with current settings
   * @param {HTMLElement} dialog - Dialog element
   */
  async populateConfigDialog(dialog) {
    const currentSettings = await this.getCurrentSettings();
    const selectedTemplate = await this.getSelectedTemplate();

    const templateSelect = dialog.querySelector('#template-select');
    const barcodeFormatSelect = dialog.querySelector('#barcode-format');
    const includeBarcodeCheckbox = dialog.querySelector('#include-barcode');
    const includeFnskuCheckbox = dialog.querySelector('#include-fnsku');
    const includeSkuCheckbox = dialog.querySelector('#include-sku');
    const includeTitleCheckbox = dialog.querySelector('#include-title');
    const includeImageCheckbox = dialog.querySelector('#include-image');

    // Set values from current settings
    if (templateSelect) templateSelect.value = selectedTemplate?.id || 'thermal_57x32';
    if (barcodeFormatSelect) barcodeFormatSelect.value = currentSettings.globalSettings?.barcodeFormat || 'CODE128';

    // Set content inclusion checkboxes
    const contentInclusion = selectedTemplate?.contentInclusion || {};
    if (includeBarcodeCheckbox) includeBarcodeCheckbox.checked = contentInclusion.barcode !== false;
    if (includeFnskuCheckbox) includeFnskuCheckbox.checked = contentInclusion.fnsku !== false;
    if (includeSkuCheckbox) includeSkuCheckbox.checked = contentInclusion.sku !== false;
    if (includeTitleCheckbox) includeTitleCheckbox.checked = contentInclusion.title !== false;
    if (includeImageCheckbox) includeImageCheckbox.checked = contentInclusion.images || false;

    // Set additional checkbox values
    const autoExtractCheckbox = dialog.querySelector('#auto-extract');
    const autoOpenTabsCheckbox = dialog.querySelector('#auto-open-tabs');
    const debugModeCheckbox = dialog.querySelector('#debug-mode');

    if (autoExtractCheckbox) autoExtractCheckbox.checked = currentSettings.globalSettings?.autoExtract !== false;
    if (autoOpenTabsCheckbox) autoOpenTabsCheckbox.checked = currentSettings.globalSettings?.autoOpenTabs || false;
    if (debugModeCheckbox) debugModeCheckbox.checked = currentSettings.globalSettings?.debugMode || false;
  }

  /**
   * Setup configuration dialog event listeners
   * @param {HTMLElement} dialog - Dialog element
   * @param {HTMLElement} rowElement - Product row element (optional)
   */
  setupConfigDialogEvents(dialog, rowElement) {
    // Close button
    const closeBtn = dialog.querySelector('.close-btn');
    closeBtn.addEventListener('click', () => {
      this.closeConfigurationDialog();
    });

    // Overlay click to close
    const overlay = dialog.querySelector('.dialog-overlay');
    overlay.addEventListener('click', () => {
      this.closeConfigurationDialog();
    });

    // Template change
    const templateSelect = dialog.querySelector('#template-select');
    templateSelect.addEventListener('change', (e) => {
      this.toggleCustomSizeSection(dialog, e.target.value === 'custom');
    });

    // Save settings
    const saveBtn = dialog.querySelector('.save-btn');
    saveBtn.addEventListener('click', () => {
      this.saveConfigurationSettings(dialog);
      this.closeConfigurationDialog();
    });

    // Save and print
    const savePrintBtn = dialog.querySelector('.save-print-btn');
    savePrintBtn.addEventListener('click', async () => {
      this.saveConfigurationSettings(dialog);
      this.closeConfigurationDialog();

      if (rowElement) {
        // Get quantity from the row's input
        const quantityInput = rowElement.querySelector('.quantity-input');
        const quantity = quantityInput ? quantityInput.value : '1';

        // Trigger print with new settings
        setTimeout(() => {
          this.handleButtonClick(rowElement, quantity);
        }, 100);
      }
    });

    // ESC key to close
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeConfigurationDialog();
      }
    });
  }

  /**
   * Toggle custom size section visibility
   * @param {HTMLElement} dialog - Dialog element
   * @param {boolean} show - Whether to show the section
   */
  toggleCustomSizeSection(dialog, show) {
    const customSection = dialog.querySelector('.custom-size-section');
    if (customSection) {
      customSection.style.display = show ? 'block' : 'none';
    }
  }

  /**
   * Save configuration settings
   * @param {HTMLElement} dialog - Dialog element
   */
  async saveConfigurationSettings(dialog) {
    try {
      const templateId = dialog.querySelector('#template-select').value;
      const barcodeFormat = dialog.querySelector('#barcode-format').value;

      const contentInclusion = {
        barcode: dialog.querySelector('#include-barcode').checked,
        fnsku: dialog.querySelector('#include-fnsku').checked,
        sku: dialog.querySelector('#include-sku').checked,
        title: dialog.querySelector('#include-title').checked,
        images: dialog.querySelector('#include-image').checked
      };

      const globalSettings = {
        barcodeFormat: barcodeFormat,
        autoExtract: dialog.querySelector('#auto-extract').checked,
        autoOpenTabs: dialog.querySelector('#auto-open-tabs').checked,
        debugMode: dialog.querySelector('#debug-mode').checked
      };

      // Update settings through SettingsManager
      if (this.settingsManager) {
        await this.settingsManager.setSelectedTemplateId(templateId);
        await this.settingsManager.updateGlobalSettings(globalSettings);
      }

      // Update template content inclusion if it's a user template
      if (this.templateManager && templateId.startsWith('user_')) {
        const template = await this.templateManager.getTemplate(templateId);
        if (template && template.userCreated) {
          await this.templateManager.updateTemplate(templateId, {
            ...template,
            contentInclusion: contentInclusion
          });
        }
      }

      this.showNotification('Settings saved successfully', 'success');
    } catch (error) {
      console.error('Failed to save configuration settings:', error);
      this.showNotification('Failed to save settings', 'error');
    }
  }

  /**
   * Close configuration dialog
   */
  closeConfigurationDialog() {
    if (this.configDialog) {
      this.configDialog.remove();
      this.configDialog = null;
    }
  }

  /**
   * Show notification to user
   * @param {string} message - Notification message
   * @param {string} type - Notification type (success, error, warning, info)
   */
  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `fnsku-notification ${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    // Auto-remove after delay
    const delay = type === 'error' ? 7000 : type === 'warning' ? 5000 : 3000;
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, delay);
  }

  /**
   * Load settings from Chrome storage
   */
  async loadSettings() {
    try {
      if (this.settingsManager) {
        this.settings = await this.settingsManager.getSettings();
      } else {
        // Fallback to background script
        const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
        if (response.success) {
          this.settings = response.data || {};
        } else {
          this.settings = {};
        }
      }
    } catch (error) {
      console.warn('Failed to load settings:', error);
      this.settings = {};
    }
  }

  /**
   * Get current settings
   * @returns {Object} Current settings
   */
  async getCurrentSettings() {
    if (this.settingsManager) {
      return await this.settingsManager.getSettings();
    }
    return this.settings;
  }

  /**
   * Get selected template
   * @returns {Object|null} Selected template
   */
  async getSelectedTemplate() {
    if (this.settingsManager && this.templateManager) {
      const templateId = await this.settingsManager.getSelectedTemplateId();
      return await this.templateManager.getTemplate(templateId);
    }
    return null;
  }

  /**
   * Get available templates
   * @returns {Array} Available templates
   */
  async getAvailableTemplates() {
    if (this.templateManager) {
      return await this.templateManager.getAllTemplates();
    }
    return [];
  }

  /**
   * Handle settings update from background script
   * @param {Object} settings - Updated settings
   */
  async handleSettingsUpdate(settings) {
    try {
      await this.loadSettings();
      console.log('UIController: Settings updated from background');
    } catch (error) {
      console.error('Failed to handle settings update:', error);
    }
  }

  /**
   * Add item to download history via background script
   * @param {Object} item - Download history item
   */
  async addToDownloadHistory(item) {
    try {
      await chrome.runtime.sendMessage({
        action: 'addToDownloadHistory',
        data: item
      });
    } catch (error) {
      console.warn('Failed to add to download history:', error);
    }
  }
}

// Export for use in other modules
window.UIController = UIController;