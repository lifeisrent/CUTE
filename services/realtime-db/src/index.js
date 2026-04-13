import express from "express";
import cors from "cors";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const EVENT_BUFFER_SIZE = Number(process.env.EVENT_BUFFER_SIZE || 5000);
const SSE_HEARTBEAT_MS = Number(process.env.SSE_HEARTBEAT_MS || 15000);
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "*").split(",").map((v) => v.trim()).filter(Boolean);

app.use(express.json({ limit: "256kb" }));
app.use(cors({ origin: CORS_ORIGINS.includes("*") ? true : CORS_ORIGINS }));

const events = [];
const latestBySensor = new Map();
const clients = new Set();

function id(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeEvent(raw, source = "unknown") {
  const nowIso = new Date().toISOString();
  return {
    eventId: raw.eventId || id("evt"),
    traceId: raw.traceId || id("tr"),
    source: raw.source || source,
    sensorId: raw.sensorId || "mock-1",
    type: raw.type,
    value: Number(raw.value),
    unit: raw.unit || "",
    timestamp: raw.timestamp || nowIso,
  };
}

function validateEvent(e) {
  const allowed = new Set(["temperature", "humidity", "power"]);
  if (!e || typeof e !== "object") return "payload must be object";
  if (!allowed.has(e.type)) return "type must be one of temperature|humidity|power";
  if (!Number.isFinite(Number(e.value))) return "value must be number";
  if (!e.sensorId) return "sensorId is required";
  return null;
}

function appendEvent(e) {
  events.push(e);
  if (events.length > EVENT_BUFFER_SIZE) events.shift();
  latestBySensor.set(`${e.sensorId}:${e.type}`, e);
}

function publishSse(type, payload) {
  const message = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    try {
      res.write(message);
    } catch {
      // noop
    }
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "backend-core", bufferSize: events.length, sseClients: clients.size });
});

// B: collector endpoint
app.post("/collect", (req, res) => {
  const err = validateEvent(req.body);
  if (err) return res.status(400).json({ error: err });

  const event = normalizeEvent(req.body, "B");

  // C+D: ingest + realtime db
  appendEvent(event);
  publishSse("sensor.update", event);

  return res.json({ ok: true, eventId: event.eventId, traceId: event.traceId });
});

// C ingest endpoint (direct)
app.post("/ingest", (req, res) => {
  const err = validateEvent(req.body);
  if (err) return res.status(400).json({ error: err });

  const event = normalizeEvent(req.body, "C");
  appendEvent(event);
  publishSse("sensor.update", event);

  return res.json({ ok: true, eventId: event.eventId, traceId: event.traceId });
});

// D query endpoint
app.get("/events", (req, res) => {
  const limit = Math.max(1, Math.min(500, Number(req.query.limit || 50)));
  res.json({
    ok: true,
    count: Math.min(limit, events.length),
    latestBySensor: Object.fromEntries(latestBySensor.entries()),
    items: events.slice(-limit).reverse(),
  });
});

// E SSE stream endpoint
app.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  clients.add(res);
  res.write(`event: ready\ndata: ${JSON.stringify({ ok: true, at: new Date().toISOString() })}\n\n`);

  const hb = setInterval(() => {
    try {
      res.write(`event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
    } catch {
      // noop
    }
  }, SSE_HEARTBEAT_MS);

  req.on("close", () => {
    clearInterval(hb);
    clients.delete(res);
  });
});

// control stub
app.post("/control", (req, res) => {
  const commandId = id("cmd");
  const ack = {
    commandId,
    status: "accepted",
    target: req.body?.target || "mock-1",
    action: req.body?.action || "noop",
    at: new Date().toISOString(),
  };
  publishSse("command.ack", ack);
  res.json({ ok: true, ...ack });
});

app.listen(PORT, () => {
  console.log(`[backend-core] listening on :${PORT}`);
});
