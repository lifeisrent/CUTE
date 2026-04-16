import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import ChartAreaTemplate from "./ChartAreaTemplate";
import type { DateRange, FetchHistoryFn, HistoryPoint, RealtimePoint, RealtimeProvider, SensorSeries } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

const series: SensorSeries[] = [
  { sensorId: "mock-1:power", name: "Power", color: "#5cc8ff" },
  { sensorId: "mock-2:power", name: "Power #2", color: "#f59e0b" },
];

const fetchHistory: FetchHistoryFn = async ({ sensorIds, range }: { sensorIds: string[]; range: DateRange }) => {
  const resp = await fetch(`${API_BASE_URL}/events?limit=500`);
  if (!resp.ok) throw new Error(`history fetch failed (${resp.status})`);
  const json = await resp.json();
  const items = Array.isArray(json.items) ? json.items : [];

  const start = Date.parse(range.startIso);
  const end = Date.parse(range.endIso);

  const normalized: HistoryPoint[] = items
    .filter((e: any) => e?.type === "power" && typeof e?.timestamp === "string")
    .filter((e: any) => {
      const t = Date.parse(e.timestamp);
      return Number.isFinite(t) && t >= start && t <= end;
    })
    .map((e: any) => {
      const sensorKey = `${e.sensorId}:${e.type}`;
      const values: Record<string, number | null> = {};
      sensorIds.forEach((id) => {
        values[id] = id === sensorKey && typeof e.value === "number" ? e.value : null;
      });
      return {
        timestampMs: Date.parse(e.timestamp),
        values,
      };
    });

  return normalized;
};

const realtimeProvider: RealtimeProvider = (sensorIds, callback) => {
  const es = new EventSource(`${API_BASE_URL}/stream`);

  const onSensorUpdate = (ev: MessageEvent) => {
    try {
      const payload = JSON.parse(ev.data || "{}");
      const key = `${payload.sensorId}:${payload.type}`;
      if (!sensorIds.includes(key)) return;
      const point: RealtimePoint = {
        timestampMs: Date.parse(payload.timestamp || new Date().toISOString()),
        values: {
          [key]: typeof payload.value === "number" ? payload.value : null,
        },
      };
      callback(point);
    } catch {
      // ignore malformed payload
    }
  };

  es.addEventListener("sensor.update", onSensorUpdate as EventListener);

  return () => {
    es.removeEventListener("sensor.update", onSensorUpdate as EventListener);
    es.close();
  };
};

function App() {
  const [selected, setSelected] = useState<Set<string>>(new Set(["mock-1:power"]));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedCount = useMemo(() => selected.size, [selected]);

  return (
    <main style={{ padding: 16, fontFamily: "Arial, sans-serif", color: "#fff", background: "#0d0b1f", minHeight: "100vh" }}>
      <h1 style={{ marginTop: 0 }}>CUTE React uPlot Testbed</h1>
      <p style={{ color: "rgba(255,255,255,.72)" }}>
        API: {API_BASE_URL} · 선택 센서 {selectedCount}개
      </p>

      <section style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {series.map((s) => (
          <label key={s.sensorId} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={selected.has(s.sensorId)}
              onChange={() => toggle(s.sensorId)}
            />
            <span>{s.name} ({s.sensorId})</span>
          </label>
        ))}
      </section>

      <ChartAreaTemplate
        series={series}
        selectedSensorIds={selected}
        fetchHistory={fetchHistory}
        realtimeProvider={realtimeProvider}
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
