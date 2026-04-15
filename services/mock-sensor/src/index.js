import express from "express";

const app = express();
const PORT = Number(process.env.PORT || 3100);
const COLLECTOR_URL = process.env.COLLECTOR_URL || "http://localhost:3000/collect";
const SENSOR_ID = process.env.SENSOR_ID || "mock-1";
const SENSOR_INTERVAL_MS = Number(process.env.SENSOR_INTERVAL_MS || 1000);

const controlState = {
  fanOn: false,
  lastAction: "init",
  updatedAt: new Date().toISOString(),
};

function rand(min, max) {
  return Number((Math.random() * (max - min) + min).toFixed(2));
}

function makeEvents() {
  const now = new Date().toISOString();

  // 팬 ON/OFF 상태에 따라 값 패턴 변경
  const temperature = controlState.fanOn ? rand(18.5, 24.5) : rand(23.5, 29.5);
  const humidity = controlState.fanOn ? rand(35, 55) : rand(40, 65);
  const power = controlState.fanOn ? rand(260, 460) : rand(90, 220);

  return [
    { sensorId: SENSOR_ID, source: "A", type: "temperature", value: temperature, unit: "C", timestamp: now },
    { sensorId: SENSOR_ID, source: "A", type: "humidity", value: humidity, unit: "%", timestamp: now },
    { sensorId: SENSOR_ID, source: "A", type: "power", value: power, unit: "W", timestamp: now },
  ];
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

function startLoop() {
  if (timer) return;
  timer = setInterval(async () => {
    const pack = makeEvents();
    for (const event of pack) {
      try {
        await postOne(event);
      } catch (err) {
        console.error("[mock-sensor] send failed:", err.message);
      }
    }
  }, SENSOR_INTERVAL_MS);
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "mock-sensor", collector: COLLECTOR_URL, sensorId: SENSOR_ID, controlState });
});

app.post("/control", express.json({ limit: "64kb" }), (req, res) => {
  const action = String(req.body?.action || "noop").toLowerCase();

  if (action === "fan_on") {
    controlState.fanOn = true;
  } else if (action === "fan_off") {
    controlState.fanOn = false;
  }

  controlState.lastAction = action;
  controlState.updatedAt = new Date().toISOString();

  res.json({
    ok: true,
    applied: true,
    action,
    sensorId: SENSOR_ID,
    controlState,
  });
});

app.post("/emit-once", async (_req, res) => {
  const pack = makeEvents();
  for (const event of pack) {
    await postOne(event);
  }
  res.json({ ok: true, emitted: pack.length });
});

app.listen(PORT, () => {
  console.log(`[mock-sensor] listening on :${PORT}`);
  startLoop();
});
