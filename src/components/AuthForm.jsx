"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
      // Hard navigation so middleware re-reads the fresh session cookie.
      window.location.href = "/dashboard";
    } catch (err) {
      setError(String(err.message || err));
      setBusy(false);
    }
  };

  return (
    <div className="center-wrap">
      <form className="card" onSubmit={submit}>
        <div className="brand" style={{ marginBottom: 18 }}>
          <span className="brand-mark">◧</span>
          <span className="brand-name">PAPERLENS</span>
        </div>
        <h1>{isRegister ? "Create account" : "Welcome back"}</h1>
        <p className="sub">
          {isRegister
            ? "Sign up to save papers and explain them with your own Ollama key."
            : "Sign in to your PaperLens dashboard."}
        </p>

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
  );
}
