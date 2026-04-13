import express from "express";

const app = express();
const PORT = Number(process.env.PORT || 3100);
const COLLECTOR_URL = process.env.COLLECTOR_URL || "http://localhost:3000/collect";
const SENSOR_ID = process.env.SENSOR_ID || "mock-1";
const SENSOR_INTERVAL_MS = Number(process.env.SENSOR_INTERVAL_MS || 1000);

function rand(min, max) {
  return Number((Math.random() * (max - min) + min).toFixed(2));
}

function makeEvents() {
  return [
    { sensorId: SENSOR_ID, source: "A", type: "temperature", value: rand(20, 29), unit: "C", timestamp: new Date().toISOString() },
    { sensorId: SENSOR_ID, source: "A", type: "humidity", value: rand(30, 60), unit: "%", timestamp: new Date().toISOString() },
    { sensorId: SENSOR_ID, source: "A", type: "power", value: rand(120, 420), unit: "W", timestamp: new Date().toISOString() },
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
  res.json({ ok: true, service: "mock-sensor", collector: COLLECTOR_URL, sensorId: SENSOR_ID });
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
