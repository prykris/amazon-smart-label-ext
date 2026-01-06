/**
 * Settings Manager
 * Centralized settings management service with auto-save functionality
 */

class SettingsManager {
  constructor() {
    this.settings = {
      selectedTemplateId: 'thermal_57x32',
      globalSettings: {
        barcodeFormat: 'CODE128',
        autoExtract: true,
        autoOpenTabs: false,
        debugMode: false,
        lastSelectedTab: 'downloads'
      },
      lastUpdated: new Date().toISOString()
    };

    this.eventListeners = new Map();
    this.saveTimeout = null;
    this.saveDelay = 500; // 500ms debounce
    this.initialized = false;
    this.saving = false;
  }

  /**
   * Initialize the settings manager
   */
  async init() {
    if (this.initialized) return;
    
    try {
      await this.loadSettings();
      this.initialized = true;
      this.emit('initialized', this.settings);
    } catch (error) {
      console.error('Failed to initialize SettingsManager:', error);
      throw error;
    }
  }

  /**
   * Get all settings
   * @returns {Object} Current settings
   */
  async getSettings() {
    await this.ensureInitialized();
    return { ...this.settings };
  }

  /**
   * Get selected template ID
   * @returns {string} Selected template ID
   */
  async getSelectedTemplateId() {
    await this.ensureInitialized();
    return this.settings.selectedTemplateId;
  }

  /**
   * Set selected template ID
   * @param {string} templateId - Template ID to select
   */
  async setSelectedTemplateId(templateId) {
    await this.ensureInitialized();
    
    if (this.settings.selectedTemplateId !== templateId) {
      this.settings.selectedTemplateId = templateId;
      this.settings.lastUpdated = new Date().toISOString();
      
      this.emit('templateSelected', templateId);
      this.emit('settingsChanged', this.settings);
      
      await this.debouncedSave();
    }
  }

  /**
   * Get global settings
   * @returns {Object} Global settings
   */
  async getGlobalSettings() {
    await this.ensureInitialized();
    return { ...this.settings.globalSettings };
  }

  /**
   * Update global settings
   * @param {Object} newSettings - Settings to update
   */
  async updateGlobalSettings(newSettings) {
    await this.ensureInitialized();
    
    const hasChanges = this.hasSettingsChanges(this.settings.globalSettings, newSettings);
    
    if (hasChanges) {
      this.settings.globalSettings = { ...this.settings.globalSettings, ...newSettings };
      this.settings.lastUpdated = new Date().toISOString();
      
      this.emit('globalSettingsChanged', this.settings.globalSettings);
      this.emit('settingsChanged', this.settings);
      
      await this.debouncedSave();
    }
  }

  /**
   * Update a single setting
   * @param {string} key - Setting key
   * @param {*} value - Setting value
   */
  async updateSetting(key, value) {
    await this.ensureInitialized();
    
    if (this.settings.globalSettings[key] !== value) {
      this.settings.globalSettings[key] = value;
      this.settings.lastUpdated = new Date().toISOString();
      
      this.emit('settingChanged', { key, value });
      this.emit('globalSettingsChanged', this.settings.globalSettings);
      this.emit('settingsChanged', this.settings);
      
      await this.debouncedSave();
    }
  }

  /**
   * Reset settings to defaults
   */
  async resetSettings() {
    await this.ensureInitialized();
    
    const defaultSettings = {
      selectedTemplateId: 'thermal_57x32',
      globalSettings: {
        barcodeFormat: 'CODE128',
        autoExtract: true,
        autoOpenTabs: false,
        debugMode: false
      },
      lastUpdated: new Date().toISOString()
    };

    this.settings = defaultSettings;
    
    this.emit('settingsReset', this.settings);
    this.emit('settingsChanged', this.settings);
    
    await this.saveSettings();
    
    return { ...this.settings };
  }

  /**
   * Load settings from storage
   */
  async loadSettings() {
    try {
      // Try new unified storage first
      const result = await chrome.storage.sync.get(['fnsku_extension_settings']);
      
      if (result.fnsku_extension_settings) {
        this.settings = { ...this.settings, ...result.fnsku_extension_settings };
      } else {
        // Try to migrate from old storage format
        await this.migrateOldSettings();
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      // Use defaults if loading fails
    }
  }

  /**
   * Migrate settings from old storage format
   */
  async migrateOldSettings() {
    try {
      const oldResult = await chrome.storage.sync.get([
        'fnskuLabelSettings',
        'extensionSettings'
      ]);

      let migrated = false;

      // Migrate from old fnskuLabelSettings
      if (oldResult.fnskuLabelSettings) {
        const oldSettings = oldResult.fnskuLabelSettings;
        
        // Map old settings to new format
        if (oldSettings.templateId) {
          this.settings.selectedTemplateId = oldSettings.templateId;
          migrated = true;
        }
        
        if (oldSettings.barcodeFormat) {
          this.settings.globalSettings.barcodeFormat = oldSettings.barcodeFormat;
          migrated = true;
        }
        
        if (typeof oldSettings.autoExtract !== 'undefined') {
          this.settings.globalSettings.autoExtract = oldSettings.autoExtract;
          migrated = true;
        }
        
        if (typeof oldSettings.autoOpenTabs !== 'undefined') {
          this.settings.globalSettings.autoOpenTabs = oldSettings.autoOpenTabs;
          migrated = true;
        }
        
        if (typeof oldSettings.debugMode !== 'undefined') {
          this.settings.globalSettings.debugMode = oldSettings.debugMode;
          migrated = true;
        }
      }

      // Migrate from old extensionSettings
      if (oldResult.extensionSettings && oldResult.extensionSettings.labelSettings) {
        const oldLabelSettings = oldResult.extensionSettings.labelSettings;
        
        if (oldLabelSettings.template) {
          this.settings.selectedTemplateId = oldLabelSettings.template;
          migrated = true;
        }
      }

      if (migrated) {
        this.settings.lastUpdated = new Date().toISOString();
        await this.saveSettings();
        
        // Clean up old storage keys
        try {
          await chrome.storage.sync.remove(['fnskuLabelSettings', 'extensionSettings']);
        } catch (error) {
          console.warn('Failed to clean up old storage keys:', error);
        }
        
        console.log('Settings migrated from old format');
      }
    } catch (error) {
      console.error('Failed to migrate old settings:', error);
    }
  }

  /**
   * Save settings to storage
   */
  async saveSettings() {
    if (this.saving) return;
    
    this.saving = true;
    
    try {
      await chrome.storage.sync.set({
        fnsku_extension_settings: this.settings
      });
      
      this.emit('settingsSaved', this.settings);
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.emit('settingsSaveError', error);
      throw error;
    } finally {
      this.saving = false;
    }
  }

  /**
   * Debounced save to avoid excessive storage writes
   */
  async debouncedSave() {
    // Clear existing timeout
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    // Set new timeout
    this.saveTimeout = setTimeout(async () => {
      try {
        await this.saveSettings();
      } catch (error) {
        console.error('Debounced save failed:', error);
      }
    }, this.saveDelay);

    // Emit saving state
    this.emit('settingsSaving', true);
  }

  /**
   * Check if settings have changes
   * @param {Object} oldSettings - Old settings
   * @param {Object} newSettings - New settings
   * @returns {boolean} True if there are changes
   */
  hasSettingsChanges(oldSettings, newSettings) {
    const oldKeys = Object.keys(oldSettings);
    const newKeys = Object.keys(newSettings);
    
    // Check if keys are different
    if (oldKeys.length !== newKeys.length) {
      return true;
    }
    
    // Check if values are different
    for (const key of newKeys) {
      if (oldSettings[key] !== newSettings[key]) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Get setting by key
   * @param {string} key - Setting key
   * @returns {*} Setting value
   */
  async getSetting(key) {
    await this.ensureInitialized();
    return this.settings.globalSettings[key];
  }

  /**
   * Check if settings are currently being saved
   * @returns {boolean} True if saving
   */
  isSaving() {
    return this.saving || this.saveTimeout !== null;
  }

  /**
   * Force immediate save (bypass debounce)
   */
  async forceSave() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    
    await this.saveSettings();
  }

  /**
   * Ensure manager is initialized
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.init();
    }
  }

  /**
   * Add event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  off(event, callback) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit event
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Get extension state (enabled/disabled)
   */
  async getExtensionState() {
    try {
      const result = await chrome.storage.sync.get(['fnsku_extension_state']);
      return result.fnsku_extension_state || {
        extensionEnabled: true,
        installDate: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to get extension state:', error);
      return {
        extensionEnabled: true,
        installDate: new Date().toISOString()
      };
    }
  }

  /**
   * Set extension state
   * @param {Object} state - Extension state
   */
  async setExtensionState(state) {
    try {
      await chrome.storage.sync.set({
        fnsku_extension_state: state
      });
      
      this.emit('extensionStateChanged', state);
    } catch (error) {
      console.error('Failed to set extension state:', error);
      throw error;
    }
  }

  /**
   * Export settings for backup
   * @returns {Object} Exportable settings
   */
  async exportSettings() {
    await this.ensureInitialized();
    
    return {
      settings: { ...this.settings },
      exportedAt: new Date().toISOString(),
      version: '1.0.0'
    };
  }

  /**
   * Import settings from backup
   * @param {Object} importData - Settings to import
   */
  async importSettings(importData) {
    if (!importData.settings) {
      throw new Error('Invalid import data');
    }

    const newSettings = {
      ...this.settings,
      ...importData.settings,
      lastUpdated: new Date().toISOString()
    };

    this.settings = newSettings;
    
    this.emit('settingsImported', this.settings);
    this.emit('settingsChanged', this.settings);
    
    await this.saveSettings();
    
    return { ...this.settings };
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    
    this.eventListeners.clear();
    this.initialized = false;
  }
}

// Export for use in other modules
window.SettingsManager = SettingsManager;