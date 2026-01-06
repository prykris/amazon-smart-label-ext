class PopupController {
  constructor() {
    this.templateManager = null;
    this.settingsManager = null;
    this.pdfGenerator = null;
    this.currentTab = 'downloads'; // Default, will be overridden by saved preference
    this.autoSaveTimeout = null;
    this.templateEditor = null;
    this.currentSettings = {};
    this.downloadHistory = [];
    this.saveTimeout = null;
    this.saveDelay = 500;
    this.dimensionChangeTimeout = null;
    this.nameChangeTimeout = null;
    this.fontSizeChangeTimeout = null;

    this.init();
  }

  async init() {
    try {
      // Initialize services
      this.templateManager = new TemplateManager();
      this.settingsManager = new SettingsManager();
      this.pdfGenerator = new PDFLabelGenerator(this.templateManager, this.settingsManager);

      await this.templateManager.init();
      await this.settingsManager.init();

      // Initialize template editor
      this.templateEditor = new TemplateEditor(this.templateManager, this.settingsManager);

      this.setupEventListeners();
      this.setupTabSwitching();
      await this.loadSettings();
      await this.restoreLastSelectedTab(); // Restore saved tab preference
      await this.loadTemplates();
      await this.loadDownloadHistory();
      this.updatePreview();

      console.log('PopupController initialized successfully');
    } catch (error) {
      console.error('Failed to initialize PopupController:', error);
      this.showError('Failed to initialize extension');
    }
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Manual entry form
    const generateBtn = document.getElementById('generate-manual-label');
    const previewBtn = document.getElementById('preview-manual-label');
    const clearBtn = document.getElementById('clear-manual-form');
    const sampleBtn = document.getElementById('load-sample-data');

    if (generateBtn) generateBtn.addEventListener('click', () => this.generateManualLabel());
    if (previewBtn) previewBtn.addEventListener('click', () => this.previewManualLabel());
    if (clearBtn) clearBtn.addEventListener('click', () => this.clearManualForm());
    if (sampleBtn) sampleBtn.addEventListener('click', () => this.loadSampleData());

    // Settings form - auto-save on changes
    const settingsForm = document.getElementById('settings-form');
    if (settingsForm) {
      settingsForm.addEventListener('change', () => this.autoSaveSettings());
      settingsForm.addEventListener('input', () => this.autoSaveSettings());
    }

    // Font size inputs - immediate preview update
    const fnskuFontSize = document.getElementById('fnsku-font-size');
    const skuFontSize = document.getElementById('sku-font-size');
    const titleFontSize = document.getElementById('title-font-size');

    if (fnskuFontSize) fnskuFontSize.addEventListener('input', () => this.onFontSizeChange());
    if (skuFontSize) skuFontSize.addEventListener('input', () => this.onFontSizeChange());
    if (titleFontSize) titleFontSize.addEventListener('input', () => this.onFontSizeChange());

    // Condition settings - immediate preview update
    const conditionTextInput = document.getElementById('condition-text');
    const conditionPositionSelect = document.getElementById('condition-position');

    if (conditionTextInput) conditionTextInput.addEventListener('input', () => this.autoSaveSettings());
    if (conditionPositionSelect) conditionPositionSelect.addEventListener('change', () => this.autoSaveSettings());

    // Hybrid template selector event handlers
    this.setupHybridTemplateSelector();

    // Dimension controls event handlers
    const templateWidth = document.getElementById('template-width');
    const templateHeight = document.getElementById('template-height');
    const templateUnits = document.getElementById('template-units');
    const templateNameInput = document.getElementById('template-name-input');

    if (templateWidth) templateWidth.addEventListener('input', () => this.debouncedDimensionChange());
    if (templateHeight) templateHeight.addEventListener('input', () => this.debouncedDimensionChange());
    if (templateUnits) templateUnits.addEventListener('change', () => this.onDimensionChange());
    if (templateNameInput) templateNameInput.addEventListener('input', () => this.debouncedTemplateNameChange());

    // Template management buttons
    const createTemplateBtn = document.getElementById('create-template-btn');

    if (createTemplateBtn) {
      createTemplateBtn.addEventListener('click', () => this.createSimpleTemplate());
    }

    // Reset settings button
    const resetBtn = document.getElementById('reset-settings');
    if (resetBtn) resetBtn.addEventListener('click', () => this.resetSettings());

    // Downloads management
    const clearHistoryBtn = document.getElementById('clear-history');
    if (clearHistoryBtn) clearHistoryBtn.addEventListener('click', () => this.clearDownloadHistory());

    // Help and support buttons
    const helpBtn = document.getElementById('help-guide');
    const refreshBtn = document.getElementById('refresh-page');
    const reportBtn = document.getElementById('report-issue');
    const privacyBtn = document.getElementById('privacy-policy');
    const supportBtn = document.getElementById('support');
    const feedbackBtn = document.getElementById('feedback');

    if (helpBtn) helpBtn.addEventListener('click', () => this.openHelpGuide());
    if (refreshBtn) refreshBtn.addEventListener('click', () => this.refreshCurrentPage());
    if (reportBtn) reportBtn.addEventListener('click', () => this.reportIssue());
    if (privacyBtn) privacyBtn.addEventListener('click', () => this.openPrivacyPolicy());
    if (supportBtn) supportBtn.addEventListener('click', () => this.openSupport());
    if (feedbackBtn) feedbackBtn.addEventListener('click', () => this.openFeedback());

    // Listen for template editor events
    document.addEventListener('templateSaved', async () => {
      await this.loadTemplates();
      await this.loadSettings(); // Reload settings to get the new selected template
      await this.populateSettingsPanel(); // Refresh the settings panel
      await this.updatePreview();
    });

    document.addEventListener('templateDeleted', async () => {
      await this.loadTemplates();
      await this.loadSettings(); // Reload settings to get the updated selected template
      await this.populateSettingsPanel(); // Refresh the settings panel
      await this.updatePreview();
    });
  }

  /**
   * Setup tab switching functionality
   */
  setupTabSwitching() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const targetTab = button.dataset.tab;

        // Update active tab button
        tabButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');

        // Update active tab content
        tabContents.forEach(content => {
          content.classList.remove('active');
          if (content.id === `${targetTab}-tab`) {
            content.classList.add('active');
          }
        });

        this.currentTab = targetTab;

        // Save the selected tab preference
        this.saveSelectedTab(targetTab);

        // Update UI based on active tab
        if (targetTab === 'settings') {
          this.populateSettingsPanel();
          this.updatePreview();
        } else if (targetTab === 'manual') {
          this.updateManualTemplateSelector();
        }
      });
    });
  }

  /**
   * Load settings from SettingsManager
   */
  async loadSettings() {
    try {
      this.currentSettings = await this.settingsManager.getSettings();
      console.log('Loaded settings:', this.currentSettings);
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.currentSettings = {};
    }
  }

  /**
   * Load templates from TemplateManager
   */
  async loadTemplates() {
    try {
      await this.updateManualTemplateSelector();
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  }

  /**
   * Restore the last selected tab from settings
   */
  async restoreLastSelectedTab() {
    try {
      const globalSettings = this.currentSettings.globalSettings || {};
      const lastSelectedTab = globalSettings.lastSelectedTab || 'downloads';

      // Set the current tab
      this.currentTab = lastSelectedTab;

      // Update the UI to reflect the restored tab
      this.activateTab(lastSelectedTab);

      console.log('Restored last selected tab:', lastSelectedTab);
    } catch (error) {
      console.error('Failed to restore last selected tab:', error);
      // Fallback to downloads tab
      this.currentTab = 'downloads';
      this.activateTab('downloads');
    }
  }

  /**
   * Save the selected tab preference
   */
  async saveSelectedTab(tabName) {
    try {
      await this.settingsManager.updateGlobalSettings({
        lastSelectedTab: tabName
      });
      console.log('Saved selected tab:', tabName);
    } catch (error) {
      console.error('Failed to save selected tab:', error);
    }
  }

  /**
   * Activate a specific tab in the UI
   */
  activateTab(tabName) {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    // Update active tab button
    tabButtons.forEach(btn => {
      btn.classList.remove('active');
      if (btn.dataset.tab === tabName) {
        btn.classList.add('active');
      }
    });

    // Update active tab content
    tabContents.forEach(content => {
      content.classList.remove('active');
      if (content.id === `${tabName}-tab`) {
        content.classList.add('active');
      }
    });

    // Update UI based on active tab
    if (tabName === 'settings') {
      this.populateSettingsPanel();
      this.updatePreview();
    } else if (tabName === 'manual') {
      this.updateManualTemplateSelector();
    }
  }

  /**
   * Update preview based on current settings
   */
  async updatePreview() {
    if (this.currentTab === 'settings') {
      await this.updateLabelPreview();
    }
  }

  /**
   * Generate manual label
   */
  async generateManualLabel() {
    try {
      const formData = this.collectManualFormData();

      if (!this.validateManualForm(formData)) {
        return;
      }

      // Get template to use (local override or global)
      const manualTemplateSelect = document.getElementById('manual-template-select');
      let templateId;

      if (manualTemplateSelect && manualTemplateSelect.value) {
        templateId = manualTemplateSelect.value;
      } else {
        templateId = await this.settingsManager.getSelectedTemplateId();
      }

      // Generate PDF using the unified system (PDF generator gets settings from SettingsManager)
      const pdfDoc = await this.pdfGenerator.generateLabels({
        sku: formData.sku,
        fnsku: formData.fnsku,
        asin: formData.asin,
        title: formData.title
      }, formData.quantity, { templateId: templateId });

      const pdfBlob = pdfDoc.output('blob');

      // Download the PDF
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${formData.sku}_label.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Add to download history
      await this.addToDownloadHistory({
        sku: formData.sku,
        fnsku: formData.fnsku,
        asin: formData.asin,
        title: formData.title,
        quantity: formData.quantity,
        timestamp: new Date().toISOString()
      });

      this.showSuccess(`✅ Generated ${formData.quantity} label(s) for ${formData.sku}`);

    } catch (error) {
      console.error('PDF generation error:', error);
      this.showError('Failed to generate label: ' + error.message);
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
      condition: document.getElementById('manual-condition').value.trim() || 'NEW',
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
    document.getElementById('manual-condition').value = 'NEW';
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
  async populateSettingsPanel() {
    try {
      // Update template UI
      await this.updateTemplateUI();

      // Populate the content
      await this.populateSettingsPanelContent();

    } catch (error) {
      console.error('Failed to populate settings panel:', error);
    }
  }

  /**
   * Populate settings panel content without updating template dropdown
   */
  async populateSettingsPanelContent() {
    try {
      // Get current settings
      const selectedTemplateId = this.currentSettings.selectedTemplateId || 'thermal_57x32';
      const globalSettings = this.currentSettings.globalSettings || {};

      // Default barcode format
      const barcodeSelect = document.getElementById('default-barcode');
      if (barcodeSelect) {
        barcodeSelect.value = globalSettings.barcodeFormat || 'CODE128';
      }

      // App behavior checkboxes
      const autoExtractCheckbox = document.getElementById('auto-extract');
      const autoOpenTabsCheckbox = document.getElementById('auto-open-tabs');
      const debugModeCheckbox = document.getElementById('debug-mode');

      if (autoExtractCheckbox) autoExtractCheckbox.checked = globalSettings.autoExtract !== false;
      if (autoOpenTabsCheckbox) autoOpenTabsCheckbox.checked = globalSettings.autoOpenTabs || false;
      if (debugModeCheckbox) debugModeCheckbox.checked = globalSettings.debugMode || false;

      // Get selected template for content inclusion settings
      const selectedTemplate = await this.getSelectedTemplate();
      const contentInclusion = selectedTemplate?.contentInclusion || {};

      // Content inclusion options
      const includeBarcodeCheckbox = document.getElementById('include-barcode');
      const includeFnskuCheckbox = document.getElementById('include-fnsku');
      const includeSkuCheckbox = document.getElementById('include-sku');
      const includeTitleCheckbox = document.getElementById('include-title');
      const includeImagesCheckbox = document.getElementById('default-include-images');
      const includeConditionCheckbox = document.getElementById('include-condition');

      if (includeBarcodeCheckbox) includeBarcodeCheckbox.checked = contentInclusion.barcode !== false;
      if (includeFnskuCheckbox) includeFnskuCheckbox.checked = contentInclusion.fnsku !== false;
      if (includeSkuCheckbox) includeSkuCheckbox.checked = contentInclusion.sku !== false;
      if (includeTitleCheckbox) includeTitleCheckbox.checked = contentInclusion.title !== false;
      if (includeImagesCheckbox) includeImagesCheckbox.checked = contentInclusion.images || false;
      if (includeConditionCheckbox) includeConditionCheckbox.checked = contentInclusion.condition !== false;

      // Condition settings
      const conditionSettings = globalSettings.conditionSettings || {};
      const conditionTextInput = document.getElementById('condition-text');
      const conditionPositionSelect = document.getElementById('condition-position');

      if (conditionTextInput) {
        conditionTextInput.value = conditionSettings.text || 'NEW';
      }
      if (conditionPositionSelect) {
        conditionPositionSelect.value = conditionSettings.position || 'bottom-left';
      }

      // Font size inputs (prioritize global overrides, then template defaults)
      const fnskuFontSize = document.getElementById('fnsku-font-size');
      const skuFontSize = document.getElementById('sku-font-size');
      const titleFontSize = document.getElementById('title-font-size');

      // Use font size overrides from global settings if available, otherwise use template defaults
      const fontOverrides = globalSettings.fontSizeOverrides || {};

      if (fnskuFontSize) {
        fnskuFontSize.value = fontOverrides.fnsku || selectedTemplate?.elements?.fnsku?.fontSize || 8;
      }
      if (skuFontSize) {
        skuFontSize.value = fontOverrides.sku || selectedTemplate?.elements?.sku?.fontSize || 11;
      }
      if (titleFontSize) {
        titleFontSize.value = fontOverrides.title || selectedTemplate?.elements?.title?.fontSize || 6;
      }

    } catch (error) {
      console.error('Failed to populate settings panel content:', error);
    }
  }

  /**
   * Setup hybrid template selector
   */
  setupHybridTemplateSelector() {
    const dropdownBtn = document.getElementById('template-dropdown-btn');
    const dropdown = document.getElementById('template-dropdown');

    if (dropdownBtn && dropdown) {
      dropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleTemplateDropdown();
      });

      // Close dropdown when clicking outside
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.hybrid-selector')) {
          dropdown.style.display = 'none';
        }
      });
    }
  }

  /**
   * Toggle template dropdown visibility
   */
  async toggleTemplateDropdown() {
    const dropdown = document.getElementById('template-dropdown');
    if (!dropdown) return;

    if (dropdown.style.display === 'none' || !dropdown.style.display) {
      await this.populateTemplateDropdown();
      dropdown.style.display = 'block';
    } else {
      dropdown.style.display = 'none';
    }
  }

  /**
   * Populate template dropdown menu
   */
  async populateTemplateDropdown() {
    try {
      const dropdown = document.getElementById('template-dropdown');
      if (!dropdown || !this.templateManager) return;

      const templates = await this.templateManager.getAllTemplates();
      const currentSelectedId = await this.settingsManager.getSelectedTemplateId();

      // Clear existing items
      dropdown.innerHTML = '';

      // Add template items
      templates.forEach(template => {
        const item = document.createElement('div');
        item.className = 'template-dropdown-item';
        if (template.id === currentSelectedId) {
          item.classList.add('selected');
        }

        item.textContent = template.displayName || template.name;
        item.dataset.templateId = template.id;

        item.addEventListener('click', () => {
          this.selectTemplateFromDropdown(template.id);
        });

        dropdown.appendChild(item);
      });

    } catch (error) {
      console.error('Failed to populate template dropdown:', error);
    }
  }

  /**
   * Select template from dropdown
   */
  async selectTemplateFromDropdown(templateId) {
    try {
      // Hide dropdown
      const dropdown = document.getElementById('template-dropdown');
      if (dropdown) dropdown.style.display = 'none';

      // Update selected template
      await this.settingsManager.setSelectedTemplateId(templateId);

      // Update current settings cache
      this.currentSettings = await this.settingsManager.getSettings();

      // Update UI
      await this.updateTemplateUI();
      await this.updatePreview();

      console.log('Template selected from dropdown:', templateId);
    } catch (error) {
      console.error('Failed to select template from dropdown:', error);
      this.showError('Failed to select template');
    }
  }

  /**
   * Update template UI elements
   */
  async updateTemplateUI() {
    try {
      const selectedTemplate = await this.getSelectedTemplate();
      if (!selectedTemplate) return;

      // Update name display
      await this.updateTemplateNameDisplay();

      // Update dimension inputs
      const widthInput = document.getElementById('template-width');
      const heightInput = document.getElementById('template-height');
      const unitsSelect = document.getElementById('template-units');

      if (widthInput) widthInput.value = selectedTemplate.width || 57;
      if (heightInput) heightInput.value = selectedTemplate.height || 32;
      if (unitsSelect) unitsSelect.value = selectedTemplate.units || 'mm';

      // Disable dimension editing for built-in templates
      const isBuiltIn = !selectedTemplate.userCreated;
      if (widthInput) widthInput.readOnly = isBuiltIn;
      if (heightInput) heightInput.readOnly = isBuiltIn;
      if (unitsSelect) unitsSelect.disabled = isBuiltIn;

      // Update other settings
      await this.populateSettingsPanelContent();

    } catch (error) {
      console.error('Failed to update template UI:', error);
    }
  }

  /**
   * Update manual entry template selector
   */
  async updateManualTemplateSelector() {
    try {
      const templateSelect = document.getElementById('manual-template-select');
      if (!templateSelect || !this.templateManager) return;

      const templates = await this.templateManager.getAllTemplates();

      // Clear existing options
      templateSelect.innerHTML = '';

      // Add default option
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = 'Use Global Template';
      templateSelect.appendChild(defaultOption);

      // Add template options
      templates.forEach(template => {
        const option = document.createElement('option');
        option.value = template.id;
        option.textContent = template.name;
        if (template.userCreated) {
          option.textContent += ' (Custom)';
        }
        templateSelect.appendChild(option);
      });

    } catch (error) {
      console.error('Failed to update manual template selector:', error);
    }
  }

  /**
   * Get selected template
   * @returns {Object|null} Selected template
   */
  async getSelectedTemplate() {
    try {
      if (this.settingsManager && this.templateManager) {
        const templateId = await this.settingsManager.getSelectedTemplateId();
        return await this.templateManager.getTemplate(templateId);
      }
      return null;
    } catch (error) {
      console.error('Failed to get selected template:', error);
      return null;
    }
  }

  /**
   * Handle dimension changes with debouncing for input fields
   */
  debouncedDimensionChange() {
    // Clear existing timeout
    if (this.dimensionChangeTimeout) {
      clearTimeout(this.dimensionChangeTimeout);
    }

    // Set new timeout
    this.dimensionChangeTimeout = setTimeout(() => {
      this.onDimensionChange();
    }, 300);
  }

  /**
   * Handle dimension changes
   */
  async onDimensionChange() {
    try {
      const selectedTemplate = await this.getSelectedTemplate();
      if (!selectedTemplate || !selectedTemplate.userCreated) return;

      const widthInput = document.getElementById('template-width');
      const heightInput = document.getElementById('template-height');
      const unitsSelect = document.getElementById('template-units');

      if (!widthInput || !heightInput || !unitsSelect) return;

      const width = parseFloat(widthInput.value) || 0;
      const height = parseFloat(heightInput.value) || 0;
      const units = unitsSelect.value || 'mm';

      // Validate dimensions
      if (width <= 0 || height <= 0) return;

      // Update template dimensions and regenerate elements
      const updatedTemplate = {
        ...selectedTemplate,
        width,
        height,
        units,
        orientation: width > height ? 'landscape' : 'portrait',
        elements: this.generateBasicElements(width, height),
        updatedAt: new Date().toISOString()
      };

      // Save the updated template
      await this.templateManager.updateTemplate(selectedTemplate.id, updatedTemplate);

      // Update current settings cache
      this.currentSettings = await this.settingsManager.getSettings();

      // Update the name input to show new dimensions
      await this.updateTemplateNameDisplay();

      // Update preview
      await this.updatePreview();

      // Update template dropdown if open
      const dropdown = document.getElementById('template-dropdown');
      if (dropdown && dropdown.style.display !== 'none') {
        await this.populateTemplateDropdown();
      }

      console.log('Template dimensions updated:', { width, height, units });

    } catch (error) {
      console.error('Failed to handle dimension change:', error);
    }
  }

  /**
   * Handle template name changes with debouncing
   */
  debouncedTemplateNameChange() {
    // Clear existing timeout
    if (this.nameChangeTimeout) {
      clearTimeout(this.nameChangeTimeout);
    }

    // Set new timeout
    this.nameChangeTimeout = setTimeout(() => {
      this.onTemplateNameChange();
    }, 500);
  }

  /**
   * Handle template name changes
   */
  async onTemplateNameChange() {
    try {
      const selectedTemplate = await this.getSelectedTemplate();
      if (!selectedTemplate || !selectedTemplate.userCreated) return;

      const nameInput = document.getElementById('template-name-input');
      if (!nameInput) return;

      const newBaseName = nameInput.value.trim();
      if (!newBaseName) return;

      // Update template base name
      const updatedTemplate = {
        ...selectedTemplate,
        baseName: newBaseName,
        name: newBaseName,
        updatedAt: new Date().toISOString()
      };

      // Save the updated template
      await this.templateManager.updateTemplate(selectedTemplate.id, updatedTemplate);

      // Update template dropdown if open
      const dropdown = document.getElementById('template-dropdown');
      if (dropdown && dropdown.style.display !== 'none') {
        await this.populateTemplateDropdown();
      }

      console.log('Template name updated:', newBaseName);

    } catch (error) {
      console.error('Failed to handle template name change:', error);
    }
  }

  /**
   * Handle font size changes with debouncing
   */
  onFontSizeChange() {
    // Clear existing timeout
    if (this.fontSizeChangeTimeout) {
      clearTimeout(this.fontSizeChangeTimeout);
    }

    // Set new timeout for debounced save and preview update
    this.fontSizeChangeTimeout = setTimeout(async () => {
      try {
        // Auto-save the settings
        await this.autoSaveSettings();

        // Update the preview immediately to show font size changes
        await this.updatePreview();

        console.log('Font size changes applied');
      } catch (error) {
        console.error('Failed to handle font size change:', error);
      }
    }, 300);
  }

  /**
   * Update template name display with dimensions
   */
  async updateTemplateNameDisplay() {
    try {
      const selectedTemplate = await this.getSelectedTemplate();
      if (!selectedTemplate) return;

      const nameInput = document.getElementById('template-name-input');
      if (!nameInput) return;

      // Get or create dimensions overlay element
      let dimensionsOverlay = document.getElementById('template-dimensions-overlay');
      if (!dimensionsOverlay) {
        dimensionsOverlay = document.createElement('div');
        dimensionsOverlay.id = 'template-dimensions-overlay';
        dimensionsOverlay.className = 'template-dimensions-overlay';

        // Insert after the name input
        const templateSelector = nameInput.closest('.template-selector');
        if (templateSelector) {
          templateSelector.appendChild(dimensionsOverlay);
        }
      }

      // For built-in templates, show the dynamic name (read-only)
      if (!selectedTemplate.userCreated) {
        const dynamicName = this.templateManager.generateDynamicName(selectedTemplate);
        nameInput.value = dynamicName;
        nameInput.readOnly = true;
        nameInput.title = 'Built-in template (read-only)';
        dimensionsOverlay.style.display = 'none';
        nameInput.placeholder = '';
      } else {
        // For user templates, show editable base name with visual dimensions indicator
        const baseName = selectedTemplate.baseName || selectedTemplate.name || '';
        const dimensionSuffix = `${selectedTemplate.width || 57}×${selectedTemplate.height || 32}${selectedTemplate.units || 'mm'}`;

        nameInput.value = baseName;
        nameInput.readOnly = false;
        nameInput.title = `Template name (dimensions: ${dimensionSuffix})`;
        nameInput.placeholder = 'Template name';

        // Update dimensions overlay
        dimensionsOverlay.textContent = dimensionSuffix;
        dimensionsOverlay.style.display = 'block';
      }

    } catch (error) {
      console.error('Failed to update template name display:', error);
    }
  }

  /**
   * Handle template selection change
   */
  async onTemplateSelectionChange() {
    try {
      const templateSelect = document.getElementById('template-select');
      if (!templateSelect) return;

      const selectedTemplateId = templateSelect.value;
      const currentSelectedId = await this.settingsManager.getSelectedTemplateId();

      // Only update if the selection actually changed
      if (selectedTemplateId === currentSelectedId) return;

      // Update the selected template in settings
      await this.settingsManager.setSelectedTemplateId(selectedTemplateId);

      // Update current settings cache
      this.currentSettings = await this.settingsManager.getSettings();

      // Refresh the settings panel to show template-specific settings (but don't update the dropdown again)
      await this.populateSettingsPanelContent();

      // Update the preview
      await this.updatePreview();

      console.log('Template selection changed to:', selectedTemplateId);
    } catch (error) {
      console.error('Failed to handle template selection change:', error);
      this.showError('Failed to update template selection');
    }
  }

  /**
   * Auto-save settings with debounce
   */
  autoSaveSettings() {
    // Clear existing timeout
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    // Set new timeout
    this.saveTimeout = setTimeout(async () => {
      try {
        await this.saveSettingsToManager();
        this.showSavingIndicator(false);
      } catch (error) {
        console.error('Auto-save failed:', error);
        this.showError('Failed to save settings');
      }
    }, this.saveDelay);

    // Show saving indicator
    this.showSavingIndicator(true);
  }

  /**
   * Save settings to SettingsManager
   */
  async saveSettingsToManager() {
    try {
      if (!this.settingsManager || !this.templateManager) return;

      // Get form values
      const templateId = document.getElementById('template-select')?.value || 'thermal_57x32';
      const barcodeFormat = document.getElementById('default-barcode')?.value || 'CODE128';
      const autoExtract = document.getElementById('auto-extract')?.checked !== false;
      const autoOpenTabs = document.getElementById('auto-open-tabs')?.checked || false;
      const debugMode = document.getElementById('debug-mode')?.checked || false;

      // Get font size values
      const fnskuFontSize = parseInt(document.getElementById('fnsku-font-size')?.value);
      const skuFontSize = parseInt(document.getElementById('sku-font-size')?.value);
      const titleFontSize = parseInt(document.getElementById('title-font-size')?.value);

      // Get condition settings
      const conditionText = document.getElementById('condition-text')?.value || 'NEW';
      const conditionPosition = document.getElementById('condition-position')?.value || 'bottom-left';
      const conditionEnabled = document.getElementById('include-condition')?.checked !== false;

      // Update global settings including font size overrides and condition settings
      await this.settingsManager.setSelectedTemplateId(templateId);
      await this.settingsManager.updateGlobalSettings({
        barcodeFormat,
        autoExtract,
        autoOpenTabs,
        debugMode,
        fontSizeOverrides: {
          fnsku: fnskuFontSize && fnskuFontSize > 0 ? fnskuFontSize : null,
          sku: skuFontSize && skuFontSize > 0 ? skuFontSize : null,
          title: titleFontSize && titleFontSize > 0 ? titleFontSize : null
        },
        conditionSettings: {
          enabled: conditionEnabled,
          text: conditionText,
          position: conditionPosition
        }
      });

      // Get the current template and update its settings if it's user-created
      const currentTemplate = await this.templateManager.getTemplate(templateId);
      if (currentTemplate && currentTemplate.userCreated) {
        // Update template with current form values
        const updatedTemplate = {
          ...currentTemplate,
          contentInclusion: {
            barcode: document.getElementById('include-barcode')?.checked !== false,
            fnsku: document.getElementById('include-fnsku')?.checked !== false,
            sku: document.getElementById('include-sku')?.checked !== false,
            title: document.getElementById('include-title')?.checked !== false,
            images: document.getElementById('default-include-images')?.checked || false,
            condition: document.getElementById('include-condition')?.checked !== false
          },
          conditionSettings: {
            enabled: conditionEnabled,
            text: conditionText,
            position: conditionPosition
          }
        };

        // Update font sizes if the template has elements
        if (updatedTemplate.elements) {
          // Update FNSKU font size
          if (updatedTemplate.elements.fnsku && fnskuFontSize && fnskuFontSize > 0) {
            updatedTemplate.elements.fnsku.fontSize = fnskuFontSize;
          }

          // Update SKU font size
          if (updatedTemplate.elements.sku && skuFontSize && skuFontSize > 0) {
            updatedTemplate.elements.sku.fontSize = skuFontSize;
          }

          // Update Title font size
          if (updatedTemplate.elements.title && titleFontSize && titleFontSize > 0) {
            updatedTemplate.elements.title.fontSize = titleFontSize;
          }
        }

        // Save the updated template
        await this.templateManager.updateTemplate(templateId, updatedTemplate);
      }

      // Update current settings cache
      this.currentSettings = await this.settingsManager.getSettings();

    } catch (error) {
      console.error('Failed to save settings to manager:', error);
      throw error;
    }
  }

  /**
   * Show/hide saving indicator
   * @param {boolean} saving - Whether currently saving
   */
  showSavingIndicator(saving) {
    const indicator = document.getElementById('auto-save-indicator');
    if (indicator) {
      if (saving) {
        indicator.style.display = 'block';
        indicator.querySelector('.saving-text').textContent = 'Saving...';
      } else {
        indicator.querySelector('.saving-text').textContent = 'Saved';
        setTimeout(() => {
          indicator.style.display = 'none';
        }, 1000);
      }
    }

    if (saving) {
      console.log('Saving settings...');
    } else {
      console.log('Settings saved');
    }
  }

  /**
   * Update label preview based on current settings
   */
  async updateLabelPreview() {
    const previewContainer = document.getElementById('label-preview');
    if (!previewContainer) return;

    try {
      previewContainer.innerHTML = '<div class="preview-loading">Generating preview...</div>';

      if (!this.pdfGenerator) {
        previewContainer.innerHTML = '<div class="preview-error">PDF generator not initialized</div>';
        return;
      }

      // Get selected template ID
      const templateSelect = document.getElementById('template-select');
      const templateId = templateSelect?.value || await this.settingsManager.getSelectedTemplateId() || 'thermal_57x32';
      const barcodeFormat = document.getElementById('default-barcode')?.value || 'CODE128';

      // Get persistent sample data
      const sampleData = await this.getSampleData();

      // Get template info using new template system
      const templateInfo = await this.templateManager.getTemplate(templateId);
      if (!templateInfo) {
        previewContainer.innerHTML = '<div class="preview-error">Template not found</div>';
        return;
      }

      // Generate barcode using the PDF generator's method
      const barcodeDataURL = await this.pdfGenerator.generateBarcode(sampleData.fnsku, barcodeFormat);

      // Create preview wrapper with controls
      const previewWrapper = document.createElement('div');
      previewWrapper.className = 'preview-wrapper';
      previewWrapper.style.cssText = 'position: relative;';

      // Add control buttons
      const controlsTop = document.createElement('div');
      controlsTop.className = 'preview-controls-top';
      controlsTop.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;';

      // Edit button (left)
      const editBtn = document.createElement('button');
      editBtn.className = 'preview-edit-btn';
      editBtn.textContent = 'Edit';
      editBtn.style.cssText = 'padding: 4px 8px; font-size: 11px; border: 1px solid #007bff; background: white; color: #007bff; border-radius: 3px; cursor: pointer;';
      editBtn.addEventListener('click', () => this.openSampleDataEditor());

      // Download button (right)
      const downloadBtn = document.createElement('button');
      downloadBtn.className = 'preview-download-btn';
      downloadBtn.textContent = 'Download';
      downloadBtn.style.cssText = 'padding: 4px 8px; font-size: 11px; border: 1px solid #28a745; background: #28a745; color: white; border-radius: 3px; cursor: pointer;';
      downloadBtn.addEventListener('click', () => this.downloadFromPreview());

      controlsTop.appendChild(editBtn);
      controlsTop.appendChild(downloadBtn);

      // Create preview content
      const previewContent = document.createElement('div');
      previewContent.className = 'preview-content';

      // Add template info
      const templateInfoDiv = document.createElement('div');
      templateInfoDiv.className = 'preview-template-info';
      const width = templateInfo.width || 57;
      const height = templateInfo.height || 32;
      const units = templateInfo.units || 'mm';
      templateInfoDiv.textContent = `${templateInfo.name} (${width}×${height}${units})`;
      templateInfoDiv.style.cssText = 'font-size: 11px; color: #666; margin-bottom: 8px; text-align: center;';

      // Add barcode image
      const barcodeImg = document.createElement('img');
      barcodeImg.src = barcodeDataURL;
      barcodeImg.className = 'preview-barcode';
      barcodeImg.alt = 'Sample barcode';

      // Add template info
      previewContent.appendChild(templateInfoDiv);

      // Add barcode if enabled
      if (templateInfo.contentInclusion?.barcode !== false) {
        previewContent.appendChild(barcodeImg);
      }

      // Add text elements based on template
      const textContainer = document.createElement('div');
      textContainer.className = 'preview-text';

      // Get current font size overrides from form inputs (live values)
      const currentFnskuFontSize = parseInt(document.getElementById('fnsku-font-size')?.value) || templateInfo.elements?.fnsku?.fontSize || 8;
      const currentSkuFontSize = parseInt(document.getElementById('sku-font-size')?.value) || templateInfo.elements?.sku?.fontSize || 11;
      const currentTitleFontSize = parseInt(document.getElementById('title-font-size')?.value) || templateInfo.elements?.title?.fontSize || 6;

      // FNSKU text
      if (templateInfo.contentInclusion?.fnsku !== false) {
        const fnskuText = document.createElement('div');
        fnskuText.className = 'preview-fnsku';
        fnskuText.textContent = sampleData.fnsku;
        fnskuText.style.fontSize = `${currentFnskuFontSize}px`;
        textContainer.appendChild(fnskuText);
      }

      // SKU text
      if (templateInfo.contentInclusion?.sku !== false) {
        const skuText = document.createElement('div');
        skuText.className = 'preview-sku';
        skuText.textContent = `SKU: ${sampleData.sku}`;
        skuText.style.fontSize = `${currentSkuFontSize}px`;
        textContainer.appendChild(skuText);
      }

      // Title text
      if (templateInfo.contentInclusion?.title !== false) {
        const titleText = document.createElement('div');
        titleText.className = 'preview-title';
        titleText.textContent = sampleData.title.length > 50 ?
          sampleData.title.substring(0, 47) + '...' : sampleData.title;
        titleText.style.fontSize = `${currentTitleFontSize}px`;
        textContainer.appendChild(titleText);
      }

      previewContent.appendChild(textContainer);

      // Add quantity controls at bottom
      const controlsBottom = document.createElement('div');
      controlsBottom.className = 'preview-controls-bottom';
      controlsBottom.style.cssText = 'display: flex; justify-content: center; align-items: center; margin-top: 8px; gap: 8px;';

      const quantityLabel = document.createElement('label');
      quantityLabel.textContent = 'Qty:';
      quantityLabel.style.cssText = 'font-size: 11px; color: #666;';

      const quantityInput = document.createElement('input');
      quantityInput.type = 'number';
      quantityInput.id = 'preview-quantity';
      quantityInput.min = '1';
      quantityInput.max = '1000';
      quantityInput.value = '1';
      quantityInput.style.cssText = 'width: 60px; padding: 2px 4px; font-size: 11px; border: 1px solid #ddd; border-radius: 3px;';

      controlsBottom.appendChild(quantityLabel);
      controlsBottom.appendChild(quantityInput);

      // Assemble the complete preview
      previewWrapper.appendChild(controlsTop);
      previewWrapper.appendChild(previewContent);
      previewWrapper.appendChild(controlsBottom);

      previewContainer.innerHTML = '';
      previewContainer.appendChild(previewWrapper);

    } catch (error) {
      console.error('Preview generation error:', error);
      previewContainer.innerHTML = '<div class="preview-error">Failed to generate preview</div>';
    }
  }

  /**
   * Get persistent sample data
   */
  async getSampleData() {
    try {
      const stored = await chrome.storage.local.get(['sampleData']);
      return stored.sampleData || {
        sku: 'SAMPLE-SKU',
        fnsku: 'X002SAMPLE',
        asin: 'B0SAMPLE1',
        title: 'Sample Product Title for Preview'
      };
    } catch (error) {
      console.error('Failed to get sample data:', error);
      return {
        sku: 'SAMPLE-SKU',
        fnsku: 'X002SAMPLE',
        asin: 'B0SAMPLE1',
        title: 'Sample Product Title for Preview'
      };
    }
  }

  /**
   * Save sample data
   */
  async setSampleData(data) {
    try {
      await chrome.storage.local.set({ sampleData: data });
    } catch (error) {
      console.error('Failed to save sample data:', error);
    }
  }

  /**
   * Open sample data editor modal
   */
  async openSampleDataEditor() {
    try {
      const currentData = await this.getSampleData();

      // Create modal
      const modal = document.createElement('div');
      modal.className = 'sample-data-modal';
      modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      `;

      const modalContent = document.createElement('div');
      modalContent.style.cssText = `
        background: white;
        padding: 20px;
        border-radius: 8px;
        width: 300px;
        max-width: 90vw;
      `;

      modalContent.innerHTML = `
        <h3 style="margin: 0 0 16px 0; font-size: 16px;">Edit Sample Data</h3>
        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 4px; font-size: 12px; font-weight: 500;">SKU *</label>
          <input type="text" id="sample-sku" value="${currentData.sku}" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
        </div>
        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 4px; font-size: 12px; font-weight: 500;">FNSKU *</label>
          <input type="text" id="sample-fnsku" value="${currentData.fnsku}" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;" pattern="^[A-Z0-9]{10}$">
        </div>
        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 4px; font-size: 12px; font-weight: 500;">ASIN</label>
          <input type="text" id="sample-asin" value="${currentData.asin}" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;" pattern="^B[0-9A-Z]{9}$">
        </div>
        <div style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 4px; font-size: 12px; font-weight: 500;">Product Title</label>
          <input type="text" id="sample-title" value="${currentData.title}" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
        </div>
        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button id="sample-cancel" style="padding: 6px 12px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">Cancel</button>
          <button id="sample-save" style="padding: 6px 12px; border: 1px solid #007bff; background: #007bff; color: white; border-radius: 4px; cursor: pointer;">Save</button>
        </div>
      `;

      modal.appendChild(modalContent);
      document.body.appendChild(modal);

      // Event handlers
      document.getElementById('sample-cancel').addEventListener('click', () => {
        modal.remove();
      });

      document.getElementById('sample-save').addEventListener('click', async () => {
        const newData = {
          sku: document.getElementById('sample-sku').value.trim(),
          fnsku: document.getElementById('sample-fnsku').value.trim().toUpperCase(),
          asin: document.getElementById('sample-asin').value.trim().toUpperCase(),
          title: document.getElementById('sample-title').value.trim()
        };

        // Basic validation
        if (!newData.sku || !newData.fnsku) {
          alert('SKU and FNSKU are required');
          return;
        }

        if (newData.fnsku.length !== 10) {
          alert('FNSKU must be 10 characters');
          return;
        }

        await this.setSampleData(newData);
        await this.updatePreview();
        modal.remove();
        this.showSuccess('Sample data updated');
      });

      // Close on backdrop click
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.remove();
        }
      });

    } catch (error) {
      console.error('Failed to open sample data editor:', error);
      this.showError('Failed to open editor');
    }
  }

  /**
   * Download PDF from preview
   */
  async downloadFromPreview() {
    try {
      const sampleData = await this.getSampleData();
      const quantityInput = document.getElementById('preview-quantity');
      const quantity = parseInt(quantityInput?.value) || 1;

      // Get selected template ID
      const templateId = await this.settingsManager.getSelectedTemplateId() || 'thermal_57x32';

      // Generate PDF
      const pdfBlob = await this.pdfGenerator.generateLabel(sampleData, templateId, quantity);

      // Download
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sampleData.sku}_label.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Add to download history
      await this.addToDownloadHistory({
        sku: sampleData.sku,
        fnsku: sampleData.fnsku,
        asin: sampleData.asin,
        title: sampleData.title,
        quantity: quantity,
        timestamp: new Date().toISOString()
      });

      this.showSuccess(`✅ Generated ${quantity} label(s) for ${sampleData.sku}`);

    } catch (error) {
      console.error('Failed to download from preview:', error);
      this.showError('Failed to generate PDF: ' + error.message);
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
      await this.settingsManager.resetToDefaults();
      this.currentSettings = await this.settingsManager.getSettings();
      await this.populateSettingsPanel();
      this.updatePreview();
      this.showSuccess('Settings reset to defaults');
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
      url: 'https://github.com/prykris/amazon-smart-label-ext/wiki/user-guide'
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
    const issueUrl = 'https://github.com/prykris/amazon-smart-label-ext/issues/new?' +
      'template=bug_report.md&' +
      `title=Bug Report&` +
      `body=**Extension Version:** 1.0.0%0A` +
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
      url: 'https://github.com/prykris/amazon-smart-label-ext/blob/main/PRIVACY.md'
    });
  }

  /**
   * Open support page
   */
  openSupport() {
    chrome.tabs.create({
      url: 'https://github.com/prykris/amazon-smart-label-ext/discussions'
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
    if (!downloadsList) return;

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
   * Create a simple template with just a name prompt
   */
  async createSimpleTemplate() {
    try {
      const templateName = prompt('Enter template name:');
      if (!templateName || !templateName.trim()) {
        return;
      }

      // Use sensible defaults instead of reading from UI inputs
      const width = 57;
      const height = 32;
      const units = 'mm';

      // Create template with defaults
      const templateData = {
        name: templateName.trim(),
        baseName: templateName.trim(),
        width: width,
        height: height,
        units: units,
        orientation: width > height ? 'landscape' : 'portrait',
        contentInclusion: {
          barcode: true,
          fnsku: true,
          sku: true,
          title: true,
          images: false
        },
        elements: this.generateBasicElements(width, height)
      };

      // Create the template
      const savedTemplate = await this.templateManager.createTemplate(templateData);

      // Set as selected template
      await this.settingsManager.setSelectedTemplateId(savedTemplate.id);

      // Update current settings cache
      this.currentSettings = await this.settingsManager.getSettings();

      // Update UI
      await this.loadTemplates();
      await this.updateTemplateUI();
      await this.updatePreview();

      this.showSuccess(`Template "${templateName}" created and selected!`);

    } catch (error) {
      console.error('Failed to create simple template:', error);
      this.showError('Failed to create template: ' + error.message);
    }
  }

  /**
   * Generate basic element positioning for a template
   * @param {number} width - Template width
   * @param {number} height - Template height
   * @returns {Object} Elements configuration
   */
  generateBasicElements(width, height) {
    const centerX = width / 2;

    return {
      barcode: { x: width * 0.1, y: height * 0.1, width: width * 0.8, height: height * 0.4 },
      fnsku: { x: centerX, y: height * 0.6, fontSize: 8, align: 'center', bold: false },
      sku: { x: centerX, y: height * 0.75, fontSize: 10, align: 'center', bold: true },
      title: { x: centerX, y: height * 0.9, fontSize: 6, align: 'center', maxLength: 50 }
    };
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