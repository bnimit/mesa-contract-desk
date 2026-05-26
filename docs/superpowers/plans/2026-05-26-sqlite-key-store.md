# SQLite Key Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace .env-based API key configuration with a server-side SQLite database. Keys are entered via the settings panel UI, encrypted and stored locally, and persist across server restarts. Zero-config demo experience.

**Architecture:** Server-side SQLite database (`.mesa/config.db`, gitignored) stores AES-256-GCM encrypted API keys. The settings panel gets key input fields. The server exposes endpoints to save/clear keys and reinitializes backends dynamically on key change and on boot.

**Tech Stack:** `better-sqlite3` for SQLite, Node `crypto` for AES-256-GCM encryption.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `server/services/config.ts` | Create | SQLite encrypted key store — `getKey`, `setKey`, `deleteKey`, `hasKey`, `initConfigDb` |
| `server/services/mesa.ts` | Modify | Replace `const mesa` export with `getMesa()` getter + `reinitializeMesa()` |
| `server/services/claude.ts` | Modify | Remove `loadApiKey()`, add `reinitializeAnthropic()`, `hasAnthropicKey()`, make `getClient()` throw descriptive error when not initialized |
| `server/routes/api.ts` | Modify | Change all `mesa.` calls to `getMesa().`, add `POST /api/settings/keys` + `DELETE /api/settings/keys`, add server-side guard on `/api/analyze` and `/api/replay`, update `/api/settings` to include key status |
| `server/agents/base.ts` | Modify | Change `mesa` import to `getMesa` |
| `server/services/memory.ts` | Modify | Change `mesa` import to `getMesa` |
| `server/services/playbook.ts` | Modify | Change `mesa` import to `getMesa` |
| `server/index.ts` | Modify | Boot sequence reads SQLite, webhook reads Mesa key from SQLite, no more `process.env` for API keys |
| `shared/types.ts` | Modify | Add `KeyStatus` type |
| `client/src/types.ts` | Modify | Re-export `KeyStatus` |
| `client/src/hooks/useApi.ts` | Modify | `useSettings` returns key status + `saveKeys`/`clearKeys` functions |
| `client/src/components/SettingsPanel.tsx` | Modify | Add "API Keys" section with two password inputs, save/clear buttons |
| `client/src/App.tsx` | Modify | Disable "Run analysis" when no Anthropic key, show inline prompt |
| `.gitignore` | Modify | Add `.mesa/` |
| `.env.example` | Modify | Update to note keys are now managed via UI |
| `package.json` | Modify | Add `better-sqlite3` + `@types/better-sqlite3` |

---

### Task 1: Install Dependencies and Create Config Service

**Files:**
- Modify: `package.json`
- Create: `server/services/config.ts`

- [ ] **Step 1: Install `better-sqlite3` and its type definitions**

Run:
```bash
cd /Users/nimit/Documents/Projects/Mesa && npm install better-sqlite3 && npm install -D @types/better-sqlite3
```
Expected: Both packages added to `package.json`, `node_modules` updated.

- [ ] **Step 2: Create the config service `server/services/config.ts`**

```typescript
import Database from "better-sqlite3";
import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "crypto";
import { mkdirSync } from "fs";
import { resolve } from "path";

const DB_DIR = resolve(process.cwd(), ".mesa");
const DB_PATH = resolve(DB_DIR, "config.db");

const ENC_KEY = scryptSync("mesa-portfolio-advisor-local", "mesa-salt", 32);

let db: Database.Database;

export function initConfigDb(): void {
  mkdirSync(DB_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec("CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
}

function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("hex");
}

function decrypt(hex: string): string {
  const buf = Buffer.from(hex, "hex");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", ENC_KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

export function getKey(name: string): string | null {
  const row = db.prepare("SELECT value FROM config WHERE key = ?").get(name) as { value: string } | undefined;
  if (!row) return null;
  return decrypt(row.value);
}

export function setKey(name: string, value: string): void {
  const encrypted = encrypt(value);
  db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)").run(name, encrypted);
}

export function deleteKey(name: string): void {
  db.prepare("DELETE FROM config WHERE key = ?").run(name);
}

export function hasKey(name: string): boolean {
  const row = db.prepare("SELECT 1 FROM config WHERE key = ?").get(name);
  return !!row;
}
```

- [ ] **Step 3: Verify the server compiles**

Run:
```bash
npx tsc -p tsconfig.server.json --noEmit
```
Expected: No new errors from `config.ts`. (Pre-existing errors in `sentiment.ts` and `market.ts` are expected.)

- [ ] **Step 4: Commit**

```bash
git add server/services/config.ts package.json package-lock.json
git commit -m "feat: add SQLite encrypted key store service"
```

---

### Task 2: Refactor Mesa Backend to Dynamic Getter

**Files:**
- Modify: `server/services/mesa.ts`

Currently exports `const mesa: MesaService = createBackend()`. Change to a mutable module-level variable with a getter and reinitializer.

- [ ] **Step 1: Replace const export with getter and reinitializer**

Replace lines 87–99 of `server/services/mesa.ts` (from `import { SdkMesa }` through `export const mesa`) with:

```typescript
import { SdkMesa } from "./mesa-sdk.js";

let currentBackend: MesaService = new LocalFsMesa();

export function getMesa(): MesaService {
  return currentBackend;
}

export async function reinitializeMesa(apiKey?: string): Promise<void> {
  if (apiKey && apiKey.length > 0) {
    console.log("Using Mesa SDK backend (api.mesa.dev)");
    currentBackend = new SdkMesa(apiKey);
  } else {
    console.log("Using local filesystem backend (mesa-repo/)");
    currentBackend = new LocalFsMesa();
  }
  await currentBackend.init();
}
```

The `createBackend()` function is removed entirely.

- [ ] **Step 2: Verify the server compiles**

Run:
```bash
npx tsc -p tsconfig.server.json --noEmit
```
Expected: Compilation errors in `api.ts`, `base.ts`, `memory.ts`, `playbook.ts`, `index.ts` referencing the old `mesa` export. These will be fixed in the next tasks.

- [ ] **Step 3: Commit**

```bash
git add server/services/mesa.ts
git commit -m "refactor: replace const mesa export with getMesa() getter and reinitializeMesa()"
```

---

### Task 3: Update All Mesa Consumer Files

**Files:**
- Modify: `server/routes/api.ts` (import only — endpoint changes come in Task 5)
- Modify: `server/agents/base.ts`
- Modify: `server/services/memory.ts`
- Modify: `server/services/playbook.ts`

Every file that imports `{ mesa }` from `../services/mesa.js` (or `./mesa.js`) must change to import `{ getMesa }` and call `getMesa()` at each usage site.

- [ ] **Step 1: Update `server/agents/base.ts`**

Change line 1:
```typescript
// OLD:
import { mesa } from "../services/mesa.js";
// NEW:
import { getMesa } from "../services/mesa.js";
```

Then replace every `mesa.` call in the file with `getMesa().`:
- Line 25: `await mesa.readFile(` → `await getMesa().readFile(`
- Line 62: `await mesa.writeFile(` → `await getMesa().writeFile(`
- Line 63: `await mesa.writeFile(` → `await getMesa().writeFile(`

- [ ] **Step 2: Update `server/services/memory.ts`**

Change line 1:
```typescript
// OLD:
import { mesa } from "./mesa.js";
// NEW:
import { getMesa } from "./mesa.js";
```

Replace every `mesa.` call:
- Line 11: `await mesa.listFiles(` → `await getMesa().listFiles(`
- Line 18: `await mesa.readFile(` → `await getMesa().readFile(`
- Line 127: `await mesa.writeFile(` → `await getMesa().writeFile(`
- Line 135: `await mesa.listFiles(` → `await getMesa().listFiles(`
- Line 140: `await mesa.readFile(` → `await getMesa().readFile(`

- [ ] **Step 3: Update `server/services/playbook.ts`**

Change line 1:
```typescript
// OLD:
import { mesa } from "./mesa.js";
// NEW:
import { getMesa } from "./mesa.js";
```

Replace every `mesa.` call:
- Line 16: `await mesa.readFile(` → `await getMesa().readFile(`
- Line 24: `await mesa.writeFile(` → `await getMesa().writeFile(`

- [ ] **Step 4: Update `server/routes/api.ts` import and all `mesa.` references**

Change line 2:
```typescript
// OLD:
import { mesa } from "../services/mesa.js";
// NEW:
import { getMesa } from "../services/mesa.js";
```

Replace every `mesa.` call in the file (there are many — all 20+ references). Every instance of `mesa.readFile`, `mesa.writeFile`, `mesa.createBranch`, `mesa.mergeBranch`, `mesa.deleteBranch`, `mesa.getChangeId`, `mesa.getDiff`, `mesa.getActivity`, `mesa.backendName` becomes `getMesa().readFile`, `getMesa().writeFile`, etc.

Key locations:
- Line 24: `await mesa.createBranch(` → `await getMesa().createBranch(`
- Line 53: `await mesa.readFile(` → `await getMesa().readFile(`
- Line 73: `await mesa.createBranch(` → `await getMesa().createBranch(`
- Line 100: `await mesa.getChangeId(` → `await getMesa().getChangeId(`
- Line 101: `await mesa.getChangeId(` → `await getMesa().getChangeId(`
- Line 143: `await mesa.mergeBranch(` → `await getMesa().mergeBranch(`
- Line 164: `await mesa.readFile(` → `await getMesa().readFile(`
- Line 167: `await mesa.writeFile(` → `await getMesa().writeFile(`
- Line 177: `await mesa.readFile(` → `await getMesa().readFile(`
- Line 200: `await mesa.deleteBranch(` → `await getMesa().deleteBranch(`
- Line 207: `await mesa.readFile(` → `await getMesa().readFile(`
- Line 224: `await mesa.deleteBranch(` → `await getMesa().deleteBranch(`
- Line 237: `await mesa.readFile(` → `await getMesa().readFile(`
- Line 264: `const active = mesa.backendName()` → `const active = getMesa().backendName()`
- Line 265: Uses `process.env.MESA_API_KEY` — this is fine for now, will be updated in Task 5
- Line 289: Uses `process.env.MESA_API_KEY` — will be updated in Task 5

- [ ] **Step 5: Verify the server compiles**

Run:
```bash
npx tsc -p tsconfig.server.json --noEmit
```
Expected: No new errors from these files (pre-existing errors in `sentiment.ts` and `market.ts` are fine).

- [ ] **Step 6: Commit**

```bash
git add server/agents/base.ts server/services/memory.ts server/services/playbook.ts server/routes/api.ts
git commit -m "refactor: update all mesa consumer files to use getMesa() getter"
```

---

### Task 4: Refactor Anthropic Client to Dynamic Initialization

**Files:**
- Modify: `server/services/claude.ts`

Currently uses `loadApiKey()` which reads `.env` and `process.env`. Replace with explicit `reinitializeAnthropic()` and `hasAnthropicKey()`.

- [ ] **Step 1: Rewrite the client initialization section**

Replace lines 1–26 of `server/services/claude.ts` (everything from `import Anthropic` through the closing `}` of `getClient()`) with:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { Portfolio, TradeAction } from "../../shared/types.js";

let client: Anthropic | null = null;

export function reinitializeAnthropic(apiKey: string): void {
  client = new Anthropic({ apiKey });
}

export function clearAnthropic(): void {
  client = null;
}

export function hasAnthropicKey(): boolean {
  return client !== null;
}

function getClient(): Anthropic {
  if (!client) {
    throw new Error("Anthropic API key not configured — add it in Settings");
  }
  return client;
}
```

This removes the `loadApiKey()` function, the `readFileSync` import, the `resolve` import, and the `dotenv`-style `.env` reading.

- [ ] **Step 2: Verify the server compiles**

Run:
```bash
npx tsc -p tsconfig.server.json --noEmit
```
Expected: No new errors from `claude.ts`.

- [ ] **Step 3: Commit**

```bash
git add server/services/claude.ts
git commit -m "refactor: replace loadApiKey with dynamic reinitializeAnthropic()"
```

---

### Task 5: Add Key Management API Endpoints and Server-Side Guards

**Files:**
- Modify: `shared/types.ts`
- Modify: `client/src/types.ts`
- Modify: `server/routes/api.ts`

- [ ] **Step 1: Add `KeyStatus` type to `shared/types.ts`**

Append at the end of the file:

```typescript
export interface KeyStatus {
  mesa: boolean;
  anthropic: boolean;
}
```

- [ ] **Step 2: Re-export `KeyStatus` from `client/src/types.ts`**

Add `KeyStatus` to the re-export list at line 1:

```typescript
export type {
  Portfolio,
  Holding,
  TradeAction,
  AgentProposal,
  AgentResult,
  AgentMemory,
  PastPredictionRecord,
  PlaybookEntry,
  MarketQuote,
  StorageBackend,
  MesaDiffHunk,
  MesaDiffEntry,
  MesaDiffResponse,
  MesaActivityEvent,
  KeyStatus,
} from "@shared/types.js";
```

- [ ] **Step 3: Add key management endpoints and update settings in `server/routes/api.ts`**

Add these imports at the top of the file (alongside existing imports):

```typescript
import { hasKey, setKey, deleteKey, getKey, initConfigDb } from "../services/config.js";
import { hasAnthropicKey, reinitializeAnthropic, clearAnthropic } from "../services/claude.js";
import { reinitializeMesa } from "../services/mesa.js";
```

Update the existing `getMesa` import to also include `reinitializeMesa`:
```typescript
import { getMesa, reinitializeMesa } from "../services/mesa.js";
```

Add the POST endpoint after the existing `/api/settings` GET route (after line 301):

```typescript
apiRouter.post("/settings/keys", async (req, res) => {
  try {
    const { mesa: mesaKey, anthropic: anthropicKey } = req.body as {
      mesa?: string;
      anthropic?: string;
    };

    if (anthropicKey) {
      try {
        const testClient = new (await import("@anthropic-ai/sdk")).default({ apiKey: anthropicKey });
        await testClient.messages.countTokens({
          model: "claude-haiku-4-5-20251001",
          messages: [{ role: "user", content: "test" }],
        });
      } catch {
        res.json({ ok: false, error: "Invalid Anthropic API key" });
        return;
      }
      setKey("ANTHROPIC_API_KEY", anthropicKey);
      reinitializeAnthropic(anthropicKey);
    }

    if (mesaKey) {
      try {
        const { Mesa } = await import("@mesadev/sdk");
        const testClient = new Mesa({ apiKey: mesaKey });
        await testClient.whoami();
      } catch {
        res.json({ ok: false, error: "Invalid Mesa API key" });
        return;
      }
      setKey("MESA_API_KEY", mesaKey);
      await reinitializeMesa(mesaKey);
    }

    const active = getMesa().backendName();
    res.json({
      ok: true,
      keys: { mesa: hasKey("MESA_API_KEY"), anthropic: hasKey("ANTHROPIC_API_KEY") },
      backends: [
        {
          name: "local-fs",
          label: "Local filesystem",
          description: "Branches and history live in a directory on disk.",
          available: true,
          active: active === "local-fs",
        },
        {
          name: "mesa-sdk",
          label: "Mesa SDK · api.mesa.dev",
          description: "Real branches on Mesa's versioned filesystem.",
          available: hasKey("MESA_API_KEY"),
          active: active === "mesa-sdk",
        },
      ],
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to save keys" });
  }
});
```

Add the DELETE endpoint:

```typescript
apiRouter.delete("/settings/keys", async (_req, res) => {
  try {
    deleteKey("MESA_API_KEY");
    deleteKey("ANTHROPIC_API_KEY");
    await reinitializeMesa();
    clearAnthropic();
    res.json({ ok: true, keys: { mesa: false, anthropic: false } });
  } catch (error) {
    res.status(500).json({ error: "Failed to clear keys" });
  }
});
```

- [ ] **Step 4: Update the existing `/api/settings` GET route**

Replace the existing settings endpoint (lines 263–301) with:

```typescript
apiRouter.get("/settings", async (_req, res) => {
  const active = getMesa().backendName();
  const hasMesaKey = hasKey("MESA_API_KEY");

  const backends: StorageBackend[] = [
    {
      name: "local-fs",
      label: "Local filesystem",
      description:
        "Branches and history live in a directory on disk. Fully functional. Used as the development fallback.",
      available: true,
      active: active === "local-fs",
    },
    {
      name: "mesa-sdk",
      label: "Mesa SDK · api.mesa.dev",
      description:
        "Real branches on Mesa's versioned filesystem. Sub-50ms reads, instant forks, full audit trail. Connected via MESA_API_KEY.",
      available: hasMesaKey,
      active: active === "mesa-sdk",
    },
  ];

  let mesaInfo: { org?: string; repo?: string; whoami?: string } | undefined;
  if (active === "mesa-sdk") {
    try {
      const mesaApiKey = getKey("MESA_API_KEY");
      if (mesaApiKey) {
        const { Mesa } = await import("@mesadev/sdk");
        const client = new Mesa({ apiKey: mesaApiKey });
        const who = await client.whoami();
        mesaInfo = {
          org: who.org.slug,
          repo: "portfolio-advisor",
          whoami: who.key_name ?? who.key_id ?? "unknown",
        };
      }
    } catch { /* skip */ }
  }

  res.json({
    backends,
    mesaInfo,
    keys: { mesa: hasMesaKey, anthropic: hasKey("ANTHROPIC_API_KEY") },
  });
});
```

- [ ] **Step 5: Add server-side guard on `/api/analyze` and `/api/replay`**

At the top of the `apiRouter.post("/analyze")` handler (line 110, inside the try block, before `const result = await runAnalysis`), add:

```typescript
    if (!hasAnthropicKey()) {
      res.status(400).json({ error: "Anthropic API key not configured — add it in Settings" });
      return;
    }
```

Similarly, at the top of the `apiRouter.post("/replay")` handler (line 134, inside the try block, before `const { from }`), add the same guard:

```typescript
    if (!hasAnthropicKey()) {
      res.status(400).json({ error: "Anthropic API key not configured — add it in Settings" });
      return;
    }
```

- [ ] **Step 6: Verify the server compiles**

Run:
```bash
npx tsc -p tsconfig.server.json --noEmit
```
Expected: No new errors.

- [ ] **Step 7: Commit**

```bash
git add shared/types.ts client/src/types.ts server/routes/api.ts
git commit -m "feat: add key management API endpoints with validation and server-side guards"
```

---

### Task 6: Update Boot Sequence and Webhook Endpoint

**Files:**
- Modify: `server/index.ts`
- Modify: `.gitignore`
- Modify: `.env.example`

- [ ] **Step 1: Rewrite `server/index.ts`**

Replace the entire file with:

```typescript
import express from "express";
import cors from "cors";
import { Mesa } from "@mesadev/sdk";
import { getMesa, reinitializeMesa } from "./services/mesa.js";
import { initConfigDb, getKey } from "./services/config.js";
import { reinitializeAnthropic } from "./services/claude.js";
import { apiRouter } from "./routes/api.js";
import { sseHandler, emitActivity } from "./routes/events.js";
import type { Portfolio } from "../shared/types.js";

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());
app.use("/api", apiRouter);
app.get("/api/events", sseHandler);

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

app.post("/api/webhooks/mesa", express.raw({ type: "application/json" }), async (req, res) => {
  const apiKey = getKey("MESA_API_KEY");
  const webhookSecret = process.env.MESA_WEBHOOK_SECRET;
  if (!apiKey || !webhookSecret) {
    res.status(501).json({ error: "Webhooks not configured" });
    return;
  }

  const client = new Mesa({ apiKey, webhookSecret });

  client.webhooks.on("change.created", (event) => {
    emitActivity("file_written", `External change: ${event.data.change.message ?? "no message"}`);
  });

  client.webhooks.on("bookmark.merged", (event) => {
    emitActivity("branch_merged", `External merge: bookmark ${event.data.bookmark.name}`, {
      branch: event.data.bookmark.name,
    });
  });

  try {
    await client.webhooks.receive(new Request(`http://localhost${req.url}`, {
      method: "POST",
      headers: new Headers(
        Object.entries(req.headers)
          .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      ),
      body: req.body,
    }));
    res.json({ ok: true });
  } catch (error) {
    console.error("Webhook processing failed:", error);
    res.status(400).json({ error: "Invalid webhook" });
  }
});

async function start() {
  // 1. Initialize SQLite config database
  initConfigDb();

  // 2. Restore Anthropic client from stored key
  const anthropicKey = getKey("ANTHROPIC_API_KEY");
  if (anthropicKey) {
    reinitializeAnthropic(anthropicKey);
    console.log("Anthropic key loaded from config database");
  } else {
    console.log("No Anthropic key configured — add it in Settings");
  }

  // 3. Restore Mesa backend from stored key
  const mesaKey = getKey("MESA_API_KEY");
  await reinitializeMesa(mesaKey ?? undefined);

  // 4. Seed portfolio if not present
  try {
    await getMesa().readFile("main", "portfolio.json");
  } catch {
    await getMesa().writeFile("main", "portfolio.json", JSON.stringify(DEFAULT_PORTFOLIO, null, 2));
    console.log("Initialized default portfolio on main branch");
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start().catch(console.error);
```

- [ ] **Step 2: Add `.mesa/` to `.gitignore`**

Append `.mesa/` to the end of `.gitignore`:

```
node_modules/
dist/
dist-server/
.env
mesa-repo/
docs/blog/
.mesa/
```

- [ ] **Step 3: Update `.env.example`**

Replace the entire file with:

```
# API keys are now managed via the Settings panel in the UI.
# No .env configuration is required to run the demo.
#
# The only exception is the webhook secret, which is used for
# advanced Mesa webhook integration (optional):
MESA_WEBHOOK_SECRET=            # Optional — for receiving Mesa webhooks
```

- [ ] **Step 4: Verify the server compiles**

Run:
```bash
npx tsc -p tsconfig.server.json --noEmit
```
Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add server/index.ts .gitignore .env.example
git commit -m "feat: boot sequence reads keys from SQLite, webhook uses config db"
```

---

### Task 7: Frontend — Settings Panel Key Inputs, Inline Prompt, and Hook

**Files:**
- Modify: `client/src/hooks/useApi.ts`
- Modify: `client/src/components/SettingsPanel.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Update `useSettings` hook in `client/src/hooks/useApi.ts`**

Replace the `useSettings` function (lines 172–196) with:

```typescript
export function useSettings() {
  const [backends, setBackends] = useState<StorageBackend[]>([]);
  const [loading, setLoading] = useState(true);
  const [mesaInfo, setMesaInfo] = useState<{ org?: string; repo?: string; whoami?: string } | undefined>();
  const [keys, setKeys] = useState<{ mesa: boolean; anthropic: boolean }>({ mesa: false, anthropic: false });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      setBackends(data.backends ?? []);
      setMesaInfo(data.mesaInfo);
      setKeys(data.keys ?? { mesa: false, anthropic: false });
    } catch {
      console.error("Failed to fetch settings");
    } finally {
      setLoading(false);
    }
  }, []);

  const saveKeys = useCallback(async (keysToSave: { mesa?: string; anthropic?: string }) => {
    const res = await fetch("/api/settings/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(keysToSave),
    });
    const data = await res.json();
    if (data.ok) {
      await refresh();
    }
    return data;
  }, [refresh]);

  const clearKeys = useCallback(async () => {
    const res = await fetch("/api/settings/keys", { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      await refresh();
    }
    return data;
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { backends, loading, refresh, mesaInfo, keys, saveKeys, clearKeys };
}
```

- [ ] **Step 2: Rewrite `client/src/components/SettingsPanel.tsx`**

Replace the entire file with:

```typescript
import { useEffect, useState } from "react";
import type { StorageBackend } from "../types.js";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  backends: StorageBackend[];
  loading: boolean;
  mesaInfo?: { org?: string; repo?: string; whoami?: string };
  keys: { mesa: boolean; anthropic: boolean };
  onSaveKeys: (keys: { mesa?: string; anthropic?: string }) => Promise<{ ok: boolean; error?: string }>;
  onClearKeys: () => Promise<{ ok: boolean }>;
}

export function SettingsPanel({
  open,
  onClose,
  backends,
  loading,
  mesaInfo,
  keys,
  onSaveKeys,
  onClearKeys,
}: SettingsPanelProps) {
  const [anthropicInput, setAnthropicInput] = useState("");
  const [mesaInput, setMesaInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const handleSave = async () => {
    const keysToSave: { mesa?: string; anthropic?: string } = {};
    if (anthropicInput.trim()) keysToSave.anthropic = anthropicInput.trim();
    if (mesaInput.trim()) keysToSave.mesa = mesaInput.trim();
    if (!keysToSave.anthropic && !keysToSave.mesa) return;

    setSaving(true);
    setError(null);
    const result = await onSaveKeys(keysToSave);
    setSaving(false);
    if (result.ok) {
      setAnthropicInput("");
      setMesaInput("");
    } else {
      setError(result.error ?? "Failed to save keys");
    }
  };

  const handleClear = async () => {
    setSaving(true);
    setError(null);
    await onClearKeys();
    setSaving(false);
    setAnthropicInput("");
    setMesaInput("");
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-ink/20 z-40 transition-opacity duration-300 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Flyout */}
      <aside
        className={`fixed top-0 right-0 bottom-0 w-full max-w-md bg-canvas border-l border-line z-50 overflow-y-auto transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-center justify-between px-8 py-6 border-b border-line">
          <div>
            <div className="section-label">Settings</div>
            <h2 className="display-heading text-2xl mt-1">Configuration</h2>
          </div>
          <button
            onClick={onClose}
            className="text-mute hover:text-ink transition-colors font-mono text-lg"
            aria-label="Close settings"
          >
            ✕
          </button>
        </header>

        <div className="px-8 py-6">
          {/* API Keys Section */}
          <div className="mb-10">
            <div className="section-label mb-4">API Keys</div>
            <p className="serif-quote text-sm text-ink-2 leading-relaxed mb-6">
              Keys are encrypted and stored locally. They persist across server restarts and are never sent to any third party.
            </p>

            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-2 font-mono text-xs tracking-wide text-ink mb-2">
                  Anthropic API Key
                  {keys.anthropic && <span className="text-up text-sm">●</span>}
                </label>
                <input
                  type="password"
                  value={anthropicInput}
                  onChange={(e) => setAnthropicInput(e.target.value)}
                  placeholder={keys.anthropic ? "Configured — enter new key to replace" : "sk-ant-..."}
                  className="w-full border border-line bg-transparent px-4 py-2.5 font-mono text-sm text-ink placeholder:text-mute focus:outline-none focus:border-ink transition-colors"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 font-mono text-xs tracking-wide text-ink mb-2">
                  Mesa API Key
                  {keys.mesa && <span className="text-up text-sm">●</span>}
                </label>
                <input
                  type="password"
                  value={mesaInput}
                  onChange={(e) => setMesaInput(e.target.value)}
                  placeholder={keys.mesa ? "Configured — enter new key to replace" : "mesa_..."}
                  className="w-full border border-line bg-transparent px-4 py-2.5 font-mono text-sm text-ink placeholder:text-mute focus:outline-none focus:border-ink transition-colors"
                />
                <p className="text-xs text-mute mt-1.5">
                  Optional — without it, the local filesystem backend is used.
                </p>
              </div>
            </div>

            {error && (
              <div className="mt-4 text-sm font-mono text-down">{error}</div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSave}
                disabled={saving || (!anthropicInput.trim() && !mesaInput.trim())}
                className="font-mono text-xs uppercase tracking-widest px-4 py-2 bg-ink text-canvas hover:bg-mesa transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? "Saving…" : "Save keys"}
              </button>
              {(keys.mesa || keys.anthropic) && (
                <button
                  onClick={handleClear}
                  disabled={saving}
                  className="font-mono text-xs uppercase tracking-widest px-4 py-2 border border-line text-ink hover:border-down hover:text-down transition-colors disabled:opacity-40"
                >
                  Clear all keys
                </button>
              )}
            </div>
          </div>

          {/* Storage backend section */}
          <div className="pt-6 border-t border-line">
            <div className="section-label mb-4">Storage backend</div>
            <p className="serif-quote text-base text-ink-2 leading-relaxed mb-8">
              Mesa is designed around a versioned filesystem interface. This demo can run against either a local filesystem fallback or the real Mesa SDK — same API, different backend.
            </p>

            {loading && <div className="section-label">Loading…</div>}

            <ul className="space-y-4">
              {backends.map((b) => (
                <li
                  key={b.name}
                  className={`border p-6 transition-colors ${
                    b.active
                      ? "border-ink bg-canvas"
                      : b.available
                      ? "border-line hover:border-ink/40"
                      : "border-line opacity-60"
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-mono text-sm tracking-wide text-ink">{b.label}</div>
                      {b.active && (
                        <div className="section-label text-mesa mt-1">● Active</div>
                      )}
                      {!b.available && !b.active && (
                        <div className="section-label text-mute mt-1">Unavailable · add Mesa key above</div>
                      )}
                    </div>
                    <button
                      disabled={!b.available || b.active}
                      className="font-mono text-xs uppercase tracking-widest text-ink border border-line px-3 py-1.5 hover:border-ink hover:bg-ink hover:text-canvas transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-ink"
                      title={
                        b.active
                          ? "Already active"
                          : !b.available
                          ? "Add Mesa API key above"
                          : "Switch backend"
                      }
                    >
                      {b.active ? "Active" : "Switch"}
                    </button>
                  </div>
                  <p className="text-sm text-ink-2 leading-relaxed">{b.description}</p>
                </li>
              ))}
            </ul>
          </div>

          {mesaInfo && (
            <div className="mt-8 pt-6 border-t border-line">
              <div className="section-label mb-3">Mesa connection</div>
              <div className="font-mono text-xs space-y-2 text-ink-2">
                <div className="flex justify-between">
                  <span className="text-mute">org</span>
                  <span>{mesaInfo.org}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-mute">repo</span>
                  <span>{mesaInfo.repo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-mute">key</span>
                  <span>{mesaInfo.whoami}</span>
                </div>
              </div>
            </div>
          )}

          <div className="mt-10 pt-6 border-t border-line">
            <div className="section-label mb-3">How the swap works</div>
            <p className="serif-quote text-sm text-mute leading-relaxed">
              Every Mesa operation in this app — read, write, branch, merge, list — goes through a single <span className="font-mono not-italic text-ink-2">MesaService</span> interface. Switching backends replaces the implementation behind that interface. No agent code, no API route, no UI component changes.
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
```

- [ ] **Step 3: Update `client/src/App.tsx`**

Three changes needed:

**a.** Update the `useSettings` destructure (line 22) to include `keys`, `saveKeys`, `clearKeys`:

```typescript
  const { backends, loading: settingsLoading, mesaInfo, keys, saveKeys, clearKeys } = useSettings();
```

**b.** Add the inline prompt below the "Run analysis" button. Replace lines 105–117 (the `<button onClick={analyze}...` block) with:

```typescript
              <button
                onClick={analyze}
                disabled={state.status === "loading" || !keys.anthropic}
                className="group inline-flex items-center gap-3 px-6 py-3 bg-ink text-canvas hover:bg-mesa transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="font-mono text-xs tracking-widest uppercase">
                  {state.status === "loading" ? "Analysing" : "Run analysis"}
                </span>
                <span className="font-mono text-base group-hover:translate-x-1 transition-transform">
                  →
                </span>
              </button>
              {!keys.anthropic && (
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="section-label text-mesa hover:underline cursor-pointer mt-3 block text-left"
                >
                  Add your Anthropic API key in Settings to begin →
                </button>
              )}
```

**c.** Update the `<SettingsPanel>` component props (lines 242–248) to pass the new props:

```typescript
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        backends={backends}
        loading={settingsLoading}
        mesaInfo={mesaInfo}
        keys={keys}
        onSaveKeys={saveKeys}
        onClearKeys={clearKeys}
      />
```

- [ ] **Step 4: Verify the client compiles**

Run:
```bash
npx tsc -p tsconfig.json --noEmit 2>&1 | grep -v "TS2882" | head -20
```
Expected: No new errors (TS2882 is a pre-existing Vite CSS import warning).

- [ ] **Step 5: Verify the server compiles**

Run:
```bash
npx tsc -p tsconfig.server.json --noEmit
```
Expected: No new errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/hooks/useApi.ts client/src/components/SettingsPanel.tsx client/src/App.tsx
git commit -m "feat: settings panel key inputs, inline prompt, and key management hooks"
```

---

## Post-Implementation Verification

After all tasks are complete, verify the full flow:

1. `npm run dev` — server starts without errors, logs "No Anthropic key configured"
2. Open `http://localhost:5173` — "Run analysis" button is disabled, inline prompt visible
3. Click the inline prompt or settings cog — settings panel opens with API key inputs
4. Enter an Anthropic API key → click "Save keys" → green dot appears, button enables
5. Enter a Mesa API key → click "Save keys" → backend switches to mesa-sdk
6. Restart the server — keys persist, backends reinitialize from SQLite
7. "Clear all keys" → resets to local-fs, analysis button disables again
