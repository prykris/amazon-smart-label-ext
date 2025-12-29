# Setup Instructions for Amazon FNSKU Extension

## Required Files You Need to Add

### 1. JavaScript Libraries
Download these files and place them in the `lib/` folder:

#### jsPDF Library
- **File**: `jspdf.umd.min.js`
- **URL**: https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js
- **Size**: ~500KB
- **Purpose**: PDF generation

#### JsBarcode Library  
- **File**: `jsbarcode.all.min.js`
- **URL**: https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.5/JsBarcode.all.min.js
- **Size**: ~100KB
- **Purpose**: Barcode generation

### 2. Extension Icons
Create these PNG files in the `icons/` folder:

#### icon16.png (16×16 pixels)
- **Purpose**: Browser toolbar icon
- **Requirements**: 
  - PNG format with transparency
  - Simple printer/label icon design
  - Blue (#0066c0) and white color scheme
  - Clear at small size

#### icon48.png (48×48 pixels)
- **Purpose**: Extension management page
- **Requirements**:
  - PNG format with transparency
  - Same design as 16px version
  - More detail allowed at larger size

#### icon128.png (128×128 pixels)
- **Purpose**: Chrome Web Store listing
- **Requirements**:
  - PNG format with transparency
  - High-quality version of same design
  - Professional appearance

## Quick Setup Commands

### For Windows (PowerShell):
```powershell
# Create lib directory
New-Item -ItemType Directory -Path "lib" -Force

# Download jsPDF
Invoke-WebRequest -Uri "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" -OutFile "lib/jspdf.umd.min.js"

# Download JsBarcode
Invoke-WebRequest -Uri "https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.5/JsBarcode.all.min.js" -OutFile "lib/jsbarcode.all.min.js"

Write-Host "Libraries downloaded successfully!"
Write-Host "Now you need to create icon files in the icons/ folder"
```

### For macOS/Linux (Terminal):
```bash
# Create lib directory
mkdir -p lib

# Download jsPDF
curl -o lib/jspdf.umd.min.js https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js

# Download JsBarcode
curl -o lib/jsbarcode.all.min.js https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.5/JsBarcode.all.min.js

echo "Libraries downloaded successfully!"
echo "Now you need to create icon files in the icons/ folder"
```

## Icon Creation Options

### Option 1: Use Online Icon Generators
1. **Favicon.io**: https://favicon.io/favicon-generator/
   - Enter text: "📄" or "🖨️"
   - Choose blue background (#0066c0)
   - Download and rename files

2. **Canva**: https://canva.com
   - Create custom design
   - Use printer or label icon
   - Export as PNG in required sizes

### Option 2: Use Free Icon Resources
1. **Feather Icons**: https://feathericons.com/
   - Search for "printer" or "file-text"
   - Download SVG and convert to PNG

2. **Heroicons**: https://heroicons.com/
   - Search for "printer" or "document"
   - Download and resize

### Option 3: Simple Text Icons
Create simple text-based icons using any image editor:
- Background: Blue (#0066c0)
- Text: White "📄" or "🖨️" emoji
- Font: System default, centered

## Verification Steps

### 1. Check File Structure
Your extension folder should look like this:
```
amazon-fnsku-extension/
├── manifest.json
├── content/
│   ├── content.js
│   ├── extractor.js
│   ├── pdf-generator.js
│   └── ui-controller.js
├── background/
│   └── background.js
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── styles/
│   └── content.css
├── lib/                        ← ADD THESE FILES
│   ├── jspdf.umd.min.js       ← REQUIRED
│   └── jsbarcode.all.min.js   ← REQUIRED
├── icons/                      ← ADD THESE FILES
│   ├── icon16.png             ← REQUIRED
│   ├── icon48.png             ← REQUIRED
│   └── icon128.png            ← REQUIRED
└── README.md
```

### 2. Test Library Loading
1. Open Chrome Developer Tools (F12)
2. Go to Console tab
3. Load the extension
4. Check for any library loading errors

### 3. Test Icon Display
1. Load extension in Chrome
2. Check if icon appears in toolbar
3. Verify icon shows in chrome://extensions/

## Installation Process

### 1. Prepare Extension
1. Download required libraries (see commands above)
2. Create icon files (see options above)
3. Verify file structure

### 2. Load in Chrome
1. Open Chrome
2. Go to `chrome://extensions/`
3. Enable "Developer mode" (top-right toggle)
4. Click "Load unpacked"
5. Select the `amazon-fnsku-extension` folder
6. Extension should appear in list

### 3. Test Functionality
1. Navigate to Amazon Seller Central
2. Go to Manage Inventory page
3. Look for 🖨️ buttons next to products
4. Test printing a label

## Troubleshooting Setup

### Libraries Not Loading
- **Check file names**: Must be exactly `jspdf.umd.min.js` and `jsbarcode.all.min.js`
- **Check file location**: Must be in `lib/` folder
- **Check file size**: jsPDF should be ~500KB, JsBarcode ~100KB
- **Re-download**: Try downloading again if files seem corrupted

### Icons Not Showing
- **Check file format**: Must be PNG files
- **Check file names**: Must be exactly `icon16.png`, `icon48.png`, `icon128.png`
- **Check file location**: Must be in `icons/` folder
- **Check transparency**: Icons should have transparent backgrounds

### Extension Won't Load
- **Check manifest.json**: Ensure no syntax errors
- **Check console**: Look for error messages in Chrome DevTools
- **Check permissions**: Ensure all files are readable
- **Restart Chrome**: Sometimes required after loading extension

## Alternative Setup (Manual Download)

If the automated commands don't work:

### 1. Manual Library Download
1. Open browser and go to:
   - https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js
   - https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.5/JsBarcode.all.min.js
2. Right-click and "Save As" to `lib/` folder
3. Ensure correct filenames

### 2. Manual Icon Creation
1. Use any image editor (Paint, GIMP, Photoshop, etc.)
2. Create 16×16, 48×48, and 128×128 pixel images
3. Use simple printer or document icon
4. Save as PNG with transparency
5. Place in `icons/` folder

## Ready to Use!

Once you have:
- ✅ Downloaded both JavaScript libraries
- ✅ Created all three icon files
- ✅ Loaded extension in Chrome
- ✅ Verified no console errors

Your Amazon FNSKU Smart Label Printer extension is ready to use!

Navigate to Amazon Seller Central and start printing labels! 🖨️