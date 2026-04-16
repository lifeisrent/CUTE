const state = {
  apiBase: "",
  latest: {},
  events: [],
  services: [],
  lastAck: null,
  errors: {},
  sensorState: "INIT",
  collectorState: "UNKNOWN",
  collectorMeta: null,
  lastSensorUpdateAt: 0
};

const cards = document.getElementById("cards");
const eventsEl = document.getElementById("events");
const connEl = document.getElementById("conn");
const ackEl = document.getElementById("ack");
const netmsgEl = document.getElementById("netmsg");
const sensorStateBadgeEl = document.getElementById("sensor-state-badge");
const collectorStateBadgeEl = document.getElementById("collector-state-badge");
const collectorMetaEl = document.getElementById("collector-meta");
const collectorRefreshBtn = document.getElementById("collector-refresh");

const menuDashboard = document.getElementById("menu-dashboard");
const menuLog = document.getElementById("menu-log");
const menuArchive = document.getElementById("menu-archive");
const viewDashboard = document.getElementById("view-dashboard");
const viewLog = document.getElementById("view-log");
const viewArchive = document.getElementById("view-archive");
const langCurrent = document.getElementById("lang-current");
const langMenu = document.getElementById("lang-menu");
const langOptions = document.querySelectorAll(".lang-option");
const titleEl = document.getElementById("title");
const subtitleEl = document.getElementById("subtitle");
const unitListEl = document.getElementById("unit-list");
const archiveCountEl = document.getElementById("archive-count");
const archiveTitleEl = document.getElementById("archive-title");

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

  renderArchiveUnits();
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

function renderArchiveUnits() {
  if (!unitListEl) return;

  const services = Array.isArray(state.services) ? state.services : [];
  if (!services.length) {
    unitListEl.innerHTML = `<div class="muted">서비스 정보를 불러오는 중입니다.</div>`;
    if (archiveCountEl) archiveCountEl.textContent = "0개";
    return;
  }

  if (archiveCountEl) archiveCountEl.textContent = `${services.length}개`;
  unitListEl.innerHTML = services.map((svc) => {
    const apis = Array.isArray(svc.apis) ? svc.apis.join(", ") : "-";
    const relations = Array.isArray(svc.relations) ? svc.relations.join(" | ") : "-";
    const statusClass = String(svc.status || "").toUpperCase();
    const badgeClass = (statusClass === "HEALTHY" || statusClass === "CONNECTED")
      ? "badge ok"
      : (statusClass === "STALE" || statusClass === "RECOVERING" || statusClass === "PAUSED")
        ? "badge warn"
        : "badge bad";

    return `
      <div class="unit-item" style="align-items:flex-start; border:1px solid rgba(255,255,255,.08); border-radius:10px; padding:10px; margin-bottom:8px;">
        <div style="width:100%;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px;">
            <div class="unit-title" style="font-size:15px;">${svc.name}</div>
            <span class="${badgeClass}">${svc.status || "UNKNOWN"}</span>
          </div>
          <div class="unit-subtitle" style="white-space:normal; margin-top:0;"><b>역할:</b> ${svc.role || "-"}</div>
          <div class="unit-subtitle" style="white-space:normal;"><b>API:</b> ${apis}</div>
          <div class="unit-subtitle" style="white-space:normal;"><b>연결:</b> ${relations}</div>
        </div>
      </div>
    `;
  }).join("");
}

function applyStateBadgeStyle(el, rawState) {
  if (!el) return;
  const v = String(rawState || "UNKNOWN").toUpperCase();
  el.textContent = v;
  el.style.background = "";
  el.style.color = "";

  if (v === "CONNECTED" || v === "HEALTHY") {
    el.className = "badge ok";
  } else if (v === "DISCONNECTED") {
    el.className = "badge bad";
  } else if (v === "PAUSED" || v === "STALE" || v === "RECOVERING") {
    el.className = "badge warn";
  } else if (v === "INIT") {
    el.className = "badge";
    el.style.background = "rgba(120,140,255,.18)";
    el.style.color = "#9ab0ff";
  } else {
    el.className = "badge";
    el.style.background = "rgba(190,190,190,.18)";
    el.style.color = "#cfcfcf";
  }
}

function renderSensorState() {
  applyStateBadgeStyle(sensorStateBadgeEl, state.sensorState || "INIT");
}

function renderCollectorState() {
  applyStateBadgeStyle(collectorStateBadgeEl, state.collectorState || "UNKNOWN");
  if (!collectorMetaEl) return;

  const m = state.collectorMeta || {};
  const lines = [
    `lastCollectAt: ${m.lastCollectAt || "-"}`,
    `lastCollectDeltaMs: ${Number.isFinite(m.lastCollectDeltaMs) ? m.lastCollectDeltaMs : "-"}`,
    `lastRecoveryAt: ${m.lastRecoveryAt || "-"}`,
    `updatedAt: ${m.updatedAt || "-"}`,
    `staleMs: ${Number.isFinite(m.staleMs) ? m.staleMs : "-"}`,
  ];
  collectorMetaEl.textContent = lines.join("\n");
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

function showDetailedError(code, fallbackMessage, detail = "") {
  const meta = getErrorMeta(code);
  const base = meta?.userMessage || fallbackMessage;
  const suffix = detail ? ` ${detail}` : "";
  setNetMessage(`[${code}] ${base}${suffix}`);
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

async function fetchCollectorStatus() {
  try {
    const r = await fetch(`${state.apiBase}/collector/status`);
    if (!r.ok) throw new Error(`collector-status ${r.status}`);
    const data = await r.json();
    state.collectorState = data.collectorState || "UNKNOWN";
    state.collectorMeta = data;
  } catch {
    state.collectorState = "DISCONNECTED";
    state.collectorMeta = {
      lastCollectAt: null,
      lastCollectDeltaMs: null,
      lastRecoveryAt: null,
      updatedAt: new Date().toISOString(),
      staleMs: null,
    };
  }
  renderCollectorState();
}

async function fetchServicesStatus() {
  try {
    const r = await fetch(`${state.apiBase}/services/status`);
    if (!r.ok) throw new Error(`services-status ${r.status}`);
    const data = await r.json();
    state.services = Array.isArray(data.services) ? data.services : [];
  } catch {
    state.services = [];
  }
  renderArchiveUnits();
}

async function loadInitial() {
  try {
    const [eventsResp] = await Promise.all([
      fetch(`${state.apiBase}/events?limit=50`),
      fetchSensorStatus(),
      fetchCollectorStatus(),
      fetchServicesStatus()
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

  es.addEventListener("collector.state", (ev) => {
    const data = JSON.parse(ev.data || "{}");
    state.collectorState = data.state || state.collectorState || "UNKNOWN";
    state.collectorMeta = {
      ...(state.collectorMeta || {}),
      ...data,
    };
    renderCollectorState();
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

      const isUrlMismatchCase = r.status === 404 && (payload?.targetUrl || payload?.fallbackUrl);
      const mismatchGuide = isUrlMismatchCase ? "백엔드 서버의 제어 URL이 일치하지 않습니다." : "";

      showDetailedError(
        kind === "comm" ? 4002 : 4003,
        `센서 ${kind} 토글 실패(${r.status})`,
        `${mismatchGuide}${extra}${fallback}`
      );
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
    menuArchive: "보관함",
    archiveTitle: "보관함",
    langLabel: "한국어",
  },
  en: {
    title: "CUTE Dashboard",
    subtitle: "Monitoring + Control (MVP)",
    menuHome: "Home",
    menuLog: "Logs",
    menuArchive: "Archive",
    archiveTitle: "Archive",
    langLabel: "English",
  }
};

function applyLang(lang) {
  const dict = I18N[lang] || I18N.ko;
  titleEl.textContent = dict.title;
  subtitleEl.textContent = dict.subtitle;
  const homeLabel = menuDashboard.querySelector(".label");
  const logLabel = menuLog.querySelector(".label");
  const archiveLabel = menuArchive?.querySelector(".label");
  const labelEl = langCurrent?.querySelector("span:last-child");
  if (homeLabel) homeLabel.textContent = dict.menuHome;
  if (logLabel) logLabel.textContent = dict.menuLog;
  if (archiveLabel) archiveLabel.textContent = dict.menuArchive;
  if (archiveTitleEl) archiveTitleEl.textContent = dict.archiveTitle;

  if (labelEl) {
    labelEl.textContent = `${dict.langLabel} ▾`;
  } else {
    langCurrent.textContent = `${dict.langLabel} ▾`;
  }

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
  const isLog = view === "log";
  const isArchive = view === "archive";

  viewDashboard.classList.toggle("on", isDashboard);
  viewLog.classList.toggle("on", isLog);
  viewArchive.classList.toggle("on", isArchive);

  menuDashboard.classList.toggle("on", isDashboard);
  menuLog.classList.toggle("on", isLog);
  menuArchive?.classList.toggle("on", isArchive);
}

(async function boot() {
  const [cfg, catalog] = await Promise.all([
    fetch("/config").then((r) => r.json()),
    fetch("/error-catalog.json").then((r) => r.json()).catch(() => ({}))
  ]);

  state.apiBase = cfg.apiBaseUrl;
  state.errors = catalog || {};

  document.getElementById("refresh").addEventListener("click", loadInitial);
  collectorRefreshBtn?.addEventListener("click", fetchCollectorStatus);
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
  menuArchive?.addEventListener("click", () => setView("archive"));

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
  renderCollectorState();
  renderArchiveUnits();
  setView("dashboard");
  applyLang("ko");
  connectSse();

  setInterval(fetchSensorStatus, 3000);
  setInterval(fetchCollectorStatus, 3000);
  setInterval(fetchServicesStatus, 5000);

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
