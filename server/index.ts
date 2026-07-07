import express from "express";
import cors from "cors";
import { Mesa } from "@mesadev/sdk";
import { initConfigDb, getKey } from "./services/config.js";
import { reinitializeAnthropic } from "./services/claude.js";
import { apiRouter } from "./routes/api.js";
import { sseHandler, emitActivity } from "./routes/events.js";

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

app.use(cors());
app.use(express.json());
app.get("/api/events", sseHandler);
app.use("/api", apiRouter);

// In production, serve the built Vite client
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.get("/{*splat}", (_req, res, next) => {
  if (_req.path.startsWith("/api")) return next();
  res.sendFile(path.join(clientDist, "index.html"));
});

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

  const { activateBackend } = await import("./services/review.js");

  // 3. Come up on the local filesystem backend FIRST. It needs no network,
  //    so the server is reachable and the demo fully works immediately — even
  //    if a stored Mesa key is invalid/expired or api.mesa.dev is unreachable.
  await activateBackend(undefined);
  console.log("Contract seeded on main branch (local filesystem)");

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // 4. If a Mesa key is stored, upgrade to the real Mesa cloud backend in the
  //    background. A bad key or cloud hiccup can no longer brick startup — the
  //    app just stays on local-fs.
  const mesaKey = getKey("MESA_API_KEY");
  if (mesaKey) {
    activateBackend(mesaKey)
      .then(({ backend, fellBack }) => {
        console.log(fellBack
          ? "Mesa key present but cloud backend init failed — staying on local filesystem"
          : `Upgraded to ${backend} backend (api.mesa.dev)`);
      })
      .catch((err) => console.error("Backend upgrade error:", err));
  }
}

start().catch(console.error);
