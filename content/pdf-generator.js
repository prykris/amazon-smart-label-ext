/**
 * PDF Label Generator
 * Accepts plain (settings, template) objects — no internal manager instances.
 * Rendering is driven entirely by ElementRegistry, zero hardcoded element logic here.
 */

class PDFLabelGenerator {

  /**
   * Generate a multi-page PDF document.
   *
   * @param {Object} productData  - { sku, fnsku, asin, title, condition, imageUrl }
   * @param {number} quantity     - Number of label pages
   * @param {Object} settings     - Plain settings object from background
   * @param {Object} template     - Plain template object from background
   * @returns {jsPDF} jsPDF document (call .save() or .output() on it)
   */
  async generateLabels(productData, quantity = 1, settings = {}, template = null) {
    if (!template) {
      throw new Error('Template is required for label generation');
    }

    if (!productData.fnsku) {
      throw new Error('FNSKU is required for label generation');
    }

    const globalSettings = settings.globalSettings || {};
    const { jsPDF } = window.jspdf;

    const doc = new jsPDF({
      orientation: template.orientation || 'landscape',
      unit:        'mm',
      format:      [template.width, template.height],
      putOnlyUsedFonts: true,
      compress:    true
    });

    doc.setProperties({
      title:    `FNSKU Label - ${productData.sku || productData.fnsku}`,
      creator:  'Amazon FNSKU Extension',
      producer: 'Amazon FNSKU Extension'
    });

    for (let i = 0; i < quantity; i++) {
      if (i > 0) doc.addPage();
      await this._renderLabel(doc, template, productData, globalSettings);
    }

    return doc;
  }

  /**
   * Render a single label page using ElementRegistry.
   * No hardcoded element logic — each type handles itself.
   */
  async _renderLabel(doc, template, productData, globalSettings) {
    for (const element of template.elements) {
      if (element.enabled === false) continue;

      const typeDef = ElementRegistry[element.type];
      if (!typeDef) {
        console.warn(`Unknown element type: ${element.type} — skipped`);
        continue;
      }

      try {
        await typeDef.render(doc, element, productData, globalSettings);
      } catch (error) {
        console.warn(`Failed to render element ${element.id} (${element.type}):`, error);
      }
    }
  }

  /**
   * Save PDF to disk via browser download.
   */
  savePDF(doc, filename) {
    doc.save(filename);
  }

  /**
   * Open PDF in a new browser tab.
   */
  openPDFInNewTab(doc) {
    const blob   = doc.output('blob');
    const url    = URL.createObjectURL(blob);
    const tab    = window.open(url, '_blank');
    // Revoke after a short delay to allow the tab to load
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return tab;
  }

  /**
   * Convenience: generate and return as a Blob.
   */
  async generateBlob(productData, quantity, settings, template) {
    const doc = await this.generateLabels(productData, quantity, settings, template);
    return doc.output('blob');
  }
}

window.PDFLabelGenerator = PDFLabelGenerator;
