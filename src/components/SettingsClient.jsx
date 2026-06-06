"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CLOUD_MODELS } from "@/lib/models";

export default function SettingsClient() {
  const [hasKey, setHasKey] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [host, setHost] = useState("");
  const [models, setModels] = useState(CLOUD_MODELS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
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
        setModels(data.models || CLOUD_MODELS);
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

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    setError("");
    try {
      // The test reuses the chat endpoint with a minimal request.
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ which: "tldr", level: "undergrad", text: "Hello world", model }),
      });
      if (res.ok) {
        // Drain the body so the connection is closed cleanly.
        const reader = res.body.getReader();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += new TextDecoder().decode(value);
          if (buf.length > 12) break; // we just need to know it streams back
        }
        setTestResult({ ok: true, msg: "Model responded." });
      } else {
        const j = await res.json().catch(() => ({}));
        setTestResult({ ok: false, msg: j.error || `HTTP ${res.status}` });
      }
    } catch (e) {
      setTestResult({ ok: false, msg: String(e.message || e) });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="center-wrap">
        <div className="muted mono" style={{ animation: "pulse 1.4s infinite" }}>Loading…</div>
      </div>
    );
  }

  return (
    <div className="settings-wrap">
      <form className="settings-card" onSubmit={save}>
        <div className="settings-head">
          <h1>Settings</h1>
          <p className="muted">
            Your Ollama API key is encrypted (AES-256-GCM) before it touches the database and is
            only decrypted server-side when explaining a paper. Bring your own key, switch models anytime.
          </p>
        </div>

        {error && <div className="error">{error}</div>}
        {saved && <div className="notice">Saved.</div>}

        <div className="settings-section">
          <div className="section-label">
            <span>API key</span>
            {hasKey && <span className="status-dot ok" title="Key on file">●</span>}
          </div>
          <input
            className="input"
            type="password"
            placeholder={hasKey ? "•••••••• (leave blank to keep current)" : "Paste your ollama.com Bearer token"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
          />
          <div className="row">
            {hasKey && (
              <button type="button" className="btn btn-ghost btn-compact" onClick={clearKey} disabled={saving}>
                Remove key
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-compact" onClick={test} disabled={testing || !hasKey}>
              {testing ? "Testing…" : "Test connection"}
            </button>
            {testResult && (
              <span className={testResult.ok ? "ok-pill" : "err-pill"}>{testResult.ok ? "✓ " : "⚠ "}{testResult.msg}</span>
            )}
            <Link href="https://ollama.com/settings/keys" target="_blank" rel="noreferrer" className="link-pri">
              Get a key →
            </Link>
          </div>
        </div>

        <div className="settings-section">
          <div className="section-label"><span>Default model</span></div>
          <input
            className="input mono"
            list="model-suggestions"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="e.g. gpt-oss:120b-cloud"
            spellCheck={false}
          />
          <datalist id="model-suggestions">
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </datalist>
          <p className="muted" style={{ fontSize: 12 }}>
            Type any Ollama model name, or pick a Cloud model from the list.
          </p>
        </div>

        <div className="settings-section">
          <div className="section-label"><span>Ollama host</span></div>
          <input
            className="input mono"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            spellCheck={false}
            placeholder="https://ollama.com"
          />
          <p className="muted" style={{ fontSize: 12 }}>
            For local Ollama, use <code>http://localhost:11434</code>. Ollama Cloud uses <code>https://ollama.com</code>.
          </p>
        </div>

        <div className="actions-row">
          <button className="btn btn-compact" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
