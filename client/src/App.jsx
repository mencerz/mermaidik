import { useState, useEffect, useRef, useCallback } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });

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
};

const TEMPLATE_NAMES = Object.keys(DIAGRAM_TEMPLATES);

const DEFAULT_CODE = DIAGRAM_TEMPLATES['Flowchart'].code;

const API = '/api/diagrams';

export default function App() {
  const [code, setCode] = useState(DEFAULT_CODE);
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

  const renderDiagram = useCallback(async (mermaidCode) => {
    if (!previewRef.current) return;
    try {
      const { svg } = await mermaid.render('mermaid-preview', mermaidCode);
      previewRef.current.innerHTML = svg;
      setError(null);
    } catch (e) {
      setError(e.message || 'Invalid Mermaid syntax');
      previewRef.current.innerHTML = '';
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => renderDiagram(code), 300);
    return () => clearTimeout(debounceRef.current);
  }, [code, renderDiagram]);

  const loadDiagram = async (id) => {
    const res = await fetch(`${API}/${id}`);
    const d = await res.json();
    setCode(d.code);
    setTitle(d.title);
    setActiveId(d.id);
    setActiveVersion(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    fetchVersions(d.id);
    fetchAiLogs(d.id);
  };

  const saveDiagram = async () => {
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
      setActiveId(d.id);
      setVersions([]);
      setActiveVersion(null);
      setAiLogs([]);
      fetchDiagrams();
      fetchVersions(d.id);
    })();
  };

  const deleteDiagram = async () => {
    if (!activeId) return;
    await fetch(`${API}/${activeId}`, { method: 'DELETE' });
    newDiagram();
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

  // Preview zoom/pan handlers
  const handleWheel = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      // Pinch-to-zoom (trackpad) or Ctrl+scroll
      e.preventDefault();
      const delta = -e.deltaY * 0.01;
      setZoom((z) => Math.min(5, Math.max(0.1, z + delta)));
    } else {
      // Regular scroll = pan
      e.preventDefault();
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  }, []);

  useEffect(() => {
    const el = previewWrapRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handlePointerDown = useCallback((e) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Middle-click or Alt+click to start panning
      e.preventDefault();
      setIsPanning(true);
      panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  }, [pan]);

  const handlePointerMove = useCallback((e) => {
    if (!isPanning) return;
    setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
  }, [isPanning]);

  const handlePointerUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const resetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const zoomIn = () => setZoom((z) => Math.min(5, z + 0.25));
  const zoomOut = () => setZoom((z) => Math.max(0.1, z - 0.25));

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

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  return (
    <div className="app">
      <aside className="sidebar">
        <h2>Diagrams</h2>
        <button className="btn btn-new" onClick={() => { setSelectedTemplate('Flowchart'); setShowNewModal(true); }}>+ New</button>
        <ul className="diagram-list">
          {diagrams.map((d) => (
            <li
              key={d.id}
              className={d.id === activeId ? 'active' : ''}
              onClick={() => loadDiagram(d.id)}
            >
              <span className="diagram-title">{d.title}</span>
              <span className="diagram-date">
                {new Date(d.updated_at).toLocaleDateString()}
              </span>
            </li>
          ))}
          {diagrams.length === 0 && <li className="empty">No saved diagrams</li>}
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
          <div className="toolbar-actions">
            <button className="btn btn-save" onClick={saveDiagram}>Save</button>
            {activeId && (
              <button className="btn btn-delete" onClick={deleteDiagram}>Delete</button>
            )}
          </div>
        </div>

        <div className="editor-preview">
          <div className="editor-pane">
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
              <div
                className="preview-canvas"
                ref={previewRef}
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: 'center center',
                }}
              />
            </div>
          </div>

          {versions.length > 0 && (
            <div className="version-sidebar">
              <div className="version-sidebar-header">
                <h4>Versions</h4>
                <span className="version-count">{versions.length}</span>
              </div>
              <div className="version-blocks">
                {[...versions].reverse().map((v) => {
                  const vNum = versions.indexOf(v) + 1;
                  const isLatest = v.id === versions[versions.length - 1]?.id;
                  return (
                    <div
                      key={v.id}
                      className={`version-block ${activeVersion?.id === v.id ? 'active' : ''} ${isLatest ? 'latest' : ''}`}
                      onClick={() => viewVersion(v)}
                    >
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
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>

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
    </div>
  );
}
