/**
 * Template Manager
 * Centralized template management service for the Amazon FNSKU Extension
 */

class TemplateManager {
  constructor() {
    this.builtInTemplates = {
      thermal_57x32: {
        id: 'thermal_57x32',
        name: 'Thermal',
        baseName: 'Thermal',
        userCreated: false,
        width: 57,
        height: 32,
        units: 'mm',
        orientation: 'landscape',
        elements: {
          barcode: { x: 4, y: 2, width: 49, height: 12 },
          fnsku: { x: 28.5, y: 17, fontSize: 8, align: 'center', bold: false },
          sku: { x: 28.5, y: 22, fontSize: 11, align: 'center', bold: true },
          title: { x: 28.5, y: 26, fontSize: 6, align: 'center', maxLength: 50 }
        },
        contentInclusion: {
          barcode: true,
          fnsku: true,
          sku: true,
          title: true,
          images: false
        },
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z'
      },
      
      thermal_57x32_minimal: {
        id: 'thermal_57x32_minimal',
        name: 'Thermal Minimal',
        baseName: 'Thermal Minimal',
        userCreated: false,
        width: 57,
        height: 32,
        units: 'mm',
        orientation: 'landscape',
        elements: {
          barcode: { x: 4, y: 4, width: 49, height: 16 },
          fnsku: { x: 28.5, y: 24, fontSize: 10, align: 'center', bold: true }
        },
        contentInclusion: {
          barcode: true,
          fnsku: true,
          sku: false,
          title: false,
          images: false
        },
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z'
      },

      shipping_4x6: {
        id: 'shipping_4x6',
        name: 'Shipping',
        baseName: 'Shipping',
        userCreated: false,
        width: 4,
        height: 6,
        units: 'in',
        orientation: 'portrait',
        elements: {
          barcode: { x: 10, y: 20, width: 81.6, height: 20 },
          fnsku: { x: 50.8, y: 50, fontSize: 12, align: 'center', bold: false },
          sku: { x: 50.8, y: 70, fontSize: 16, align: 'center', bold: true },
          title: { x: 50.8, y: 90, fontSize: 10, align: 'center', maxLength: 80 },
          image: { x: 10, y: 100, width: 30, height: 30 }
        },
        contentInclusion: {
          barcode: true,
          fnsku: true,
          sku: true,
          title: true,
          images: true
        },
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z'
      }
    };

    this.userTemplates = {};
    this.eventListeners = new Map();
    this.initialized = false;
  }

  /**
   * Initialize the template manager
   */
  async init() {
    if (this.initialized) return;
    
    try {
      await this.loadUserTemplates();
      this.initialized = true;
      this.emit('initialized');
    } catch (error) {
      console.error('Failed to initialize TemplateManager:', error);
      throw error;
    }
  }

  /**
   * Generate dynamic template name with dimensions
   * @param {Object} template - Template object
   * @returns {string} Dynamic template name
   */
  generateDynamicName(template) {
    const baseName = template.baseName || template.name || 'Template';
    const width = template.width || 0;
    const height = template.height || 0;
    const units = template.units || 'mm';
    
    return `${baseName} ${width}×${height}${units}`;
  }

  /**
   * Get all templates (built-in + user-created) with dynamic names
   * @returns {Array} Array of all templates
   */
  async getAllTemplates() {
    await this.ensureInitialized();
    
    const builtInList = Object.values(this.builtInTemplates).map(template => ({
      ...template,
      displayName: this.generateDynamicName(template)
    }));
    
    const userList = Object.values(this.userTemplates).map(template => ({
      ...template,
      displayName: this.generateDynamicName(template)
    }));
    
    return [...builtInList, ...userList];
  }

  /**
   * Get template by ID
   * @param {string} templateId - Template ID
   * @returns {Object|null} Template object or null if not found
   */
  async getTemplate(templateId) {
    await this.ensureInitialized();
    
    // Check built-in templates first
    if (this.builtInTemplates[templateId]) {
      return { ...this.builtInTemplates[templateId] };
    }
    
    // Check user templates
    if (this.userTemplates[templateId]) {
      return { ...this.userTemplates[templateId] };
    }
    
    return null;
  }

  /**
   * Create a new user template
   * @param {Object} templateData - Template data
   * @returns {Object} Created template
   */
  async createTemplate(templateData) {
    await this.ensureInitialized();
    
    // Validate template data
    const validation = this.validateTemplate(templateData);
    if (!validation.isValid) {
      throw new Error(`Template validation failed: ${validation.errors.join(', ')}`);
    }

    // Generate unique ID
    const templateId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const template = {
      id: templateId,
      userCreated: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...templateData
    };

    // Add to user templates
    this.userTemplates[templateId] = template;
    
    // Save to storage
    await this.saveUserTemplates();
    
    // Emit event
    this.emit('templateCreated', template);
    
    return { ...template };
  }

  /**
   * Update an existing user template
   * @param {string} templateId - Template ID
   * @param {Object} templateData - Updated template data
   * @returns {Object} Updated template
   */
  async updateTemplate(templateId, templateData) {
    await this.ensureInitialized();
    
    // Check if template exists and is user-created
    if (!this.userTemplates[templateId]) {
      throw new Error('Template not found or cannot be modified');
    }

    // Validate template data
    const validation = this.validateTemplate(templateData);
    if (!validation.isValid) {
      throw new Error(`Template validation failed: ${validation.errors.join(', ')}`);
    }

    // Update template
    const updatedTemplate = {
      ...this.userTemplates[templateId],
      ...templateData,
      id: templateId, // Ensure ID doesn't change
      userCreated: true, // Ensure this stays true
      updatedAt: new Date().toISOString()
    };

    this.userTemplates[templateId] = updatedTemplate;
    
    // Save to storage
    await this.saveUserTemplates();
    
    // Emit event
    this.emit('templateUpdated', updatedTemplate);
    
    return { ...updatedTemplate };
  }

  /**
   * Delete a user template
   * @param {string} templateId - Template ID
   * @returns {boolean} True if deleted successfully
   */
  async deleteTemplate(templateId) {
    await this.ensureInitialized();
    
    // Check if template exists and is user-created
    if (!this.userTemplates[templateId]) {
      throw new Error('Template not found or cannot be deleted');
    }

    const template = { ...this.userTemplates[templateId] };
    delete this.userTemplates[templateId];
    
    // Save to storage
    await this.saveUserTemplates();
    
    // Emit event
    this.emit('templateDeleted', template);
    
    return true;
  }

  /**
   * Validate template data
   * @param {Object} template - Template to validate
   * @returns {Object} Validation result
   */
  validateTemplate(template) {
    const validation = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // Required fields
    if (!template.name || typeof template.name !== 'string' || template.name.trim().length === 0) {
      validation.errors.push('Template name is required');
      validation.isValid = false;
    }

    if (!template.width || typeof template.width !== 'number' || template.width <= 0) {
      validation.errors.push('Template width must be a positive number');
      validation.isValid = false;
    }

    if (!template.height || typeof template.height !== 'number' || template.height <= 0) {
      validation.errors.push('Template height must be a positive number');
      validation.isValid = false;
    }

    if (!template.orientation || !['portrait', 'landscape'].includes(template.orientation)) {
      validation.errors.push('Template orientation must be "portrait" or "landscape"');
      validation.isValid = false;
    }

    // Elements validation
    if (!template.elements || typeof template.elements !== 'object') {
      validation.errors.push('Template elements are required');
      validation.isValid = false;
    } else {
      // At least barcode or fnsku should be present
      if (!template.elements.barcode && !template.elements.fnsku) {
        validation.errors.push('Template must include at least barcode or FNSKU element');
        validation.isValid = false;
      }

      // Validate element positions
      Object.entries(template.elements).forEach(([elementName, element]) => {
        if (typeof element !== 'object') {
          validation.errors.push(`Element ${elementName} must be an object`);
          validation.isValid = false;
          return;
        }

        if (typeof element.x !== 'number' || element.x < 0) {
          validation.errors.push(`Element ${elementName} x position must be a non-negative number`);
          validation.isValid = false;
        }

        if (typeof element.y !== 'number' || element.y < 0) {
          validation.errors.push(`Element ${elementName} y position must be a non-negative number`);
          validation.isValid = false;
        }

        // Validate element-specific properties
        if (['barcode', 'image'].includes(elementName)) {
          if (typeof element.width !== 'number' || element.width <= 0) {
            validation.errors.push(`Element ${elementName} width must be a positive number`);
            validation.isValid = false;
          }
          if (typeof element.height !== 'number' || element.height <= 0) {
            validation.errors.push(`Element ${elementName} height must be a positive number`);
            validation.isValid = false;
          }
        }

        if (['fnsku', 'sku', 'title'].includes(elementName)) {
          if (typeof element.fontSize !== 'number' || element.fontSize <= 0) {
            validation.errors.push(`Element ${elementName} fontSize must be a positive number`);
            validation.isValid = false;
          }
        }
      });
    }

    // Content inclusion validation
    if (!template.contentInclusion || typeof template.contentInclusion !== 'object') {
      validation.errors.push('Template contentInclusion is required');
      validation.isValid = false;
    }

    // Warnings for best practices
    if (template.width > 300 || template.height > 300) {
      validation.warnings.push('Large template dimensions may cause printing issues');
    }

    if (template.name.length > 50) {
      validation.warnings.push('Template name is very long');
    }

    return validation;
  }

  /**
   * Load user templates from storage
   */
  async loadUserTemplates() {
    try {
      const result = await chrome.storage.sync.get(['fnsku_user_templates']);
      this.userTemplates = result.fnsku_user_templates || {};
    } catch (error) {
      console.error('Failed to load user templates:', error);
      this.userTemplates = {};
    }
  }

  /**
   * Save user templates to storage
   */
  async saveUserTemplates() {
    try {
      await chrome.storage.sync.set({
        fnsku_user_templates: this.userTemplates
      });
    } catch (error) {
      console.error('Failed to save user templates:', error);
      throw error;
    }
  }

  /**
   * Get built-in templates only
   * @returns {Array} Array of built-in templates
   */
  getBuiltInTemplates() {
    return Object.values(this.builtInTemplates);
  }

  /**
   * Get user templates only
   * @returns {Array} Array of user templates
   */
  async getUserTemplates() {
    await this.ensureInitialized();
    return Object.values(this.userTemplates);
  }

  /**
   * Check if template is built-in
   * @param {string} templateId - Template ID
   * @returns {boolean} True if built-in template
   */
  isBuiltInTemplate(templateId) {
    return !!this.builtInTemplates[templateId];
  }

  /**
   * Ensure manager is initialized
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.init();
    }
  }

  /**
   * Add event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  off(event, callback) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit event
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Clear all user templates (for testing/reset)
   */
  async clearUserTemplates() {
    await this.ensureInitialized();
    
    const deletedTemplates = { ...this.userTemplates };
    this.userTemplates = {};
    
    await this.saveUserTemplates();
    
    this.emit('templatesCleared', deletedTemplates);
    
    return true;
  }

  /**
   * Export template for sharing
   * @param {string} templateId - Template ID
   * @returns {Object} Exportable template data
   */
  async exportTemplate(templateId) {
    const template = await this.getTemplate(templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    // Remove internal fields for export
    const exportData = { ...template };
    delete exportData.id;
    delete exportData.createdAt;
    delete exportData.updatedAt;
    
    return exportData;
  }

  /**
   * Import template from external data
   * @param {Object} templateData - Template data to import
   * @returns {Object} Imported template
   */
  async importTemplate(templateData) {
    // Add import metadata
    const importData = {
      ...templateData,
      name: `${templateData.name} (Imported)`,
      userCreated: true
    };

    return await this.createTemplate(importData);
  }
}

// Export for use in other modules
window.TemplateManager = TemplateManager;