import { useState, useEffect, useRef, useCallback } from 'react';
import mermaid from 'mermaid';
import { marked } from 'marked';

mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });
marked.setOptions({ gfm: true, breaks: false });

// Heuristic: does this look like a Markdown document (with optional embedded mermaid blocks)?
const isMarkdownDoc = (text) => {
  if (!text) return false;
  if (/^\s*```mermaid/m.test(text)) return true;
  const head = text.slice(0, 2000);
  return /^\s{0,3}#{1,6}\s/m.test(head);
};

// Escape HTML for safe text rendering of mermaid source when a diagram fails to render
const escapeHtml = (s) => s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// Fullscreen modal for inspecting a single embedded diagram. Renders the mermaid
// source fresh, with viewBox-driven zoom/pan + export. Closes on Esc / backdrop click.
function FullscreenDiagram({ src, onClose }) {
  const ref = useRef(null);
  const wrapRef = useRef(null);
  const baseVB = useRef({ x: 0, y: 0, width: 100, height: 100 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [error, setError] = useState(null);
  const [panning, setPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, pan: { x: 0, y: 0 } });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { svg } = await mermaid.render(`fs-mermaid-${Date.now()}`, src);
        if (cancelled || !ref.current) return;
        ref.current.innerHTML = svg;
        const svgEl = ref.current.querySelector('svg');
        if (svgEl) {
          let vb = svgEl.getAttribute('viewBox');
          if (!vb) {
            const w = parseFloat(svgEl.getAttribute('width')) || 100;
            const h = parseFloat(svgEl.getAttribute('height')) || 100;
            vb = `0 0 ${w} ${h}`;
            svgEl.setAttribute('viewBox', vb);
          }
          const [x, y, w, h] = vb.split(/\s+/).map(parseFloat);
          baseVB.current = { x, y, width: w, height: h };
          svgEl.setAttribute('width', '100%');
          svgEl.setAttribute('height', '100%');
          svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
          svgEl.style.maxWidth = 'none';
          svgEl.style.maxHeight = 'none';
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to render diagram');
      }
    })();
    return () => { cancelled = true; };
  }, [src]);

  useEffect(() => {
    const svgEl = ref.current?.querySelector('svg');
    if (!svgEl) return;
    const base = baseVB.current;
    const w = base.width / zoom;
    const h = base.height / zoom;
    const x = base.x + (base.width - w) / 2 - pan.x;
    const y = base.y + (base.height - h) / 2 - pan.y;
    svgEl.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
  }, [zoom, pan]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const svgEl = ref.current?.querySelector('svg');
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const vb = svgEl.viewBox.baseVal;
    const base = baseVB.current;
    if (e.ctrlKey || e.metaKey || !e.shiftKey) {
      // Default: zoom (most natural for fullscreen inspection)
      const zCurrent = base.width / vb.width;
      const factor = Math.exp(-e.deltaY * 0.01);
      const zNew = Math.min(20, Math.max(0.1, zCurrent * factor));
      const rx = (e.clientX - rect.left) / rect.width;
      const ry = (e.clientY - rect.top) / rect.height;
      const sx = vb.x + rx * vb.width;
      const sy = vb.y + ry * vb.height;
      const wNew = base.width / zNew;
      const hNew = base.height / zNew;
      const panX = base.x + (base.width - wNew) / 2 - (sx - rx * wNew);
      const panY = base.y + (base.height - hNew) / 2 - (sy - ry * hNew);
      setZoom(zNew);
      setPan({ x: panX, y: panY });
    } else {
      const scaleX = vb.width / rect.width;
      const scaleY = vb.height / rect.height;
      setPan((p) => ({ x: p.x - e.deltaX * scaleX, y: p.y - e.deltaY * scaleY }));
    }
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const onPointerDown = (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (e.button !== 0 && e.button !== 1) return;
    if (e.button === 0 && tag === 'text' && !e.altKey) return;
    e.preventDefault();
    setPanning(true);
    panStart.current = { clientX: e.clientX, clientY: e.clientY, pan: { ...pan } };
  };
  const onPointerMove = (e) => {
    if (!panning) return;
    const svgEl = ref.current?.querySelector('svg');
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const vb = svgEl.viewBox.baseVal;
    const scaleX = vb.width / rect.width;
    const scaleY = vb.height / rect.height;
    setPan({
      x: panStart.current.pan.x + (e.clientX - panStart.current.clientX) * scaleX,
      y: panStart.current.pan.y + (e.clientY - panStart.current.clientY) * scaleY,
    });
  };
  const onPointerUp = () => setPanning(false);

  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const exportAs = (format, scale = 4) => {
    const svgEl = ref.current?.querySelector('svg');
    if (!svgEl) return;
    const clone = svgEl.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '100%');
    bg.setAttribute('height', '100%');
    bg.setAttribute('fill', 'white');
    clone.insertBefore(bg, clone.firstChild);
    const data = new XMLSerializer().serializeToString(clone);
    if (format === 'svg') {
      const blob = new Blob([data], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'diagram.svg'; a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'diagram.png'; a.click();
        URL.revokeObjectURL(url);
      }, 'image/png', 0.95);
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(data)));
  };

  const copySource = async () => {
    try { await navigator.clipboard.writeText(src); } catch { /* ignore */ }
  };

  return (
    <div className="fs-overlay" onClick={onClose}>
      <div className="fs-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fs-toolbar">
          <button className="fs-tool-btn" onClick={() => setZoom((z) => Math.max(0.1, z / 1.25))} title="Zoom out">−</button>
          <button className="fs-tool-btn fs-zoom-label" onClick={reset} title="Reset zoom">{Math.round(zoom * 100)}%</button>
          <button className="fs-tool-btn" onClick={() => setZoom((z) => Math.min(20, z * 1.25))} title="Zoom in">+</button>
          <span className="fs-tool-sep" />
          <button className="fs-tool-btn" onClick={copySource} title="Copy Mermaid source">Copy source</button>
          <button className="fs-tool-btn" onClick={() => exportAs('png', 4)} title="Export as PNG (4x)">PNG</button>
          <button className="fs-tool-btn" onClick={() => exportAs('svg')} title="Export as SVG">SVG</button>
          <span className="fs-tool-spacer" />
          <button className="fs-tool-btn fs-close" onClick={onClose} title="Close (Esc)">✕</button>
        </div>
        {error ? (
          <div className="fs-error">
            <div className="fs-error-title">Failed to render</div>
            <div className="fs-error-msg">{error}</div>
          </div>
        ) : (
          <div
            className={`fs-canvas ${panning ? 'panning' : ''}`}
            ref={wrapRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <div className="fs-svg" ref={ref} />
          </div>
        )}
      </div>
    </div>
  );
}

const DIAGRAM_TEMPLATES = {
  'Flowchart': {
    icon: '🔀',
    desc: 'Visualize processes, workflows, and decision trees. Best for step-by-step logic with branching paths.',
    code: `graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E`,
  },
  'Sequence': {
    icon: '🔄',
    desc: 'Show interactions between actors or systems over time. Great for API calls, user flows, and protocols.',
    code: `sequenceDiagram
    participant Alice
    participant Bob
    Alice->>Bob: Hello Bob, how are you?
    Bob-->>Alice: Great!
    Alice-)Bob: See you later!`,
  },
  'Class': {
    icon: '🏗️',
    desc: 'Model object-oriented structures with classes, properties, and relationships. Ideal for software architecture.',
    code: `classDiagram
    class Animal {
        +String name
        +int age
        +makeSound()
    }
    class Dog {
        +fetch()
    }
    class Cat {
        +purr()
    }
    Animal <|-- Dog
    Animal <|-- Cat`,
  },
  'State': {
    icon: '⚡',
    desc: 'Describe state machines and transitions. Use for UI states, order statuses, or system lifecycle.',
    code: `stateDiagram-v2
    [*] --> Idle
    Idle --> Processing : Start
    Processing --> Success : Done
    Processing --> Error : Fail
    Success --> [*]
    Error --> Idle : Retry`,
  },
  'ER Diagram': {
    icon: '🗄️',
    desc: 'Design database schemas with entities and relationships. Essential for data modeling and DB planning.',
    code: `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    CUSTOMER {
        string name
        string email
    }
    ORDER {
        int id
        date created
    }
    LINE_ITEM {
        int quantity
        float price
    }`,
  },
  'Gantt': {
    icon: '📊',
    desc: 'Plan project timelines with tasks, durations, and dependencies. Perfect for project management.',
    code: `gantt
    title Project Plan
    dateFormat  YYYY-MM-DD
    section Design
    Research       :a1, 2024-01-01, 7d
    Wireframes     :a2, after a1, 5d
    section Development
    Frontend       :b1, after a2, 10d
    Backend        :b2, after a2, 12d
    section Testing
    QA             :c1, after b2, 5d`,
  },
  'Pie Chart': {
    icon: '🥧',
    desc: 'Show proportional data distribution. Use for budgets, survey results, or resource allocation.',
    code: `pie title Budget Distribution
    "Development" : 40
    "Design" : 20
    "Marketing" : 25
    "Operations" : 15`,
  },
  'Mindmap': {
    icon: '🧠',
    desc: 'Organize ideas hierarchically. Great for brainstorming, feature planning, and knowledge structures.',
    code: `mindmap
  root((Project))
    Planning
      Goals
      Timeline
      Resources
    Development
      Frontend
      Backend
      Database
    Launch
      Testing
      Deploy
      Monitor`,
  },
  'Timeline': {
    icon: '📅',
    desc: 'Display events in chronological order. Use for roadmaps, milestones, and historical overviews.',
    code: `timeline
    title Project Milestones
    2024-Q1 : Research
            : Planning
    2024-Q2 : Development
            : Alpha Release
    2024-Q3 : Beta Testing
            : Bug Fixes
    2024-Q4 : Launch
            : Post-launch Support`,
  },
  'Git Graph': {
    icon: '🌿',
    desc: 'Visualize Git branching and merge strategies. Useful for documenting workflows and release processes.',
    code: `gitGraph
    commit
    commit
    branch develop
    checkout develop
    commit
    commit
    checkout main
    merge develop
    commit
    branch feature
    checkout feature
    commit
    checkout main
    merge feature`,
  },
  'Markdown Doc': {
    icon: '📄',
    desc: 'A README-style document with prose, headings, lists, tables, and embedded Mermaid diagrams. The preview renders each section in turn — text, then diagram, then text — like a real README.',
    code: `# Markdown with embedded diagrams

Write prose as usual, and drop in Mermaid diagrams using fenced code blocks.

\`\`\`mermaid
flowchart LR
    A[Edit] --> B{Markdown?}
    B -->|Yes| C[Render prose + diagrams]
    B -->|No| D[Render single diagram]
\`\`\`

You can have **bold**, *italic*, \`inline code\`, [links](https://mermaid.js.org), lists:

- item one
- item two
- item three

And tables:

| Column | Description |
|---|---|
| A | first |
| B | second |

Then another diagram:

\`\`\`mermaid
sequenceDiagram
    User->>Editor: paste markdown
    Editor->>Preview: rendered document
    Preview-->>User: prose + live diagrams
\`\`\`
`,
  },
};

const TEMPLATE_NAMES = Object.keys(DIAGRAM_TEMPLATES);

const DEFAULT_CODE = DIAGRAM_TEMPLATES['Flowchart'].code;

const API = '/api/diagrams';

// URL <-> active diagram sync (path-based routing, no router dep)
const getUrlDiagramId = () => {
  const m = window.location.pathname.match(/^\/d\/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
};

const setUrlDiagramId = (id, { replace = false } = {}) => {
  const path = id ? `/d/${id}` : '/';
  if (window.location.pathname === path) return;
  const fn = replace ? 'replaceState' : 'pushState';
  window.history[fn]({ diagramId: id }, '', path);
};

export default function App() {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [savedCode, setSavedCode] = useState(DEFAULT_CODE);
  const [savedTitle, setSavedTitle] = useState('Untitled');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [title, setTitle] = useState('Untitled');
  const [diagrams, setDiagrams] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [error, setError] = useState(null);
  const [versions, setVersions] = useState([]);
  const [activeVersion, setActiveVersion] = useState(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiModel, setAiModel] = useState('qwen2.5-coder:14b');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiRetries, setAiRetries] = useState(0);
  const [lastAiPrompt, setLastAiPrompt] = useState('');
  const [aiLogs, setAiLogs] = useState([]);
  const MAX_RETRIES = 3;
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('Flowchart');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });
  const modalPreviewRef = useRef(null);
  const previewWrapRef = useRef(null);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [aiClarification, setAiClarification] = useState(null);
  const [aiContext, setAiContext] = useState([]);
  const [clarifyCount, setClarifyCount] = useState(0);
  const previewRef = useRef(null);
  const debounceRef = useRef(null);
  const fileInputRef = useRef(null);
  const [fullscreenDiagram, setFullscreenDiagram] = useState(null);

  const fetchDiagrams = useCallback(async () => {
    try {
      const res = await fetch(API);
      setDiagrams(await res.json());
    } catch {
      // server may not be running yet
    }
  }, []);

  useEffect(() => { fetchDiagrams(); }, [fetchDiagrams]);

  const fetchVersions = useCallback(async (diagramId) => {
    try {
      const res = await fetch(`${API}/${diagramId}/versions-with-logs`);
      setVersions(await res.json());
    } catch {
      setVersions([]);
    }
  }, []);

  const fetchAiLogs = useCallback(async (diagramId) => {
    try {
      const res = await fetch(`${API}/${diagramId}/logs`);
      setAiLogs(await res.json());
    } catch {
      setAiLogs([]);
    }
  }, []);

  // Render modal preview when template selection changes
  useEffect(() => {
    if (!showNewModal || !modalPreviewRef.current) return;
    const tmpl = DIAGRAM_TEMPLATES[selectedTemplate];
    if (!tmpl) return;
    (async () => {
      try {
        const id = 'modal-preview-' + Date.now();
        const { svg } = await mermaid.render(id, tmpl.code);
        if (modalPreviewRef.current) modalPreviewRef.current.innerHTML = svg;
      } catch {
        if (modalPreviewRef.current) modalPreviewRef.current.innerHTML = '<p style="color:#94a3b8">Preview unavailable</p>';
      }
    })();
  }, [showNewModal, selectedTemplate]);

  // Base viewBox of the rendered SVG (immutable after render)
  const baseViewBox = useRef({ x: 0, y: 0, width: 100, height: 100 });
  // Track current render mode so zoom/pan effects can skip markdown mode
  const [renderMode, setRenderMode] = useState('mermaid'); // 'mermaid' | 'markdown'

  // Render a markdown document with embedded ```mermaid blocks
  const renderMarkdownDoc = useCallback(async (mdSource) => {
    if (!previewRef.current) return;
    const placeholders = [];
    // marked emits <pre><code class="language-mermaid">...</code></pre> for fenced mermaid blocks.
    // Walk the parsed DOM and replace each one with an async-rendered SVG placeholder.
    const html = marked.parse(mdSource);
    const wrap = document.createElement('div');
    wrap.className = 'markdown-body';
    wrap.innerHTML = html;
    const blocks = wrap.querySelectorAll('pre > code.language-mermaid');
    blocks.forEach((codeEl, i) => {
      const src = codeEl.textContent || '';
      const ph = document.createElement('div');
      ph.className = 'md-mermaid-block';
      ph.dataset.idx = String(i);

      // Per-diagram toolbar (top-right): copy source + open fullscreen.
      // Listeners are bound directly so the buttons keep working after every re-render of the markdown.
      const tb = document.createElement('div');
      tb.className = 'md-mermaid-toolbar';

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'md-mermaid-tool-btn';
      copyBtn.title = 'Copy Mermaid source';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(src);
          copyBtn.textContent = 'Copied';
          setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1200);
        } catch { /* ignore */ }
      });

      const fsBtn = document.createElement('button');
      fsBtn.type = 'button';
      fsBtn.className = 'md-mermaid-tool-btn md-mermaid-fs-btn';
      fsBtn.title = 'Open diagram fullscreen';
      fsBtn.textContent = '⤢ Fullscreen';
      fsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setFullscreenDiagram({ src });
      });

      tb.appendChild(copyBtn);
      tb.appendChild(fsBtn);

      const inner = document.createElement('div');
      inner.className = 'md-mermaid-svg';

      ph.appendChild(tb);
      ph.appendChild(inner);
      codeEl.parentElement.replaceWith(ph);
      placeholders.push({ el: inner, src });
    });
    previewRef.current.innerHTML = '';
    previewRef.current.appendChild(wrap);

    // Render each mermaid block individually. A bad block shouldn't kill the whole doc.
    await Promise.all(placeholders.map(async ({ el, src }, i) => {
      try {
        const { svg } = await mermaid.render(`md-mermaid-${Date.now()}-${i}`, src);
        el.innerHTML = svg;
        const svgEl = el.querySelector('svg');
        if (svgEl) {
          svgEl.removeAttribute('width');
          svgEl.removeAttribute('height');
          svgEl.style.maxWidth = '100%';
          svgEl.style.height = 'auto';
        }
      } catch (e) {
        el.innerHTML = `<div class="md-mermaid-error"><div class="md-mermaid-error-title">Diagram failed to render</div><div class="md-mermaid-error-msg">${escapeHtml(e.message || 'Invalid Mermaid syntax')}</div><pre>${escapeHtml(src)}</pre></div>`;
      }
    }));
    setError(null);
  }, []);

  const renderDiagram = useCallback(async (mermaidCode) => {
    if (!previewRef.current) return;
    if (isMarkdownDoc(mermaidCode)) {
      setRenderMode('markdown');
      try {
        await renderMarkdownDoc(mermaidCode);
      } catch (e) {
        setError(e.message || 'Markdown render failed');
        previewRef.current.innerHTML = '';
      }
      return;
    }
    setRenderMode('mermaid');
    try {
      const { svg } = await mermaid.render('mermaid-preview', mermaidCode);
      previewRef.current.innerHTML = svg;
      const svgEl = previewRef.current.querySelector('svg');
      if (svgEl) {
        // Ensure viewBox exists — compute from width/height if missing
        let vb = svgEl.getAttribute('viewBox');
        if (!vb) {
          const w = parseFloat(svgEl.getAttribute('width')) || 100;
          const h = parseFloat(svgEl.getAttribute('height')) || 100;
          vb = `0 0 ${w} ${h}`;
          svgEl.setAttribute('viewBox', vb);
        }
        const [x, y, w, h] = vb.split(/\s+/).map(parseFloat);
        baseViewBox.current = { x, y, width: w, height: h };
        // Fill container, use viewBox for scaling
        svgEl.setAttribute('width', '100%');
        svgEl.setAttribute('height', '100%');
        svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svgEl.style.maxWidth = 'none';
        svgEl.style.maxHeight = 'none';
        svgEl.style.shapeRendering = 'geometricPrecision';
        svgEl.style.textRendering = 'geometricPrecision';
      }
      setError(null);
    } catch (e) {
      setError(e.message || 'Invalid Mermaid syntax');
      previewRef.current.innerHTML = '';
    }
  }, [renderMarkdownDoc]);

  // Apply zoom + pan by rewriting viewBox (true vector scaling, no rasterization)
  useEffect(() => {
    if (renderMode === 'markdown') return; // zoom/pan don't apply to markdown view
    const svgEl = previewRef.current?.querySelector('svg');
    if (!svgEl) return;
    const base = baseViewBox.current;
    // zoom=1 → full viewBox. zoom=2 → half the viewBox (i.e. zoomed in 2x)
    const w = base.width / zoom;
    const h = base.height / zoom;
    // Center the scaled viewBox around the base center, then offset by pan
    // Pan is in SVG user units already (converted from pixels in the handler)
    const x = base.x + (base.width - w) / 2 - pan.x;
    const y = base.y + (base.height - h) / 2 - pan.y;
    svgEl.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
  }, [zoom, pan, code, renderMode]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => renderDiagram(code), 300);
    return () => clearTimeout(debounceRef.current);
  }, [code, renderDiagram]);

  const loadDiagram = async (id, { skipUrl = false, replace = false } = {}) => {
    const res = await fetch(`${API}/${id}`);
    if (!res.ok) {
      // Diagram missing (e.g. stale URL after delete) — drop the URL silently
      setUrlDiagramId(null, { replace: true });
      return;
    }
    const d = await res.json();
    setCode(d.code);
    setTitle(d.title);
    setSavedCode(d.code);
    setSavedTitle(d.title);
    setActiveId(d.id);
    setActiveVersion(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    fetchVersions(d.id);
    fetchAiLogs(d.id);
    if (!skipUrl) setUrlDiagramId(d.id, { replace });
  };

  // On first mount: if the URL points at a diagram, load it.
  useEffect(() => {
    const id = getUrlDiagramId();
    if (id) loadDiagram(id, { skipUrl: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Back / forward buttons: re-sync state from the URL.
  useEffect(() => {
    const onPop = () => {
      const id = getUrlDiagramId();
      if (id) {
        loadDiagram(id, { skipUrl: true });
      } else {
        setCode(DEFAULT_CODE);
        setTitle('Untitled');
        setSavedCode(DEFAULT_CODE);
        setSavedTitle('Untitled');
        setActiveId(null);
        setVersions([]);
        setActiveVersion(null);
        setAiLogs([]);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDirty = code !== savedCode || title !== savedTitle;

  const saveDiagram = async () => {
    if (!isDirty) return;
    const method = activeId ? 'PUT' : 'POST';
    const url = activeId ? `${API}/${activeId}` : API;
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, code }),
    });
    const d = await res.json();
    setActiveId(d.id);
    setActiveVersion(null);
    setSavedCode(code);
    setSavedTitle(title);
    fetchDiagrams();
    fetchVersions(d.id);
  };

  const openFile = async (file) => {
    if (!file) return;
    const text = await file.text();
    // Drop the extension for a nicer default title.
    const baseName = file.name.replace(/\.[^.]+$/, '');
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: baseName || 'Imported', code: text }),
    });
    const d = await res.json();
    setCode(text);
    setTitle(baseName || 'Imported');
    setSavedCode(text);
    setSavedTitle(baseName || 'Imported');
    setActiveId(d.id);
    setVersions([]);
    setActiveVersion(null);
    setAiLogs([]);
    setUrlDiagramId(d.id);
    fetchDiagrams();
    fetchVersions(d.id);
  };

  const newDiagram = (typeName) => {
    setShowNewModal(false);
    const template = DIAGRAM_TEMPLATES[typeName] || DIAGRAM_TEMPLATES['Flowchart'];
    const newTitle = typeName;
    const templateCode = template.code;
    (async () => {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, code: templateCode }),
      });
      const d = await res.json();
      setCode(templateCode);
      setTitle(newTitle);
      setSavedCode(templateCode);
      setSavedTitle(newTitle);
      setActiveId(d.id);
      setVersions([]);
      setActiveVersion(null);
      setAiLogs([]);
      setUrlDiagramId(d.id);
      fetchDiagrams();
      fetchVersions(d.id);
    })();
  };

  // Cmd/Ctrl+S saves (creates a new version if there are changes)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (isDirty) saveDiagram();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDirty, code, title, activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const deleteDiagram = async (id) => {
    const targetId = id || activeId;
    if (!targetId) return;
    await fetch(`${API}/${targetId}`, { method: 'DELETE' });
    if (targetId === activeId) {
      setCode(DEFAULT_CODE);
      setTitle('Untitled');
      setSavedCode(DEFAULT_CODE);
      setSavedTitle('Untitled');
      setActiveId(null);
      setVersions([]);
      setActiveVersion(null);
      setAiLogs([]);
      setUrlDiagramId(null, { replace: true });
    }
    setDeleteConfirm(null);
    fetchDiagrams();
  };

  const viewVersion = async (version) => {
    const res = await fetch(`${API}/${activeId}/versions/${version.id}`);
    const v = await res.json();
    setActiveVersion(v);
    renderDiagram(v.code);
  };

  const restoreVersion = async () => {
    if (!activeVersion || !activeId) return;
    const restoredCode = activeVersion.code;
    setCode(restoredCode);
    setActiveVersion(null);

    // Save as new version (update diagram + creates version entry)
    const res = await fetch(`${API}/${activeId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, code: restoredCode }),
    });
    await res.json();
    fetchDiagrams();
    fetchVersions(activeId);
  };

  const exitVersionView = () => {
    setActiveVersion(null);
    renderDiagram(code);
  };

  // Detect diagram type from code
  const detectDiagramType = (mermaidCode) => {
    if (isMarkdownDoc(mermaidCode)) return 'Markdown Doc';
    const first = mermaidCode.trim().split('\n')[0].trim().toLowerCase();
    if (first.startsWith('graph') || first.startsWith('flowchart')) return 'Flowchart';
    if (first.startsWith('sequencediagram')) return 'Sequence';
    if (first.startsWith('classdiagram')) return 'Class';
    if (first.startsWith('statediagram')) return 'State';
    if (first.startsWith('erdiagram')) return 'ER Diagram';
    if (first.startsWith('gantt')) return 'Gantt';
    if (first.startsWith('pie')) return 'Pie Chart';
    if (first.startsWith('mindmap')) return 'Mindmap';
    if (first.startsWith('timeline')) return 'Timeline';
    if (first.startsWith('gitgraph')) return 'Git Graph';
    return 'Diagram';
  };

  const currentDiagramType = detectDiagramType(code);

  // Validate mermaid code without rendering to DOM
  const validateMermaid = async (mermaidCode) => {
    try {
      const id = 'validate-' + Date.now();
      await mermaid.parse(mermaidCode);
      return null; // no error
    } catch (e) {
      return e.message || 'Invalid Mermaid syntax';
    }
  };

  const sendAiPrompt = async (overridePrompt, currentContext, currentClarifyCount, retryAttempt) => {
    const promptText = overridePrompt || aiPrompt;
    if (!promptText.trim() || aiLoading) return;
    if (!retryAttempt) setLastAiPrompt(promptText);
    setAiLoading(true);
    setAiError(null);
    setAiClarification(null);

    const ctx = currentContext || aiContext;
    const count = currentClarifyCount ?? clarifyCount;
    const attempt = retryAttempt || 0;
    setAiRetries(attempt);

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          prompt: promptText,
          model: aiModel,
          context: ctx,
          clarifyCount: count,
          diagramType: currentDiagramType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');

      if (data.type === 'clarify') {
        setAiClarification({ question: data.question, options: data.options });
        setAiContext([...ctx, { role: 'user', content: promptText }, { role: 'assistant', content: JSON.stringify(data) }]);
        setClarifyCount(count + 1);
        setAiPrompt('');
        setAiRetries(0);
      } else {
        // Validate the generated code
        const validationError = await validateMermaid(data.code);

        if (validationError && attempt < MAX_RETRIES) {
          // Retry: send error back to model
          const retryPrompt = `The Mermaid code you generated has a syntax error:\n\n${validationError}\n\nHere is the broken code:\n${data.code}\n\nPlease fix it and return valid Mermaid code.`;
          const retryContext = [
            ...ctx,
            { role: 'user', content: promptText },
            { role: 'assistant', content: data.code },
            { role: 'user', content: retryPrompt },
          ];
          setAiLoading(false); // will be set true again in recursive call
          return sendAiPrompt(retryPrompt, retryContext, 3, attempt + 1);
        }

        if (validationError) {
          // Don't insert broken code — keep previous working version
          setAiRetries(0);
          setAiError(`Generation failed after ${MAX_RETRIES + 1} attempts. The model couldn't produce valid Mermaid code. Try rephrasing your request or simplify it.`);
          return;
        }

        // Valid code — apply it
        setCode(data.code);
        setActiveVersion(null);
        setAiPrompt('');
        setAiContext([]);
        setClarifyCount(0);
        setAiRetries(0);

        // Auto-save to create a version
        const saveMethod = activeId ? 'PUT' : 'POST';
        const saveUrl = activeId ? `${API}/${activeId}` : API;
        const saveRes = await fetch(saveUrl, {
          method: saveMethod,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, code: data.code }),
        });
        const saved = await saveRes.json();
        setActiveId(saved.id);
        setSavedCode(data.code);
        setSavedTitle(title);

        // Save AI log and link to latest version
        const versionsRes = await fetch(`${API}/${saved.id}/versions-with-logs`);
        const allVersions = await versionsRes.json();
        const latestVersion = allVersions[allVersions.length - 1];
        await fetch(`${API}/${saved.id}/logs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: promptText,
            response: data.explanation || 'Code generated',
            model: aiModel,
            versionId: latestVersion?.id,
          }),
        });

        fetchDiagrams();
        fetchVersions(saved.id);
        fetchAiLogs(saved.id);
      }
    } catch (e) {
      setAiError(e.message);
      setAiRetries(0);
    } finally {
      setAiLoading(false);
    }
  };

  const selectClarifyOption = (option) => {
    const newContext = [...aiContext, { role: 'user', content: option }];
    setAiContext(newContext);
    setAiClarification(null);
    sendAiPrompt(option, newContext, clarifyCount);
  };

  // Skip = force the model to decide on its own (send with clarifyCount=3 to force generate)
  const skipClarification = () => {
    const newContext = [...aiContext, { role: 'user', content: 'Just decide on your own and generate the code.' }];
    setAiContext(newContext);
    setAiClarification(null);
    sendAiPrompt('Just decide on your own and generate the code.', newContext, 3);
  };

  // Custom clarification input — force no more clarifications after this
  const sendCustomClarification = () => {
    if (!aiPrompt.trim() || aiLoading) return;
    const newContext = [...aiContext, { role: 'user', content: aiPrompt }];
    setAiContext(newContext);
    setAiClarification(null);
    sendAiPrompt(aiPrompt, newContext, 3); // count=3 forces code generation
  };

  const resetClarification = () => {
    setAiClarification(null);
    setAiContext([]);
    setClarifyCount(0);
    setAiPrompt('');
  };

  // Convert a screen (client) position to SVG user units using getScreenCTM
  const screenToSvg = (clientX, clientY) => {
    const svgEl = previewRef.current?.querySelector('svg');
    if (!svgEl) return { x: 0, y: 0 };
    const pt = svgEl.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svgEl.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x, y: svgPt.y };
  };

  // Wheel: pinch/ctrl = zoom towards cursor, plain scroll = pan in SVG units
  const handleWheel = useCallback((e) => {
    if (renderMode === 'markdown') return; // let the browser scroll naturally
    e.preventDefault();
    const svgEl = previewRef.current?.querySelector('svg');
    if (!svgEl) return;

    const rect = svgEl.getBoundingClientRect();
    const vb = svgEl.viewBox.baseVal;

    if (e.ctrlKey || e.metaKey) {
      // Zoom towards cursor — compute new zoom AND pan in one shot from live viewBox.
      // Reading from DOM avoids stale closure state when wheel events fire faster
      // than React can commit.
      const base = baseViewBox.current;
      const zCurrent = base.width / vb.width;
      const factor = Math.exp(-e.deltaY * 0.01);
      const zNew = Math.min(20, Math.max(0.1, zCurrent * factor));

      // Cursor position as a ratio inside the SVG element, then converted to SVG coords
      const rx = (e.clientX - rect.left) / rect.width;
      const ry = (e.clientY - rect.top) / rect.height;
      const sx = vb.x + rx * vb.width;
      const sy = vb.y + ry * vb.height;

      const wNew = base.width / zNew;
      const hNew = base.height / zNew;
      // Keep (sx, sy) under the cursor after the zoom change
      const panX = base.x + (base.width - wNew) / 2 - (sx - rx * wNew);
      const panY = base.y + (base.height - hNew) / 2 - (sy - ry * hNew);

      setZoom(zNew);
      setPan({ x: panX, y: panY });
    } else {
      const scaleX = vb.width / rect.width;
      const scaleY = vb.height / rect.height;
      setPan((p) => ({
        x: p.x - e.deltaX * scaleX,
        y: p.y - e.deltaY * scaleY,
      }));
    }
  }, [renderMode]);

  useEffect(() => {
    const el = previewWrapRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handlePointerDown = useCallback((e) => {
    if (renderMode === 'markdown') return; // no pan in document mode
    // Left-click drag (on empty area) or alt+click or middle-click → pan
    const tag = (e.target.tagName || '').toLowerCase();
    const canDrag = e.button === 1 || (e.button === 0 && e.altKey) || (e.button === 0 && tag !== 'text');
    if (!canDrag) return;
    e.preventDefault();
    setIsPanning(true);
    panStart.current = { clientX: e.clientX, clientY: e.clientY, pan: { ...pan } };
  }, [pan, renderMode]);

  const handlePointerMove = useCallback((e) => {
    if (!isPanning) return;
    const svgEl = previewRef.current?.querySelector('svg');
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const vb = svgEl.viewBox.baseVal;
    const scaleX = vb.width / rect.width;
    const scaleY = vb.height / rect.height;
    const dx = (e.clientX - panStart.current.clientX) * scaleX;
    const dy = (e.clientY - panStart.current.clientY) * scaleY;
    setPan({
      x: panStart.current.pan.x + dx,
      y: panStart.current.pan.y + dy,
    });
  }, [isPanning]);

  const handlePointerUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const resetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const zoomIn = () => setZoom((z) => Math.min(20, z * 1.25));
  const zoomOut = () => setZoom((z) => Math.max(0.1, z / 1.25));

  const exportDiagram = (format, scale = 4) => {
    const svgEl = previewRef.current?.querySelector('svg');
    if (!svgEl) return;

    const svgClone = svgEl.cloneNode(true);
    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    // Ensure white background
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '100%');
    bg.setAttribute('height', '100%');
    bg.setAttribute('fill', 'white');
    svgClone.insertBefore(bg, svgClone.firstChild);

    if (format === 'svg') {
      const svgData = new XMLSerializer().serializeToString(svgClone);
      const blob = new Blob([svgData], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title || 'diagram'}.svg`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    const svgData = new XMLSerializer().serializeToString(svgClone);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      // scale passed as parameter
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const ext = format === 'jpeg' ? 'jpg' : 'png';
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title || 'diagram'}.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
      }, mimeType, 0.95);
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const [showExportMenu, setShowExportMenu] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebarCollapsed') === '1';
  });
  const [versionsCollapsed, setVersionsCollapsed] = useState(() => {
    return localStorage.getItem('versionsCollapsed') === '1';
  });

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', sidebarCollapsed ? '1' : '0');
  }, [sidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem('versionsCollapsed', versionsCollapsed ? '1' : '0');
  }, [versionsCollapsed]);
  const [editorWidth, setEditorWidth] = useState(() => {
    const saved = localStorage.getItem('editorWidthPct');
    return saved ? parseFloat(saved) : 40; // percent of editor-preview area
  });
  const resizingRef = useRef(false);

  const startResize = (e) => {
    e.preventDefault();
    resizingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!resizingRef.current) return;
      const container = document.querySelector('.editor-preview');
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.min(75, Math.max(15, pct));
      setEditorWidth(clamped);
    };
    const onUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem('editorWidthPct', String(editorWidth));
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [editorWidth]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  return (
    <div className="app">
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          {!sidebarCollapsed && <h2>Diagrams</h2>}
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? '›' : '‹'}
          </button>
        </div>
        <button
          className="btn btn-new"
          onClick={() => { setSelectedTemplate('Flowchart'); setShowNewModal(true); }}
          title="New diagram"
        >
          {sidebarCollapsed ? '+' : '+ New'}
        </button>
        <button
          className="btn btn-open"
          onClick={() => fileInputRef.current?.click()}
          title="Open a .md or .mmd file"
        >
          {sidebarCollapsed ? '↥' : '↥ Open file'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.markdown,.mmd,.mermaid,text/markdown,text/plain"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) openFile(f);
            e.target.value = '';
          }}
        />
        <ul className="diagram-list">
          {diagrams.map((d) => {
            const isActive = d.id === activeId;
            const itemDirty = isActive && isDirty;
            const initial = (d.title || '?').charAt(0).toUpperCase();
            return (
              <li
                key={d.id}
                className={isActive ? 'active' : ''}
                onClick={() => loadDiagram(d.id)}
                title={sidebarCollapsed ? d.title : undefined}
              >
                {sidebarCollapsed ? (
                  <div className="diagram-tile">
                    <span className="diagram-tile-initial">{initial}</span>
                    {isActive && (
                      <span className={`diagram-tile-dot ${itemDirty ? 'dirty' : 'saved'}`} />
                    )}
                  </div>
                ) : (
                  <>
                    <div className="diagram-info">
                      <div className="diagram-title-row">
                        <span className="diagram-title">{d.title}</span>
                        {isActive && (
                          <span
                            className={`save-indicator ${itemDirty ? 'dirty' : 'saved'}`}
                            title={itemDirty ? 'Unsaved changes' : 'All changes saved'}
                          >
                            {itemDirty ? '●' : '✓'}
                          </span>
                        )}
                      </div>
                      <span className="diagram-date">
                        {new Date(d.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="diagram-actions">
                      {isActive && (
                        <button
                          className="icon-btn icon-save"
                          onClick={(e) => { e.stopPropagation(); saveDiagram(); }}
                          disabled={!itemDirty}
                          title={itemDirty ? 'Save (Cmd/Ctrl+S)' : 'Nothing to save'}
                          aria-label="Save"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                            <polyline points="17 21 17 13 7 13 7 21" />
                            <polyline points="7 3 7 8 15 8" />
                          </svg>
                        </button>
                      )}
                      <button
                        className="icon-btn icon-delete"
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirm(d); }}
                        title="Delete diagram"
                        aria-label="Delete"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </svg>
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
          {!sidebarCollapsed && diagrams.length === 0 && <li className="empty">No saved diagrams</li>}
        </ul>
      </aside>

      <main className="main">
        <div className="toolbar">
          <input
            type="text"
            className="title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Diagram title"
          />
          {activeId && (
            <span className={`toolbar-status ${isDirty ? 'dirty' : 'saved'}`}>
              {isDirty ? 'Unsaved' : 'Saved'}
            </span>
          )}
        </div>

        <div className="editor-preview">
          <div className="editor-pane" style={{ flex: `0 0 ${editorWidth}%` }}>
            <h3>Mermaid Code</h3>
            <textarea
              value={code}
              onChange={(e) => { setCode(e.target.value); setActiveVersion(null); }}
              spellCheck={false}
              placeholder="Enter Mermaid diagram code..."
            />
            <div className="ai-panel">
              <button
                className="ai-toggle"
                onClick={() => setAiOpen(!aiOpen)}
              >
                <span className="ai-icon">AI</span>
                Ollama Assistant
                <span className="ai-diagram-type">{currentDiagramType}</span>
                <span className={`ai-chevron ${aiOpen ? 'open' : ''}`}>&#9660;</span>
              </button>
              {aiOpen && (
                <div className="ai-body">
                  <div className="ai-controls">
                    <div className="model-picker-wrap">
                      <button
                        className="model-picker-btn"
                        onClick={() => setShowModelPicker(!showModelPicker)}
                      >
                        {{'qwen2.5-coder:14b': 'Qwen 2.5 Coder 14B', 'llama3.1:8b': 'Llama 3.1 8B', 'mistral:7b': 'Mistral 7B'}[aiModel]}
                        <span className={`ai-chevron ${showModelPicker ? 'open' : ''}`}>&#9660;</span>
                      </button>
                      {showModelPicker && (
                        <div className="model-dropdown">
                          <div className={`model-option ${aiModel === 'qwen2.5-coder:14b' ? 'active' : ''}`} onClick={() => { setAiModel('qwen2.5-coder:14b'); setShowModelPicker(false); }}>
                            <div className="model-option-name">Qwen 2.5 Coder 14B</div>
                            <div className="model-option-desc">Best for diagrams. Code-specialized, understands Mermaid syntax well. Recommended.</div>
                          </div>
                          <div className={`model-option ${aiModel === 'llama3.1:8b' ? 'active' : ''}`} onClick={() => { setAiModel('llama3.1:8b'); setShowModelPicker(false); }}>
                            <div className="model-option-name">Llama 3.1 8B</div>
                            <div className="model-option-desc">Fast and lightweight. Good for simple changes, uses less RAM (~5GB).</div>
                          </div>
                          <div className={`model-option ${aiModel === 'mistral:7b' ? 'active' : ''}`} onClick={() => { setAiModel('mistral:7b'); setShowModelPicker(false); }}>
                            <div className="model-option-name">Mistral 7B</div>
                            <div className="model-option-desc">Balanced general-purpose model. Good at following instructions precisely.</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  {aiLogs.length > 0 && (
                    <div className="ai-log-panel">
                      {aiLogs.map((log) => (
                        <div key={log.id} className="ai-log-entry">
                          <div className="ai-log-user">
                            <span className="ai-log-label">You</span>
                            <span className="ai-log-text">{log.prompt}</span>
                          </div>
                          <div className="ai-log-assistant">
                            <span className="ai-log-label">AI</span>
                            <span className="ai-log-text">{log.response}</span>
                            <span className="ai-log-meta">{log.model} · {new Date(log.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="ai-input-row">
                    <textarea
                      className="ai-input"
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAiPrompt(); } }}
                      placeholder="Describe changes... e.g. 'add a logging step after Decision'"
                      rows={2}
                      disabled={aiLoading}
                    />
                    <button
                      className="btn ai-send"
                      onClick={sendAiPrompt}
                      disabled={aiLoading || !aiPrompt.trim()}
                    >
                      {aiLoading ? (aiRetries > 0 ? `Fixing... (${aiRetries}/${MAX_RETRIES})` : 'Generating...') : 'Send'}
                    </button>
                  </div>
                  {aiClarification && (
                    <div className="ai-clarification">
                      <div className="ai-clarify-header">
                        <span className="ai-clarify-icon">?</span>
                        <span className="ai-clarify-question">{aiClarification.question}</span>
                      </div>
                      <div className="ai-clarify-options">
                        {aiClarification.options.map((opt, i) => (
                          <button
                            key={i}
                            className="ai-option"
                            onClick={() => selectClarifyOption(opt)}
                            disabled={aiLoading}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                      <div className="ai-clarify-custom">
                        <textarea
                          className="ai-clarify-input"
                          value={aiPrompt}
                          onChange={(e) => setAiPrompt(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCustomClarification(); } }}
                          placeholder="Or type your own answer..."
                          rows={1}
                          disabled={aiLoading}
                        />
                        <button
                          className="btn ai-clarify-send"
                          onClick={sendCustomClarification}
                          disabled={aiLoading || !aiPrompt.trim()}
                        >
                          Send
                        </button>
                      </div>
                      <div className="ai-clarify-actions">
                        <button className="ai-clarify-skip" onClick={skipClarification} disabled={aiLoading}>
                          Let AI decide
                        </button>
                        <button className="ai-clarify-skip" onClick={resetClarification}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  {aiError && (
                    <div className="ai-error">
                      <span>{aiError}</span>
                      <button className="ai-error-retry" onClick={() => { setAiError(null); }}>
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div
            className="resize-handle"
            onMouseDown={startResize}
            title="Drag to resize"
          />

          <div className={`preview-pane ${fullscreen ? 'fullscreen' : ''}`}>
            <div className="preview-header">
              <h3>
                Preview
                {activeVersion && <span className="version-viewing">Viewing v{versions.findIndex(v => v.id === activeVersion.id) + 1}</span>}
                {error && <span className="error-badge">Error</span>}
              </h3>
              <div className="preview-toolbar">
                <div className="export-wrap">
                  <button className="export-btn" onClick={() => setShowExportMenu(!showExportMenu)} title="Export diagram">
                    Export &#9660;
                  </button>
                  {showExportMenu && (
                    <div className="export-menu">
                      <div className="export-section">PNG</div>
                      <button onClick={() => { exportDiagram('png', 2); setShowExportMenu(false); }}>PNG 2x</button>
                      <button onClick={() => { exportDiagram('png', 4); setShowExportMenu(false); }}>PNG 4x (recommended)</button>
                      <button onClick={() => { exportDiagram('png', 8); setShowExportMenu(false); }}>PNG 8x (high-res)</button>
                      <div className="export-section">Other</div>
                      <button onClick={() => { exportDiagram('jpeg', 4); setShowExportMenu(false); }}>JPEG 4x</button>
                      <button onClick={() => { exportDiagram('svg'); setShowExportMenu(false); }}>SVG (vector)</button>
                    </div>
                  )}
                </div>
                <div className="zoom-controls">
                  <button className="zoom-btn" onClick={zoomOut} title="Zoom out">−</button>
                  <button className="zoom-label" onClick={resetZoom} title="Reset zoom">{Math.round(zoom * 100)}%</button>
                  <button className="zoom-btn" onClick={zoomIn} title="Zoom in">+</button>
                </div>
                <button
                  className="fullscreen-btn"
                  onClick={() => setFullscreen(!fullscreen)}
                  title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
                >
                  {fullscreen ? '⤢ Exit' : '⤢ Fullscreen'}
                </button>
              </div>
            </div>
            {activeVersion && (
              <div className="version-bar">
                <span>Viewing version from {new Date(activeVersion.created_at).toLocaleString()}</span>
                <div className="version-bar-actions">
                  <button className="btn btn-restore" onClick={restoreVersion}>Restore</button>
                  <button className="btn btn-back" onClick={exitVersionView}>Back to current</button>
                </div>
              </div>
            )}
            {error && (
              <div className="preview-error-state">
                <div className="preview-error-icon">!</div>
                <div className="preview-error-title">Diagram has errors</div>
                <div className="preview-error-detail">{error}</div>
                <div className="preview-error-buttons">
                  <button
                    className="btn preview-error-autofix"
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/ai/autofix', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ code }),
                        });
                        const data = await res.json();
                        if (data.changed) setCode(data.code);
                        else setAiError('Auto-fix could not resolve this error. Try "Fix with AI".');
                      } catch { /* ignore */ }
                    }}
                  >
                    Quick fix
                  </button>
                  <button
                    className="btn preview-error-fix"
                    onClick={() => sendAiPrompt(`Fix the following Mermaid syntax error:\n${error}\n\nBroken code:\n${code}\n\nReturn corrected valid Mermaid code.`, [], 3)}
                    disabled={aiLoading}
                  >
                    {aiLoading ? 'Fixing...' : 'Fix with AI'}
                  </button>
                  {lastAiPrompt && (
                    <button
                      className="btn preview-error-retry"
                      onClick={() => sendAiPrompt(lastAiPrompt)}
                      disabled={aiLoading}
                    >
                      {aiLoading ? 'Regenerating...' : 'Retry prompt'}
                    </button>
                  )}
                </div>
              </div>
            )}
            <div
              className={`preview-container ${isPanning ? 'panning' : ''}`}
              ref={previewWrapRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              style={{ display: error ? 'none' : undefined }}
            >
              <div className="preview-canvas" ref={previewRef} />
            </div>
          </div>

          {versions.length > 0 && (
            <div className={`version-sidebar ${versionsCollapsed ? 'collapsed' : ''}`}>
              <div className="version-sidebar-header">
                <button
                  className="sidebar-toggle"
                  onClick={() => setVersionsCollapsed(!versionsCollapsed)}
                  title={versionsCollapsed ? 'Expand versions' : 'Collapse versions'}
                >
                  {versionsCollapsed ? '‹' : '›'}
                </button>
                {!versionsCollapsed && <h4>Versions</h4>}
                {!versionsCollapsed && <span className="version-count">{versions.length}</span>}
              </div>
              <div className="version-blocks">
                {[...versions].reverse().map((v) => {
                  const vNum = versions.indexOf(v) + 1;
                  const isLatest = v.id === versions[versions.length - 1]?.id;
                  const isActive = activeVersion?.id === v.id;
                  return (
                    <div
                      key={v.id}
                      className={`version-block ${isActive ? 'active' : ''} ${isLatest ? 'latest' : ''}`}
                      onClick={() => viewVersion(v)}
                      title={versionsCollapsed ? `v${vNum} — ${new Date(v.created_at).toLocaleString()}` : undefined}
                    >
                      {versionsCollapsed ? (
                        <div className="version-tile">
                          <span className="version-tile-num">v{vNum}</span>
                          {isLatest && <span className="version-tile-dot" />}
                        </div>
                      ) : (
                        <>
                          <div className="version-num">
                            v{vNum}
                            {isLatest && <span className="version-current">current</span>}
                          </div>
                          <div className="version-time">
                            {new Date(v.created_at).toLocaleString(undefined, {
                              month: 'short', day: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })}
                          </div>
                          <div className="version-preview">{v.ai_prompt ? `AI: ${v.ai_prompt}` : v.preview}</div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>

      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal modal-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Delete diagram?</h3>
              <button className="modal-close" onClick={() => setDeleteConfirm(null)}>&times;</button>
            </div>
            <div className="modal-confirm-body">
              <p>
                Are you sure you want to delete <strong>{deleteConfirm.title}</strong>?
                All versions and AI logs for this diagram will be permanently deleted.
              </p>
              <p className="modal-confirm-warning">This action cannot be undone.</p>
            </div>
            <div className="modal-confirm-actions">
              <button className="btn btn-cancel" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </button>
              <button className="btn btn-delete" onClick={() => deleteDiagram(deleteConfirm.id)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewModal && (
        <div className="modal-overlay" onClick={() => setShowNewModal(false)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Choose Diagram Type</h3>
              <button className="modal-close" onClick={() => setShowNewModal(false)}>&times;</button>
            </div>
            <div className="modal-body-split">
              <div className="template-list">
                {TEMPLATE_NAMES.map((name) => (
                  <div
                    key={name}
                    className={`template-item ${selectedTemplate === name ? 'active' : ''}`}
                    onClick={() => setSelectedTemplate(name)}
                  >
                    <span className="template-icon">{DIAGRAM_TEMPLATES[name].icon}</span>
                    <span className="template-name">{name}</span>
                  </div>
                ))}
              </div>
              <div className="template-detail">
                <div className="template-detail-header">
                  <span className="template-detail-icon">{DIAGRAM_TEMPLATES[selectedTemplate].icon}</span>
                  <h4>{selectedTemplate}</h4>
                </div>
                <p className="template-detail-desc">{DIAGRAM_TEMPLATES[selectedTemplate].desc}</p>
                <div className="template-preview-box" ref={modalPreviewRef} />
                <button className="btn btn-create" onClick={() => newDiagram(selectedTemplate)}>
                  Create {selectedTemplate}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {fullscreenDiagram && (
        <FullscreenDiagram
          src={fullscreenDiagram.src}
          onClose={() => setFullscreenDiagram(null)}
        />
      )}
    </div>
  );
}
