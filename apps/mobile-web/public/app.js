const state = {
  apiBase: "",
  latest: {},
  events: []
};

const cards = document.getElementById("cards");
const eventsEl = document.getElementById("events");
const connEl = document.getElementById("conn");

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

  es.onerror = () => {
    connEl.textContent = "reconnecting";
    connEl.className = "badge bad";
  };
}

(async function boot() {
  const cfg = await fetch("/config").then((r) => r.json());
  state.apiBase = cfg.apiBaseUrl;

  document.getElementById("refresh").addEventListener("click", loadInitial);

  await loadInitial();
  connectSse();
})();
