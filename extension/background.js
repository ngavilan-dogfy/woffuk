// ── Config ──────────────────────────────────────────────
const DEFAULT_SCHEDULE = [
  { hour: 8, minute: 0, type: "in" },
  { hour: 13, minute: 45, type: "out" },
  { hour: 14, minute: 30, type: "in" },
  { hour: 17, minute: 30, type: "out" }
];

const DEFAULT_WOFFU_URL = "https://dogfydiet.woffu.com";
const SIGN_API_PATH = "/api/svc/signs/signs";
const DEFAULT_TIME_WINDOW = 15;
const DEFAULT_RANDOM_OFFSET = 3;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3000;

// ── Install / Startup ──────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get("schedule");
  if (!data.schedule) {
    await chrome.storage.local.set({
      schedule: DEFAULT_SCHEDULE,
      enabled: true,
      activeDays: [1, 2, 3, 4, 5],
      woffuUrl: DEFAULT_WOFFU_URL,
      timeWindow: DEFAULT_TIME_WINDOW,
      randomOffset: DEFAULT_RANDOM_OFFSET,
      notifySuccess: false,
      holidays: [],
      triggered: {}
    });
  }
  await setupAlarms();
});

chrome.runtime.onStartup.addListener(async () => {
  await chrome.storage.local.set({ triggered: {} });
  await setupAlarms();
});

async function setupAlarms() {
  await chrome.alarms.clearAll();
  const { enabled } = await chrome.storage.local.get("enabled");
  if (!enabled) return;
  chrome.alarms.create("woffu-check", { periodInMinutes: 1 });
}

// ── Get token from Woffu tab's sessionStorage ───────────
async function getWoffuToken() {
  try {
    // Find a Woffu tab
    let tabs = await chrome.tabs.query({ url: "https://*.woffu.com/*" });
    if (tabs.length === 0) return null;

    // Read sessionStorage.token (SYNC function — no async)
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: () => sessionStorage.getItem("token")
    });

    return results?.[0]?.result || null;
  } catch (err) {
    console.log("[Woffuk] getWoffuToken error:", err.message);
    return null;
  }
}

// ── Alarm handler ──────────────────────────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "woffu-check") return;

  const { schedule, enabled, triggered, activeDays, timeWindow, randomOffset, notifySuccess, holidays } = await chrome.storage.local.get([
    "schedule", "enabled", "triggered", "activeDays", "timeWindow", "randomOffset", "notifySuccess", "holidays"
  ]);
  if (!enabled || !schedule) return;

  const now = new Date();
  const day = now.getDay();
  const days = activeDays || [1, 2, 3, 4, 5];
  if (!days.includes(day)) return;

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if ((holidays || []).includes(todayStr)) return;

  const window = timeWindow ?? DEFAULT_TIME_WINDOW;
  const maxOffset = randomOffset ?? DEFAULT_RANDOM_OFFSET;
  const todayKey = now.toISOString().slice(0, 10);
  const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();
  const triggeredMap = (triggered && triggered._date === todayKey) ? triggered : { _date: todayKey };

  for (let i = 0; i < schedule.length; i++) {
    const entry = schedule[i];
    const entryKey = `${i}_${entry.hour}_${entry.minute}_${entry.type}`;
    const entryMinutes = entry.hour * 60 + entry.minute;

    if (triggeredMap[entryKey]) continue;
    if (currentTotalMinutes < entryMinutes) continue;

    if (currentTotalMinutes > entryMinutes + window) {
      triggeredMap[entryKey] = { time: now.toISOString(), success: false, missed: true };
      await chrome.storage.local.set({ triggered: triggeredMap });
      await appendLog(entry.type, false, `Missed - PC was off/asleep from ${entry.hour}:${String(entry.minute).padStart(2, "0")} to now`, 0);
      notify("Woffuk - MISSED", `Fichaje de las ${entry.hour}:${String(entry.minute).padStart(2, "0")} perdido (PC apagado/dormido).`);
      continue;
    }

    const delayKey = `delay_${entryKey}`;
    if (!triggeredMap[delayKey]) {
      const delayMinutes = maxOffset > 0 ? Math.floor(Math.random() * (maxOffset + 1)) : 0;
      triggeredMap[delayKey] = entryMinutes + delayMinutes;
      await chrome.storage.local.set({ triggered: triggeredMap });
      console.log(`[Woffuk] Scheduled ${entry.type} with +${delayMinutes}min offset (fire at minute ${triggeredMap[delayKey]})`);
    }

    const fireAtMinute = triggeredMap[delayKey];
    if (currentTotalMinutes < fireAtMinute) continue;

    console.log(`[Woffuk] Triggering ${entry.type} at ${entry.hour}:${String(entry.minute).padStart(2, "0")} (actual: ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")})`);

    const success = await triggerSignWithRetry();

    triggeredMap[entryKey] = { time: now.toISOString(), success };
    await chrome.storage.local.set({ triggered: triggeredMap });

    if (success && notifySuccess) {
      notify("Woffuk - OK", `Fichaje de las ${entry.hour}:${String(entry.minute).padStart(2, "0")} completado.`);
    } else if (!success) {
      notify("Woffuk - ERROR", `No se pudo fichar a las ${entry.hour}:${String(entry.minute).padStart(2, "0")}. Revisa la sesion.`);
    }
    break;
  }
});

// ── API call with retries ──────────────────────────────
async function triggerSignWithRetry() {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`[Woffuk] Attempt ${attempt}/${MAX_RETRIES}`);
    const result = await triggerSign();
    await appendLog(result.type || "sign", result.success, result.error, attempt);
    if (result.success) return true;
    if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS);
  }
  return false;
}

async function triggerSign() {
  try {
    const { woffuUrl } = await chrome.storage.local.get("woffuUrl");
    const baseUrl = (woffuUrl || DEFAULT_WOFFU_URL).replace(/\/v2\/.*$/, "");

    const token = await getWoffuToken();
    if (!token) {
      return { success: false, error: "No token — abre Woffu en una pestana" };
    }

    const response = await fetch(`${baseUrl}${SIGN_API_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json"
      },
      body: JSON.stringify({
        agreementEventId: null,
        requestId: null,
        deviceId: "WebApp",
        latitude: null,
        longitude: null,
        timezoneOffset: -(new Date().getTimezoneOffset())
      })
    });

    if (response.status === 201) {
      const data = await response.json();
      console.log(`[Woffuk] Success: ${data.signEventId}`);
      return { success: true };
    } else if (response.status === 401) {
      return { success: false, error: "Sesion expirada (401) — refresca Woffu" };
    } else {
      const text = await response.text().catch(() => "");
      return { success: false, error: `HTTP ${response.status}: ${text.slice(0, 100)}` };
    }
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
}

// ── Notifications ──────────────────────────────────────
function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon128.png",
    title,
    message
  });
}

// ── Logging ────────────────────────────────────────────
async function appendLog(type, success, error, attempt) {
  const { log = [] } = await chrome.storage.local.get("log");
  log.push({ time: new Date().toISOString(), type, success, error, attempt });
  while (log.length > 50) log.shift();
  await chrome.storage.local.set({ log });
}

// ── Helpers ────────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.schedule || changes.enabled) setupAlarms();
});

// Message handler from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "manualTrigger") {
    triggerSign().then(sendResponse);
    return true;
  }
  if (msg.action === "checkSession") {
    (async () => {
      try {
        const token = await getWoffuToken();
        if (!token) {
          sendResponse({ ok: false, reason: "no_token" });
          return;
        }
        const { woffuUrl } = await chrome.storage.local.get("woffuUrl");
        const baseUrl = (woffuUrl || DEFAULT_WOFFU_URL).replace(/\/v2\/.*$/, "");
        const r = await fetch(`${baseUrl}/api/signs/slots`, {
          headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" }
        });
        sendResponse({ ok: r.status === 200, status: r.status });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }
  if (msg.action === "clearLog") {
    chrome.storage.local.set({ log: [] }).then(() => sendResponse({ success: true }));
    return true;
  }
});
