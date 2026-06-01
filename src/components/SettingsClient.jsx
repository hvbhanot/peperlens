"use client";

import { useEffect, useState } from "react";

export default function SettingsClient() {
  const [hasKey, setHasKey] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [host, setHost] = useState("");
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (res.ok) {
        setHasKey(data.hasKey);
        setModel(data.model);
        setHost(data.host);
        setModels(data.models);
      } else {
        setError(data.error || "Failed to load settings.");
      }
      setLoading(false);
    })();
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setError("");
    setSaved(false);
    setSaving(true);
    try {
      const payload = { model, host };
      // Only send the key field when the user typed something new.
      if (apiKey.trim()) payload.apiKey = apiKey.trim();

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Save failed.");
      } else {
        setHasKey(data.hasKey);
        setApiKey("");
        setSaved(true);
      }
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const clearKey = async () => {
    if (!confirm("Remove your stored Ollama API key?")) return;
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: "" }),
    });
    const data = await res.json();
    if (res.ok) {
      setHasKey(false);
      setApiKey("");
    } else {
      setError(data.error || "Failed to clear key.");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="center-wrap">
        <div className="muted mono" style={{ animation: "pulse 1.4s infinite" }}>Loading…</div>
      </div>
    );
  }

  return (
    <div className="center-wrap">
      <form className="card" onSubmit={save} style={{ maxWidth: 480 }}>
        <h1>Settings</h1>
        <p className="sub">
          Your Ollama API key is encrypted (AES-256-GCM) before it touches the database and is
          only decrypted server-side when explaining a paper.
        </p>

        {error && <div className="error">{error}</div>}
        {saved && <div className="notice">Saved.</div>}

        <div className="field">
          <label>
            OLLAMA API KEY {hasKey && <span style={{ color: "var(--accent)" }}>● key on file</span>}
          </label>
          <input
            className="input"
            type="password"
            placeholder={hasKey ? "•••••••• (leave blank to keep current)" : "Paste your ollama.com Bearer token"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
          />
          {hasKey && (
            <button
              type="button"
              className="btn btn-danger"
              style={{ marginTop: 8 }}
              onClick={clearKey}
              disabled={saving}
            >
              Remove stored key
            </button>
          )}
        </div>

        <div className="field">
          <label>DEFAULT MODEL</label>
          <select className="input" value={model} onChange={(e) => setModel(e.target.value)}>
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>OLLAMA HOST</label>
          <input
            className="input"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            spellCheck={false}
            placeholder="https://ollama.com"
          />
        </div>

        <button className="btn" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </button>
      </form>
    </div>
  );
}
