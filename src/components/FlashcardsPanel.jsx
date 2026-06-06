"use client";

import { useEffect, useState } from "react";

export default function FlashcardsPanel({ paperId, level, model }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [count, setCount] = useState(12);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    const r = await fetch(`/api/papers/${paperId}/flashcards`);
    const d = await r.json();
    if (r.ok) setCards(d.cards || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [paperId]);

  const gen = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/papers/${paperId}/flashcards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level, model, count }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || "Failed to generate flashcards.");
      } else {
        setCards(d.cards || []);
        setIdx(0);
        setFlipped(false);
      }
    } finally { setBusy(false); }
  };

  const rate = async (mastery) => {
    if (!cards[idx]) return;
    await fetch(`/api/papers/${paperId}/flashcards`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: cards[idx].id, mastery }),
    });
    setCards((cs) => cs.map((c, i) => i === idx ? { ...c, mastery } : c));
    setFlipped(false);
    setIdx((i) => (i + 1) % cards.length);
  };

  if (loading) return <div className="muted mono" style={{ animation: "pulse 1.4s infinite" }}>Loading flashcards…</div>;

  if (cards.length === 0) {
    return (
      <div className="fc-empty">
        <div className="placeholder" style={{ marginBottom: 14 }}>
          Generate spaced-repetition flashcards to memorize this paper. Each card is self-contained
          and the AI grades your recall.
        </div>
        {error && <div className="error">{error}</div>}
        <div className="fc-gen">
          <label className="muted">Cards:&nbsp;
            <input type="number" min={4} max={24} className="input small-num" value={count} onChange={(e) => setCount(Math.max(4, Math.min(24, Number(e.target.value) || 12)))} />
          </label>
          <button className="btn btn-compact" onClick={gen} disabled={busy}>{busy ? "Generating…" : "Generate flashcards"}</button>
        </div>
      </div>
    );
  }

  const card = cards[idx];
  const due = cards.filter((c) => c.mastery < 0.8).length;

  return (
    <div className="fc-wrap">
      <div className="fc-head">
        <div className="muted">{idx + 1} of {cards.length} · {due} still to master</div>
        <div className="fc-tools">
          <button className="link-btn" onClick={gen} disabled={busy}>{busy ? "…" : "Regenerate"}</button>
        </div>
      </div>

      <div className={`fc-card ${flipped ? "flipped" : ""}`} onClick={() => setFlipped((f) => !f)}>
        <div className="fc-face fc-front">
          <div className="fc-label">Question</div>
          <div className="fc-text">{card.question}</div>
          <div className="fc-hint muted">click to reveal answer</div>
        </div>
        <div className="fc-face fc-back">
          <div className="fc-label">Answer</div>
          <div className="fc-text">{card.answer}</div>
          <div className="fc-hint muted">click to flip back</div>
        </div>
      </div>

      <div className="fc-rating">
        <button className="fc-rate hard" onClick={() => rate(0.1)} title="Mark hard">Hard</button>
        <button className="fc-rate good" onClick={() => rate(0.5)} title="Mark good">Good</button>
        <button className="fc-rate easy" onClick={() => rate(0.9)} title="Mark easy">Easy</button>
        <div style={{ flex: 1 }} />
        <button className="fc-skip" onClick={() => { setFlipped(false); setIdx((i) => (i + 1) % cards.length); }}>Skip →</button>
      </div>

      <div className="fc-progress">
        {cards.map((c, i) => (
          <div
            key={c.id}
            className={`fc-dot ${i === idx ? "active" : ""}`}
            style={{ opacity: 0.3 + 0.7 * c.mastery }}
            onClick={() => { setIdx(i); setFlipped(false); }}
            title={`mastery ${(c.mastery * 100).toFixed(0)}%`}
          />
        ))}
      </div>
    </div>
  );
}
