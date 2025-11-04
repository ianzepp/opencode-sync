# Quick Start Guide

## Installation

### Option 1: CURL Installation (Quickest)
```bash
# One-line installation
curl -fsSL https://raw.githubusercontent.com/ianzepp/opencode-sync/main/install.sh | bash
```

### Option 2: Install from source (recommended for development)
```bash
git clone <repository-url>
cd opencode-sync
./install.sh
```

### Option 3: Manual installation
```bash
# Install dependencies
bun install  # or npm install

# Build the project
bun run build  # or npm run build

# Link globally
bun link  # or npm link
```

## Configuration

Add these to your shell profile (`.bashrc`, `.zshrc`, etc.):

```bash
# Path to OpenCode storage (usually this location)
export OPENCODE_STORAGE_DIR="$HOME/.local/share/opencode/storage"

# Path to your sync directory (USB, cloud storage, etc.)
export OPENCODE_SYNC_DIR="/path/to/your/sync/directory"
```

## Basic Usage

```bash
# Check what needs sync
opencode-sync check

# Push local conversations to sync directory
opencode-sync push

# Pull conversations from sync directory
opencode-sync pull

# Full bidirectional sync
opencode-sync sync
```

## Example Workflows

### USB Stick Workflow
```bash
# Machine A
export OPENCODE_SYNC_DIR="/Volumes/USB/opencode-sync"
opencode-sync push

# Move USB to Machine B
export OPENCODE_SYNC_DIR="/media/user/USB/opencode-sync"
opencode-sync pull
# Work on conversations...
opencode-sync push
```

### Cloud Storage Workflow
```bash
# Both machines use the same cloud folder
export OPENCODE_SYNC_DIR="$HOME/Dropbox/opencode-sync"

# Machine A
opencode-sync push

# Machine B (after cloud syncs)
opencode-sync pull
```

## Troubleshooting

### "Environment variable not set"
Make sure both `OPENCODE_STORAGE_DIR` and `OPENCODE_SYNC_DIR` are set.

### "No conversations found"
Ensure OpenCode has created conversations in your storage directory.

### Permission errors
Make sure you have read/write access to both the storage and sync directories.

## Getting Help

```bash
opencode-sync --help
opencode-sync check --help
```

For more detailed documentation, see [README.md](README.md).