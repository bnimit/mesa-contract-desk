# Mesa Contract Desk

A demo where three AI attorneys independently redline a contract on separate [Mesa](https://mesa.dev) branches, each using a different negotiation posture. You review their proposals, pick one, and approve or reject each clause through a human-in-the-loop gate. Every decision is preserved immutably in an audit trail.

Built to showcase how Mesa enables multi-agent workflows with branching, isolation, human approval gates, and audit trails.

## How It Works

```
                         ┌─────────────┐
                         │    main     │
                         │ contract.json │
                         └──────┬──────┘
                                │
                     ┌──────────┼──────────┐
                     │          │          │
                fork │     fork │     fork │
                     ▼          ▼          ▼
            ┌──────────┐ ┌──────────┐ ┌──────────┐
            │Aggressive │ │ Balanced  │ │  Minimal  │
            │  branch   │ │  branch   │ │  branch   │
            └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
                  │             │             │
           Claude │      Claude │      Claude │
           Haiku  │      Haiku  │      Haiku  │
                  ▼             ▼             ▼
            ┌──────────┐ ┌──────────┐ ┌──────────┐
            │ Push hard │ │  Fair &   │ │  Highest- │
            │ flip terms│ │  mutual   │ │  impact   │
            │ strip data│ │  caps     │ │  only     │
            └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
                  │             │             │
                  └──────┬──────┘──────┬──────┘
                         │             │
                  Pick a strategy to review
                         │
                  Clause-by-clause approval gate
                  (approve / reject / roll back)
                         │
                         ▼
                  ┌─────────────┐
                  │    main     │  ← merged contract
                  │  audit log  │  ← every decision on record
                  └─────────────┘
```

### The Review Cycle

1. **Swarm** — Three attorneys fork the contract on separate Mesa branches, each proposing 2–5 clause edits from their posture
2. **Pick** — The UI shows all three strategies side-by-side; you choose one to take into approval
3. **Approval gate** — Each pending edit is presented one at a time; you approve or reject; approved edits accumulate on the contract live
4. **Rollback** — Any approved edit can be superseded (append-only rollback, not destructive), restoring the previous clause state
5. **Merge** — Once done, the review branch merges to `main` and the audit log is committed alongside the final contract
6. **Resume** — The active review is persisted; reload the page and the gate resumes from exact state

### What Mesa Provides

| Capability | How it's used |
|---|---|
| **Branching** | Each attorney works on an isolated branch — no interference between postures |
| **Resume** | `active-review.json` on `main` tracks the pointer; reloading resumes from exact state |
| **Rollback** | Append-only supersede — rolled-back edits are logged, not destroyed |
| **Merge** | Approved contract merges cleanly to `main` with full change history |
| **Audit trail** | Every approve/reject/rollback event is committed to `audit-log.json` |
| **History** | Mesa change log preserves every operation for later inspection |

## Attorney Postures

| Posture | Approach | Typical edits |
|---|---|---|
| **Aggressive** `▲` | Maximum protection for the Customer | Tight liability caps, flip one-sided terms, strip vendor data rights, remove auto-renewal |
| **Balanced** `◆` | Fair, market-standard terms | Mutual caps, standard carve-outs, sensible security obligations |
| **Minimal** `●` | Highest-impact changes only | Two or three must-have fixes; leave everything else to speed signing |

## Quick Start

```bash
npm install
npm run dev
```

Open **http://localhost:4000**

On first launch, the app prompts you to add your **Anthropic API key** in the Settings panel. No `.env` file needed — keys are encrypted and stored locally in a SQLite database (`.mesa/config.db`).

Optionally add a **Mesa API key** to switch from the local filesystem backend to Mesa's cloud API (`api.mesa.dev`) for real versioned storage with sub-50ms reads and a full audit trail backed by Mesa's history.

Without an Anthropic key, the demo runs on canned redlines so you can explore the full approval gate flow immediately.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (React + Tailwind)                                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │ ContractView  │ │ ApprovalGate │ │ Settings Panel       │ │
│  │ (live clauses)│ │ (edit queue) │ │ keys, backends, tags │ │
│  └──────┬───────┘ └──────┬───────┘ └──────────┬───────────┘ │
│         │                │                     │             │
│  ┌──────┴────────────────┴─────────────────────┴──────────┐  │
│  │  SSE (live activity feed — branch ops, agent progress) │  │
│  └────────────────────────┬───────────────────────────────┘  │
└───────────────────────────┼──────────────────────────────────┘
                            │  /api/*
┌───────────────────────────┼──────────────────────────────────┐
│  Express Server           │                                  │
│  ┌────────────────────────┴─────────────────────────────┐    │
│  │ Routes: contract, review/start|pick|approve|reject|  │    │
│  │         rollback|merge|active, audit, settings,      │    │
│  │         reset, changes, repo/tags, webhooks/targets  │    │
│  └──────────────────────┬───────────────────────────────┘    │
│                         │                                    │
│  ┌──────────────────────┼───────────────────────────────┐    │
│  │ MesaService interface                                │    │
│  │ ┌─────────────┐ ┌──────────────┐ ┌──────────────┐   │    │
│  │ │ LocalFsMesa  │ │   SdkMesa    │ │ MountedMesa  │   │    │
│  │ │ (fallback)   │ │  (REST API)  │ │ (fs.mount)   │   │    │
│  │ └─────────────┘ └──────────────┘ └──────────────┘   │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────┐ ┌──────────────────┐ ┌───────────────────┐   │
│  │ Claude API │ │ Review + Gate    │ │ SQLite config.db   │   │
│  │ (redlining)│ │ (approve/reject/ │ │ (encrypted keys)   │   │
│  └────────────┘ │  rollback/merge) │ └───────────────────┘   │
│                 └──────────────────┘                         │
└──────────────────────────────────────────────────────────────┘
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
| **Bookmarks** | `list`, `create`, `delete`, `move`, `merge` | Fork posture branches, merge review to main |
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
| API Keys | — | Not used (keys managed outside the demo) |

## Features

- **Human-in-the-loop approval gate** — clause-by-clause review pauses after each decision; resume from exact state on reload
- **Immutable audit trail** — every approve, reject, and rollback is appended to `audit-log.json` on the review branch, then committed to `main` at merge
- **Append-only rollback** — rolled-back edits are superseded in the log, not deleted; the full decision history is always recoverable
- **Three attorney postures** — Aggressive, Balanced, Minimal — each producing distinct redlines from the same contract
- **Animated branch visualization** — SVG tree animates through fork → review → merge in real time
- **Canned fallback** — full demo flow works without an Anthropic key using pre-baked redlines
- **Live activity feed** — SSE-powered stream of every Mesa operation (branch, write, merge)
- **Three swappable backends** — local filesystem, Mesa REST API, or Mesa fs.mount — switch live in Settings
- **Webhook target management** — register, list, and delete webhook endpoints from Settings
- **Repository tags** — key-value metadata on the Mesa repo, editable from Settings
- **Zero-config setup** — API keys entered in UI, encrypted in local SQLite, no .env needed
- **Demo reset** — clear all review history and start fresh from Settings

## Tech Stack

React, Vite, Tailwind CSS v4, Node.js, Express, Claude Haiku, Mesa SDK, better-sqlite3
