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
4. **Compare** — The UI shows all three proposals side-by-side with Mesa diffs
5. **Merge** — You pick one strategy; its portfolio merges to `main`, all agents' playbook entries merge (so every agent learns from every round)
6. **Replay** — Any past round can be replayed from its snapshot branch

### What Mesa Provides

| Capability | How it's used |
|---|---|
| **Branching** | Each agent works on an isolated branch — no interference |
| **Merge** | Winning strategy's portfolio merges cleanly to main |
| **History** | Every round creates a snapshot branch for replay |
| **Diffs** | Real file-level diffs show exactly what each agent changed |
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
│  │ Portfolio     │ │ Comparison   │ │ Settings Panel       │ │
│  │ display       │ │ cards + diffs│ │ API keys, backend    │ │
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
│  │ Routes: analyze, merge, replay, settings, reset      │    │
│  └──────────────────────┬───────────────────────────────┘    │
│                         │                                    │
│  ┌──────────────────────┼───────────────────────────────┐    │
│  │ MesaService interface                                │    │
│  │ ┌─────────────┐  ┌──────────────┐                    │    │
│  │ │  LocalFsMesa │  │   SdkMesa    │ ← swappable       │    │
│  │ │ (fallback)   │  │ (Mesa API)   │   at runtime       │    │
│  │ └─────────────┘  └──────────────┘                    │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────┐ ┌─────────────┐ ┌───────────────────┐       │
│  │ Claude API │ │Yahoo Finance│ │ SQLite config.db   │       │
│  │ (agents)   │ │(market data)│ │ (encrypted keys)   │       │
│  └────────────┘ └─────────────┘ └───────────────────┘       │
└──────────────────────────────────────────────────────────────┘
```

### Backend Swapping

The entire app runs through a single `MesaService` interface — `readFile`, `writeFile`, `createBranch`, `mergeBranch`, `deleteBranch`, `getDiff`, etc. Two implementations exist:

- **LocalFsMesa** — Simulates branches with directories on disk. Fully functional, zero dependencies.
- **SdkMesa** — Real Mesa API. Bookmarks = branches, changes = commits, content API for reads/writes, diffs API for comparisons.

Adding a Mesa API key in Settings switches the backend at runtime. No code changes, no restart.

## Features

- **Three competing AI agents** with distinct strategies and real market data
- **Shared playbook** — agents read each other's past reasoning and improve over time
- **Live activity feed** — SSE-powered stream of every Mesa operation (branch, write, merge)
- **Real diffs** — file-level diffs showing exactly what each agent changed
- **Replay** — re-run any past analysis round from its snapshot
- **Zero-config setup** — API keys entered in UI, encrypted in local SQLite, no .env needed
- **Demo reset** — clear all history and start fresh from Settings
- **Webhook support** — Mesa webhooks feed external activity into the live feed

## Tech Stack

React, Vite, Tailwind CSS v4, Node.js, Express, Claude Haiku, Yahoo Finance, Mesa SDK, better-sqlite3
