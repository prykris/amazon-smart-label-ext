/**
 * Element Registry
 * Defines all renderable element types for label templates.
 * Each type declares its inspector controls and PDF render function.
 * Adding a new type here is the only change needed to support it everywhere.
 */

const ElementRegistry = {

  barcode: {
    label: 'Barcode',
    controls: [
      { prop: 'dataField', type: 'select', label: 'Field', options: ['fnsku', 'asin'] },
      { prop: 'format', type: 'select', label: 'Format', options: ['CODE128', 'CODE39', 'EAN13'] },
      { prop: 'x', type: 'number', label: 'X (mm)', step: 0.5 },
      { prop: 'y', type: 'number', label: 'Y (mm)', step: 0.5 },
      { prop: 'width', type: 'number', label: 'Width', step: 0.5, min: 1 },
      { prop: 'height', type: 'number', label: 'Height', step: 0.5, min: 1 }
    ],
    defaults: {
      dataField: 'fnsku',
      format: 'CODE128',
      x: 4, y: 2, width: 49, height: 12,
      enabled: true
    },

    async render(doc, element, data, settings) {
      const value = data[element.dataField];
      if (!value) return;

      const format = element.format || settings.barcodeFormat || 'CODE128';
      const pdfDPI = settings.pdfDPI || 300;
      const scale = pdfDPI / 96;

      const canvas = document.createElement('canvas');
      JsBarcode(canvas, value, {
        format,
        displayValue: false,
        margin: 0,
        width: Math.max(1, Math.round(scale)),
        height: Math.round(element.height * scale * 3.7795)
      });

      const dataURL = canvas.toDataURL('image/png');
      doc.addImage(dataURL, 'PNG', element.x, element.y, element.width, element.height);
    }
  },

  data_text: {
    label: 'Data Field',
    controls: [
      {
        prop: 'dataField', type: 'select', label: 'Field',
        options: ['fnsku', 'sku', 'title', 'asin', 'condition']
      },
      {
        prop: 'prefixField', type: 'select', label: 'Prefix',
        options: ['', 'condition', 'sku', 'fnsku', 'asin'],
        default: ''
      },
      { prop: 'x', type: 'number', label: 'X (mm)', step: 0.5 },
      { prop: 'y', type: 'number', label: 'Y (mm)', step: 0.5 },
      { prop: 'fontSize', type: 'number', label: 'Font Size', min: 4, max: 24 },
      { prop: 'align', type: 'select', label: 'Align', options: ['left', 'center', 'right'] },
      { prop: 'bold', type: 'checkbox', label: 'Bold' },
      { prop: 'maxLength', type: 'number', label: 'Max Length', min: 1 }
    ],
    defaults: {
      dataField: 'fnsku',
      prefixField: '',
      x: 28.5, y: 17,
      fontSize: 8,
      align: 'center',
      bold: false,
      enabled: true
    },

    render(doc, element, data) {
      const raw     = String(data[element.dataField] || '');
      const prefix  = element.prefixField ? String(data[element.prefixField] || '') : '';
      let value     = prefix ? `${prefix} ${raw}` : raw;
      if (!value) return;

      if (element.maxLength && value.length > element.maxLength) {
        value = value.substring(0, element.maxLength) + '…';
      }

      let fontSize = element.fontSize || 8;
      doc.setFont('helvetica', element.bold ? 'bold' : 'normal');

      if (value.length > 30 && fontSize > 6) fontSize = Math.max(5, fontSize - 2);
      if (value.length > 50 && fontSize > 5) fontSize = Math.max(4, fontSize - 1);

      doc.setFontSize(fontSize);
      doc.text(value, element.x, element.y, { align: element.align || 'left' });
    }
  },

  static_text: {
    label: 'Static Text',
    controls: [
      { prop: 'value', type: 'text', label: 'Text' },
      { prop: 'x', type: 'number', label: 'X (mm)', step: 0.5 },
      { prop: 'y', type: 'number', label: 'Y (mm)', step: 0.5 },
      { prop: 'fontSize', type: 'number', label: 'Font Size', min: 4, max: 24 },
      { prop: 'align', type: 'select', label: 'Align', options: ['left', 'center', 'right'] },
      { prop: 'bold', type: 'checkbox', label: 'Bold' }
    ],
    defaults: {
      value: 'Label',
      x: 2, y: 10,
      fontSize: 7,
      align: 'left',
      bold: false,
      enabled: true
    },

    render(doc, element) {
      if (!element.value) return;
      doc.setFont('helvetica', element.bold ? 'bold' : 'normal');
      doc.setFontSize(element.fontSize || 7);
      doc.text(element.value, element.x, element.y, { align: element.align || 'left' });
    }
  },

  image: {
    label: 'Product Image',
    controls: [
      { prop: 'x', type: 'number', label: 'X (mm)', step: 0.5 },
      { prop: 'y', type: 'number', label: 'Y (mm)', step: 0.5 },
      { prop: 'width', type: 'number', label: 'Width', step: 0.5, min: 1 },
      { prop: 'height', type: 'number', label: 'Height', step: 0.5, min: 1 }
    ],
    defaults: {
      x: 2, y: 2, width: 20, height: 20,
      enabled: true
    },

    async render(doc, element, data) {
      const imageUrl = data.imageUrl;
      if (!imageUrl) return;

      try {
        const dataURL = await ElementRegistry._loadImageAsDataURL(imageUrl);
        if (dataURL) {
          doc.addImage(dataURL, 'JPEG', element.x, element.y, element.width, element.height);
        }
      } catch (e) {
        // Image failed to load — skip silently, label still prints
      }
    }
  },

  // ─── Shared Utilities ────────────────────────────────────────────────────────

  /**
   * Load a remote image URL as a data URL via a canvas.
   * Silently returns null on CORS failure.
   */
  _loadImageAsDataURL(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          canvas.getContext('2d').drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/jpeg', 0.9));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  },

  /**
   * Generate a unique element ID.
   */
  generateId() {
    return `el_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  },

  /**
   * Create a new element instance of the given type with defaults applied.
   */
  createElement(type) {
    const typeDef = ElementRegistry[type];
    if (!typeDef) throw new Error(`Unknown element type: ${type}`);
    return {
      id: ElementRegistry.generateId(),
      type,
      ...typeDef.defaults
    };  
  },

  /**
   * All registered type keys (excludes utility methods).
   */
  get types() {
    return ['barcode', 'data_text', 'static_text', 'image'];
  }
};

// Export for both content script (window) and service worker (self) contexts
if (typeof window !== 'undefined') window.ElementRegistry = ElementRegistry;
if (typeof self !== 'undefined') self.ElementRegistry = ElementRegistry;
