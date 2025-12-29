# Amazon FNSKU Extension Setup Script
# This script downloads required JavaScript libraries

Write-Host "Amazon FNSKU Smart Label Printer - Setup Script" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path "manifest.json")) {
    Write-Host "Error: Please run this script from the amazon-fnsku-extension directory" -ForegroundColor Red
    Write-Host "The directory should contain manifest.json" -ForegroundColor Red
    exit 1
}

# Create lib directory if it doesn't exist
Write-Host "Creating lib directory..." -ForegroundColor Yellow
if (-not (Test-Path "lib")) {
    New-Item -ItemType Directory -Path "lib" -Force | Out-Null
    Write-Host "✓ Created lib directory" -ForegroundColor Green
} else {
    Write-Host "✓ lib directory already exists" -ForegroundColor Green
}

# Download jsPDF
Write-Host ""
Write-Host "Downloading jsPDF library..." -ForegroundColor Yellow
try {
    $jsPdfUrl = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"
    $jsPdfPath = "lib/jspdf.umd.min.js"
    
    if (Test-Path $jsPdfPath) {
        Write-Host "✓ jsPDF already exists, skipping download" -ForegroundColor Green
    } else {
        Invoke-WebRequest -Uri $jsPdfUrl -OutFile $jsPdfPath -UseBasicParsing
        $fileSize = (Get-Item $jsPdfPath).Length
        Write-Host "✓ Downloaded jsPDF ($([math]::Round($fileSize/1KB, 1)) KB)" -ForegroundColor Green
    }
} catch {
    Write-Host "✗ Failed to download jsPDF: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Please download manually from: $jsPdfUrl" -ForegroundColor Yellow
}

# Download JsBarcode
Write-Host ""
Write-Host "Downloading JsBarcode library..." -ForegroundColor Yellow
try {
    $jsBarcodeUrl = "https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.5/JsBarcode.all.min.js"
    $jsBarcodePath = "lib/jsbarcode.all.min.js"
    
    if (Test-Path $jsBarcodePath) {
        Write-Host "✓ JsBarcode already exists, skipping download" -ForegroundColor Green
    } else {
        Invoke-WebRequest -Uri $jsBarcodeUrl -OutFile $jsBarcodePath -UseBasicParsing
        $fileSize = (Get-Item $jsBarcodePath).Length
        Write-Host "✓ Downloaded JsBarcode ($([math]::Round($fileSize/1KB, 1)) KB)" -ForegroundColor Green
    }
} catch {
    Write-Host "✗ Failed to download JsBarcode: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Please download manually from: $jsBarcodeUrl" -ForegroundColor Yellow
}

# Check icons directory
Write-Host ""
Write-Host "Checking icons directory..." -ForegroundColor Yellow
if (-not (Test-Path "icons")) {
    New-Item -ItemType Directory -Path "icons" -Force | Out-Null
    Write-Host "✓ Created icons directory" -ForegroundColor Green
} else {
    Write-Host "✓ icons directory already exists" -ForegroundColor Green
}

# Check for required icon files
$iconFiles = @("icon16.png", "icon48.png", "icon128.png")
$missingIcons = @()

foreach ($icon in $iconFiles) {
    $iconPath = "icons/$icon"
    if (Test-Path $iconPath) {
        $fileSize = (Get-Item $iconPath).Length
        Write-Host "✓ Found $icon ($fileSize bytes)" -ForegroundColor Green
    } else {
        Write-Host "✗ Missing $icon" -ForegroundColor Red
        $missingIcons += $icon
    }
}

# Summary
Write-Host ""
Write-Host "Setup Summary" -ForegroundColor Cyan
Write-Host "=============" -ForegroundColor Cyan

# Check library files
$librariesOk = $true
if (Test-Path "lib/jspdf.umd.min.js") {
    Write-Host "✓ jsPDF library ready" -ForegroundColor Green
} else {
    Write-Host "✗ jsPDF library missing" -ForegroundColor Red
    $librariesOk = $false
}

if (Test-Path "lib/jsbarcode.all.min.js") {
    Write-Host "✓ JsBarcode library ready" -ForegroundColor Green
} else {
    Write-Host "✗ JsBarcode library missing" -ForegroundColor Red
    $librariesOk = $false
}

# Check icons
$iconsOk = $missingIcons.Count -eq 0
if ($iconsOk) {
    Write-Host "✓ All icon files present" -ForegroundColor Green
} else {
    Write-Host "✗ Missing icon files: $($missingIcons -join ', ')" -ForegroundColor Red
}

Write-Host ""
if ($librariesOk -and $iconsOk) {
    Write-Host "🎉 Setup complete! Your extension is ready to install." -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Open Chrome and go to chrome://extensions/" -ForegroundColor White
    Write-Host "2. Enable 'Developer mode' (top-right toggle)" -ForegroundColor White
    Write-Host "3. Click 'Load unpacked' and select this folder" -ForegroundColor White
    Write-Host "4. Navigate to Amazon Seller Central to test" -ForegroundColor White
} else {
    Write-Host "⚠️  Setup incomplete. Please address the missing files above." -ForegroundColor Yellow
    Write-Host ""
    if (-not $librariesOk) {
        Write-Host "For libraries: Check your internet connection and try running the script again." -ForegroundColor Yellow
        Write-Host "Or download manually from the URLs shown above." -ForegroundColor Yellow
    }
    if (-not $iconsOk) {
        Write-Host "For icons: See setup-instructions.md for icon creation options." -ForegroundColor Yellow
        Write-Host "You can use online generators or create simple text-based icons." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "For detailed setup instructions, see: setup-instructions.md" -ForegroundColor Cyan
Write-Host "For usage instructions, see: README.md" -ForegroundColor Cyan

# Pause to let user read the output
Write-Host ""
Write-Host "Press any key to continue..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")