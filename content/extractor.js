/**
 * Amazon Seller Central Data Extractor
 * Robust extraction of product data from dynamic DOM structure
 */

class AmazonDataExtractor {
  constructor() {
    this.extractionStrategies = {
      fnsku: [
        this.extractFNSKUByLabel.bind(this),
        this.extractFNSKUByPattern.bind(this),
        this.promptFNSKUInput.bind(this)
      ],
      asin: [
        this.extractASINByLabel.bind(this),
        this.extractASINByPattern.bind(this),
        this.extractASINFromURL.bind(this)
      ],
      title: [
        this.extractTitleFromLink.bind(this),
        this.extractTitleFromImage.bind(this),
        this.generateFallbackTitle.bind(this)
      ],
      image: [
        this.extractProductImage.bind(this)
      ]
    };
  }

  /**
   * Extract all product data from a row element
   * @param {HTMLElement} rowElement - The div[data-sku] element
   * @returns {Object} Product data object
   */
  extractProductData(rowElement) {
    const sku = rowElement.getAttribute('data-sku');
    
    if (!sku) {
      throw new Error('No SKU found in row element');
    }

    const data = {
      sku: sku,
      fnsku: this.tryExtractionStrategies('fnsku', rowElement),
      asin: this.tryExtractionStrategies('asin', rowElement),
      title: this.tryExtractionStrategies('title', rowElement),
      image: this.tryExtractionStrategies('image', rowElement),
      extractedAt: new Date().toISOString()
    };

    // Validate required fields
    if (!data.fnsku) {
      console.warn(`Failed to extract FNSKU for SKU: ${sku}`);
    }

    return data;
  }

  /**
   * Try multiple extraction strategies until one succeeds
   * @param {string} dataType - Type of data to extract
   * @param {HTMLElement} rowElement - Row element to extract from
   * @returns {string|null} Extracted data or null
   */
  tryExtractionStrategies(dataType, rowElement) {
    const strategies = this.extractionStrategies[dataType] || [];
    
    for (const strategy of strategies) {
      try {
        const result = strategy(rowElement);
        if (result && result.trim()) {
          return result.trim();
        }
      } catch (error) {
        console.debug(`Extraction strategy failed for ${dataType}:`, error);
      }
    }
    
    return null;
  }

  /**
   * Extract FNSKU by finding the label and its corresponding value
   * @param {HTMLElement} rowElement - Row element
   * @returns {string|null} FNSKU value
   */
  extractFNSKUByLabel(rowElement) {
    return this.findLabelValue(rowElement, 'FNSKU');
  }

  /**
   * Extract FNSKU by pattern matching (format: X002HB9ZDL)
   * @param {HTMLElement} rowElement - Row element
   * @returns {string|null} FNSKU value
   */
  extractFNSKUByPattern(rowElement) {
    const fnSkuPattern = /^[A-Z]\d{9}[A-Z]$/;
    const allText = rowElement.textContent;
    const matches = allText.match(fnSkuPattern);
    return matches ? matches[0] : null;
  }

  /**
   * Prompt user for FNSKU input as last resort
   * @param {HTMLElement} rowElement - Row element
   * @returns {string|null} User-provided FNSKU
   */
  promptFNSKUInput(rowElement) {
    const sku = rowElement.getAttribute('data-sku');
    const userInput = prompt(`Could not automatically find FNSKU for SKU: ${sku}\nPlease enter the FNSKU manually:`);
    
    if (userInput && /^[A-Z]\d{9}[A-Z]$/.test(userInput.trim())) {
      return userInput.trim();
    }
    
    return null;
  }

  /**
   * Extract ASIN by finding the label and its corresponding value
   * @param {HTMLElement} rowElement - Row element
   * @returns {string|null} ASIN value
   */
  extractASINByLabel(rowElement) {
    return this.findLabelValue(rowElement, 'ASIN');
  }

  /**
   * Extract ASIN by pattern matching (format: B0FXH65FKG)
   * @param {HTMLElement} rowElement - Row element
   * @returns {string|null} ASIN value
   */
  extractASINByPattern(rowElement) {
    const asinPattern = /B[0-9A-Z]{9}/;
    const allText = rowElement.textContent;
    const matches = allText.match(asinPattern);
    return matches ? matches[0] : null;
  }

  /**
   * Extract ASIN from Amazon product URL
   * @param {HTMLElement} rowElement - Row element
   * @returns {string|null} ASIN value
   */
  extractASINFromURL(rowElement) {
    const productLink = rowElement.querySelector('a[href*="/dp/"]');
    if (productLink) {
      const urlMatch = productLink.href.match(/\/dp\/([B0-9A-Z]{10})/);
      return urlMatch ? urlMatch[1] : null;
    }
    return null;
  }

  /**
   * Extract product title from Amazon product link
   * @param {HTMLElement} rowElement - Row element
   * @returns {string|null} Product title
   */
  extractTitleFromLink(rowElement) {
    const titleLink = rowElement.querySelector('a[href*="/dp/"]');
    return titleLink ? titleLink.textContent.trim() : null;
  }

  /**
   * Extract product title from image alt text
   * @param {HTMLElement} rowElement - Row element
   * @returns {string|null} Product title
   */
  extractTitleFromImage(rowElement) {
    const img = rowElement.querySelector('img');
    return img && img.alt ? img.alt.trim() : null;
  }

  /**
   * Generate fallback title using SKU
   * @param {HTMLElement} rowElement - Row element
   * @returns {string} Fallback title
   */
  generateFallbackTitle(rowElement) {
    const sku = rowElement.getAttribute('data-sku');
    return `Product ${sku}`;
  }

  /**
   * Extract product image URL
   * @param {HTMLElement} rowElement - Row element
   * @returns {string|null} Image URL
   */
  extractProductImage(rowElement) {
    const img = rowElement.querySelector('img');
    return img ? img.src : null;
  }

  /**
   * Generic method to find a label and its corresponding value
   * @param {HTMLElement} container - Container element to search in
   * @param {string} labelText - Text of the label to find
   * @returns {string|null} Value corresponding to the label
   */
  findLabelValue(container, labelText) {
    const allElements = container.querySelectorAll('*');
    
    for (let element of allElements) {
      // Check if this element contains only the label text (no children with text)
      if (element.children.length === 0 && element.textContent.trim() === labelText) {
        // Found the label, now find its value
        const value = this.findCorrespondingValue(element);
        if (value) {
          return value;
        }
      }
    }
    
    return null;
  }

  /**
   * Find the value corresponding to a label element
   * @param {HTMLElement} labelElement - The label element
   * @returns {string|null} Corresponding value
   */
  findCorrespondingValue(labelElement) {
    // Strategy 1: Look for sibling in same row container
    const labelPanel = labelElement.closest('div');
    if (labelPanel) {
      const rowContainer = labelPanel.parentElement;
      if (rowContainer) {
        // Look for the value panel (usually the last child or next sibling)
        const valuePanel = rowContainer.lastElementChild;
        if (valuePanel && valuePanel !== labelPanel) {
          const valueText = valuePanel.textContent.trim();
          if (valueText && valueText !== labelElement.textContent.trim()) {
            return valueText;
          }
        }
        
        // Try next sibling approach
        const nextSibling = labelPanel.nextElementSibling;
        if (nextSibling) {
          const valueText = nextSibling.textContent.trim();
          if (valueText) {
            return valueText;
          }
        }
      }
    }
    
    // Strategy 2: Look for nearby elements with similar structure
    const parent = labelElement.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children);
      const labelIndex = siblings.indexOf(labelElement.closest('div'));
      
      // Check next few siblings for value
      for (let i = labelIndex + 1; i < Math.min(labelIndex + 3, siblings.length); i++) {
        const sibling = siblings[i];
        const text = sibling.textContent.trim();
        if (text && text !== labelElement.textContent.trim()) {
          return text;
        }
      }
    }
    
    return null;
  }

  /**
   * Validate extracted data
   * @param {Object} data - Extracted product data
   * @returns {Object} Validation result
   */
  validateData(data) {
    const validation = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // Required fields
    if (!data.sku) {
      validation.errors.push('SKU is required');
      validation.isValid = false;
    }

    if (!data.fnsku) {
      validation.errors.push('FNSKU is required for label generation');
      validation.isValid = false;
    } else if (!/^[A-Z]\d{9}[A-Z]$/.test(data.fnsku)) {
      validation.warnings.push('FNSKU format may be invalid');
    }

    // Optional but recommended fields
    if (!data.asin) {
      validation.warnings.push('ASIN not found');
    }

    if (!data.title || data.title.startsWith('Product ')) {
      validation.warnings.push('Product title not found, using fallback');
    }

    return validation;
  }
}

// Export for use in other modules
window.AmazonDataExtractor = AmazonDataExtractor;