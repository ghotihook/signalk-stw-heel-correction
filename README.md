<img src="public/icon.svg" width="72" align="right" alt="">

# signalk-stw-heel-correction

Signal K plugin that corrects speed through water for heel angle using a 2D bilinear interpolation table.

A paddlewheel or impeller tilts with the boat as it heels, causing the raw STW reading to be inaccurate. This plugin watches `navigation.speedThroughWater`, looks up and interpolates a correction from a configurable (heel °, BSP kn) table, and **republishes the corrected value on the same path under its own `$source`**.

You then rank this plugin above the raw sensor in the server's **Source Priorities**. Every consumer — displays, logbook, autopilot, anything reading `navigation.speedThroughWater` — gets the corrected value with no reconfiguration, while the raw sensor value stays visible in the data model under its own source for comparison and calibration.

Alternatively it can publish to a separate `navigation.speedThroughWaterCorrected` path, leaving the raw value alone — see **Output path** below.

---

## Installation (server — once)

```bash
git clone git@github.com:ghotihook/signalk-stw-heel-correction ~/signalk-stw-heel-correction
cd ~/.signalk
npm install ~/signalk-stw-heel-correction
sudo systemctl restart signalk
```

Then enable the plugin in the Signal K plugin config UI.

### Output path

| Setting | What it does |
|---|---|
| **`navigation.speedThroughWater`** (default) | Republishes on the standard path under this plugin's source. Requires a Source Priorities entry (below). Every existing consumer picks it up with no reconfiguration. |
| **`navigation.speedThroughWaterCorrected`** | Publishes to a separate path and leaves the raw value untouched. No priority setup needed, but every consumer must be pointed at the new path by hand. |
| **Both paths** | Publishes to both at once. Useful for comparing raw against corrected on the water before committing to the standard path. |

The corrected path is not in the Signal K schema, so when it is in use the plugin publishes `meta` for it (`units: m/s`) — without that, consumers have no way to know how to display it.

### Required: set the source priority

The plugin publishes under the source `signalk-stw-heel-correction`. **Until you rank it above your paddlewheel source, consumers may still show the raw value.**

In the admin UI: **Server → Source Priorities** → add `navigation.speedThroughWater` → put `signalk-stw-heel-correction` above the instrument source.

This applies to the **standard** and **both** output settings. With the corrected-path-only setting there is no priority to configure.

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
| **Output path** | `navigation.speedThroughWater` | Standard path, separate corrected path, or both — see above |
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

Whitespace padding is ignored, so an aligned table pastes in as-is, and the header's first cell is a label you can write however you like (`heel\bsp`, `heel\adj_stw`, …).

**Blank cells mean "no data here"** — typically a corner of the grid the boat never occupies, like 35° of heel at half a knot:

```
heel\adj_stw,  0.5,  1.0,  1.5,   2.0
         -35,     ,     ,     ,-0.282
         -20,     ,0.007,-0.036,-0.066
           0,0.564,0.599, 0.495, 0.373
```

A blank is **not** read as a zero correction. The nearest known value is extended into it, first along the speed axis and then, for a heel row that is blank all the way across, from the nearest heel row that has data. Reading blanks as zero would pull a real correction toward nothing as the boat approached the edge of the measured region — at −25° heel and 4.2 kn in the table above, zero-fill gives about −0.055 kn where the measured edge value is −0.138 kn. Holding the edge value is the same behaviour inputs outside the bin range already get.

If you do want a genuine zero at some point, write `0` rather than leaving the cell empty.

A table that cannot be parsed — a ragged row, a non-numeric entry, no numbers at all — puts the reason in the plugin's error status rather than failing silently.

---

## How it works

The plugin subscribes to `navigation.speedThroughWater` via `app.subscriptionmanager.subscribe` with **`sourcePolicy: 'all'`**, which delivers every sample from every source at full rate with no priority cascade on the input feed. On each value:

1. The value is skipped if it came from this plugin's own `$source` (loop guard), or if it is null or non-finite — **nothing is published**
2. Current `navigation.attitude` roll is read via `getSelfPath`. If the roll is missing or non-finite, or the attitude data is more than 1 s old (stale-sensor guard), the plugin **publishes nothing** for that sample
3. STW is converted from m/s to knots, roll from radians to degrees
4. If STW is below the configured minimum speed the correction is forced to zero (`corrected = raw`); otherwise it is bilinearly interpolated from the table at (heel °, BSP kn), with inputs outside the bin range clamped to the nearest edge
5. `corrected = max(0, raw + correction)` — the result is floored at zero
6. The corrected value is published to the configured output path(s) via `app.handleMessage(plugin.id, ...)`, carrying the source delta's timestamp

**When it cannot correct, it goes silent.** Missing STW, missing heel and stale heel all mean the plugin simply stops publishing. The plugin never republishes a value it has not improved. The status line in the admin UI reports which state it is in.

On the standard path that is the whole point — source priorities fall back to the raw sensor, so STW keeps flowing. **On the corrected-path-only setting there is nothing to fall back to**, so `navigation.speedThroughWaterCorrected` simply stops updating and goes stale. Anything consuming it needs to handle that itself.

The one exception is the minimum-speed threshold: below it the plugin still publishes `corrected = raw`. Going silent there would make the plugin drop in and out every time boat speed crossed the threshold, costing a priority fallback timeout on each transition, and the value is identical either way.

### Why this shape

- **`sourcePolicy: 'all'`, not `excludeSelf`.** `excludeSelf` runs a priority cascade on the input feed and delivers a single ranked value. Once this plugin outranks the instrument, that cascade sees the plugin's own (excluded) output as the preferred source that never arrives, and holds the real source as a fallback — stalling input until the fallback timeout. `sourcePolicy: 'all'` bypasses the cascade entirely, which is what a full-rate corrector needs.

- **Subscribe-and-republish, not `registerDeltaInputHandler`.** An input handler is for modifying a delta in place as it passes through, not for republishing a value under your own source. A correction plugin emits under its own `$source` and lets source priority choose between that and the raw source. (This plugin used an input handler until the source-priority rework made the subscribe path viable.)

- **Loop guard** (only relevant when publishing to the standard path). Deltas published with no explicit `source` object get `$source` set to `plugin.id` by the server, and the plugin skips those. As a backstop it also remembers recently published values that differed from their input, and refuses to re-correct one that comes back under an unexpected `$source` — logging the offending source once, since an unbroken loop on the primary STW path is the failure mode that matters most here. If you ever feed an external NMEA source carrying this plugin's corrected value back into Signal K as `navigation.speedThroughWater`, that backstop is what catches it.
