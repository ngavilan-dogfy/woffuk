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
const holidayList = document.getElementById("holidayList");
const hdrCollapsible = document.getElementById("hdrCollapsible");
const offMsg = document.getElementById("offMsg");

let holidays = [];

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

// ── Toggle ON/OFF label live ──────────────────────────
enabledCb.addEventListener("change", () => {
  updateStatus(enabledCb.checked);
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

// ── Session check ──────────────────────────────────────
async function checkSession() {
  sessionDot.className = "session-dot";
  sessionText.textContent = "Comprobando...";
  const openUrl = woffuUrlInput.value.trim() || "https://dogfydiet.woffu.com";

  function showExpired(text) {
    sessionDot.className = "session-dot expired";
    sessionText.innerHTML = `${text} — <a href="#" id="openWoffu">abrir Woffu</a> · <a href="#" id="retrySession">reintentar</a>`;
    document.getElementById("openWoffu").addEventListener("click", (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: openUrl });
    });
    document.getElementById("retrySession").addEventListener("click", (e) => {
      e.preventDefault();
      checkSession();
    });
  }

  try {
    const r = await chrome.runtime.sendMessage({ action: "checkSession" });
    if (r?.ok) {
      sessionDot.className = "session-dot ok";
      sessionText.textContent = "Sesion activa";
    } else if (r?.reason === "no_token") {
      showExpired("Abre Woffu en una pestana");
    } else {
      showExpired("Sesion expirada");
    }
  } catch {
    showExpired("Error de conexion");
  }
}

// ── Next clock indicator ───────────────────────────────
function updateNextClock(schedule, triggered, enabled) {
  if (!enabled || !schedule || schedule.length === 0) {
    nextClockEl.style.display = "none";
    return;
  }

  const now = new Date();
  const todayKey = localDateKey(now);
  const triggeredMap = (triggered && triggered._date === todayKey) ? triggered : { _date: todayKey };
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  let next = null;
  for (let i = 0; i < schedule.length; i++) {
    const entry = schedule[i];
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

  if (!result) return { symbol: "—", color: "var(--text-3)" };
  if (result.missed) return { symbol: "✗", color: "var(--red)" };
  if (result.success) return { symbol: "✓", color: "var(--green)" };
  return { symbol: "✗", color: "var(--red)" };
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

// ── Holidays ───────────────────────────────────────────
function renderHolidays() {
  holidayList.innerHTML = "";
  if (holidays.length === 0) {
    holidayList.innerHTML = '<span class="holiday-empty">Sin festivos</span>';
    return;
  }

  holidays.sort().forEach((date) => {
    const chip = document.createElement("div");
    chip.className = "holiday-chip";
    const [y, mo, d] = date.split("-");
    chip.innerHTML = `<span>${d}/${mo}/${y}</span><button title="Eliminar">&times;</button>`;
    chip.querySelector("button").addEventListener("click", () => {
      holidays = holidays.filter((h) => h !== date);
      renderHolidays();
    });
    holidayList.appendChild(chip);
  });
}

document.getElementById("addHoliday").addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "date";
  input.style.cssText = "position:absolute;opacity:0;pointer-events:none;";
  document.body.appendChild(input);
  input.addEventListener("change", () => {
    if (input.value && !holidays.includes(input.value)) {
      holidays.push(input.value);
      renderHolidays();
    }
    input.remove();
  });
  input.addEventListener("blur", () => setTimeout(() => input.remove(), 200));
  input.showPicker();
});

// ── Load state ─────────────────────────────────────────
async function load() {
  const data = await chrome.storage.local.get([
    "schedule", "enabled", "log", "activeDays", "woffuUrl",
    "timeWindow", "randomOffset", "notifySuccess", "holidays", "triggered"
  ]);

  const isEnabled = !!data.enabled;
  enabledCb.checked = isEnabled;
  statusLabel.textContent = isEnabled ? "ON" : "OFF";
  statusLabel.className = isEnabled ? "status-label on" : "status-label";

  // Set initial state instantly (no transition)
  document.body.style.transition = "none";
  hdrCollapsible.style.transition = "none";
  if (isEnabled) {
    document.body.classList.remove("app-off");
    hdrCollapsible.classList.remove("collapsed");
  }
  // Re-enable transitions after paint
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.style.transition = "";
      hdrCollapsible.style.transition = "";
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

  holidays = data.holidays || [];
  renderHolidays();

  scheduleCard.innerHTML = "";
  const entries = data.schedule || [];
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
  updateNextClock(data.schedule, data.triggered, isEnabled);
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
    : `<span class="entry-status" style="color:var(--text-3)">—</span>`;

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

  await chrome.storage.local.set({
    schedule, enabled, activeDays, woffuUrl, timeWindow, randomOffset, notifySuccess, holidays
  });

  updateStatus(enabled);
  showToast("Configuracion guardada", "ok");

  const { triggered } = await chrome.storage.local.get("triggered");
  scheduleCard.innerHTML = "";
  if (schedule.length === 0) {
    scheduleCard.innerHTML = '<div class="sched-empty">Sin fichajes configurados</div>';
  } else {
    schedule.forEach((entry, i) => {
      const status = getEntryStatus(i, entry, triggered);
      addRow(entry, i * 50, status);
    });
  }
  updateNextClock(schedule, triggered, enabled);
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
    const tipo = e.type === "in" ? "Entrar" : "Salir";
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
      <span class="lg-msg">${entry.type === "in" ? "Entrar" : "Salir"}${attempt}${entry.error ? " — " + entry.error : ""}</span>
      <span class="lg-badge ${ok ? "ok" : "fail"}">${ok ? "OK" : "FAIL"}</span>
    `;
    logDiv.appendChild(row);
  });
}

// ── Init ───────────────────────────────────────────────
load();
