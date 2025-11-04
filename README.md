# OpenCode Sync

Sync OpenCode conversations between machines using a shared directory (USB stick, cloud storage, etc.).

## Features

- 🔄 **Bidirectional sync** between local OpenCode storage and shared directory
- 📁 **Flexible sync location** - works with USB sticks, cloud storage, network drives
- 🎯 **Incremental updates** - only syncs changed conversations
- 🎨 **Colorized output** - clear visual feedback on sync status
- 🔧 **Simple configuration** - just two environment variables
- ⚡ **Fast detection** - quickly identifies what needs sync

## Installation

### Using Bun (recommended)
```bash
bun install -g opencode-sync
```

### Using NPM
```bash
npm install -g opencode-sync
```

### From source
```bash
git clone <repository-url>
cd opencode-sync
bun install
bun run build
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

### Pull conversations from sync directory
```bash
opencode-sync pull
```
Imports conversations from the sync directory to your local OpenCode storage.

### Full bidirectional sync
```bash
opencode-sync sync
```
Performs push then pull in one command.

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

- Node.js 16+ or Bun
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

## Development

```bash
# Install dependencies
bun install

# Build TypeScript
bun run build

# Watch mode for development
bun run dev

# Run locally
bun start --help
```

## License

MIT

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request