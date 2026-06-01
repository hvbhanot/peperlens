"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { getPdfJs, getMermaid } from "@/lib/pdfClient";
import { LEVELS } from "@/lib/prompts";

// ---------------------------------------------------------------------------
// Server calls. The API key lives encrypted in the DB and is decrypted only
// inside /api/explain and /api/chat — it never reaches this component.
// ---------------------------------------------------------------------------
async function callExplain({ which, level, text, fileName, model, request }) {
  const res = await fetch("/api/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ which, level, text, fileName, model, request }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data.content || "";
}

async function callChat({ messages, context, level, model }) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, context, level, model }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data.content || "";
}

// ---- Mermaid renderer ----
function MermaidBlock({ code }) {
  const ref = useRef(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mermaid = await getMermaid();
        const id = "m" + Math.random().toString(36).slice(2);
        const { svg } = await mermaid.render(id, code);
        if (alive && ref.current) ref.current.innerHTML = svg;
      } catch (e) {
        if (alive) setErr(String(e.message || e));
      }
    })();
    return () => { alive = false; };
  }, [code]);
  if (err) return <pre className="code-pre">Diagram failed to render:{"\n"}{err}{"\n\n"}{code}</pre>;
  return <div ref={ref} className="mermaid-wrap" />;
}

function renderRichText(text) {
  const parts = [];
  const re = /```mermaid\s*([\s\S]*?)```/g;
  let last = 0, m, key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(<Prose key={key++} text={text.slice(last, m.index)} />);
    parts.push(<MermaidBlock key={key++} code={m[1].trim()} />);
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(<Prose key={key++} text={text.slice(last)} />);
  return parts;
}

function Prose({ text }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((ln, i) => {
        if (!ln.trim()) return <div key={i} style={{ height: 6 }} />;
        if (ln.startsWith("### ")) return <h4 key={i}>{inline(ln.slice(4))}</h4>;
        if (ln.startsWith("## ")) return <h3 key={i}>{inline(ln.slice(3))}</h3>;
        if (ln.startsWith("# ")) return <h2 key={i}>{inline(ln.slice(2))}</h2>;
        if (/^\s*[-*]\s+/.test(ln))
          return <div key={i} className="bullet"><span className="dot">▸</span><span>{inline(ln.replace(/^\s*[-*]\s+/, ""))}</span></div>;
        return <p key={i}>{inline(ln)}</p>;
      })}
    </>
  );
}

function inline(s) {
  const out = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let last = 0, m, k = 0;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[2] !== undefined) out.push(<strong key={k++}>{m[2]}</strong>);
    else out.push(<code key={k++} className="icode">{m[3]}</code>);
    last = re.lastIndex;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

const TABS = [
  ["overview", "Overview"],
  ["sections", "Sections"],
  ["diagram", "Diagram"],
  ["glossary", "Glossary"],
  ["chat", "Chat"],
];

// ===========================================================================
export default function PaperLensViewer({ paperId, title, fileName, initialLevel }) {
  const [model, setModel] = useState("");
  const [models, setModels] = useState([]);
  const [hasKey, setHasKey] = useState(true);

  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [fullText, setFullText] = useState("");
  const [loadingPdf, setLoadingPdf] = useState(true);

  const [level, setLevel] = useState(initialLevel || null);
  const [showLevelGate, setShowLevelGate] = useState(!initialLevel);

  const [tab, setTab] = useState("overview");
  const [out, setOut] = useState({ overview: "", sections: "", diagram: "", glossary: "" });
  const [loading, setLoading] = useState({});
  const [error, setError] = useState("");

  const [diagramRequest, setDiagramRequest] = useState("");

  const [highlights, setHighlights] = useState([]);
  const [explainPopup, setExplainPopup] = useState(null);

  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);

  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  const renderTaskRef = useRef(null);
  const autoRanRef = useRef(false);
  const chatScrollRef = useRef(null);

  const modelLabel = models.find((m) => m.id === model)?.label || model;

  // ---- Settings (model + whether a key exists) ----
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings");
        const data = await res.json();
        if (res.ok) {
          setModel(data.model);
          setModels(data.models);
          setHasKey(data.hasKey);
        }
      } catch {/* non-fatal */}
    })();
  }, []);

  // ---- Load stored PDF + extract text ----
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingPdf(true);
      try {
        const pdfjsLib = await getPdfJs();
        const doc = await pdfjsLib.getDocument({ url: `/api/papers/${paperId}/file`, withCredentials: true }).promise;
        if (!alive) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);

        let collected = "";
        const cap = Math.min(doc.numPages, 40);
        for (let p = 1; p <= cap; p++) {
          const page = await doc.getPage(p);
          const tc = await page.getTextContent();
          collected += tc.items.map((it) => it.str).join(" ") + "\n\n";
        }
        if (alive) setFullText(collected);
      } catch (e) {
        if (alive) setError("Could not open PDF: " + (e.message || e));
      } finally {
        if (alive) setLoadingPdf(false);
      }
    })();
    return () => { alive = false; };
  }, [paperId]);

  // ---- Render current page + a proper selectable text layer (pdf.js) ----
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    (async () => {
      const pdfjsLib = await getPdfJs();
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.4 });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch {} }
      const task = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      try { await task.promise; } catch { return; }
      if (cancelled) return;

      // Build the selectable text layer using pdf.js's own renderer so the
      // invisible text lines up exactly with the rendered page at this scale.
      const layer = textLayerRef.current;
      if (!layer) return;
      layer.innerHTML = "";
      layer.style.setProperty("--scale-factor", String(viewport.scale));
      layer.style.width = viewport.width + "px";
      layer.style.height = viewport.height + "px";
      const textContent = await page.getTextContent();
      if (cancelled) return;
      try {
        await pdfjsLib.renderTextLayer({ textContentSource: textContent, container: layer, viewport, textDivs: [] }).promise;
      } catch {/* ignore */}
    })();
    return () => { cancelled = true; };
  }, [pdfDoc, pageNum]);

  // ---- Auto-generate overview / sections / glossary once per open ----
  useEffect(() => {
    if (autoRanRef.current) return;
    if (!fullText || !level || !hasKey) return;
    autoRanRef.current = true;
    (async () => {
      for (const which of ["overview", "sections", "glossary"]) {
        await generate(which);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullText, level, hasKey]);

  // ---- Auto-scroll chat ----
  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, chatBusy]);

  const chooseLevel = (id) => {
    setLevel(id);
    setShowLevelGate(false);
    fetch(`/api/papers/${paperId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level: id }),
    }).catch(() => {});
  };

  const generate = async (which, opts = {}) => {
    if (!level) { setShowLevelGate(true); return; }
    if (!fullText) { setError("The paper text is still loading."); return; }
    if (!hasKey) { setError("No Ollama API key set. Add one in Settings."); return; }
    setError("");
    setLoading((l) => ({ ...l, [which]: true }));
    try {
      const body = await callExplain({ which, level, text: fullText, fileName, model, request: opts.request });
      setOut((o) => ({ ...o, [which]: body }));
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading((l) => ({ ...l, [which]: false }));
    }
  };

  const onMouseUpPage = useCallback(() => {
    const sel = window.getSelection();
    const txt = sel ? sel.toString().trim() : "";
    if (txt.length < 3) return;
    setHighlights((h) => [...h, { page: pageNum, text: txt }]);
  }, [pageNum]);

  const explainSelection = async () => {
    const sel = window.getSelection();
    const txt = sel ? sel.toString().trim() : "";
    if (!txt) { setError("Select some text in the PDF first."); return; }
    if (!level) { setShowLevelGate(true); return; }
    setExplainPopup({ text: txt, body: "", loading: true });
    try {
      const body = await callExplain({ which: "selection", level, text: txt, fileName, model });
      setExplainPopup({ text: txt, body, loading: false });
    } catch (e) {
      setExplainPopup({ text: txt, body: "Error: " + (e.message || e), loading: false });
    }
  };

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    if (!level) { setShowLevelGate(true); return; }
    if (!hasKey) { setError("No Ollama API key set. Add one in Settings."); return; }
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setChatInput("");
    setChatBusy(true);
    try {
      const content = await callChat({ messages: next, context: fullText, level, model });
      setMessages((m) => [...m, { role: "assistant", content }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: "Error: " + (e.message || e) }]);
    } finally {
      setChatBusy(false);
    }
  };

  const analysisPanel = (which) => (
    <>
      <div className="gen-bar">
        <button className="btn-sm" disabled={loading[which] || !pdfDoc || !hasKey} onClick={() => generate(which)}>
          {loading[which] ? "Generating…" : out[which] ? "Regenerate" : "Generate"}
        </button>
        {loading[which] && <span className="loading-line"><span className="spinner" /> Querying {modelLabel}…</span>}
      </div>
      {out[which] ? (
        <div className="prose">{renderRichText(out[which])}</div>
      ) : (
        !loading[which] && <div className="placeholder">{pdfDoc ? `The ${which} will appear here.` : "Loading…"}</div>
      )}
    </>
  );

  return (
    <div className="viewer">
      {/* Top bar */}
      <div className="viewer-top">
        <div className="left">
          <Link href="/dashboard" className="back-link">‹ Dashboard</Link>
          <span className="brand-mark">◧</span>
          <span className="paper-title" title={title}>{title}</span>
        </div>
        <div className="right">
          {!hasKey && <Link href="/settings" className="warn-link">Set API key →</Link>}
          <input
            className="input model-input"
            list="vmodels"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="model name"
            spellCheck={false}
            title="Ollama model — type any name or pick from the list"
          />
          <datalist id="vmodels">
            {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </datalist>
        </div>
      </div>

      {error && <div className="error" style={{ margin: 0, borderRadius: 0 }}>{error}</div>}

      <div className="viewer-body">
        {/* Left: PDF */}
        <div className="pdf-pane">
          {loadingPdf ? (
            <div className="empty-state"><span className="spinner" /> Loading PDF…</div>
          ) : !pdfDoc ? (
            <div className="empty-state"><div className="big">Could not load this PDF.</div></div>
          ) : (
            <>
              <div className="pdf-toolbar">
                <button className="iconbtn" disabled={pageNum <= 1} onClick={() => setPageNum((n) => Math.max(1, n - 1))}>‹</button>
                <span className="page-info">{pageNum} / {numPages}</span>
                <button className="iconbtn" disabled={pageNum >= numPages} onClick={() => setPageNum((n) => Math.min(numPages, n + 1))}>›</button>
                <div style={{ flex: 1 }} />
                <button className="btn-sm" onClick={explainSelection}>✦ Explain selection</button>
              </div>
              <div className="pdf-scroll">
                <div className="pdf-stage" onMouseUp={onMouseUpPage}>
                  <canvas ref={canvasRef} className="pdf-canvas" />
                  <div ref={textLayerRef} className="textLayer" />
                </div>
              </div>
              {highlights.length > 0 && (
                <div className="highlight-tray">
                  <div className="tray-title">Highlights ({highlights.length})</div>
                  {highlights.slice(-6).reverse().map((h, i) => (
                    <div key={i} className="tray-item">
                      <span className="pg">p{h.page}</span>
                      <span className="tx">{h.text.slice(0, 120)}{h.text.length > 120 ? "…" : ""}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: panel */}
        <div className="panel-pane">
          <div className="level-row">
            <span className="level-label">Level</span>
            {level
              ? <span className="pill">{LEVELS.find((l) => l.id === level)?.label}</span>
              : <span className="pill none">not set</span>}
            <button className="link-btn" onClick={() => setShowLevelGate(true)}>change</button>
          </div>

          <div className="tabbar">
            {TABS.map(([id, lbl]) => (
              <button key={id} className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>{lbl}</button>
            ))}
          </div>

          {tab === "chat" ? (
            <div className="chat-wrap">
              <div className="chat-scroll" ref={chatScrollRef}>
                {messages.length === 0 && !chatBusy && (
                  <div className="chat-empty">Ask anything about “{title}” — the model answers grounded in the paper text.</div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`msg ${m.role}`}>
                    {m.role === "assistant" ? <div className="prose">{renderRichText(m.content)}</div> : m.content}
                  </div>
                ))}
                {chatBusy && <div className="msg assistant"><span className="spinner" /> Thinking…</div>}
              </div>
              <div className="chat-input-row">
                <input
                  className="input"
                  placeholder={hasKey ? "Ask about the paper…" : "Set an API key in Settings first"}
                  value={chatInput}
                  disabled={!hasKey}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                />
                <button className="btn" onClick={sendChat} disabled={chatBusy || !chatInput.trim()}>Send</button>
              </div>
            </div>
          ) : (
            <div className="panel-scroll">
              {tab === "diagram" ? (
                <>
                  <div className="diagram-form">
                    <input
                      className="input"
                      placeholder="Describe the diagram you want (optional) — e.g. “the training loop”, “data flow”"
                      value={diagramRequest}
                      onChange={(e) => setDiagramRequest(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") generate("diagram", { request: diagramRequest }); }}
                    />
                    <button className="btn" style={{ width: "auto", padding: "0 18px" }}
                            disabled={loading.diagram || !pdfDoc || !hasKey}
                            onClick={() => generate("diagram", { request: diagramRequest })}>
                      {loading.diagram ? "…" : out.diagram ? "Regenerate" : "Generate"}
                    </button>
                  </div>
                  {loading.diagram && <div className="loading-line"><span className="spinner" /> Drawing with {modelLabel}…</div>}
                  {out.diagram ? <div className="prose">{renderRichText(out.diagram)}</div>
                    : !loading.diagram && <div className="placeholder">Describe a diagram above (or leave blank for the core method) and hit Generate.</div>}
                </>
              ) : (
                analysisPanel(tab)
              )}
            </div>
          )}
        </div>
      </div>

      {/* Level gate */}
      {showLevelGate && (
        <div className="modal-overlay" onClick={() => level && setShowLevelGate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">How deep should I go?</h2>
            <p className="modal-sub">Pick the comprehension level. Every explanation, diagram, glossary entry, and chat reply is tuned to it. You can change it any time.</p>
            <div className="level-grid">
              {LEVELS.map((l) => (
                <button key={l.id} className={`level-card ${level === l.id ? "active" : ""}`} onClick={() => chooseLevel(l.id)}>
                  <div className="level-card-title">{l.label}</div>
                  <div className="level-card-blurb">{l.blurb}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Explain-selection popup */}
      {explainPopup && (
        <div className="modal-overlay" onClick={() => setExplainPopup(null)}>
          <div className="modal popup" onClick={(e) => e.stopPropagation()}>
            <div className="popup-head">
              <span className="popup-tag">✦ Selection</span>
              <button className="popup-close" onClick={() => setExplainPopup(null)}>×</button>
            </div>
            <div className="popup-quote">“{explainPopup.text.slice(0, 280)}{explainPopup.text.length > 280 ? "…" : ""}”</div>
            <div className="prose">
              {explainPopup.loading ? <span className="loading-line"><span className="spinner" /> Thinking…</span> : <Prose text={explainPopup.body} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
