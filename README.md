# PaperLens

An AI research copilot for papers. Upload a PDF, pick a comprehension level
(High School → Researcher), and get an Ollama-powered overview, section
breakdown, Mermaid diagrams, glossary, study questions, spaced-repetition
flashcards, page-anchored notes, paper-grounded chat, **and a side-by-side
compare view** — plus inline "explain this selection" on any highlighted
passage.

## Features

### Reading
- **PDF viewer** with selectable text layer, page navigation, zoom, fit-width.
- **Comprehension levels** — High School / Undergraduate / Grad. Every
  output (overview, diagrams, glossary, chat, flashcards) is tuned to it.
- **Five summary modes** — ELI5, tweet thread, conference abstract, executive
  brief, critique. Pick the angle you need.
- **Auto-generated overview, sections, glossary, mermaid diagram** streamed as
  they're generated.
- **Mermaid diagrams on demand** — ask for "the training loop" or "the data
  flow" and get a custom flowchart.
- **Comprehension Q&A** — easy / medium / hard questions with model answers.
- **Spaced-repetition flashcards** — AI generates self-rating cards you can
  drill.
- **Page-anchored notes** — capture thoughts tied to specific pages. Highlights
  can be saved as notes with one click.

### Discovery
- **Cross-library search** — full-text search across every paper you own, with
  highlighted snippets in a top-bar dropdown.
- **AI auto-tagging** — the model extracts field, method, year, and 3-6
  keywords; filter your library by any of them.
- **Compare papers** — pick up to 4 papers, optionally focus the comparison,
  and get a markdown table + structured analysis.

### Chat & selection
- **Paper-grounded chat** — every answer cites the paper. History is persisted
  in the database.
- **Selection popup** — highlight any passage and get an in-context
  explanation. Save it as a note in one click.

### Account
- **Login system** — email + password, bcrypt-hashed, signed JWT session cookie.
- **Dashboard** — your saved papers, **max 5 per user**, with stats (total
  pages, fields, years covered) and tag/field filters.
- **Per-user Ollama API key** — pasted in Settings, stored **AES-256-GCM
  encrypted** at rest, decrypted only server-side at request time. The key
  never reaches the browser. A built-in "Test connection" button verifies
  the key against the model.
- **Caching** — every analysis (`overview`, `glossary`, `questions`,
  `summary_mode`, etc.) is cached per paper + per options, so re-opening a
  paper is instant.
- **Ollama SDK** — the official `ollama` npm package is used server-side (no raw
  `fetch`), pointed at Ollama Cloud (`https://ollama.com`) via a Bearer header.
- **Postgres** via Prisma. Raw PDF bytes are stored in the database; extracted
  text is cached so compare/tag/chat don't re-parse the PDF.

## Stack

Next.js 14 (App Router) · Prisma · PostgreSQL · `ollama` SDK · `jose` (JWT) ·
`bcryptjs` · pdf.js + mermaid + KaTeX (loaded client-side from CDN).

## Architecture

```
Browser ──▶ /api/auth/*        register / login / logout / me (bcrypt + JWT cookie)
        ──▶ /api/papers       list / upload (5-paper cap) — PDF bytes in Postgres
        ──▶ /api/papers/:id/file     streams the stored PDF (owner-only)
        ──▶ /api/papers/:id          PATCH level / title / tags / field / method / year / textCache
        ──▶ /api/papers/:id/notes    GET / POST / PATCH / DELETE page-anchored notes
        ──▶ /api/papers/:id/flashcards  GET / POST generate / PATCH mastery (SRS)
        ──▶ /api/papers/:id/tag      POST — AI auto-tagging
        ──▶ /api/search?q=…          GET — cross-library full-text search
        ──▶ /api/compare             POST — side-by-side paper comparison
        ──▶ /api/settings            get/put model+host, encrypt & store API key
        ──▶ /api/explain?cache=1     decrypts key → Ollama SDK → streamed explanation
                                     (writes back to the analysis cache on success)
        ──▶ /api/chat                streamed conversational Q&A, persists history
```

The key is only ever decrypted inside `/api/explain`, `/api/chat`,
`/api/compare`, `/api/papers/:id/flashcards`, and `/api/papers/:id/tag`.

## Local development

1. Install deps:
   ```bash
   npm install
   ```
2. Create `.env` from the example and generate secrets:
   ```bash
   cp .env.example .env
   npm run keygen   # prints ENCRYPTION_KEY and AUTH_SECRET — paste into .env
   ```
   Point `DATABASE_URL` at a local Postgres (or a Railway DB).
3. Create the schema:
   ```bash
   npm run db:push
   ```
4. Run it:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000, register, add your Ollama key in **Settings**,
   then upload a paper.

## Deploy to Railway

1. Push this repo to GitHub.
2. In Railway: **New Project → Deploy from GitHub repo** (select this repo).
3. **Add a Postgres database** to the project (Railway injects `DATABASE_URL`).
4. On the app service, set environment variables:
   - `AUTH_SECRET` — from `npm run keygen`
   - `ENCRYPTION_KEY` — from `npm run keygen` (64 hex chars; **do not rotate** or
     stored keys become undecryptable)
   - `MAX_PDF_MB` — optional, defaults to `8`
   Railway already provides `DATABASE_URL` and `PORT`.
5. Deploy. The build runs `prisma generate && next build`; startup runs
   `prisma db push` (creates/syncs the tables from `schema.prisma`) then
   `next start`.

> `prisma db push` is used instead of migrations so a fresh database is set up
> automatically on first boot with no migration files to manage. If you later
> want versioned migrations, run `npx prisma migrate dev --name init` locally,
> commit `prisma/migrations/`, and switch the `start` script back to
> `prisma migrate deploy`.

## Getting an Ollama API key

Create one at https://ollama.com (Settings → Keys). Paste it into PaperLens
**Settings**. Cloud models used: gpt-oss 120B, Kimi K2, DeepSeek V3.1,
Qwen3-Coder.

## A note on extraction

Paper text is extracted client-side with `pdf.js` (no server roundtrip) and
cached server-side as a single string per paper. The first time you open a
paper, the AI runs are kicked off automatically; subsequent visits hit the
analysis cache.
