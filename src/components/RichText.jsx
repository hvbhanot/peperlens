"use client";

import { useEffect, useRef } from "react";
import { getMermaid, getKatex } from "@/lib/pdfClient";

// ---- Mermaid diagram block ----
function MermaidBlock({ code }) {
  const ref = useRef(null);
  const errRef = useRef(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mermaid = await getMermaid();
        const id = "m" + Math.random().toString(36).slice(2);
        const { svg } = await mermaid.render(id, code);
        if (alive && ref.current) ref.current.innerHTML = svg;
      } catch (e) {
        if (alive && errRef.current) errRef.current.textContent = "Diagram failed to render: " + (e.message || e);
      }
    })();
    return () => { alive = false; };
  }, [code]);
  return (
    <div className="mermaid-wrap">
      <div ref={ref} />
      <div ref={errRef} className="mermaid-err" />
    </div>
  );
}

// Inline markdown: **bold** and `code`. (Math is handled by KaTeX afterward.)
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

// Basic markdown → elements (headings, bullets, paragraphs). No mermaid/math.
export function Prose({ text }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((ln, i) => {
        if (!ln.trim()) return <div key={i} style={{ height: 6 }} />;
        if (ln.startsWith("### ")) return <h4 key={i}>{inline(ln.slice(4))}</h4>;
        if (ln.startsWith("## ")) return <h3 key={i}>{inline(ln.slice(3))}</h3>;
        if (ln.startsWith("# ")) return <h2 key={i}>{inline(ln.slice(2))}</h2>;
        if (/^\s*[-*]\s+/.test(ln))
          return (
            <div key={i} className="bullet">
              <span className="dot">▸</span>
              <span>{inline(ln.replace(/^\s*[-*]\s+/, ""))}</span>
            </div>
          );
        return <p key={i}>{inline(ln)}</p>;
      })}
    </>
  );
}

function renderParts(text) {
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

// Full renderer: markdown + mermaid + KaTeX math. Use for settled (non-streaming)
// content. For live streaming, render <Prose> directly to avoid re-running math.
export function RichText({ text, className = "prose" }) {
  const ref = useRef(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const render = await getKatex();
        if (alive && ref.current) {
          render(ref.current, {
            delimiters: [
              { left: "$$", right: "$$", display: true },
              { left: "\\[", right: "\\]", display: true },
              { left: "\\(", right: "\\)", display: false },
              { left: "$", right: "$", display: false },
            ],
            ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"],
            throwOnError: false,
          });
        }
      } catch {/* math optional */}
    })();
    return () => { alive = false; };
  }, [text]);

  // key by content so React fully remounts the subtree on change, preventing
  // conflicts between React reconciliation and KaTeX's DOM mutations.
  return (
    <div className={className} ref={ref} key={text.length + "|" + text.slice(0, 24)}>
      {renderParts(text)}
    </div>
  );
}
