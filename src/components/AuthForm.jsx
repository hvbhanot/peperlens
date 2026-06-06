"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const FEATURES = [
  { title: "Tunable depth", desc: "From high-school analogies to full research rigor.", icon: "◐" },
  { title: "Smart diagrams", desc: "Ask for any architecture — get a Mermaid in seconds.", icon: "◇" },
  { title: "SRS flashcards", desc: "AI generates spaced-repetition cards from any paper.", icon: "◈" },
  { title: "Cross-paper chat", desc: "Ask anything; answers stay grounded in the text.", icon: "◉" },
  { title: "Multi-model", desc: "Bring your own Ollama key, switch models anytime.", icon: "◆" },
  { title: "Yours alone", desc: "API key encrypted at rest, your papers stay private.", icon: "◍" },
];

export default function AuthForm({ mode }) {
  const router = useRouter();
  const isRegister = mode === "register";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${isRegister ? "register" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setBusy(false);
        return;
      }
      window.location.href = "/dashboard";
    } catch (err) {
      setError(String(err.message || err));
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-hero">
        <div className="auth-hero-inner">
          <Link href="/" className="brand" style={{ textDecoration: "none", color: "inherit" }}>
            <span className="brand-mark">◧</span>
            <span className="brand-name">PaperLens</span>
          </Link>

          <h1 className="auth-hero-title">
            The AI research<br />
            copilot for papers.
          </h1>
          <p className="auth-hero-sub">
            Upload any PDF. Get a tuned explanation, a glossary, a diagram,
            flashcards, and a chat that knows the paper end-to-end.
          </p>

          <div className="auth-feature-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="auth-feature">
                <div className="auth-feature-icon">{f.icon}</div>
                <div>
                  <div className="auth-feature-title">{f.title}</div>
                  <div className="auth-feature-desc">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="hero-blob" />
      </div>

      <div className="auth-form-wrap">
        <form className="card auth-card" onSubmit={submit}>
          <div className="auth-card-head">
            <span className="muted">{isRegister ? "Create your account" : "Welcome back"}</span>
            <h1>{isRegister ? "Get started" : "Sign in"}</h1>
            <p className="sub">
              {isRegister
                ? "Free while in beta. Bring your own Ollama key in Settings."
                : "Pick up where you left off in your library."}
            </p>
          </div>

          {error && <div className="error">{error}</div>}

          <div className="field">
            <label>EMAIL</label>
            <input
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@university.edu"
            />
          </div>
          <div className="field">
            <label>PASSWORD {isRegister && <span style={{ color: "var(--mute)" }}>(min 8 chars)</span>}</label>
            <input
              className="input"
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={isRegister ? 8 : undefined}
              placeholder="••••••••"
            />
          </div>

          <button className="btn" type="submit" disabled={busy}>
            {busy ? "…" : isRegister ? "Create account" : "Sign in"}
          </button>

          <p className="muted" style={{ marginTop: 18, textAlign: "center" }}>
            {isRegister ? (
              <>Already have an account? <Link href="/login">Sign in</Link></>
            ) : (
              <>No account yet? <Link href="/register">Create one</Link></>
            )}
          </p>
        </form>
      </div>
    </div>
  );
}
