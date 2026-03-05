# Woffuk

Chrome extension that automatically clocks in and out on [Woffu](https://www.woffu.com) at scheduled times. Built for teams that use Woffu for time tracking and want to automate their daily sign-in/sign-out routine.

## Features

### Auto Clock-in/out
- **Scheduled clock-in/out** — Define your work schedule (e.g. 08:00 in, 13:45 out, 14:30 in, 17:30 out) and Woffuk handles the rest.
- **Per-day schedules** — Override the default schedule for specific days of the week (e.g. different hours on Fridays).
- **Random offset** — Adds a configurable random delay (0–10 min) to each sign event for natural variation.
- **Missed sign detection** — If your PC was asleep or off during a scheduled sign, Woffuk detects the missed window and notifies you.
- **Server-side workday detection** — Automatically skips holidays and weekends using Woffu's own calendar API.
- **Duplicate sign prevention** — Checks your current clock state before signing to avoid double entries.
- **Retry logic** — Up to 3 automatic retries with a 3-second delay if a sign request fails.

### Solicitudes (Requests)
- **All 41 request types** — Vacaciones, Teletrabajo, Asistencia médica, Matrimonio, and more — loaded dynamically from Woffu's API.
- **Searchable dropdown** — Filter request types by name with rich info: mode icon (📅 days / ⏰ hours), available stats, and document-required badge.
- **Interactive calendar** — Monthly calendar picker with color-coded days: selected (blue), holidays (pink), pending requests (gold), accepted (green), other request types (purple), weekends (gray).
- **Quick range mode** — Select weekdays + date range → generate dates → batch submit. Results appear as chips in real time.
- **Hours mode** — Pick a date + start/end time → single submit.
- **Holiday detection** — Fetches your company's calendar (national + regional + local holidays) and blocks those dates automatically. Cached for fast access.
- **Existing request awareness** — Shows pending and accepted requests in the calendar. Pending requests (gold) can be withdrawn with a click; accepted requests (green) are locked.
- **Stats display** — Shows available, allocated, and used days/hours per request type (e.g. "23d disponibles · 0d usados" for Vacaciones).
- **Duplicate detection** — If a date is already requested, it's marked as "Ya solicitado" (yellow chip) instead of failing.
- **Batch withdraw** — Retire pending requests for generated dates in one click, or click individual pending days in the calendar to withdraw them.
- **Legend** — Color legend in the calendar explaining each day state.

### UI & Session
- **Session-aware UI** — The popup only shows controls when Woffu's session is active. If expired, it collapses to a minimal view with a link to open Woffu.
- **Google SSO support** — Token extraction with retry mechanism for Google login flows.
- **Reactive session state** — Popup updates automatically when the background captures a new token.
- **Notifications** — Get notified on failures, and optionally on successful signs too.
- **Log & export** — View the last 50 sign events with status, and export to CSV via clipboard.
- **Preset schedule** — One-click to load a standard full-day schedule (8:00–13:45, 14:30–17:30).

## Installation

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `extension/` folder.
5. Pin the Woffuk icon in the toolbar for quick access.

## Setup

1. Open [Woffu](https://dogfydiet.woffu.com) in a tab and log in.
2. Click the Woffuk extension icon.
3. Toggle **ON**.
4. Configure your schedule (or click **Preset** for a standard workday).
5. Select active days and click **Guardar**.

The extension reads your Woffu authentication token directly from the open Woffu tab — no credentials are stored by Woffuk.

## How it works

- A background alarm checks every minute if a scheduled sign event is due.
- When it's time, Woffuk reads the auth token from your Woffu tab's `sessionStorage` and POSTs to the Woffu sign API.
- The `triggered` map tracks which events have fired today, scoped to the local date.
- On browser startup, the triggered map resets for the new day.

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| **Schedule** | List of clock-in/out times | 08:00 in, 13:45 out, 14:30 in, 17:30 out |
| **Per-day overrides** | Custom schedule for specific weekdays | None |
| **Active days** | Days of the week to run | Mon–Fri |
| **Time window** | Minutes after scheduled time to still attempt signing | 15 min |
| **Random offset** | Max random delay added to each sign | 3 min |
| **Woffu URL** | Your company's Woffu subdomain | `https://dogfydiet.woffu.com` |
| **Notify on success** | Show notification on successful signs | Off |

## Requirements

- Google Chrome (Manifest V3)
- An active Woffu tab must be open and logged in for signing to work

## Tech

- Manifest V3 Chrome Extension
- Zero dependencies — vanilla JS, HTML, CSS
- Background service worker with `chrome.alarms`
- `chrome.scripting.executeScript` with `world: "MAIN"` for token access

## License

Private — internal use only.
