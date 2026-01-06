/**
 * Template Editor Module
 * Handles template creation and editing functionality
 */

class TemplateEditor {
  constructor(templateManager, settingsManager) {
    this.templateManager = templateManager;
    this.settingsManager = settingsManager;
    this.currentModal = null;
  }

  /**
   * Open template editor modal
   * @param {boolean} isNew - Whether creating a new template
   * @param {Function} onSuccess - Callback for successful save
   */
  async open(isNew, onSuccess = null) {
    try {
      this.currentModal = await this.createModal(isNew);
      document.body.appendChild(this.currentModal);

      if (!isNew) {
        const selectedTemplate = await this.getSelectedTemplate();
        if (selectedTemplate) {
          this.populateEditor(selectedTemplate);
        }
      }

      this.onSuccess = onSuccess;
    } catch (error) {
      console.error('Failed to open template editor:', error);
      throw error;
    }
  }

  /**
   * Create template editor modal
   * @param {boolean} isNew - Whether creating a new template
   * @returns {HTMLElement} Modal element
   */
  async createModal(isNew) {
    const modal = document.createElement('div');
    modal.className = 'template-editor-modal';
    modal.innerHTML = `
      <div class="template-editor-overlay"></div>
      <div class="template-editor-content">
        <div class="template-editor-header">
          <h3>${isNew ? 'Create New Template' : 'Edit Template'}</h3>
          <button class="template-editor-close" type="button">&times;</button>
        </div>
        <div class="template-editor-body">
          <div class="editor-section">
            <h4>Template Info</h4>
            <div class="editor-field">
              <label>Template Name</label>
              <input type="text" id="template-name" class="editor-input" placeholder="Enter template name">
            </div>
          </div>
          
          <div class="editor-section">
            <h4>Label Dimensions</h4>
            <div class="editor-row">
              <div class="editor-field">
                <label>Width (mm)</label>
                <input type="number" id="template-width" class="editor-input" min="10" max="200" step="0.1" value="57">
              </div>
              <div class="editor-field">
                <label>Height (mm)</label>
                <input type="number" id="template-height" class="editor-input" min="10" max="200" step="0.1" value="32">
              </div>
            </div>
          </div>

          <div class="editor-section">
            <h4>Content Inclusion</h4>
            <div class="editor-row">
              <div class="editor-field">
                <label><input type="checkbox" id="template-include-barcode" checked> Include Barcode</label>
              </div>
              <div class="editor-field">
                <label><input type="checkbox" id="template-include-fnsku" checked> Include FNSKU</label>
              </div>
            </div>
            <div class="editor-row">
              <div class="editor-field">
                <label><input type="checkbox" id="template-include-sku" checked> Include SKU</label>
              </div>
              <div class="editor-field">
                <label><input type="checkbox" id="template-include-title" checked> Include Title</label>
              </div>
            </div>
            <div class="editor-row">
              <div class="editor-field">
                <label><input type="checkbox" id="template-include-images"> Include Images</label>
              </div>
            </div>
          </div>
        </div>
        <div class="template-editor-footer">
          ${!isNew ? '<button class="delete-template-btn" type="button">Delete Template</button>' : ''}
          <button class="btn btn-secondary" type="button" id="template-cancel">Cancel</button>
          <button class="btn btn-primary" type="button" id="template-save">Save Template</button>
        </div>
      </div>
    `;

    this.setupEventListeners(modal, isNew);
    return modal;
  }

  /**
   * Setup event listeners for the modal
   * @param {HTMLElement} modal - Modal element
   * @param {boolean} isNew - Whether creating new template
   */
  setupEventListeners(modal, isNew) {
    // Close button
    modal.querySelector('.template-editor-close').addEventListener('click', () => {
      this.close();
    });

    // Cancel button
    modal.querySelector('#template-cancel').addEventListener('click', () => {
      this.close();
    });

    // Save button
    modal.querySelector('#template-save').addEventListener('click', () => {
      this.save(isNew);
    });

    // Delete button (if editing)
    const deleteBtn = modal.querySelector('.delete-template-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        this.delete();
      });
    }

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal.querySelector('.template-editor-overlay')) {
        this.close();
      }
    });
  }

  /**
   * Populate editor with existing template data
   * @param {Object} template - Template data
   */
  populateEditor(template) {
    if (!this.currentModal) return;

    this.currentModal.querySelector('#template-name').value = template.name;
    this.currentModal.querySelector('#template-width').value = template.width;
    this.currentModal.querySelector('#template-height').value = template.height;

    this.currentModal.querySelector('#template-include-barcode').checked = template.contentInclusion?.barcode !== false;
    this.currentModal.querySelector('#template-include-fnsku').checked = template.contentInclusion?.fnsku !== false;
    this.currentModal.querySelector('#template-include-sku').checked = template.contentInclusion?.sku !== false;
    this.currentModal.querySelector('#template-include-title').checked = template.contentInclusion?.title !== false;
    this.currentModal.querySelector('#template-include-images').checked = template.contentInclusion?.images !== false;
  }

  /**
   * Save template
   * @param {boolean} isNew - Whether creating new template
   */
  async save(isNew) {
    try {
      const name = this.currentModal.querySelector('#template-name').value.trim();
      if (!name) {
        this.showError('Please enter a template name');
        return;
      }

      const width = parseFloat(this.currentModal.querySelector('#template-width').value);
      const height = parseFloat(this.currentModal.querySelector('#template-height').value);

      const templateData = {
        name: name,
        width: width,
        height: height,
        orientation: width > height ? 'landscape' : 'portrait',
        contentInclusion: {
          barcode: this.currentModal.querySelector('#template-include-barcode').checked,
          fnsku: this.currentModal.querySelector('#template-include-fnsku').checked,
          sku: this.currentModal.querySelector('#template-include-sku').checked,
          title: this.currentModal.querySelector('#template-include-title').checked,
          images: this.currentModal.querySelector('#template-include-images').checked
        },
        elements: this.generateBasicElements(width, height)
      };

      let savedTemplate;
      if (isNew) {
        savedTemplate = await this.templateManager.createTemplate(templateData);
      } else {
        const selectedTemplate = await this.getSelectedTemplate();
        if (selectedTemplate && selectedTemplate.userCreated) {
          savedTemplate = await this.templateManager.updateTemplate(selectedTemplate.id, templateData);
        } else {
          this.showError('Cannot edit built-in templates');
          return;
        }
      }

      // Set as selected template
      await this.settingsManager.setSelectedTemplateId(savedTemplate.id);

      this.close();
      
      if (this.onSuccess) {
        this.onSuccess(savedTemplate);
      }

      this.showSuccess(isNew ? 'Template created successfully!' : 'Template updated successfully!');

    } catch (error) {
      console.error('Failed to save template:', error);
      this.showError('Failed to save template: ' + error.message);
    }
  }

  /**
   * Delete template
   */
  async delete() {
    try {
      const selectedTemplate = await this.getSelectedTemplate();
      if (!selectedTemplate || !selectedTemplate.userCreated) {
        this.showError('Cannot delete built-in templates');
        return;
      }

      if (!confirm(`Are you sure you want to delete the template "${selectedTemplate.name}"?`)) {
        return;
      }

      await this.templateManager.deleteTemplate(selectedTemplate.id);
      
      // Switch to default template
      await this.settingsManager.setSelectedTemplateId('thermal_57x32');

      this.close();
      
      if (this.onSuccess) {
        this.onSuccess(null);
      }

      this.showSuccess('Template deleted successfully!');

    } catch (error) {
      console.error('Failed to delete template:', error);
      this.showError('Failed to delete template: ' + error.message);
    }
  }

  /**
   * Close the modal
   */
  close() {
    if (this.currentModal) {
      this.currentModal.remove();
      this.currentModal = null;
    }
  }

  /**
   * Get selected template
   * @returns {Object|null} Selected template
   */
  async getSelectedTemplate() {
    try {
      const templateId = await this.settingsManager.getSelectedTemplateId();
      return await this.templateManager.getTemplate(templateId);
    } catch (error) {
      console.error('Failed to get selected template:', error);
      return null;
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

  /**
   * Show success message
   * @param {string} message - Success message
   */
  showSuccess(message) {
    // Create a simple notification
    const notification = document.createElement('div');
    notification.className = 'template-editor-notification success';
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #d4edda;
      color: #155724;
      padding: 12px 16px;
      border-radius: 4px;
      border: 1px solid #c3e6cb;
      z-index: 10001;
      font-size: 14px;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  /**
   * Show error message
   * @param {string} message - Error message
   */
  showError(message) {
    // Create a simple notification
    const notification = document.createElement('div');
    notification.className = 'template-editor-notification error';
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #f8d7da;
      color: #721c24;
      padding: 12px 16px;
      border-radius: 4px;
      border: 1px solid #f5c6cb;
      z-index: 10001;
      font-size: 14px;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 5000);
  }
}

// Export for use in other modules
window.TemplateEditor = TemplateEditor;