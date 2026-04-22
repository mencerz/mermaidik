# Mermaid Diagram Editor

A web application for creating and editing Mermaid diagrams with AI assistance, version control, diagram type templates, zoom/pan preview, export to PNG/JPEG/SVG, and auto-fix for broken syntax.

Two ways to use AI:

1. **MCP server (recommended)** — connect Claude Desktop or Claude Code to the app and let Claude create and edit diagrams directly. Best quality, no local model required.
2. **Ollama (optional, local)** — built-in AI assistant panel powered by a local LLM. Runs offline, no external service needed.

## Features

- **Visual editor** — write Mermaid code on the left, diagram renders live on the right
- **MCP integration** — Claude (Desktop/Code) creates and edits diagrams via tool calls
- **Version history** — every save creates a snapshot; view, restore, and see AI prompts behind each version
- **Diagram templates** — pick from 10 types (Flowchart, Sequence, Class, State, ER, Gantt, Pie, Mindmap, Timeline, Git Graph) with live preview in the picker
- **Preview controls** — pinch-to-zoom, trackpad pan, zoom buttons, fullscreen
- **Export** — PNG (2x / 4x / 8x), JPEG, SVG
- **Auto-fix** — one-click fix for common Mermaid syntax errors (e.g. nested parentheses)
- **Activity log** — see what was done and which prompts led to each version, persisted in SQLite
- **Ollama AI assistant (optional)** — in-app panel with clarification flow, retry logic, model picker (Qwen 2.5 Coder / Llama / Mistral)

## Tech Stack

- **Backend:** Node.js, Express, better-sqlite3
- **Frontend:** React 18, Vite, Mermaid.js
- **MCP:** `@modelcontextprotocol/sdk` (stdio transport)
- **Optional AI:** Ollama (local LLM)

## Prerequisites

- **Node.js** 18+ and **npm**
- **Claude Desktop or Claude Code** (for MCP — recommended)
- **Ollama** (only if you want the built-in offline AI assistant)

## Quick Start

### 1. Install dependencies

```bash
cd mermaid-app
npm run install:all
```

### 2. Run the app

```bash
npm run dev
```

Starts the backend (port **3001**) and the frontend (port **5173**). Open **http://localhost:5173**.

At this point the editor, version control, templates, preview, and export already work without any AI setup.

## AI Setup — choose one or both

### Option A: MCP server (recommended)

Let Claude (Desktop or Code) create and edit diagrams directly through tool calls.

**Available tools:**

- `list_diagrams` — list all diagrams
- `get_diagram` — fetch a diagram by ID
- `create_diagram` — create a new diagram
- `update_diagram` — update title/code (auto-creates a version)
- `delete_diagram` — delete a diagram and all its versions
- `list_versions` — list version history with AI log info
- `get_version` — fetch a specific version
- `list_ai_logs` — AI interaction history for a diagram
- `autofix_mermaid` — run the server-side syntax auto-fixer

The MCP server talks to the backend HTTP API, so the backend must be running (`npm run dev`).

**Claude Desktop** — add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "mermaid-app": {
      "command": "node",
      "args": ["/Users/alexey/Work docs/CA/mermaid-app/mcp/server.js"],
      "env": {
        "MERMAID_APP_API": "http://localhost:3001/api"
      }
    }
  }
}
```

**Claude Code** — run:

```bash
claude mcp add mermaid-app node /Users/alexey/Work\ docs/CA/mermaid-app/mcp/server.js
```

Restart Claude after editing the config. Now in the chat:

> "Create a flowchart for the user authentication process"

Claude will call `create_diagram` and the result appears in the app immediately.

**Test without Claude:**

```bash
npx @modelcontextprotocol/inspector node mcp/server.js
```

### Option B: Ollama (local, offline)

Adds the in-app **Ollama Assistant** panel at the bottom of the editor. Runs a local LLM, no external API needed.

**Install Ollama:**

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Or download from [ollama.com](https://ollama.com).

**Pull a model** — recommended (best for diagrams, ~9 GB):

```bash
ollama pull qwen2.5-coder:14b
```

Lighter alternatives:

```bash
ollama pull llama3.1:8b     # ~5 GB, faster
ollama pull mistral:7b      # ~4 GB, general-purpose
```

**Start Ollama** (if not already running):

```bash
ollama serve
```

Or launch the Ollama desktop app (menu bar).

Verify:

```bash
curl http://localhost:11434/api/tags
```

The assistant panel in the app will now work — clarification flow, auto-retry on invalid syntax, model picker included.

## Usage

### Editor
Type or paste Mermaid code in the left panel — the diagram updates automatically with a 300ms debounce.

### Creating a new diagram
Click **+ New** in the sidebar. Choose a diagram type from 10 templates — each with a live preview and description. Click **Create [Type]** to confirm.

### Versions
- **Save** creates a new version automatically
- Versions appear in the right sidebar, newest on top, latest marked as `CURRENT`
- Click a version to view it (preview switches to read-only mode)
- **Restore** creates a new version based on the selected one, making it current
- AI-generated versions show the prompt that created them

### Preview controls
- **Pinch-to-zoom** on trackpad (or Ctrl/Cmd + scroll)
- **Two-finger scroll** on trackpad to pan
- **Alt + click + drag** for mouse pan
- Zoom buttons `−` / `%` / `+` in the preview header (click `%` to reset)
- **Fullscreen** button — expands preview, press Esc to exit

### Export
Click **Export** in the preview header:
- **PNG 2x / 4x / 8x** — raster image with configurable quality
- **JPEG 4x** — compressed raster
- **SVG** — vector, stays sharp at any zoom

### Error handling
If the diagram fails to render:
- **Quick fix** — instant regex-based fix for common issues (unquoted special characters, etc.)
- **Fix with AI** — sends the error to the AI (Ollama) for a smart fix
- **Retry last prompt** — regenerates using the last AI prompt

## Configuration

Environment variables in `mermaid-app/.env`:

```
OLLAMA_URL=http://localhost:11434    # Ollama API endpoint (only needed if using Ollama)
```

## Project Structure

```
mermaid-app/
├── server/
│   ├── index.js               # Express API + Ollama proxy + auto-fix
│   ├── db.js                  # SQLite schema (diagrams, versions, ai_logs)
│   └── mermaid-syntax.json    # Syntax reference per diagram type (for AI prompts)
├── mcp/
│   └── server.js              # MCP server (stdio) wrapping the Express API as tools
├── client/
│   ├── src/
│   │   ├── App.jsx            # React UI (editor, preview, AI panel, modals)
│   │   ├── App.css            # Styles
│   │   └── main.jsx           # Entry point
│   ├── vite.config.js         # Vite + API proxy to port 3001
│   └── index.html
├── .env                       # Configuration (OLLAMA_URL — optional)
├── diagrams.db                # SQLite database (auto-created on first run)
└── package.json               # Scripts and dependencies
```

## npm Scripts

| Command | Description |
|---|---|
| `npm run install:all` | Install both root and client dependencies |
| `npm run dev` | Start backend and frontend concurrently |
| `npm run server` | Start backend only (port 3001) |
| `npm run client` | Start frontend only (port 5173) |
| `npm run mcp` | Start the MCP server (stdio) |

## Troubleshooting

**MCP server not showing up in Claude**
Check the config file path, restart Claude, and make sure the backend is running (`npm run dev`). The MCP server talks to `http://localhost:3001/api` by default.

**Ollama connection error**
Make sure Ollama is running: `ollama serve` or launch the Ollama app.

**Model not found**
Pull the selected model: `ollama pull qwen2.5-coder:14b`. List installed models: `ollama list`.

**First Ollama request is slow**
Ollama loads the model into RAM on the first request (takes 5–15 seconds on Apple Silicon). Subsequent requests are fast.

**Port already in use**
Stop other processes on ports 3001 or 5173, or change them in `server/index.js` and `client/vite.config.js`.

**Diagram fails to render**
Click **Quick fix** (regex-based) or **Fix with AI** in the preview error panel.
