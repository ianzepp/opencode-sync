#!/bin/bash

# Script to prepare package.json for NPM publishing
# Run this before publishing to NPM

set -e

echo "📝 Preparing package.json for NPM publishing..."

# Backup original package.json
cp package.json package.json.backup

# Update package.json with proper fields for NPM
cat > package.json << 'EOF'
{
  "name": "opencode-sync",
  "version": "1.0.0",
  "description": "Sync OpenCode conversations between machines using shared directories",
  "main": "dist/cli.js",
  "bin": {
    "opencode-sync": "dist/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "prepublishOnly": "npm run build",
    "start": "node dist/cli.js",
    "test": "node dist/cli.js --help"
  },
  "keywords": [
    "opencode",
    "sync",
    "conversations",
    "backup",
    "cli",
    "typescript",
    "cross-machine",
    "usb",
    "cloud-sync"
  ],
  "author": "Your Name <your.email@example.com>",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/YOUR_USERNAME/opencode-sync.git"
  },
  "bugs": {
    "url": "https://github.com/YOUR_USERNAME/opencode-sync/issues"
  },
  "homepage": "https://github.com/YOUR_USERNAME/opencode-sync#readme",
  "dependencies": {
    "commander": "^11.1.0",
    "chalk": "^5.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.8.0",
    "typescript": "^5.2.2"
  },
  "engines": {
    "node": ">=16.0.0"
  },
  "files": [
    "dist/",
    "install.sh",
    "README.md",
    "QUICKSTART.md"
  ],
  "preferGlobal": true
}
EOF

echo "✅ package.json updated for NPM publishing"
echo ""
echo "Next steps:"
echo "1. Review the changes in package.json"
echo "2. Update author information and repository URLs"
echo "3. Run: npm publish"
echo ""
echo "To restore original package.json:"
echo "mv package.json.backup package.json"