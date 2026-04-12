# Photoresist Layer

Visual feedback tool for AI coding workflows. Annotate directly on any website, package feedback as structured bundles, and let AI coding tools read them instantly.

**By [Cosmos AI Lab](https://cosmosailab.com)**

## What it does

1. **Annotate** - Pin, Note, Box, Arrow, Freehand drawing + 7 more tools directly on any website
2. **Screenshot** - Capture regions with annotations visible
3. **Export** - Save as PDF, Markdown, or TXT
4. **Send** - Upload bundles to Firebase cloud
5. **AI reads** - Any AI coding tool connects via MCP to read your feedback

## Architecture

```
photoresist-layer/
├── apps/
│   ├── extension/      ← Chrome extension (MV3, Vite, TypeScript)
│   ├── bridge/         ← Local bridge server (localhost:9471)
│   └── mcp-server/     ← MCP Server (6 tools for AI)
├── packages/
│   ├── schema/         ← Bundle Schema v3 (PGOS)
│   └── host-sdk/       ← Host adapter SDK
```

## Quick Start

### 1. Install & Build

```bash
pnpm install
pnpm build
```

### 2. Load Extension

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" → select `apps/extension/dist/`

### 3. Set up Firebase

Copy env example and fill in your Firebase credentials:

```bash
cp apps/extension/.env.example apps/extension/.env.local
cp apps/mcp-server/.env.example apps/mcp-server/.env
```

### 4. Connect AI via MCP

Add to your AI tool's MCP config (Claude Code, Cursor, etc.):

```json
{
  "mcpServers": {
    "photoresist-layer": {
      "command": "npx",
      "args": ["tsx", "apps/mcp-server/src/index.ts"],
      "cwd": "/path/to/photoresist-layer"
    }
  }
}
```

Replace `/path/to/photoresist-layer` with the actual path where you cloned this repo.

### MCP Tools Available

| Tool | Description |
|------|------------|
| `list_feedbacks` | List all feedback bundles |
| `get_feedback` | Get specific feedback by ID |
| `get_latest` | Get most recent feedback |
| `get_latest_graph` | Get PGOS graph data (lightweight) |
| `update_status` | Update feedback status (open/in_progress/done) |
| `get_sdk` | Get integration code for React/Vue/Next.js |

## Tech Stack

- **TypeScript** + **pnpm** monorepo
- **Chrome Extension** MV3 (Vite build)
- **Firebase** (Firestore + Storage + Anonymous Auth)
- **MCP** (Model Context Protocol) for AI integration

## Features

- 11 annotation tools (Pin, Note, Box, Circle, Ellipse, Star, Arrow, Line, Curve, Path, Freehand)
- 3-way color picker (presets + spectrum + hex)
- PGOS (Photoresist Graph Overlay System) - graph-first feedback
- UITB (UI Digital Twin Bundle) - scan & clone any website's design
- Library Manager - rename, tag, search, list/grid view
- Local bridge + cloud sync
- Feedback history with status flow

## License

MIT
