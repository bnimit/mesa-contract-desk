import "dotenv/config";
import express from "express";
import cors from "cors";
import { mesa } from "./services/mesa.js";
import { apiRouter } from "./routes/api.js";
import type { Portfolio } from "../shared/types.js";

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
