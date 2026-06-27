# Mesa Contract Review Platform

A multi-department contract review platform powered by [Mesa](https://mesa.dev) branches. Upload a contract (or pick a built-in sample — an **IT Services Agreement** or an **AI Infrastructure Usage Agreement**), choose 2–4 department reviewers, watch them redline **in parallel** on isolated Mesa branches, then cherry-pick the best edit per clause and merge to a clean v2 — with a full department audit trail.

Built to showcase how Mesa enables multi-agent workflows: many specialists editing one document at the same time on isolated branches, merged conflict-free, with cherry-picking and an immutable audit log.

## How It Works

```
  ┌───────────────────────┐
  │  Upload / Sample Pick │  PDF, DOCX, or TXT — or a built-in sample
  └───────────┬───────────┘
              │
  ┌───────────▼───────────┐
  │  Choose Reviewers     │  2–4 department personas
  └───────────┬───────────┘
              │
     ┌────────┼────────┐
     │        │        │
     ▼        ▼        ▼
  Legal    Finance  Security  (up to 4 — Commercial, Privacy also available)
  branch   branch   branch
     │        │        │
   Claude  Claude  Claude    ← each with a distinct negotiation posture
     │        │        │
     └────────┼────────┘
              │
  ┌───────────▼───────────┐
  │  Cherry-Pick Review   │  Pick the best edit per clause across reviewers
  └───────────┬───────────┘
              │
  ┌───────────▼───────────┐
  │  Merge to v2          │  Clean contract + department audit trail on main
  └───────────────────────┘
```

### The Review Cycle

1. **Intake** — Upload a PDF, DOCX, or TXT contract, or pick a built-in sample (IT Services Agreement or AI Infrastructure Usage Agreement)
2. **Roster** — Choose 2–4 department reviewers; each gets a Mesa branch and a prompt scoped to the clauses in its domain
3. **Parallel redline** — Reviewers fork and run concurrently (`Promise.all`) on isolated branches, proposing edits at the clause level; on a shared clause like Liability, two teams propose competing edits
4. **Cherry-pick** — For each clause with competing edits, pick the best suggestion (or keep the original)
5. **Merge** — Accepted edits are merged to `main` to produce a clean v2 alongside a department-labelled audit trail
6. **Resume** — Active review state is persisted; reload and the cherry-pick session resumes from exact state

### Offline / Key Matrix

| Scenario | Anthropic key needed? |
|---|---|
| Either built-in sample (IT Services / AI Infrastructure) + Legal, Finance, Security (core-3) | **No** — canned redlines run offline |
| An uploaded contract, or the Commercial / Privacy reviewers | **Yes** — live Claude calls |

### Department Personas

| Persona | Focus | Typical edits |
|---|---|---|
| **Legal** | Contractual risk & liability | Cap limits, indemnity scope, governing law |
| **Finance** | Payment & cost exposure | Payment terms, audit rights, FX provisions |
| **Security** | Data & compliance | Data handling, breach notification, security standards |
| **Commercial** | Deal economics | Pricing, renewal terms, SLA credits |
| **Privacy** | Data protection & regulatory | GDPR/CCPA obligations, data retention, sub-processors |

## Quick Start

```bash
npm install
npm run dev
```

Then open **http://localhost:4000** (the port Vite prints). `npm run dev` starts both the Express API (`:3001`) and the Vite client on `:4000`, which proxies `/api/*` to it.

On first launch you can immediately review either built-in sample with the three core reviewers (Legal, Finance, Security) — no API key required. To upload your own contract or use the Commercial / Privacy reviewers, add your **Anthropic API key** in the Settings panel (uploads are segmented into clauses by Claude). No `.env` file needed — keys are encrypted and stored locally in a SQLite database (`.mesa/config.db`).

Optionally add a **Mesa API key** to switch from the local filesystem backend to Mesa's cloud API (`api.mesa.dev`) for real versioned storage with sub-50ms reads and a full audit trail backed by Mesa's history.

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  Browser (React + Tailwind)                                    │
│  ┌──────────────┐  ┌─────────────────┐  ┌────────────────┐     │
│  │ IntakePanel  │  │ CherryPickReview│  │ Settings Panel │     │
│  │ upload/sample│  │ clause editor   │  │ keys, backends │     │
│  └──────────────┘  └─────────────────┘  └────────────────┘     │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ SSE — live activity feed (branch ops, agent progress)  │    │
│  └────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────┘
                                │  /api/*
┌────────────────────────────────────────────────────────────────┐
│  Express Server                                                │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Routes: intake/upload, review/start|cherry-pick|       │    │
│  │         merge|active, audit, settings, reset,          │    │
│  │         changes, repo/tags, webhooks/targets           │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ MesaService interface                                  │    │
│  │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │    │
│  │ │ LocalFsMesa  │ │ SdkMesa      │ │ MountedMesa  │     │    │
│  │ │ (fallback)   │ │ (REST API)   │ │ (fs.mount)   │     │    │
│  │ └──────────────┘ └──────────────┘ └──────────────┘     │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                │
│  ┌──────────────┐  ┌─────────────────┐  ┌──────────────────┐   │
│  │ Claude API   │  │ Review Engine   │  │ SQLite config.db │   │
│  │ (redlining)  │  │ (cherry-pick /  │  │ (encrypted keys) │   │
│  └──────────────┘  │  merge / audit) │  └──────────────────┘   │
│                    └─────────────────┘                         │
└────────────────────────────────────────────────────────────────┘
```

### Three Backends

The entire app runs through a single `MesaService` interface — `readFile`, `writeFile`, `createBranch`, `mergeBranch`, `deleteBranch`, `getDiff`, etc. Three implementations exist:

- **LocalFsMesa** — Simulates branches with directories on disk. Fully functional, zero dependencies.
- **SdkMesa** — Real Mesa REST API. Bookmarks = branches, changes = commits, content API for reads/writes, diffs API for comparisons.
- **MountedMesa** — Mesa's native NAPI filesystem (`MesaFileSystem`). Same cloud storage as SdkMesa, but accessed through a POSIX-style interface via `fs.mount`. Uses `change.edit()` to switch branch context.

Switching backends in Settings takes effect immediately — no code changes, no restart.

## Mesa SDK Parity

How much of the Mesa SDK (`@mesadev/sdk` v0.28.2) this demo exercises:

| SDK Resource | Methods Used | Where in Demo |
|---|---|---|
| **Repos** | `get`, `create`, `delete`, `update` | Init, reset, repo tags |
| **Bookmarks** | `list`, `create`, `delete`, `move`, `merge` | Fork reviewer branches, merge to main |
| **Changes** | `list`, `create`, `get` | Write files, audit log, change history |
| **Content** | `get` (file + directory) | Read contract, read review state |
| **Diffs** | `get` | Compare redline branch vs main |
| **Webhook Targets** | `list`, `create`, `delete` | Settings panel CRUD |
| **Webhooks** | `on`, `receive` | Inbound webhook events → activity feed |
| **fs.mount** | `MesaFileSystem.create` | Third backend (`MountedMesa`) |
| **fs.mount / change** | `change.edit`, `change.current` | Branch switching in mounted filesystem |
| **fs.mount / bookmark** | `bookmark.list` | List bookmarks via filesystem API |
| **Org** | `resolveOrg` | Resolve org slug on init |
| **Auth** | `whoami` | Validate API key, show connection info |

## Features

- **Multi-department review** — up to 4 department personas redline the same contract concurrently on isolated Mesa branches
- **Flexible intake** — upload PDF, DOCX, or TXT (segmented into clauses by Claude); or start immediately with a built-in sample
- **Cherry-pick per clause** — compare all reviewer suggestions side-by-side and choose the best edit for each clause; "Start over" returns you to intake at any time
- **Offline demo mode** — either built-in sample + Legal/Finance/Security runs entirely on canned redlines; no Anthropic key needed
- **Immutable audit trail** — every accepted edit is appended to `audit-log.json` with department and timestamp, committed to `main` at merge
- **Animated branch visualization** — SVG tree animates through fork → review → cherry-pick → merge in real time
- **Live activity feed** — SSE-powered stream of every Mesa operation (branch, write, merge)
- **Three swappable backends** — local filesystem, Mesa REST API, or Mesa fs.mount — switch live in Settings
- **Webhook target management** — register, list, and delete webhook endpoints from Settings
- **Repository tags** — key-value metadata on the Mesa repo, editable from Settings
- **Zero-config setup** — API keys entered in UI, encrypted in local SQLite, no .env needed
- **Demo reset** — clear all review history and start fresh from Settings

## Tech Stack

React, Vite, Tailwind CSS v4, Node.js, Express, Claude Haiku, Mesa SDK, better-sqlite3, pdf-parse, mammoth, multer
