"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getPdfJs } from "@/lib/pdfClient";

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const FIELD_COLORS = {
  nlp: "var(--accent)", vision: "var(--accent-2)", rl: "var(--accent-3)",
  audio: "var(--accent-4)", "graph-ml": "var(--accent-5)", theory: "var(--accent-6)",
};

function fieldTint(field) {
  if (!field) return "var(--muted)";
  const key = field.toLowerCase();
  for (const k of Object.keys(FIELD_COLORS)) if (key.includes(k)) return FIELD_COLORS[k];
  return "var(--primary)";
}

export default function DashboardClient({ hasKey }) {
  const router = useRouter();
  const search = useSearchParams();
  const initialView = search?.get("view") === "compare" ? "compare" : "library";
  const [papers, setPapers] = useState([]);
  const [max, setMax] = useState(5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [view, setView] = useState(initialView);
  const [filter, setFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [compareIds, setCompareIds] = useState([]);
  const [compareFocus, setCompareFocus] = useState("");
  const [compareOut, setCompareOut] = useState("");
  const [compareBusy, setCompareBusy] = useState(false);
  const fileRef = useRef(null);

  const load = async () => {
    const res = await fetch("/api/papers");
    const data = await res.json();
    if (res.ok) {
      setPapers(data.papers);
      setMax(data.max);
    } else {
      setError(data.error || "Failed to load papers.");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const allTags = useMemo(() => {
    const s = new Set();
    papers.forEach((p) => (p.tags || []).forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [papers]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return papers.filter((p) => {
      if (q) {
        const hay = `${p.title} ${p.fileName} ${(p.tags || []).join(" ")} ${p.field || ""} ${p.method || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (tagFilter && !(p.tags || []).includes(tagFilter)) return false;
      return true;
    });
  }, [papers, filter, tagFilter]);

  const stats = useMemo(() => {
    const total = papers.length;
    const pages = papers.reduce((a, p) => a + (p.pages || 0), 0);
    const fields = new Set(papers.map((p) => p.field).filter(Boolean));
    const years = new Set(papers.map((p) => p.year).filter(Boolean));
    return { total, pages, fields: fields.size, years: years.size };
  }, [papers]);

  const full = papers.length >= max;

  const onPick = async (file) => {
    if (!file) return;
    setError("");
    if (file.type !== "application/pdf") {
      setError("Please choose a PDF file.");
      return;
    }
    setUploading(true);
    try {
      let pages = 0;
      try {
        const pdfjsLib = await getPdfJs();
        const buf = await file.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: buf }).promise;
        pages = doc.numPages;
      } catch {/* ignore */}

      const form = new FormData();
      form.append("file", file);
      form.append("title", file.name.replace(/\.pdf$/i, ""));
      form.append("pages", String(pages));

      const res = await fetch("/api/papers", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed.");
        setUploading(false);
        return;
      }
      router.push(`/paper/${data.paper.id}`);
    } catch (err) {
      setError(String(err.message || err));
      setUploading(false);
    }
  };

  const del = async (id) => {
    if (!confirm("Delete this paper? This cannot be undone.")) return;
    const res = await fetch(`/api/papers/${id}`, { method: "DELETE" });
    if (res.ok) setPapers((p) => p.filter((x) => x.id !== id));
  };

  const toggleCompare = (id) =>
    setCompareIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : ids.length >= 4 ? ids : [...ids, id]));

  const runCompare = async () => {
    if (compareIds.length < 2) {
      setError("Pick at least 2 papers to compare.");
      return;
    }
    if (!hasKey) {
      setError("Set your Ollama API key in Settings first.");
      return;
    }
    setCompareBusy(true);
    setCompareOut("");
    setError("");
    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: compareIds, focus: compareFocus, level: "undergrad" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Compare failed.");
        setCompareBusy(false);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setCompareOut(acc);
      }
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setCompareBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{view === "compare" ? "Compare papers" : "Your library"}</h1>
          <div className="muted">
            {view === "compare"
              ? "Side-by-side comparison of up to 4 papers, generated by your model."
              : "Upload a PDF, pick a level, and let the AI do the reading."}
          </div>
        </div>
        <div className="view-switch">
          <button className={view === "library" ? "active" : ""} onClick={() => setView("library")}>Library</button>
          <button className={view === "compare" ? "active" : ""} onClick={() => setView("compare")}>Compare</button>
        </div>
      </div>

      {!hasKey && (
        <div className="notice">
          No Ollama API key set yet. Add one in <Link href="/settings">Settings</Link> before generating analyses.
        </div>
      )}
      {error && <div className="error">{error}</div>}

      {view === "library" && (
        <>
          <div className="stat-row">
            <div className="stat-card">
              <div className="stat-num">{stats.total}</div>
              <div className="stat-lbl">Papers</div>
            </div>
            <div className="stat-card">
              <div className="stat-num">{stats.pages}</div>
              <div className="stat-lbl">Total pages</div>
            </div>
            <div className="stat-card">
              <div className="stat-num">{stats.fields}</div>
              <div className="stat-lbl">Research areas</div>
            </div>
            <div className="stat-card">
              <div className="stat-num">{stats.years}</div>
              <div className="stat-lbl">Years covered</div>
            </div>
            <div className="stat-card quota-card">
              <div className="stat-num">{stats.total} / {max}</div>
              <div className="stat-lbl">Quota {full ? "— full" : ""}</div>
            </div>
          </div>

          <div className="lib-controls">
            <input
              className="input"
              placeholder="Filter by title, tag, or field…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <select className="input" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
              <option value="">All tags</option>
              {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            style={{ display: "none" }}
            onChange={(e) => onPick(e.target.files?.[0])}
          />

          {loading ? (
            <div className="muted mono" style={{ animation: "pulse 1.4s infinite" }}>Loading…</div>
          ) : (
            <div className="grid">
              {filtered.map((p) => (
                <Link key={p.id} href={`/paper/${p.id}`} className="paper-card" style={{ textDecoration: "none" }}>
                  <div className="card-row">
                    {p.field && (
                      <span className="field-pill" style={{ background: fieldTint(p.field) }}>{p.field}</span>
                    )}
                    {p.year && <span className="year-pill">{p.year}</span>}
                  </div>
                  <div className="title">{p.title}</div>
                  <div className="meta">
                    {p.pages ? `${p.pages} pages · ` : ""}{fmtBytes(p.size)} · {new Date(p.createdAt).toLocaleDateString()}
                  </div>
                  {p.tags?.length > 0 && (
                    <div className="tag-row">
                      {p.tags.slice(0, 4).map((t) => <span key={t} className="tag-chip">{t}</span>)}
                    </div>
                  )}
                  <div className="actions">
                    <span className="link-pri">Open →</span>
                    <button
                      className="del"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); del(p.id); }}
                    >Delete</button>
                  </div>
                </Link>
              ))}

              <div
                className={`paper-card upload-card ${full || uploading ? "disabled" : ""}`}
                onClick={() => !full && !uploading && fileRef.current?.click()}
              >
                <div className="plus">{uploading ? "…" : "+"}</div>
                <div className="mono" style={{ fontSize: 12 }}>
                  {uploading ? "Uploading…" : full ? "Limit reached" : "Upload a PDF"}
                </div>
                <div className="muted" style={{ fontSize: 11 }}>Drag, drop, done. AI does the rest.</div>
              </div>
            </div>
          )}
        </>
      )}

      {view === "compare" && (
        <div className="compare-wrap">
          <div className="compare-controls">
            <div className="compare-input">
              <label>Optional focus</label>
              <input
                className="input"
                placeholder="e.g. 'scaling behaviour', 'compute efficiency', 'evaluation methodology'…"
                value={compareFocus}
                onChange={(e) => setCompareFocus(e.target.value)}
              />
            </div>
            <button
              className="btn btn-compact"
              onClick={runCompare}
              disabled={compareBusy || compareIds.length < 2}
            >
              {compareBusy ? "Generating…" : `Compare ${compareIds.length || 0}`}
            </button>
          </div>

          <div className="compare-grid">
            {papers.length === 0 && <div className="placeholder">Upload some papers first.</div>}
            {papers.map((p) => {
              const sel = compareIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  className={`compare-card ${sel ? "selected" : ""}`}
                  onClick={() => toggleCompare(p.id)}
                  disabled={!sel && compareIds.length >= 4}
                >
                  <div className="compare-check">{sel ? "✓" : "+"}</div>
                  <div className="compare-title">{p.title}</div>
                  <div className="compare-meta">{p.field || "—"} · {p.method || "—"} {p.year || ""}</div>
                </button>
              );
            })}
          </div>

          {compareOut && (
            <div className="compare-out prose" key={compareOut.length}>
              <pre style={{ whiteSpace: "pre-wrap", fontFamily: "var(--font)" }}>{compareOut}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
