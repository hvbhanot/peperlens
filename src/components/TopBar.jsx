"use client";

import Link from "next/link";

export default function TopBar({ email }) {
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <header className="topbar">
      <Link href="/dashboard" className="brand" style={{ textDecoration: "none" }}>
        <span className="brand-mark">◧</span>
        <span className="brand-name">PAPERLENS</span>
        <span className="brand-sub">// ollama paper explainer</span>
      </Link>
      <nav className="nav">
        <Link href="/dashboard">DASHBOARD</Link>
        <Link href="/settings">SETTINGS</Link>
        {email && <span className="brand-sub">{email}</span>}
        <button onClick={logout}>LOG OUT</button>
      </nav>
    </header>
  );
}
