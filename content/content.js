/**
 * Main Content Script
 * Stateless client — fetches config from background at click time.
 * No local SettingsManager or TemplateManager instances.
 */

class AmazonFNSKUExtension {
  constructor() {
    this.dataExtractor = null;
    this.pdfGenerator  = null;
    this.uiController  = null;
    this.observer      = null;
    // WeakRef-based tracking: DOM element → true, avoids stale SKU string issues
    this.processedRows = new WeakMap();
    this.isInitialized = false;
    this._keydownHandler = null;
    this._keyupHandler   = null;
    this._spaObserver    = null;

    this.init();
  }

  async init() {
    try {
      await this._waitForLibraries();

      this.dataExtractor = new AmazonDataExtractor();
      this.pdfGenerator  = new PDFLabelGenerator();
      this.uiController  = new UIController(this.dataExtractor, this.pdfGenerator);

      this._startObserver();
      this._scanAndInjectButtons();

      this.isInitialized = true;
      console.log('Amazon FNSKU Extension initialized');
    } catch (error) {
      console.error('Failed to initialize Amazon FNSKU Extension:', error);
      this._showInitError(error.message);
    }
  }

  // ─── Library Wait ──────────────────────────────────────────────────────────

  _waitForLibraries() {
    return new Promise((resolve, reject) => {
      const required = () =>
        window.jspdf &&
        window.JsBarcode &&
        window.ElementRegistry &&
        window.AmazonDataExtractor &&
        window.PDFLabelGenerator &&
        window.UIController;

      if (required()) { resolve(); return; }

      const interval = setInterval(() => {
        if (required()) { clearInterval(interval); clearTimeout(timeout); resolve(); }
      }, 100);

      // Single timeout that properly cancels the interval and rejects
      const timeout = setTimeout(() => {
        clearInterval(interval);
        reject(new Error('Required libraries failed to load within 10 seconds'));
      }, 10000);
    });
  }

  _showInitError(message) {
    const banner = document.createElement('div');
    banner.style.cssText = [
      'position:fixed', 'top:10px', 'right:10px', 'z-index:999999',
      'background:#dc3545', 'color:#fff', 'padding:10px 16px',
      'border-radius:6px', 'font-size:13px', 'font-family:sans-serif',
      'box-shadow:0 2px 8px rgba(0,0,0,.3)'
    ].join(';');
    banner.textContent = `FNSKU Extension: ${message}`;
    document.body?.appendChild(banner);
    setTimeout(() => banner.remove(), 8000);
  }

  // ─── MutationObserver ─────────────────────────────────────────────────────

  _startObserver() {
    let debounceTimer = null;

    this.observer = new MutationObserver((mutations) => {
      let shouldScan = false;

      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            if (
              node.matches?.('div[data-sku]') ||
              node.querySelector?.('div[data-sku]')
            ) {
              shouldScan = true;
              break;
            }
          }
        }
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-sku') {
          shouldScan = true;
        }
        if (shouldScan) break;
      }

      if (shouldScan) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => this._scanAndInjectButtons(), 300);
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributeFilter: ['data-sku']
    });
  }

  // ─── Button Injection ──────────────────────────────────────────────────────

  _scanAndInjectButtons() {
    if (!this.isInitialized) return;

    try {
      const productRows = document.querySelectorAll('div[data-sku]');

      for (const row of productRows) {
        // Track by DOM element reference (WeakMap) — handles duplicate SKUs correctly
        if (this.processedRows.has(row)) continue;

        try {
          const smartButton = this.uiController.createSmartButton(row);
          const labelRow    = this._createLabelRow(smartButton);
          row.parentNode.insertBefore(labelRow, row.nextSibling);
          this.processedRows.set(row, true);
        } catch (error) {
          console.warn('Failed to inject button for row:', error);
        }
      }
    } catch (error) {
      console.error('Error during button injection:', error);
    }
  }

  _createLabelRow(smartButton) {
    const row = document.createElement('div');
    row.className = 'smart-label-row';
    row.style.cssText = [
      'display:flex', 'align-items:center', 'justify-content:flex-start',
      'padding:8px 16px', 'background:#f8f9fa', 'border-top:1px solid #e9ecef',
      'margin-top:2px', 'border-radius:4px', 'width:100%', 'box-sizing:border-box'
    ].join(';');

    const label = document.createElement('span');
    label.textContent = 'FNSKU Label: ';
    label.style.cssText = 'font-size:12px;color:#666;margin-right:8px;font-weight:500;';

    row.appendChild(label);
    row.appendChild(smartButton);
    return row;
  }

  // ─── SPA Navigation ───────────────────────────────────────────────────────

  handlePageChange() {
    // processedRows is a WeakMap — entries auto-expire when DOM nodes are GC'd.
    // Just re-scan after navigation delay.
    setTimeout(() => {
      if (this.isInitialized) this._scanAndInjectButtons();
    }, 1000);
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  cleanup() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    // Remove injected UI elements
    document.querySelectorAll('.smart-label-container').forEach(el => el.remove());
    document.querySelectorAll('.smart-label-row').forEach(el => el.remove());

    if (this.uiController) {
      this.uiController.cleanup();
      this.uiController = null;
    }

    this.isInitialized = false;
    console.log('Amazon FNSKU Extension cleaned up');
  }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

function bootstrap() {
  if (window.amazonFNSKUExtension) {
    window.amazonFNSKUExtension.cleanup();
  }
  window.amazonFNSKUExtension = new AmazonFNSKUExtension();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}

// SPA navigation detection — stored so we can disconnect on cleanup
let _lastUrl = location.href;
const _spaObserver = new MutationObserver(() => {
  const url = location.href;
  if (url !== _lastUrl) {
    _lastUrl = url;
    window.amazonFNSKUExtension?.handlePageChange();
  }
});
_spaObserver.observe(document, { subtree: true, childList: true });

window.addEventListener('beforeunload', () => {
  window.amazonFNSKUExtension?.cleanup();
  _spaObserver.disconnect();
});

// Messages from background
chrome.runtime.onMessage?.addListener((request, sender, sendResponse) => {
  const ext = window.amazonFNSKUExtension;

  if (request.action === 'disable') {
    ext?.cleanup();

  } else if (request.action === 'enable') {
    if (!ext || !ext.isInitialized) bootstrap();

  } else if (request.action === 'stateUpdated') {
    // Background pushed fresh state — content script is stateless so nothing to cache,
    // but notify UIController in case it holds a reference for the config dialog
    ext?.uiController?.onStateUpdated?.(request.settings, request.templates);

  } else if (request.action === 'ping') {
    sendResponse({ success: true });
    return;
  }

  sendResponse({ success: true });
});
