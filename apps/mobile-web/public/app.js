const state = {
  apiBase: "",
  latest: {},
  events: [],
  lastAck: null,
  errors: {},
  sensorState: "INIT",
  lastSensorUpdateAt: 0
};

const cards = document.getElementById("cards");
const eventsEl = document.getElementById("events");
const connEl = document.getElementById("conn");
const ackEl = document.getElementById("ack");
const netmsgEl = document.getElementById("netmsg");
const sensorStateBadgeEl = document.getElementById("sensor-state-badge");

const menuDashboard = document.getElementById("menu-dashboard");
const menuLog = document.getElementById("menu-log");
const viewDashboard = document.getElementById("view-dashboard");
const viewLog = document.getElementById("view-log");
const langCurrent = document.getElementById("lang-current");
const langMenu = document.getElementById("lang-menu");
const langOptions = document.querySelectorAll(".lang-option");
const titleEl = document.getElementById("title");
const subtitleEl = document.getElementById("subtitle");

const sensorControlModal = document.getElementById("sensor-control-modal");
const btnCommOn = document.getElementById("btn-comm-on");
const btnCommOff = document.getElementById("btn-comm-off");
const btnLoopStart = document.getElementById("btn-loop-start");
const btnLoopStop = document.getElementById("btn-loop-stop");
const btnModalClose = document.getElementById("btn-modal-close");
const controlDebugBox = document.getElementById("control-debug-box");
const debugControl = new URLSearchParams(location.search).get("debugControl") === "1";

function stateClass(stateValue) {
  const v = String(stateValue || "").toUpperCase();
  if (v === "CONNECTED") return "state-connected";
  if (v === "DISCONNECTED") return "state-disconnected";
  if (v === "PAUSED") return "state-paused";
  if (v === "INIT") return "state-init";
  if (v === "STOPPED") return "state-stopped";
  return "";
}

function renderCards() {
  const entries = Object.entries(state.latest)
    .filter(([, e]) => e.type === "power");

  if (!entries.length) {
    cards.innerHTML = `<div class="card" style="grid-column:1/-1">POWER 데이터가 아직 없어요.</div>`;
    return;
  }

  const cls = stateClass(state.sensorState);

  cards.innerHTML = entries.map(([k, e]) => `
    <div class="card ${cls} sensor-card-pressable" data-sensor-key="${k}">
      <div class="muted">${k}</div>
      <div style="font-size:24px; font-weight:900; margin:6px 0;">${e.value} ${e.unit || ""}</div>
      <div class="muted">${new Date(e.timestamp).toLocaleTimeString()}</div>
    </div>
  `).join("");

  attachSensorCardLongPress();
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

function renderSensorState() {
  const v = String(state.sensorState || "INIT").toUpperCase();
  if (!sensorStateBadgeEl) return;
  sensorStateBadgeEl.textContent = v;

  // reset inline style first (important when state changes from INIT/STOPPED)
  sensorStateBadgeEl.style.background = "";
  sensorStateBadgeEl.style.color = "";

  if (v === "CONNECTED") {
    sensorStateBadgeEl.className = "badge ok";
  } else if (v === "DISCONNECTED") {
    sensorStateBadgeEl.className = "badge bad";
  } else if (v === "PAUSED") {
    sensorStateBadgeEl.className = "badge warn";
  } else if (v === "INIT") {
    sensorStateBadgeEl.className = "badge";
    sensorStateBadgeEl.style.background = "rgba(120,140,255,.18)";
    sensorStateBadgeEl.style.color = "#9ab0ff";
  } else {
    sensorStateBadgeEl.className = "badge";
    sensorStateBadgeEl.style.background = "rgba(190,190,190,.18)";
    sensorStateBadgeEl.style.color = "#cfcfcf";
  }
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

function renderControlDebug(payload) {
  if (!debugControl || !controlDebugBox) return;
  controlDebugBox.classList.add("on");
  controlDebugBox.textContent = JSON.stringify(payload, null, 2);
}

async function fetchSensorStatus() {
  try {
    const r = await fetch(`${state.apiBase}/sensor/status`);
    if (!r.ok) throw new Error(`sensor-status ${r.status}`);
    const data = await r.json();
    state.sensorState = data.state || "INIT";
  } catch {
    // avoid false red while sensor updates are actively flowing
    const now = Date.now();
    const recentlyUpdated = now - state.lastSensorUpdateAt < 10000;
    if (!recentlyUpdated) {
      state.sensorState = "DISCONNECTED";
    }
  }
  renderSensorState();
  renderCards();
}

async function loadInitial() {
  try {
    const [eventsResp] = await Promise.all([
      fetch(`${state.apiBase}/events?limit=50`),
      fetchSensorStatus()
    ]);

    if (!eventsResp.ok) throw new Error(`events ${eventsResp.status}`);
    const data = await eventsResp.json();
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

    // real-time state reflection: incoming sensor data means connected
    state.lastSensorUpdateAt = Date.now();
    if (state.sensorState !== "PAUSED") {
      state.sensorState = "CONNECTED";
    }

    renderSensorState();
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

async function sendSensorToggle(kind, enabledOrRunning) {
  const url = kind === "comm" ? `${state.apiBase}/sensor/comm` : `${state.apiBase}/sensor/loop`;
  const controlTraceId = `ctl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const body = kind === "comm"
    ? { enabled: enabledOrRunning, target: "mock-1", controlTraceId }
    : { running: enabledOrRunning, target: "mock-1", controlTraceId };

  try {
    ackEl.textContent = "sending...";
    ackEl.className = "badge warn";
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const payload = await r.json().catch(() => ({}));
    renderControlDebug({ kind, request: body, responseStatus: r.status, response: payload });

    if (!r.ok) {
      ackEl.textContent = "send-failed";
      ackEl.className = "badge bad";
      const extra = payload?.targetUrl ? ` target=${payload.targetUrl}` : "";
      const fallback = payload?.fallbackUrl ? ` fallback=${payload.fallbackUrl}` : "";
      showError(kind === "comm" ? 4002 : 4003, `센서 ${kind} 토글 실패(${r.status})${extra}${fallback}`);
      return;
    }

    state.lastAck = {
      action: kind === "comm"
        ? (enabledOrRunning ? "comm_on" : "comm_off")
        : (enabledOrRunning ? "loop_start" : "loop_stop"),
      status: "accepted"
    };
    renderAck();

    await fetchSensorStatus();
    setNetMessage("");
  } catch (err) {
    renderControlDebug({ kind, request: body, error: err?.message || "unknown" });
    ackEl.textContent = "send-failed";
    ackEl.className = "badge bad";
    showError(kind === "comm" ? 4002 : 4003, `센서 ${kind} 토글 실패`);
  }
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
    title: "CUTE 대시보드",
    subtitle: "Monitoring + Control (MVP)",
    menuHome: "홈",
    menuLog: "로그",
    langLabel: "한국어",
  },
  en: {
    title: "CUTE Dashboard",
    subtitle: "Monitoring + Control (MVP)",
    menuHome: "Home",
    menuLog: "Logs",
    langLabel: "English",
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
  langCurrent.textContent = `${dict.langLabel} ▾`;
  langMenu.classList.remove("on");
}

function openSensorControlModal() {
  sensorControlModal?.classList.add("on");
}

function closeSensorControlModal() {
  sensorControlModal?.classList.remove("on");
}

function attachSensorCardLongPress() {
  const cardsEls = document.querySelectorAll(".sensor-card-pressable");
  cardsEls.forEach((el) => {
    let timer = null;

    const start = () => {
      timer = setTimeout(() => {
        openSensorControlModal();
      }, 450);
    };

    const cancel = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    el.addEventListener("mousedown", start);
    el.addEventListener("mouseup", cancel);
    el.addEventListener("mouseleave", cancel);
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchend", cancel, { passive: true });
    el.addEventListener("touchcancel", cancel, { passive: true });
  });
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

  btnCommOn?.addEventListener("click", () => sendSensorToggle("comm", true));
  btnCommOff?.addEventListener("click", () => sendSensorToggle("comm", false));
  btnLoopStart?.addEventListener("click", () => sendSensorToggle("loop", true));
  btnLoopStop?.addEventListener("click", () => sendSensorToggle("loop", false));
  btnModalClose?.addEventListener("click", closeSensorControlModal);
  sensorControlModal?.addEventListener("click", (e) => {
    if (e.target === sensorControlModal) closeSensorControlModal();
  });

  menuDashboard.addEventListener("click", () => setView("dashboard"));
  menuLog.addEventListener("click", () => setView("log"));

  langCurrent.addEventListener("click", () => {
    langMenu.classList.toggle("on");
  });

  langOptions.forEach((btn) => {
    btn.addEventListener("click", () => applyLang(btn.dataset.lang));
  });

  document.addEventListener("click", (e) => {
    if (!langMenu.contains(e.target) && e.target !== langCurrent) {
      langMenu.classList.remove("on");
    }
  });

  await loadInitial();
  renderAck();
  renderSensorState();
  setView("dashboard");
  applyLang("ko");
  connectSse();

  setInterval(fetchSensorStatus, 3000);

  // stale watchdog: if stream is quiet for too long, mark disconnected
  setInterval(() => {
    const now = Date.now();
    const isStale = state.lastSensorUpdateAt > 0 && now - state.lastSensorUpdateAt > 12000;
    if (isStale && state.sensorState !== "PAUSED") {
      state.sensorState = "DISCONNECTED";
      renderSensorState();
      renderCards();
    }
  }, 3000);
})();
