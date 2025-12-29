/**
 * UI Controller
 * Handles smart button creation, modifier key detection, and configuration dialog
 */

class UIController {
  constructor(dataExtractor, pdfGenerator) {
    this.dataExtractor = dataExtractor;
    this.pdfGenerator = pdfGenerator;
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
        
        // Generate PDF
        const doc = await this.pdfGenerator.generateLabels(productData, qty, this.settings);
        
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
  createConfigurationDialog(rowElement) {
    const dialog = document.createElement('div');
    dialog.className = 'fnsku-config-dialog';
    
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
              <option value="thermal_57x32">Thermal 57x32mm</option>
              <option value="thermal_57x32_minimal">Thermal 57x32mm (Minimal)</option>
              <option value="shipping_4x6">Shipping 4"x6"</option>
              <option value="custom">Custom Size</option>
            </select>
          </div>
          
          <div class="config-section custom-size-section" style="display: none;">
            <h4>Custom Dimensions</h4>
            <div class="input-group">
              <label>Width (mm):</label>
              <input type="number" id="custom-width" class="config-input" min="10" max="300" value="57">
            </div>
            <div class="input-group">
              <label>Height (mm):</label>
              <input type="number" id="custom-height" class="config-input" min="10" max="300" value="32">
            </div>
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
                <input type="checkbox" id="include-image" class="config-checkbox">
                Include product image
              </label>
            </div>
          </div>
          
          <div class="config-section">
            <h4>Font Sizes</h4>
            <div class="input-group">
              <label>FNSKU:</label>
              <input type="number" id="fnsku-font-size" class="config-input" min="4" max="20" value="8">
            </div>
            <div class="input-group">
              <label>SKU:</label>
              <input type="number" id="sku-font-size" class="config-input" min="4" max="20" value="11">
            </div>
            <div class="input-group">
              <label>Title:</label>
              <input type="number" id="title-font-size" class="config-input" min="4" max="20" value="6">
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
    this.populateConfigDialog(dialog);
    
    // Event listeners
    this.setupConfigDialogEvents(dialog, rowElement);
    
    return dialog;
  }

  /**
   * Populate configuration dialog with current settings
   * @param {HTMLElement} dialog - Dialog element
   */
  populateConfigDialog(dialog) {
    const templateSelect = dialog.querySelector('#template-select');
    const customWidthInput = dialog.querySelector('#custom-width');
    const customHeightInput = dialog.querySelector('#custom-height');
    const barcodeFormatSelect = dialog.querySelector('#barcode-format');
    const includeImageCheckbox = dialog.querySelector('#include-image');
    const fnskuFontSize = dialog.querySelector('#fnsku-font-size');
    const skuFontSize = dialog.querySelector('#sku-font-size');
    const titleFontSize = dialog.querySelector('#title-font-size');

    // Set values from current settings
    if (templateSelect) templateSelect.value = this.settings.template || 'thermal_57x32';
    if (customWidthInput) customWidthInput.value = this.settings.customWidth || 57;
    if (customHeightInput) customHeightInput.value = this.settings.customHeight || 32;
    if (barcodeFormatSelect) barcodeFormatSelect.value = this.settings.barcodeFormat || 'CODE128';
    if (includeImageCheckbox) includeImageCheckbox.checked = this.settings.includeImage || false;
    if (fnskuFontSize) fnskuFontSize.value = this.settings.fontSize?.fnsku || 8;
    if (skuFontSize) skuFontSize.value = this.settings.fontSize?.sku || 11;
    if (titleFontSize) titleFontSize.value = this.settings.fontSize?.title || 6;

    // Show/hide custom size section
    this.toggleCustomSizeSection(dialog, templateSelect.value === 'custom');
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
  saveConfigurationSettings(dialog) {
    const settings = {
      template: dialog.querySelector('#template-select').value,
      customWidth: parseInt(dialog.querySelector('#custom-width').value),
      customHeight: parseInt(dialog.querySelector('#custom-height').value),
      barcodeFormat: dialog.querySelector('#barcode-format').value,
      includeImage: dialog.querySelector('#include-image').checked,
      fontSize: {
        fnsku: parseInt(dialog.querySelector('#fnsku-font-size').value),
        sku: parseInt(dialog.querySelector('#sku-font-size').value),
        title: parseInt(dialog.querySelector('#title-font-size').value)
      }
    };

    // Update custom template if needed
    if (settings.template === 'custom') {
      const customTemplate = {
        width: settings.customWidth,
        height: settings.customHeight,
        orientation: settings.customWidth > settings.customHeight ? 'landscape' : 'portrait'
      };
      this.pdfGenerator.updateCustomTemplate(customTemplate);
    }

    this.settings = settings;
    this.saveSettings();
    this.showNotification('Settings saved successfully', 'success');
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
      const result = await chrome.storage.sync.get(['fnskuLabelSettings']);
      this.settings = result.fnskuLabelSettings || {};
    } catch (error) {
      console.warn('Failed to load settings:', error);
      this.settings = {};
    }
  }

  /**
   * Save settings to Chrome storage
   */
  async saveSettings() {
    try {
      await chrome.storage.sync.set({ fnskuLabelSettings: this.settings });
    } catch (error) {
      console.warn('Failed to save settings:', error);
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