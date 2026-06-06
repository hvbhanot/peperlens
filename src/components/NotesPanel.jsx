"use client";

import { useEffect, useState } from "react";

export default function NotesPanel({ paperId, currentPage }) {
  const [notes, setNotes] = useState([]);
  const [body, setBody] = useState("");
  const [page, setPage] = useState(currentPage || null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => { setPage(currentPage || null); }, [currentPage]);

  const load = async () => {
    const r = await fetch(`/api/papers/${paperId}/notes`);
    const d = await r.json();
    if (r.ok) setNotes(d.notes || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [paperId]);

  const add = async (e) => {
    e?.preventDefault?.();
    if (!body.trim()) return;
    setBusy(true);
    const r = await fetch(`/api/papers/${paperId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, page }),
    });
    const d = await r.json();
    if (r.ok) {
      setNotes((n) => [...n, d.note].sort((a, b) => (a.page || 0) - (b.page || 0)));
      setBody("");
    }
    setBusy(false);
  };

  const save = async (id, newBody) => {
    const r = await fetch(`/api/papers/${paperId}/notes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, body: newBody }),
    });
    const d = await r.json();
    if (r.ok) {
      setNotes((n) => n.map((x) => (x.id === id ? d.note : x)));
      setEditing(null);
    }
  };

  const del = async (id) => {
    if (!confirm("Delete this note?")) return;
    const r = await fetch(`/api/papers/${paperId}/notes`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (r.ok) setNotes((n) => n.filter((x) => x.id !== id));
  };

  if (loading) return <div className="muted mono" style={{ animation: "pulse 1.4s infinite" }}>Loading notes…</div>;

  return (
    <div className="notes-wrap">
      <form className="note-form" onSubmit={add}>
        <textarea
          className="input note-input"
          rows={3}
          placeholder="Capture a thought, a citation, a question for the next read…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="note-form-row">
          <label className="muted">
            Page:
            <input
              type="number"
              min={1}
              className="input page-input"
              value={page || ""}
              onChange={(e) => setPage(e.target.value ? Number(e.target.value) : null)}
            />
          </label>
          <button className="btn btn-compact" disabled={busy || !body.trim()}>{busy ? "…" : "Add note"}</button>
        </div>
      </form>

      <div className="note-list">
        {notes.length === 0 && <div className="placeholder">No notes yet. Highlights and quotes go well here.</div>}
        {notes.map((n) => (
          <div key={n.id} className="note">
            <div className="note-head">
              <span className="note-page">p{n.page || "—"}</span>
              <span className="note-time">{new Date(n.createdAt).toLocaleString()}</span>
              <div style={{ flex: 1 }} />
              <button className="link-btn" onClick={() => setEditing(editing === n.id ? null : n.id)}>
                {editing === n.id ? "Cancel" : "Edit"}
              </button>
              <button className="link-btn" onClick={() => del(n.id)}>×</button>
            </div>
            {editing === n.id ? (
              <NoteEditor
                initial={n.body}
                onSave={(v) => save(n.id, v)}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div className="note-body">{n.body}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function NoteEditor({ initial, onSave, onCancel }) {
  const [v, setV] = useState(initial);
  return (
    <div className="note-edit">
      <textarea className="input" rows={3} value={v} onChange={(e) => setV(e.target.value)} />
      <div className="note-form-row">
        <button className="btn btn-compact" onClick={() => onSave(v)} disabled={!v.trim()}>Save</button>
        <button className="btn btn-ghost btn-compact" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
