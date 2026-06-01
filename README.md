# PaperLens

A full-stack research-paper explainer. Upload a PDF, pick a comprehension level
(High School → Researcher), and get an Ollama-powered overview, section
breakdown, Mermaid architecture diagram, and glossary — plus inline "explain this
selection" on any highlighted passage.

## Features

- **Login system** — email + password, bcrypt-hashed, signed JWT session cookie.
- **Dashboard** — your saved papers, **max 5 per user**.
- **Per-user Ollama API key** — pasted in Settings, stored **AES-256-GCM
  encrypted** at rest, decrypted only server-side at request time. The key never
  reaches the browser.
- **Ollama SDK** — the official `ollama` npm package is used server-side (no raw
  `fetch`), pointed at Ollama Cloud (`https://ollama.com`) via a Bearer header.
- **Postgres** via Prisma. Raw PDF bytes are stored in the database.

## Stack

Next.js 14 (App Router) · Prisma · PostgreSQL · `ollama` SDK · `jose` (JWT) ·
`bcryptjs` · pdf.js + mermaid (loaded client-side from CDN).

## Architecture

```
Browser ──▶ /api/auth/*      register / login / logout (bcrypt + JWT cookie)
        ──▶ /api/papers       list / upload (5-paper cap) — PDF bytes in Postgres
        ──▶ /api/papers/:id/file   streams the stored PDF (owner-only)
        ──▶ /api/settings     get/put model+host, encrypt & store API key
        ──▶ /api/explain      decrypts key → Ollama SDK → returns explanation
```

The key is only ever decrypted inside `/api/explain` and `src/lib/crypto.js`.

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
