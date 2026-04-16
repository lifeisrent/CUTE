import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import ChartAreaTemplate from "./ChartAreaTemplate";
import type { DateRange, FetchHistoryFn, HistoryPoint, RealtimePoint, RealtimeProvider, SensorSeries } from "./types";
import "./global.css";

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

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 17H5l2-2v-4a5 5 0 1 1 10 0v4l2 2h-4" />
      <path d="M9 17a3 3 0 0 0 6 0" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20a8 8 0 0 1 16 0" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m3 11 9-7 9 7" />
      <path d="M5 10v10h14V10" />
    </svg>
  );
}

function SampleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m4 20 8-16 8 16" />
      <path d="M8 14h8" />
    </svg>
  );
}

function BrowseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 4h16v16H4z" />
      <path d="m9 9 6 6" />
      <path d="m15 9-6 6" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19 21 12 16 5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

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
    <div className="app-shell">
      <header className="home-topbar">
        <div className="brand-wrap">
          <div className="brand-logo">▶</div>
          <div className="brand-title">CUTE</div>
        </div>
        <div className="top-icons">
          <span className="top-icon"><BellIcon /></span>
          <span className="top-icon"><SearchIcon /></span>
          <span className="top-icon"><UserIcon /></span>
        </div>
      </header>

      <div className="chips">
        <button className="chip">실시간</button>
        <button className="chip">히스토리</button>
        <button className="chip">센서</button>
        <button className="chip">제어</button>
        <button className="chip">보관함</button>
      </div>

      <h1 className="home-title">CUTE Dashboard</h1>
      <div className="home-sub">API: {API_BASE_URL} · 선택 센서 {selectedCount}개</div>

      <section style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {series.map((s) => (
          <label key={s.sensorId} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={selected.has(s.sensorId)}
              onChange={() => toggle(s.sensorId)}
            />
            <span>{s.name} ({s.sensorId})</span>
          </label>
        ))}
      </section>

      <div className="surface-card">
        <ChartAreaTemplate
          series={series}
          selectedSensorIds={selected}
          fetchHistory={fetchHistory}
          realtimeProvider={realtimeProvider}
        />
      </div>

      <nav className="bottom-nav">
        <button className="nav-item on">
          <span className="nav-icon"><HomeIcon /></span>
          <span className="nav-label">홈</span>
        </button>
        <button className="nav-item">
          <span className="nav-icon"><SampleIcon /></span>
          <span className="nav-label">샘플</span>
        </button>
        <button className="nav-item">
          <span className="nav-icon"><BrowseIcon /></span>
          <span className="nav-label">둘러보기</span>
        </button>
        <button className="nav-item">
          <span className="nav-icon"><ArchiveIcon /></span>
          <span className="nav-label">보관함</span>
        </button>
      </nav>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
