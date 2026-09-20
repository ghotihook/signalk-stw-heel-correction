# signalk-stw-heel-correction

Signal K plugin that corrects speed through water for heel angle using a 2D bilinear interpolation table.

A paddlewheel or impeller tilts with the boat as it heels, causing the raw STW reading to be inaccurate. This plugin watches `navigation.speedThroughWater`, looks up and interpolates a correction from a configurable (heel °, BSP kn) table, and **republishes the corrected value on the same path under its own `$source`**.

You then rank this plugin above the raw sensor in the server's **Source Priorities**. Every consumer — displays, logbook, autopilot, anything reading `navigation.speedThroughWater` — gets the corrected value with no reconfiguration, while the raw sensor value stays visible in the data model under its own source for comparison and calibration.

---

## Installation (server — once)

```bash
git clone git@github.com:ghotihook/signalk-stw-heel-correction ~/signalk-stw-heel-correction
cd ~/.signalk
npm install ~/signalk-stw-heel-correction
sudo systemctl restart signalk
```

Then enable the plugin in the Signal K plugin config UI.

### Required: set the source priority

The plugin publishes under the source `signalk-stw-heel-correction`. **Until you rank it above your paddlewheel source, consumers may still show the raw value.**

In the admin UI: **Server → Source Priorities** → add `navigation.speedThroughWater` → put `signalk-stw-heel-correction` above the instrument source.

Priorities also cover the plugin going quiet — if it is disabled, the server restarts, or the heel sensor drops out, consumers fall back to the raw sensor, so STW never goes away entirely.

---

## Development workflow

Edit locally, push to GitHub, pull on the server:

```bash
# Mac — after making changes
git add -p && git commit -m "describe change" && git push

# Server
git -C ~/signalk-stw-heel-correction pull && sudo systemctl restart signalk
```

Enable debug logging for the plugin in the Signal K admin UI to see per-update log lines:
```
STW 6.00 kn, heel -10.3° → correction 0.2050 kn → corrected 6.21 kn
```

---

## Configuration

The plugin ships with a default correction table for Sakura (Swan 36, AUS 373).

| Setting | Default | Description |
|---|---|---|
| **Minimum speed (knots)** | `1.0` | Below this raw STW, no correction is applied — `corrected = raw`. Still published, so the plugin does not flap in and out around the threshold. |
| **Correction table** | (Sakura default) | Labeled CSV, see below |

**Correction table** — a labeled CSV pasted into the plugin config UI:

- Row 1: `heel\bsp,0.5,1.0,1.5,...` — BSP bin edges in knots
- Rows 2+: `<heel angle>,<correction>,<correction>,...` — one row per heel angle in degrees (negative = port heel), one correction value per BSP bin in knots

```
heel\bsp,0.5,1.0,2.0,3.0
-10,0.12,0.12,0.20,0.20
0,0.55,0.54,0.44,0.28
10,0.14,0.14,0.22,0.16
```

Correction values are additive: `corrected = raw + correction`. Inputs outside the bin range are clamped to the nearest edge. Values between bins are bilinearly interpolated.

---

## How it works

The plugin subscribes to `navigation.speedThroughWater` via `app.subscriptionmanager.subscribe` with **`sourcePolicy: 'all'`**, which delivers every sample from every source at full rate with no priority cascade on the input feed. On each value:

1. The value is skipped if it came from this plugin's own `$source` (loop guard), or if it is null or non-finite — **nothing is published**
2. Current `navigation.attitude` roll is read via `getSelfPath`. If the roll is missing or non-finite, or the attitude data is more than 1 s old (stale-sensor guard), the plugin **publishes nothing** for that sample
3. STW is converted from m/s to knots, roll from radians to degrees
4. If STW is below the configured minimum speed the correction is forced to zero (`corrected = raw`); otherwise it is bilinearly interpolated from the table at (heel °, BSP kn), with inputs outside the bin range clamped to the nearest edge
5. `corrected = max(0, raw + correction)` — the result is floored at zero
6. The corrected value is published to `navigation.speedThroughWater` via `app.handleMessage(plugin.id, ...)`, carrying the source delta's timestamp

**When it cannot correct, it goes silent.** Missing STW, missing heel and stale heel all mean the plugin simply stops publishing, and source priorities fall back to the raw sensor — which is what the priority system is for. The plugin never republishes a value it has not improved. The status line in the admin UI reports which state it is in.

The one exception is the minimum-speed threshold: below it the plugin still publishes `corrected = raw`. Going silent there would make the plugin drop in and out every time boat speed crossed the threshold, costing a priority fallback timeout on each transition, and the value is identical either way.

### Why this shape

- **`sourcePolicy: 'all'`, not `excludeSelf`.** `excludeSelf` runs a priority cascade on the input feed and delivers a single ranked value. Once this plugin outranks the instrument, that cascade sees the plugin's own (excluded) output as the preferred source that never arrives, and holds the real source as a fallback — stalling input until the fallback timeout. `sourcePolicy: 'all'` bypasses the cascade entirely, which is what a full-rate corrector needs.

- **Subscribe-and-republish, not `registerDeltaInputHandler`.** An input handler is for modifying a delta in place as it passes through, not for republishing a value under your own source. A correction plugin emits under its own `$source` and lets source priority choose between that and the raw source. (This plugin used an input handler until the source-priority rework made the subscribe path viable.)

- **Loop guard.** Deltas published with no explicit `source` object get `$source` set to `plugin.id` by the server, and the plugin skips those. As a backstop it also remembers recently published values that differed from their input, and refuses to re-correct one that comes back under an unexpected `$source` — logging the offending source once, since an unbroken loop on the primary STW path is the failure mode that matters most here. If you ever feed an external NMEA source carrying this plugin's corrected value back into Signal K as `navigation.speedThroughWater`, that backstop is what catches it.
