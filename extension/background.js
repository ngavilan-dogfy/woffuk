// ── Config ──────────────────────────────────────────────
const DEFAULT_SCHEDULE = [
  { hour: 8, minute: 0, type: "in" },
  { hour: 13, minute: 45, type: "out" },
  { hour: 14, minute: 30, type: "in" },
  { hour: 17, minute: 30, type: "out" }
];

const DEFAULT_WOFFU_URL = "https://dogfydiet.woffu.com";
const SIGN_API_PATH = "/api/svc/signs/signs";
const TOKEN_API_BASE = "https://app.woffu.com";
const DEFAULT_TIME_WINDOW = 15;
const DEFAULT_RANDOM_OFFSET = 3;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3000;

// ── Per-day schedule helper ────────────────────────────
function getScheduleForDay(schedulesData, dayNumber) {
  if (!schedulesData) return DEFAULT_SCHEDULE;
  const dayStr = String(dayNumber);
  if (schedulesData.overrides && schedulesData.overrides[dayStr]) {
    return schedulesData.overrides[dayStr];
  }
  return schedulesData.default || DEFAULT_SCHEDULE;
}

// ── Migration: old schedule → new schedules format ─────
async function migrateScheduleIfNeeded() {
  const data = await chrome.storage.local.get(["schedule", "schedules"]);
  if (data.schedules) return data.schedules;
  if (data.schedule) {
    const schedules = { default: data.schedule, overrides: {} };
    await chrome.storage.local.set({ schedules });
    await chrome.storage.local.remove("schedule");
    console.log("[Woffuk] Migrated schedule → schedules");
    return schedules;
  }
  return null;
}

// ── Install / Startup ──────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  const migrated = await migrateScheduleIfNeeded();
  if (!migrated) {
    const data = await chrome.storage.local.get("schedules");
    if (!data.schedules) {
      await chrome.storage.local.set({
        schedules: { default: DEFAULT_SCHEDULE, overrides: {} },
        enabled: true,
        activeDays: [1, 2, 3, 4, 5],
        woffuUrl: DEFAULT_WOFFU_URL,
        timeWindow: DEFAULT_TIME_WINDOW,
        randomOffset: DEFAULT_RANDOM_OFFSET,
        notifySuccess: false,
        triggered: {}
      });
    }
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

// ══════════════════════════════════════════════════════════
// ── TOKEN MANAGEMENT ─────────────────────────────────────
// ══════════════════════════════════════════════════════════

function decodeJwtPayload(token) {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch { return null; }
}

function isTokenExpired(token) {
  const claims = decodeJwtPayload(token);
  if (!claims?.exp) return true;
  return Date.now() / 1000 > claims.exp - 60;
}

// ── Token cache (chrome.storage.local) ───────────────────
async function getCachedToken() {
  try {
    const { cachedToken } = await chrome.storage.local.get("cachedToken");
    if (cachedToken && !isTokenExpired(cachedToken)) return cachedToken;
  } catch (e) {
    console.log("[Woffuk] getCachedToken error:", e.message);
  }
  return null;
}

async function cacheToken(token) {
  try {
    await chrome.storage.local.set({ cachedToken: token });
    console.log("[Woffuk] Token cached OK");
  } catch (e) {
    console.log("[Woffuk] cacheToken error:", e.message);
  }
}

async function clearCachedToken() {
  try {
    await chrome.storage.local.remove("cachedToken");
  } catch {}
}

// ── Login with credentials (email/password) ──────────────
async function loginWithCredentials(email, password) {
  try {
    // 1. Get login config to find the company domain
    console.log("[Woffuk] loginWithCredentials: fetching config...");
    const configRes = await fetch(
      `${TOKEN_API_BASE}/api/svc/accounts/companies/login-configuration-by-email?email=${encodeURIComponent(email)}`
    );
    if (!configRes.ok) return { token: null, error: `Config HTTP ${configRes.status}` };
    const config = await configRes.json();
    console.log("[Woffuk] loginWithCredentials: config =", JSON.stringify(config));

    if (!config.woffuLogin) {
      return { token: null, error: "Esta cuenta usa Google SSO — usa login por navegador" };
    }

    // Auto-save detected domain as woffuUrl
    if (config.domain) {
      const detectedUrl = `https://${config.domain}`;
      await chrome.storage.local.set({ woffuUrl: detectedUrl });
      console.log(`[Woffuk] Auto-detected domain: ${detectedUrl}`);
    }

    // 2. Request token
    console.log("[Woffuk] loginWithCredentials: requesting token...");
    const tokenRes = await fetch(`${TOKEN_API_BASE}/api/svc/accounts/authorization/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        username: email,
        password: password
      })
    });

    console.log("[Woffuk] loginWithCredentials: token status =", tokenRes.status);

    if (tokenRes.status === 400 || tokenRes.status === 401) {
      const body = await tokenRes.text().catch(() => "");
      return { token: null, error: `Credenciales incorrectas (${tokenRes.status}): ${body.slice(0, 200)}` };
    }
    if (!tokenRes.ok) {
      const body = await tokenRes.text().catch(() => "");
      return { token: null, error: `Token HTTP ${tokenRes.status}: ${body.slice(0, 200)}` };
    }

    const tokenData = await tokenRes.json();
    console.log("[Woffuk] loginWithCredentials: response keys =", Object.keys(tokenData));
    const token = tokenData.access_token || tokenData.token;
    if (!token) return { token: null, error: `No token in response (keys: ${Object.keys(tokenData).join(", ")})` };

    await cacheToken(token);
    return { token, error: null };
  } catch (err) {
    console.log("[Woffuk] loginWithCredentials error:", err);
    return { token: null, error: err.message };
  }
}

// ── Extract token from open Woffu tabs ───────────────────
async function extractTokenFromTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: "https://*.woffu.com/*" });
    for (const tab of tabs) {
      try {
        if (tab.status !== "complete") continue;
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: "MAIN",
          func: () => sessionStorage.getItem("token")
        });
        const token = results?.[0]?.result;
        if (token && !isTokenExpired(token)) {
          await cacheToken(token);
          return token;
        }
      } catch (e) {
        console.log(`[Woffuk] Skipping tab ${tab.id}: ${e.message}`);
      }
    }
    return null;
  } catch (err) {
    console.log("[Woffuk] extractTokenFromTabs error:", err.message);
    return null;
  }
}

// ── Watch Woffu tabs for token (event-driven with retry) ──
// SPA may not have initialized sessionStorage when status:"complete" fires,
// so we retry a few times with a short delay.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab.url || !tab.url.match(/^https:\/\/[^/]*\.woffu\.com\//)) return;

  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) await sleep(1500);
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: () => sessionStorage.getItem("token")
      });
      const token = results?.[0]?.result;
      if (token && !isTokenExpired(token)) {
        await cacheToken(token);
        await chrome.storage.local.set({ sessionState: "ok" });
        console.log(`[Woffuk] Token captured from tab update (attempt ${attempt + 1})`);

        // If this was a login tab we opened, close it
        const { loginTabId } = await chrome.storage.local.get("loginTabId");
        if (loginTabId === tabId) {
          await chrome.storage.local.remove("loginTabId");
          try { await chrome.tabs.remove(tabId); } catch {}
          notify("Woffuk", "Sesion iniciada correctamente");
        }
        return; // Token found — stop retrying
      }
    } catch (e) {
      // Tab on different origin (e.g. accounts.google.com during auth) — ignore
      return; // Different origin means this isn't the right page yet
    }
  }
  console.log(`[Woffuk] Could not extract token from tab ${tabId} after 5 attempts`);
});

// ── Main getToken: cached → credentials → tabs → null ────
async function getToken() {
  // 1. Cached token
  const cached = await getCachedToken();
  if (cached) return cached;

  // 2. Stored credentials → re-login
  const { authEmail, authPassword } = await chrome.storage.local.get(["authEmail", "authPassword"]);
  if (authEmail && authPassword) {
    console.log("[Woffuk] Cached token expired/missing — re-logging with credentials");
    const result = await loginWithCredentials(authEmail, authPassword);
    if (result.token) return result.token;
    console.log(`[Woffuk] Credential login failed: ${result.error}`);
  }

  // 3. Extract from open Woffu tab
  const tabToken = await extractTokenFromTabs();
  if (tabToken) return tabToken;

  return null;
}

async function getBaseUrl() {
  const { woffuUrl } = await chrome.storage.local.get("woffuUrl");
  return (woffuUrl || DEFAULT_WOFFU_URL).replace(/\/v2\/.*$/, "");
}

// ══════════════════════════════════════════════════════════
// ── ALARM HANDLER ────────────────────────────────────────
// ══════════════════════════════════════════════════════════

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "woffu-check") return;

  // On-the-fly migration fallback
  const schedulesData = await migrateScheduleIfNeeded()
    || (await chrome.storage.local.get("schedules")).schedules;

  const { enabled, triggered, activeDays, timeWindow, randomOffset, notifySuccess } = await chrome.storage.local.get([
    "enabled", "triggered", "activeDays", "timeWindow", "randomOffset", "notifySuccess"
  ]);
  if (!enabled || !schedulesData) return;

  const now = new Date();
  const baseUrl = await getBaseUrl();

  const token = await getToken();
  if (token) {
    const workday = await isWorkday(token, baseUrl);
    if (workday === false) return;
  }

  const day = now.getDay();
  const days = activeDays || [1, 2, 3, 4, 5];
  if (!days.includes(day)) return;

  const schedule = getScheduleForDay(schedulesData, day);
  if (!schedule || schedule.length === 0) return;

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const window = timeWindow ?? DEFAULT_TIME_WINDOW;
  const maxOffset = randomOffset ?? DEFAULT_RANDOM_OFFSET;
  const todayKey = todayStr;
  const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();
  const triggeredMap = (triggered && triggered._date === todayKey) ? triggered : { _date: todayKey };

  for (let i = 0; i < schedule.length; i++) {
    const entry = schedule[i];
    const entryKey = `${i}_${entry.hour}_${entry.minute}_${entry.type}`;

    if (triggeredMap[entryKey]) continue;
    if (currentTotalMinutes < entryMinutes(entry)) continue;

    // Window expired — mark as missed (also cleans up retry marker)
    if (currentTotalMinutes > entryMinutes(entry) + window) {
      const wasRetrying = !!triggeredMap[`retry_${entryKey}`];
      triggeredMap[entryKey] = { time: now.toISOString(), success: false, missed: true };
      delete triggeredMap[`retry_${entryKey}`];
      await chrome.storage.local.set({ triggered: triggeredMap });
      await appendLog(entry.type, false, `Missed - ${wasRetrying ? "retries exhausted" : "PC was off/asleep"} from ${entry.hour}:${String(entry.minute).padStart(2, "0")} to now`, 0);
      notify("Woffuk - MISSED", `Fichaje de las ${entry.hour}:${String(entry.minute).padStart(2, "0")} perdido.`);
      continue;
    }

    const delayKey = `delay_${entryKey}`;
    if (!triggeredMap[delayKey]) {
      const delayMinutes = maxOffset > 0 ? Math.floor(Math.random() * (maxOffset + 1)) : 0;
      triggeredMap[delayKey] = entryMinutes(entry) + delayMinutes;
      await chrome.storage.local.set({ triggered: triggeredMap });
      console.log(`[Woffuk] Scheduled ${entry.type} with +${delayMinutes}min offset (fire at minute ${triggeredMap[delayKey]})`);
    }

    const fireAtMinute = triggeredMap[delayKey];
    if (currentTotalMinutes < fireAtMinute) continue;

    const currentToken = token || await getToken();
    if (currentToken) {
      const signState = await getCurrentSignState(currentToken, baseUrl);
      if (signState === entry.type) {
        console.log(`[Woffuk] Already ${entry.type} — skipping duplicate sign`);
        triggeredMap[entryKey] = { time: now.toISOString(), success: true, skipped: true };
        delete triggeredMap[`retry_${entryKey}`];
        await chrome.storage.local.set({ triggered: triggeredMap });
        await appendLog(entry.type, true, `Skipped — already ${entry.type === "in" ? "clocked in" : "clocked out"}`, 0);
        break;
      }
    }

    console.log(`[Woffuk] Triggering ${entry.type} at ${entry.hour}:${String(entry.minute).padStart(2, "0")} (actual: ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")})`);

    const success = await triggerSignWithRetry(entry.type);

    if (success) {
      // Success — mark done, clear retry marker
      triggeredMap[entryKey] = { time: now.toISOString(), success: true };
      delete triggeredMap[`retry_${entryKey}`];
      await chrome.storage.local.set({ triggered: triggeredMap });

      if (notifySuccess) {
        notify("Woffuk - OK", `Fichaje de las ${entry.hour}:${String(entry.minute).padStart(2, "0")} completado.`);
      }
    } else {
      // Failure — do NOT mark entryKey done, set retry marker instead
      // Next alarm tick (60s) will retry automatically until window expires
      triggeredMap[`retry_${entryKey}`] = { lastAttempt: now.toISOString() };
      await chrome.storage.local.set({ triggered: triggeredMap });
      console.log(`[Woffuk] Sign failed, will retry on next tick (retry marker set for ${entryKey})`);
    }
    break;
  }
});

function entryMinutes(entry) {
  return entry.hour * 60 + entry.minute;
}

// ── API call with retries ──────────────────────────────
async function triggerSignWithRetry(signType) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`[Woffuk] Attempt ${attempt}/${MAX_RETRIES}`);
    const result = await triggerSign();

    if (result.status === 401) await clearCachedToken();

    await appendLog(signType || "sign", result.success, result.error, attempt);
    if (result.success) return true;
    if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS);
  }
  return false;
}

async function triggerSign() {
  try {
    const baseUrl = await getBaseUrl();
    const token = await getToken();
    if (!token) {
      return { success: false, error: "Sin sesion — inicia sesion desde el popup" };
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
      await clearCachedToken();
      return { success: false, error: "Sesion expirada (401)", status: 401 };
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

// ── Check if today is a workday via Woffu API ─────────
async function isWorkday(token, baseUrl) {
  try {
    const claims = decodeJwtPayload(token);
    const userId = claims?.UserId;
    if (!userId) return null;

    const r = await fetch(`${baseUrl}/api/users/${userId}/workdaylite`, {
      headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" }
    });
    if (r.status !== 200) return null;

    const data = await r.json();
    if (data.IsHoliday || data.IsWeekend) {
      console.log(`[Woffuk] Skipping: IsHoliday=${data.IsHoliday}, IsWeekend=${data.IsWeekend}`);
      return false;
    }
    return true;
  } catch (err) {
    console.log(`[Woffuk] isWorkday error: ${err.message}`);
    return null;
  }
}

// ── Check current sign state to prevent duplicates ────
async function getCurrentSignState(token, baseUrl) {
  try {
    const r = await fetch(`${baseUrl}/api/signs/slots`, {
      headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" }
    });
    if (r.status !== 200) return null;

    const slots = await r.json();
    if (!slots || slots.length === 0) return "out";

    const lastSlot = slots[slots.length - 1];
    if (lastSlot.In && !lastSlot.Out) return "in";
    return "out";
  } catch (err) {
    console.log(`[Woffuk] getCurrentSignState error: ${err.message}`);
    return null;
  }
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.schedules || changes.enabled) setupAlarms();
});

// ══════════════════════════════════════════════════════════
// ── MESSAGE HANDLER ──────────────────────────────────────
// ══════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "manualTrigger") {
    (async () => {
      const result = await triggerSign();
      await appendLog(msg.type || "sign", result.success, result.error, 1);
      sendResponse(result);
    })();
    return true;
  }

  if (msg.action === "checkSession") {
    (async () => {
      try {
        const token = await getToken();
        if (!token) {
          const { authEmail } = await chrome.storage.local.get("authEmail");
          sendResponse({ ok: false, reason: authEmail ? "expired" : "no_auth" });
          return;
        }
        const baseUrl = await getBaseUrl();
        const r = await fetch(`${baseUrl}/api/signs/slots`, {
          headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" }
        });
        if (r.status === 200) {
          sendResponse({ ok: true });
        } else if (r.status === 401) {
          await clearCachedToken();
          sendResponse({ ok: false, reason: "expired" });
        } else {
          sendResponse({ ok: false, reason: "error", status: r.status });
        }
      } catch (err) {
        sendResponse({ ok: false, reason: "error", error: err.message });
      }
    })();
    return true;
  }

  if (msg.action === "loginCredentials") {
    (async () => {
      try {
        const { email, password } = msg;
        const result = await loginWithCredentials(email, password);
        if (result.token) {
          await chrome.storage.local.set({ authEmail: email, authPassword: password });
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: result.error });
        }
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  if (msg.action === "openLoginTab") {
    (async () => {
      try {
        const { woffuUrl } = await chrome.storage.local.get("woffuUrl");
        const url = woffuUrl || DEFAULT_WOFFU_URL;
        const tab = await chrome.tabs.create({ url, active: true });
        // Store tab ID so onUpdated knows to close it after token capture
        await chrome.storage.local.set({ loginTabId: tab.id });
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  if (msg.action === "logout") {
    (async () => {
      await clearCachedToken();
      await chrome.storage.local.remove(["authEmail", "authPassword"]);
      await chrome.storage.local.set({ sessionState: null });
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.action === "clearLog") {
    chrome.storage.local.set({ log: [] }).then(() => sendResponse({ success: true }));
    return true;
  }

  if (msg.action === "fetchRequestContext") {
    (async () => {
      try {
        const baseUrl = await getBaseUrl();
        const token = await getToken();
        if (!token) { sendResponse({ ok: false, error: "Sin sesion" }); return; }
        const r = await fetch(`${baseUrl}/api/requests/context`, {
          headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" }
        });
        if (!r.ok) { sendResponse({ ok: false, error: `HTTP ${r.status}` }); return; }
        const data = await r.json();
        sendResponse({ ok: true, data });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  if (msg.action === "submitOneRequest") {
    (async () => {
      try {
        const { date, agreementEvent } = msg;
        const baseUrl = await getBaseUrl();
        const token = await getToken();
        if (!token) { sendResponse({ ok: false, error: "Sin sesion" }); return; }
        const claims = decodeJwtPayload(token);
        if (!claims) { sendResponse({ ok: false, error: "Token invalido" }); return; }

        const payload = {
          AgreementEventId: agreementEvent.AgreementEventId,
          IsVacation: agreementEvent.IsVacation || false,
          NumberHoursRequested: 0,
          QuickDescription: "",
          ResponsibleUserId: 0,
          UserId: Number(claims.UserId),
          Files: [],
          CompanyId: Number(claims.CompanyId),
          Accepted: false,
          Documents: [],
          StartTime: null,
          EndTime: null,
          NumberDaysRequested: 1,
          EndDate: date,
          StartDate: date
        };
        const r = await fetch(`${baseUrl}/api/requests`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            "Accept": "application/json"
          },
          body: JSON.stringify(payload)
        });
        if (r.status === 201 || r.status === 200) {
          sendResponse({ ok: true });
        } else {
          const text = await r.text().catch(() => "");
          // Detect duplicate request
          if (text.includes("_SameAgreementEventRequestError")) {
            sendResponse({ ok: false, duplicate: true, error: "Ya solicitado" });
          } else {
            sendResponse({ ok: false, error: `HTTP ${r.status}: ${text.slice(0, 200)}` });
          }
        }
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  // Fetch holidays for the user's calendar
  if (msg.action === "fetchHolidays") {
    (async () => {
      try {
        // Return from cache if available
        const { cachedHolidays } = await chrome.storage.local.get("cachedHolidays");
        if (cachedHolidays && cachedHolidays.length > 0) {
          sendResponse({ ok: true, holidays: cachedHolidays });
          return;
        }

        const baseUrl = await getBaseUrl();
        const token = await getToken();
        if (!token) { sendResponse({ ok: false, error: "Sin sesion" }); return; }

        // Get CalendarId — try cached first, then extract from Woffu tab
        let { cachedCalendarId } = await chrome.storage.local.get("cachedCalendarId");
        if (!cachedCalendarId) {
          // Extract CalendarId from the Woffu tab's sessionStorage user object
          const tabs = await chrome.tabs.query({ url: "https://*.woffu.com/*" });
          for (const tab of tabs) {
            try {
              if (tab.status !== "complete") continue;
              const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                world: "MAIN",
                func: () => {
                  try {
                    const u = JSON.parse(sessionStorage.getItem("user"));
                    return u?.userId || null;
                  } catch { return null; }
                }
              });
              const userId = results?.[0]?.result;
              if (!userId) continue;
              // Use tab's own token to call /api/users/{id}
              const tabResults = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                world: "MAIN",
                func: async (uid) => {
                  try {
                    const t = sessionStorage.getItem("token");
                    const r = await fetch(`/api/users/${uid}`, {
                      headers: { "Authorization": "Bearer " + t, "Accept": "application/json" }
                    });
                    if (!r.ok) return null;
                    const u = await r.json();
                    return u.CalendarId || null;
                  } catch { return null; }
                },
                args: [userId]
              });
              cachedCalendarId = tabResults?.[0]?.result;
              if (cachedCalendarId) {
                await chrome.storage.local.set({ cachedCalendarId });
                break;
              }
            } catch (e) {
              console.log("[Woffuk] Tab CalendarId extract failed:", e.message);
            }
          }
        }

        if (!cachedCalendarId) { sendResponse({ ok: false, error: "No CalendarId found" }); return; }

        // Fetch calendar events
        const evR = await fetch(`${baseUrl}/api/calendars/${cachedCalendarId}/events`, {
          headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" }
        });
        if (!evR.ok) { sendResponse({ ok: false, error: `Calendar HTTP ${evR.status}` }); return; }
        const events = await evR.json();

        const holidays = events
          .filter(e => e.IsHoliday)
          .map(e => ({ name: e.Name, date: e.TrueDate.split("T")[0], cycle: e.Cycle }));

        await chrome.storage.local.set({ cachedHolidays: holidays });
        sendResponse({ ok: true, holidays });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  // Fetch user requests (for cancel/withdraw)
  if (msg.action === "fetchUserRequests") {
    (async () => {
      try {
        const { agreementEventId, page, pageSize } = msg;
        const baseUrl = await getBaseUrl();
        const token = await getToken();
        if (!token) { sendResponse({ ok: false, error: "Sin sesion" }); return; }
        const claims = decodeJwtPayload(token);
        const url = `${baseUrl}/api/users/${claims.UserId}/requests?page=${page || 1}&pageSize=${pageSize || 50}`
          + (agreementEventId ? `&agreementEventId=${agreementEventId}` : "");
        const r = await fetch(url, {
          headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" }
        });
        if (!r.ok) { sendResponse({ ok: false, error: `HTTP ${r.status}` }); return; }
        const data = await r.json();
        // API may return array directly or wrapped object
        const requests = Array.isArray(data) ? data : (data.Results || data.Items || []);
        sendResponse({ ok: true, requests });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  // Cancel/delete a single request
  if (msg.action === "cancelRequest") {
    (async () => {
      try {
        const { requestId } = msg;
        const baseUrl = await getBaseUrl();
        const token = await getToken();
        if (!token) { sendResponse({ ok: false, error: "Sin sesion" }); return; }
        const r = await fetch(`${baseUrl}/api/requests/${requestId}`, {
          method: "DELETE",
          headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" }
        });
        if (r.status === 204 || r.status === 200) {
          sendResponse({ ok: true });
        } else {
          const text = await r.text().catch(() => "");
          sendResponse({ ok: false, error: `HTTP ${r.status}: ${text.slice(0, 200)}` });
        }
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  if (msg.action === "submitSingleRequest") {
    (async () => {
      try {
        const { date, startTime, endTime, agreementEvent } = msg;
        const baseUrl = await getBaseUrl();
        const token = await getToken();
        if (!token) { sendResponse({ ok: false, error: "Sin sesion" }); return; }
        const claims = decodeJwtPayload(token);
        if (!claims) { sendResponse({ ok: false, error: "Token invalido" }); return; }

        // Calculate hours difference
        const [sh, sm] = startTime.split(":").map(Number);
        const [eh, em] = endTime.split(":").map(Number);
        const diffHours = Math.round(((eh * 60 + em) - (sh * 60 + sm)) / 60 * 100) / 100;

        const payload = {
          AgreementEventId: agreementEvent.AgreementEventId,
          IsVacation: agreementEvent.IsVacation || false,
          NumberHoursRequested: diffHours,
          QuickDescription: "",
          ResponsibleUserId: 0,
          UserId: Number(claims.UserId),
          Files: [],
          CompanyId: Number(claims.CompanyId),
          Accepted: false,
          Documents: [],
          StartTime: startTime,
          EndTime: endTime,
          NumberDaysRequested: 0,
          EndDate: date,
          StartDate: date
        };

        const r = await fetch(`${baseUrl}/api/requests`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            "Accept": "application/json"
          },
          body: JSON.stringify(payload)
        });

        if (r.status === 201 || r.status === 200) {
          sendResponse({ ok: true });
        } else {
          const text = await r.text().catch(() => "");
          sendResponse({ ok: false, error: `HTTP ${r.status}: ${text.slice(0, 200)}` });
        }
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }
});
