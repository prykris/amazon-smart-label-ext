/**
 * Popup Interface Controller
 * Handles popup UI interactions and communication with background script
 */

class PopupController {
  constructor() {
    this.currentSettings = {};
    this.extensionStatus = {};
    this.downloadHistory = [];
    this.init();
  }

  /**
   * Initialize popup interface
   */
  async init() {
    try {
      // Load initial data
      await this.loadExtensionStatus();
      await this.loadCurrentSettings();
      await this.loadDownloadHistory();

      // Setup event listeners
      this.setupEventListeners();

      // Initialize tabs
      this.initializeTabs();

      // Update UI
      this.updateUI();

      // Setup settings tooltip
      this.setupSettingsTooltip();

    } catch (error) {
      console.error('Failed to initialize popup:', error);
      this.showError('Failed to load extension data');
    }
  }

  /**
   * Initialize tab functionality
   */
  initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const targetTab = button.getAttribute('data-tab');

        // Remove active class from all tabs and contents
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));

        // Add active class to clicked tab and corresponding content
        button.classList.add('active');
        document.getElementById(`${targetTab}-tab`).classList.add('active');
      });
    });
  }

  /**
   * Setup event listeners for popup elements
   */
  setupEventListeners() {
    // Toggle extension
    document.getElementById('toggle-extension').addEventListener('click', () => {
      this.toggleExtension();
    });

    // Clear download history
    document.getElementById('clear-history').addEventListener('click', () => {
      this.clearDownloadHistory();
    });

    // Manual entry form
    document.getElementById('manual-entry-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.generateManualLabel();
    });

    document.getElementById('clear-form').addEventListener('click', () => {
      this.clearManualForm();
    });

    document.getElementById('load-sample').addEventListener('click', () => {
      this.loadSampleData();
    });

    // Settings actions
    document.getElementById('save-settings').addEventListener('click', () => {
      this.saveSettings();
    });

    document.getElementById('reset-settings').addEventListener('click', () => {
      this.resetSettings();
    });
  }

  /**
   * Load extension status from background script
   */
  async loadExtensionStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getExtensionStatus' });
      if (response.success) {
        this.extensionStatus = response.data;
      }
    } catch (error) {
      console.error('Failed to load extension status:', error);
    }
  }

  /**
   * Load current settings from background script
   */
  async loadCurrentSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
      if (response.success) {
        this.currentSettings = response.data;
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  /**
   * Update UI elements with current data
   */
  updateUI() {
    // Update extension status
    const toggleButton = document.getElementById('toggle-extension');

    if (toggleButton) {
      const icon = toggleButton.querySelector('.toggle-icon');
      if (icon) {
        icon.textContent = this.extensionStatus.enabled ? '⏸️' : '▶️';
      }
      toggleButton.title = this.extensionStatus.enabled ? 'Pause Extension' : 'Resume Extension';
      toggleButton.classList.toggle('disabled', !this.extensionStatus.enabled);
    }

    // Update downloads count
    this.updateDownloadsCount();

    // Populate settings panel
    this.populateSettingsPanel();

    // Update settings tooltip
    this.updateSettingsTooltip();
  }

  /**
   * Get human-readable template name
   * @param {string} templateId - Template ID
   * @returns {string} Human-readable name
   */
  getTemplateName(templateId) {
    const templateNames = {
      'thermal_57x32': 'Thermal 57x32mm',
      'thermal_57x32_minimal': 'Thermal 57x32mm (Minimal)',
      'shipping_4x6': 'Shipping 4"x6"',
      'custom': 'Custom Size'
    };
    return templateNames[templateId] || 'Unknown';
  }

  /**
   * Check if current page is compatible with extension
   */
  async checkPageCompatibility() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];

      const pageStatusElement = document.getElementById('page-status');

      if (currentTab && currentTab.url) {
        const isCompatible = /https:\/\/sellercentral(-europe)?\.amazon\.[^\/]+/.test(currentTab.url);

        if (isCompatible) {
          pageStatusElement.textContent = 'Compatible';
          pageStatusElement.className = 'status-value compatible';
        } else {
          pageStatusElement.textContent = 'Not Compatible';
          pageStatusElement.className = 'status-value incompatible';
        }
      } else {
        pageStatusElement.textContent = 'Unknown';
        pageStatusElement.className = 'status-value';
      }
    } catch (error) {
      console.error('Failed to check page compatibility:', error);
      document.getElementById('page-status').textContent = 'Error';
    }
  }

  /**
   * Toggle extension enabled/disabled state
   */
  async toggleExtension() {
    try {
      const toggleButton = document.getElementById('toggle-extension');
      toggleButton.disabled = true;

      const response = await chrome.runtime.sendMessage({ action: 'toggleExtension' });

      if (response.success) {
        this.extensionStatus.enabled = response.enabled;
        this.updateUI();
      } else {
        this.showError('Failed to toggle extension');
      }
    } catch (error) {
      console.error('Failed to toggle extension:', error);
      this.showError('Failed to toggle extension');
    } finally {
      document.getElementById('toggle-extension').disabled = false;
    }
  }

  /**
   * Switch to manual entry tab
   */
  switchToManualTab() {
    // Remove active from all tabs
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    // Activate manual tab
    document.querySelector('[data-tab="manual"]').classList.add('active');
    document.getElementById('manual-tab').classList.add('active');
  }

  /**
   * Generate label from manual entry form
   */
  async generateManualLabel() {
    try {
      const generateBtn = document.getElementById('generate-manual');
      generateBtn.classList.add('loading');
      generateBtn.disabled = true;

      // Collect form data
      const formData = this.collectManualFormData();

      // Validate required fields
      if (!this.validateManualForm(formData)) {
        return;
      }

      // Generate PDF directly in popup
      await this.generatePDFDirectly(formData);

    } catch (error) {
      console.error('Manual label generation error:', error);
      this.showError('Failed to generate label');
    } finally {
      const generateBtn = document.getElementById('generate-manual');
      generateBtn.classList.remove('loading');
      generateBtn.disabled = false;
    }
  }

  /**
   * Generate PDF directly in the popup
   */
  async generatePDFDirectly(data) {
    try {
      // Check if libraries are loaded
      if (typeof window.jspdf === 'undefined' || typeof JsBarcode === 'undefined') {
        throw new Error('PDF libraries not loaded');
      }

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: [57, 32]
      });

      // Generate barcode
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, data.fnsku, {
        format: 'CODE128',
        displayValue: false,
        margin: 0,
        width: 2,
        height: 40
      });
      const barcodeData = canvas.toDataURL('image/png');

      // Generate labels
      for (let i = 0; i < data.quantity; i++) {
        if (i > 0) doc.addPage();

        // Add barcode
        doc.addImage(barcodeData, 'PNG', 4, 2, 49, 12);

        // Add FNSKU text
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(data.fnsku, 28.5, 17, { align: 'center' });

        // Add SKU text
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        const skuText = `SKU: ${data.sku}`;
        if (skuText.length > 15) doc.setFontSize(9);
        doc.text(skuText, 28.5, 22, { align: 'center' });

        // Add title
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        const cleanTitle = data.title && data.title.length > 50 ?
          data.title.substring(0, 50) + '...' : (data.title || '');
        if (cleanTitle) {
          doc.text(cleanTitle, 28.5, 26, { align: 'center' });
        }
      }

      // Create blob URL for the PDF
      const pdfBlob = doc.output('blob');
      const blobUrl = URL.createObjectURL(pdfBlob);

      // Download the PDF
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${data.sku}_label.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Add to download history
      this.addToDownloadHistory({
        sku: data.sku,
        fnsku: data.fnsku,
        asin: data.asin,
        title: data.title,
        quantity: data.quantity,
        timestamp: new Date().toISOString()
      });

      this.showSuccess(`✅ Generated ${data.quantity} label(s) for ${data.sku}`);

    } catch (error) {
      console.error('PDF generation error:', error);
      throw error;
    }
  }

  /**
   * Collect data from manual entry form
   */
  collectManualFormData() {
    return {
      sku: document.getElementById('manual-sku').value.trim(),
      fnsku: document.getElementById('manual-fnsku').value.trim().toUpperCase(),
      asin: document.getElementById('manual-asin').value.trim().toUpperCase(),
      title: document.getElementById('manual-title').value.trim(),
      quantity: parseInt(document.getElementById('manual-quantity').value) || 1
    };
  }

  /**
   * Validate manual form data
   */
  validateManualForm(data) {
    let isValid = true;

    // Clear previous validation states
    document.querySelectorAll('.form-group').forEach(group => {
      group.classList.remove('error', 'success');
    });

    // Validate SKU
    if (!data.sku) {
      this.setFieldError('manual-sku', 'SKU is required');
      isValid = false;
    } else {
      this.setFieldSuccess('manual-sku');
    }

    // Validate FNSKU
    const fnskuPattern = /^[A-Z0-9]{10}$/;
    if (!data.fnsku) {
      this.setFieldError('manual-fnsku', 'FNSKU is required');
      isValid = false;
    } else if (!fnskuPattern.test(data.fnsku)) {
      this.setFieldError('manual-fnsku', 'Invalid FNSKU format (should be 10 alphanumeric characters like X002HB9ZDL)');
      isValid = false;
    } else {
      this.setFieldSuccess('manual-fnsku');
    }

    // Validate ASIN (optional but if provided, must be valid)
    if (data.asin) {
      const asinPattern = /^B[0-9A-Z]{9}$/;
      if (!asinPattern.test(data.asin)) {
        this.setFieldError('manual-asin', 'Invalid ASIN format (should be like B0FXH65FKG)');
        isValid = false;
      } else {
        this.setFieldSuccess('manual-asin');
      }
    }

    // Validate quantity
    if (data.quantity < 1 || data.quantity > 1000) {
      this.setFieldError('manual-quantity', 'Quantity must be between 1 and 1000');
      isValid = false;
    } else {
      this.setFieldSuccess('manual-quantity');
    }

    return isValid;
  }

  /**
   * Set field error state
   */
  setFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    const group = field.closest('.form-group');
    const hint = group.querySelector('.form-hint');

    group.classList.add('error');
    if (hint) {
      hint.textContent = message;
    }
  }

  /**
   * Set field success state
   */
  setFieldSuccess(fieldId) {
    const field = document.getElementById(fieldId);
    const group = field.closest('.form-group');

    group.classList.add('success');
  }

  /**
   * Clear manual entry form
   */
  clearManualForm() {
    document.getElementById('manual-entry-form').reset();
    document.getElementById('manual-quantity').value = '1';

    // Clear validation states
    document.querySelectorAll('.form-group').forEach(group => {
      group.classList.remove('error', 'success');
    });
  }

  /**
   * Preview manual label (validate without generating)
   */
  previewManualLabel() {
    const formData = this.collectManualFormData();

    if (this.validateManualForm(formData)) {
      this.showSuccess('Form data is valid and ready for label generation');
    } else {
      this.showError('Please fix the form errors before generating');
    }
  }

  /**
   * Load sample data for testing
   */
  loadSampleData() {
    document.getElementById('manual-sku').value = '2xArmyFBA';
    document.getElementById('manual-fnsku').value = 'X002HB9ZDL';
    document.getElementById('manual-asin').value = 'B0FXH65FKG';
    document.getElementById('manual-title').value = 'Absolute Eclipse Gafas de eclipse solar del ejército, probadas por ISO 12312-2 y con certificación CE, fabricante de la UE, paquete de 2 unidades, Eclipse Europe 2026';
    document.getElementById('manual-quantity').value = '2';

    // Clear any validation states
    document.querySelectorAll('.form-group').forEach(group => {
      group.classList.remove('error', 'success');
    });

    this.showSuccess('Sample data loaded successfully');
  }

  /**
   * Populate settings panel with current values
   */
  populateSettingsPanel() {
    const labelSettings = this.currentSettings.labelSettings || {};

    // Default template
    const templateSelect = document.getElementById('default-template');
    if (templateSelect) {
      templateSelect.value = labelSettings.template || 'thermal_57x32';
    }

    // Default barcode format
    const barcodeSelect = document.getElementById('default-barcode');
    if (barcodeSelect) {
      barcodeSelect.value = labelSettings.barcodeFormat || 'CODE128';
    }

    // Include images checkbox
    const includeImagesCheckbox = document.getElementById('default-include-images');
    if (includeImagesCheckbox) {
      includeImagesCheckbox.checked = labelSettings.includeImage || false;
    }

    // Auto-open tabs checkbox
    const autoOpenTabsCheckbox = document.getElementById('auto-open-tabs');
    if (autoOpenTabsCheckbox) {
      autoOpenTabsCheckbox.checked = labelSettings.autoOpenTabs || false;
    }

    // Debug mode checkbox
    const debugModeCheckbox = document.getElementById('debug-mode');
    if (debugModeCheckbox) {
      debugModeCheckbox.checked = labelSettings.debugMode || false;
    }

    // Auto-extract checkbox
    const autoExtractCheckbox = document.getElementById('auto-extract');
    if (autoExtractCheckbox) {
      autoExtractCheckbox.checked = labelSettings.autoExtract !== false;
    }
  }

  /**
   * Save settings from panel
   */
  async saveSettings() {
    try {
      const saveButton = document.getElementById('save-settings');
      saveButton.disabled = true;
      saveButton.textContent = 'Saving...';

      // Collect settings from form
      const newSettings = {
        fnskuLabelSettings: {
          template: document.getElementById('default-template').value,
          barcodeFormat: document.getElementById('default-barcode').value,
          includeImage: document.getElementById('default-include-images').checked,
          autoOpenTabs: document.getElementById('auto-open-tabs').checked,
          debugMode: document.getElementById('debug-mode').checked,
          autoExtract: document.getElementById('auto-extract').checked,
          fontSize: this.currentSettings.labelSettings?.fontSize || {
            fnsku: 8,
            sku: 11,
            title: 6
          }
        }
      };

      // Save to background script
      const response = await chrome.runtime.sendMessage({
        action: 'saveSettings',
        settings: newSettings
      });

      if (response.success) {
        this.currentSettings.labelSettings = newSettings.fnskuLabelSettings;
        this.updateUI();
        this.closeSettings();
        this.showSuccess('Settings saved successfully');
      } else {
        this.showError('Failed to save settings');
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.showError('Failed to save settings');
    } finally {
      const saveButton = document.getElementById('save-settings');
      saveButton.disabled = false;
      saveButton.textContent = 'Save Settings';
    }
  }

  /**
   * Reset settings to defaults
   */
  async resetSettings() {
    if (!confirm('Are you sure you want to reset all settings to defaults?')) {
      return;
    }

    try {
      const defaultSettings = {
        fnskuLabelSettings: {
          template: 'thermal_57x32',
          barcodeFormat: 'CODE128',
          includeImage: false,
          autoOpenTabs: false,
          debugMode: false,
          autoExtract: true,
          fontSize: {
            fnsku: 8,
            sku: 11,
            title: 6
          }
        }
      };

      const response = await chrome.runtime.sendMessage({
        action: 'saveSettings',
        settings: defaultSettings
      });

      if (response.success) {
        this.currentSettings.labelSettings = defaultSettings.fnskuLabelSettings;
        this.populateSettingsPanel();
        this.updateUI();
        this.showSuccess('Settings reset to defaults');
      } else {
        this.showError('Failed to reset settings');
      }
    } catch (error) {
      console.error('Failed to reset settings:', error);
      this.showError('Failed to reset settings');
    }
  }

  /**
   * Open help guide
   */
  openHelpGuide() {
    chrome.tabs.create({
      url: 'https://github.com/your-repo/amazon-fnsku-extension/wiki/user-guide'
    });
  }

  /**
   * Refresh current page
   */
  async refreshCurrentPage() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        await chrome.tabs.reload(tabs[0].id);
        window.close(); // Close popup after refresh
      }
    } catch (error) {
      console.error('Failed to refresh page:', error);
      this.showError('Failed to refresh page');
    }
  }

  /**
   * Report issue
   */
  reportIssue() {
    const issueUrl = 'https://github.com/your-repo/amazon-fnsku-extension/issues/new?' +
      'template=bug_report.md&' +
      `title=Bug Report&` +
      `body=**Extension Version:** ${this.extensionStatus.version}%0A` +
      `**Browser:** ${navigator.userAgent}%0A` +
      `**Date:** ${new Date().toISOString()}%0A%0A` +
      `**Description:**%0A`;

    chrome.tabs.create({ url: issueUrl });
  }

  /**
   * Open privacy policy
   */
  openPrivacyPolicy() {
    chrome.tabs.create({
      url: 'https://github.com/your-repo/amazon-fnsku-extension/blob/main/PRIVACY.md'
    });
  }

  /**
   * Open support page
   */
  openSupport() {
    chrome.tabs.create({
      url: 'https://github.com/your-repo/amazon-fnsku-extension/discussions'
    });
  }

  /**
   * Open feedback form
   */
  openFeedback() {
    chrome.tabs.create({
      url: 'https://forms.gle/your-feedback-form-id'
    });
  }

  /**
   * Show success message
   * @param {string} message - Success message
   */
  showSuccess(message) {
    this.showNotification(message, 'success');
  }

  /**
   * Show error message
   * @param {string} message - Error message
   */
  showError(message) {
    this.showNotification(message, 'error');
  }

  /**
   * Show notification
   * @param {string} message - Notification message
   * @param {string} type - Notification type
   */
  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `popup-notification ${type}`;
    notification.textContent = message;

    // Style notification
    notification.style.cssText = `
      position: fixed;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      z-index: 10000;
      animation: slideDown 0.3s ease-out;
    `;

    // Set colors based on type
    if (type === 'success') {
      notification.style.background = '#d4edda';
      notification.style.color = '#155724';
      notification.style.border = '1px solid #c3e6cb';
    } else if (type === 'error') {
      notification.style.background = '#f8d7da';
      notification.style.color = '#721c24';
      notification.style.border = '1px solid #f5c6cb';
    } else {
      notification.style.background = '#d1ecf1';
      notification.style.color = '#0c5460';
      notification.style.border = '1px solid #bee5eb';
    }

    // Add to DOM
    document.body.appendChild(notification);

    // Remove after delay
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 3000);
  }

  /**
   * Load download history from storage
   */
  async loadDownloadHistory() {
    try {
      const result = await chrome.storage.local.get(['downloadHistory']);
      this.downloadHistory = result.downloadHistory || [];
      this.updateDownloadsList();
    } catch (error) {
      console.error('Failed to load download history:', error);
      this.downloadHistory = [];
    }
  }

  /**
   * Add item to download history
   */
  async addToDownloadHistory(item) {
    try {
      this.downloadHistory.unshift(item);
      // Keep only last 50 items
      if (this.downloadHistory.length > 50) {
        this.downloadHistory = this.downloadHistory.slice(0, 50);
      }

      await chrome.storage.local.set({ downloadHistory: this.downloadHistory });
      this.updateDownloadsList();
    } catch (error) {
      console.error('Failed to save download history:', error);
    }
  }

  /**
   * Clear download history
   */
  async clearDownloadHistory() {
    try {
      this.downloadHistory = [];
      await chrome.storage.local.set({ downloadHistory: [] });
      this.updateDownloadsList();
      this.showSuccess('Download history cleared');
    } catch (error) {
      console.error('Failed to clear download history:', error);
      this.showError('Failed to clear history');
    }
  }

  /**
   * Update downloads list UI
   */
  updateDownloadsList() {
    const downloadsList = document.getElementById('downloads-list');

    if (this.downloadHistory.length === 0) {
      downloadsList.innerHTML = `
        <div class="no-downloads">
          <p>No labels generated yet</p>
          <p class="hint">Use Manual Entry or visit Amazon Seller Central to generate labels</p>
        </div>
      `;
    } else {
      downloadsList.innerHTML = this.downloadHistory.map((item, index) => {
        const date = new Date(item.timestamp);
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateStr = date.toLocaleDateString();
        
        return `
          <div class="download-item available" data-index="${index}" title="Click to regenerate and download">
            <div class="download-icon">📄</div>
            <div class="download-info">
              <div class="download-name">${item.sku}_label.pdf</div>
              <div class="download-details">SKU: ${item.sku} • Qty: ${item.quantity}</div>
            </div>
            <div class="download-actions">
              <div class="download-time">${timeStr}<br>${dateStr}</div>
              <button class="remove-btn" title="Remove from history">×</button>
            </div>
          </div>
        `;
      }).join('');

      // Add click handlers
      downloadsList.querySelectorAll('.download-item').forEach(item => {
        const index = parseInt(item.dataset.index);
        const historyItem = this.downloadHistory[index];
        
        // Click to regenerate and download
        item.addEventListener('click', (e) => {
          if (!e.target.classList.contains('remove-btn')) {
            this.regenerateAndDownload(historyItem);
          }
        });
        
        // Remove button
        const removeBtn = item.querySelector('.remove-btn');
        if (removeBtn) {
          removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeFromHistory(index);
          });
        }
      });
    }

    // Update downloads count
    this.updateDownloadsCount();
  }

  /**
   * Regenerate and download a label from history
   */
  async regenerateAndDownload(item) {
    try {
      this.showSuccess('Regenerating label...');
      
      // Populate the manual form with the stored data
      document.getElementById('manual-sku').value = item.sku || '';
      document.getElementById('manual-fnsku').value = item.fnsku || '';
      document.getElementById('manual-asin').value = item.asin || '';
      document.getElementById('manual-title').value = item.title || '';
      document.getElementById('manual-quantity').value = item.quantity || 1;

      // Generate the label using the existing method
      await this.generateManualLabel();
    } catch (error) {
      console.error('Failed to regenerate label:', error);
      this.showError('Failed to regenerate label');
    }
  }

  /**
   * Remove item from download history
   */
  async removeFromHistory(index) {
    try {
      this.downloadHistory.splice(index, 1);
      await chrome.storage.local.set({ downloadHistory: this.downloadHistory });
      this.updateDownloadsList();
      this.showSuccess('Item removed from history');
    } catch (error) {
      console.error('Failed to remove item:', error);
      this.showError('Failed to remove item');
    }
  }

  /**
   * Update downloads count in footer
   */
  updateDownloadsCount() {
    const countElement = document.getElementById('downloads-count');
    if (countElement) {
      const count = this.downloadHistory.length;
      countElement.textContent = `${count} label${count !== 1 ? 's' : ''}`;
    }
  }

  /**
   * Setup settings tooltip
   */
  setupSettingsTooltip() {
    const settingsTab = document.querySelector('.settings-tab');
    if (settingsTab) {
      this.updateSettingsTooltip();
    }
  }

  /**
   * Update settings tooltip with current settings
   */
  updateSettingsTooltip() {
    const settingsTab = document.querySelector('.settings-tab');
    const labelSettings = this.currentSettings.labelSettings || {};

    const tooltip = `Current Settings:
Template: ${this.getTemplateName(labelSettings.template || 'thermal_57x32')}
Barcode: ${labelSettings.barcodeFormat || 'CODE128'}
Images: ${labelSettings.includeImage ? 'Yes' : 'No'}
Auto-extract: ${labelSettings.autoExtract !== false ? 'Yes' : 'No'}`;

    if (settingsTab) {
      settingsTab.title = tooltip;
    }
  }

  /**
   * Get human-readable template name
   */
  getTemplateName(template) {
    const templates = {
      'thermal_57x32': 'Thermal 57x32mm',
      'thermal_102x152': 'Thermal 102x152mm',
      'a4_sheet': 'A4 Sheet',
      'letter_sheet': 'Letter Sheet'
    };
    return templates[template] || template;
  }
}

// Add slide down animation
const style = document.createElement('style');
style.textContent = `
  @keyframes slideDown {
    from {
      transform: translateX(-50%) translateY(-20px);
      opacity: 0;
    }
    to {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
  }
`;
document.head.appendChild(style);

// Initialize popup when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
  });
} else {
  new PopupController();
}