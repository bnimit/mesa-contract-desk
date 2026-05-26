import { useEffect, useRef, useState, useCallback } from "react";
import type { MesaActivityEvent } from "../types.js";

export function useMesaEvents() {
  const [events, setEvents] = useState<MesaActivityEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/events");
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.addEventListener("mesa", (e) => {
      try {
        const event: MesaActivityEvent = JSON.parse(e.data);
        setEvents((prev) => [event, ...prev].slice(0, 50));
      } catch { /* ignore malformed */ }
    });

    return () => es.close();
  }, []);

  const clear = useCallback(() => setEvents([]), []);

  return { events, connected, clear };
}
