<div align="center">

<img src="extension/icon128.png" width="80" />

# Woffuk

**Automate your Woffu clock-in/out and manage all your requests — from one popup.**

[![Chrome MV3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![Vanilla JS](https://img.shields.io/badge/Vanilla-JS%20%2F%20HTML%20%2F%20CSS-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Vibe Coded](https://img.shields.io/badge/%E2%9C%A8-vibe--coded-blueviolet)](#)
[![Version](https://img.shields.io/badge/version-1.0-blue)](#)

*100% vibe-coded with [Claude Code](https://claude.ai/claude-code). Zero dependencies. Pure vibes.*

</div>

---

## What is this?

A Chrome extension for teams using [Woffu](https://www.woffu.com) for time tracking. It automates your daily sign-in/sign-out routine and lets you batch-manage all 41 request types (Vacaciones, Teletrabajo, etc.) with an interactive calendar — all from a single popup.

## Features

### :clock1: Auto Clock-in/out
- **Scheduled signs** — Define your work schedule and Woffuk handles the rest
- **Per-day overrides** — Different hours on Fridays? No problem
- **Random offset** — Configurable random delay (0–10 min) for natural variation
- **Missed sign detection** — Detects if your PC was asleep and notifies you
- **Holiday & weekend skip** — Uses Woffu's own calendar API
- **Duplicate prevention** — Checks clock state before signing
- **Auto-retry** — Up to 3 retries with 3s delay on failure

### :clipboard: Solicitudes (Requests)
- **All 41 request types** — Vacaciones, Teletrabajo, Asistencia medica, Matrimonio, and more
- **Searchable dropdown** — Filter by name with stats, mode icons, and doc-required badges
- **Interactive calendar** — Monthly picker with color-coded days:

  | Color | Meaning |
  |-------|---------|
  | :blue_square: Blue | Selected |
  | :pink_square: Pink | Holiday (national / regional / local) |
  | :yellow_square: Gold | Pending request (click to withdraw) |
  | :green_square: Green | Accepted request (locked) |
  | :purple_square: Purple | Other request type |
  | :white_large_square: Gray | Weekend |

- **Quick range mode** — Weekdays + date range, generate, batch submit
- **Hours mode** — Date + start/end time for hourly requests
- **Holiday detection** — Company calendar with national + regional + local holidays, cached
- **Stats display** — Available, allocated, and used days/hours per type
- **Duplicate detection** — Already requested? Shown as yellow chip, not an error
- **Batch withdraw** — Retire pending requests in bulk or individually from the calendar

### :art: UI & Session
- **Session-aware** — Collapses when session expires, expands when active
- **Google SSO support** — Token extraction with retry for Google login flows
- **Reactive updates** — Popup refreshes when background captures a new token
- **Notifications** — Failure alerts + optional success notifications
- **Log & CSV export** — Last 50 sign events, one-click CSV to clipboard
- **Preset schedule** — Load a standard 8:00–17:30 workday in one click

## Installation

```bash
git clone https://github.com/ngavilan-dogfy/woffuk.git
```

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right)
3. Click **Load unpacked** → select the `extension/` folder
4. Pin the Woffuk icon in the toolbar

## Setup

1. Open your [Woffu portal](https://www.woffu.com) and log in
2. Click the Woffuk extension icon
3. Toggle **ON**
4. Configure your schedule (or click **Preset**)
5. Select active days → **Guardar**

> The extension reads your auth token from the open Woffu tab's `sessionStorage`. No credentials are stored.

## How it works

```
Every minute:
  alarm fires → is there a scheduled sign? → get token from tab → POST to Woffu API
                                           → track in triggered map (scoped to date)
                                           → retry up to 3x on failure
```

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| **Schedule** | Clock-in/out times | `08:00 in, 13:45 out, 14:30 in, 17:30 out` |
| **Per-day overrides** | Custom schedule per weekday | None |
| **Active days** | Days to run | Mon–Fri |
| **Time window** | Minutes after scheduled time to still sign | 15 min |
| **Random offset** | Max random delay per sign | 3 min |
| **Woffu URL** | Your company's subdomain | `https://your-company.woffu.com` |
| **Notify on success** | Show notification on OK signs | Off |

## Tech stack

| | |
|---|---|
| **Platform** | Chrome Extension (Manifest V3) |
| **Language** | Vanilla JS / HTML / CSS |
| **Dependencies** | Zero. None. Nada. |
| **Background** | Service worker with `chrome.alarms` |
| **Token access** | `chrome.scripting.executeScript` with `world: "MAIN"` |
| **Vibe-coded** | 100% built with [Claude Code](https://claude.ai/claude-code) |

## License

Private — internal use only.

---

<div align="center">
<sub>Built with vibes, not deadlines.</sub>
</div>
