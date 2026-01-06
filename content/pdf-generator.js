/**
 * PDF Label Generator
 * Handles PDF creation with multiple label templates and barcode generation
 */

class PDFLabelGenerator {
  constructor(templateManager = null) {
    this.templateManager = templateManager;
    this.defaultSettings = {
      barcodeFormat: 'CODE128',
      includeImage: false,
      margin: 2
    };
  }

  /**
   * Set template manager instance
   * @param {TemplateManager} templateManager - Template manager instance
   */
  setTemplateManager(templateManager) {
    this.templateManager = templateManager;
  }

  /**
   * Ensure template manager is available
   */
  async ensureTemplateManager() {
    if (!this.templateManager) {
      // Create a new instance if not provided
      this.templateManager = new TemplateManager();
      await this.templateManager.init();
    }
  }

  /**
   * Generate PDF labels
   * @param {Object} productData - Product data from extractor
   * @param {number} quantity - Number of labels to generate
   * @param {Object} settings - Label generation settings
   * @returns {Promise<Blob>} PDF blob
   */
  async generateLabels(productData, quantity = 1, settings = {}) {
    await this.ensureTemplateManager();
    
    const config = { ...this.defaultSettings, ...settings };
    
    // Get template from template manager
    let template;
    if (settings.templateId) {
      template = await this.templateManager.getTemplate(settings.templateId);
    } else if (settings.template) {
      // Support legacy template object
      template = settings.template;
    } else {
      // Use default template
      template = await this.templateManager.getTemplate('thermal_57x32');
    }

    if (!template) {
      throw new Error('Template not found');
    }

    // Validate required data
    if (!productData.fnsku) {
      throw new Error('FNSKU is required for label generation');
    }

    // Initialize jsPDF
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: template.orientation,
      unit: 'mm',
      format: [template.width, template.height]
    });

    // Generate barcode
    const barcodeDataURL = await this.generateBarcode(productData.fnsku, config.barcodeFormat);

    // Generate labels
    for (let i = 0; i < quantity; i++) {
      if (i > 0) {
        doc.addPage();
      }

      await this.renderLabel(doc, template, productData, barcodeDataURL, config);
    }

    return doc;
  }

  /**
   * Generate a single label (convenience method)
   * @param {Object} productData - Product data from extractor
   * @param {string} templateId - Template ID to use
   * @param {number} quantity - Number of labels to generate
   * @returns {Promise<Blob>} PDF blob
   */
  async generateLabel(productData, templateId, quantity = 1) {
    const doc = await this.generateLabels(productData, quantity, { templateId });
    return doc.output('blob');
  }

  /**
   * Render a single label on the PDF
   * @param {jsPDF} doc - PDF document
   * @param {Object} template - Label template
   * @param {Object} productData - Product data
   * @param {string} barcodeDataURL - Barcode image data URL
   * @param {Object} config - Generation config
   */
  async renderLabel(doc, template, productData, barcodeDataURL, config) {
    const elements = template.elements;
    const contentInclusion = config.contentInclusion || template.contentInclusion || {};

    // Render barcode
    if (elements.barcode && barcodeDataURL && contentInclusion.barcode !== false) {
      doc.addImage(
        barcodeDataURL,
        'PNG',
        elements.barcode.x,
        elements.barcode.y,
        elements.barcode.width,
        elements.barcode.height
      );
    }

    // Render FNSKU
    if (elements.fnsku && contentInclusion.fnsku !== false) {
      const fnskuElement = { ...elements.fnsku };
      if (config.fontSize && config.fontSize.fnsku) {
        fnskuElement.fontSize = config.fontSize.fnsku;
      }
      this.renderText(doc, productData.fnsku, fnskuElement);
    }

    // Render SKU
    if (elements.sku && productData.sku && contentInclusion.sku !== false) {
      const skuElement = { ...elements.sku };
      if (config.fontSize && config.fontSize.sku) {
        skuElement.fontSize = config.fontSize.sku;
      }
      const skuText = `SKU: ${productData.sku}`;
      this.renderText(doc, skuText, skuElement);
    }

    // Render title
    if (elements.title && productData.title && contentInclusion.title !== false) {
      const titleElement = { ...elements.title };
      if (config.fontSize && config.fontSize.title) {
        titleElement.fontSize = config.fontSize.title;
      }
      const titleText = this.truncateText(productData.title, titleElement.maxLength || 50);
      this.renderText(doc, titleText, titleElement);
    }

    // Render product image (if enabled and available)
    if (elements.image && contentInclusion.images && productData.image) {
      try {
        const imageData = await this.loadImage(productData.image);
        doc.addImage(
          imageData,
          'JPEG',
          elements.image.x,
          elements.image.y,
          elements.image.width,
          elements.image.height
        );
      } catch (error) {
        console.warn('Failed to load product image:', error);
      }
    }
  }

  /**
   * Render text element on PDF
   * @param {jsPDF} doc - PDF document
   * @param {string} text - Text to render
   * @param {Object} element - Element configuration
   */
  renderText(doc, text, element) {
    // Set font properties
    doc.setFont('helvetica', element.bold ? 'bold' : 'normal');
    doc.setFontSize(element.fontSize);

    // Auto-scale font if text is too long
    const textWidth = doc.getTextWidth(text);
    const maxWidth = element.maxWidth || 45; // Default max width

    if (textWidth > maxWidth) {
      const scaleFactor = maxWidth / textWidth;
      doc.setFontSize(element.fontSize * scaleFactor);
    }

    // Render text
    doc.text(text, element.x, element.y, { align: element.align || 'left' });
  }

  /**
   * Generate barcode image
   * @param {string} data - Data to encode
   * @param {string} format - Barcode format
   * @returns {Promise<string>} Data URL of barcode image
   */
  async generateBarcode(data, format = 'CODE128') {
    return new Promise((resolve, reject) => {
      try {
        const canvas = document.createElement('canvas');

        // Configure barcode options
        const options = {
          format: format,
          displayValue: false,
          margin: 0,
          background: '#ffffff',
          lineColor: '#000000',
          width: 2,
          height: 100
        };

        // Generate barcode
        JsBarcode(canvas, data, options);

        // Convert to data URL
        const dataURL = canvas.toDataURL('image/png');
        resolve(dataURL);
      } catch (error) {
        reject(new Error(`Failed to generate barcode: ${error.message}`));
      }
    });
  }

  /**
   * Load image from URL and convert to data URL
   * @param {string} imageUrl - Image URL
   * @returns {Promise<string>} Image data URL
   */
  async loadImage(imageUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = img.width;
        canvas.height = img.height;

        ctx.drawImage(img, 0, 0);

        try {
          const dataURL = canvas.toDataURL('image/jpeg', 0.8);
          resolve(dataURL);
        } catch (error) {
          reject(new Error('Failed to convert image to data URL'));
        }
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      img.src = imageUrl;
    });
  }

  /**
   * Truncate text to specified length
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Maximum length
   * @returns {string} Truncated text
   */
  truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) {
      return text;
    }

    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Save PDF to file
   * @param {jsPDF} doc - PDF document
   * @param {string} filename - Filename
   */
  savePDF(doc, filename) {
    doc.save(filename);
  }

  /**
   * Open PDF in new tab
   * @param {jsPDF} doc - PDF document
   */
  openPDFInNewTab(doc) {
    const pdfBlob = doc.output('blob');
    const url = URL.createObjectURL(pdfBlob);
    window.open(url, '_blank');
  }

  /**
   * Get available templates (delegate to template manager)
   * @returns {Array} Available templates
   */
  async getTemplates() {
    await this.ensureTemplateManager();
    return await this.templateManager.getAllTemplates();
  }

  /**
   * Get template by ID (delegate to template manager)
   * @param {string} templateId - Template ID
   * @returns {Object|null} Template or null if not found
   */
  async getTemplateById(templateId) {
    await this.ensureTemplateManager();
    return await this.templateManager.getTemplate(templateId);
  }

  /**
   * Create template (delegate to template manager)
   * @param {Object} templateData - Template data
   * @returns {Object} Created template
   */
  async createTemplate(templateData) {
    await this.ensureTemplateManager();
    return await this.templateManager.createTemplate(templateData);
  }

  /**
   * Update template (delegate to template manager)
   * @param {string} templateId - Template ID
   * @param {Object} templateData - Updated template data
   * @returns {Object} Updated template
   */
  async updateTemplate(templateId, templateData) {
    await this.ensureTemplateManager();
    return await this.templateManager.updateTemplate(templateId, templateData);
  }

  /**
   * Delete template (delegate to template manager)
   * @param {string} templateId - Template ID
   * @returns {boolean} True if deleted successfully
   */
  async deleteTemplate(templateId) {
    await this.ensureTemplateManager();
    return await this.templateManager.deleteTemplate(templateId);
  }

  /**
   * Validate template (delegate to template manager)
   * @param {Object} template - Template to validate
   * @returns {Object} Validation result
   */
  validateTemplate(template) {
    if (this.templateManager) {
      return this.templateManager.validateTemplate(template);
    }
    
    // Fallback basic validation
    return {
      isValid: !!(template.width && template.height && template.elements),
      errors: template.width && template.height && template.elements ? [] : ['Invalid template structure']
    };
  }
}

// Export for use in other modules
window.PDFLabelGenerator = PDFLabelGenerator;