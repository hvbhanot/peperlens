"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { getPdfJs, getMermaid } from "@/lib/pdfClient";
import { LEVELS } from "@/lib/prompts";

// ---------------------------------------------------------------------------
// Server-side Ollama call. The API key lives encrypted in the DB and is
// decrypted only inside /api/explain — it never reaches this component.
// ---------------------------------------------------------------------------
async function callExplain({ which, level, text, fileName, model }) {
  const res = await fetch("/api/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ which, level, text, fileName, model }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data.content || "";
}

// ---- Mermaid block renderer ----
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
  if (err) {
    return <div style={{ ...S.codePre, color: "#f0a0a0" }}>Diagram failed to render:\n{err}\n\n{code}</div>;
  }
  return <div ref={ref} style={S.mermaidWrap} />;
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
    <div>
      {lines.map((ln, i) => {
        if (!ln.trim()) return <div key={i} style={{ height: 8 }} />;
        if (ln.startsWith("### ")) return <h4 key={i} style={S.h4}>{inline(ln.slice(4))}</h4>;
        if (ln.startsWith("## ")) return <h3 key={i} style={S.h3}>{inline(ln.slice(3))}</h3>;
        if (ln.startsWith("# ")) return <h2 key={i} style={S.h2}>{inline(ln.slice(2))}</h2>;
        if (/^\s*[-*]\s+/.test(ln))
          return <div key={i} style={S.bullet}><span style={S.bulletDot}>▸</span><span>{inline(ln.replace(/^\s*[-*]\s+/, ""))}</span></div>;
        return <p key={i} style={S.p}>{inline(ln)}</p>;
      })}
    </div>
  );
}

function inline(s) {
  const out = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let last = 0, m, k = 0;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[2] !== undefined) out.push(<strong key={k++} style={{ color: "#e8e4d8" }}>{m[2]}</strong>);
    else out.push(<code key={k++} style={S.inlineCode}>{m[3]}</code>);
    last = re.lastIndex;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

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
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const [highlights, setHighlights] = useState([]);
  const [explainPopup, setExplainPopup] = useState(null);

  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  const renderTaskRef = useRef(null);

  // ---- Fetch settings (model + whether a key exists) ----
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
      } catch {
        /* non-fatal */
      }
    })();
  }, []);

  // ---- Load the stored PDF + extract text ----
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

  // ---- Render current page with a selectable text layer ----
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    (async () => {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.4 });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch {}
      }
      const task = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      try { await task.promise; } catch { return; }
      if (cancelled) return;

      const tc = await page.getTextContent();
      const layer = textLayerRef.current;
      if (!layer) return;
      layer.innerHTML = "";
      layer.style.width = viewport.width + "px";
      layer.style.height = viewport.height + "px";
      tc.items.forEach((it) => {
        const span = document.createElement("span");
        span.textContent = it.str;
        const tx = it.transform;
        const fontH = Math.hypot(tx[2], tx[3]);
        span.style.position = "absolute";
        span.style.left = tx[4] + "px";
        span.style.top = (viewport.height - tx[5] - fontH) + "px";
        span.style.fontSize = fontH + "px";
        span.style.lineHeight = "1";
        span.style.color = "transparent";
        span.style.whiteSpace = "pre";
        span.style.cursor = "text";
        layer.appendChild(span);
      });
    })();
    return () => { cancelled = true; };
  }, [pdfDoc, pageNum]);

  // ---- Persist level when chosen ----
  const chooseLevel = async (id) => {
    setLevel(id);
    setShowLevelGate(false);
    fetch(`/api/papers/${paperId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level: id }),
    }).catch(() => {});
  };

  // ---- Selection -> highlight + explain ----
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

  const generate = async (which) => {
    if (!level) { setShowLevelGate(true); return; }
    if (!fullText) { setError("The paper text is still loading."); return; }
    if (!hasKey) { setError("No Ollama API key set. Add one in Settings."); return; }
    setError("");
    setBusy(which);
    try {
      const body = await callExplain({ which, level, text: fullText, fileName, model });
      setOut((o) => ({ ...o, [which]: body }));
      setTab(which);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy("");
    }
  };

  const modelLabel = models.find((m) => m.id === model)?.label || model;

  return (
    <div style={S.root}>
      {/* Header */}
      <header style={S.header}>
        <div style={S.brand}>
          <Link href="/dashboard" style={{ ...S.backLink }}>‹ dashboard</Link>
          <span style={S.brandMark}>◧</span>
          <span style={S.brandName}>{title}</span>
        </div>
        <div style={S.headerControls}>
          {!hasKey && <Link href="/settings" style={S.warnLink}>set API key →</Link>}
          <select style={S.select} value={model} onChange={(e) => setModel(e.target.value)}>
            {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
      </header>

      {error && <div style={S.errorBar}>{error}</div>}

      <div style={S.main}>
        {/* Left: PDF viewer */}
        <section style={S.left}>
          {loadingPdf ? (
            <div style={S.empty}><div style={{ ...S.loading, margin: "auto" }}>Loading PDF…</div></div>
          ) : !pdfDoc ? (
            <div style={S.empty}><div style={S.emptyTitle}>Could not load this PDF.</div></div>
          ) : (
            <>
              <div style={S.pdfToolbar}>
                <button style={S.navBtn} disabled={pageNum <= 1} onClick={() => setPageNum((n) => Math.max(1, n - 1))}>‹</button>
                <span style={S.pageInfo}>{pageNum} / {numPages}</span>
                <button style={S.navBtn} disabled={pageNum >= numPages} onClick={() => setPageNum((n) => Math.min(numPages, n + 1))}>›</button>
                <div style={{ flex: 1 }} />
                <button style={S.explainBtn} onClick={explainSelection}>✦ Explain selection</button>
              </div>
              <div style={S.pdfScroll}>
                <div style={S.pdfStage} onMouseUp={onMouseUpPage}>
                  <canvas ref={canvasRef} style={S.canvas} />
                  <div ref={textLayerRef} style={S.textLayer} />
                </div>
              </div>
              {highlights.length > 0 && (
                <div style={S.highlightTray}>
                  <div style={S.trayTitle}>Highlights ({highlights.length})</div>
                  {highlights.slice(-6).reverse().map((h, i) => (
                    <div key={i} style={S.highlightItem}>
                      <span style={S.hlPage}>p{h.page}</span>
                      <span style={S.hlText}>{h.text.slice(0, 120)}{h.text.length > 120 ? "…" : ""}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        {/* Right: explanation panel */}
        <section style={S.right}>
          <div style={S.levelStrip}>
            <span style={S.levelLabel}>Level:</span>
            {level
              ? <span style={S.levelActive}>{LEVELS.find((l) => l.id === level)?.label}</span>
              : <span style={S.levelNone}>not set</span>}
            <button style={S.levelChange} onClick={() => setShowLevelGate(true)}>change</button>
          </div>

          <div style={S.tabs}>
            {[["overview", "Overview"], ["sections", "Sections"], ["diagram", "Diagram"], ["glossary", "Glossary"]].map(([id, lbl]) => (
              <button key={id} style={{ ...S.tab, ...(tab === id ? S.tabActive : {}) }} onClick={() => setTab(id)}>{lbl}</button>
            ))}
          </div>

          <div style={S.genRow}>
            <button style={S.genBtn} disabled={!!busy || !pdfDoc} onClick={() => generate(tab)}>
              {busy === tab ? "Generating…" : (out[tab] ? "Regenerate" : "Generate")}
            </button>
          </div>

          <div style={S.outputScroll}>
            {busy === tab && <div style={S.loading}>Querying {modelLabel}…</div>}
            {!out[tab] && busy !== tab && (
              <div style={S.placeholder}>
                {pdfDoc ? `Hit Generate to produce the ${tab} for "${fileName}".` : "Loading…"}
              </div>
            )}
            {out[tab] && <div style={S.output}>{renderRichText(out[tab])}</div>}
          </div>
        </section>
      </div>

      {/* Level gate modal */}
      {showLevelGate && (
        <div style={S.modalWrap} onClick={() => level && setShowLevelGate(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>How deep should I go?</div>
            <div style={S.modalSub}>
              Pick the comprehension level. Every explanation, diagram, and glossary entry is tuned to it. You can change it any time.
            </div>
            <div style={S.levelGrid}>
              {LEVELS.map((l) => (
                <button key={l.id} style={{ ...S.levelCard, ...(level === l.id ? S.levelCardActive : {}) }} onClick={() => chooseLevel(l.id)}>
                  <div style={S.levelCardTitle}>{l.label}</div>
                  <div style={S.levelCardBlurb}>{l.blurb}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Explain-selection popup */}
      {explainPopup && (
        <div style={S.modalWrap} onClick={() => setExplainPopup(null)}>
          <div style={S.popup} onClick={(e) => e.stopPropagation()}>
            <div style={S.popupHead}>
              <span style={S.popupTag}>✦ selection</span>
              <button style={S.popupClose} onClick={() => setExplainPopup(null)}>×</button>
            </div>
            <div style={S.popupQuote}>"{explainPopup.text.slice(0, 280)}{explainPopup.text.length > 280 ? "…" : ""}"</div>
            <div style={S.popupBody}>
              {explainPopup.loading ? <span style={S.loading}>Thinking…</span> : <Prose text={explainPopup.body} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Styles (terminal / cyberpunk, dark, monospace accents)
// ===========================================================================
const FONT_MONO = "'JetBrains Mono', 'SF Mono', ui-monospace, monospace";
const FONT_BODY = "'IBM Plex Sans', system-ui, sans-serif";
const ACCENT = "#7ef9c0";
const ACCENT2 = "#ff7e9d";
const BG = "#0c0e0d";
const PANEL = "#121615";
const LINE = "#26302c";
const TEXT = "#d6d2c4";
const MUTE = "#7d8a83";

const S = {
  root: { fontFamily: FONT_BODY, background: BG, color: TEXT, height: "100vh", display: "flex", flexDirection: "column" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: `1px solid ${LINE}`, background: "linear-gradient(180deg,#0e1210,#0c0e0d)" },
  brand: { display: "flex", alignItems: "center", gap: 12, minWidth: 0 },
  backLink: { fontFamily: FONT_MONO, fontSize: 12, color: MUTE },
  brandMark: { color: ACCENT, fontSize: 20 },
  brandName: { fontFamily: FONT_MONO, fontWeight: 700, fontSize: 15, color: "#eef0ea", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 420 },
  headerControls: { display: "flex", gap: 12, alignItems: "center" },
  warnLink: { fontFamily: FONT_MONO, fontSize: 12, color: ACCENT2 },
  select: { fontFamily: FONT_MONO, fontSize: 12, background: PANEL, color: TEXT, border: `1px solid ${LINE}`, borderRadius: 6, padding: "7px 10px" },

  errorBar: { fontFamily: FONT_MONO, fontSize: 12, color: "#ffb3b3", background: "#2a1414", borderBottom: "1px solid #4a1f1f", padding: "8px 20px" },

  main: { display: "flex", flex: 1, minHeight: 0 },
  left: { flex: 1.1, borderRight: `1px solid ${LINE}`, display: "flex", flexDirection: "column", minWidth: 0 },
  right: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },

  empty: { margin: "auto", textAlign: "center", maxWidth: 380, padding: 30, display: "flex" },
  emptyTitle: { fontFamily: FONT_MONO, fontSize: 18, color: "#eef0ea", letterSpacing: 1 },

  pdfToolbar: { display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: `1px solid ${LINE}`, background: PANEL },
  navBtn: { fontFamily: FONT_MONO, fontSize: 18, lineHeight: 1, width: 32, height: 32, background: BG, color: TEXT, border: `1px solid ${LINE}`, borderRadius: 6, cursor: "pointer" },
  pageInfo: { fontFamily: FONT_MONO, fontSize: 12, color: MUTE },
  explainBtn: { fontFamily: FONT_MONO, fontSize: 12, fontWeight: 600, background: "transparent", color: ACCENT2, border: `1px solid ${ACCENT2}`, borderRadius: 6, padding: "7px 12px", cursor: "pointer" },

  pdfScroll: { flex: 1, overflow: "auto", padding: 18, background: "#08100c" },
  pdfStage: { position: "relative", margin: "0 auto", width: "fit-content", boxShadow: "0 0 0 1px #1d2622, 0 18px 50px rgba(0,0,0,.6)" },
  canvas: { display: "block", borderRadius: 2 },
  textLayer: { position: "absolute", top: 0, left: 0, overflow: "hidden", lineHeight: 1 },

  highlightTray: { borderTop: `1px solid ${LINE}`, background: PANEL, padding: "10px 14px", maxHeight: 140, overflow: "auto" },
  trayTitle: { fontFamily: FONT_MONO, fontSize: 11, color: ACCENT, letterSpacing: 1, marginBottom: 6 },
  highlightItem: { display: "flex", gap: 8, alignItems: "baseline", padding: "4px 0", borderBottom: `1px dashed ${LINE}` },
  hlPage: { fontFamily: FONT_MONO, fontSize: 10, color: ACCENT2, flexShrink: 0 },
  hlText: { fontSize: 12, color: MUTE },

  levelStrip: { display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderBottom: `1px solid ${LINE}`, background: PANEL },
  levelLabel: { fontFamily: FONT_MONO, fontSize: 11, color: MUTE, letterSpacing: 1 },
  levelActive: { fontFamily: FONT_MONO, fontSize: 12, color: "#06120c", background: ACCENT, padding: "3px 10px", borderRadius: 20, fontWeight: 700 },
  levelNone: { fontFamily: FONT_MONO, fontSize: 12, color: ACCENT2 },
  levelChange: { marginLeft: "auto", fontFamily: FONT_MONO, fontSize: 11, background: "transparent", color: MUTE, border: `1px solid ${LINE}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer" },

  tabs: { display: "flex", borderBottom: `1px solid ${LINE}` },
  tab: { flex: 1, fontFamily: FONT_MONO, fontSize: 12, letterSpacing: 1, background: "transparent", color: MUTE, border: "none", borderBottom: "2px solid transparent", padding: "12px 0", cursor: "pointer" },
  tabActive: { color: ACCENT, borderBottom: `2px solid ${ACCENT}` },

  genRow: { padding: "12px 16px", borderBottom: `1px solid ${LINE}` },
  genBtn: { fontFamily: FONT_MONO, fontSize: 12, fontWeight: 600, letterSpacing: 1, width: "100%", background: ACCENT, color: "#06120c", border: "none", borderRadius: 6, padding: "11px 0", cursor: "pointer" },

  outputScroll: { flex: 1, overflow: "auto", padding: "18px 22px" },
  loading: { fontFamily: FONT_MONO, fontSize: 13, color: ACCENT, animation: "pulse 1.4s infinite" },
  placeholder: { fontFamily: FONT_MONO, fontSize: 13, color: MUTE, lineHeight: 1.6 },
  output: { fontSize: 14.5, lineHeight: 1.62 },

  h2: { fontFamily: FONT_MONO, fontSize: 18, color: "#eef0ea", margin: "18px 0 8px", letterSpacing: .5 },
  h3: { fontFamily: FONT_MONO, fontSize: 15.5, color: ACCENT, margin: "16px 0 6px" },
  h4: { fontFamily: FONT_MONO, fontSize: 13.5, color: ACCENT2, margin: "12px 0 4px" },
  p: { margin: "6px 0", color: TEXT },
  bullet: { display: "flex", gap: 8, margin: "4px 0", color: TEXT },
  bulletDot: { color: ACCENT, flexShrink: 0 },
  inlineCode: { fontFamily: FONT_MONO, fontSize: 12.5, background: "#0a1310", color: ACCENT, padding: "1px 5px", borderRadius: 4, border: `1px solid ${LINE}` },
  codePre: { fontFamily: FONT_MONO, fontSize: 12, whiteSpace: "pre-wrap", background: "#0a1310", padding: 12, borderRadius: 6, border: `1px solid ${LINE}` },
  mermaidWrap: { background: "#0a1310", border: `1px solid ${LINE}`, borderRadius: 8, padding: 14, margin: "12px 0", overflow: "auto", textAlign: "center" },

  modalWrap: { position: "fixed", inset: 0, background: "rgba(4,8,6,.78)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, backdropFilter: "blur(3px)" },
  modal: { background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: 26, maxWidth: 640, width: "92%", boxShadow: "0 30px 80px rgba(0,0,0,.6)" },
  modalTitle: { fontFamily: FONT_MONO, fontSize: 20, color: "#eef0ea", letterSpacing: .5 },
  modalSub: { fontSize: 14, color: MUTE, marginTop: 8, lineHeight: 1.6 },
  levelGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 20 },
  levelCard: { textAlign: "left", background: BG, border: `1px solid ${LINE}`, borderRadius: 10, padding: 16, cursor: "pointer", transition: "all .15s" },
  levelCardActive: { borderColor: ACCENT, boxShadow: `0 0 0 1px ${ACCENT}` },
  levelCardTitle: { fontFamily: FONT_MONO, fontSize: 14, color: ACCENT, fontWeight: 700 },
  levelCardBlurb: { fontSize: 12.5, color: MUTE, marginTop: 8, lineHeight: 1.5 },

  popup: { background: PANEL, border: `1px solid ${ACCENT2}`, borderRadius: 12, padding: 20, maxWidth: 560, width: "92%", maxHeight: "76vh", overflow: "auto" },
  popupHead: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  popupTag: { fontFamily: FONT_MONO, fontSize: 11, color: ACCENT2, letterSpacing: 2 },
  popupClose: { background: "transparent", border: "none", color: MUTE, fontSize: 22, cursor: "pointer", lineHeight: 1 },
  popupQuote: { fontFamily: FONT_MONO, fontSize: 12.5, color: MUTE, fontStyle: "italic", borderLeft: `2px solid ${ACCENT2}`, paddingLeft: 12, margin: "12px 0" },
  popupBody: { fontSize: 14, lineHeight: 1.6 },
};
