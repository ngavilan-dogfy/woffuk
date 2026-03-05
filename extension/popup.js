const scheduleCard = document.getElementById("scheduleCard");
const enabledCb = document.getElementById("enabled");
const statusLabel = document.getElementById("statusLabel");
const toast = document.getElementById("toast");
const toastMsg = document.getElementById("toastMsg");
const logDiv = document.getElementById("log");
const woffuUrlInput = document.getElementById("woffuUrl");
const daysContainer = document.getElementById("days");
const timeWindowInput = document.getElementById("timeWindow");
const randomOffsetInput = document.getElementById("randomOffset");
const workedHoursEl = document.getElementById("workedHours");
const logCountEl = document.getElementById("logCount");
const notifySuccessCb = document.getElementById("notifySuccess");
const sessionDot = document.getElementById("sessionDot");
const sessionText = document.getElementById("sessionText");
const nextClockEl = document.getElementById("nextClock");
const nextClockText = document.getElementById("nextClockText");
const hdrCollapsible = document.getElementById("hdrCollapsible");
const offMsg = document.getElementById("offMsg");
const logoutBtn = document.getElementById("logoutBtn");
const authPanel = document.getElementById("authPanel");
const authBtns = document.getElementById("authBtns");
const authForm = document.getElementById("authForm");
const authGoogle = document.getElementById("authGoogle");
const authCredBtn = document.getElementById("authCredBtn");
const authBack = document.getElementById("authBack");
const authEmailInput = document.getElementById("authEmail");
const authPassInput = document.getElementById("authPass");
const authSubmit = document.getElementById("authSubmit");
const authError = document.getElementById("authError");
const schedDayLabel = document.getElementById("schedDayLabel");
const resetToDefault = document.getElementById("resetToDefault");

// ── Per-day schedule state ──────────────────────────────
let schedulesData = null;  // { default: [...], overrides: { "5": [...], ... } }
let selectedDay = null;    // null = default, number = editing that day's override

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];

function getScheduleForDay(dayNumber) {
  if (!schedulesData) return [];
  const dayStr = String(dayNumber);
  if (schedulesData.overrides && schedulesData.overrides[dayStr]) {
    return schedulesData.overrides[dayStr];
  }
  return schedulesData.default || [];
}

function localDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Collapsible sections ───────────────────────────────
function setupCollapse(toggleId, bodyId) {
  const toggle = document.getElementById(toggleId);
  const body = document.getElementById(bodyId);
  toggle.addEventListener("click", () => {
    toggle.classList.toggle("open");
    body.classList.toggle("open");
  });
}

setupCollapse("settingsToggle", "settingsBody");
setupCollapse("logToggle", "logBody");

// ── Toggle ON/OFF — persists immediately ────────────────
enabledCb.addEventListener("change", async () => {
  const on = enabledCb.checked;
  await chrome.storage.local.set({ enabled: on });
  updateStatus(on);
});

// ── Toast ──────────────────────────────────────────────
function showToast(text, type = "info") {
  toastMsg.textContent = text;
  toast.className = `toast show ${type}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.add("hiding");
    toast.classList.remove("show");
    setTimeout(() => { toast.className = "toast"; }, 200);
  }, 3000);
}

// ── Status update ──────────────────────────────────────
function updateStatus(on) {
  statusLabel.textContent = on ? "ON" : "OFF";
  statusLabel.className = on ? "status-label on" : "status-label";
  setAppActive(on);
}

function setAppActive(on) {
  document.body.classList.toggle("app-off", !on);
  hdrCollapsible.classList.toggle("collapsed", !on);
  if (on) checkSession();
}

function setBodyVisible(visible) {
  document.body.classList.toggle("app-off", !visible);
}

// ── Session check ──────────────────────────────────────
function applySessionState(state) {
  if (state === "ok") {
    sessionDot.className = "session-dot ok";
    sessionText.textContent = "Sesion activa";
    logoutBtn.style.display = "";
    authPanel.classList.remove("show");
    setBodyVisible(true);
  } else {
    sessionDot.className = "session-dot expired";
    logoutBtn.style.display = "none";

    if (state === "no_auth") {
      sessionText.textContent = "Sin sesion";
      authPanel.classList.add("show");
      authBtns.style.display = "flex";
      authForm.classList.remove("show");
    } else if (state === "expired") {
      sessionText.innerHTML = `Sesion expirada — <a href="#" id="retrySession">reintentar</a>`;
      document.getElementById("retrySession")?.addEventListener("click", (e) => {
        e.preventDefault();
        checkSession();
      });
      authPanel.classList.add("show");
      authBtns.style.display = "flex";
      authForm.classList.remove("show");
    } else {
      sessionText.innerHTML = `Error de conexion — <a href="#" id="retrySession">reintentar</a>`;
      document.getElementById("retrySession")?.addEventListener("click", (e) => {
        e.preventDefault();
        checkSession();
      });
      authPanel.classList.add("show");
      authBtns.style.display = "flex";
      authForm.classList.remove("show");
    }
    setBodyVisible(false);
  }
}

async function checkSession() {
  const { sessionState } = await chrome.storage.local.get("sessionState");
  if (sessionState) {
    applySessionState(sessionState);
  } else {
    sessionDot.className = "session-dot";
    sessionText.textContent = "Comprobando...";
  }

  try {
    const r = await chrome.runtime.sendMessage({ action: "checkSession" });
    let newState;
    if (r?.ok) newState = "ok";
    else if (r?.reason === "no_auth") newState = "no_auth";
    else if (r?.reason === "expired") newState = "expired";
    else newState = "error";

    await chrome.storage.local.set({ sessionState: newState });
    applySessionState(newState);
  } catch {
    await chrome.storage.local.set({ sessionState: "error" });
    applySessionState("error");
  }
}

// ── Auth panel handlers ─────────────────────────────────
authGoogle.addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "openLoginTab" });
});

authCredBtn.addEventListener("click", () => {
  authBtns.style.display = "none";
  authForm.classList.add("show");
  authError.classList.remove("show");
  authEmailInput.focus();
  chrome.storage.local.get("authEmail").then(({ authEmail }) => {
    if (authEmail) authEmailInput.value = authEmail;
  });
});

authBack.addEventListener("click", () => {
  authForm.classList.remove("show");
  authBtns.style.display = "flex";
});

authSubmit.addEventListener("click", doCredentialLogin);
authPassInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") doCredentialLogin();
});

async function doCredentialLogin() {
  const email = authEmailInput.value.trim();
  const password = authPassInput.value;
  if (!email || !password) {
    authError.textContent = "Rellena email y contrasena";
    authError.classList.add("show");
    return;
  }

  authSubmit.disabled = true;
  authSubmit.textContent = "Iniciando...";
  authError.classList.remove("show");

  try {
    const r = await chrome.runtime.sendMessage({ action: "loginCredentials", email, password });
    if (r?.ok) {
      showToast("Sesion iniciada", "ok");
      await chrome.storage.local.set({ sessionState: "ok" });
      applySessionState("ok");
      const { woffuUrl } = await chrome.storage.local.get("woffuUrl");
      if (woffuUrl) woffuUrlInput.value = woffuUrl;
    } else {
      authError.textContent = r?.error || "Error desconocido";
      authError.classList.add("show");
    }
  } catch (err) {
    authError.textContent = err.message;
    authError.classList.add("show");
  } finally {
    authSubmit.disabled = false;
    authSubmit.textContent = "Iniciar sesion";
  }
}

logoutBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ action: "logout" });
  authPassInput.value = "";
  await chrome.storage.local.set({ sessionState: "no_auth" });
  applySessionState("no_auth");
  showToast("Sesion cerrada", "info");
});

// ── Next clock indicator (always uses today's schedule) ──
function updateNextClock(triggered, enabled) {
  const todaySchedule = getScheduleForDay(new Date().getDay());

  if (!enabled || !todaySchedule || todaySchedule.length === 0) {
    nextClockEl.style.display = "none";
    return;
  }

  const now = new Date();
  const todayKey = localDateKey(now);
  const triggeredMap = (triggered && triggered._date === todayKey) ? triggered : { _date: todayKey };
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  let next = null;
  for (let i = 0; i < todaySchedule.length; i++) {
    const entry = todaySchedule[i];
    const entryKey = `${i}_${entry.hour}_${entry.minute}_${entry.type}`;
    if (triggeredMap[entryKey]) continue;
    const entryMinutes = entry.hour * 60 + entry.minute;
    if (entryMinutes > currentMinutes || (entryMinutes >= currentMinutes - 1)) {
      next = entry;
      break;
    }
  }

  if (next) {
    const time = `${String(next.hour).padStart(2, "0")}:${String(next.minute).padStart(2, "0")}`;
    const label = next.type === "in" ? "Entrar" : "Salir";
    nextClockText.innerHTML = `Proximo: <strong>${label} a las ${time}</strong>`;
    nextClockEl.style.display = "flex";
  } else {
    nextClockText.innerHTML = "Todos los fichajes de hoy completados &#10003;";
    nextClockEl.style.display = "flex";
  }
}

// ── Today's status for entries ─────────────────────────
function getEntryStatus(index, entry, triggered) {
  const now = new Date();
  const todayKey = localDateKey(now);
  const triggeredMap = (triggered && triggered._date === todayKey) ? triggered : { _date: todayKey };
  const entryKey = `${index}_${entry.hour}_${entry.minute}_${entry.type}`;
  const result = triggeredMap[entryKey];
  const retryResult = triggeredMap[`retry_${entryKey}`];

  // Retrying state — show gold "↺"
  if (!result && retryResult) return { symbol: "\u21BA", color: "var(--gold)" };

  if (!result) return { symbol: "\u2014", color: "var(--text-3)" };
  if (result.missed) return { symbol: "\u2717", color: "var(--red)" };
  if (result.success) return { symbol: "\u2713", color: "var(--green)" };
  return { symbol: "\u2717", color: "var(--red)" };
}

// ── Worked hours calculation ───────────────────────────
function calcWorkedHours() {
  const rows = scheduleCard.querySelectorAll(".entry");
  const entries = [];

  rows.forEach((row) => {
    const time = row.querySelector(".entry-time").value;
    const type = row.querySelector(".entry-type").value;
    if (!time) return;
    const [h, m] = time.split(":").map(Number);
    if (isNaN(h) || isNaN(m)) return;
    entries.push({ minutes: h * 60 + m, type });
  });

  entries.sort((a, b) => a.minutes - b.minutes);

  let totalMinutes = 0;
  let lastIn = null;

  for (const e of entries) {
    if (e.type === "in") {
      lastIn = e.minutes;
    } else if (e.type === "out" && lastIn !== null) {
      totalMinutes += e.minutes - lastIn;
      lastIn = null;
    }
  }

  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  workedHoursEl.textContent = `${h}h ${String(m).padStart(2, "0")}m`;
}

// ── Day selection for per-day editing ──────────────────
function selectDay(dayNum) {
  if (selectedDay === dayNum) {
    // Deselect — go back to default
    selectedDay = null;
  } else {
    selectedDay = dayNum;
  }
  updateDaySelection();
  renderScheduleForSelectedDay();
}

function updateDaySelection() {
  daysContainer.querySelectorAll(".dy").forEach((dy) => {
    dy.classList.remove("selected");
  });

  if (selectedDay !== null) {
    const sel = daysContainer.querySelector(`.dy[data-day="${selectedDay}"]`);
    if (sel) sel.classList.add("selected");
    schedDayLabel.textContent = `\u2014 ${DAY_NAMES[selectedDay]}`;
    // Show reset button only if this day has an override
    const hasOverride = schedulesData?.overrides?.[String(selectedDay)];
    resetToDefault.style.display = hasOverride ? "" : "none";
  } else {
    schedDayLabel.textContent = "";
    resetToDefault.style.display = "none";
  }
}

function renderScheduleForSelectedDay() {
  let entries;
  if (selectedDay !== null) {
    entries = getScheduleForDay(selectedDay);
  } else {
    entries = schedulesData?.default || [];
  }

  scheduleCard.innerHTML = "";
  if (entries.length === 0) {
    scheduleCard.innerHTML = '<div class="sched-empty">Sin fichajes configurados</div>';
  } else {
    // Only show status indicators when viewing today's actual schedule
    const now = new Date();
    const isToday = selectedDay === null || selectedDay === now.getDay();
    chrome.storage.local.get("triggered").then(({ triggered }) => {
      entries.forEach((entry, i) => {
        const status = isToday ? getEntryStatus(i, entry, triggered) : null;
        addRow(entry, i * 50, status);
      });
    });
  }
  calcWorkedHours();
}

function updateOverrideDots() {
  daysContainer.querySelectorAll(".dy").forEach((dy) => {
    const dayNum = dy.getAttribute("data-day");
    const hasOverride = schedulesData?.overrides?.[dayNum] && schedulesData.overrides[dayNum].length > 0;
    dy.classList.toggle("has-override", !!hasOverride);
  });
}

// Day click: 1st click on unchecked → check, 1st click on checked → edit, 2nd click on editing → uncheck
daysContainer.querySelectorAll(".dy").forEach((dy) => {
  dy.addEventListener("click", (e) => {
    const dayNum = Number(dy.getAttribute("data-day"));
    const cb = dy.querySelector("input");

    if (cb.checked && !e.target.matches("input")) {
      e.preventDefault();
      if (selectedDay === dayNum) {
        // Already editing this day → uncheck it
        cb.checked = false;
        selectedDay = null;
        updateDaySelection();
        renderScheduleForSelectedDay();
      } else {
        // Checked but not editing → enter edit mode
        selectDay(dayNum);
      }
    }
  });
});

// Reset button — delete override for selected day
resetToDefault.addEventListener("click", async () => {
  if (selectedDay === null || !schedulesData) return;
  const dayStr = String(selectedDay);
  if (schedulesData.overrides && schedulesData.overrides[dayStr]) {
    delete schedulesData.overrides[dayStr];
    await chrome.storage.local.set({ schedules: schedulesData });
    updateOverrideDots();
    renderScheduleForSelectedDay();
    updateDaySelection();
    showToast(`Horario de ${DAY_NAMES[selectedDay]} restablecido`, "ok");
  }
});

// ── Load state ─────────────────────────────────────────
async function load() {
  const data = await chrome.storage.local.get([
    "schedule", "schedules", "enabled", "log", "activeDays", "woffuUrl",
    "timeWindow", "randomOffset", "notifySuccess", "triggered"
  ]);

  // Migration fallback: old schedule → new schedules
  if (data.schedules) {
    schedulesData = data.schedules;
  } else if (data.schedule) {
    schedulesData = { default: data.schedule, overrides: {} };
    await chrome.storage.local.set({ schedules: schedulesData });
    await chrome.storage.local.remove("schedule");
  } else {
    schedulesData = { default: [], overrides: {} };
  }

  const isEnabled = !!data.enabled;
  enabledCb.checked = isEnabled;
  statusLabel.textContent = isEnabled ? "ON" : "OFF";
  statusLabel.className = isEnabled ? "status-label on" : "status-label";

  const { sessionState: cachedSession } = await chrome.storage.local.get("sessionState");
  const showBody = isEnabled && cachedSession === "ok";
  document.body.classList.toggle("app-off", !showBody);
  hdrCollapsible.classList.toggle("collapsed", !isEnabled);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.classList.remove("no-transition");
    });
  });

  const days = data.activeDays || [1, 2, 3, 4, 5];
  daysContainer.querySelectorAll("input").forEach((cb) => {
    cb.checked = days.includes(Number(cb.value));
  });

  woffuUrlInput.value = data.woffuUrl || "https://dogfydiet.woffu.com";
  timeWindowInput.value = data.timeWindow ?? 15;
  randomOffsetInput.value = data.randomOffset ?? 3;
  notifySuccessCb.checked = !!data.notifySuccess;

  // Render default schedule (or selected day if any)
  selectedDay = null;
  updateDaySelection();
  updateOverrideDots();

  const entries = schedulesData.default || [];
  scheduleCard.innerHTML = "";
  if (entries.length === 0) {
    scheduleCard.innerHTML = '<div class="sched-empty">Sin fichajes configurados</div>';
  } else {
    entries.forEach((entry, i) => {
      const status = getEntryStatus(i, entry, data.triggered);
      addRow(entry, i * 50, status);
    });
  }

  calcWorkedHours();
  renderLog(data.log || []);
  updateNextClock(data.triggered, isEnabled);
  if (isEnabled) checkSession();
}

// ── Schedule rows ──────────────────────────────────────
function addRow(entry = { hour: 8, minute: 0, type: "in" }, delay = 0, status = null) {
  const empty = scheduleCard.querySelector(".sched-empty");
  if (empty) empty.remove();

  const row = document.createElement("div");
  row.className = "entry";
  if (delay > 0) {
    row.style.animation = `entryIn 0.25s ease ${delay}ms both`;
  }

  const timeVal = `${String(entry.hour).padStart(2, "0")}:${String(entry.minute).padStart(2, "0")}`;
  const typeClass = entry.type === "in" ? "is-in" : "is-out";

  const statusHtml = status
    ? `<span class="entry-status" style="color:${status.color}">${status.symbol}</span>`
    : `<span class="entry-status" style="color:var(--text-3)">\u2014</span>`;

  row.innerHTML = `
    <div class="entry-time-wrap">
      <div class="entry-dot ${entry.type}"></div>
    </div>
    <input class="entry-time" type="time" value="${timeVal}" required>
    <select class="entry-type ${typeClass}">
      <option value="in" ${entry.type === "in" ? "selected" : ""}>Entrar</option>
      <option value="out" ${entry.type === "out" ? "selected" : ""}>Salir</option>
    </select>
    ${statusHtml}
    <button class="entry-del">&times;</button>
  `;

  const select = row.querySelector(".entry-type");
  const dot = row.querySelector(".entry-dot");

  const recalc = () => {
    dot.className = `entry-dot ${select.value}`;
    select.className = `entry-type ${select.value === "in" ? "is-in" : "is-out"}`;
    calcWorkedHours();
  };

  select.addEventListener("change", recalc);
  row.querySelector(".entry-time").addEventListener("change", calcWorkedHours);

  row.querySelector(".entry-del").addEventListener("click", () => {
    row.style.opacity = "0";
    row.style.transform = "translateX(10px)";
    row.style.transition = "all 0.2s";
    setTimeout(() => {
      row.remove();
      if (!scheduleCard.querySelector(".entry")) {
        scheduleCard.innerHTML = '<div class="sched-empty">Sin fichajes configurados</div>';
      }
      calcWorkedHours();
    }, 200);
  });

  scheduleCard.appendChild(row);
  calcWorkedHours();
}

// ── Add row (auto-alternate type) ──────────────────────
document.getElementById("addRow").addEventListener("click", () => {
  const rows = scheduleCard.querySelectorAll(".entry");
  const lastType = rows.length > 0 ? rows[rows.length - 1].querySelector(".entry-type").value : "out";
  const nextType = lastType === "in" ? "out" : "in";
  addRow({ hour: 8, minute: 0, type: nextType });
});

// ── Preset button ──────────────────────────────────────
document.getElementById("presetBtn").addEventListener("click", () => {
  const preset = [
    { hour: 8, minute: 0, type: "in" },
    { hour: 13, minute: 45, type: "out" },
    { hour: 14, minute: 30, type: "in" },
    { hour: 17, minute: 30, type: "out" }
  ];
  scheduleCard.innerHTML = "";
  preset.forEach((entry, i) => addRow(entry, i * 50));
  showToast("Jornada completa cargada", "ok");
});

// ── Save ───────────────────────────────────────────────
document.getElementById("save").addEventListener("click", async () => {
  const rows = scheduleCard.querySelectorAll(".entry");
  const schedule = [];
  let valid = true;

  rows.forEach((row) => {
    const timeInput = row.querySelector(".entry-time");
    const time = timeInput.value;
    if (!time) { valid = false; timeInput.style.borderBottom = "2px solid var(--red)"; return; }
    timeInput.style.borderBottom = "";
    const [h, m] = time.split(":").map(Number);
    if (isNaN(h) || isNaN(m)) { valid = false; return; }
    schedule.push({ hour: h, minute: m, type: row.querySelector(".entry-type").value });
  });

  if (!valid) { showToast("Hay horarios invalidos", "err"); return; }

  schedule.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));

  const activeDays = [];
  daysContainer.querySelectorAll("input:checked").forEach((cb) => {
    activeDays.push(Number(cb.value));
  });

  if (activeDays.length === 0) { showToast("Selecciona al menos un dia", "err"); return; }

  const enabled = enabledCb.checked;
  const woffuUrl = woffuUrlInput.value.trim() || "https://dogfydiet.woffu.com";
  const timeWindow = Math.max(1, Math.min(60, parseInt(timeWindowInput.value) || 15));
  const randomOffset = Math.max(0, Math.min(10, parseInt(randomOffsetInput.value) || 0));
  const notifySuccess = notifySuccessCb.checked;

  // Save to correct slot in schedulesData
  if (!schedulesData) schedulesData = { default: [], overrides: {} };
  if (!schedulesData.overrides) schedulesData.overrides = {};

  if (selectedDay !== null) {
    // Saving a per-day override
    schedulesData.overrides[String(selectedDay)] = schedule;
  } else {
    // Saving the default schedule
    schedulesData.default = schedule;
  }

  await chrome.storage.local.set({
    schedules: schedulesData, enabled, activeDays, woffuUrl, timeWindow, randomOffset, notifySuccess
  });

  updateStatus(enabled);
  updateOverrideDots();

  const dayName = selectedDay !== null ? ` (${DAY_NAMES[selectedDay]})` : "";
  showToast(`Configuracion guardada${dayName}`, "ok");

  // Re-render
  const { triggered } = await chrome.storage.local.get("triggered");
  const now = new Date();
  const isToday = selectedDay === null || selectedDay === now.getDay();

  scheduleCard.innerHTML = "";
  if (schedule.length === 0) {
    scheduleCard.innerHTML = '<div class="sched-empty">Sin fichajes configurados</div>';
  } else {
    schedule.forEach((entry, i) => {
      const status = isToday ? getEntryStatus(i, entry, triggered) : null;
      addRow(entry, i * 50, status);
    });
  }
  updateNextClock(triggered, enabled);
  updateDaySelection();
});

// ── Test buttons ───────────────────────────────────────
document.getElementById("testIn").addEventListener("click", () => testClock("in"));
document.getElementById("testOut").addEventListener("click", () => testClock("out"));

async function testClock(type) {
  showToast(`Probando ${type === "in" ? "Entrar" : "Salir"}...`, "info");
  try {
    const response = await chrome.runtime.sendMessage({ action: "manualTrigger", type });
    if (response?.success) {
      showToast(`${type === "in" ? "Entrar" : "Salir"} ejecutado correctamente`, "ok");
    } else {
      showToast(response?.error || "Error desconocido", "err");
    }
  } catch (err) {
    showToast(err.message, "err");
  }
  setTimeout(load, 3000);
}

// ── Export log ─────────────────────────────────────────
document.getElementById("exportLog").addEventListener("click", async () => {
  const { log = [] } = await chrome.storage.local.get("log");
  if (log.length === 0) { showToast("Sin datos para exportar", "err"); return; }

  const csv = ["Fecha,Hora,Tipo,Resultado,Error,Intento"];
  log.forEach((e) => {
    const d = new Date(e.time);
    const date = d.toLocaleDateString("es-ES");
    const time = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    const tipo = e.type === "in" ? "Entrar" : e.type === "out" ? "Salir" : "Fichaje";
    const res = e.success ? "OK" : "FAIL";
    const err = (e.error || "").replace(/,/g, ";");
    csv.push(`${date},${time},${tipo},${res},${err},${e.attempt}`);
  });

  await navigator.clipboard.writeText(csv.join("\n"));
  showToast("CSV copiado al portapapeles", "ok");
});

// ── Clear log ─────────────────────────────────────────
document.getElementById("clearLog").addEventListener("click", async () => {
  try {
    await chrome.runtime.sendMessage({ action: "clearLog" });
    renderLog([]);
    showToast("Historial limpiado", "ok");
  } catch (err) {
    showToast("Error al limpiar", "err");
  }
});

// ── Log rendering ──────────────────────────────────────
function renderLog(log) {
  logDiv.innerHTML = "";
  logCountEl.textContent = log.length;

  if (log.length === 0) {
    logDiv.innerHTML = '<div class="log-empty">Sin fichajes registrados</div>';
    return;
  }

  log.slice().reverse().forEach((entry) => {
    const d = new Date(entry.time);
    const time = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    const date = d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
    const attempt = entry.attempt > 1 ? ` (x${entry.attempt})` : "";
    const ok = entry.success;

    const row = document.createElement("div");
    row.className = "lg";
    row.innerHTML = `
      <div class="lg-dot ${ok ? "ok" : "fail"}"></div>
      <span class="lg-time">${date} ${time}</span>
      <span class="lg-msg">${entry.type === "in" ? "Entrar" : entry.type === "out" ? "Salir" : "Fichaje"}${attempt}${entry.error ? " — " + entry.error : ""}</span>
      <span class="lg-badge ${ok ? "ok" : "fail"}">${ok ? "OK" : "FAIL"}</span>
    `;
    logDiv.appendChild(row);
  });
}

// Auto-refresh when storage changes
chrome.storage.onChanged.addListener((changes) => {
  // Reactive session state — updates popup when background captures token (e.g. Google login)
  if (changes.sessionState) {
    const newState = changes.sessionState.newValue;
    if (newState) applySessionState(newState);
  }
});

// ── Solicitudes section ─────────────────────────────────
setupCollapse("reqToggle", "reqBody");

let reqContextLoaded = false;
let reqAgreementEvents = [];
let reqGeneratedDates = [];
let reqSelectedIdx = -1; // index into reqAgreementEvents

// Cached DOM elements
const reqSearchWrap = document.getElementById("reqSearchWrap");
const reqSearchInput = document.getElementById("reqSearchInput");
const reqDropdown = document.getElementById("reqDropdown");
const reqInfoEl = document.getElementById("reqInfo");
const reqStatsEl = document.getElementById("reqStats");
const reqDescEl = document.getElementById("reqDesc");
const reqWarnEl = document.getElementById("reqWarn");
const reqModeDays = document.getElementById("reqModeDays");
const reqModeHours = document.getElementById("reqModeHours");
const reqResultsEl = document.getElementById("reqResults");
const reqPreviewWrap = document.getElementById("reqPreviewWrap");
const reqPreviewEl = document.getElementById("reqPreview");
const reqTotalEl = document.getElementById("reqTotal");
const reqSubmitBatchBtn = document.getElementById("reqSubmitBatch");
const reqSubmitSingleBtn = document.getElementById("reqSubmitSingle");
const reqWithdrawBatchBtn = document.getElementById("reqWithdrawBatch");
const reqFromInput = document.getElementById("reqFrom");
const reqToInput = document.getElementById("reqTo");
const reqHoursDateInput = document.getElementById("reqHoursDate");
const reqHoursStartInput = document.getElementById("reqHoursStart");
const reqHoursEndInput = document.getElementById("reqHoursEnd");

// Result chip helper — status: "ok", "fail", "skip"
function addResultChip(status, text, title) {
  const span = document.createElement("span");
  const symbols = { ok: "\u2713", fail: "\u2717", skip: "\u2013" };
  span.className = `req-result ${status}`;
  span.textContent = `${symbols[status] || "\u2013"} ${text}`;
  if (title) span.title = title;
  reqResultsEl.appendChild(span);
}

// Format a UserStats field — API returns objects like { Resource: "_DaysFormatted", Values: ["23"] }
function formatStat(field) {
  if (field == null) return null;
  if (typeof field === "string") return field || null;
  if (typeof field === "number") return String(field);
  // Object with Resource + Values (Woffu API format)
  if (field.Values && field.Values.length > 0) {
    const val = field.Values[0];
    const unit = (field.Resource || "").includes("Hour") ? "h" : "d";
    return `${val}${unit}`;
  }
  return null;
}

// ── Searchable dropdown logic ──

function getSelectedTypeName() {
  if (reqSelectedIdx >= 0 && reqAgreementEvents[reqSelectedIdx]) {
    return reqAgreementEvents[reqSelectedIdx].Name;
  }
  return "";
}

function positionDropdown() {
  const rect = reqSearchWrap.getBoundingClientRect();
  reqDropdown.style.top = rect.bottom + "px";
  reqDropdown.style.left = rect.left + "px";
  reqDropdown.style.width = rect.width + "px";
}

function openDropdown() {
  positionDropdown();
  reqDropdown.classList.add("open");
  reqSearchWrap.classList.add("open");
}

function closeDropdown() {
  reqDropdown.classList.remove("open");
  reqSearchWrap.classList.remove("open");
}

function highlightText(text, query) {
  if (!query) return text;
  const esc = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`(${esc})`, "gi"), "<mark>$1</mark>");
}

function renderReqOptions(filter) {
  const q = (filter || "").trim().toLowerCase();
  reqDropdown.innerHTML = "";
  let hasResults = false;

  reqAgreementEvents.forEach((ev, i) => {
    if (q && !ev.Name.toLowerCase().includes(q)) return;
    hasResults = true;

    const div = document.createElement("div");
    div.className = "req-opt" + (i === reqSelectedIdx ? " selected" : "");
    div.dataset.idx = i;

    const modeIcon = ev.UseDays === false ? "\u23F0" : "\uD83D\uDCC5"; // ⏰ or 📅
    const nameHtml = highlightText(ev.Name, q);

    let metaParts = [];
    if (ev.UserStats && !ev.UserStats.IsNull) {
      const avail = formatStat(ev.UserStats.AvailableFormatted);
      if (avail) metaParts.push(`${avail} disp.`);
    }
    if (ev.IsDocumentRequired) metaParts.push("\uD83D\uDCCE doc");

    div.innerHTML = `<span class="req-opt-name">${modeIcon} ${nameHtml}</span>`
      + (metaParts.length ? `<span class="req-opt-meta">${metaParts.join(" · ")}</span>` : "");

    // Use mousedown + preventDefault so blur doesn't fire before selection
    div.addEventListener("mousedown", (e) => {
      e.preventDefault();
      selectReqType(i);
    });

    reqDropdown.appendChild(div);
  });

  if (!hasResults) {
    const empty = document.createElement("div");
    empty.className = "req-opt";
    empty.style.opacity = "0.5";
    empty.style.pointerEvents = "none";
    empty.textContent = "Sin resultados";
    reqDropdown.appendChild(empty);
  }
}

function selectReqType(idx) {
  reqSelectedIdx = idx;
  reqSearchInput.value = getSelectedTypeName();
  closeDropdown();
  updateReqTypeInfo();
}

// Input events
reqSearchInput.addEventListener("focus", () => {
  reqSearchInput.select();
  renderReqOptions(reqSearchInput.value);
  openDropdown();
});

reqSearchInput.addEventListener("input", () => {
  renderReqOptions(reqSearchInput.value);
  if (!reqDropdown.classList.contains("open")) openDropdown();
});

reqSearchInput.addEventListener("blur", () => {
  // Restore selected name on blur (if user typed something random)
  reqSearchInput.value = getSelectedTypeName();
  closeDropdown();
});

reqSearchInput.addEventListener("keydown", (e) => {
  const opts = reqDropdown.querySelectorAll(".req-opt:not([style*='pointer-events'])");
  if (!opts.length) return;

  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const currentHighlight = reqDropdown.querySelector(".req-opt.highlighted");
    let curIdx = -1;
    opts.forEach((o, i) => { if (o === currentHighlight) curIdx = i; });

    if (e.key === "ArrowDown") curIdx = Math.min(curIdx + 1, opts.length - 1);
    else curIdx = Math.max(curIdx - 1, 0);

    opts.forEach(o => o.classList.remove("highlighted"));
    opts[curIdx].classList.add("highlighted");
    opts[curIdx].scrollIntoView({ block: "nearest" });
  } else if (e.key === "Enter") {
    e.preventDefault();
    const highlighted = reqDropdown.querySelector(".req-opt.highlighted");
    if (highlighted && highlighted.dataset.idx != null) {
      selectReqType(Number(highlighted.dataset.idx));
    } else if (opts.length === 1 && opts[0].dataset.idx != null) {
      selectReqType(Number(opts[0].dataset.idx));
    }
    reqSearchInput.blur();
  } else if (e.key === "Escape") {
    reqSearchInput.value = getSelectedTypeName();
    closeDropdown();
    reqSearchInput.blur();
  }
});

// Reposition on scroll/resize (since dropdown uses position:fixed)
window.addEventListener("scroll", () => { if (reqDropdown.classList.contains("open")) positionDropdown(); }, true);
window.addEventListener("resize", () => { if (reqDropdown.classList.contains("open")) positionDropdown(); });

// ── End searchable dropdown ──

// Load context on first open
document.getElementById("reqToggle").addEventListener("click", () => {
  if (reqContextLoaded) return;
  reqContextLoaded = true;
  loadReqContext();
});

async function loadReqContext() {
  reqSearchInput.disabled = true;
  reqSearchInput.placeholder = "Cargando tipos...";
  try {
    const r = await chrome.runtime.sendMessage({ action: "fetchRequestContext" });
    if (!r?.ok) {
      reqSearchInput.placeholder = `Error: ${r?.error || "desconocido"}`;
      return;
    }
    const prevIdx = reqSelectedIdx;
    reqAgreementEvents = r.data.AgreementEvents || [];
    if (reqAgreementEvents.length === 0) {
      reqSearchInput.placeholder = "Sin tipos disponibles";
      return;
    }
    reqSearchInput.disabled = false;
    reqSearchInput.placeholder = "Buscar tipo de solicitud...";
    // Restore previous selection if still valid (e.g. after stats refresh)
    if (prevIdx >= 0 && reqAgreementEvents[prevIdx]) {
      reqSelectedIdx = prevIdx;
      reqSearchInput.value = getSelectedTypeName();
    }
    updateReqTypeInfo();
  } catch (err) {
    reqSearchInput.placeholder = `Error: ${err.message}`;
  }
}

function updateReqTypeInfo() {
  const idx = reqSelectedIdx;

  if (idx < 0 || !reqAgreementEvents[idx]) {
    reqInfoEl.style.display = "none";
    reqModeDays.style.display = "none";
    reqModeHours.style.display = "none";
    return;
  }

  const ev = reqAgreementEvents[idx];
  reqInfoEl.style.display = "block";
  reqResultsEl.innerHTML = "";

  // Stats
  if (ev.UserStats && !ev.UserStats.IsNull) {
    const parts = [];
    const allocated = formatStat(ev.UserStats.AllocatedFormatted);
    const avail = formatStat(ev.UserStats.AvailableFormatted);
    const used = formatStat(ev.UserStats.UsedFormatted);
    if (avail) parts.push(`<strong>${avail}</strong> disponibles`);
    if (allocated && allocated !== avail) parts.push(`${allocated} asignados`);
    if (used && used !== "0d" && used !== "0h") parts.push(`${used} usados`);
    if (parts.length > 0) {
      reqStatsEl.innerHTML = parts.join(" &middot; ");
      reqStatsEl.style.display = "inline-flex";
    } else {
      reqStatsEl.style.display = "none";
    }
  } else {
    reqStatsEl.style.display = "none";
  }

  // Description
  if (ev.Description) {
    reqDescEl.textContent = ev.Description;
    reqDescEl.style.display = "block";
  } else {
    reqDescEl.style.display = "none";
  }

  // Document required warning
  reqWarnEl.style.display = ev.IsDocumentRequired ? "flex" : "none";

  // Mode: days vs hours (UseDays:false = hours mode)
  const useHours = ev.UseDays === false;
  reqModeDays.style.display = useHours ? "none" : "block";
  reqModeHours.style.display = useHours ? "block" : "none";

  // Reset preview
  reqPreviewWrap.style.display = "none";
  reqGeneratedDates = [];
}

// Weekday checkboxes toggle
document.getElementById("reqDays").addEventListener("click", (e) => {
  const label = e.target.closest("label");
  if (!label) return;
  const cb = label.querySelector("input");
  setTimeout(() => label.classList.toggle("checked", cb.checked), 0);
});

// Set default dates
const today = new Date();
reqFromInput.value = localDateKey(today);
reqToInput.value = localDateKey(new Date(today.getFullYear(), today.getMonth() + 1, 0));
reqHoursDateInput.value = localDateKey(today);

// Generate dates (days mode)
document.getElementById("reqGenerate").addEventListener("click", () => {
  const selectedDays = [];
  document.querySelectorAll("#reqDays input:checked").forEach(cb => selectedDays.push(Number(cb.value)));
  if (selectedDays.length === 0) { showToast("Selecciona al menos un dia", "err"); return; }

  const from = new Date(reqFromInput.value + "T00:00:00");
  const to = new Date(reqToInput.value + "T00:00:00");
  if (isNaN(from) || isNaN(to) || from > to) { showToast("Rango de fechas invalido", "err"); return; }

  reqGeneratedDates = [];
  const current = new Date(from);
  while (current <= to) {
    if (selectedDays.includes(current.getDay())) {
      reqGeneratedDates.push(localDateKey(current));
    }
    current.setDate(current.getDate() + 1);
  }

  reqResultsEl.innerHTML = "";

  if (reqGeneratedDates.length === 0) {
    reqPreviewWrap.style.display = "none";
    showToast("No hay fechas que coincidan", "err");
    return;
  }

  reqPreviewEl.innerHTML = reqGeneratedDates.map(d => {
    const date = new Date(d + "T00:00:00");
    const label = date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    return `<span class="req-chip">${label}</span>`;
  }).join("");
  reqTotalEl.textContent = `Total: ${reqGeneratedDates.length} dias`;
  reqSubmitBatchBtn.textContent = `Enviar ${reqGeneratedDates.length} solicitudes`;
  reqPreviewWrap.style.display = "block";
});

// Submit batch (days mode) — loop in popup so each sendMessage resolves quickly
reqSubmitBatchBtn.addEventListener("click", async () => {
  if (reqSelectedIdx < 0 || !reqAgreementEvents[reqSelectedIdx]) { showToast("Selecciona un tipo", "err"); return; }
  if (reqGeneratedDates.length === 0) { showToast("Genera fechas primero", "err"); return; }

  const total = reqGeneratedDates.length;
  const ev = reqAgreementEvents[reqSelectedIdx];
  reqSubmitBatchBtn.disabled = true;
  reqSubmitBatchBtn.textContent = `Enviando 0/${total}...`;
  reqResultsEl.innerHTML = "";

  let success = 0, failed = 0, skipped = 0;

  for (let i = 0; i < total; i++) {
    const dateStr = reqGeneratedDates[i];
    reqSubmitBatchBtn.textContent = `Enviando ${i + 1}/${total}...`;
    try {
      const r = await chrome.runtime.sendMessage({
        action: "submitOneRequest",
        date: dateStr,
        agreementEvent: ev
      });
      const date = new Date(dateStr + "T00:00:00");
      const label = date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
      if (r?.ok) {
        success++;
        addResultChip("ok", label);
      } else if (r?.duplicate) {
        skipped++;
        addResultChip("skip", label, "Ya solicitado");
      } else {
        failed++;
        addResultChip("fail", label, r?.error);
      }
    } catch (err) {
      failed++;
      const date = new Date(dateStr + "T00:00:00");
      const label = date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
      addResultChip("fail", label, err.message);
    }
  }

  reqSubmitBatchBtn.disabled = false;
  reqSubmitBatchBtn.textContent = `Enviar ${total} solicitudes`;

  const parts = [];
  if (success > 0) parts.push(`${success} enviadas`);
  if (skipped > 0) parts.push(`${skipped} ya existían`);
  if (failed > 0) parts.push(`${failed} fallidas`);
  showToast(parts.join(", "), failed > 0 ? "err" : "ok");

  loadReqContext();
});

// Withdraw batch (days mode) — find and cancel existing requests for generated dates
reqWithdrawBatchBtn.addEventListener("click", async () => {
  if (reqSelectedIdx < 0 || !reqAgreementEvents[reqSelectedIdx]) { showToast("Selecciona un tipo", "err"); return; }
  if (reqGeneratedDates.length === 0) { showToast("Genera fechas primero", "err"); return; }

  const ev = reqAgreementEvents[reqSelectedIdx];
  reqWithdrawBatchBtn.disabled = true;
  reqWithdrawBatchBtn.textContent = "Buscando...";
  reqResultsEl.innerHTML = "";

  try {
    // Fetch existing requests for this agreement event
    const r = await chrome.runtime.sendMessage({
      action: "fetchUserRequests",
      agreementEventId: ev.AgreementEventId,
      page: 1,
      pageSize: 200
    });

    if (!r?.ok) {
      showToast(r?.error || "Error buscando solicitudes", "err");
      return;
    }

    // Build map: date string → RequestId (only pending ones, StatusId 10)
    const dateToRequest = {};
    for (const req of r.requests) {
      if (req.RequestStatusId !== 10) continue; // only pending
      const d = req.StartDate?.split("T")[0];
      if (d) dateToRequest[d] = req.RequestId;
    }

    let cancelled = 0, notFound = 0;
    const total = reqGeneratedDates.length;

    for (let i = 0; i < total; i++) {
      const dateStr = reqGeneratedDates[i];
      reqWithdrawBatchBtn.textContent = `Retirando ${i + 1}/${total}...`;
      const date = new Date(dateStr + "T00:00:00");
      const label = date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });

      const requestId = dateToRequest[dateStr];
      if (!requestId) {
        notFound++;
        addResultChip("skip", label, "No encontrada");
        continue;
      }

      try {
        const cr = await chrome.runtime.sendMessage({ action: "cancelRequest", requestId });
        if (cr?.ok) {
          cancelled++;
          addResultChip("ok", label, "Retirada");
        } else {
          addResultChip("fail", label, cr?.error);
        }
      } catch (err) {
        addResultChip("fail", label, err.message);
      }
    }

    const parts = [];
    if (cancelled > 0) parts.push(`${cancelled} retiradas`);
    if (notFound > 0) parts.push(`${notFound} no encontradas`);
    showToast(parts.join(", "), "ok");

    loadReqContext();
  } catch (err) {
    showToast(err.message, "err");
  } finally {
    reqWithdrawBatchBtn.disabled = false;
    reqWithdrawBatchBtn.textContent = "Retirar";
  }
});

// Submit single (hours mode)
reqSubmitSingleBtn.addEventListener("click", async () => {
  if (reqSelectedIdx < 0 || !reqAgreementEvents[reqSelectedIdx]) { showToast("Selecciona un tipo", "err"); return; }

  const dateVal = reqHoursDateInput.value;
  const startTime = reqHoursStartInput.value;
  const endTime = reqHoursEndInput.value;

  if (!dateVal) { showToast("Selecciona una fecha", "err"); return; }
  if (!startTime || !endTime) { showToast("Indica hora inicio y fin", "err"); return; }
  if (startTime >= endTime) { showToast("La hora fin debe ser mayor que inicio", "err"); return; }

  reqSubmitSingleBtn.disabled = true;
  reqSubmitSingleBtn.textContent = "Enviando...";

  try {
    const r = await chrome.runtime.sendMessage({
      action: "submitSingleRequest",
      date: dateVal,
      startTime,
      endTime,
      agreementEvent: reqAgreementEvents[reqSelectedIdx]
    });

    reqResultsEl.innerHTML = "";

    if (r?.ok) {
      const date = new Date(dateVal + "T00:00:00");
      const label = date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
      addResultChip("ok", `${label} ${startTime}-${endTime}`);
      showToast("Solicitud enviada", "ok");
    } else if (r?.duplicate) {
      addResultChip("skip", "Ya solicitado");
      showToast("Ya existe una solicitud para esa fecha", "err");
    } else {
      addResultChip("fail", r?.error || "Error desconocido");
      showToast(r?.error || "Error desconocido", "err");
    }

    // Refresh context to update stats
    loadReqContext();
  } catch (err) {
    showToast(err.message, "err");
  } finally {
    reqSubmitSingleBtn.disabled = false;
    reqSubmitSingleBtn.textContent = "Enviar solicitud";
  }
});

// ── Init ───────────────────────────────────────────────
load();
