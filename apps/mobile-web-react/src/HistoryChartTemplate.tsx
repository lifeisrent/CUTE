import React, { useEffect, useMemo, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type {
  HistoryPoint,
  SensorSeries,
  BuildHistoryOptionsArgs,
  UplotAlignedData,
} from "./types";

type Props = {
  data: HistoryPoint[];
  series: SensorSeries[];
  loading?: boolean;
  showLegend?: boolean;
  className?: string;
  height?: number;
};

function toAlignedData(data: HistoryPoint[], series: SensorSeries[]): UplotAlignedData {
  const x = data.map((d) => Math.floor(d.timestampMs / 1000));
  const ys = series.map((s) =>
    data.map((d) => {
      const value = d.values[s.sensorId];
      return typeof value === "number" ? value : null;
    })
  );
  return [x, ...ys];
}

function buildOptions(args: BuildHistoryOptionsArgs): uPlot.Options {
  const { width, height, series, showLegend, onLegendMount } = args;
  return {
    width,
    height,
    padding: [12, 42, 8, 8],
    legend: {
      show: showLegend,
      live: true,
      isolate: false,
    },
    series: [
      {
        label: "Time",
      },
      ...series.map((s) => ({
        label: s.name,
        stroke: s.color,
        width: 2,
        spanGaps: true,
        points: { show: false },
        value: (_self: uPlot, raw: number | null) => (raw == null ? "-" : raw.toFixed(2)),
      })),
    ],
    scales: {
      x: { time: true },
      y: {
        auto: true,
        range: (_u, min, max) => {
          const padding = Math.max((max - min) * 0.1, 1);
          return [min - padding * 0.1, max + padding];
        },
      },
    },
    axes: [
      {
        values: (_u, ticks) => ticks.map((v) => new Date(v * 1000).toLocaleString()),
      },
      {},
    ],
    cursor: {
      lock: true,
      drag: { x: true, y: true },
    },
    hooks: {
      ready: [
        (u) => {
          if (!onLegendMount) return;
          const legend = u.root.querySelector(".u-legend");
          if (legend) onLegendMount(legend);
        },
      ],
    },
  };
}

export default function HistoryChartTemplate({
  data,
  series,
  loading = false,
  showLegend = true,
  className,
  height = 340,
}: Props) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const legendHostRef = useRef<HTMLDivElement | null>(null);
  const uplotRef = useRef<uPlot | null>(null);

  const alignedData = useMemo(() => toAlignedData(data, series), [data, series]);
  const seriesKey = useMemo(() => series.map((s) => s.sensorId).join(","), [series]);

  useEffect(() => {
    if (!chartRef.current) return;
    const host = chartRef.current;
    const width = host.clientWidth || 900;
    const options = buildOptions({
      width,
      height,
      series,
      showLegend,
      onLegendMount: (legendEl) => {
        if (!legendHostRef.current) return;
        legendHostRef.current.innerHTML = "";
        legendHostRef.current.appendChild(legendEl);
      },
    });

    if (uplotRef.current) {
      uplotRef.current.destroy();
      uplotRef.current = null;
    }

    uplotRef.current = new uPlot(options, alignedData, host);

    const resizeObserver = new ResizeObserver(() => {
      const nextWidth = host.clientWidth || width;
      uplotRef.current?.setSize({ width: nextWidth, height });
    });
    resizeObserver.observe(host);

    return () => {
      resizeObserver.disconnect();
      uplotRef.current?.destroy();
      uplotRef.current = null;
    };
  }, [alignedData, seriesKey, height, showLegend, series]);

  if (loading) return <div className={className}>Loading chart...</div>;
  if (series.length === 0) return <div className={className}>No series selected.</div>;
  if (data.length === 0) return <div className={className}>No data in selected range.</div>;

  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div ref={chartRef} style={{ flex: 1, minHeight: 220 }} />
      <div ref={legendHostRef} style={{ flexShrink: 0 }} />
    </div>
  );
}
