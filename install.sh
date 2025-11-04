#!/bin/bash

# OpenCode Sync Installation Script

set -e

echo "🔄 Installing opencode-sync..."

# Check if Node.js or Bun is available
if command -v bun &> /dev/null; then
    echo "✓ Found Bun"
    PACKAGE_MANAGER="bun"
    INSTALL_CMD="bun install"
    BUILD_CMD="bun run build"
elif command -v npm &> /dev/null; then
    echo "✓ Found npm"
    PACKAGE_MANAGER="npm"
    INSTALL_CMD="npm install"
    BUILD_CMD="npm run build"
else
    echo "❌ Error: Neither Bun nor npm found. Please install Node.js or Bun first."
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies with $PACKAGE_MANAGER..."
$INSTALL_CMD

# Build the project
echo "🔨 Building project..."
$BUILD_CMD

# Global installation
echo "🌍 Installing globally..."
if [ "$PACKAGE_MANAGER" = "bun" ]; then
    bun link
else
    npm link
fi

# Verify installation
if command -v opencode-sync &> /dev/null; then
    echo "✅ Installation successful!"
    echo ""
    echo "Next steps:"
    echo "1. Set environment variables:"
    echo "   export OPENCODE_STORAGE_DIR=\"\$HOME/.local/share/opencode/storage\""
    echo "   export OPENCODE_SYNC_DIR=\"/path/to/your/sync/directory\""
    echo ""
    echo "2. Test the installation:"
    echo "   opencode-sync --help"
    echo ""
    echo "3. Check sync status:"
    echo "   opencode-sync check"
else
    echo "❌ Installation failed. Please check the error messages above."
    exit 1
fi