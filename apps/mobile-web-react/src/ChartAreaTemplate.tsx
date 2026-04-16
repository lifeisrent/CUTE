import React, { useMemo, useRef, useState } from "react";
import HistoryChartTemplate from "./HistoryChartTemplate";
import { useRealtimeUplotTemplate } from "./useRealtimeUplotTemplate";
import type { DateRange, FetchHistoryFn, HistoryPoint, RealtimeProvider, SensorSeries } from "./types";
import "uplot/dist/uPlot.min.css";

type Props = {
  series: SensorSeries[];
  selectedSensorIds: Set<string>;
  fetchHistory: FetchHistoryFn;
  realtimeProvider: RealtimeProvider;
};

type Mode = "realtime" | "history";

export default function ChartAreaTemplate({
  series,
  selectedSensorIds,
  fetchHistory,
  realtimeProvider,
}: Props) {
  const [mode, setMode] = useState<Mode>("realtime");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<HistoryPoint[]>([]);
  const [showLegend, setShowLegend] = useState(true);

  const realtimeRef = useRef<HTMLDivElement | null>(null);

  const selectedSeries = useMemo(
    () => series.filter((s) => selectedSensorIds.has(s.sensorId)),
    [series, selectedSensorIds]
  );

  const { isLive, dataCount, resetToLive, exportCsv } = useRealtimeUplotTemplate({
    chartRef: realtimeRef,
    series: selectedSeries,
    visibleSensorIds: new Set(selectedSeries.map((s) => s.sensorId)),
    provider: realtimeProvider,
    windowMs: 60 * 60 * 1000,
    height: 320,
    showLegend,
  });

  const loadHistory = async (range: DateRange) => {
    if (selectedSensorIds.size === 0) {
      setError("센서를 먼저 선택하세요.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const sensorIds = Array.from(selectedSensorIds);
      const data = await fetchHistory({ sensorIds, range });
      setHistoryData(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "히스토리 로드 실패");
    } finally {
      setLoading(false);
    }
  };

  if (selectedSensorIds.size === 0) {
    return <div style={{ padding: 12 }}>센서를 선택하면 차트가 표시됩니다.</div>;
  }

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <header style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={() => setMode("realtime")} disabled={mode === "realtime"}>
          Realtime
        </button>
        <button type="button" onClick={() => setMode("history")} disabled={mode === "history"}>
          History
        </button>
        <button type="button" onClick={() => setShowLegend((v) => !v)}>
          Legend: {showLegend ? "On" : "Off"}
        </button>
        {mode === "realtime" ? (
          <>
            <button type="button" onClick={resetToLive}>Reset Live</button>
            <button type="button" onClick={exportCsv}>CSV Export</button>
            <span style={{ fontSize: 12 }}>Live: {isLive ? "Yes" : "No"} / Points: {dataCount}</span>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() =>
                void loadHistory({
                  startIso: new Date(Date.now() - 3_600_000).toISOString(),
                  endIso: new Date().toISOString(),
                  interval: "Raw",
                  aggregation: "Avg",
                })
              }
            >
              Load 1h
            </button>
          </>
        )}
      </header>

      {error && <div style={{ color: "crimson" }}>{error}</div>}

      <div style={{ minHeight: 340, height: "100%" }}>
        {mode === "realtime" ? (
          <div ref={realtimeRef} style={{ width: "100%", height: 340 }} />
        ) : (
          <HistoryChartTemplate
            data={historyData}
            series={selectedSeries}
            loading={loading}
            showLegend={showLegend}
            height={340}
          />
        )}
      </div>
    </section>
  );
}
