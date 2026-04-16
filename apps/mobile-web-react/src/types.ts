import type uPlot from "uplot";

export type SensorSeries = {
  sensorId: string;
  name: string;
  color: string;
};

export type HistoryPoint = {
  timestampMs: number;
  values: Record<string, number | null | undefined>;
};

export type RealtimePoint = {
  timestampMs: number;
  values: Record<string, number | null | undefined>;
};

export type DateRange = {
  startIso: string;
  endIso: string;
  interval: "Raw" | "1m" | "5m" | "15m";
  aggregation: "Avg" | "Min" | "Max";
};

export type FetchHistoryFn = (params: {
  sensorIds: string[];
  range: DateRange;
}) => Promise<HistoryPoint[]>;

export type RealtimeProvider = (
  sensorIds: string[],
  callback: (point: RealtimePoint) => void
) => () => void;

export type BuildHistoryOptionsArgs = {
  width: number;
  height: number;
  series: SensorSeries[];
  showLegend: boolean;
  onLegendMount?: (legendEl: Element) => void;
};

export type UplotAlignedData = uPlot.AlignedData;
