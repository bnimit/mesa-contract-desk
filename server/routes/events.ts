import type { Request, Response } from "express";
import type { MesaActivityEvent } from "../../shared/types.js";

const clients = new Set<Response>();
let eventId = 0;

export function sseHandler(req: Request, res: Response) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(":\n\n");
  clients.add(res);
  req.on("close", () => clients.delete(res));
}

export function broadcast(event: MesaActivityEvent) {
  eventId++;
  const data = `id: ${eventId}\nevent: mesa\ndata: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) {
    client.write(data);
  }
}

export function emitActivity(
  type: MesaActivityEvent["type"],
  detail: string,
  extra?: { agent?: string; branch?: string }
) {
  broadcast({
    id: String(Date.now()) + "-" + Math.random().toString(36).slice(2, 6),
    type,
    detail,
    timestamp: Date.now(),
    ...extra,
  });
}
