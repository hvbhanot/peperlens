"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { getPdfJs } from "@/lib/pdfClient";
import { LEVELS } from "@/lib/prompts";
import { RichText, Prose } from "@/components/RichText";
import ThemeToggle from "@/components/ThemeToggle";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Streamed POST: yields the growing text via onText, returns the full string.
// Pre-stream failures arrive as JSON and are surfaced as thrown errors.
async function streamPost(url, body, onText) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    if ((res.headers.get("content-type") || "").includes("json")) {
      const d = await res.json().catch(() => ({}));
      msg = d.error || msg;
    }
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    full += dec.decode(value, { stream: true });
    onText(full);
  }
  return full;
}

const TABS = [
  ["overview", "Overview"],
  ["sections", "Sections"],
  ["diagram", "Diagram"],
  ["glossary", "Glossary"],
  ["chat", "Chat"],
];

export default function PaperLensViewer({ paperId, title, fileName, initialLevel }) {
  const [model, setModel] = useState("");
  const [models, setModels] = useState([]);
  const [hasKey, setHasKey] = useState(true);

  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [scale, setScale] = useState(1.4);
  const [fullText, setFullText] = useState("");
  const [loadingPdf, setLoadingPdf] = useState(true);

  const [level, setLevel] = useState(initialLevel || null);
  const [showLevelGate, setShowLevelGate] = useState(!initialLevel);

  const [tab, setTab] = useState("overview");
  const [out, setOut] = useState({ tldr: "", overview: "", sections: "", diagram: "", glossary: "" });
  const [streamBuf, setStreamBuf] = useState({});
  const [loading, setLoading] = useState({});
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");

  const [diagramRequest, setDiagramRequest] = useState("");

  const [highlights, setHighlights] = useState([]);
  const [explainPopup, setExplainPopup] = useState(null);

  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatStreaming, setChatStreaming] = useState("");

  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  const stageRef = useRef(null);
  const pdfScrollRef = useRef(null);
  const renderTaskRef = useRef(null);
  const baseWidthRef = useRef(0);
  const fittedRef = useRef(false);
  const autoRanRef = useRef(false);
  const chatScrollRef = useRef(null);

  const modelLabel = models.find((m) => m.id === model)?.label || model;

  // ---- Settings ----
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings");
        const data = await res.json();
        if (res.ok) { setModel(data.model); setModels(data.models); setHasKey(data.hasKey); }
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
        baseWidthRef.current = doc ? (await doc.getPage(1)).getViewport({ scale: 1 }).width : 0;
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

  // ---- Render current page + selectable text layer ----
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    (async () => {
      const pdfjsLib = await getPdfJs();
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
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

      const layer = textLayerRef.current;
      if (!layer) return;
      layer.innerHTML = "";
      layer.style.setProperty("--scale-factor", String(scale));
      layer.style.width = viewport.width + "px";
      layer.style.height = viewport.height + "px";
      const textContent = await page.getTextContent();
      if (cancelled) return;
      try {
        await pdfjsLib.renderTextLayer({ textContentSource: textContent, container: layer, viewport, textDivs: [] }).promise;
      } catch {/* ignore */}
    })();
    return () => { cancelled = true; };
  }, [pdfDoc, pageNum, scale]);

  // ---- Auto-generate TL;DR + overview/sections/glossary once per open ----
  useEffect(() => {
    if (autoRanRef.current) return;
    if (!fullText || !level || !hasKey) return;
    autoRanRef.current = true;
    (async () => {
      for (const which of ["tldr", "overview", "sections", "glossary"]) {
        await generate(which);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullText, level, hasKey]);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, chatStreaming, chatBusy]);

  // Fit-to-width when the scroll container first mounts.
  const attachScroll = useCallback((node) => {
    pdfScrollRef.current = node;
    if (node && baseWidthRef.current && !fittedRef.current) {
      const avail = node.clientWidth - 44;
      setScale(clamp(avail / baseWidthRef.current, 0.5, 2.2));
      fittedRef.current = true;
    }
  }, []);

  const fitWidth = () => {
    const node = pdfScrollRef.current;
    if (node && baseWidthRef.current) setScale(clamp((node.clientWidth - 44) / baseWidthRef.current, 0.5, 2.5));
  };

  const chooseLevel = (id) => {
    setLevel(id);
    setShowLevelGate(false);
    fetch(`/api/papers/${paperId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ level: id }) }).catch(() => {});
  };

  const generate = async (which, opts = {}) => {
    if (!level) { setShowLevelGate(true); return; }
    if (!fullText) { setError("The paper text is still loading."); return; }
    if (!hasKey) { setError("No Ollama API key set. Add one in Settings."); return; }
    setError("");
    setLoading((l) => ({ ...l, [which]: true }));
    setStreamBuf((s) => ({ ...s, [which]: "" }));
    try {
      const full = await streamPost(
        "/api/explain",
        { which, level, text: fullText, fileName, model, request: opts.request },
        (t) => setStreamBuf((s) => ({ ...s, [which]: t }))
      );
      setOut((o) => ({ ...o, [which]: full }));
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading((l) => ({ ...l, [which]: false }));
      setStreamBuf((s) => ({ ...s, [which]: "" }));
    }
  };

  const explainText = async (txt) => {
    if (!txt) return;
    if (!level) { setShowLevelGate(true); return; }
    if (!hasKey) { setError("No Ollama API key set. Add one in Settings."); return; }
    setExplainPopup({ text: txt, body: "", loading: true });
    try {
      const full = await streamPost(
        "/api/explain",
        { which: "selection", level, text: txt, fileName, model },
        (t) => setExplainPopup((p) => (p ? { ...p, body: t } : p))
      );
      setExplainPopup({ text: txt, body: full, loading: false });
    } catch (e) {
      setExplainPopup({ text: txt, body: "Error: " + (e.message || e), loading: false });
    }
  };

  const explainSelection = () => {
    const sel = window.getSelection();
    const txt = sel ? sel.toString().trim() : "";
    if (!txt) { setError("Select some text in the PDF first."); return; }
    explainText(txt);
  };

  // Capture a selection as a clickable highlight (rects normalized to scale 1).
  const onMouseUpPage = useCallback(() => {
    const sel = window.getSelection();
    const txt = sel ? sel.toString().trim() : "";
    if (txt.length < 3) return;
    const stage = stageRef.current;
    if (!stage) return;
    const sRect = stage.getBoundingClientRect();
    let rects = [];
    try {
      const range = sel.getRangeAt(0);
      rects = Array.from(range.getClientRects())
        .map((r) => ({ left: (r.left - sRect.left) / scale, top: (r.top - sRect.top) / scale, width: r.width / scale, height: r.height / scale }))
        .filter((r) => r.width > 1 && r.height > 1);
    } catch {/* ignore */}
    if (!rects.length) return;
    setHighlights((h) => {
      if (h.length && h[h.length - 1].text === txt && h[h.length - 1].page === pageNum) return h;
      return [...h, { id: Date.now() + Math.random().toString(36).slice(2, 6), page: pageNum, text: txt, rects }];
    });
  }, [pageNum, scale]);

  const removeHighlight = (id) => setHighlights((h) => h.filter((x) => x.id !== id));

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    if (!level) { setShowLevelGate(true); return; }
    if (!hasKey) { setError("No Ollama API key set. Add one in Settings."); return; }
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setChatInput("");
    setChatBusy(true);
    setChatStreaming("");
    try {
      const full = await streamPost("/api/chat", { messages: next, context: fullText, level, model }, (t) => setChatStreaming(t));
      setMessages((m) => [...m, { role: "assistant", content: full }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: "Error: " + (e.message || e) }]);
    } finally {
      setChatBusy(false);
      setChatStreaming("");
    }
  };

  const copyOut = (which) => {
    const t = out[which];
    if (!t) return;
    navigator.clipboard?.writeText(t);
    setCopied(which);
    setTimeout(() => setCopied((c) => (c === which ? "" : c)), 1500);
  };

  const exportAll = () => {
    const order = [["tldr", "Key Takeaways"], ["overview", "Overview"], ["sections", "Sections"], ["glossary", "Glossary"], ["diagram", "Diagram"]];
    let md = `# ${title}\n\n`;
    let any = false;
    for (const [k, label] of order) { if (out[k]) { md += `## ${label}\n\n${out[k]}\n\n`; any = true; } }
    if (!any) { setError("Nothing generated to export yet."); return; }
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^\w.-]+/g, "_")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const analysisPanel = (which) => (
    <>
      <div className="gen-bar">
        <button className="btn-sm" disabled={loading[which] || !pdfDoc || !hasKey} onClick={() => generate(which)}>
          {loading[which] ? "Generating…" : out[which] ? "Regenerate" : "Generate"}
        </button>
        {loading[which] && <span className="loading-line"><span className="spinner" /> Querying {modelLabel}…</span>}
        {out[which] && !loading[which] && (
          <div className="out-tools">
            <button className={`chip ${copied === which ? "ok" : ""}`} onClick={() => copyOut(which)}>{copied === which ? "Copied" : "Copy"}</button>
          </div>
        )}
      </div>
      {loading[which] && streamBuf[which]
        ? <div className="prose"><Prose text={streamBuf[which]} /></div>
        : out[which]
          ? <RichText text={out[which]} />
          : (!loading[which] && <div className="placeholder">The {which} will appear here.</div>)}
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
            className="input model-input" list="vmodels" value={model}
            onChange={(e) => setModel(e.target.value)} placeholder="model name" spellCheck={false}
            title="Ollama model — type any name or pick from the list"
          />
          <datalist id="vmodels">{models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</datalist>
          <ThemeToggle />
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
                <span style={{ width: 8 }} />
                <div className="zoom-group">
                  <button className="iconbtn" onClick={() => setScale((s) => clamp(s - 0.2, 0.5, 3))} title="Zoom out">−</button>
                  <span className="zoom-level">{Math.round(scale * 100)}%</span>
                  <button className="iconbtn" onClick={() => setScale((s) => clamp(s + 0.2, 0.5, 3))} title="Zoom in">+</button>
                  <button className="iconbtn" onClick={fitWidth} title="Fit width" style={{ width: "auto", padding: "0 8px", fontSize: 13 }}>Fit</button>
                </div>
                <div style={{ flex: 1 }} />
                <button className="btn-sm" onClick={explainSelection}>✦ Explain selection</button>
              </div>
              <div className="pdf-scroll" ref={attachScroll}>
                <div className="pdf-stage" ref={stageRef} onMouseUp={onMouseUpPage}>
                  <canvas ref={canvasRef} className="pdf-canvas" />
                  <div ref={textLayerRef} className="textLayer" />
                  <div className="hl-layer">
                    {highlights.filter((h) => h.page === pageNum).flatMap((h) =>
                      h.rects.map((r, i) => (
                        <div key={h.id + "-" + i} className="hl-rect"
                          style={{ left: r.left * scale, top: r.top * scale, width: r.width * scale, height: r.height * scale }}
                          title="Click to explain · right-click to remove"
                          onClick={(e) => { e.stopPropagation(); explainText(h.text); }}
                          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); removeHighlight(h.id); }} />
                      ))
                    )}
                  </div>
                </div>
              </div>
              {highlights.length > 0 && (
                <div className="highlight-tray">
                  <div className="tray-title">
                    Highlights ({highlights.length})
                    <button className="link-btn" style={{ margin: 0, float: "right" }} onClick={() => setHighlights([])}>Clear all</button>
                  </div>
                  {highlights.slice(-6).reverse().map((h) => (
                    <div key={h.id} className="tray-item">
                      <span className="pg">p{h.page}</span>
                      <span className="tx" style={{ cursor: "pointer", flex: 1 }} onClick={() => explainText(h.text)}>
                        {h.text.slice(0, 110)}{h.text.length > 110 ? "…" : ""}
                      </span>
                      <button className="link-btn" style={{ margin: 0 }} onClick={() => removeHighlight(h.id)}>×</button>
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
            {level ? <span className="pill">{LEVELS.find((l) => l.id === level)?.label}</span> : <span className="pill none">not set</span>}
            <button className="link-btn" onClick={() => setShowLevelGate(true)}>change</button>
            <div className="out-tools"><button className="chip" onClick={exportAll} title="Download all analyses as Markdown">Export</button></div>
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
                  <div className="chat-empty">Ask anything about “{title}” — answers are grounded in the paper and tuned to your level.</div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`msg ${m.role}`}>
                    {m.role === "assistant" ? <RichText text={m.content} /> : m.content}
                  </div>
                ))}
                {chatBusy && (
                  <div className="msg assistant">
                    {chatStreaming ? <div className="prose"><Prose text={chatStreaming} /></div> : <><span className="spinner" /> Thinking…</>}
                  </div>
                )}
              </div>
              <div className="chat-input-row">
                <input className="input" placeholder={hasKey ? "Ask about the paper…" : "Set an API key in Settings first"}
                  value={chatInput} disabled={!hasKey} onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }} />
                <button className="btn" onClick={sendChat} disabled={chatBusy || !chatInput.trim()}>Send</button>
              </div>
            </div>
          ) : (
            <div className="panel-scroll">
              {tab === "overview" && (
                <>
                  {(out.tldr || (loading.tldr && streamBuf.tldr)) && (
                    <div className="tldr">
                      <div className="tldr-title">Key takeaways</div>
                      {loading.tldr && streamBuf.tldr ? <div className="prose"><Prose text={streamBuf.tldr} /></div> : <RichText text={out.tldr} />}
                    </div>
                  )}
                  {analysisPanel("overview")}
                </>
              )}
              {tab === "sections" && analysisPanel("sections")}
              {tab === "glossary" && analysisPanel("glossary")}
              {tab === "diagram" && (
                <>
                  <div className="diagram-form">
                    <input className="input" placeholder="Describe the diagram you want (optional) — e.g. “the training loop”, “data flow”"
                      value={diagramRequest} onChange={(e) => setDiagramRequest(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") generate("diagram", { request: diagramRequest }); }} />
                    <button className="btn" style={{ width: "auto", padding: "0 18px" }}
                      disabled={loading.diagram || !pdfDoc || !hasKey}
                      onClick={() => generate("diagram", { request: diagramRequest })}>
                      {loading.diagram ? "…" : out.diagram ? "Regenerate" : "Generate"}
                    </button>
                  </div>
                  {loading.diagram && streamBuf.diagram
                    ? <div className="prose"><Prose text={streamBuf.diagram} /></div>
                    : out.diagram
                      ? <RichText text={out.diagram} />
                      : (!loading.diagram && <div className="placeholder">Describe a diagram above (or leave blank for the core method) and hit Generate.</div>)}
                  {loading.diagram && !streamBuf.diagram && <div className="loading-line"><span className="spinner" /> Drawing with {modelLabel}…</div>}
                </>
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
            <p className="modal-sub">Pick the comprehension level. Every explanation, diagram, glossary entry, and chat reply is tuned to it. Change it any time.</p>
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
            {explainPopup.loading
              ? <div className="prose">{explainPopup.body ? <Prose text={explainPopup.body} /> : <span className="loading-line"><span className="spinner" /> Thinking…</span>}</div>
              : <RichText text={explainPopup.body} />}
          </div>
        </div>
      )}
    </div>
  );
}
