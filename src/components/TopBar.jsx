"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import ThemeToggle from "@/components/ThemeToggle";

export default function TopBar({ email }) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const debRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    function onClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    setBusy(true);
    clearTimeout(debRef.current);
    debRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const d = await r.json();
        if (r.ok) setResults(d.results || []);
      } catch {/* ignore */} finally { setBusy(false); }
    }, 220);
    return () => clearTimeout(debRef.current);
  }, [q]);

  const isActive = (p) => pathname === p || pathname?.startsWith(p + "/");

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <header className="topbar">
      <Link href="/dashboard" className="brand" style={{ textDecoration: "none" }}>
        <span className="brand-mark">◧</span>
        <span className="brand-name">PaperLens</span>
        <span className="brand-sub">AI research copilot</span>
      </Link>

      <div className="search-wrap" ref={boxRef}>
        <input
          className="input search-input"
          placeholder="Search across all your papers…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setOpen(false); e.currentTarget.blur(); }
          }}
        />
        {open && q.trim() && (
          <div className="search-pop">
            {busy && <div className="search-empty">Searching…</div>}
            {!busy && results.length === 0 && <div className="search-empty">No matches.</div>}
            {results.map((r) => (
              <button
                key={r.paper.id}
                className="search-hit"
                onClick={() => { router.push(`/paper/${r.paper.id}`); setOpen(false); setQ(""); }}
              >
                <div className="search-hit-title">{r.paper.title}</div>
                <div className="search-hit-meta">
                  {r.paper.field || "—"} · {r.paper.method || "—"} {r.paper.year ? `· ${r.paper.year}` : ""}
                </div>
                <div
                  className="search-hit-snippet"
                  dangerouslySetInnerHTML={{ __html: r.snippets[0]?.html || "" }}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <nav className="nav">
        <Link href="/dashboard" className={isActive("/dashboard") ? "active" : ""}>Library</Link>
        <Link href="/dashboard?view=compare" className={isActive("/compare") ? "active" : ""}>Compare</Link>
        <Link href="/settings" className={isActive("/settings") ? "active" : ""}>Settings</Link>
        {email && <span className="who">{email}</span>}
        <ThemeToggle />
        <button onClick={logout}>Log out</button>
      </nav>
    </header>
  );
}
