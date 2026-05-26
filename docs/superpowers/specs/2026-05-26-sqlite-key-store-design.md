# SQLite Key Store Design

**Goal:** Replace .env-based API key configuration with a server-side SQLite database. Keys are entered via the settings panel UI, encrypted and stored locally, and persist across server restarts. Zero-config demo experience.

**Architecture:** Server-side SQLite database (`.mesa/config.db`, gitignored) stores AES-256-GCM encrypted API keys. The settings panel gets key input fields. The server exposes endpoints to save/clear keys and reinitializes backends dynamically on key change and on boot.

**Tech Stack:** `better-sqlite3` for SQLite, Node `crypto` for AES-256-GCM encryption.

---

## Components

### 1. Config Service — `server/services/config.ts`

SQLite key store using `better-sqlite3`.

- Database location: `.mesa/config.db` (gitignored, lives alongside the project)
- Single `config` table: `key TEXT PRIMARY KEY, value TEXT NOT NULL` (value is the encrypted blob as hex)
- Encryption: AES-256-GCM via Node `crypto` module, using a static app-level 32-byte key derived from a fixed passphrase with `scryptSync`. The IV is random per encryption, prepended to the ciphertext along with the auth tag.
- Exports:
  - `getKey(name: string): string | null` — decrypt and return, or null
  - `setKey(name: string, value: string): void` — encrypt and upsert
  - `deleteKey(name: string): void` — remove from DB
  - `hasKey(name: string): boolean` — check existence without decrypting
  - `initConfigDb(): void` — create `.mesa/` dir and config table if not exists

### 2. Dynamic Backend Initialization — `server/services/mesa.ts`

The current `mesa` export is a const assigned at module load. Change to:

- `let currentBackend: MesaService` — mutable module-level variable initialized to `LocalFsMesa`
- `export function getMesa(): MesaService` — getter that returns `currentBackend`
- `export async function reinitializeMesa(apiKey?: string): Promise<void>` — creates `SdkMesa` if key provided, `LocalFsMesa` otherwise, calls `init()`, replaces `currentBackend`

All call sites (`api.ts`, `base.ts`, `memory.ts`, `playbook.ts`) change from `import { mesa }` to `import { getMesa }` and call `getMesa()` where they currently reference `mesa`.

### 3. Dynamic Anthropic Client — `server/services/claude.ts`

The file already has a lazy `getClient()` pattern with a module-level `let client`. Refactor:

- Remove the `loadApiKey()` function (which reads from `process.env` and `.env` file)
- `export function reinitializeAnthropic(apiKey: string): void` — creates new `Anthropic({ apiKey })`, assigns to `client`
- `export function hasAnthropicKey(): boolean` — returns whether client is initialized
- The existing `getClient()` stays but throws a clear error "Anthropic API key not configured — add it in Settings" when `client` is null
- On boot, if SQLite has an Anthropic key, call `reinitializeAnthropic(key)`

### 4. API Endpoints

**`POST /api/settings/keys`**
- Body: `{ mesa?: string, anthropic?: string }`
- **Validate before saving:** For Mesa, attempt `client.whoami()`. For Anthropic, create a client and make a lightweight API call (e.g., count tokens or just instantiate — the SDK validates the key format). If validation fails, return `{ ok: false, error: "Invalid Mesa API key" }` without saving.
- For each valid key: encrypt and store in SQLite
- Reinitialize the relevant backend(s)
- Return: `{ ok: true, keys: { mesa: boolean, anthropic: boolean }, backends: [...] }`

**`DELETE /api/settings/keys`**
- Clears all stored keys from SQLite
- Reinitializes Mesa to local-fs, clears Anthropic client
- Return: `{ ok: true, keys: { mesa: false, anthropic: false } }`

**`GET /api/settings` (existing, extended)**
- Add `keys: { mesa: boolean, anthropic: boolean }` to the response (booleans only, never actual values)
- Keep existing `backends` and `mesaInfo` fields

### 5. Settings Panel UI — `client/src/components/SettingsPanel.tsx`

Add a "API Keys" section above the existing "Storage backend" section:

- Two `<input type="password">` fields: "Anthropic API Key" and "Mesa API Key"
- Each field has:
  - Placeholder text showing the key format (e.g., `sk-ant-...`)
  - A green checkmark indicator when configured (from `keys.mesa`/`keys.anthropic` booleans)
  - "Mesa key is optional — without it, the local filesystem backend is used"
- A "Save keys" button that POSTs to `/api/settings/keys`
- A "Clear all keys" button that DELETEs `/api/settings/keys`
- After save, refresh settings to show updated backend status
- Input fields show empty after save (keys are write-only — never returned from server)

### 6. Inline Prompt — `client/src/App.tsx`

When `keys.anthropic` is false:
- "Run Analysis" button is disabled
- Below it, show: "Add your Anthropic API key in Settings to begin →" in `section-label` style with `text-mesa` color
- Clicking the message opens the settings panel

Mesa key absence is not an error — app works with local-fs backend.

### 6b. Server-side Guard — `server/routes/api.ts`

The `/api/analyze` and `/api/replay` endpoints must check `hasAnthropicKey()` before running agents. If not configured, return `{ error: "Anthropic API key not configured — add it in Settings" }` with status 400. This prevents crashes if the UI state is stale or someone hits the API directly.

### 7. Boot Sequence — `server/index.ts`

```
1. initConfigDb() — ensure .mesa/config.db exists
2. Read ANTHROPIC_API_KEY from SQLite
   → if found, reinitializeAnthropic(key)
   → else, log "No Anthropic key configured"
3. Read MESA_API_KEY from SQLite
   → if found, reinitializeMesa(key)
   → else, reinitializeMesa() (local-fs fallback)
4. Start Express server
```

Environment variables (`process.env.MESA_API_KEY`, `process.env.ANTHROPIC_API_KEY`) are NO LONGER read. All key management goes through SQLite. The `.env` file becomes unnecessary.

### 7b. Webhook Endpoint Update — `server/index.ts`

The `POST /api/webhooks/mesa` handler currently reads `process.env.MESA_API_KEY` and `process.env.MESA_WEBHOOK_SECRET`. Update to read the Mesa key from SQLite via `getKey("MESA_API_KEY")`. The webhook secret is not exposed in the UI — it remains an optional env var for advanced users who set up webhooks manually (keep `process.env.MESA_WEBHOOK_SECRET` for this one).

### 7c. Remove dotenv

Remove the `dotenv` import from `claude.ts` (the `loadApiKey` function that reads `.env` directly). The `dotenv` package can stay in `package.json` for now but is no longer imported anywhere.

### 8. Gitignore

Add `.mesa/` to `.gitignore` so the SQLite database is never committed.

---

## Files Changed

| File | Action | What |
|------|--------|------|
| `server/services/config.ts` | Create | SQLite encrypted key store |
| `server/services/mesa.ts` | Modify | `getMesa()` getter + `reinitializeMesa()` |
| `server/services/mesa-sdk.ts` | Minor | No changes needed (takes apiKey in constructor) |
| `server/services/claude.ts` | Modify | Dynamic client + `reinitializeAnthropic()` |
| `server/routes/api.ts` | Modify | `mesa` → `getMesa()` calls, add key endpoints |
| `server/agents/base.ts` | Modify | `mesa` → `getMesa()` calls |
| `server/services/memory.ts` | Modify | `mesa` → `getMesa()` calls |
| `server/services/playbook.ts` | Modify | `mesa` → `getMesa()` calls |
| `server/index.ts` | Modify | Boot sequence reads SQLite, no more .env |
| `client/src/components/SettingsPanel.tsx` | Modify | Add key input fields |
| `client/src/hooks/useApi.ts` | Modify | `useSettings` returns key status |
| `client/src/App.tsx` | Modify | Inline prompt when no Anthropic key |
| `shared/types.ts` | Modify | Add `KeyStatus` type: `{ mesa: boolean; anthropic: boolean }` |
| `.gitignore` | Modify | Add `.mesa/` |
| `package.json` | Modify | Add `better-sqlite3` + `@types/better-sqlite3` |
| `.env.example` | Modify | Update to note keys are now managed via UI |

---

## Security Notes

- AES-256-GCM encryption key is derived from a static passphrase hardcoded in the app. This is obfuscation, not real security — appropriate for a local-only demo.
- Keys are never returned from the API — only booleans indicating whether they're set.
- The SQLite file is gitignored and local-only.
- No keys are stored in the browser (no localStorage/sessionStorage).
