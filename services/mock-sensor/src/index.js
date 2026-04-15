import express from "express";
import { MockAdapter } from "./adapters/mockAdapter.js";
import { SerialStubAdapter } from "./adapters/serialStubAdapter.js";
import { ModbusStubAdapter } from "./adapters/modbusStubAdapter.js";

const app = express();
const PORT = Number(process.env.PORT || 3100);
const COLLECTOR_URL = process.env.COLLECTOR_URL || "http://localhost:3000/collect";
const SENSOR_ID = process.env.SENSOR_ID || "mock-1";
const SENSOR_INTERVAL_MS = Number(process.env.SENSOR_INTERVAL_MS || 1000);
const ADAPTER_KIND = (process.env.SENSOR_ADAPTER || "mock").toLowerCase();

const adapterRegistry = {
  mock: new MockAdapter(),
  serial: new SerialStubAdapter(),
  modbus: new ModbusStubAdapter(),
};

const adapter = adapterRegistry[ADAPTER_KIND] || adapterRegistry.mock;

const runtime = {
  commEnabled: true,
  loopRunning: false,
  state: "INIT", // INIT | CONNECTED | DISCONNECTED | PAUSED | STOPPED
  consecutiveFailures: 0,
  lastSendAt: null,
  lastError: null,
};

function normalizeForCollector(raw) {
  return {
    sensorId: SENSOR_ID,
    source: "A",
    type: raw.type,
    value: raw.value,
    unit: raw.unit,
    timestamp: raw.timestamp || new Date().toISOString(),
    meta: {
      adapter: adapter.kind,
      ...(raw.meta || {}),
    },
  };
}

async function postOne(event) {
  const resp = await fetch(COLLECTOR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`collector ${resp.status}: ${txt}`);
  }
}

let timer = null;

async function tickOnce() {
  if (!runtime.commEnabled) return;
  const raws = await adapter.read();
  for (const raw of raws) {
    const event = normalizeForCollector(raw);
    await postOne(event);
    runtime.lastSendAt = new Date().toISOString();
  }
}

function startLoop() {
  if (timer) return;
  runtime.loopRunning = true;
  runtime.state = runtime.commEnabled ? "CONNECTED" : "PAUSED";

  timer = setInterval(async () => {
    try {
      await tickOnce();
      runtime.consecutiveFailures = 0;
      runtime.lastError = null;
      if (runtime.commEnabled) runtime.state = "CONNECTED";
    } catch (err) {
      runtime.consecutiveFailures += 1;
      runtime.lastError = err?.message || "send-failed";
      runtime.state = "DISCONNECTED";
      console.error("[mock-sensor] send failed:", runtime.lastError);
    }
  }, SENSOR_INTERVAL_MS);
}

function stopLoop() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  runtime.loopRunning = false;
  runtime.state = "PAUSED";
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "mock-sensor",
    collector: COLLECTOR_URL,
    sensorId: SENSOR_ID,
    adapter: adapter.kind,
    state: runtime.state,
  });
});

app.get("/status", (_req, res) => {
  const controlState = typeof adapter.getControlState === "function" ? adapter.getControlState() : null;
  res.json({
    ok: true,
    sensorId: SENSOR_ID,
    adapter: adapter.kind,
    commEnabled: runtime.commEnabled,
    loopRunning: runtime.loopRunning,
    state: runtime.state,
    consecutiveFailures: runtime.consecutiveFailures,
    lastSendAt: runtime.lastSendAt,
    lastError: runtime.lastError,
    controlState,
    adapterHealth: adapter.health(),
  });
});

app.post("/comm/on", express.json({ limit: "64kb" }), (_req, res) => {
  runtime.commEnabled = true;
  if (runtime.loopRunning) runtime.state = "CONNECTED";
  res.json({ ok: true, commEnabled: runtime.commEnabled, state: runtime.state });
});

app.post("/comm/off", express.json({ limit: "64kb" }), (_req, res) => {
  runtime.commEnabled = false;
  runtime.state = runtime.loopRunning ? "PAUSED" : runtime.state;
  res.json({ ok: true, commEnabled: runtime.commEnabled, state: runtime.state });
});

app.post("/loop/start", express.json({ limit: "64kb" }), (_req, res) => {
  startLoop();
  res.json({ ok: true, loopRunning: runtime.loopRunning, state: runtime.state });
});

app.post("/loop/stop", express.json({ limit: "64kb" }), (_req, res) => {
  stopLoop();
  res.json({ ok: true, loopRunning: runtime.loopRunning, state: runtime.state });
});

app.post("/control", express.json({ limit: "64kb" }), (req, res) => {
  const action = String(req.body?.action || "noop").toLowerCase();
  if (typeof adapter.setAction === "function") {
    adapter.setAction(action);
  }

  const controlState = typeof adapter.getControlState === "function" ? adapter.getControlState() : null;

  res.json({
    ok: true,
    applied: true,
    action,
    sensorId: SENSOR_ID,
    controlState,
  });
});

app.post("/emit-once", async (_req, res) => {
  try {
    await tickOnce();
    runtime.state = "CONNECTED";
    runtime.consecutiveFailures = 0;
    runtime.lastError = null;
    res.json({ ok: true, emitted: true, state: runtime.state });
  } catch (err) {
    runtime.consecutiveFailures += 1;
    runtime.lastError = err?.message || "emit-once-failed";
    runtime.state = "DISCONNECTED";
    res.status(502).json({ ok: false, error: runtime.lastError, state: runtime.state });
  }
});

app.listen(PORT, async () => {
  await adapter.start({ sensorId: SENSOR_ID });
  runtime.state = "INIT";
  console.log(`[mock-sensor] listening on :${PORT} (adapter=${adapter.kind})`);
  startLoop();
});

process.on("SIGTERM", async () => {
  stopLoop();
  runtime.state = "STOPPED";
  await adapter.stop();
  process.exit(0);
});
