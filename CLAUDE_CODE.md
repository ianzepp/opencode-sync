# Claude Code Integration Project

## Project Overview

This document outlines the complete plan for integrating Claude Code conversation data into the OpenCode sync system. The goal is to enable importing historical Claude Code conversations and converting them to OpenCode format for synchronization and backup.

## Source Data Analysis

### Claude Code File Structure
```
~/.claude/
├── CLAUDE.md                    # Global memory/profile settings
├── settings.json               # Permissions and configuration
├── projects/                   # Main conversation data (88 JSONL files)
│   └── -workspace-name/        # Per-workspace directories
│       └── uuid.jsonl          # Individual conversation sessions
├── todos/                      # Todo tracking (112 JSON files)
│   └── uuid-agent-uuid.json  # Per-session todo states
├── shell-snapshots/           # Shell environment snapshots (9 shell scripts)
│   └── snapshot-zsh-*.sh     # Timestamped shell environment
├── statsig/                   # Feature flag and analytics data
└── plugins/                   # Plugin data
```

### File Format Details
- **Extension:** `.jsonl` (JSON Lines format)
- **Naming:** UUID-based filenames (e.g., `0c71229d-fd47-4994-89b9-6b04754c16e2.jsonl`)
- **Structure:** Each line is a JSON object representing a message/interaction
- **Session-based:** Each `.jsonl` file represents one complete Claude Code session
- **Message Types:** user, assistant, tool_use, tool_result, summary
- **Rich Context:** cwd, gitBranch, version, sessionId, timestamps, token usage
- **Relationships:** Uses `parentUuid` to maintain conversation flow

### Sample Message Structure
```json
{
  "parentUuid": "e99d98d6-97ee-4d8a-b10e-1ec0d217adf2",
  "isSidechain": false,
  "userType": "external",
  "cwd": "/Users/ianzepp/Workspaces/monk-api",
  "sessionId": "1bbe1ffb-e6f8-4bf7-8bb8-c7519a10e647",
  "version": "1.0.88",
  "gitBranch": "main",
  "type": "user",
  "message": {
    "role": "user",
    "content": "So gh issue 22 was recently implemented..."
  },
  "uuid": "e99d98d6-97ee-4d8a-b10e-1ec0d217adf2",
  "timestamp": "2025-08-22T11:21:14.101Z"
}
```

## Target System Analysis

### OpenCode File Structure
```
{opencode_storage}/
├── session/
│   └── {session_hash}/
│       └── ses_{id}.json
├── message/
│   └── {session_hash}/
│       └── msg_{id}.json
└── imported/
    └── {format}/
        └── {converted_files}
```

### Naming Patterns
- **Session IDs:** 40-character hex hashes (e.g., `3dbca317cb93a39aacfd3ee0566c35c8622a8326`)
- **Message IDs:** Format `msg_[timestamp][random][base36]` (e.g., `msg_a503c00e8001J2yfaITrjjNaY0.json`)
- **Directory Structure:** `session/{session_id}/{session_file}.json` and `message/{session_id}/{message_files}.json`

## Implementation Phases

### Phase 1: Raw Data Import (Foundation)
**Goal:** Copy Claude Code files to OpenCode storage with compatible naming

**Key Components:**
1. **File Path Mapping Strategy**
   - Source: `~/.claude/projects/-Users-ianzepp-Workspaces-monk-api/0c71229d-fd47-4994-89b9-6b04754c16e2.jsonl`
   - Target: `{opencode_storage}/imported/claude-code-raw/{workspace_hash}/{converted_session_id}.jsonl`

2. **Naming Conversion Functions**
   ```typescript
   // Convert workspace path to directory hash
   function generateWorkspaceHash(workspacePath: string): string {
     return createHash('sha1').update(`claude-workspace-${workspacePath}`).digest('hex').substring(0, 40);
   }
   
   // Convert UUID session ID to OpenCode-compatible hash
   function convertSessionId(sessionId: string): string {
     return createHash('sha1').update(`claude-session-${sessionId}`).digest('hex').substring(0, 40);
   }
   ```

3. **Directory Structure**
   ```
   {opencode_storage}/
   └── imported/
       └── claude-code-raw/
           ├── 3dbca317cb93a39aacfd3ee0566c35c8622a8326/  # workspace hash
           │   ├── 5b0b6583bffe71BiZT8gVrkdIo.jsonl         # converted session ID
           │   └── manifest.json                               # import tracking
           └── 8f9e0d1c2b3a4f5e6d7c8b9a0f1e2d3c4b5a6f7e8d/
               ├── ...
               └── manifest.json
   ```

4. **Manifest System**
   - Tracks imported files with original→converted ID mappings
   - Enables incremental imports (only new/modified files)
   - Stores metadata: file sizes, timestamps, import dates

5. **Incremental Import Logic**
   - Compare file modification times
   - Skip already imported and unchanged files
   - Support `--force` flag to re-import everything

**Implementation Files:**
- `src/importers/claude-code-raw.ts` - Main importer class
- Registration in `src/services/import-service.ts`
- CLI integration for `opencode-sync import --format claude-code-raw`

### Phase 2: Basic Conversation Import (Core Functionality)
**Goal:** Convert Claude Code conversations to basic OpenCode format

**Key Features:**
1. **JSONL Parsing**
   - Parse each line as separate JSON message
   - Group messages by `sessionId` to form conversations
   - Handle parent-child relationships for message ordering

2. **Basic Message Conversion**
   - Map `sessionId` → `conversation.id`
   - Map `message.content` → `message.summary.body`
   - Map `message.role` → `message.role` (user/assistant only)
   - Map `cwd` → `conversation.metadata.directory`
   - Map `gitBranch` → conversation metadata

3. **Message Filtering**
   - Skip `tool_use`, `tool_result`, `summary` message types initially
   - Convert `user` and `assistant` messages only
   - Preserve message timestamps and basic ordering

4. **Import Warnings**
   - Document skipped tool messages
   - Track data loss (token usage, model info, etc.)
   - Provide conversion statistics

**Implementation Files:**
- `src/importers/claude-code.ts` - Basic conversation importer
- Registration in `src/services/import-service.ts`
- Enhanced CLI support

### Phase 3: Complete Import with Tool Context (Advanced)
**Goal:** Full conversation import with artificial tool state reconstruction

**Advanced Features:**
1. **Complete Message Processing**
   - Handle ALL message types: `user`, `assistant`, `tool_use`, `tool_result`, `summary`
   - Create artificial assistant messages for tool context
   - Preserve tool interaction flow in conversation narrative

2. **Tool State Reconstruction**
   - Generate artificial tool result messages for each `tool_use`
   - Create contextual assistant messages explaining tool usage
   - Convert complex tool outputs to readable summaries

3. **Intelligent Context Messages**
   ```typescript
   // Example artificial message generation
   "I used TodoWrite to track our progress: [list of todos with status]"
   "I ran 'cargo build' and found these compilation errors: [summary of errors]"
   "I edited the file to fix the middleware naming conflict"
   ```

4. **Enhanced Metadata**
   - Include tool usage statistics in conversation summary
   - Add tool type tracking (Bash, Edit, TodoWrite, etc.)
   - Preserve workspace context and project information

5. **Resumption-Friendly Features**
   - Current working directory in conversation title
   - Git branch information in metadata
   - "Where we left off" summary based on last tool usage

**Implementation Files:**
- Enhanced `src/importers/claude-code.ts` with full conversion logic
- Tool state reconstruction utilities
- Advanced message generation algorithms

## Technical Implementation Details

### File Discovery Process
1. **Scan `~/.claude/projects/` directory**
2. **Identify workspace directories** (start with `-`)
3. **Find `.jsonl` files** in each workspace directory
4. **Extract metadata:** file paths, sizes, modification times
5. **Group by workspace** for organized processing

### Incremental Import Strategy
1. **Load existing manifest** for workspace
2. **Compare file modification times**
3. **Import only new/changed files**
4. **Update manifest** with new entries
5. **Save manifest** for future comparisons

### Error Handling
- **File access errors:** Skip inaccessible files with warnings
- **Invalid JSONL format:** Log and continue with next file
- **Missing directories:** Create as needed
- **Permission issues:** Report but don't fail entire import

### Performance Considerations
- **Batch file operations** where possible
- **Stream large JSONL files** instead of loading entirely
- **Use file system stats** for quick change detection
- **Implement progress indicators** for user feedback

## Current Status

### Completed ✅
- [x] Created `ClaudeCodeRawImportStrategy` class foundation
- [x] Implemented file path mapping and naming conversion
- [x] Designed manifest system structure
- [x] Planned incremental import logic
- [x] Fixed compilation errors in importer class
- [x] Registered new format in ImportService and registry
- [x] Added CLI integration with `--force` support for raw imports

### In Progress 🔄
- [ ] Test basic import functionality

### Pending 📋
- [ ] Phase 2: Basic conversation conversion
- [ ] Phase 3: Advanced tool context reconstruction
- [ ] Comprehensive testing with real data
- [ ] Documentation and examples

## Next Steps

1. **Test with sample Claude Code data** to validate raw import manifests
2. **Document the raw import workflow and CLI flags** for end users
3. **Move to Phase 2** once Phase 1 is verified

## Useful Context

### Source File Locations
- **Claude Code data:** `~/.claude/projects/*/*.jsonl`
- **OpenCode storage:** `~/.local/share/opencode/storage/`
- **Import archive:** `{opencode_storage}/imported/claude-code-raw/`

### File Formats
- **Claude Code:** JSONL (one JSON object per line)
- **OpenCode:** JSON (structured conversation format)
- **Manifest:** JSON (import tracking metadata)

### Key Identifiers
- **Claude Code Session ID:** UUID format (36 chars with hyphens)
- **OpenCode Session Hash:** 40-character hex string
- **Workspace Hash:** 40-character hex string
- **Message ID:** Base36 encoded with timestamp

### Development Notes
- Use existing OpenCode utilities for file operations
- Follow established patterns from other importers
- Maintain backward compatibility with existing sync system
- Preserve original data in raw format for future enhancements