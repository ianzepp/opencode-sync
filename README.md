# OpenCode Sync

[![CI](https://github.com/ianzepp/opencode-sync/workflows/CI/badge.svg)](https://github.com/ianzepp/opencode-sync/actions)
[![Release](https://github.com/ianzepp/opencode-sync/workflows/Release/badge.svg)](https://github.com/ianzepp/opencode-sync/releases)
[![npm version](https://badge.fury.io/js/opencode-sync.svg)](https://badge.fury.io/js/opencode-sync)

Sync OpenCode conversations between machines using a shared directory (USB stick, cloud storage, etc.).

## Features

- **Bidirectional sync** between local OpenCode storage and shared directory
- **Flexible sync location** - works with USB sticks, cloud storage, network drives
- **Incremental updates** - only syncs changed conversations
- **Colorized output** - clear visual feedback on sync status
- **Simple configuration** - just two environment variables
- **Fast detection** - quickly identifies what needs sync
- **Import support** - import conversations from ChatGPT, Claude, and other formats
- **Format detection** - automatically detect conversation formats in directories

## Installation

### Option 1: CURL Installation (Quickest)
```bash
# One-line installation
curl -fsSL https://raw.githubusercontent.com/ianzepp/opencode-sync/main/install.sh | bash
```

**Note:** Replace `ianzepp` with your actual GitHub username when you fork this repository.

### Option 2: Using NPM
```bash
npm install -g opencode-sync
```

### Option 3: From source (recommended for development)
```bash
git clone <repository-url>
cd opencode-sync
./install.sh
```

### Option 4: Manual installation
```bash
# Install dependencies
bun install  # or npm install

# Build the project
bun run build  # or npm run build

# Link globally
bun link  # or npm link
```

## Configuration

Set two environment variables:

```bash
# Required: Path to OpenCode storage directory
export OPENCODE_STORAGE_DIR="$HOME/.local/share/opencode/storage"

# Required: Path to your sync directory (USB, cloud storage, etc.)
export OPENCODE_SYNC_DIR="/path/to/your/sync/directory"
```

Add these to your `.bashrc`, `.zshrc`, or shell profile to make them permanent.

## Usage

**Note:** Both `push` and `pull` commands accept an optional path parameter that overrides the `OPENCODE_SYNC_DIR` environment variable. The `sync` command now supports optional path parameters for flexible sync operations between any directories.

### Check sync status
```bash
opencode-sync check
```
Shows which conversations need to be pushed or pulled.

### Push local conversations to sync directory
```bash
opencode-sync push
```
Copies your local OpenCode conversations to the sync directory.

**With custom path:**
```bash
opencode-sync push /tmp/archive
```
Push to a specific directory instead of $OPENCODE_SYNC_DIR.

### Pull conversations from sync directory
```bash
opencode-sync pull
```
Imports conversations from the sync directory to your local OpenCode storage.

**With custom path:**
```bash
opencode-sync pull /tmp/archive
```
Pull from a specific directory instead of $OPENCODE_SYNC_DIR.

### Full bidirectional sync
```bash
opencode-sync sync
```
Performs push then pull in one command.

**With custom paths:**
```bash
# Sync to specific directory
opencode-sync sync /tmp/archive

# Sync between two directories
opencode-sync sync /tmp/archive /backup/archive
```

### Import conversations from external formats
```bash
# Import from detected format
opencode-sync import /path/to/conversations --format chatgpt

# Preview import without making changes
opencode-sync import /path/to/conversations --format claude --preview
```

**Supported formats:** `opencode`, `claude`, `chatgpt`

### Scan directory for conversation formats
```bash
opencode-sync scan /path/to/directory
```
Detects which conversation format is present in the directory.

## Workflow Examples

### USB Stick Workflow
```bash
# Machine A: Save conversations to USB
export OPENCODE_SYNC_DIR="/Volumes/USB/opencode-sync"
opencode-sync push

# Move USB to Machine B
export OPENCODE_SYNC_DIR="/media/user/USB/opencode-sync"
opencode-sync pull
# Work on conversations...
opencode-sync push

# Move USB back to Machine A
opencode-sync pull
```

### Cloud Storage Workflow
```bash
# Machine A: Sync to Dropbox/Drive folder
export OPENCODE_SYNC_DIR="$HOME/Dropbox/opencode-sync"
opencode-sync push

# Machine B: After cloud sync
export OPENCODE_SYNC_DIR="$HOME/Dropbox/opencode-sync"
opencode-sync pull
# Work on conversations...
opencode-sync push
```

### Network Drive Workflow
```bash
# Both machines use same network location
export OPENCODE_SYNC_DIR="/mnt/shared/opencode-sync"

# Machine A
opencode-sync push

# Machine B
opencode-sync pull
```

### Archive Sync Workflow
```bash
# Create a temporary backup to /tmp
opencode-sync sync /tmp/opencode-backup

# Sync between different backup locations
opencode-sync sync /tmp/backup /external/backup

# Sync between two existing archives
opencode-sync sync /path/to/archive1 /path/to/archive2
```

### Temporary Archive Workflow
```bash
# Create a temporary backup to /tmp
opencode-sync push /tmp/opencode-backup

# Later, restore from the backup
opencode-sync pull /tmp/opencode-backup
```

## Directory Structure

The sync directory will be organized as:
```
opencode-sync/
├── conversations/
│   ├── conv_6de9c72abffe.json
│   ├── conv_5b5f55168ffef.json
│   └── ...
└── sync-index.json          # Optional: sync metadata
```

## How It Works

1. **Detection**: Scans both local OpenCode storage and sync directory
2. **Comparison**: Compares conversation update timestamps
3. **Sync**: Copies newer conversations to update older locations
4. **Tracking**: Uses file timestamps for change detection

## Requirements

- Node.js 16+
- OpenCode installed and configured
- Access to OpenCode storage directory
- Write access to sync directory

## Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `OPENCODE_STORAGE_DIR` | ✅ | Path to OpenCode storage | `$HOME/.local/share/opencode/storage` |
| `OPENCODE_SYNC_DIR` | ✅ | Path to sync directory | `/Volumes/USB/opencode-sync` |

## Troubleshooting

### "OPENCODE_STORAGE_DIR environment variable is not set"
Set the environment variable pointing to your OpenCode storage directory.

### "OPENCODE_SYNC_DIR environment variable is not set"
Set the environment variable pointing to your desired sync directory.

### Sync directory not accessible
Ensure you have read/write permissions to the sync directory.

### No conversations found
Make sure OpenCode has created conversations in your storage directory.

## Getting Help

```bash
# General help
opencode-sync --help

# Command-specific help
opencode-sync check --help
opencode-sync push --help
opencode-sync pull --help
opencode-sync sync --help
opencode-sync import --help
opencode-sync scan --help
```

For more detailed documentation, see the sections above.

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Watch mode for development
npm run dev

# Run locally
npm start --help
```

## License

MIT

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request