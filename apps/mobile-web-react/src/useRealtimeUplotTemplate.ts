import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import type { RealtimePoint, RealtimeProvider, SensorSeries, UplotAlignedData } from "./types";

type UseRealtimeUplotTemplateArgs = {
  chartRef: React.RefObject<HTMLDivElement>;
  series: SensorSeries[];
  visibleSensorIds: Set<string>;
  provider: RealtimeProvider;
  windowMs?: number;
  height?: number;
  showLegend?: boolean;
};

type UseRealtimeUplotTemplateReturn = {
  isLive: boolean;
  dataCount: number;
  resetToLive: () => void;
  exportCsv: () => void;
  uplot: uPlot | null;
  snapshotData: RealtimePoint[];
};

function makeOptions(args: {
  width: number;
  height: number;
  series: SensorSeries[];
  showLegend: boolean;
  onLeaveLive: () => void;
}): uPlot.Options {
  const { width, height, series, showLegend, onLeaveLive } = args;
  return {
    width,
    height,
    legend: { show: showLegend, live: true, isolate: false },
    padding: [12, 42, 8, 8],
    series: [
      {},
      ...series.map((s) => ({
        label: s.name,
        stroke: s.color,
        width: 2,
        points: { show: false },
      })),
    ],
    scales: {
      x: { time: true },
      y: { auto: true },
    },
    axes: [{}, {}],
    cursor: {
      drag: { x: true, y: false },
    },
    hooks: {
      setScale: [
        (u, key) => {
          if (key !== "x") return;
          const now = Math.floor(Date.now() / 1000);
          if (u.scales.x.max && now - u.scales.x.max > 2) onLeaveLive();
        },
      ],
    },
  };
}

export function useRealtimeUplotTemplate({
  chartRef,
  series,
  visibleSensorIds,
  provider,
  windowMs = 60 * 60 * 1000,
  height = 320,
  showLegend = true,
}: UseRealtimeUplotTemplateArgs): UseRealtimeUplotTemplateReturn {
  const uplotRef = useRef<uPlot | null>(null);
  const xRef = useRef<number[]>([]);
  const ysRef = useRef<(number | null)[][]>([]);
  const lastValuesRef = useRef<Record<string, number | null>>({});
  const [dataCount, setDataCount] = useState(0);
  const [isLive, setIsLive] = useState(true);

  const sensorIds = useMemo(() => series.map((s) => s.sensorId), [series]);
  const visibleIdsKey = useMemo(() => Array.from(visibleSensorIds).sort().join(","), [visibleSensorIds]);

  const resetToLive = useCallback(() => {
    const u = uplotRef.current;
    if (!u) return;
    const nowSec = Math.floor(Date.now() / 1000);
    const windowSec = windowMs / 1000;
    setIsLive(true);
    u.setScale("x", { min: nowSec - windowSec, max: nowSec });
  }, [windowMs]);

  const pushPoint = useCallback(
    (point: RealtimePoint) => {
      const nowSec = Math.floor(point.timestampMs / 1000);
      Object.entries(point.values).forEach(([id, value]) => {
        lastValuesRef.current[id] = typeof value === "number" ? value : null;
      });

      const row = sensorIds.map((id) => {
        const v = lastValuesRef.current[id];
        return typeof v === "number" ? v : null;
      });

      xRef.current.push(nowSec);
      row.forEach((v, index) => ysRef.current[index].push(v));

      const cutoff = nowSec - windowMs / 1000;
      while (xRef.current.length && xRef.current[0] < cutoff) {
        xRef.current.shift();
        ysRef.current.forEach((arr) => arr.shift());
      }

      const u = uplotRef.current;
      if (!u) return;
      u.setData([xRef.current, ...ysRef.current] as UplotAlignedData);

      if (isLive) {
        const windowSec = windowMs / 1000;
        u.setScale("x", { min: nowSec - windowSec, max: nowSec });
      }
      setDataCount(xRef.current.length);
    },
    [sensorIds, windowMs, isLive]
  );

  const exportCsv = useCallback(() => {
    const header = ["Timestamp", ...series.map((s) => s.name)].join(",");
    const lines = xRef.current.map((sec, i) => {
      const row = [new Date(sec * 1000).toISOString(), ...ysRef.current.map((arr) => arr[i] ?? "")];
      return row.join(",");
    });
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `realtime_uplot_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [series]);

  useEffect(() => {
    if (!chartRef.current || series.length === 0) return;

    xRef.current = [];
    ysRef.current = series.map(() => []);
    lastValuesRef.current = {};
    setDataCount(0);
    setIsLive(true);

    const width = chartRef.current.clientWidth || 900;
    const options = makeOptions({
      width,
      height,
      series,
      showLegend,
      onLeaveLive: () => setIsLive(false),
    });
    uplotRef.current = new uPlot(options, [xRef.current, ...ysRef.current], chartRef.current);

    const unsubscribe = provider(sensorIds, pushPoint);
    const resizeObserver = new ResizeObserver(() => {
      const nextWidth = chartRef.current?.clientWidth || width;
      uplotRef.current?.setSize({ width: nextWidth, height });
    });
    resizeObserver.observe(chartRef.current);

    return () => {
      unsubscribe();
      resizeObserver.disconnect();
      uplotRef.current?.destroy();
      uplotRef.current = null;
    };
  }, [chartRef, provider, sensorIds, series, pushPoint, height, showLegend]);

  useEffect(() => {
    const u = uplotRef.current;
    if (!u) return;
    u.series.forEach((s, index) => {
      if (index === 0) return;
      const sensorId = series[index - 1]?.sensorId;
      const shouldShow = sensorId ? visibleSensorIds.has(sensorId) : false;
      if (s.show !== shouldShow) u.setSeries(index, { show: shouldShow });
    });
  }, [series, visibleIdsKey, visibleSensorIds]);

  const snapshotData = useMemo<RealtimePoint[]>(
    () =>
      xRef.current.map((sec, i) => {
        const values: Record<string, number | null> = {};
        sensorIds.forEach((id, idx) => {
          values[id] = ysRef.current[idx]?.[i] ?? null;
        });
        return { timestampMs: sec * 1000, values };
      }),
    [sensorIds, dataCount]
  );

  return {
    isLive,
    dataCount,
    resetToLive,
    exportCsv,
    uplot: uplotRef.current,
    snapshotData,
  };
}
