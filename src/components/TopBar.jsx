"use client";

import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

export default function TopBar({ email }) {
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <header className="topbar">
      <Link href="/dashboard" className="brand" style={{ textDecoration: "none" }}>
        <span className="brand-mark">◧</span>
        <span className="brand-name">PaperLens</span>
        <span className="brand-sub">Ollama paper explainer</span>
      </Link>
      <nav className="nav">
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/settings">Settings</Link>
        {email && <span className="who">{email}</span>}
        <ThemeToggle />
        <button onClick={logout}>Log out</button>
      </nav>
    </header>
  );
}
