// Small utilities for splitting and searching across extracted paper text.

export function chunkText(text, opts = {}) {
  const maxChars = opts.maxChars || 1800;
  const overlap = opts.overlap || 200;
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];
  const out = [];
  let i = 0;
  while (i < clean.length) {
    const end = Math.min(clean.length, i + maxChars);
    // Snap to the nearest sentence boundary inside the last 200 chars.
    let cut = end;
    if (end < clean.length) {
      const tail = clean.slice(Math.max(i, end - 220), end);
      const m = tail.match(/[.!?]\s+[^.!?]*$/);
      if (m) cut = Math.max(i + 1, end - (tail.length - tail.lastIndexOf(m[0]) - 1));
    }
    out.push(clean.slice(i, cut).trim());
    if (cut >= clean.length) break;
    i = Math.max(cut - overlap, i + 1);
  }
  return out;
}

// Grep-style snippet search: returns up to N hits with a highlight window.
export function searchSnippets(text, query, opts = {}) {
  const limit = opts.limit || 6;
  const window = opts.window || 220;
  const q = (query || "").trim();
  if (!q) return [];
  const lc = text.toLowerCase();
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = [];
  let i = 0;
  while (i < text.length && hits.length < limit) {
    const idx = lc.indexOf(terms[0], i);
    if (idx < 0) break;
    // Require all terms to be present in the window (cheap AND match).
    const start = Math.max(0, idx - Math.floor(window / 2));
    const end = Math.min(text.length, start + window);
    const w = text.slice(start, end);
    const wlc = w.toLowerCase();
    if (terms.every((t) => wlc.includes(t))) {
      hits.push({ start, end, snippet: w });
      i = end;
    } else {
      i = idx + 1;
    }
  }
  return hits;
}

// Builds a single highlight markup string from a query for client display.
export function highlight(snippet, query) {
  const terms = (query || "").split(/\s+/).filter(Boolean).map(escapeRe);
  if (!terms.length) return snippet;
  const re = new RegExp(`(${terms.join("|")})`, "ig");
  return snippet.replace(re, "‹‹$1››");
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
