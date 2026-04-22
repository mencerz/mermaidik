#!/usr/bin/env node
/**
 * MCP server for the Mermaid Diagram Editor.
 *
 * Exposes the existing Express API (http://localhost:3001) as MCP tools so
 * Claude (Desktop, Code, or any MCP client) can create, read, update, and
 * delete diagrams directly.
 *
 * Run with:    node mcp/server.js
 * Or via:      npm run mcp
 *
 * Requires the main backend to be running (npm run server or npm run dev).
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const API = process.env.MERMAID_APP_API || 'http://localhost:3001/api';

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

const tools = [
  {
    name: 'list_diagrams',
    description: 'List all saved Mermaid diagrams with their IDs, titles, last-modified timestamps, and a short code preview.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_diagram',
    description: 'Get the full details of a single diagram by ID, including its current Mermaid code.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number', description: 'Diagram ID' } },
      required: ['id'],
    },
  },
  {
    name: 'create_diagram',
    description: 'Create a new Mermaid diagram. Returns the new diagram with its ID. The code must be valid Mermaid syntax.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title of the diagram' },
        code: { type: 'string', description: 'Mermaid diagram code' },
      },
      required: ['title', 'code'],
    },
  },
  {
    name: 'update_diagram',
    description: 'Update an existing diagram\'s title and/or code. A new version is automatically created if the code changes.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Diagram ID' },
        title: { type: 'string', description: 'New title (optional)' },
        code: { type: 'string', description: 'New Mermaid code (optional)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_diagram',
    description: 'Delete a diagram and all of its versions and AI logs. This cannot be undone.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number', description: 'Diagram ID' } },
      required: ['id'],
    },
  },
  {
    name: 'list_versions',
    description: 'List all historical versions of a diagram (with AI log info if available).',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number', description: 'Diagram ID' } },
      required: ['id'],
    },
  },
  {
    name: 'get_version',
    description: 'Get a specific version of a diagram by version ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Diagram ID' },
        versionId: { type: 'number', description: 'Version ID' },
      },
      required: ['id', 'versionId'],
    },
  },
  {
    name: 'list_ai_logs',
    description: 'List all AI interactions (prompts and responses) for a diagram.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number', description: 'Diagram ID' } },
      required: ['id'],
    },
  },
  {
    name: 'autofix_mermaid',
    description: 'Run the server-side regex-based auto-fixer on Mermaid code to fix common syntax errors (e.g. unquoted nested parentheses). Returns the fixed code.',
    inputSchema: {
      type: 'object',
      properties: { code: { type: 'string', description: 'Mermaid code to auto-fix' } },
      required: ['code'],
    },
  },
];

const server = new Server(
  { name: 'mermaid-app', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;

    switch (name) {
      case 'list_diagrams':
        result = await apiFetch('/diagrams');
        break;

      case 'get_diagram':
        result = await apiFetch(`/diagrams/${args.id}`);
        break;

      case 'create_diagram':
        result = await apiFetch('/diagrams', {
          method: 'POST',
          body: JSON.stringify({ title: args.title, code: args.code }),
        });
        break;

      case 'update_diagram': {
        const body = {};
        if (args.title !== undefined) body.title = args.title;
        if (args.code !== undefined) body.code = args.code;
        result = await apiFetch(`/diagrams/${args.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        break;
      }

      case 'delete_diagram':
        result = await apiFetch(`/diagrams/${args.id}`, { method: 'DELETE' });
        break;

      case 'list_versions':
        result = await apiFetch(`/diagrams/${args.id}/versions-with-logs`);
        break;

      case 'get_version':
        result = await apiFetch(`/diagrams/${args.id}/versions/${args.versionId}`);
        break;

      case 'list_ai_logs':
        result = await apiFetch(`/diagrams/${args.id}/logs`);
        break;

      case 'autofix_mermaid':
        result = await apiFetch('/ai/autofix', {
          method: 'POST',
          body: JSON.stringify({ code: args.code }),
        });
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error: ${err.message}` }],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server logs go to stderr so they don't interfere with stdio protocol
  console.error(`[mermaid-app MCP] ready, API=${API}`);
}

main().catch((err) => {
  console.error('[mermaid-app MCP] fatal:', err);
  process.exit(1);
});
