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
const OUTPUT_MODE = (process.env.SENSOR_OUTPUT_MODE || "collector").toLowerCase(); // collector | raw

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
  lastRawFrameAt: null,
  lastRawFrameHex: null,
};

function id(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function modbusCrc16(bytes) {
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i += 1) {
      const lsb = crc & 0x0001;
      crc >>= 1;
      if (lsb) crc ^= 0xA001;
    }
  }
  return crc & 0xffff;
}

function toHex(bytes) {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function createRawModbusRtuFrame() {
  // Modbus RTU response example:
  // [slaveId, functionCode, byteCount, reg1_hi, reg1_lo, reg2_hi, ... , crc_lo, crc_hi]
  const slaveId = 1;
  const functionCode = 0x03; // Read Holding Registers response

  // register mapping (scaled int):
  // 0: temperature*10, 1: humidity*10, 2: power(W)
  const temp = clamp(Math.round((20 + Math.random() * 8) * 10), 150, 380);
  const hum = clamp(Math.round((35 + Math.random() * 25) * 10), 100, 980);
  const power = clamp(Math.round(250 + Math.random() * 1200), 0, 5000);

  const registers = [temp, hum, power];
  const payload = [];
  for (const reg of registers) {
    payload.push((reg >> 8) & 0xff, reg & 0xff);
  }

  const frameNoCrc = [slaveId, functionCode, payload.length, ...payload];
  const crc = modbusCrc16(frameNoCrc);
  const frame = [...frameNoCrc, crc & 0xff, (crc >> 8) & 0xff];

  return {
    frameId: id("frm"),
    sensorId: SENSOR_ID,
    protocol: "modbus-rtu",
    slaveId,
    functionCode,
    registerCount: registers.length,
    rawHex: toHex(frame),
    createdAt: new Date().toISOString(),
  };
}

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

  if (OUTPUT_MODE === "raw") {
    const frame = createRawModbusRtuFrame();
    runtime.lastRawFrameAt = frame.createdAt;
    runtime.lastRawFrameHex = frame.rawHex;
    runtime.lastSendAt = frame.createdAt;
    return;
  }

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
    outputMode: OUTPUT_MODE,
    state: runtime.state,
  });
});

app.get("/status", (_req, res) => {
  const controlState = typeof adapter.getControlState === "function" ? adapter.getControlState() : null;
  res.json({
    ok: true,
    sensorId: SENSOR_ID,
    adapter: adapter.kind,
    outputMode: OUTPUT_MODE,
    commEnabled: runtime.commEnabled,
    loopRunning: runtime.loopRunning,
    state: runtime.state,
    consecutiveFailures: runtime.consecutiveFailures,
    lastSendAt: runtime.lastSendAt,
    lastError: runtime.lastError,
    lastRawFrameAt: runtime.lastRawFrameAt,
    controlState,
    adapterHealth: adapter.health(),
  });
});

app.get("/raw/frame", (_req, res) => {
  if (!runtime.commEnabled) {
    return res.status(503).json({ ok: false, error: "comm-disabled", state: runtime.state });
  }

  const frame = createRawModbusRtuFrame();
  runtime.lastRawFrameAt = frame.createdAt;
  runtime.lastRawFrameHex = frame.rawHex;
  return res.json({ ok: true, ...frame, state: runtime.state });
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
  let applied = true;

  if (action === "comm_on") {
    runtime.commEnabled = true;
    if (runtime.loopRunning) runtime.state = "CONNECTED";
  } else if (action === "comm_off") {
    runtime.commEnabled = false;
    if (runtime.loopRunning) runtime.state = "PAUSED";
  } else if (action === "loop_start") {
    startLoop();
  } else if (action === "loop_stop") {
    stopLoop();
  } else if (typeof adapter.setAction === "function") {
    adapter.setAction(action);
  } else {
    applied = false;
  }

  const controlState = typeof adapter.getControlState === "function" ? adapter.getControlState() : null;

  res.json({
    ok: true,
    applied,
    action,
    sensorId: SENSOR_ID,
    controlState,
    commEnabled: runtime.commEnabled,
    loopRunning: runtime.loopRunning,
    state: runtime.state,
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
  console.log(`[mock-sensor] listening on :${PORT} (adapter=${adapter.kind}, output=${OUTPUT_MODE})`);
  startLoop();
});

process.on("SIGTERM", async () => {
  stopLoop();
  runtime.state = "STOPPED";
  await adapter.stop();
  process.exit(0);
});
