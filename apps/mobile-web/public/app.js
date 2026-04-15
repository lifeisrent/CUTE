const state = {
  apiBase: "",
  latest: {},
  events: [],
  lastAck: null,
  errors: {}
};

const cards = document.getElementById("cards");
const eventsEl = document.getElementById("events");
const connEl = document.getElementById("conn");
const ackEl = document.getElementById("ack");
const netmsgEl = document.getElementById("netmsg");

const menuDashboard = document.getElementById("menu-dashboard");
const menuLog = document.getElementById("menu-log");
const viewDashboard = document.getElementById("view-dashboard");
const viewLog = document.getElementById("view-log");
const langKo = document.getElementById("lang-ko");
const langEn = document.getElementById("lang-en");
const titleEl = document.getElementById("title");
const subtitleEl = document.getElementById("subtitle");

function renderCards() {
  const entries = Object.entries(state.latest)
    .filter(([, e]) => e.type === "power");

  if (!entries.length) {
    cards.innerHTML = `<div class="card" style="grid-column:1/-1">POWER 데이터가 아직 없어요.</div>`;
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
  const powerEvents = state.events.filter((e) => e.type === "power");
  eventsEl.innerHTML = powerEvents.slice(0, 30).map((e) => `
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

function setNetMessage(msg = "") {
  if (!netmsgEl) return;
  netmsgEl.textContent = msg;
}

function getErrorMeta(code) {
  return state.errors?.[String(code)] || null;
}

function showError(code, fallbackMessage = "오류가 발생했습니다.") {
  const meta = getErrorMeta(code);
  const text = meta?.userMessage || fallbackMessage;
  setNetMessage(`[${code}] ${text}`);
}

async function loadInitial() {
  try {
    const r = await fetch(`${state.apiBase}/events?limit=50`);
    if (!r.ok) throw new Error(`events ${r.status}`);
    const data = await r.json();
    state.events = data.items || [];
    state.latest = data.latestBySensor || {};
    renderCards();
    renderEvents();
    setNetMessage("");
  } catch (err) {
    showError(1000, "백엔드 연결 실패: API_BASE_URL 또는 CORS_ORIGINS를 확인하세요.");
    connEl.textContent = "blocked";
    connEl.className = "badge bad";
  }
}

function connectSse() {
  const es = new EventSource(`${state.apiBase}/stream`);

  es.addEventListener("ready", () => {
    connEl.textContent = "connected";
    connEl.className = "badge ok";
    setNetMessage("");
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
    showError(1001, "실시간 스트림 연결 실패: backend CORS_ORIGINS에 현재 web 도메인이 포함되어 있는지 확인하세요.");
  };
}

async function sendControl(action) {
  try {
    ackEl.textContent = "sending...";
    ackEl.className = "badge warn";
    const r = await fetch(`${state.apiBase}/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "mock-1", action })
    });
    if (!r.ok) {
      ackEl.textContent = "send-failed";
      ackEl.className = "badge bad";
      showError(3001, `제어 요청 실패(${r.status}): backend 설정(CORS/SENSOR_CONTROL_URL) 확인 필요`);
      return;
    }
    setNetMessage("");
  } catch {
    ackEl.textContent = "send-failed";
    ackEl.className = "badge bad";
    showError(3001, "제어 요청 실패: API_BASE_URL/CORS_ORIGINS를 확인하세요.");
  }
}

const I18N = {
  ko: {
    title: "CUTE 실시간 대시보드",
    subtitle: "Monitoring + Control (MVP)",
    menuHome: "홈",
    menuLog: "로그",
  },
  en: {
    title: "CUTE Real-time Dashboard",
    subtitle: "Monitoring + Control (MVP)",
    menuHome: "Home",
    menuLog: "Logs",
  }
};

function applyLang(lang) {
  const dict = I18N[lang] || I18N.ko;
  titleEl.textContent = dict.title;
  subtitleEl.textContent = dict.subtitle;
  const homeLabel = menuDashboard.querySelector(".label");
  const logLabel = menuLog.querySelector(".label");
  if (homeLabel) homeLabel.textContent = dict.menuHome;
  if (logLabel) logLabel.textContent = dict.menuLog;
  langKo.classList.toggle("on", lang === "ko");
  langEn.classList.toggle("on", lang === "en");
}

function setView(view) {
  const isDashboard = view === "dashboard";
  viewDashboard.classList.toggle("on", isDashboard);
  viewLog.classList.toggle("on", !isDashboard);
  menuDashboard.classList.toggle("on", isDashboard);
  menuLog.classList.toggle("on", !isDashboard);
}

(async function boot() {
  const [cfg, catalog] = await Promise.all([
    fetch("/config").then((r) => r.json()),
    fetch("/error-catalog.json").then((r) => r.json()).catch(() => ({}))
  ]);

  state.apiBase = cfg.apiBaseUrl;
  state.errors = catalog || {};

  document.getElementById("refresh").addEventListener("click", loadInitial);
  document.querySelectorAll(".control-btn").forEach((btn) => {
    btn.addEventListener("click", () => sendControl(btn.dataset.action));
  });

  menuDashboard.addEventListener("click", () => setView("dashboard"));
  menuLog.addEventListener("click", () => setView("log"));
  langKo.addEventListener("click", () => applyLang("ko"));
  langEn.addEventListener("click", () => applyLang("en"));

  await loadInitial();
  renderAck();
  setView("dashboard");
  applyLang("ko");
  connectSse();
})();
