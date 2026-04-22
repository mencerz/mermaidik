# Mermaid Diagram Editor

A web application for creating and editing Mermaid diagrams with an AI assistant, version control, diagram type templates, zoom/pan preview, export to PNG/JPEG/SVG, and auto-fix for broken syntax.

## Features

- **Visual editor** — write Mermaid code on the left, diagram renders live on the right
- **AI assistant (Ollama, runs locally)** — describe changes in natural language, AI updates the diagram
- **Clarification flow** — when the prompt is vague, the AI asks clarifying questions with clickable options (max 3 rounds)
- **Version history** — every save creates a snapshot; view, restore, and see AI prompts behind each version
- **Diagram templates** — pick from 10 types (Flowchart, Sequence, Class, State, ER, Gantt, Pie, Mindmap, Timeline, Git Graph) with live preview in the picker
- **Preview controls** — pinch-to-zoom, trackpad pan, zoom buttons, reset
- **Export** — PNG (2x / 4x / 8x), JPEG, SVG
- **Auto-fix** — one-click fix for common Mermaid syntax errors (e.g. nested parentheses) + AI-powered fix for complex errors
- **Retry logic** — AI-generated code is validated; if broken, AI is asked to fix it automatically (up to 3 retries)
- **Activity log** — see what the AI did and which prompts led to each version, persisted in SQLite

## Tech Stack

- **Backend:** Node.js, Express, better-sqlite3
- **Frontend:** React 18, Vite, Mermaid.js
- **AI:** Ollama (local LLM, default: Qwen 2.5 Coder 14B)

## Prerequisites

- **Node.js** 18+ and **npm**
- **Ollama** (for AI features)

## Quick Start

### 1. Install Ollama

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Or download the installer from [ollama.com](https://ollama.com).

### 2. Pull a model

Recommended (best for diagrams, ~9 GB):

```bash
ollama pull qwen2.5-coder:14b
```

Lighter alternatives:

```bash
ollama pull llama3.1:8b     # ~5 GB, faster
ollama pull mistral:7b      # ~4 GB, general-purpose
```

### 3. Install dependencies

```bash
cd mermaid-app
npm run install:all
```

This installs both backend and frontend dependencies.

### 4. Start Ollama (if not running)

```bash
ollama serve
```

Or launch the Ollama desktop app — it runs in the menu bar.

Verify Ollama is running:

```bash
curl http://localhost:11434/api/tags
```

### 5. Run the app

```bash
npm run dev
```

This starts both the backend (port **3001**) and the frontend (port **5173**) concurrently.

Open **http://localhost:5173** in your browser.

## Usage

### Editor
Type or paste Mermaid code in the left panel — the diagram updates automatically with a 300ms debounce. Use `Cmd/Ctrl+S` to save.

### AI Assistant
1. Expand the **"Ollama Assistant"** panel at the bottom of the editor
2. Choose a model from the dropdown (Qwen 2.5 Coder 14B recommended)
3. Describe your change, e.g. _"add a logging step after Decision"_
4. Press **Send** or Enter
5. If the request is vague, the AI will ask clarifying questions — click an option or type your own answer
6. The AI response is validated; if the code is broken, it retries automatically (up to 3 times)

### Creating a new diagram
Click **+ New** in the sidebar. Choose a diagram type from 10 templates — each with a live preview and description. Click **Create [Type]** to confirm.

### Versions
- **Save** creates a new version automatically
- Versions appear in the right sidebar, newest on top, latest marked as `CURRENT`
- Click a version to view it (preview switches to read-only mode)
- **Restore** creates a new version based on the selected one, making it current
- **Back to current** returns to the latest version
- AI-generated versions show the prompt that created them

### Preview controls
- **Pinch-to-zoom** on trackpad (or Ctrl/Cmd + scroll)
- **Two-finger scroll** on trackpad to pan
- **Alt + click + drag** for mouse pan
- Zoom buttons `−` / `%` / `+` in the preview header (click `%` to reset)

### Export
Click **Export** in the preview header:
- **PNG 2x / 4x / 8x** — raster image with configurable quality
- **JPEG 4x** — compressed raster
- **SVG** — vector, stays sharp at any zoom

### Error handling
If the diagram fails to render:
- **Quick fix** — instant regex-based fix for common issues (unquoted special characters)
- **Fix with AI** — sends the error to the AI for a smart fix
- **Retry last prompt** — regenerates using the last AI prompt

## Configuration

Environment variables in `mermaid-app/.env`:

```
OLLAMA_URL=http://localhost:11434    # Ollama API endpoint
```

## Project Structure

```
mermaid-app/
├── server/
│   ├── index.js               # Express API + Ollama proxy + auto-fix
│   ├── db.js                  # SQLite schema (diagrams, versions, ai_logs)
│   └── mermaid-syntax.json    # Syntax reference per diagram type (for AI prompts)
├── client/
│   ├── src/
│   │   ├── App.jsx            # React UI (editor, preview, AI panel, modals)
│   │   ├── App.css            # Styles
│   │   └── main.jsx           # Entry point
│   ├── vite.config.js         # Vite + API proxy to port 3001
│   └── index.html
├── .env                       # Configuration (OLLAMA_URL)
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

## Troubleshooting

**Ollama connection error**
Make sure Ollama is running: `ollama serve` or launch the Ollama app.

**Model not found**
Pull the selected model: `ollama pull qwen2.5-coder:14b`. List installed models: `ollama list`.

**First AI request is slow**
Ollama loads the model into RAM on the first request (takes 5–15 seconds on Apple Silicon). Subsequent requests are fast.

**Port already in use**
Stop other processes on ports 3001 or 5173, or change them in `server/index.js` and `client/vite.config.js`.

**Diagram fails to render**
Click **Quick fix** (regex-based) or **Fix with AI** in the preview error panel.
