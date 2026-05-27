# Mesa Portfolio Advisor

A demo where three AI agents independently analyze a stock portfolio on separate [Mesa](https://mesa.dev) branches, each using a different strategy. You review their proposals side-by-side and pick the winner to merge — all on a versioned filesystem.

Built to showcase how Mesa enables multi-agent workflows with branching, isolation, and audit trails.

## How It Works

```
                         ┌─────────────┐
                         │    main     │
                         │ portfolio.json │
                         │ playbook.md │
                         └──────┬──────┘
                                │
                     ┌──────────┼──────────┐
                     │          │          │
                fork │     fork │     fork │
                     ▼          ▼          ▼
            ┌──────────┐ ┌──────────┐ ┌──────────┐
            │Fundamentals│ │ Sentiment │ │ Technical │
            │  branch   │ │  branch   │ │  branch   │
            └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
                  │             │             │
           Claude │      Claude │      Claude │
           Haiku  │      Haiku  │      Haiku  │
                  ▼             ▼             ▼
            ┌──────────┐ ┌──────────┐ ┌──────────┐
            │  P/E &    │ │  News &   │ │  SMA &    │
            │  revenue  │ │  headlines│ │  momentum │
            │  analysis │ │  analysis │ │  analysis │
            └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
                  │             │             │
                  └──────┬──────┘──────┬──────┘
                         │             │
                    You review all three
                    proposals side-by-side
                         │
                    Pick a winner
                         │
                         ▼
                  ┌─────────────┐
                  │    main     │  ← merged portfolio
                  │ playbook.md │  ← all agents' entries
                  └─────────────┘
```

### The Analysis Cycle

1. **Fork** — Each agent gets its own Mesa branch forked from `main`
2. **Analyze** — Agents fetch live market data (Yahoo Finance) and reason with Claude Haiku
3. **Write** — Each agent writes proposed trades to `portfolio.json` and observations to `playbook.md` on its branch
4. **Compare** — The UI shows all three proposals side-by-side as compact trade bullets
5. **Merge** — You pick one strategy; its portfolio merges to `main`, all agents' playbook entries merge (so every agent learns from every round)
6. **Replay** — Browse any past round's original proposals with the chosen strategy highlighted (no LLM re-call)

### What Mesa Provides

| Capability | How it's used |
|---|---|
| **Branching** | Each agent works on an isolated branch — no interference |
| **Merge** | Winning strategy's portfolio merges cleanly to main |
| **History** | Every round's proposals are stored for instant replay |
| **Snapshots** | Each round snapshots `main` so the full state is recoverable |
| **Audit trail** | The shared playbook accumulates reasoning across rounds |

## Agents

| Agent | Lens | Signals | Style |
|---|---|---|---|
| **Fundamentals** `◆` | Value investing | P/E ratios, revenue growth, intrinsic value | Patient, Buffett-style |
| **Sentiment** `●` | Market narrative | News headlines, crowd psychology, momentum | Fast, reactive |
| **Technical** `▲` | Chart patterns | 20/50-day SMA, 5-day momentum, price ranges | Trend-following |

Each agent reads the shared **playbook** before acting — a Markdown file on Mesa's `main` branch where all agents log observations, reasoning, and confidence levels. Over multiple rounds, they reference their own (and each other's) past entries to refine their approach.

## Quick Start

```bash
npm install
npm run dev
```

Open **http://localhost:4000**

On first launch, the app prompts you to add your **Anthropic API key** in the Settings panel. No `.env` file needed — keys are encrypted and stored locally in a SQLite database (`.mesa/config.db`).

Optionally add a **Mesa API key** to switch from the local filesystem backend to Mesa's cloud API (`api.mesa.dev`) for real versioned storage with sub-50ms reads and full audit trail.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (React + Tailwind)                                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │ Portfolio     │ │ Branch viz + │ │ Settings Panel       │ │
│  │ display       │ │ agent cards  │ │ keys, backends, tags │ │
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
│  │ Routes: analyze, merge, replay, settings, reset,     │    │
│  │         changes, repo/tags, webhooks/targets          │    │
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
│  ┌────────────┐ ┌─────────────┐ ┌───────────────────┐       │
│  │ Claude API │ │Yahoo Finance│ │ SQLite config.db   │       │
│  │ (agents)   │ │(market data)│ │ (encrypted keys)   │       │
│  └────────────┘ └─────────────┘ └───────────────────┘       │
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
| **Bookmarks** | `list`, `create`, `delete`, `move`, `merge` | Fork, merge, delete branches |
| **Changes** | `list`, `create`, `get` | Write files, commit history, change timeline |
| **Content** | `get` (file + directory) | Read files, list directory entries |
| **Diffs** | `get` | Compare agent branch vs main |
| **Webhook Targets** | `list`, `create`, `delete` | Settings panel CRUD |
| **Webhooks** | `on`, `receive` | Inbound webhook events → activity feed |
| **fs.mount** | `MesaFileSystem.create` | Third backend (`MountedMesa`) |
| **fs.mount / change** | `change.edit`, `change.current` | Branch switching in mounted filesystem |
| **fs.mount / bookmark** | `bookmark.list` | List bookmarks via filesystem API |
| **Org** | `resolveOrg` | Resolve org slug on init |
| **Auth** | `whoami` | Validate API key, show connection info |
| API Keys | — | Not used (keys managed outside the demo) |
| Repo tag bulk update | — | Not used (single-repo demo) |

## Features

- **Animated branch visualization** — SVG tree animates through fork → analyze → merge in real time
- **Three competing AI agents** with distinct strategies and real market data
- **Shared playbook** — agents read each other's past reasoning and improve over time
- **Compact proposal cards** — trade bullets in plain English, portfolio impact at a glance
- **True replay** — instantly view any past round's original proposals with the chosen strategy highlighted
- **Live activity feed** — SSE-powered stream of every Mesa operation (branch, write, merge)
- **Change timeline** — full Mesa commit log with expandable change details (hash, author, timestamp)
- **Three swappable backends** — local filesystem, Mesa REST API, or Mesa fs.mount — switch live in Settings
- **Webhook target management** — register, list, and delete webhook endpoints from Settings
- **Repository tags** — key-value metadata on the Mesa repo, editable from Settings
- **Zero-config setup** — API keys entered in UI, encrypted in local SQLite, no .env needed
- **Demo reset** — clear all history and start fresh from Settings

## Tech Stack

React, Vite, Tailwind CSS v4, Node.js, Express, Claude Haiku, Yahoo Finance, Mesa SDK, better-sqlite3
