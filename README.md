# OpenCode Sync

[![CI](https://github.com/ianzepp/opencode-sync/workflows/CI/badge.svg)](https://github.com/ianzepp/opencode-sync/actions)
[![Release](https://github.com/ianzepp/opencode-sync/workflows/Release/badge.svg)](https://github.com/ianzepp/opencode-sync/releases)
[![npm version](https://badge.fury.io/js/opencode-sync.svg)](https://badge.fury.io/js/opencode-sync)

Sync OpenCode conversations between machines using a shared directory (USB stick, cloud storage, etc.).

## Features

- **SQLite 原生读取** — 直接从 `opencode.db` 读取会话和消息，无需中间文件
- **双向同步** — 在本地 OpenCode 存储和共享目录之间同步
- **Web UI 浏览与搜索** — 内置 Web 界面，支持全文搜索（FTS5）
- **增量同步** — 只同步有变更的会话
- **灵活的同步路径** — 支持 USB、云存储、网络驱动器
- **多格式导入** — 从 ChatGPT、Claude、Claude Code 等格式导入对话
- **自动格式检测** — 自动识别目录中的对话格式
- **彩色输出** — 同步状态清晰可见

## Installation

### Option 1: CURL Installation (Quickest)
```bash
curl -fsSL https://raw.githubusercontent.com/ianzepp/opencode-sync/main/install.sh | bash
```

**Note:** Replace `ianzepp` with your actual GitHub username when you fork this repository.

### Option 2: Using NPM
```bash
npm install -g opencode-sync
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

Set two environment variables:

```bash
# Required: Path to OpenCode storage directory
export OPENCODE_STORAGE_DIR="$HOME/.local/share/opencode/storage"

# Required: Path to your sync directory (USB, cloud storage, etc.)
export OPENCODE_SYNC_DIR="/path/to/your/sync/directory"

# Optional: Path to Codex CLI home; serve loads Codex conversations when set
export CODEX_HOME="$HOME/.codex"
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
Copies local OpenCode conversations (from SQLite) to the sync directory.

**With custom path:**
```bash
opencode-sync push /tmp/archive
```

### Pull conversations from sync directory
```bash
opencode-sync pull
```
Imports conversations from the sync directory to local storage.

**With custom path:**
```bash
opencode-sync pull /tmp/archive
```

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

### Web UI (browse and search)
```bash
opencode-sync serve --port 3000
```
Starts a web interface with:
- 三栏布局：项目列表 → 对话列表 → 对话详情
- 全文搜索（FTS5，支持中文分词）
- Markdown 渲染（思考过程、代码块、表格）
- 工具调用流程可视化

### Import conversations from external formats
```bash
# Import from detected format
opencode-sync import /path/to/conversations --format chatgpt

# Preview import without making changes
opencode-sync import /path/to/conversations --format claude --preview
```

**Supported formats:** `opencode`, `claude`, `chatgpt`, `claude-code-raw`, `codex-cli`

### Scan directory for conversation formats
```bash
opencode-sync scan /path/to/directory
```
Detects which conversation format is present in the directory.

## How It Works

1. **数据源**: 直接从 OpenCode 的 SQLite 数据库（`opencode.db`）读取会话和消息
2. **比对**: 按 `session.time_updated` 字段比较本地与同步目录的版本
3. **同步**: 将较新的对话复制到较旧的位置
4. **搜索**: 使用 SQLite FTS5 建立全文索引，支持中文搜索和高亮片段

## Directory Structure

### Source code
```
src/
├── cli.ts                      # CLI 入口（7 个命令）
├── types.ts                    # 核心类型定义
├── utils.ts                    # 文件 I/O 工具
├── opencode.ts                 # OpenCode SQLite 存储读写
├── sync.ts                     # 同步核心逻辑
├── import.ts                   # 导入框架
├── import-registry.ts          # 导入格式注册
├── importers/
│   ├── opencode.ts             # OpenCode → OpenCode
│   ├── claude.ts               # Claude 对话 → OpenCode
│   ├── chatgpt.ts              # ChatGPT 对话 → OpenCode
│   └── claude-code-raw.ts      # Claude Code 原始 JSONL 导入
├── services/
│   ├── path-service.ts         # 路径解析与自动检测
│   ├── sync-service.ts         # 同步业务层
│   └── import-service.ts       # 导入业务层
└── web/
    ├── search.ts               # FTS5 搜索索引
    ├── server.ts               # Express 服务器
    └── public/index.html       # 前端页面
```

### Sync directory (output)
```
sync-directory/
└── conversations/
    ├── ses_0c4bf5593ffee6Gbwmv1iVWmgp.json
    ├── ses_0c4e7a089ffenJDqN1rg4rVDaO.json
    └── ...
```

## Requirements

- Node.js 16+
- OpenCode installed and configured
- Access to OpenCode storage directory (`opencode.db`)
- Write access to sync directory

## Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `OPENCODE_STORAGE_DIR` | ✅ | Path to OpenCode storage | `$HOME/.local/share/opencode/storage` |
| `OPENCODE_SYNC_DIR` | ✅ | Path to sync directory | `/Volumes/USB/opencode-sync` |
| `CODEX_HOME` | No | Path to Codex CLI home directory | `$HOME/.codex` |

`CODEX_HOME` is optional. When set, `opencode-sync serve` automatically imports
Codex CLI conversations into `opencode.db` and marks them as `codex`. The Web
UI reads only the database and provides `opencode` and `codex` source filters.
The selected source and project are also applied to conversation lists and
search results.
Use `--codex-path <path>` to override it. To import them without starting the
web UI, run `opencode-sync sync-codex`.

## Tech Stack

| 组件 | 技术 |
|------|------|
| 运行时 | Node.js ≥16 |
| 语言 | TypeScript 5 |
| CLI 框架 | commander |
| SQLite | better-sqlite3 |
| Web 服务 | Express 5 |
| 前端 | 原生 HTML + CSS + vanilla JS |
| Markdown | marked (CDN) |
| 搜索 | SQLite FTS5 (unicode61) |

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Watch mode for development
npm run dev

# Start web UI
npm start serve

# Run locally
npm start --help
```

### Windows Web UI startup and quick restart

Set `OPENCODE_STORAGE_DIR`, `OPENCODE_SYNC_DIR`, and optionally `CODEX_HOME` in
the user environment, or edit the startup defaults at the top of `webui.ps1`.
The launcher sets these variables before starting Node, so the scheduled task
does not depend on a temporary terminal session.

Build the project and register the Web UI to start when the current user logs in:

```powershell
npm.cmd install
npm.cmd run build
npm.cmd run web:install-task
```

Run the Web UI directly in the background:

```powershell
npm.cmd run web:start
```

Manually start the registered task:

```powershell
Start-ScheduledTask -TaskName "opencode-sync-webui"
```

After changing source code, rebuild and restart it with:

```powershell
npm.cmd run web:restart
```

Check the registered task:

```powershell
Get-ScheduledTask -TaskName "opencode-sync-webui"
Get-ScheduledTaskInfo -TaskName "opencode-sync-webui"
```

The process runs in the background. Its output is written to `logs/`. To stop
the process or remove the startup task:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\webui.ps1 -Action stop
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\webui.ps1 -Action remove-task
```

## License

MIT

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
