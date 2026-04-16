import express from "express";

const app = express();
const PORT = Number(process.env.PORT || 3110);
const COLLECTOR_URL = process.env.COLLECTOR_URL || "http://localhost:3000/collect";
const RAW_FRAME_URL = process.env.RAW_FRAME_URL || "http://localhost:3100/raw/frame";
const SENSOR_ID = process.env.SENSOR_ID || "modbus-1";
const DRIVER_INTERVAL_MS = Number(process.env.DRIVER_INTERVAL_MS || 1000);
const MODBUS_SLAVE_ID = Number(process.env.MODBUS_SLAVE_ID || 1);

const runtime = {
  running: false,
  state: "INIT", // INIT | CONNECTED | DISCONNECTED | PAUSED | STOPPED
  consecutiveFailures: 0,
  lastRawAt: null,
  lastParsedAt: null,
  lastCollectAt: null,
  lastError: null,
};

function id(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function hexToBytes(hex) {
  if (!hex || typeof hex !== "string" || hex.length % 2 !== 0) {
    throw new Error("invalid-raw-hex");
  }
  const out = [];
  for (let i = 0; i < hex.length; i += 2) {
    out.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return out;
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

function parseModbusRtuFrame(rawHex) {
  const bytes = hexToBytes(rawHex);
  if (bytes.length < 7) throw new Error("frame-too-short");

  const frameNoCrc = bytes.slice(0, -2);
  const crcLo = bytes[bytes.length - 2];
  const crcHi = bytes[bytes.length - 1];
  const receivedCrc = crcLo | (crcHi << 8);
  const computed = modbusCrc16(frameNoCrc);
  if (receivedCrc !== computed) throw new Error("crc-mismatch");

  const slaveId = bytes[0];
  const functionCode = bytes[1];
  const byteCount = bytes[2];

  if (slaveId !== MODBUS_SLAVE_ID) {
    throw new Error(`unexpected-slave:${slaveId}`);
  }

  if (functionCode !== 0x03) throw new Error(`unsupported-function:${functionCode}`);
  if (byteCount % 2 !== 0) throw new Error("invalid-byte-count");

  const registerValues = [];
  for (let i = 3; i < 3 + byteCount; i += 2) {
    registerValues.push((bytes[i] << 8) | bytes[i + 1]);
  }

  // mapping (matches mock-sensor raw generation)
  const temperature = (registerValues[0] ?? 0) / 10;
  const humidity = (registerValues[1] ?? 0) / 10;
  const power = registerValues[2] ?? 0;

  const parsedAt = new Date().toISOString();
  return {
    slaveId,
    functionCode,
    registerValues,
    events: [
      {
        sensorId: SENSOR_ID,
        source: "modbus-driver",
        type: "temperature",
        value: Number(temperature.toFixed(1)),
        unit: "C",
        timestamp: parsedAt,
        meta: { protocol: "modbus-rtu", parser: "modbus-driver", reg: 0 },
      },
      {
        sensorId: SENSOR_ID,
        source: "modbus-driver",
        type: "humidity",
        value: Number(humidity.toFixed(1)),
        unit: "%",
        timestamp: parsedAt,
        meta: { protocol: "modbus-rtu", parser: "modbus-driver", reg: 1 },
      },
      {
        sensorId: SENSOR_ID,
        source: "modbus-driver",
        type: "power",
        value: Number(power),
        unit: "W",
        timestamp: parsedAt,
        meta: { protocol: "modbus-rtu", parser: "modbus-driver", reg: 2 },
      },
    ],
  };
}

async function fetchRawFrame() {
  const r = await fetch(RAW_FRAME_URL);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.error || `raw-frame-${r.status}`);
  if (!body?.rawHex) throw new Error("raw-hex-missing");
  return body;
}

async function postCollect(event) {
  const r = await fetch(COLLECTOR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });

  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`collector-${r.status}:${txt}`);
  }
}

let timer = null;

async function tickOnce() {
  const raw = await fetchRawFrame();
  runtime.lastRawAt = raw.createdAt || new Date().toISOString();

  const parsed = parseModbusRtuFrame(raw.rawHex);
  runtime.lastParsedAt = new Date().toISOString();

  for (const event of parsed.events) {
    await postCollect(event);
    runtime.lastCollectAt = new Date().toISOString();
  }
}

function startLoop() {
  if (timer) return;
  runtime.running = true;
  runtime.state = "CONNECTED";

  timer = setInterval(async () => {
    try {
      await tickOnce();
      runtime.consecutiveFailures = 0;
      runtime.lastError = null;
      runtime.state = "CONNECTED";
    } catch (err) {
      runtime.consecutiveFailures += 1;
      runtime.lastError = err?.message || "driver-tick-failed";
      runtime.state = "DISCONNECTED";
      console.error("[modbus-driver] tick failed:", runtime.lastError);
    }
  }, DRIVER_INTERVAL_MS);
}

function stopLoop() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  runtime.running = false;
  runtime.state = "PAUSED";
}

app.use(express.json({ limit: "128kb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "modbus-driver",
    state: runtime.state,
    collector: COLLECTOR_URL,
    rawFrameUrl: RAW_FRAME_URL,
    sensorId: SENSOR_ID,
    slaveId: MODBUS_SLAVE_ID,
  });
});

app.get("/status", (_req, res) => {
  res.json({
    ok: true,
    running: runtime.running,
    state: runtime.state,
    consecutiveFailures: runtime.consecutiveFailures,
    lastRawAt: runtime.lastRawAt,
    lastParsedAt: runtime.lastParsedAt,
    lastCollectAt: runtime.lastCollectAt,
    lastError: runtime.lastError,
  });
});

app.post("/driver/start", (_req, res) => {
  startLoop();
  res.json({ ok: true, running: runtime.running, state: runtime.state });
});

app.post("/driver/stop", (_req, res) => {
  stopLoop();
  res.json({ ok: true, running: runtime.running, state: runtime.state });
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

app.listen(PORT, () => {
  runtime.state = "INIT";
  console.log(`[modbus-driver] listening on :${PORT}`);
  startLoop();
});

process.on("SIGTERM", () => {
  stopLoop();
  runtime.state = "STOPPED";
  process.exit(0);
});
