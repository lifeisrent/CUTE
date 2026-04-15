import express from "express";
import cors from "cors";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const EVENT_BUFFER_SIZE = Number(process.env.EVENT_BUFFER_SIZE || 5000);
const CONTROL_BUFFER_SIZE = Number(process.env.CONTROL_BUFFER_SIZE || 1000);
const SSE_HEARTBEAT_MS = Number(process.env.SSE_HEARTBEAT_MS || 15000);
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "*").split(",").map((v) => v.trim()).filter(Boolean);
const SENSOR_CONTROL_URL = process.env.SENSOR_CONTROL_URL || "http://localhost:3100/control";

function deriveSensorBaseFromControl(controlUrl) {
  try {
    const u = new URL(controlUrl);
    if (u.pathname.endsWith("/control")) {
      u.pathname = u.pathname.slice(0, -"/control".length);
    }
    return u.toString().replace(/\/$/, "");
  } catch {
    return "http://localhost:3100";
  }
}

const SENSOR_BASE_URL = process.env.SENSOR_BASE_URL || deriveSensorBaseFromControl(SENSOR_CONTROL_URL);
const SENSOR_STATUS_URL = process.env.SENSOR_STATUS_URL || `${SENSOR_BASE_URL}/status`;
const SENSOR_COMM_ON_URL = process.env.SENSOR_COMM_ON_URL || `${SENSOR_BASE_URL}/comm/on`;
const SENSOR_COMM_OFF_URL = process.env.SENSOR_COMM_OFF_URL || `${SENSOR_BASE_URL}/comm/off`;
const SENSOR_LOOP_START_URL = process.env.SENSOR_LOOP_START_URL || `${SENSOR_BASE_URL}/loop/start`;
const SENSOR_LOOP_STOP_URL = process.env.SENSOR_LOOP_STOP_URL || `${SENSOR_BASE_URL}/loop/stop`;

app.use(express.json({ limit: "256kb" }));
app.use(cors({ origin: CORS_ORIGINS.includes("*") ? true : CORS_ORIGINS }));

const events = [];
const controlAttempts = [];
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

function appendControlAttempt(a) {
  controlAttempts.push(a);
  if (controlAttempts.length > CONTROL_BUFFER_SIZE) controlAttempts.shift();
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

async function postJson(url, body = {}) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, payload };
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

app.get("/control/attempts", (req, res) => {
  const limit = Math.max(1, Math.min(CONTROL_BUFFER_SIZE, Number(req.query.limit || 50)));
  res.json({
    ok: true,
    count: Math.min(limit, controlAttempts.length),
    items: controlAttempts.slice(-limit).reverse(),
  });
});

// sensor runtime status proxy (from mock-sensor)
app.get("/sensor/status", async (_req, res) => {
  try {
    const r = await fetch(SENSOR_STATUS_URL);
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.status(r.status).json({ ok: false, errorCode: 4001, error: body?.error || "sensor-status-failed" });
    }
    return res.json({ ok: true, ...body });
  } catch (err) {
    return res.status(502).json({ ok: false, errorCode: 4001, error: err?.message || "sensor-status-unreachable" });
  }
});

app.post("/sensor/comm", async (req, res) => {
  const enabled = Boolean(req.body?.enabled);
  const url = enabled ? SENSOR_COMM_ON_URL : SENSOR_COMM_OFF_URL;
  const controlTraceId = req.body?.controlTraceId || id("ctl");
  const target = req.body?.target || "mock-1";
  const hopResults = [];

  try {
    const p0 = Date.now();
    const primary = await postJson(url, {});
    hopResults.push({
      hop: "core->sensor(primary)",
      ok: primary.ok,
      status: primary.status,
      url,
      latencyMs: Date.now() - p0,
      error: primary.ok ? null : primary.payload?.error || null,
    });

    if (primary.ok) {
      const out = {
        ok: true,
        controlTraceId,
        target,
        commEnabled: primary.payload?.commEnabled ?? enabled,
        state: primary.payload?.state || null,
        path: "primary",
        hopResults,
      };
      appendControlAttempt({ ...out, action: enabled ? "comm_on" : "comm_off", at: new Date().toISOString() });
      return res.json(out);
    }

    const fallbackAction = enabled ? "comm_on" : "comm_off";
    const f0 = Date.now();
    const fallback = await postJson(SENSOR_CONTROL_URL, { action: fallbackAction, target });
    hopResults.push({
      hop: "core->sensor(fallback)",
      ok: fallback.ok,
      status: fallback.status,
      url: SENSOR_CONTROL_URL,
      latencyMs: Date.now() - f0,
      error: fallback.ok ? null : fallback.payload?.error || null,
    });

    if (fallback.ok) {
      const out = {
        ok: true,
        controlTraceId,
        target,
        commEnabled: fallback.payload?.commEnabled ?? enabled,
        state: fallback.payload?.state || null,
        path: "fallback",
        hopResults,
      };
      appendControlAttempt({ ...out, action: fallbackAction, at: new Date().toISOString() });
      return res.json(out);
    }

    const failure = {
      ok: false,
      controlTraceId,
      target,
      errorCode: 4002,
      error: primary.payload?.error || fallback.payload?.error || "sensor-comm-toggle-failed",
      targetUrl: url,
      fallbackUrl: SENSOR_CONTROL_URL,
      hopResults,
    };
    appendControlAttempt({ ...failure, action: fallbackAction, at: new Date().toISOString() });
    return res.status(primary.status || fallback.status || 502).json(failure);
  } catch (err) {
    const failure = {
      ok: false,
      controlTraceId,
      target,
      errorCode: 4002,
      error: err?.message || "sensor-comm-unreachable",
      targetUrl: url,
      fallbackUrl: SENSOR_CONTROL_URL,
      hopResults,
    };
    appendControlAttempt({ ...failure, action: enabled ? "comm_on" : "comm_off", at: new Date().toISOString() });
    return res.status(502).json(failure);
  }
});

app.post("/sensor/loop", async (req, res) => {
  const running = Boolean(req.body?.running);
  const url = running ? SENSOR_LOOP_START_URL : SENSOR_LOOP_STOP_URL;
  const controlTraceId = req.body?.controlTraceId || id("ctl");
  const target = req.body?.target || "mock-1";
  const hopResults = [];

  try {
    const p0 = Date.now();
    const primary = await postJson(url, {});
    hopResults.push({
      hop: "core->sensor(primary)",
      ok: primary.ok,
      status: primary.status,
      url,
      latencyMs: Date.now() - p0,
      error: primary.ok ? null : primary.payload?.error || null,
    });

    if (primary.ok) {
      const out = {
        ok: true,
        controlTraceId,
        target,
        loopRunning: primary.payload?.loopRunning ?? running,
        state: primary.payload?.state || null,
        path: "primary",
        hopResults,
      };
      appendControlAttempt({ ...out, action: running ? "loop_start" : "loop_stop", at: new Date().toISOString() });
      return res.json(out);
    }

    const fallbackAction = running ? "loop_start" : "loop_stop";
    const f0 = Date.now();
    const fallback = await postJson(SENSOR_CONTROL_URL, { action: fallbackAction, target });
    hopResults.push({
      hop: "core->sensor(fallback)",
      ok: fallback.ok,
      status: fallback.status,
      url: SENSOR_CONTROL_URL,
      latencyMs: Date.now() - f0,
      error: fallback.ok ? null : fallback.payload?.error || null,
    });

    if (fallback.ok) {
      const out = {
        ok: true,
        controlTraceId,
        target,
        loopRunning: fallback.payload?.loopRunning ?? running,
        state: fallback.payload?.state || null,
        path: "fallback",
        hopResults,
      };
      appendControlAttempt({ ...out, action: fallbackAction, at: new Date().toISOString() });
      return res.json(out);
    }

    const failure = {
      ok: false,
      controlTraceId,
      target,
      errorCode: 4003,
      error: primary.payload?.error || fallback.payload?.error || "sensor-loop-toggle-failed",
      targetUrl: url,
      fallbackUrl: SENSOR_CONTROL_URL,
      hopResults,
    };
    appendControlAttempt({ ...failure, action: fallbackAction, at: new Date().toISOString() });
    return res.status(primary.status || fallback.status || 502).json(failure);
  } catch (err) {
    const failure = {
      ok: false,
      controlTraceId,
      target,
      errorCode: 4003,
      error: err?.message || "sensor-loop-unreachable",
      targetUrl: url,
      fallbackUrl: SENSOR_CONTROL_URL,
      hopResults,
    };
    appendControlAttempt({ ...failure, action: running ? "loop_start" : "loop_stop", at: new Date().toISOString() });
    return res.status(502).json(failure);
  }
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

// control route -> relay to mock-sensor control
app.post("/control", async (req, res) => {
  const commandId = id("cmd");
  const action = req.body?.action || "noop";
  const target = req.body?.target || "mock-1";

  const ackBase = {
    commandId,
    target,
    action,
    at: new Date().toISOString(),
  };

  try {
    const r = await fetch(SENSOR_CONTROL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, action }),
    });

    const body = await r.json().catch(() => ({}));

    if (!r.ok) {
      const ack = { ...ackBase, status: "rejected", reason: body?.error || `sensor-control-${r.status}` };
      publishSse("command.ack", ack);
      return res.status(r.status).json({ ok: false, ...ack });
    }

    const ack = { ...ackBase, status: "accepted", applied: body?.applied ?? true, sensorState: body?.controlState || null };
    publishSse("command.ack", ack);
    return res.json({ ok: true, ...ack });
  } catch (err) {
    const ack = { ...ackBase, status: "error", reason: err?.message || "sensor-control-unreachable" };
    publishSse("command.ack", ack);
    return res.status(502).json({ ok: false, ...ack });
  }
});

app.listen(PORT, () => {
  console.log(`[backend-core] listening on :${PORT}`);
});
