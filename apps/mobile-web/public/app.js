const state = {
  apiBase: "",
  latest: {},
  events: [],
  lastAck: null
};

const cards = document.getElementById("cards");
const eventsEl = document.getElementById("events");
const connEl = document.getElementById("conn");
const ackEl = document.getElementById("ack");

function renderCards() {
  const entries = Object.entries(state.latest);
  if (!entries.length) {
    cards.innerHTML = `<div class="card" style="grid-column:1/-1">아직 데이터가 없어요.</div>`;
    return;
  }
  cards.innerHTML = entries.map(([k, e]) => `
    <div class="card">
      <div class="muted">${k}</div>
      <div style="font-size:24px; font-weight:900; margin:6px 0;">${e.value} ${e.unit || ""}</div>
      <div class="muted">${new Date(e.timestamp).toLocaleTimeString()}</div>
    </div>
  `).join("");
}

function renderEvents() {
  eventsEl.innerHTML = state.events.slice(0, 30).map((e) => `
    <li>
      <div><b>${e.type}</b> · ${e.value}${e.unit || ""}</div>
      <div class="muted">${e.sensorId} · ${new Date(e.timestamp).toLocaleTimeString()}</div>
    </li>
  `).join("");
}

function renderAck() {
  if (!state.lastAck) {
    ackEl.textContent = "idle";
    ackEl.className = "badge warn";
    return;
  }
  ackEl.textContent = `${state.lastAck.action} · ${state.lastAck.status}`;
  ackEl.className = state.lastAck.status === "accepted" ? "badge ok" : "badge bad";
}

async function loadInitial() {
  const r = await fetch(`${state.apiBase}/events?limit=50`);
  const data = await r.json();
  state.events = data.items || [];
  state.latest = data.latestBySensor || {};
  renderCards();
  renderEvents();
}

function connectSse() {
  const es = new EventSource(`${state.apiBase}/stream`);

  es.addEventListener("ready", () => {
    connEl.textContent = "connected";
    connEl.className = "badge ok";
  });

  es.addEventListener("sensor.update", (ev) => {
    const e = JSON.parse(ev.data);
    state.latest[`${e.sensorId}:${e.type}`] = e;
    state.events.unshift(e);
    renderCards();
    renderEvents();
  });

  es.addEventListener("command.ack", (ev) => {
    state.lastAck = JSON.parse(ev.data);
    renderAck();
  });

  es.onerror = () => {
    connEl.textContent = "reconnecting";
    connEl.className = "badge bad";
  };
}

async function sendControl(action) {
  try {
    ackEl.textContent = "sending...";
    ackEl.className = "badge warn";
    await fetch(`${state.apiBase}/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "mock-1", action })
    });
  } catch {
    ackEl.textContent = "send-failed";
    ackEl.className = "badge bad";
  }
}

(async function boot() {
  const cfg = await fetch("/config").then((r) => r.json());
  state.apiBase = cfg.apiBaseUrl;

  document.getElementById("refresh").addEventListener("click", loadInitial);
  document.querySelectorAll(".control-btn").forEach((btn) => {
    btn.addEventListener("click", () => sendControl(btn.dataset.action));
  });

  await loadInitial();
  renderAck();
  connectSse();
})();
