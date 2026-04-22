require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MERMAID_SYNTAX = require(path.join(__dirname, 'mermaid-syntax.json'));

// Auto-fix common Mermaid syntax issues
function autoFixMermaid(code) {
  // Fix node labels with nested special characters
  // Strategy: find all node definitions like ID(label) ID[label] ID{label}
  // and if label contains unquoted parens/braces, wrap in quotes

  let fixed = code;

  // Fix all rounded-rect nodes: ID(text with (nested) parens)
  // Match: word followed by ( ... ( ... ) ... ) where inner content has nested parens
  // We need a smarter approach — find balanced parens
  fixed = fixed.replace(/(\b\w+)\(([^)]*\([^)]*\)[^)]*)\)/g, (match, id, innerLabel) => {
    // Skip if already quoted
    if (innerLabel.startsWith('"') || innerLabel.startsWith("'")) return match;
    return `${id}["${innerLabel}"]`;
  });

  // Fix nodes where label has special chars like |, {, }
  // ID(text with | pipe) → ID["text with | pipe"]
  fixed = fixed.replace(/(\b\w+)\(([^")][^)]*[|{}][^)]*)\)/g, (match, id, label) => {
    if (label.startsWith('"') || label.startsWith("'")) return match;
    return `${id}["${label}"]`;
  });

  // Fix long text in rounded nodes that might confuse parser
  // ID(text with multiple words and spaces more than 40 chars) — likely needs quotes
  fixed = fixed.replace(/(\b\w+)\(([^")]{40,})\)/g, (match, id, label) => {
    if (label.startsWith('"') || label.startsWith("'")) return match;
    return `${id}["${label}"]`;
  });

  return fixed;
}

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// List all diagrams
app.get('/api/diagrams', (req, res) => {
  const diagrams = db.prepare(
    'SELECT id, title, substr(code, 1, 100) as preview, updated_at FROM diagrams ORDER BY updated_at DESC'
  ).all();
  res.json(diagrams);
});

// Get single diagram
app.get('/api/diagrams/:id', (req, res) => {
  const diagram = db.prepare('SELECT * FROM diagrams WHERE id = ?').get(req.params.id);
  if (!diagram) return res.status(404).json({ error: 'Not found' });
  res.json(diagram);
});

// Create diagram
app.post('/api/diagrams', (req, res) => {
  const { title, code } = req.body;
  if (!title || !code) return res.status(400).json({ error: 'Title and code are required' });

  const result = db.prepare(
    'INSERT INTO diagrams (title, code) VALUES (?, ?)'
  ).run(title, code);

  db.prepare(
    'INSERT INTO versions (diagram_id, code) VALUES (?, ?)'
  ).run(result.lastInsertRowid, code);

  const diagram = db.prepare('SELECT * FROM diagrams WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(diagram);
});

// Update diagram
app.put('/api/diagrams/:id', (req, res) => {
  const { title, code } = req.body;
  const existing = db.prepare('SELECT * FROM diagrams WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const newCode = code || existing.code;
  db.prepare(
    "UPDATE diagrams SET title = ?, code = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(title || existing.title, newCode, req.params.id);

  if (code && code !== existing.code) {
    db.prepare(
      'INSERT INTO versions (diagram_id, code) VALUES (?, ?)'
    ).run(req.params.id, newCode);
  }

  const diagram = db.prepare('SELECT * FROM diagrams WHERE id = ?').get(req.params.id);
  res.json(diagram);
});

// List versions for a diagram
app.get('/api/diagrams/:id/versions', (req, res) => {
  const versions = db.prepare(
    'SELECT id, diagram_id, substr(code, 1, 80) as preview, created_at FROM versions WHERE diagram_id = ? ORDER BY created_at ASC'
  ).all(req.params.id);
  res.json(versions);
});

// Get a specific version
app.get('/api/diagrams/:id/versions/:vid', (req, res) => {
  const version = db.prepare(
    'SELECT * FROM versions WHERE id = ? AND diagram_id = ?'
  ).get(req.params.vid, req.params.id);
  if (!version) return res.status(404).json({ error: 'Not found' });
  res.json(version);
});

// Delete diagram (cascade versions)
app.delete('/api/diagrams/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM diagrams WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM versions WHERE diagram_id = ?').run(req.params.id);
  db.prepare('DELETE FROM diagrams WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// AI generate — Ollama modifies Mermaid diagram with clarification support
app.post('/api/ai/generate', async (req, res) => {
  const { code, prompt, model, context, clarifyCount, diagramType } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

  const ollamaModel = model || 'qwen2.5-coder:14b';
  const forceGenerate = (clarifyCount || 0) >= 3;

  // Build syntax reference for the current diagram type
  let syntaxRef = '';
  if (diagramType && MERMAID_SYNTAX[diagramType]) {
    syntaxRef = `\n\nMERMAID SYNTAX REFERENCE for "${diagramType}":\n${MERMAID_SYNTAX[diagramType].syntax}`;
  }

  const typeInfo = diagramType
    ? `\nThe user is working on a "${diagramType}" type Mermaid diagram. Keep the output in this diagram type unless the user explicitly asks to change it.${syntaxRef}\n\nFollow the syntax reference strictly to avoid parse errors. Always wrap text with special characters in quotes.`
    : '';

  const systemPrompt = forceGenerate
    ? `You are a Mermaid diagram expert. The user will give you existing Mermaid diagram code and a request to modify it.${typeInfo} Return ONLY valid JSON in this exact format: {"type": "code", "code": "<mermaid code here>", "explanation": "<brief description of what you changed>"}. No markdown fences, no extra text. Just the JSON object.`
    : `You are a Mermaid diagram expert. The user will give you existing Mermaid diagram code and a request to modify it.${typeInfo}

You MUST respond with valid JSON in one of two formats:

1. If the request is clear and you know exactly what to do, return:
{"type": "code", "code": "<updated mermaid code>", "explanation": "<brief 1-2 sentence description of what you changed>"}

2. If the request is vague, ambiguous, or you need more details to produce a good result, return:
{"type": "clarify", "question": "<your clarifying question>", "options": ["option 1", "option 2", "option 3"]}
Provide 2-4 short, specific options that help narrow down what the user wants.

Only ask for clarification when truly needed — if the request is reasonably clear, just generate the code. Never add markdown fences or explanations outside the JSON.`;

  const userContent = code
    ? `Here is my current Mermaid diagram (type: ${diagramType || 'unknown'}):\n\n${code}\n\nUser request: ${prompt}`
    : `Create a Mermaid diagram${diagramType ? ` of type "${diagramType}"` : ''}: ${prompt}`;

  // Build messages with conversation context
  const messages = [{ role: 'system', content: systemPrompt }];
  if (context && context.length > 0) {
    messages.push(...context);
  }
  messages.push({ role: 'user', content: userContent });

  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        stream: false,
        messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText || `Ollama returned ${response.status}`);
    }

    const data = await response.json();
    let content = data.message.content.trim();

    // Try to extract JSON from the response
    let parsed;
    try {
      // Try direct parse first
      parsed = JSON.parse(content);
    } catch {
      // Try to find JSON in the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]); } catch { /* fall through */ }
      }
    }

    if (parsed && parsed.type === 'clarify' && parsed.question && parsed.options) {
      res.json({ type: 'clarify', question: parsed.question, options: parsed.options });
    } else if (parsed && parsed.type === 'code' && parsed.code) {
      let generatedCode = parsed.code.trim();
      generatedCode = generatedCode.replace(/^```(?:mermaid)?\n?/i, '').replace(/\n?```$/i, '');
      generatedCode = autoFixMermaid(generatedCode);
      res.json({ type: 'code', code: generatedCode, explanation: parsed.explanation || '' });
    } else {
      // Fallback: treat entire response as code
      content = content.replace(/^```(?:mermaid)?\n?/i, '').replace(/\n?```$/i, '');
      content = autoFixMermaid(content);
      res.json({ type: 'code', code: content, explanation: '' });
    }
  } catch (err) {
    console.error('Ollama error:', err.message);
    res.status(500).json({ error: err.message || 'Ollama request failed' });
  }
});

// Quick auto-fix endpoint (no AI, just regex fixes)
app.post('/api/ai/autofix', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code is required' });
  const fixed = autoFixMermaid(code);
  res.json({ code: fixed, changed: fixed !== code });
});

// Save AI log and link to version
app.post('/api/diagrams/:id/logs', (req, res) => {
  const { prompt, response, model, versionId } = req.body;
  const diagramId = req.params.id;

  const result = db.prepare(
    'INSERT INTO ai_logs (diagram_id, prompt, response, model) VALUES (?, ?, ?, ?)'
  ).run(diagramId, prompt, response, model);

  // Link to version if provided
  if (versionId) {
    db.prepare('UPDATE versions SET ai_log_id = ? WHERE id = ?').run(result.lastInsertRowid, versionId);
  }

  const log = db.prepare('SELECT * FROM ai_logs WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(log);
});

// Get AI logs for a diagram
app.get('/api/diagrams/:id/logs', (req, res) => {
  const logs = db.prepare(
    'SELECT * FROM ai_logs WHERE diagram_id = ? ORDER BY created_at DESC'
  ).all(req.params.id);
  res.json(logs);
});

// Get versions with AI log info
app.get('/api/diagrams/:id/versions-with-logs', (req, res) => {
  const versions = db.prepare(`
    SELECT v.id, v.diagram_id, substr(v.code, 1, 80) as preview, v.created_at, v.ai_log_id,
           al.prompt as ai_prompt, al.response as ai_response, al.model as ai_model
    FROM versions v
    LEFT JOIN ai_logs al ON v.ai_log_id = al.id
    WHERE v.diagram_id = ?
    ORDER BY v.created_at ASC
  `).all(req.params.id);
  res.json(versions);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
