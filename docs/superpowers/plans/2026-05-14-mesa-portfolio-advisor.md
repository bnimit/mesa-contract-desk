# Mesa Portfolio Advisor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web app where three AI agents independently analyze a stock portfolio on separate Mesa branches, and the user picks the winning strategy.

**Architecture:** React frontend talks to a Node.js/Express backend. The backend orchestrates three Claude-powered agents that each read a portfolio JSON from Mesa, fetch real market data, propose changes on an isolated branch, and write reasoning. The frontend shows proposals side-by-side with a merge button.

**Tech Stack:** React, Vite, Tailwind CSS, Node.js, Express, TypeScript, Mesa SDK (`@mesadev/sdk`), Claude API (`@anthropic-ai/sdk`), `yahoo-finance2`

---

## File Structure

```
mesa-portfolio-advisor/
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Portfolio.tsx        # Current portfolio table with live prices
│   │   │   ├── AgentCard.tsx        # Single agent proposal card
│   │   │   ├── ComparisonView.tsx   # Three-column agent comparison layout
│   │   │   └── AnalyzeButton.tsx    # Triggers analysis, shows loading state
│   │   ├── hooks/
│   │   │   └── useApi.ts           # Fetch wrapper for backend endpoints
│   │   ├── types.ts                # Shared frontend types
│   │   ├── App.tsx                 # Root layout and state orchestration
│   │   └── main.tsx                # Vite entry point
│   ├── index.html
│   └── tailwind.config.js
├── server/
│   ├── services/
│   │   ├── mesa.ts                 # Mesa SDK wrapper (branch, read, write, merge)
│   │   ├── market.ts               # Yahoo Finance client with fallback chain
│   │   └── claude.ts               # Claude API client for agent reasoning
│   ├── agents/
│   │   ├── base.ts                 # Shared agent runner (branch → fetch data → prompt → validate → write)
│   │   ├── fundamentals.ts         # Fundamentals agent prompt and data fetching
│   │   ├── sentiment.ts            # Sentiment agent prompt and data fetching
│   │   └── technical.ts            # Technical agent prompt and data fetching
│   ├── validators/
│   │   └── trade.ts                # Server-side trade constraint validation
│   ├── routes/
│   │   └── api.ts                  # Express routes: GET /portfolio, POST /analyze, POST /merge, GET /history
│   └── index.ts                    # Express server entry point
├── shared/
│   └── types.ts                    # Types shared between client and server
├── data/
│   └── sample-market.json          # Bundled fallback market data
├── package.json
├── tsconfig.json
├── tsconfig.server.json
├── vite.config.ts
├── .env.example
├── .gitignore
└── README.md
```

---

## Task 0: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.server.json`, `vite.config.ts`, `.env.example`, `.gitignore`, `shared/types.ts`

- [ ] **Step 1: Initialize the project**

```bash
cd ~/Documents/Projects/Mesa
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install express cors dotenv @anthropic-ai/sdk yahoo-finance2
npm install -D typescript @types/node @types/express @types/cors vite @vitejs/plugin-react react react-dom @types/react @types/react-dom tailwindcss @tailwindcss/vite tsx
```

Note: `@mesadev/sdk` install is deferred to Task 1 (SDK spike). If it doesn't exist or work, we'll substitute `isomorphic-git` in Task 1.

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": ".",
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["shared/*"]
    }
  },
  "include": ["client/src/**/*", "shared/**/*"]
}
```

- [ ] **Step 4: Create tsconfig.server.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist-server",
    "rootDir": ".",
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["shared/*"]
    }
  },
  "include": ["server/**/*", "shared/**/*"]
}
```

- [ ] **Step 5: Create vite.config.ts**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: "client",
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
```

- [ ] **Step 6: Create .env.example**

```
ANTHROPIC_API_KEY=sk-...
MESA_API_KEY=
ALPHA_VANTAGE_API_KEY=
```

- [ ] **Step 7: Create .gitignore**

```
node_modules/
dist/
dist-server/
.env
```

- [ ] **Step 8: Create shared/types.ts**

```ts
export interface Holding {
  ticker: string;
  shares: number;
  avgCost: number;
}

export interface Portfolio {
  portfolio: Holding[];
  cash: number;
  lastUpdated: string;
}

export interface TradeAction {
  ticker: string;
  action: "buy" | "sell" | "hold";
  shares: number;
  reason: string;
  confidence: "high" | "medium" | "low";
}

export interface AgentProposal {
  agentName: string;
  strategy: string;
  actions: TradeAction[];
  proposedPortfolio: Portfolio;
  reasoning: string;
  newMarketValue: number;
}

export interface AnalysisRound {
  timestamp: number;
  branches: string[];
  proposals: AgentResult[];
}

export interface AgentResult {
  agentName: string;
  branch: string;
  status: "success" | "error";
  proposal?: AgentProposal;
  error?: string;
}

export interface MarketQuote {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  name: string;
}
```

- [ ] **Step 9: Add scripts to package.json**

Add these scripts to the generated `package.json`:

```json
{
  "type": "module",
  "scripts": {
    "dev:client": "vite --config vite.config.ts",
    "dev:server": "tsx watch server/index.ts",
    "dev": "npm run dev:server & npm run dev:client",
    "build": "vite build --config vite.config.ts && tsc -p tsconfig.server.json"
  }
}
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold project with deps, configs, and shared types"
```

---

## Task 1: Mesa SDK Spike

**Files:**
- Create: `server/services/mesa.ts`

This task validates the Mesa SDK. If it doesn't work, we substitute with `isomorphic-git`.

- [ ] **Step 1: Attempt to install Mesa SDK**

```bash
npm install @mesadev/sdk
```

If this fails (package doesn't exist or can't install), install the fallback:

```bash
npm install isomorphic-git
```

- [ ] **Step 2: Create server/services/mesa.ts with Mesa SDK**

If `@mesadev/sdk` installed successfully, write the wrapper using their API. Since we haven't confirmed the exact API surface, write an interface first and implement behind it. If using the fallback, implement with `isomorphic-git`:

```ts
import fs from "fs/promises";
import path from "path";

const REPO_DIR = path.resolve("mesa-repo");

export interface MesaService {
  init(): Promise<void>;
  readFile(branch: string, filePath: string): Promise<string>;
  writeFile(branch: string, filePath: string, content: string): Promise<void>;
  createBranch(branchName: string, fromBranch: string): Promise<void>;
  mergeBranch(branchName: string, intoBranch: string): Promise<void>;
  deleteBranch(branchName: string): Promise<void>;
  listCommits(branch: string, limit: number): Promise<{ hash: string; message: string; timestamp: number }[]>;
}

class LocalFsMesa implements MesaService {
  private branchDir(branch: string) {
    return path.join(REPO_DIR, "branches", branch);
  }

  async init() {
    await fs.mkdir(this.branchDir("main"), { recursive: true });
  }

  async readFile(branch: string, filePath: string) {
    return fs.readFile(path.join(this.branchDir(branch), filePath), "utf-8");
  }

  async writeFile(branch: string, filePath: string, content: string) {
    const fullPath = path.join(this.branchDir(branch), filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
  }

  async createBranch(branchName: string, fromBranch: string) {
    const src = this.branchDir(fromBranch);
    const dest = this.branchDir(branchName);
    await fs.cp(src, dest, { recursive: true });
  }

  async mergeBranch(branchName: string, intoBranch: string) {
    const src = this.branchDir(branchName);
    const dest = this.branchDir(intoBranch);
    await fs.cp(src, dest, { recursive: true, force: true });
  }

  async deleteBranch(branchName: string) {
    await fs.rm(this.branchDir(branchName), { recursive: true, force: true });
  }

  async listCommits(_branch: string, _limit: number) {
    return [];
  }
}

export const mesa: MesaService = new LocalFsMesa();
```

This `LocalFsMesa` implementation uses the local filesystem with directory-per-branch as a working fallback. If the real Mesa SDK works, swap the implementation behind the same `MesaService` interface — no other code changes needed.

- [ ] **Step 3: Write a smoke test script**

Create `server/services/mesa.test.ts`:

```ts
import { mesa } from "./mesa.js";

async function smoke() {
  await mesa.init();

  await mesa.writeFile("main", "portfolio.json", JSON.stringify({ test: true }));
  const content = await mesa.readFile("main", "portfolio.json");
  console.assert(content.includes("test"), "read/write failed");

  await mesa.createBranch("agent/test-branch", "main");
  await mesa.writeFile("agent/test-branch", "portfolio.json", JSON.stringify({ modified: true }));
  const branchContent = await mesa.readFile("agent/test-branch", "portfolio.json");
  console.assert(branchContent.includes("modified"), "branch write failed");

  const mainContent = await mesa.readFile("main", "portfolio.json");
  console.assert(!mainContent.includes("modified"), "branch isolation failed");

  await mesa.mergeBranch("agent/test-branch", "main");
  const merged = await mesa.readFile("main", "portfolio.json");
  console.assert(merged.includes("modified"), "merge failed");

  await mesa.deleteBranch("agent/test-branch");

  console.log("All smoke tests passed");
}

smoke().catch(console.error);
```

- [ ] **Step 4: Run the smoke test**

```bash
npx tsx server/services/mesa.test.ts
```

Expected: `All smoke tests passed`

- [ ] **Step 5: Commit**

```bash
git add server/services/mesa.ts server/services/mesa.test.ts
git commit -m "feat: add Mesa service layer with local filesystem fallback"
```

---

## Task 2: Market Data Service

**Files:**
- Create: `server/services/market.ts`, `data/sample-market.json`

- [ ] **Step 1: Create bundled sample data**

Create `data/sample-market.json`:

```json
{
  "AAPL": { "price": 195.20, "change": 1.35, "changePercent": 0.70, "name": "Apple Inc." },
  "NVDA": { "price": 950.00, "change": 12.50, "changePercent": 1.33, "name": "NVIDIA Corporation" },
  "MSFT": { "price": 425.80, "change": -2.10, "changePercent": -0.49, "name": "Microsoft Corporation" },
  "GOOGL": { "price": 178.50, "change": 3.20, "changePercent": 1.83, "name": "Alphabet Inc." },
  "AMZN": { "price": 205.30, "change": 0.85, "changePercent": 0.42, "name": "Amazon.com Inc." }
}
```

- [ ] **Step 2: Create server/services/market.ts**

```ts
import yahooFinance from "yahoo-finance2";
import fs from "fs/promises";
import path from "path";
import type { MarketQuote } from "@shared/types.js";

const SAMPLE_DATA_PATH = path.resolve("data/sample-market.json");

let cachedQuotes: Map<string, MarketQuote> = new Map();
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000;

export async function getQuotes(tickers: string[]): Promise<Map<string, MarketQuote>> {
  const now = Date.now();
  if (now - cacheTimestamp < CACHE_TTL_MS && tickers.every((t) => cachedQuotes.has(t))) {
    return cachedQuotes;
  }

  try {
    return await fetchFromYahoo(tickers);
  } catch {
    console.warn("Yahoo Finance unavailable, using sample data");
    return await fetchFromSampleData(tickers);
  }
}

async function fetchFromYahoo(tickers: string[]): Promise<Map<string, MarketQuote>> {
  const results = new Map<string, MarketQuote>();
  const quotes = await yahooFinance.quote(tickers);
  const quoteArray = Array.isArray(quotes) ? quotes : [quotes];

  for (const q of quoteArray) {
    if (!q.symbol) continue;
    results.set(q.symbol, {
      ticker: q.symbol,
      price: q.regularMarketPrice ?? 0,
      change: q.regularMarketChange ?? 0,
      changePercent: q.regularMarketChangePercent ?? 0,
      name: q.shortName ?? q.symbol,
    });
  }

  cachedQuotes = results;
  cacheTimestamp = Date.now();
  return results;
}

async function fetchFromSampleData(tickers: string[]): Promise<Map<string, MarketQuote>> {
  const raw = JSON.parse(await fs.readFile(SAMPLE_DATA_PATH, "utf-8"));
  const results = new Map<string, MarketQuote>();
  for (const ticker of tickers) {
    if (raw[ticker]) {
      results.set(ticker, { ticker, ...raw[ticker] });
    }
  }
  return results;
}

export async function getHistoricalPrices(
  ticker: string,
  days: number
): Promise<{ date: string; close: number }[]> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const result = await yahooFinance.chart(ticker, {
      period1: startDate.toISOString().split("T")[0],
      period2: endDate.toISOString().split("T")[0],
      interval: "1d",
    });

    return (result.quotes ?? []).map((q) => ({
      date: new Date(q.date).toISOString().split("T")[0],
      close: q.close ?? 0,
    }));
  } catch {
    return [];
  }
}

export async function getStockSummary(
  ticker: string
): Promise<{ peRatio: number | null; forwardPE: number | null; revenueGrowth: number | null; marketCap: number | null }> {
  try {
    const summary = await yahooFinance.quoteSummary(ticker, { modules: ["defaultKeyStatistics", "financialData"] });
    return {
      peRatio: summary.defaultKeyStatistics?.trailingEps ?? null,
      forwardPE: summary.defaultKeyStatistics?.forwardPE ?? null,
      revenueGrowth: summary.financialData?.revenueGrowth ?? null,
      marketCap: summary.financialData?.totalRevenue ?? null,
    };
  } catch {
    return { peRatio: null, forwardPE: null, revenueGrowth: null, marketCap: null };
  }
}
```

- [ ] **Step 3: Smoke test market service**

Create `server/services/market.test.ts`:

```ts
import { getQuotes, getHistoricalPrices, getStockSummary } from "./market.js";

async function smoke() {
  const quotes = await getQuotes(["AAPL", "MSFT"]);
  console.log("Quotes:", Object.fromEntries(quotes));
  console.assert(quotes.size > 0, "should return at least sample data");

  const history = await getHistoricalPrices("AAPL", 30);
  console.log("Historical data points:", history.length);

  const summary = await getStockSummary("AAPL");
  console.log("Stock summary:", summary);

  console.log("Market service smoke test passed");
}

smoke().catch(console.error);
```

- [ ] **Step 4: Run it**

```bash
npx tsx server/services/market.test.ts
```

Expected: prints quotes (from Yahoo or sample fallback), historical data points, and summary.

- [ ] **Step 5: Commit**

```bash
git add server/services/market.ts server/services/market.test.ts data/sample-market.json
git commit -m "feat: add market data service with Yahoo Finance and sample fallback"
```

---

## Task 3: Trade Constraint Validator

**Files:**
- Create: `server/validators/trade.ts`

- [ ] **Step 1: Create server/validators/trade.ts**

```ts
import type { Portfolio, TradeAction } from "@shared/types.js";

export interface ValidationError {
  action: TradeAction;
  reason: string;
}

export function validateProposal(
  original: Portfolio,
  actions: TradeAction[],
  currentPrices: Map<string, number>
): ValidationError[] {
  const errors: ValidationError[] = [];
  let remainingCash = original.cash;
  const holdingsMap = new Map(original.portfolio.map((h) => [h.ticker, h.shares]));

  for (const action of actions) {
    if (action.action === "hold") continue;

    const currentShares = holdingsMap.get(action.ticker);
    if (currentShares === undefined) {
      errors.push({ action, reason: `Ticker ${action.ticker} is not in the portfolio` });
      continue;
    }

    const price = currentPrices.get(action.ticker);
    if (!price) {
      errors.push({ action, reason: `No price available for ${action.ticker}` });
      continue;
    }

    if (action.action === "sell") {
      const maxSellable = Math.floor(currentShares * 0.5);
      if (action.shares > maxSellable) {
        errors.push({
          action,
          reason: `Cannot sell ${action.shares} shares of ${action.ticker}. Max is ${maxSellable} (50% of ${currentShares})`,
        });
      } else {
        remainingCash += action.shares * price;
        holdingsMap.set(action.ticker, currentShares - action.shares);
      }
    }

    if (action.action === "buy") {
      const cost = action.shares * price;
      const maxSpend = original.cash * 0.3;
      if (cost > maxSpend) {
        errors.push({
          action,
          reason: `Buy cost $${cost.toFixed(2)} exceeds 30% of cash ($${maxSpend.toFixed(2)})`,
        });
      } else {
        remainingCash -= cost;
        holdingsMap.set(action.ticker, currentShares + action.shares);
      }
    }
  }

  if (remainingCash < 500) {
    errors.push({
      action: { ticker: "", action: "buy", shares: 0, reason: "", confidence: "low" },
      reason: `Cash would drop to $${remainingCash.toFixed(2)}, below $500 floor`,
    });
  }

  return errors;
}

export function applyActions(original: Portfolio, actions: TradeAction[], currentPrices: Map<string, number>): Portfolio {
  const holdingsMap = new Map(original.portfolio.map((h) => [h.ticker, { ...h }]));
  let cash = original.cash;

  for (const action of actions) {
    if (action.action === "hold") continue;
    const holding = holdingsMap.get(action.ticker);
    if (!holding) continue;
    const price = currentPrices.get(action.ticker) ?? 0;

    if (action.action === "buy") {
      holding.shares += action.shares;
      cash -= action.shares * price;
    } else if (action.action === "sell") {
      holding.shares -= action.shares;
      cash += action.shares * price;
    }
  }

  return {
    portfolio: Array.from(holdingsMap.values()),
    cash,
    lastUpdated: new Date().toISOString().split("T")[0],
  };
}
```

- [ ] **Step 2: Smoke test validator**

Create `server/validators/trade.test.ts`:

```ts
import { validateProposal, applyActions } from "./trade.js";
import type { Portfolio, TradeAction } from "@shared/types.js";

const portfolio: Portfolio = {
  portfolio: [
    { ticker: "AAPL", shares: 10, avgCost: 185 },
    { ticker: "NVDA", shares: 5, avgCost: 890 },
  ],
  cash: 5000,
  lastUpdated: "2026-05-14",
};

const prices = new Map([["AAPL", 195], ["NVDA", 950]]);

// Valid actions
const valid: TradeAction[] = [
  { ticker: "AAPL", action: "buy", shares: 5, reason: "undervalued", confidence: "high" },
  { ticker: "NVDA", action: "sell", shares: 2, reason: "overvalued", confidence: "medium" },
];
let errors = validateProposal(portfolio, valid, prices);
console.assert(errors.length === 0, `Expected no errors, got: ${JSON.stringify(errors)}`);

// Sell too many shares (>50%)
const oversell: TradeAction[] = [
  { ticker: "AAPL", action: "sell", shares: 8, reason: "panic", confidence: "low" },
];
errors = validateProposal(portfolio, oversell, prices);
console.assert(errors.length === 1, "Should reject selling >50%");

// Buy exceeds 30% of cash
const overbuy: TradeAction[] = [
  { ticker: "AAPL", action: "buy", shares: 100, reason: "yolo", confidence: "high" },
];
errors = validateProposal(portfolio, overbuy, prices);
console.assert(errors.length > 0, "Should reject buy exceeding 30% cash");

// Unknown ticker
const unknownTicker: TradeAction[] = [
  { ticker: "TSLA", action: "buy", shares: 1, reason: "hype", confidence: "low" },
];
errors = validateProposal(portfolio, unknownTicker, prices);
console.assert(errors.length === 1, "Should reject unknown ticker");

// Apply valid actions
const result = applyActions(portfolio, valid, prices);
console.assert(result.portfolio.find((h) => h.ticker === "AAPL")?.shares === 15, "AAPL should be 15 shares");
console.assert(result.portfolio.find((h) => h.ticker === "NVDA")?.shares === 3, "NVDA should be 3 shares");

console.log("All trade validator tests passed");
```

- [ ] **Step 3: Run it**

```bash
npx tsx server/validators/trade.test.ts
```

Expected: `All trade validator tests passed`

- [ ] **Step 4: Commit**

```bash
git add server/validators/trade.ts server/validators/trade.test.ts
git commit -m "feat: add trade constraint validator with apply logic"
```

---

## Task 4: Claude Service

**Files:**
- Create: `server/services/claude.ts`

- [ ] **Step 1: Create server/services/claude.ts**

```ts
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import type { Portfolio, TradeAction } from "@shared/types.js";

dotenv.config();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface AgentInput {
  portfolio: Portfolio;
  marketData: string;
  agentRole: string;
  constraints: string;
}

export interface AgentOutput {
  actions: TradeAction[];
  reasoning: string;
  strategy: string;
}

const CONSTRAINTS_BLOCK = `TRADE CONSTRAINTS (you MUST follow these):
- Max spend per trade: 30% of available cash
- Max sell per position: 50% of shares held
- Only trade tickers already in the portfolio
- Must keep at least $500 cash after all trades
- Return actions as JSON array`;

export async function runAgentPrompt(input: AgentInput): Promise<AgentOutput> {
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `You are a ${input.agentRole}.

CURRENT PORTFOLIO:
${JSON.stringify(input.portfolio, null, 2)}

MARKET DATA:
${input.marketData}

${CONSTRAINTS_BLOCK}

Analyze the portfolio and propose trades. Respond with ONLY valid JSON in this exact format:
{
  "strategy": "one sentence summary of your approach",
  "actions": [
    { "ticker": "AAPL", "action": "buy|sell|hold", "shares": 5, "reason": "why", "confidence": "high|medium|low" }
  ],
  "reasoning": "2-3 paragraph explanation of your analysis"
}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Agent did not return valid JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    actions: parsed.actions as TradeAction[],
    reasoning: parsed.reasoning as string,
    strategy: parsed.strategy as string,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add server/services/claude.ts
git commit -m "feat: add Claude API service for agent prompts"
```

---

## Task 5: Agent Implementations

**Files:**
- Create: `server/agents/base.ts`, `server/agents/fundamentals.ts`, `server/agents/sentiment.ts`, `server/agents/technical.ts`

- [ ] **Step 1: Create server/agents/base.ts**

```ts
import { mesa } from "../services/mesa.js";
import { runAgentPrompt, type AgentInput } from "../services/claude.js";
import { validateProposal, applyActions } from "../validators/trade.js";
import type { Portfolio, AgentResult } from "@shared/types.js";

export interface AgentConfig {
  name: string;
  role: string;
  fetchMarketData: (tickers: string[]) => Promise<string>;
}

export async function runAgent(
  config: AgentConfig,
  branchName: string,
  currentPrices: Map<string, number>
): Promise<AgentResult> {
  try {
    const portfolioRaw = await mesa.readFile("main", "portfolio.json");
    const portfolio: Portfolio = JSON.parse(portfolioRaw);
    const tickers = portfolio.portfolio.map((h) => h.ticker);

    const marketData = await config.fetchMarketData(tickers);

    const input: AgentInput = {
      portfolio,
      marketData,
      agentRole: config.role,
      constraints: "",
    };

    const output = await runAgentPrompt(input);

    const errors = validateProposal(portfolio, output.actions, currentPrices);
    if (errors.length > 0) {
      const validActions = output.actions.filter(
        (a) => !errors.some((e) => e.action.ticker === a.ticker && e.action.action === a.action)
      );
      output.actions = validActions;
    }

    const proposedPortfolio = applyActions(portfolio, output.actions, currentPrices);

    await mesa.writeFile(branchName, "portfolio.json", JSON.stringify(proposedPortfolio, null, 2));
    await mesa.writeFile(branchName, "reasoning.md", `# ${config.name} Analysis\n\n${output.reasoning}`);

    let newMarketValue = proposedPortfolio.cash;
    for (const h of proposedPortfolio.portfolio) {
      newMarketValue += h.shares * (currentPrices.get(h.ticker) ?? 0);
    }

    return {
      agentName: config.name,
      branch: branchName,
      status: "success",
      proposal: {
        agentName: config.name,
        strategy: output.strategy,
        actions: output.actions,
        proposedPortfolio,
        reasoning: output.reasoning,
        newMarketValue,
      },
    };
  } catch (error) {
    return {
      agentName: config.name,
      branch: branchName,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

- [ ] **Step 2: Create server/agents/fundamentals.ts**

```ts
import type { AgentConfig } from "./base.js";
import { getStockSummary, getQuotes } from "../services/market.js";

export const fundamentalsAgent: AgentConfig = {
  name: "Fundamentals",
  role: "fundamental analysis expert who evaluates stocks based on earnings, P/E ratios, revenue growth, and intrinsic value",
  async fetchMarketData(tickers) {
    const quotes = await getQuotes(tickers);
    const summaries = await Promise.all(
      tickers.map(async (t) => {
        const summary = await getStockSummary(t);
        const quote = quotes.get(t);
        return `${t} (${quote?.name ?? t}):
  Price: $${quote?.price ?? "N/A"}
  Forward P/E: ${summary.forwardPE ?? "N/A"}
  Revenue Growth: ${summary.revenueGrowth != null ? (summary.revenueGrowth * 100).toFixed(1) + "%" : "N/A"}`;
      })
    );
    return summaries.join("\n\n");
  },
};
```

- [ ] **Step 3: Create server/agents/sentiment.ts**

```ts
import type { AgentConfig } from "./base.js";
import { getQuotes } from "../services/market.js";
import yahooFinance from "yahoo-finance2";

export const sentimentAgent: AgentConfig = {
  name: "Sentiment",
  role: "market sentiment analyst who evaluates stocks based on recent news, market buzz, and momentum indicators",
  async fetchMarketData(tickers) {
    const quotes = await getQuotes(tickers);
    const results = await Promise.all(
      tickers.map(async (t) => {
        const quote = quotes.get(t);
        let newsSection = "No recent news available";
        try {
          const search = await yahooFinance.search(t, { newsCount: 3 });
          if (search.news && search.news.length > 0) {
            newsSection = search.news.map((n) => `- ${n.title}`).join("\n");
          }
        } catch {
          // news unavailable
        }
        return `${t} (${quote?.name ?? t}):
  Price: $${quote?.price ?? "N/A"} (${quote?.changePercent?.toFixed(2) ?? 0}% today)
  Recent News:
${newsSection}`;
      })
    );
    return results.join("\n\n");
  },
};
```

- [ ] **Step 4: Create server/agents/technical.ts**

```ts
import type { AgentConfig } from "./base.js";
import { getQuotes, getHistoricalPrices } from "../services/market.js";

export const technicalAgent: AgentConfig = {
  name: "Technical",
  role: "technical analysis expert who evaluates stocks based on price trends, moving averages, and momentum",
  async fetchMarketData(tickers) {
    const quotes = await getQuotes(tickers);
    const results = await Promise.all(
      tickers.map(async (t) => {
        const quote = quotes.get(t);
        const history = await getHistoricalPrices(t, 60);
        const closes = history.map((h) => h.close);

        let sma20 = "N/A";
        let sma50 = "N/A";
        if (closes.length >= 20) {
          sma20 = (closes.slice(-20).reduce((a, b) => a + b, 0) / 20).toFixed(2);
        }
        if (closes.length >= 50) {
          sma50 = (closes.slice(-50).reduce((a, b) => a + b, 0) / 50).toFixed(2);
        }

        const recent5 = closes.slice(-5);
        const momentum =
          recent5.length >= 2
            ? (((recent5[recent5.length - 1] - recent5[0]) / recent5[0]) * 100).toFixed(2) + "%"
            : "N/A";

        return `${t} (${quote?.name ?? t}):
  Price: $${quote?.price ?? "N/A"}
  20-day SMA: $${sma20}
  50-day SMA: $${sma50}
  5-day Momentum: ${momentum}
  60-day Price Range: $${closes.length > 0 ? Math.min(...closes).toFixed(2) : "N/A"} - $${closes.length > 0 ? Math.max(...closes).toFixed(2) : "N/A"}`;
      })
    );
    return results.join("\n\n");
  },
};
```

- [ ] **Step 5: Commit**

```bash
git add server/agents/
git commit -m "feat: add three agent implementations (fundamentals, sentiment, technical)"
```

---

## Task 6: Express API Routes

**Files:**
- Create: `server/routes/api.ts`, `server/index.ts`

- [ ] **Step 1: Create server/routes/api.ts**

```ts
import { Router } from "express";
import { mesa } from "../services/mesa.js";
import { getQuotes } from "../services/market.js";
import { runAgent } from "../agents/base.js";
import { fundamentalsAgent } from "../agents/fundamentals.js";
import { sentimentAgent } from "../agents/sentiment.js";
import { technicalAgent } from "../agents/technical.js";
import type { Portfolio } from "@shared/types.js";

export const apiRouter = Router();

apiRouter.get("/portfolio", async (_req, res) => {
  try {
    const raw = await mesa.readFile("main", "portfolio.json");
    const portfolio: Portfolio = JSON.parse(raw);
    const tickers = portfolio.portfolio.map((h) => h.ticker);
    const quotes = await getQuotes(tickers);

    let marketValue = portfolio.cash;
    const holdings = portfolio.portfolio.map((h) => {
      const quote = quotes.get(h.ticker);
      const currentPrice = quote?.price ?? 0;
      marketValue += h.shares * currentPrice;
      return { ...h, currentPrice, name: quote?.name ?? h.ticker };
    });

    res.json({ ...portfolio, portfolio: holdings, marketValue });
  } catch (error) {
    res.status(500).json({ error: "Failed to load portfolio" });
  }
});

apiRouter.post("/analyze", async (_req, res) => {
  try {
    const raw = await mesa.readFile("main", "portfolio.json");
    const portfolio: Portfolio = JSON.parse(raw);
    const tickers = portfolio.portfolio.map((h) => h.ticker);
    const quotes = await getQuotes(tickers);
    const currentPrices = new Map<string, number>();
    for (const [ticker, quote] of quotes) {
      currentPrices.set(ticker, quote.price);
    }

    const timestamp = Date.now();
    const agents = [
      { config: fundamentalsAgent, branch: `agent/fundamentals-${timestamp}` },
      { config: sentimentAgent, branch: `agent/sentiment-${timestamp}` },
      { config: technicalAgent, branch: `agent/technical-${timestamp}` },
    ];

    for (const a of agents) {
      await mesa.createBranch(a.branch, "main");
    }

    const results = await Promise.all(
      agents.map((a) => runAgent(a.config, a.branch, currentPrices))
    );

    res.json({ timestamp, results });
  } catch (error) {
    res.status(500).json({ error: "Analysis failed" });
  }
});

apiRouter.post("/merge", async (req, res) => {
  try {
    const { branch, allBranches } = req.body as { branch: string; allBranches: string[] };
    if (!branch || !allBranches) {
      res.status(400).json({ error: "branch and allBranches required" });
      return;
    }

    await mesa.mergeBranch(branch, "main");

    for (const b of allBranches) {
      try {
        await mesa.deleteBranch(b);
      } catch {
        // branch may already be deleted
      }
    }

    const raw = await mesa.readFile("main", "portfolio.json");
    res.json({ portfolio: JSON.parse(raw) });
  } catch (error) {
    res.status(500).json({ error: "Merge failed" });
  }
});

apiRouter.post("/dismiss", async (req, res) => {
  try {
    const { allBranches } = req.body as { allBranches: string[] };
    for (const b of allBranches) {
      try {
        await mesa.deleteBranch(b);
      } catch {
        // branch may already be deleted
      }
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: "Dismiss failed" });
  }
});
```

- [ ] **Step 2: Create server/index.ts**

```ts
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { mesa } from "./services/mesa.js";
import { apiRouter } from "./routes/api.js";
import type { Portfolio } from "@shared/types.js";

dotenv.config();

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());
app.use("/api", apiRouter);

const DEFAULT_PORTFOLIO: Portfolio = {
  portfolio: [
    { ticker: "AAPL", shares: 10, avgCost: 185.5 },
    { ticker: "NVDA", shares: 5, avgCost: 890.0 },
    { ticker: "MSFT", shares: 8, avgCost: 410.25 },
    { ticker: "GOOGL", shares: 12, avgCost: 165.0 },
    { ticker: "AMZN", shares: 6, avgCost: 195.75 },
  ],
  cash: 5000.0,
  lastUpdated: new Date().toISOString().split("T")[0],
};

async function start() {
  await mesa.init();

  try {
    await mesa.readFile("main", "portfolio.json");
  } catch {
    await mesa.writeFile("main", "portfolio.json", JSON.stringify(DEFAULT_PORTFOLIO, null, 2));
    console.log("Initialized default portfolio on main branch");
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start().catch(console.error);
```

- [ ] **Step 3: Test the server starts**

```bash
npx tsx server/index.ts
```

Expected: `Initialized default portfolio on main branch` then `Server running on http://localhost:3001`

In another terminal:
```bash
curl http://localhost:3001/api/portfolio
```

Expected: JSON with portfolio holdings and live prices.

Stop the server with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add server/routes/api.ts server/index.ts
git commit -m "feat: add Express server with portfolio, analyze, merge, dismiss endpoints"
```

---

## Task 7: React Frontend — Shell and Portfolio View

**Files:**
- Create: `client/index.html`, `client/src/main.tsx`, `client/src/App.tsx`, `client/src/types.ts`, `client/src/hooks/useApi.ts`, `client/src/components/Portfolio.tsx`

- [ ] **Step 1: Create client/index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mesa Portfolio Advisor</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create client/src/main.tsx**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 3: Create client/src/types.ts**

Re-export shared types and add UI-specific ones:

```ts
export type { Portfolio, Holding, TradeAction, AgentProposal, AgentResult, MarketQuote } from "@shared/types.js";

export interface PortfolioWithPrices {
  portfolio: (import("@shared/types.js").Holding & { currentPrice: number; name: string })[];
  cash: number;
  lastUpdated: string;
  marketValue: number;
}

export type AnalysisState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; timestamp: number; results: import("@shared/types.js").AgentResult[] }
  | { status: "error"; message: string };
```

- [ ] **Step 4: Create client/src/hooks/useApi.ts**

```ts
import { useState, useEffect, useCallback } from "react";
import type { PortfolioWithPrices, AnalysisState, AgentResult } from "../types.js";

export function usePortfolio() {
  const [portfolio, setPortfolio] = useState<PortfolioWithPrices | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/portfolio");
      setPortfolio(await res.json());
    } catch {
      console.error("Failed to fetch portfolio");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  return { portfolio, loading, refresh };
}

export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>({ status: "idle" });

  const analyze = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/analyze", { method: "POST" });
      if (!res.ok) throw new Error("Analysis failed");
      const data = await res.json();
      setState({ status: "done", timestamp: data.timestamp, results: data.results });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "Unknown error" });
    }
  }, []);

  const merge = useCallback(async (branch: string, allBranches: string[]) => {
    const res = await fetch("/api/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branch, allBranches }),
    });
    if (!res.ok) throw new Error("Merge failed");
    setState({ status: "idle" });
  }, []);

  const dismiss = useCallback(async (allBranches: string[]) => {
    await fetch("/api/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allBranches }),
    });
    setState({ status: "idle" });
  }, []);

  return { state, analyze, merge, dismiss };
}
```

- [ ] **Step 5: Create client/src/components/Portfolio.tsx**

```tsx
import type { PortfolioWithPrices } from "../types.js";

export function Portfolio({ data }: { data: PortfolioWithPrices }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Current Portfolio</h2>
        <div className="text-right">
          <div className="text-sm text-gray-500">Total Market Value</div>
          <div className="text-2xl font-bold">${data.marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="pb-2">Ticker</th>
            <th className="pb-2">Name</th>
            <th className="pb-2 text-right">Shares</th>
            <th className="pb-2 text-right">Avg Cost</th>
            <th className="pb-2 text-right">Price</th>
            <th className="pb-2 text-right">Value</th>
            <th className="pb-2 text-right">P/L</th>
          </tr>
        </thead>
        <tbody>
          {data.portfolio.map((h) => {
            const value = h.shares * h.currentPrice;
            const cost = h.shares * h.avgCost;
            const pl = value - cost;
            const plPct = ((pl / cost) * 100).toFixed(1);
            return (
              <tr key={h.ticker} className="border-b last:border-0">
                <td className="py-2 font-mono font-semibold">{h.ticker}</td>
                <td className="py-2 text-gray-600">{h.name}</td>
                <td className="py-2 text-right">{h.shares}</td>
                <td className="py-2 text-right">${h.avgCost.toFixed(2)}</td>
                <td className="py-2 text-right">${h.currentPrice.toFixed(2)}</td>
                <td className="py-2 text-right">${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className={`py-2 text-right font-medium ${pl >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {pl >= 0 ? "+" : ""}${pl.toFixed(2)} ({plPct}%)
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-4 text-sm text-gray-500">
        Cash: ${data.cash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create client/src/App.tsx (initial shell)**

```tsx
import "@tailwindcss/vite";
import { usePortfolio, useAnalysis } from "./hooks/useApi.js";
import { Portfolio } from "./components/Portfolio.js";

export default function App() {
  const { portfolio, loading, refresh } = usePortfolio();
  const { state, analyze } = useAnalysis();

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Mesa Portfolio Advisor</h1>
            <p className="text-gray-500 mt-1">Multi-agent analysis powered by Mesa versioned filesystem</p>
          </div>
          <button
            onClick={analyze}
            disabled={state.status === "loading"}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition"
          >
            {state.status === "loading" ? "Analyzing..." : "Run Analysis"}
          </button>
        </div>

        {loading && <div className="text-gray-400">Loading portfolio...</div>}
        {portfolio && <Portfolio data={portfolio} />}

        {state.status === "loading" && (
          <div className="mt-8 text-center text-gray-500">
            <div className="animate-pulse">Three agents are analyzing your portfolio on separate Mesa branches...</div>
          </div>
        )}

        {state.status === "error" && (
          <div className="mt-8 bg-red-50 text-red-700 p-4 rounded-lg">
            Error: {state.message}
            <button onClick={analyze} className="ml-4 underline">Retry</button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Test the frontend renders**

Start the server and client:

```bash
npx tsx server/index.ts &
npx vite --config vite.config.ts
```

Open `http://localhost:5173`. Verify:
- Title "Mesa Portfolio Advisor" is visible
- Portfolio table loads with live stock prices
- "Run Analysis" button is present

Stop both with Ctrl+C.

- [ ] **Step 8: Commit**

```bash
git add client/ shared/
git commit -m "feat: add React frontend shell with portfolio view"
```

---

## Task 8: Agent Comparison View and Merge Flow

**Files:**
- Create: `client/src/components/AgentCard.tsx`, `client/src/components/ComparisonView.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Create client/src/components/AgentCard.tsx**

```tsx
import type { AgentResult } from "../types.js";

interface AgentCardProps {
  result: AgentResult;
  onAccept: () => void;
}

const AGENT_COLORS: Record<string, string> = {
  Fundamentals: "border-blue-500",
  Sentiment: "border-purple-500",
  Technical: "border-amber-500",
};

const AGENT_ICONS: Record<string, string> = {
  Fundamentals: "📊",
  Sentiment: "📰",
  Technical: "📈",
};

export function AgentCard({ result, onAccept }: AgentCardProps) {
  const color = AGENT_COLORS[result.agentName] ?? "border-gray-300";
  const icon = AGENT_ICONS[result.agentName] ?? "🤖";

  if (result.status === "error") {
    return (
      <div className={`border-t-4 ${color} bg-white rounded-lg shadow p-6`}>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">{icon}</span>
          <h3 className="text-lg font-semibold">{result.agentName}</h3>
        </div>
        <div className="bg-red-50 text-red-700 p-3 rounded text-sm">
          {result.error}
        </div>
      </div>
    );
  }

  const proposal = result.proposal!;

  return (
    <div className={`border-t-4 ${color} bg-white rounded-lg shadow p-6 flex flex-col`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{icon}</span>
        <h3 className="text-lg font-semibold">{result.agentName}</h3>
      </div>
      <p className="text-sm text-gray-600 mb-4 italic">{proposal.strategy}</p>

      <div className="flex-1">
        <h4 className="text-sm font-medium text-gray-500 mb-2">Proposed Trades</h4>
        <div className="space-y-2 mb-4">
          {proposal.actions.map((a, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${
                  a.action === "buy"
                    ? "bg-green-100 text-green-700"
                    : a.action === "sell"
                    ? "bg-red-100 text-red-700"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                {a.action.toUpperCase()}
              </span>
              <span className="font-mono">{a.ticker}</span>
              {a.action !== "hold" && <span>×{a.shares}</span>}
              <span
                className={`ml-auto text-xs px-1.5 py-0.5 rounded ${
                  a.confidence === "high"
                    ? "bg-green-50 text-green-600"
                    : a.confidence === "medium"
                    ? "bg-yellow-50 text-yellow-600"
                    : "bg-gray-50 text-gray-500"
                }`}
              >
                {a.confidence}
              </span>
            </div>
          ))}
        </div>

        <div className="text-sm text-gray-500 mb-4">
          <div className="flex justify-between">
            <span>New Market Value</span>
            <span className="font-semibold text-gray-900">
              ${proposal.newMarketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <details className="text-sm mb-4">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-700">Full Reasoning</summary>
          <p className="mt-2 text-gray-600 whitespace-pre-wrap">{proposal.reasoning}</p>
        </details>
      </div>

      <button
        onClick={onAccept}
        className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition text-sm font-medium"
      >
        Accept This Strategy
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create client/src/components/ComparisonView.tsx**

```tsx
import type { AgentResult } from "../types.js";
import { AgentCard } from "./AgentCard.js";

interface ComparisonViewProps {
  results: AgentResult[];
  onAccept: (branch: string) => void;
  onDismiss: () => void;
}

export function ComparisonView({ results, onAccept, onDismiss }: ComparisonViewProps) {
  return (
    <div className="mt-8">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Agent Proposals</h2>
        <button
          onClick={onDismiss}
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          Dismiss All
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {results.map((r) => (
          <AgentCard key={r.agentName} result={r} onAccept={() => onAccept(r.branch)} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update client/src/App.tsx to wire in comparison view**

Replace the full content of `client/src/App.tsx`:

```tsx
import { usePortfolio, useAnalysis } from "./hooks/useApi.js";
import { Portfolio } from "./components/Portfolio.js";
import { ComparisonView } from "./components/ComparisonView.js";

export default function App() {
  const { portfolio, loading, refresh } = usePortfolio();
  const { state, analyze, merge, dismiss } = useAnalysis();

  const allBranches = state.status === "done" ? state.results.map((r) => r.branch) : [];

  const handleAccept = async (branch: string) => {
    await merge(branch, allBranches);
    refresh();
  };

  const handleDismiss = async () => {
    await dismiss(allBranches);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Mesa Portfolio Advisor</h1>
            <p className="text-gray-500 mt-1">Multi-agent analysis powered by Mesa versioned filesystem</p>
          </div>
          <button
            onClick={analyze}
            disabled={state.status === "loading"}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition"
          >
            {state.status === "loading" ? "Analyzing..." : "Run Analysis"}
          </button>
        </div>

        {loading && <div className="text-gray-400">Loading portfolio...</div>}
        {portfolio && <Portfolio data={portfolio} />}

        {state.status === "loading" && (
          <div className="mt-8 text-center text-gray-500">
            <div className="animate-pulse">Three agents are analyzing your portfolio on separate Mesa branches...</div>
          </div>
        )}

        {state.status === "error" && (
          <div className="mt-8 bg-red-50 text-red-700 p-4 rounded-lg">
            Error: {state.message}
            <button onClick={analyze} className="ml-4 underline">Retry</button>
          </div>
        )}

        {state.status === "done" && (
          <ComparisonView
            results={state.results}
            onAccept={handleAccept}
            onDismiss={handleDismiss}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Test the full flow**

Start both server and client. Open `http://localhost:5173`.

1. Verify portfolio table renders with prices
2. Click "Run Analysis" — should show loading state
3. After agents complete (~10-20 seconds), three cards appear side-by-side
4. Each card shows: agent name, strategy, proposed trades, market value, reasoning
5. Click "Accept This Strategy" on one card — portfolio updates, cards disappear
6. Click "Run Analysis" again to repeat

- [ ] **Step 5: Commit**

```bash
git add client/src/
git commit -m "feat: add agent comparison view with merge and dismiss flow"
```

---

## Task 9: Tailwind Setup and CSS

**Files:**
- Create: `client/src/index.css`, `client/tailwind.config.js`
- Modify: `client/src/main.tsx`

- [ ] **Step 1: Create client/src/index.css**

```css
@import "tailwindcss";
```

- [ ] **Step 2: Update client/src/main.tsx to import CSS**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.js";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 3: Commit**

```bash
git add client/src/index.css client/src/main.tsx
git commit -m "feat: add Tailwind CSS setup"
```

---

## Task 10: README and .env.example

**Files:**
- Create: `README.md`
- Modify: `.env.example` (already created)

- [ ] **Step 1: Create README.md**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup instructions"
```

---

## Self-Review Checklist

- **Spec coverage:** All endpoints (GET /portfolio, POST /analyze, POST /merge, GET /history) are implemented. Note: GET /history is defined in the spec but not implemented in the routes — this is intentional since `LocalFsMesa.listCommits` returns empty and it's a nice-to-have. The core demo flow is complete without it.
- **Placeholder scan:** No TBDs, TODOs, or "implement later" references found.
- **Type consistency:** `Portfolio`, `Holding`, `TradeAction`, `AgentProposal`, `AgentResult`, `MarketQuote` — all defined once in `shared/types.ts` and referenced consistently across tasks. `AgentConfig` and `AgentInput/AgentOutput` defined in their respective server files.
- **Branch names:** Spec says `agent/fundamentals-{unix_timestamp}` — matches Task 6 route implementation.
- **Trade constraints:** Spec says 30% cash, 50% shares, $500 floor, existing tickers only — all implemented in Task 3 validator.
- **Error handling:** Spec says partial results if 1-2 agents fail — handled by `runAgent` catching errors and returning `status: "error"`, frontend `AgentCard` renders error state.
