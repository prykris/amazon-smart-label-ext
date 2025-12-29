# Amazon FNSKU Smart Label Printer

A Chrome extension that adds smart label printing functionality to Amazon Seller Central inventory pages. Generate and print FNSKU labels directly from your inventory management interface with advanced configuration options.

## Features

### 🖨️ Smart Label Generation
- **One-click printing** with quantity control
- **Multiple label formats**: Thermal (57x32mm), Shipping (4"x6"), Custom sizes
- **Barcode support**: CODE128, CODE39, EAN13
- **Automatic data extraction**: SKU, FNSKU, ASIN, product title

### ⌨️ Advanced Controls
- **Normal Click**: Download PDF labels
- **Ctrl + Click**: Open labels in new tab
- **Shift + Click**: Open configuration dialog
- **Quantity input**: Generate 1-99 duplicate labels

### ⚙️ Configuration Options
- **Label templates** with customizable dimensions
- **Font size adjustments** for all text elements
- **Product image inclusion** (optional)
- **Persistent settings** across sessions

### 🔧 Robust Architecture
- **DOM-agnostic extraction** - works despite Amazon's CSS changes
- **Multiple fallback strategies** for data extraction
- **Real-time button injection** with MutationObserver
- **Error handling** with user notifications

## Installation

### Prerequisites
1. **Chrome Browser** (version 88+)
2. **Amazon Seller Central Account**
3. **Required Libraries** (see setup instructions below)

### Setup Instructions

#### 1. Download Required Libraries
Create a `lib` folder in the extension directory and download these files:

```bash
# Create lib directory
mkdir amazon-fnsku-extension/lib

# Download jsPDF (save as jspdf.umd.min.js)
# URL: https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js

# Download JsBarcode (save as jsbarcode.all.min.js)  
# URL: https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.5/JsBarcode.all.min.js
```

#### 2. Create Extension Icons
Create these icon files in the `icons` folder:

- **icon16.png** (16x16 pixels) - Toolbar icon
- **icon48.png** (48x48 pixels) - Extension management
- **icon128.png** (128x128 pixels) - Chrome Web Store

**Icon Requirements:**
- Format: PNG with transparency
- Style: Simple printer or label icon
- Colors: Blue (#0066c0) and white theme
- Design: Clean, recognizable at small sizes

#### 3. Install Extension
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (top-right toggle)
3. Click "Load unpacked"
4. Select the `amazon-fnsku-extension` folder
5. The extension should appear in your extensions list

## Usage

### Basic Usage
1. **Navigate** to Amazon Seller Central inventory page
2. **Locate** the 🖨️ button next to each product row
3. **Set quantity** using the number input (1-99)
4. **Click** the print button to download labels

### Advanced Usage

#### Modifier Keys
- **Normal Click**: Downloads PDF file directly
- **Ctrl + Click**: Opens PDF in new browser tab
- **Shift + Click**: Opens configuration dialog

#### Configuration Dialog
Access via Shift + Click on any print button:

- **Label Template**: Choose from preset sizes or custom dimensions
- **Barcode Format**: Select CODE128, CODE39, or EAN13
- **Content Options**: Include/exclude product images
- **Font Sizes**: Adjust text sizing for optimal readability

### Supported Pages
- Manage Inventory (`/inventory`)
- SKU Central (`/skucentral`)
- FBA Profitability (`/fba/profitability`)
- Restock Inventory (`/restockInventory`)

## File Structure

```
amazon-fnsku-extension/
├── manifest.json                 # Extension configuration
├── content/
│   ├── content.js               # Main content script
│   ├── extractor.js             # Data extraction logic
│   ├── pdf-generator.js         # PDF creation and templates
│   └── ui-controller.js         # UI management and events
├── background/
│   └── background.js            # Service worker
├── popup/
│   ├── popup.html              # Extension popup interface
│   ├── popup.css               # Popup styling
│   └── popup.js                # Popup functionality
├── styles/
│   └── content.css             # Injected page styles
├── lib/                        # External libraries (you need to add these)
│   ├── jspdf.umd.min.js        # PDF generation library
│   └── jsbarcode.all.min.js    # Barcode generation library
├── icons/                      # Extension icons (you need to create these)
│   ├── icon16.png              # 16x16 toolbar icon
│   ├── icon48.png              # 48x48 management icon
│   └── icon128.png             # 128x128 store icon
└── README.md                   # This file
```

## Technical Details

### Data Extraction Strategy
The extension uses a robust, multi-strategy approach to extract product data:

1. **Primary Strategy**: Text-based label finding
   - Searches for "FNSKU", "ASIN", "SKU" labels
   - Traverses DOM to find corresponding values
   - Works regardless of CSS class changes

2. **Fallback Strategies**: Pattern matching and user input
   - Regex patterns for FNSKU (X002HB9ZDL format)
   - ASIN pattern matching (B0FXH65FKG format)
   - User prompts for missing critical data

3. **Stable Selectors**: 
   - `div[data-sku]` for row identification
   - Product links with `/dp/` patterns
   - Image elements for titles and thumbnails

### Label Templates

#### Thermal 57x32mm (Default)
- **Dimensions**: 57mm × 32mm
- **Orientation**: Landscape
- **Elements**: Barcode, FNSKU, SKU, Title
- **Use Case**: Standard thermal label printers

#### Thermal 57x32mm (Minimal)
- **Dimensions**: 57mm × 32mm
- **Orientation**: Landscape  
- **Elements**: Barcode, FNSKU only
- **Use Case**: Space-constrained applications

#### Shipping 4"×6"
- **Dimensions**: 101.6mm × 152.4mm
- **Orientation**: Portrait
- **Elements**: Barcode, FNSKU, SKU, Title, Product Image
- **Use Case**: Large format shipping labels

#### Custom Size
- **Dimensions**: User-defined
- **Orientation**: Auto-detected
- **Elements**: Configurable
- **Use Case**: Specialized label stock

## Troubleshooting

### Common Issues

#### Extension Not Working
1. **Check page compatibility**: Only works on Amazon Seller Central
2. **Verify installation**: Extension should be enabled in chrome://extensions/
3. **Refresh page**: Try reloading the inventory page
4. **Check console**: Look for error messages in browser developer tools

#### Missing Print Buttons
1. **Wait for page load**: Buttons inject after DOM is ready
2. **Check for updates**: Amazon may have changed their layout
3. **Try different page**: Test on /inventory or /skucentral
4. **Disable other extensions**: Check for conflicts

#### Data Extraction Failures
1. **Manual input**: Extension will prompt for missing FNSKU
2. **Check product data**: Ensure FNSKU exists in Amazon's system
3. **Try different products**: Some products may have incomplete data
4. **Report issues**: Use the popup's "Report Issue" button

#### PDF Generation Errors
1. **Check libraries**: Ensure jsPDF and JsBarcode are properly loaded
2. **Browser compatibility**: Use Chrome 88+ for best results
3. **Memory issues**: Try generating fewer labels at once
4. **Popup blockers**: Disable for Amazon Seller Central

### Debug Mode
Enable debug logging in the popup settings for detailed troubleshooting information.

## Privacy & Security

### Data Handling
- **Local processing only**: No data sent to external servers
- **No tracking**: Extension doesn't collect usage analytics
- **Secure storage**: Settings stored locally using Chrome's secure storage API
- **Minimal permissions**: Only requests necessary browser permissions

### Permissions Used
- **activeTab**: Access current Amazon Seller Central tab
- **scripting**: Inject content scripts for functionality
- **storage**: Save user preferences and settings
- **host_permissions**: Amazon Seller Central domains only

## Contributing

### Development Setup
1. Clone the repository
2. Install required libraries in `/lib` folder
3. Create icon files in `/icons` folder
4. Load extension in Chrome developer mode
5. Make changes and test on Amazon Seller Central

### Reporting Issues
Use the "Report Issue" button in the extension popup or create an issue on GitHub with:
- Extension version
- Browser version
- Steps to reproduce
- Error messages (if any)

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Changelog

### Version 1.0.0
- Initial release
- Smart button injection with quantity control
- Multiple label templates and formats
- Configuration dialog with persistent settings
- Robust data extraction with fallback strategies
- Modifier key support (Ctrl, Shift)
- Error handling and user notifications
- Popup interface for extension management

## Support

For support, feature requests, or bug reports:
1. Use the extension's built-in "Report Issue" feature
2. Check the troubleshooting section above
3. Create an issue on the project repository

---

**Note**: This extension is not affiliated with Amazon. It's an independent tool designed to enhance the Amazon Seller Central experience.