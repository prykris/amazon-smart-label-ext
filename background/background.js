/**
 * Background Service Worker
 * Handles extension lifecycle and communication
 */

class BackgroundService {
  constructor() {
    this.init();
  }

  init() {
    // Handle extension installation
    chrome.runtime.onInstalled.addListener((details) => {
      this.handleInstallation(details);
    });

    // Handle messages from content scripts and popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep message channel open for async responses
    });

    // Handle tab updates to inject content script if needed
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      this.handleTabUpdate(tabId, changeInfo, tab);
    });

    // Handle action button click
    chrome.action.onClicked.addListener((tab) => {
      this.handleActionClick(tab);
    });
  }

  /**
   * Handle extension installation or update
   * @param {Object} details - Installation details
   */
  async handleInstallation(details) {
    console.log('Amazon FNSKU Extension installed/updated:', details.reason);

    // Set default settings on first install
    if (details.reason === 'install') {
      const defaultSettings = {
        template: 'thermal_57x32',
        barcodeFormat: 'CODE128',
        includeImage: false,
        fontSize: {
          fnsku: 8,
          sku: 11,
          title: 6
        },
        customWidth: 57,
        customHeight: 32
      };

      try {
        await chrome.storage.sync.set({
          fnskuLabelSettings: defaultSettings,
          extensionEnabled: true,
          installDate: new Date().toISOString()
        });
        console.log('Default settings initialized');
      } catch (error) {
        console.error('Failed to set default settings:', error);
      }

      // Show welcome notification
      this.showWelcomeNotification();
    }

    // Update content scripts on extension update
    if (details.reason === 'update') {
      this.updateContentScripts();
    }
  }

  /**
   * Handle messages from content scripts and popup
   * @param {Object} request - Message request
   * @param {Object} sender - Message sender
   * @param {Function} sendResponse - Response callback
   */
  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.action) {
        case 'getSettings':
          const settings = await this.getSettings();
          sendResponse({ success: true, data: settings });
          break;

        case 'saveSettings':
          await this.saveSettings(request.settings);
          sendResponse({ success: true });
          break;

        case 'toggleExtension':
          const enabled = await this.toggleExtension();
          sendResponse({ success: true, enabled });
          break;

        case 'getExtensionStatus':
          const status = await this.getExtensionStatus();
          sendResponse({ success: true, data: status });
          break;

        case 'reportError':
          this.reportError(request.error, sender);
          sendResponse({ success: true });
          break;

        case 'generateLabel':
          // Handle label generation request from popup
          const result = await this.generateLabelFromPopup(request.data);
          sendResponse(result);
          break;

        case 'generateManualLabel':
          // Handle manual label generation request from popup
          const manualResult = await this.generateManualLabel(request.data);
          sendResponse(manualResult);
          break;

        case 'addToDownloadHistory':
          // Handle adding item to download history
          const historyResult = await this.addToDownloadHistory(request.data);
          sendResponse(historyResult);
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Background message handling error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  /**
   * Handle tab updates
   * @param {number} tabId - Tab ID
   * @param {Object} changeInfo - Change information
   * @param {Object} tab - Tab object
   */
  async handleTabUpdate(tabId, changeInfo, tab) {
    // Only process complete page loads on Amazon Seller Central
    if (changeInfo.status !== 'complete' || !tab.url) {
      return;
    }

    const isAmazonSellerCentral = /https:\/\/sellercentral(-europe)?\.amazon\.[^\/]+/.test(tab.url);

    if (isAmazonSellerCentral) {
      try {
        const settings = await this.getSettings();
        if (settings.extensionEnabled) {
          // Ensure content script is injected
          await this.ensureContentScriptInjected(tabId);
        }
      } catch (error) {
        console.error('Failed to handle tab update:', error);
      }
    }
  }

  /**
   * Handle action button click (when popup is disabled)
   * @param {Object} tab - Active tab
   */
  async handleActionClick(tab) {
    const isAmazonSellerCentral = /https:\/\/sellercentral(-europe)?\.amazon\.[^\/]+/.test(tab.url);

    if (!isAmazonSellerCentral) {
      // Show notification that extension only works on Amazon Seller Central
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/logo-48.png',
        title: 'Amazon FNSKU Label Printer',
        message: 'This extension only works on Amazon Seller Central pages.'
      });
    }
  }

  /**
   * Get extension settings
   * @returns {Object} Extension settings
   */
  async getSettings() {
    try {
      const result = await chrome.storage.sync.get([
        'fnskuLabelSettings',
        'extensionEnabled',
        'installDate'
      ]);

      return {
        labelSettings: result.fnskuLabelSettings || {},
        extensionEnabled: result.extensionEnabled !== false,
        installDate: result.installDate
      };
    } catch (error) {
      console.error('Failed to get settings:', error);
      return {
        labelSettings: {},
        extensionEnabled: true,
        installDate: null
      };
    }
  }

  /**
   * Save extension settings
   * @param {Object} settings - Settings to save
   */
  async saveSettings(settings) {
    try {
      await chrome.storage.sync.set(settings);

      // Notify all Amazon Seller Central tabs about settings change
      const tabs = await chrome.tabs.query({
        url: [
          'https://sellercentral.amazon.com/*',
          'https://sellercentral.amazon.ca/*',
          'https://sellercentral.amazon.co.uk/*',
          'https://sellercentral.amazon.de/*',
          'https://sellercentral.amazon.fr/*',
          'https://sellercentral.amazon.it/*',
          'https://sellercentral.amazon.es/*',
          'https://sellercentral.amazon.co.jp/*',
          'https://sellercentral.amazon.com.au/*',
          'https://sellercentral.amazon.in/*',
          'https://sellercentral-europe.amazon.com/*'
        ]
      });

      for (const tab of tabs) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            action: 'settingsUpdated',
            settings: settings
          });
        } catch (error) {
          // Tab might not have content script injected
          console.debug('Could not notify tab about settings update:', tab.id);
        }
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw error;
    }
  }

  /**
   * Toggle extension enabled/disabled state
   * @returns {boolean} New enabled state
   */
  async toggleExtension() {
    try {
      const settings = await this.getSettings();
      const newState = !settings.extensionEnabled;

      await chrome.storage.sync.set({ extensionEnabled: newState });

      // Notify all tabs about state change
      const tabs = await chrome.tabs.query({
        url: [
          'https://sellercentral.amazon.com/*',
          'https://sellercentral.amazon.ca/*',
          'https://sellercentral.amazon.co.uk/*',
          'https://sellercentral.amazon.de/*',
          'https://sellercentral.amazon.fr/*',
          'https://sellercentral.amazon.it/*',
          'https://sellercentral.amazon.es/*',
          'https://sellercentral.amazon.co.jp/*',
          'https://sellercentral.amazon.com.au/*',
          'https://sellercentral.amazon.in/*',
          'https://sellercentral-europe.amazon.com/*'
        ]
      });

      for (const tab of tabs) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            action: newState ? 'enable' : 'disable'
          });
        } catch (error) {
          console.debug('Could not notify tab about extension toggle:', tab.id);
        }
      }

      return newState;
    } catch (error) {
      console.error('Failed to toggle extension:', error);
      throw error;
    }
  }

  /**
   * Get extension status
   * @returns {Object} Extension status
   */
  async getExtensionStatus() {
    try {
      const settings = await this.getSettings();
      const manifest = chrome.runtime.getManifest();

      return {
        version: manifest.version,
        enabled: settings.extensionEnabled,
        installDate: settings.installDate,
        permissions: manifest.permissions,
        hostPermissions: manifest.host_permissions
      };
    } catch (error) {
      console.error('Failed to get extension status:', error);
      return {
        version: 'unknown',
        enabled: false,
        installDate: null,
        permissions: [],
        hostPermissions: []
      };
    }
  }

  /**
   * Report error for debugging
   * @param {Object} error - Error details
   * @param {Object} sender - Message sender
   */
  reportError(error, sender) {
    console.error('Content script error reported:', {
      error,
      sender,
      timestamp: new Date().toISOString()
    });

    // Could implement error reporting to analytics service here
  }

  /**
   * Generate label from popup interface
   * @param {Object} data - Label generation data
   * @returns {Object} Generation result
   */
  async generateLabelFromPopup(data) {
    try {
      // This would be used if popup needs to generate labels directly
      // For now, we'll return a placeholder response
      return {
        success: true,
        message: 'Label generation from popup not yet implemented'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate label from manual entry data
   * @param {Object} data - Manual entry data
   * @returns {Object} Generation result
   */
  async generateManualLabel(data) {
    try {
      // Get current settings
      const settings = await this.getSettings();
      const labelSettings = settings.labelSettings || {};

      // Create a simple HTML page that will generate the PDF and open it directly
      const htmlContent = this.createDirectPDFGenerator(data, labelSettings);
      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`;

      // Create a new tab with the PDF generator - it will immediately generate and open the PDF
      await chrome.tabs.create({
        url: dataUrl,
        active: false // Don't focus the generator tab
      });

      return {
        success: true,
        message: `Generating ${data.quantity} label(s) for ${data.sku}...`
      };
    } catch (error) {
      console.error('Manual label generation error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create HTML content that generates PDF directly and opens it
   * @param {Object} data - Product data
   * @param {Object} settings - Label settings
   * @returns {string} HTML content
   */
  createDirectPDFGenerator(data, settings) {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Generating FNSKU Label...</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.5/JsBarcode.all.min.js"></script>
</head>
<body>
    <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
        <h2>🖨️ Generating FNSKU Label...</h2>
        <p>Please wait while your label is being generated.</p>
        <div id="status"></div>
    </div>

    <script>
        window.addEventListener('load', function() {
            // Small delay to ensure libraries are loaded
            setTimeout(generateAndOpenPDF, 1000);
        });

        function generateAndOpenPDF() {
            const statusEl = document.getElementById('status');
            
            try {
                statusEl.innerHTML = '<p>Loading libraries...</p>';
                
                // Check if libraries are loaded
                if (typeof window.jspdf === 'undefined' || typeof JsBarcode === 'undefined') {
                    throw new Error('Required libraries not loaded');
                }

                statusEl.innerHTML = '<p>Generating PDF...</p>';

                const { jsPDF } = window.jspdf;
                const doc = new jsPDF({
                    orientation: 'landscape',
                    unit: 'mm',
                    format: [57, 32]
                });

                // Generate barcode
                const canvas = document.createElement('canvas');
                JsBarcode(canvas, '${data.fnsku}', {
                    format: 'CODE128',
                    displayValue: false,
                    margin: 0,
                    width: 2,
                    height: 40
                });
                const barcodeData = canvas.toDataURL('image/png');

                // Generate labels
                for (let i = 0; i < ${data.quantity}; i++) {
                    if (i > 0) doc.addPage();
                    
                    // Add barcode
                    doc.addImage(barcodeData, 'PNG', 4, 2, 49, 12);
                    
                    // Add FNSKU text
                    doc.setFontSize(8);
                    doc.setFont('helvetica', 'normal');
                    doc.text('${data.fnsku}', 28.5, 17, { align: 'center' });
                    
                    // Add SKU text
                    doc.setFontSize(11);
                    doc.setFont('helvetica', 'bold');
                    const skuText = 'SKU: ${data.sku}';
                    if (skuText.length > 15) doc.setFontSize(9);
                    doc.text(skuText, 28.5, 22, { align: 'center' });
                    
                    // Add title
                    doc.setFontSize(6);
                    doc.setFont('helvetica', 'normal');
                    const title = '${(data.title || '').replace(/'/g, "\\'")}';
                    const cleanTitle = title.length > 50 ? title.substring(0, 50) + '...' : title;
                    if (cleanTitle) {
                        doc.text(cleanTitle, 28.5, 26, { align: 'center' });
                    }
                }

                statusEl.innerHTML = '<p>Creating PDF...</p>';

                // Create PDF blob and download link
                const pdfBlob = doc.output('blob');
                const pdfUrl = URL.createObjectURL(pdfBlob);
                
                statusEl.innerHTML = '<p style="color: green;">✅ PDF generated successfully!</p><p>Click the button below to download:</p>';
                
                // Create download button that user must click
                const downloadBtn = document.createElement('button');
                downloadBtn.textContent = 'Download PDF Label';
                downloadBtn.style.cssText = 'display: block; margin: 20px auto; padding: 15px 30px; background: #007bff; color: white; border: none; border-radius: 4px; font-size: 16px; cursor: pointer;';
                
                downloadBtn.onclick = function() {
                    try {
                        const a = document.createElement('a');
                        a.href = pdfUrl;
                        a.download = '${data.sku}_label.pdf';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        
                        downloadBtn.textContent = '✅ Download Started!';
                        downloadBtn.style.background = '#28a745';
                        
                        console.log('Download triggered for:', '${data.sku}_label.pdf');
                    } catch (error) {
                        console.error('Download error:', error);
                        downloadBtn.textContent = '❌ Download Failed';
                        downloadBtn.style.background = '#dc3545';
                    }
                };
                
                // Also add a view button
                const viewBtn = document.createElement('button');
                viewBtn.textContent = 'View PDF in New Tab';
                viewBtn.style.cssText = 'display: block; margin: 10px auto; padding: 15px 30px; background: #28a745; color: white; border: none; border-radius: 4px; font-size: 16px; cursor: pointer;';
                
                viewBtn.onclick = function() {
                    try {
                        window.open(pdfUrl, '_blank');
                        viewBtn.textContent = '✅ Opened in New Tab';
                        console.log('PDF opened in new tab');
                    } catch (error) {
                        console.error('View error:', error);
                        viewBtn.textContent = '❌ Failed to Open';
                        viewBtn.style.background = '#dc3545';
                    }
                };
                
                statusEl.appendChild(downloadBtn);
                statusEl.appendChild(viewBtn);
                
                console.log('PDF blob created:', pdfBlob.size, 'bytes');
                console.log('PDF URL created:', pdfUrl);
                
                // Don't auto-close so user can inspect console
                // setTimeout(() => {
                //     window.close();
                // }, 2000);
                
            } catch (error) {
                console.error('Label generation error:', error);
                statusEl.innerHTML = '<p style="color: red;">❌ Error: ' + error.message + '</p>';
            }
        }
    </script>
</body>
</html>`;
  }

  /**
   * Create simple HTML page for label generation
   * @param {Object} data - Product data
   * @param {Object} settings - Label settings
   * @returns {string} HTML content
   */
  createSimpleLabelPage(data, settings) {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>FNSKU Label Generator</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            padding: 20px;
            background: #f5f5f5;
            text-align: center;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .status {
            padding: 15px;
            border-radius: 4px;
            margin: 20px 0;
            font-size: 16px;
        }
        .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .info { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
        .details {
            text-align: left;
            background: #f8f9fa;
            padding: 15px;
            border-radius: 4px;
            margin: 20px 0;
        }
        .download-btn {
            background: #007bff;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            margin: 10px;
        }
        .download-btn:hover {
            background: #0056b3;
        }
        .close-btn {
            background: #6c757d;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            margin: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🖨️ FNSKU Label Generator</h1>
        
        <div class="status info">
            Manual label generation is ready!
        </div>
        
        <div class="details">
            <h3>Product Details:</h3>
            <p><strong>SKU:</strong> ${data.sku}</p>
            <p><strong>FNSKU:</strong> ${data.fnsku}</p>
            <p><strong>ASIN:</strong> ${data.asin || 'Not provided'}</p>
            <p><strong>Title:</strong> ${data.title || 'No title provided'}</p>
            <p><strong>Quantity:</strong> ${data.quantity}</p>
        </div>
        
        <div class="status error">
            <strong>Note:</strong> Manual label generation from the popup is currently not fully implemented.
            Please use the extension on Amazon Seller Central pages for full functionality.
        </div>
        
        <div>
            <button class="download-btn" onclick="downloadSampleLabel()">Download Sample Label</button>
            <button class="close-btn" onclick="window.close()">Close</button>
        </div>
    </div>

    <script>
        function downloadSampleLabel() {
            // Create a simple text file as a placeholder
            const content = \`FNSKU Label Data
SKU: ${data.sku}
FNSKU: ${data.fnsku}
ASIN: ${data.asin || 'Not provided'}
Title: ${data.title || 'No title provided'}
Quantity: ${data.quantity}

Note: This is a sample file. For actual PDF labels with barcodes,
please use the extension on Amazon Seller Central pages.\`;
            
            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = \`${data.sku}_label_data.txt\`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            document.querySelector('.status.info').innerHTML = '✅ Sample label data downloaded!';
        }
        
        // Auto-close after 30 seconds
        setTimeout(() => {
            window.close();
        }, 30000);
    </script>
</body>
</html>`;
  }

  /**
   * Ensure content script is injected in tab
   * @param {number} tabId - Tab ID
   */
  async ensureContentScriptInjected(tabId) {
    try {
      // Try to ping the content script
      await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    } catch (error) {
      // Content script not present, inject it
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: [
            'lib/jspdf.umd.min.js',
            'lib/jsbarcode.all.min.js',
            'content/extractor.js',
            'content/pdf-generator.js',
            'content/ui-controller.js',
            'content/content.js'
          ]
        });

        await chrome.scripting.insertCSS({
          target: { tabId },
          files: ['styles/content.css']
        });

        console.log('Content script injected into tab:', tabId);
      } catch (injectionError) {
        console.error('Failed to inject content script:', injectionError);
      }
    }
  }

  /**
   * Update content scripts in all Amazon Seller Central tabs
   */
  async updateContentScripts() {
    try {
      const tabs = await chrome.tabs.query({
        url: [
          'https://sellercentral.amazon.com/*',
          'https://sellercentral.amazon.ca/*',
          'https://sellercentral.amazon.co.uk/*',
          'https://sellercentral.amazon.de/*',
          'https://sellercentral.amazon.fr/*',
          'https://sellercentral.amazon.it/*',
          'https://sellercentral.amazon.es/*',
          'https://sellercentral.amazon.co.jp/*',
          'https://sellercentral.amazon.com.au/*',
          'https://sellercentral.amazon.in/*',
          'https://sellercentral-europe.amazon.com/*'
        ]
      });

      for (const tab of tabs) {
        try {
          await chrome.tabs.reload(tab.id);
        } catch (error) {
          console.debug('Could not reload tab:', tab.id);
        }
      }
    } catch (error) {
      console.error('Failed to update content scripts:', error);
    }
  }

  /**
   * Show welcome notification on first install
   */
  showWelcomeNotification() {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/logo-48.png',
      title: 'Amazon FNSKU Label Printer Installed!',
      message: 'Visit Amazon Seller Central to start printing FNSKU labels. Look for the 🖨️ button next to your products.'
    });
  }

  /**
   * Add item to download history
   * @param {Object} item - Download history item
   * @returns {Object} Result of the operation
   */
  async addToDownloadHistory(item) {
    try {
      // Get current download history
      const result = await chrome.storage.local.get(['downloadHistory']);
      let downloadHistory = result.downloadHistory || [];

      // Add new item to the beginning
      downloadHistory.unshift({
        sku: item.sku,
        fnsku: item.fnsku,
        asin: item.asin || '',
        title: item.title || '',
        quantity: item.quantity,
        timestamp: new Date().toISOString()
      });

      // Keep only last 50 items
      if (downloadHistory.length > 50) {
        downloadHistory = downloadHistory.slice(0, 50);
      }

      // Save back to storage
      await chrome.storage.local.set({ downloadHistory });

      return {
        success: true,
        message: 'Added to download history'
      };
    } catch (error) {
      console.error('Failed to add to download history:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Initialize background service
new BackgroundService();