/**
 * PDF Label Generator
 * Handles PDF creation with multiple label templates and barcode generation
 */

class PDFLabelGenerator {
  constructor() {
    this.defaultSettings = {
      template: 'thermal_57x32',
      barcodeFormat: 'CODE128',
      fontSize: {
        fnsku: 8,
        sku: 11,
        title: 6
      },
      includeImage: false,
      margin: 2
    };

    this.templates = {
      thermal_57x32: {
        name: 'Thermal 57x32mm',
        width: 57,
        height: 32,
        orientation: 'landscape',
        elements: {
          barcode: { x: 4, y: 2, width: 49, height: 12 },
          fnsku: { x: 28.5, y: 17, fontSize: 8, align: 'center', bold: false },
          sku: { x: 28.5, y: 22, fontSize: 11, align: 'center', bold: true },
          title: { x: 28.5, y: 26, fontSize: 6, align: 'center', maxLength: 50 }
        }
      },
      
      thermal_57x32_minimal: {
        name: 'Thermal 57x32mm (Minimal)',
        width: 57,
        height: 32,
        orientation: 'landscape',
        elements: {
          barcode: { x: 4, y: 4, width: 49, height: 16 },
          fnsku: { x: 28.5, y: 24, fontSize: 10, align: 'center', bold: true }
        }
      },

      shipping_4x6: {
        name: 'Shipping 4"x6"',
        width: 101.6,
        height: 152.4,
        orientation: 'portrait',
        elements: {
          barcode: { x: 10, y: 20, width: 81.6, height: 20 },
          fnsku: { x: 50.8, y: 50, fontSize: 12, align: 'center', bold: false },
          sku: { x: 50.8, y: 70, fontSize: 16, align: 'center', bold: true },
          title: { x: 50.8, y: 90, fontSize: 10, align: 'center', maxLength: 80 },
          image: { x: 10, y: 100, width: 30, height: 30 }
        }
      },

      custom: {
        name: 'Custom Size',
        width: 57,
        height: 32,
        orientation: 'landscape',
        elements: {
          barcode: { x: 4, y: 2, width: 49, height: 12 },
          fnsku: { x: 28.5, y: 17, fontSize: 8, align: 'center', bold: false },
          sku: { x: 28.5, y: 22, fontSize: 11, align: 'center', bold: true },
          title: { x: 28.5, y: 26, fontSize: 6, align: 'center', maxLength: 50 }
        }
      }
    };
  }

  /**
   * Generate PDF labels
   * @param {Object} productData - Product data from extractor
   * @param {number} quantity - Number of labels to generate
   * @param {Object} settings - Label generation settings
   * @returns {Promise<Blob>} PDF blob
   */
  async generateLabels(productData, quantity = 1, settings = {}) {
    const config = { ...this.defaultSettings, ...settings };
    const template = this.templates[config.template] || this.templates.thermal_57x32;

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
   * Render a single label on the PDF
   * @param {jsPDF} doc - PDF document
   * @param {Object} template - Label template
   * @param {Object} productData - Product data
   * @param {string} barcodeDataURL - Barcode image data URL
   * @param {Object} config - Generation config
   */
  async renderLabel(doc, template, productData, barcodeDataURL, config) {
    const elements = template.elements;

    // Render barcode
    if (elements.barcode && barcodeDataURL) {
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
    if (elements.fnsku) {
      this.renderText(doc, productData.fnsku, elements.fnsku);
    }

    // Render SKU
    if (elements.sku && productData.sku) {
      this.renderText(doc, productData.sku, elements.sku);
    }

    // Render title
    if (elements.title && productData.title) {
      const titleText = this.truncateText(productData.title, elements.title.maxLength || 50);
      this.renderText(doc, titleText, elements.title);
    }

    // Render product image (if enabled and available)
    if (elements.image && config.includeImage && productData.image) {
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
   * Get available templates
   * @returns {Object} Available templates
   */
  getTemplates() {
    return Object.keys(this.templates).map(key => ({
      id: key,
      name: this.templates[key].name,
      dimensions: `${this.templates[key].width}x${this.templates[key].height}mm`
    }));
  }

  /**
   * Update custom template
   * @param {Object} customTemplate - Custom template configuration
   */
  updateCustomTemplate(customTemplate) {
    this.templates.custom = {
      ...this.templates.custom,
      ...customTemplate
    };
  }

  /**
   * Validate template configuration
   * @param {Object} template - Template to validate
   * @returns {Object} Validation result
   */
  validateTemplate(template) {
    const validation = {
      isValid: true,
      errors: []
    };

    if (!template.width || template.width <= 0) {
      validation.errors.push('Template width must be greater than 0');
      validation.isValid = false;
    }

    if (!template.height || template.height <= 0) {
      validation.errors.push('Template height must be greater than 0');
      validation.isValid = false;
    }

    if (!template.elements || !template.elements.barcode) {
      validation.errors.push('Template must include barcode element');
      validation.isValid = false;
    }

    return validation;
  }
}

// Export for use in other modules
window.PDFLabelGenerator = PDFLabelGenerator;