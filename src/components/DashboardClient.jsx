"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getPdfJs } from "@/lib/pdfClient";

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function DashboardClient({ hasKey }) {
  const router = useRouter();
  const [papers, setPapers] = useState([]);
  const [max, setMax] = useState(5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
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

  useEffect(() => {
    load();
  }, []);

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
      // Count pages client-side so the card shows it immediately.
      let pages = 0;
      try {
        const pdfjsLib = await getPdfJs();
        const buf = await file.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: buf }).promise;
        pages = doc.numPages;
      } catch {
        // Non-fatal: upload anyway with pages=0.
      }

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

  return (
    <div className="page">
      <div className="page-head">
        <h1>Your papers</h1>
      </div>
      <div className="quota">
        {papers.length} / {max} saved{full ? " — limit reached, delete one to add another" : ""}
      </div>

      {!hasKey && (
        <div className="notice">
          No Ollama API key set yet. Add one in <Link href="/settings">Settings</Link> before explaining papers.
        </div>
      )}
      {error && <div className="error">{error}</div>}

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
          {papers.map((p) => (
            <div className="paper-card" key={p.id}>
              <div className="title">{p.title}</div>
              <div className="meta">
                {p.pages ? `${p.pages} pages · ` : ""}{fmtBytes(p.size)} · {new Date(p.createdAt).toLocaleDateString()}
              </div>
              <div className="actions">
                <Link href={`/paper/${p.id}`}>Open</Link>
                <button className="del" onClick={() => del(p.id)}>Delete</button>
              </div>
            </div>
          ))}

          <div
            className={`paper-card upload-card ${full || uploading ? "disabled" : ""}`}
            onClick={() => !full && !uploading && fileRef.current?.click()}
          >
            <div className="plus">{uploading ? "…" : "+"}</div>
            <div className="mono" style={{ fontSize: 12 }}>
              {uploading ? "Uploading…" : full ? "Limit reached" : "Upload a PDF"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
