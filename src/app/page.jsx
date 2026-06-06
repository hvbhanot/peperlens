import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

const CAPS = [
  { id: "overview", title: "Overview", desc: "Problem, method, results, limitations — in plain language at your level." },
  { id: "sections", title: "Section-by-section", desc: "Logical sections extracted and explained one by one." },
  { id: "diagram", title: "Architecture diagram", desc: "Mermaid flowcharts, requested on the fly for any part of the paper." },
  { id: "glossary", title: "Glossary", desc: "Every acronym and term, defined as the paper uses it." },
  { id: "modes", title: "Five summary modes", desc: "ELI5, tweet thread, abstract, exec brief, critique — same paper, five angles." },
  { id: "questions", title: "Comprehension Q&A", desc: "AI-generated study questions at easy/medium/hard with model answers." },
  { id: "flashcards", title: "Spaced-repetition cards", desc: "Self-rating flashcards to actually retain what you read." },
  { id: "notes", title: "Page-anchored notes", desc: "Take notes tied to specific pages, jump back with one click." },
  { id: "chat", title: "Paper-grounded chat", desc: "Ask anything; answers cite the text and respect your level." },
  { id: "compare", title: "Compare papers", desc: "Up to 4 papers side-by-side, with a markdown comparison table." },
  { id: "search", title: "Cross-library search", desc: "Full-text search across every paper you own, with snippets." },
  { id: "tags", title: "Auto-tagging", desc: "Tags, field, method, year — extracted by the model and filterable." },
];

export default async function Home() {
  const session = await getSession();
  if (session?.uid) redirect("/dashboard");

  return (
    <div className="landing">
      <header className="landing-nav">
        <Link href="/" className="brand" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="brand-mark">◧</span>
          <span className="brand-name">PaperLens</span>
        </Link>
        <nav className="nav">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <Link href="/login" className="btn btn-compact btn-ghost">Sign in</Link>
          <Link href="/register" className="btn btn-compact">Get started</Link>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-blob" />
        <div className="hero-blob blob-2" />
        <div className="hero-grid-bg" />
        <div className="hero-inner">
          <span className="hero-eyebrow">AI research copilot</span>
          <h1 className="hero-title">
            Read research papers<br />
            <span className="grad">10× faster</span> — and remember them.
          </h1>
          <p className="hero-sub">
            PaperLens turns dense PDFs into a structured, multi-modal reading experience.
            Pick a depth. Get explanations, diagrams, flashcards, and a paper-grounded chat
            — powered by the model of your choice.
          </p>
          <div className="hero-cta">
            <Link href="/register" className="btn btn-compact btn-large">Start free →</Link>
            <Link href="/login" className="btn btn-compact btn-ghost btn-large">I have an account</Link>
          </div>
          <div className="hero-trust muted">No credit card · Bring your own Ollama key · Papers stay private</div>
        </div>

        <div className="hero-mockup">
          <div className="mockup-bar">
            <span className="dot red" /><span className="dot yellow" /><span className="dot green" />
            <span className="mockup-title">paperlens — attention-is-all-you-need.pdf</span>
          </div>
          <div className="mockup-body">
            <div className="mock-pane">
              <div className="mock-pdf">
                <div className="mock-line w-90" />
                <div className="mock-line w-70" />
                <div className="mock-line w-80" />
                <div className="mock-line w-60" />
                <div className="mock-line w-85" />
                <div className="mock-line w-50" />
                <div className="mock-hl" />
                <div className="mock-line w-75" />
                <div className="mock-line w-65" />
              </div>
            </div>
            <div className="mock-panel">
              <div className="mock-tabs">
                <span className="mock-tab active">Overview</span>
                <span className="mock-tab">Glossary</span>
                <span className="mock-tab">Diagram</span>
                <span className="mock-tab">Chat</span>
              </div>
              <div className="mock-tldr">
                <div className="mock-tldr-title">KEY TAKEAWAYS</div>
                <div className="mock-line w-90" />
                <div className="mock-line w-80" />
                <div className="mock-line w-70" />
              </div>
              <div className="mock-h2">Problem & motivation</div>
              <div className="mock-line w-95" />
              <div className="mock-line w-85" />
              <div className="mock-line w-60" />
              <div className="mock-h2">Method</div>
              <div className="mock-line w-90" />
              <div className="mock-line w-75" />
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="features">
        <div className="section-head">
          <span className="eyebrow">Capabilities</span>
          <h2>Everything you need to read a paper — nothing you don't.</h2>
        </div>
        <div className="cap-grid">
          {CAPS.map((c) => (
            <div key={c.id} className="cap-card">
              <div className="cap-mark">{c.id[0].toUpperCase()}</div>
              <div className="cap-title">{c.title}</div>
              <div className="cap-desc">{c.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="how">
        <div className="section-head">
          <span className="eyebrow">How it works</span>
          <h2>Three steps. Five minutes. Actually retain the paper.</h2>
        </div>
        <div className="how-grid">
          <div className="how-step">
            <div className="how-num">1</div>
            <h3>Upload a PDF</h3>
            <p>Drop any research paper. We extract the text, split it into chunks, and cache it for re-querying. Up to 5 papers per account, 8 MB each.</p>
          </div>
          <div className="how-step">
            <div className="how-num">2</div>
            <h3>Pick a comprehension level</h3>
            <p>High School analogies, undergraduate intuition, or full researcher rigor. Every output — diagrams, glossary, chat, flashcards — is tuned to it.</p>
          </div>
          <div className="how-step">
            <div className="how-num">3</div>
            <h3>Read, ask, compare, remember</h3>
            <p>Browse the auto-generated overview, ask anything in the chat, save notes, generate flashcards, and compare against other papers — all from one panel.</p>
          </div>
        </div>
      </section>

      <section className="cta-band">
        <h2>Stop drowning in PDFs.</h2>
        <p>PaperLens is free while in beta. Bring your own Ollama key and you're set in under a minute.</p>
        <Link href="/register" className="btn btn-compact btn-large">Create your account →</Link>
      </section>

      <footer className="footer">
        <div className="footer-inner">
          <div className="brand">
            <span className="brand-mark">◧</span>
            <span className="brand-name">PaperLens</span>
          </div>
          <div className="muted">© {new Date().getFullYear()} · Built for the AI research community.</div>
        </div>
      </footer>
    </div>
  );
}
