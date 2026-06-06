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

// Inline markdown: **bold** / __bold__, *italic*, `code`. Math stays untouched
// (KaTeX renders it afterward).
function inline(s) {
  const out = [];
  const re = /(\*\*([^*]+?)\*\*|__([^_]+?)__|\*([^*\n]+?)\*|`([^`]+?)`)/g;
  let last = 0, m, k = 0;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[2] != null) out.push(<strong key={k++}>{m[2]}</strong>);
    else if (m[3] != null) out.push(<strong key={k++}>{m[3]}</strong>);
    else if (m[4] != null) out.push(<em key={k++}>{m[4]}</em>);
    else out.push(<code key={k++} className="icode">{m[5]}</code>);
    last = re.lastIndex;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

const isTableSep = (l) => {
  const t = l.trim();
  return t.includes("|") && t.includes("-") && /^[\s:|-]+$/.test(t);
};

// Block-level markdown → elements (headings, tables, lists, rules, paragraphs).
// No mermaid/math here.
export function Prose({ text }) {
  const lines = text.split("\n");
  const els = [];
  let i = 0, key = 0;

  while (i < lines.length) {
    const ln = lines[i];

    if (ln.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = splitRow(ln);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(splitRow(lines[i]));
        i++;
      }
      els.push(
        <table key={key++} className="md-table">
          <thead><tr>{header.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr></thead>
          <tbody>{rows.map((r, ri) => <tr key={ri}>{header.map((_, ci) => <td key={ci}>{inline(r[ci] || "")}</td>)}</tr>)}</tbody>
        </table>
      );
      continue;
    }

    if (!ln.trim()) { els.push(<div key={key++} style={{ height: 6 }} />); i++; continue; }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(ln.trim())) { els.push(<hr key={key++} className="md-hr" />); i++; continue; }
    if (ln.startsWith("#### ")) { els.push(<h5 key={key++}>{inline(ln.slice(5))}</h5>); i++; continue; }
    if (ln.startsWith("### ")) { els.push(<h4 key={key++}>{inline(ln.slice(4))}</h4>); i++; continue; }
    if (ln.startsWith("## ")) { els.push(<h3 key={key++}>{inline(ln.slice(3))}</h3>); i++; continue; }
    if (ln.startsWith("# ")) { els.push(<h2 key={key++}>{inline(ln.slice(2))}</h2>); i++; continue; }

    // Block quote
    if (/^>\s+/.test(ln)) {
      const buf = [];
      while (i < lines.length && /^>\s+/.test(lines[i])) { buf.push(lines[i].replace(/^>\s+/, "")); i++; }
      els.push(<blockquote key={key++} className="md-quote">{inline(buf.join(" "))}</blockquote>);
      continue;
    }

    const om = ln.match(/^\s*(\d+)\.\s+(.*)/);
    if (om) { els.push(<div key={key++} className="bullet"><span className="dot num">{om[1]}.</span><span>{inline(om[2])}</span></div>); i++; continue; }
    if (/^\s*[-*]\s+/.test(ln)) { els.push(<div key={key++} className="bullet"><span className="dot">▸</span><span>{inline(ln.replace(/^\s*[-*]\s+/, ""))}</span></div>); i++; continue; }

    els.push(<p key={key++}>{inline(ln)}</p>);
    i++;
  }

  return <>{els}</>;
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

  return (
    <div className={className} ref={ref} key={text.length + "|" + text.slice(0, 24)}>
      {renderParts(text)}
    </div>
  );
}

// A bare-bones "twitter thread" renderer: one card per line, large readable text.
export function TweetThread({ text }) {
  const tweets = text.split("\n").map((t) => t.trim()).filter((t) => /^\d+\/\s?/.test(t));
  if (tweets.length === 0) return <RichText text={text} />;
  return (
    <div className="tweet-thread">
      {tweets.map((t, i) => (
        <div key={i} className="tweet-card">
          <div className="tweet-num">{(t.match(/^(\d+)/) || [, ""])[1]}/{tweets.length}</div>
          <div className="tweet-body">{t.replace(/^\d+\/?\s*/, "").trim()}</div>
        </div>
      ))}
    </div>
  );
}
