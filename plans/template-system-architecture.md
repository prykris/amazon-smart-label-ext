# Unified Template System Architecture Plan

## Overview
This document outlines the comprehensive plan to fix the fractured template system in the Amazon FNSKU Extension and implement a unified, persistent template management system.

## Current Issues Identified

### 1. Fractured Template System
- **PDFLabelGenerator** has built-in templates with hardcoded element positions
- **UIController** has its own template dropdown with hardcoded options
- **PopupController** tries to use templates but has inconsistent template ID handling
- No unified template persistence or global template selection

### 2. Settings Management Issues
- Settings scattered across multiple storage keys (`fnskuLabelSettings`, `extensionSettings`)
- No automatic persistence on changes
- No global template selection that all components use
- Manual entry ignores global settings

### 3. Template Usage Problems
- Smart buttons don't use the selected template from settings
- Manual entry doesn't respect global template selection
- Settings preview doesn't properly use the template system
- No template creation/editing functionality in the UI

### 4. Label Generation Issues
- Half-implemented template system causes generation failures
- Inconsistent settings passing between components
- No proper template validation

## Unified Template System Architecture

### Template Data Structure
```javascript
// Unified Template Schema
{
  id: 'thermal_57x32' | 'user_1234567890',
  name: 'Thermal 57x32mm',
  userCreated: false,
  width: 57,
  height: 32,
  orientation: 'landscape',
  elements: {
    barcode: { x: 4, y: 2, width: 49, height: 12 },
    fnsku: { x: 28.5, y: 17, fontSize: 8, align: 'center', bold: false },
    sku: { x: 28.5, y: 22, fontSize: 11, align: 'center', bold: true },
    title: { x: 28.5, y: 26, fontSize: 6, align: 'center', maxLength: 50 },
    image: { x: 10, y: 100, width: 30, height: 30 } // optional
  },
  contentInclusion: {
    barcode: true,
    fnsku: true,
    sku: true,
    title: true,
    images: false
  },
  createdAt: '2025-12-30T16:49:00.000Z',
  updatedAt: '2025-12-30T16:49:00.000Z'
}
```

### Settings Data Structure
```javascript
// Unified Settings Schema
{
  selectedTemplateId: 'thermal_57x32',
  globalSettings: {
    barcodeFormat: 'CODE128',
    autoExtract: true,
    autoOpenTabs: false,
    debugMode: false
  },
  lastUpdated: '2025-12-30T16:49:00.000Z'
}
```

### Data Flow Architecture
```
Settings Tab → Global Settings Store → chrome.storage.sync (auto-save 500ms debounce)
                     ↓
Smart Buttons ← Global Template Selection
Manual Entry ← Local Override OR Global Template
Settings Preview ← Current Template

Template Manager → Template Store → chrome.storage.sync
                     ↓
PDF Generator ← Template Data + Selected Template
```

## Component Responsibilities

### TemplateManager (New Centralized Service)
- **CRUD operations** for templates
- **Template validation** and schema enforcement
- **Storage management** (chrome.storage.sync)
- **Event broadcasting** for template changes

### SettingsManager (Enhanced)
- **Global settings persistence** with auto-save
- **Template selection tracking**
- **Settings validation** and defaults
- **Cross-component settings sync**

### PDFLabelGenerator (Refactored)
- **Pure label generation** using provided template
- **Template rendering engine**
- **Barcode generation**
- **No template storage** (delegates to TemplateManager)

### PopupController (Enhanced)
- **Template selection UI**
- **Template creation/editing modals**
- **Settings form with auto-save**
- **Preview generation**

### UIController (Updated)
- **Smart button creation**
- **Global template usage**
- **Settings synchronization**

## Implementation Strategy

### Phase 1: Core Template System
1. **Create TemplateManager service** (`content/template-manager.js`)
   - Template CRUD operations
   - Storage management with chrome.storage.sync
   - Template validation and schema enforcement
   - Event system for template changes

2. **Create SettingsManager service** (`content/settings-manager.js`)
   - Unified settings management
   - Auto-save with 500ms debounce
   - Global template selection tracking
   - Cross-component synchronization

3. **Refactor PDFLabelGenerator** (`content/pdf-generator.js`)
   - Remove template storage logic
   - Focus on pure label generation
   - Use templates provided by TemplateManager
   - Maintain backward compatibility

4. **Update BackgroundService** (`background/background.js`)
   - Unified storage schema
   - Settings migration from old format
   - Template and settings synchronization

### Phase 2: Settings Integration
1. **Update PopupController** (`popup/popup.js`)
   - Implement auto-save with debounced persistence
   - Add template management UI
   - Create template creation/editing modal
   - Fix settings preview with proper template usage

2. **Update Popup HTML** (`popup/popup.html`)
   - Add template management buttons
   - Add local template dropdown to Manual Entry
   - Remove save button, add reset button
   - Update form structure for auto-save

3. **Enhance Settings Form**
   - Real-time validation
   - Visual feedback for saving
   - Error handling for storage failures
   - Template-specific settings

### Phase 3: Component Updates
1. **Update UIController** (`content/ui-controller.js`)
   - Use global template selection
   - Remove local template logic
   - Implement settings synchronization
   - Update configuration dialog

2. **Update Smart Buttons**
   - Use global template by default
   - Respect all global settings
   - Remove local template selection
   - Proper error handling

3. **Enhance Manual Entry**
   - Add local template dropdown for override
   - Use global template as default
   - Form validation with template-specific rules
   - Real-time preview updates

### Phase 4: Testing & Validation
1. **Template Management Testing**
   - Create, edit, delete user templates
   - Template validation and error handling
   - Built-in template protection
   - Cross-device synchronization

2. **Settings Persistence Testing**
   - Auto-save functionality
   - Settings synchronization across components
   - Error handling and recovery
   - Migration from old settings format

3. **Label Generation Testing**
   - All template types
   - Smart button integration
   - Manual entry with overrides
   - Settings preview accuracy

4. **Cross-Component Integration**
   - Template selection propagation
   - Settings synchronization
   - Error handling and user feedback
   - Performance optimization

## Key Features to Implement

### Auto-Save Settings
- **500ms debounced persistence** on any form change
- **Visual feedback** (saving indicator)
- **Error handling** for storage failures
- **Conflict resolution** for concurrent changes

### Template Management
- **Create/Edit/Delete** user templates
- **Template validation** with user feedback
- **Template preview** in creation modal
- **Built-in template protection** (no editing/deletion)
- **Template export/import** for sharing

### Global Template Selection
- **Single source of truth** for selected template
- **Automatic propagation** to all components
- **Manual Entry override** with separate dropdown
- **Settings tab as primary** template selector

### Smart Button Integration
- **Use global template** by default
- **Respect all global settings** (barcode format, content inclusion, etc.)
- **No local template selection** (uses global only)
- **Proper error handling** and user feedback

### Manual Entry Enhancement
- **Local template dropdown** for quick override
- **Global template as default** selection
- **Form validation** with template-specific rules
- **Real-time preview** updates

## Storage Schema

### chrome.storage.sync Keys
```javascript
{
  // Unified settings
  'fnsku_extension_settings': {
    selectedTemplateId: 'thermal_57x32',
    globalSettings: { ... },
    lastUpdated: '2025-12-30T16:49:00.000Z'
  },
  
  // User templates
  'fnsku_user_templates': {
    'user_1234567890': { ... },
    'user_0987654321': { ... }
  },
  
  // Extension state
  'fnsku_extension_state': {
    extensionEnabled: true,
    installDate: '2025-12-30T16:49:00.000Z'
  }
}
```

## Migration Strategy

### From Current System
1. **Detect old settings** format during initialization
2. **Migrate settings** to new unified schema
3. **Preserve user preferences** and template selections
4. **Clean up old storage** keys after successful migration
5. **Provide fallback** for migration failures

### Backward Compatibility
1. **Maintain existing APIs** during transition
2. **Gradual component updates** to avoid breaking changes
3. **Fallback mechanisms** for missing templates or settings
4. **User notification** for major changes

## Success Criteria

### Functional Requirements
- [ ] All components use the same template system
- [ ] Settings auto-save on every change
- [ ] Global template selection works across all components
- [ ] Manual entry can override global template
- [ ] Template creation/editing works properly
- [ ] Label generation works with all template types

### Technical Requirements
- [ ] Unified storage schema
- [ ] Proper error handling and validation
- [ ] Cross-device synchronization
- [ ] Performance optimization
- [ ] Clean code architecture

### User Experience
- [ ] Intuitive template management
- [ ] Real-time feedback and validation
- [ ] Consistent behavior across components
- [ ] Proper error messages and recovery
- [ ] Smooth migration from old system

## Next Steps

1. **Review and approve** this architectural plan
2. **Begin Phase 1** implementation with TemplateManager
3. **Create detailed implementation** specifications for each component
4. **Set up testing framework** for validation
5. **Plan rollout strategy** for users

This plan addresses all the identified issues and provides a comprehensive solution for the template system problems in the Amazon FNSKU Extension.