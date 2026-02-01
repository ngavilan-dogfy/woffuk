# Woffuk

Chrome extension that automatically clocks in and out on [Woffu](https://www.woffu.com) at scheduled times. Built for teams that use Woffu for time tracking and want to automate their daily sign-in/sign-out routine.

## Features

- **Scheduled clock-in/out** — Define your work schedule (e.g. 08:00 in, 13:45 out, 14:30 in, 17:30 out) and Woffuk handles the rest.
- **Random offset** — Adds a configurable random delay (0–10 min) to each sign event for natural variation.
- **Missed sign detection** — If your PC was asleep or off during a scheduled sign, Woffuk detects the missed window and notifies you.
- **Session-aware UI** — The popup only shows controls when Woffu's session is active (green). If the session is expired or Woffu isn't open, it collapses to a minimal view with a direct link to open Woffu.
- **Active days** — Choose which days of the week to auto-sign (defaults to Mon–Fri).
- **Holidays** — Add specific dates to skip signing entirely.
- **Retry logic** — Up to 3 automatic retries with a 3-second delay if a sign request fails.
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
| **Active days** | Days of the week to run | Mon–Fri |
| **Time window** | Minutes after scheduled time to still attempt signing (handles sleep/wake) | 15 min |
| **Random offset** | Max random delay added to each sign for natural variation | 3 min |
| **Woffu URL** | Your company's Woffu subdomain | `https://dogfydiet.woffu.com` |
| **Holidays** | Specific dates to skip | None |
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
