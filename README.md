# Mesa Portfolio Advisor

A demo web app where three AI agents independently analyze a stock portfolio on separate [Mesa](https://mesa.dev) branches. Each agent uses a different strategy (fundamentals, sentiment, technical analysis), and you pick the winning proposal to merge.

Built to showcase Mesa's versioned filesystem for multi-agent workflows.

## Quick Start

```bash
npm install
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env

# Terminal 1: start the backend
npm run dev:server

# Terminal 2: start the frontend
npm run dev:client
```

Open http://localhost:5173

## How It Works

1. Your portfolio lives as a JSON file on Mesa's `main` branch
2. Click "Run Analysis" — three agents each get their own Mesa branch
3. Each agent fetches real market data, analyzes with Claude, and proposes trades
4. Review all three proposals side-by-side
5. Accept one — it merges back to `main`

## Agents

- **Fundamentals** — P/E ratios, revenue growth, intrinsic value
- **Sentiment** — News headlines, market buzz
- **Technical** — Moving averages, momentum, price trends

## Tech Stack

React, Vite, Tailwind CSS, Node.js, Express, Claude API, Yahoo Finance, Mesa SDK
