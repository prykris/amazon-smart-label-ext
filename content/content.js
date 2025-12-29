/**
 * Main Content Script
 * Orchestrates the Amazon FNSKU Label Extension functionality
 */

class AmazonFNSKUExtension {
  constructor() {
    this.dataExtractor = null;
    this.pdfGenerator = null;
    this.uiController = null;
    this.observer = null;
    this.processedRows = new Set();
    this.isInitialized = false;
    
    this.init();
  }

  /**
   * Initialize the extension
   */
  async init() {
    try {
      // Wait for required libraries to load
      await this.waitForLibraries();
      
      // Initialize components
      this.dataExtractor = new AmazonDataExtractor();
      this.pdfGenerator = new PDFLabelGenerator();
      this.uiController = new UIController(this.dataExtractor, this.pdfGenerator);
      
      // Start observing DOM changes
      this.startObserver();
      
      // Initial scan for existing rows
      this.scanAndInjectButtons();
      
      this.isInitialized = true;
      console.log('Amazon FNSKU Extension initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize Amazon FNSKU Extension:', error);
    }
  }

  /**
   * Wait for required libraries to be available
   * @returns {Promise} Promise that resolves when libraries are loaded
   */
  waitForLibraries() {
    return new Promise((resolve, reject) => {
      const checkLibraries = () => {
        if (window.jspdf && window.JsBarcode) {
          resolve();
        } else {
          setTimeout(checkLibraries, 100);
        }
      };
      
      checkLibraries();
      
      // Timeout after 10 seconds
      setTimeout(() => {
        if (!window.jspdf || !window.JsBarcode) {
          reject(new Error('Required libraries failed to load'));
        }
      }, 10000);
    });
  }

  /**
   * Start the MutationObserver to watch for new product rows
   */
  startObserver() {
    const observerConfig = {
      childList: true,
      subtree: true,
      attributeFilter: ['data-sku']
    };

    this.observer = new MutationObserver((mutations) => {
      let shouldScan = false;
      
      mutations.forEach((mutation) => {
        // Check for added nodes
        if (mutation.addedNodes.length > 0) {
          for (let node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if the added node or its descendants contain product rows
              if (node.matches && node.matches('div[data-sku]')) {
                shouldScan = true;
                break;
              } else if (node.querySelector && node.querySelector('div[data-sku]')) {
                shouldScan = true;
                break;
              }
            }
          }
        }
        
        // Check for attribute changes on data-sku elements
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-sku') {
          shouldScan = true;
        }
      });
      
      if (shouldScan) {
        // Debounce the scanning to avoid excessive processing
        this.debouncedScan();
      }
    });

    this.observer.observe(document.body, observerConfig);
  }

  /**
   * Debounced scan function to avoid excessive processing
   */
  debouncedScan = this.debounce(() => {
    this.scanAndInjectButtons();
  }, 300);

  /**
   * Scan for product rows and inject smart buttons
   */
  scanAndInjectButtons() {
    if (!this.isInitialized) {
      return;
    }

    try {
      // Find all product rows with data-sku attribute
      const productRows = document.querySelectorAll('div[data-sku]');
      
      productRows.forEach(row => {
        const sku = row.getAttribute('data-sku');
        
        // Skip if already processed
        if (this.processedRows.has(sku)) {
          return;
        }
        
        // Create our own row for the smart button
        try {
          // Create and inject the smart button
          const smartButton = this.uiController.createSmartButton(row);
          
          // Create a dedicated row for our button
          const smartLabelRow = this.createSmartLabelRow(smartButton);
          
          // Insert the row after the product row
          row.parentNode.insertBefore(smartLabelRow, row.nextSibling);
          
          // Mark as processed
          this.processedRows.add(sku);
          
          console.debug(`Injected smart button row for SKU: ${sku}`);
          
        } catch (error) {
          console.warn(`Failed to inject button for SKU ${sku}:`, error);
        }
      });
      
    } catch (error) {
      console.error('Error during button injection:', error);
    }
  }

  /**
   * Create a dedicated row for the smart label button
   * @param {HTMLElement} smartButton - Smart button container
   * @returns {HTMLElement} Smart label row element
   */
  createSmartLabelRow(smartButton) {
    const smartLabelRow = document.createElement('div');
    smartLabelRow.className = 'smart-label-row';
    smartLabelRow.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: flex-start;
      padding: 8px 16px;
      background: #f8f9fa;
      border-top: 1px solid #e9ecef;
      margin-top: 2px;
      border-radius: 4px;
      width: 100%;
      box-sizing: border-box;
    `;
    
    // Add a label for the button
    const label = document.createElement('span');
    label.textContent = 'FNSKU Label: ';
    label.style.cssText = `
      font-size: 12px;
      color: #666;
      margin-right: 8px;
      font-weight: 500;
    `;
    
    smartLabelRow.appendChild(label);
    smartLabelRow.appendChild(smartButton);
    
    return smartLabelRow;
  }

  /**
   * Debounce utility function
   * @param {Function} func - Function to debounce
   * @param {number} wait - Wait time in milliseconds
   * @returns {Function} Debounced function
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Check if we're on a relevant Amazon Seller Central page
   * @returns {boolean} True if on a relevant page
   */
  isRelevantPage() {
    const url = window.location.href;
    const relevantPaths = [
      '/inventory',
      '/skucentral',
      '/fba/profitability',
      '/reportcentral',
      '/restockInventory'
    ];
    
    return relevantPaths.some(path => url.includes(path));
  }

  /**
   * Clean up when extension is disabled or page unloads
   */
  cleanup() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    
    // Remove injected buttons and rows
    const injectedButtons = document.querySelectorAll('.smart-label-container');
    injectedButtons.forEach(button => button.remove());
    
    const injectedRows = document.querySelectorAll('.smart-label-row');
    injectedRows.forEach(row => row.remove());
    
    // Close any open dialogs
    if (this.uiController) {
      this.uiController.closeConfigurationDialog();
    }
    
    this.processedRows.clear();
    this.isInitialized = false;
    
    console.log('Amazon FNSKU Extension cleaned up');
  }

  /**
   * Handle page navigation
   */
  handlePageChange() {
    // Clear processed rows on page change
    this.processedRows.clear();
    
    // Re-scan after a short delay to allow page to load
    setTimeout(() => {
      if (this.isRelevantPage()) {
        this.scanAndInjectButtons();
      }
    }, 1000);
  }
}

// Initialize extension when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.amazonFNSKUExtension = new AmazonFNSKUExtension();
  });
} else {
  window.amazonFNSKUExtension = new AmazonFNSKUExtension();
}

// Handle page navigation (for SPAs)
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    if (window.amazonFNSKUExtension) {
      window.amazonFNSKUExtension.handlePageChange();
    }
  }
}).observe(document, { subtree: true, childList: true });

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (window.amazonFNSKUExtension) {
    window.amazonFNSKUExtension.cleanup();
  }
});

// Handle extension disable/enable
chrome.runtime.onMessage?.addListener((request, sender, sendResponse) => {
  if (request.action === 'disable') {
    if (window.amazonFNSKUExtension) {
      window.amazonFNSKUExtension.cleanup();
    }
  } else if (request.action === 'enable') {
    if (!window.amazonFNSKUExtension || !window.amazonFNSKUExtension.isInitialized) {
      window.amazonFNSKUExtension = new AmazonFNSKUExtension();
    }
  }
  
  sendResponse({ success: true });
});