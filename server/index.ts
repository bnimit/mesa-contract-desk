import express from "express";
import cors from "cors";
import { Mesa } from "@mesadev/sdk";
import { mesa } from "./services/mesa.js";
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
  const apiKey = process.env.MESA_API_KEY;
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
