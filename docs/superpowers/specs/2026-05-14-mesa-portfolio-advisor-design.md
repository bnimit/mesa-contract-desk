# Mesa Portfolio Advisor — Design Spec

## Overview

A web app where three AI agents independently analyze a stock portfolio using real market data, each proposing changes on a separate Mesa branch. The user reviews all three proposals side-by-side and merges the winning strategy.

The goal is twofold: build a useful demo that showcases Mesa's versioned filesystem for multi-agent workflows, and write a blog post about the experience to share with the Mesa team.

## Architecture

```
┌─────────────┐
│   Web App    │  (React frontend)
│  Dashboard   │
└──────┬───────┘
       │
┌──────┴───────┐
│  Backend API │  (Node.js + Express)
└──┬───┬───┬───┘
   │   │   │
   ▼   ▼   ▼
 ┌───┐┌───┐┌───┐
 │ F ││ S ││ T │   ← 3 agents, each on its own Mesa branch
 └─┬─┘└─┬─┘└─┬─┘
   │    │    │
   ▼    ▼    ▼
 ┌─────────────┐
 │  Mesa SDK   │  (versioned filesystem)
 │  branches:  │
 │  main/      │  ← current portfolio (JSON)
 │  agent/fund │  ← fundamentals proposal
 │  agent/sent │  ← sentiment proposal
 │  agent/tech │  ← technical proposal
 └─────────────┘
       │
   ┌───┴───┐
   │ Yahoo  │  (real market data)
   │Finance │
   └───────┘
```

## Agents

### 1. Fundamentals Agent

- Fetches earnings data, P/E ratios, revenue growth for each stock in the portfolio
- Suggests buy/sell/hold based on whether stocks are undervalued or overvalued relative to fundamentals
- Writes modified portfolio JSON + reasoning to its Mesa branch (`agent/fundamentals`)

### 2. Sentiment Agent

- Fetches recent news headlines for each stock
- Analyzes positive/negative sentiment and urgency
- Suggests trades based on news momentum
- Writes modified portfolio JSON + reasoning to its Mesa branch (`agent/sentiment`)

### 3. Technical Agent

- Fetches historical price data (30-90 day window)
- Analyzes simple moving averages, momentum, and recent price trends
- Suggests trades based on technical signals
- Writes modified portfolio JSON + reasoning to its Mesa branch (`agent/technical`)

## Data Model

### Portfolio file (`portfolio.json` on Mesa)

```json
{
  "portfolio": [
    { "ticker": "AAPL", "shares": 10, "avgCost": 185.50 },
    { "ticker": "NVDA", "shares": 5, "avgCost": 890.00 },
    { "ticker": "MSFT", "shares": 8, "avgCost": 410.25 },
    { "ticker": "GOOGL", "shares": 12, "avgCost": 165.00 },
    { "ticker": "AMZN", "shares": 6, "avgCost": 195.75 }
  ],
  "cash": 5000.00,
  "lastUpdated": "2026-05-14"
}
```

### Agent proposal file (`reasoning.md` on each agent branch)

Each agent writes a markdown file alongside the modified portfolio explaining:
- What changes it made and why
- Key data points that drove the decision
- Confidence level (high/medium/low) for each recommendation

## User Flow

1. User opens the app and sees the current portfolio with live prices
2. User clicks "Run Analysis"
3. Backend creates three Mesa branches from `main` and kicks off all agents in parallel
4. UI shows a loading state with progress per agent
5. When all agents complete, the dashboard shows three columns side-by-side:
   - Agent name and strategy summary
   - Proposed changes (buy X, sell Y, hold Z) with reasoning
   - Projected portfolio value after changes
6. User clicks "Accept" on one agent's proposal
7. Backend merges that agent branch into `main`
8. Portfolio updates and the cycle can repeat

## Tech Stack

- **Frontend:** React + Vite
- **Backend:** Node.js + Express
- **AI:** Claude API (Haiku for speed/cost, Sonnet for quality — configurable)
- **Market data:** Yahoo Finance API (free, no API key required)
- **Versioned storage:** Mesa SDK (`@mesadev/sdk`)
- **Styling:** Tailwind CSS

## API Endpoints

### `GET /api/portfolio`
Returns the current portfolio from Mesa `main` branch with live price data.

### `POST /api/analyze`
Triggers all three agents. Creates Mesa branches, runs analysis, returns when all complete.

Response includes each agent's proposed portfolio and reasoning.

### `POST /api/merge`
Accepts a body `{ "branch": "agent/fundamentals" }` and merges that branch into `main`.

### `GET /api/history`
Returns past analysis rounds from Mesa version history.

## Project Structure

```
mesa-portfolio-advisor/
├── client/                # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── Portfolio.tsx
│   │   │   ├── AgentCard.tsx
│   │   │   ├── ComparisonView.tsx
│   │   │   └── MergeButton.tsx
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── index.html
├── server/                # Express backend
│   ├── agents/
│   │   ├── fundamentals.ts
│   │   ├── sentiment.ts
│   │   └── technical.ts
│   ├── services/
│   │   ├── mesa.ts        # Mesa SDK wrapper
│   │   ├── market.ts      # Yahoo Finance client
│   │   └── claude.ts      # Claude API client
│   ├── routes/
│   │   └── api.ts
│   └── index.ts
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## What This Showcases About Mesa

- **Branching as a core UX pattern** — each agent gets an isolated workspace
- **Concurrent writes** — three agents writing to the same repo simultaneously without conflicts
- **Merge workflow** — user reviews and merges the winning branch
- **Version history** — past analysis rounds are preserved and browsable
- **Agent attribution** — each change is tied to a specific agent (agentblame)

## Out of Scope (for v1)

- User authentication
- Real brokerage integration
- Custom portfolio editing in the UI (start with a hardcoded demo portfolio)
- More than three agents
- Agent-to-agent communication (they work independently)
