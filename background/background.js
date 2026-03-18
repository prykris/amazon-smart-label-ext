/**
 * Background Service Worker
 * Single owner of SettingsManager and TemplateManager.
 * All state reads/writes flow through here. Content and popup are stateless clients.
 */

importScripts(
  '../content/settings-manager.js',
  '../content/template-manager.js'
);

// All Amazon Seller Central domains — single constant, used everywhere
const AMAZON_URLS = [
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
];

const AMAZON_URL_PATTERN = /https:\/\/sellercentral(-europe)?\.amazon\.[^/]+/;

class BackgroundService {
  constructor() {
    this.settingsManager = new SettingsManager();
    this.templateManager = new TemplateManager();
    this.ready = false;
    this.init();
  }

  async init() {
    await this.settingsManager.init();
    await this.templateManager.init();
    this.ready = true;

    chrome.runtime.onInstalled.addListener((details) => this.handleInstallation(details));
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // keep channel open for async responses
    });
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      this.handleTabUpdate(tabId, changeInfo, tab);
    });
  }

  // ─── Installation ─────────────────────────────────────────────────────────

  async handleInstallation(details) {
    if (details.reason === 'install') {
      // Defaults already set by SettingsManager constructor — just persist them
      await this.settingsManager.forceSave();
      this.showWelcomeNotification();
    }

    if (details.reason === 'update') {
      // Reload all Amazon tabs so they pick up new content scripts
      const tabs = await this.getAmazonTabs();
      for (const tab of tabs) {
        try { await chrome.tabs.reload(tab.id); } catch { /* tab may have closed */ }
      }
    }
  }

  // ─── Message Router ───────────────────────────────────────────────────────

  async handleMessage(request, sender, sendResponse) {
    if (!this.ready) {
      sendResponse({ success: false, error: 'Background not ready yet' });
      return;
    }

    try {
      switch (request.action) {

        // ── Settings ──────────────────────────────────────────────────────
        case 'getSettings': {
          const settings = await this.settingsManager.getSettings();
          sendResponse({ success: true, data: settings });
          break;
        }

        case 'saveSettings': {
          await this.settingsManager.updateGlobalSettings(
            request.settings.globalSettings || {}
          );
          if (request.settings.selectedTemplateId) {
            await this.settingsManager.setSelectedTemplateId(
              request.settings.selectedTemplateId
            );
          }
          await this.settingsManager.forceSave();
          await this.pushStateToTabs();
          sendResponse({ success: true });
          break;
        }

        // ── Label config (settings + active template in one round-trip) ──
        case 'getLabelConfig': {
          const settings  = await this.settingsManager.getSettings();
          const templateId = settings.selectedTemplateId || 'thermal_57x32';
          const template  = await this.templateManager.getTemplate(templateId);
          sendResponse({ success: true, data: { settings, template } });
          break;
        }

        // ── Templates ─────────────────────────────────────────────────────
        case 'getAllTemplates': {
          const templates = await this.templateManager.getAllTemplates();
          sendResponse({ success: true, data: templates });
          break;
        }

        case 'getTemplate': {
          const template = await this.templateManager.getTemplate(request.templateId);
          sendResponse({ success: true, data: template });
          break;
        }

        case 'createTemplate': {
          const created = await this.templateManager.createTemplate(request.templateData);
          await this.pushStateToTabs();
          sendResponse({ success: true, data: created });
          break;
        }

        case 'updateTemplate': {
          const updated = await this.templateManager.updateTemplate(
            request.templateId, request.templateData
          );
          await this.pushStateToTabs();
          sendResponse({ success: true, data: updated });
          break;
        }

        case 'deleteTemplate': {
          await this.templateManager.deleteTemplate(request.templateId);
          // If deleted template was selected, fall back to default
          const settings = await this.settingsManager.getSettings();
          if (settings.selectedTemplateId === request.templateId) {
            await this.settingsManager.setSelectedTemplateId('thermal_57x32');
            await this.settingsManager.forceSave();
          }
          await this.pushStateToTabs();
          sendResponse({ success: true });
          break;
        }

        // ── Download History ───────────────────────────────────────────────
        case 'getDownloadHistory': {
          const result = await chrome.storage.local.get(['downloadHistory']);
          sendResponse({ success: true, data: result.downloadHistory || [] });
          break;
        }

        case 'addToDownloadHistory': {
          const result = await chrome.storage.local.get(['downloadHistory']);
          let history = result.downloadHistory || [];
          history.unshift({
            sku:       request.data.sku,
            fnsku:     request.data.fnsku,
            asin:      request.data.asin || '',
            title:     request.data.title || '',
            quantity:  request.data.quantity,
            timestamp: new Date().toISOString()
          });
          if (history.length > 50) history = history.slice(0, 50);
          await chrome.storage.local.set({ downloadHistory: history });
          sendResponse({ success: true });
          break;
        }

        case 'clearDownloadHistory': {
          await chrome.storage.local.set({ downloadHistory: [] });
          sendResponse({ success: true });
          break;
        }

        case 'removeFromDownloadHistory': {
          const result = await chrome.storage.local.get(['downloadHistory']);
          const history = (result.downloadHistory || []).filter(
            (_, i) => i !== request.index
          );
          await chrome.storage.local.set({ downloadHistory: history });
          sendResponse({ success: true });
          break;
        }

        // ── Extension toggle ───────────────────────────────────────────────
        case 'toggleExtension': {
          const state = await this.settingsManager.getExtensionState();
          const newEnabled = !state.extensionEnabled;
          await this.settingsManager.setExtensionState({
            ...state,
            extensionEnabled: newEnabled
          });
          const tabs = await this.getAmazonTabs();
          for (const tab of tabs) {
            try {
              await chrome.tabs.sendMessage(tab.id, {
                action: newEnabled ? 'enable' : 'disable'
              });
            } catch { /* tab may not have content script */ }
          }
          sendResponse({ success: true, enabled: newEnabled });
          break;
        }

        case 'getExtensionStatus': {
          const state    = await this.settingsManager.getExtensionState();
          const manifest = chrome.runtime.getManifest();
          sendResponse({
            success: true,
            data: {
              version:     manifest.version,
              enabled:     state.extensionEnabled,
              installDate: state.installDate
            }
          });
          break;
        }

        case 'ping':
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: `Unknown action: ${request.action}` });
      }
    } catch (error) {
      console.error('Background message error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  // ─── Tab Handling ─────────────────────────────────────────────────────────

  async handleTabUpdate(tabId, changeInfo, tab) {
    if (changeInfo.status !== 'complete' || !tab.url) return;
    if (!AMAZON_URL_PATTERN.test(tab.url)) return;

    const state = await this.settingsManager.getExtensionState();
    if (!state.extensionEnabled) return;

    try {
      await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    } catch {
      // Content script not present — inject it
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: [
            'lib/jspdf.umd.min.js',
            'lib/jsbarcode.all.min.js',
            'content/element-registry.js',
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
      } catch (injectionError) {
        console.error('Failed to inject content script:', injectionError);
      }
    }
  }

  // ─── Push State to All Amazon Tabs ────────────────────────────────────────

  /**
   * After any write, push fresh settings + templates to all Amazon tabs
   * so content script caches are never stale.
   */
  async pushStateToTabs() {
    try {
      const settings  = await this.settingsManager.getSettings();
      const templates = await this.templateManager.getAllTemplates();
      const tabs      = await this.getAmazonTabs();

      for (const tab of tabs) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            action: 'stateUpdated',
            settings,
            templates
          });
        } catch { /* tab may not have content script */ }
      }
    } catch (error) {
      console.error('Failed to push state to tabs:', error);
    }
  }

  async getAmazonTabs() {
    try {
      return await chrome.tabs.query({ url: AMAZON_URLS });
    } catch {
      return [];
    }
  }

  // ─── Notifications ────────────────────────────────────────────────────────

  showWelcomeNotification() {
    chrome.notifications.create({
      type:    'basic',
      iconUrl: 'icons/logo-48.png',
      title:   'Amazon FNSKU Label Printer Installed!',
      message: 'Visit Amazon Seller Central to start printing FNSKU labels.'
    });
  }
}

new BackgroundService();
