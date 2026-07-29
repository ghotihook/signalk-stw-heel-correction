# signalk-stw-heel-correction

Signal K plugin that corrects speed through water for heel angle using a 2D bilinear interpolation table.

A paddlewheel or impeller tilts with the boat as it heels, causing the raw STW reading to be inaccurate. This plugin watches incoming `navigation.speedThroughWater` deltas, looks up and interpolates a correction from a configurable (heel °, BSP kn) table, and outputs the corrected value two ways:

- as a Signal K delta on **`navigation.speedThroughWaterCorrected`** (m/s, sourced to this plugin)
- as an **NMEA0183 `VHW` sentence broadcast over UDP** (for instrument displays / other consumers on the network)

---

## Installation (server — once)

```bash
git clone git@github.com:ghotihook/signalk-stw-heel-correction ~/signalk-stw-heel-correction
cd ~/.signalk
npm install ~/signalk-stw-heel-correction
sudo systemctl restart signalk
```

Then enable the plugin in the Signal K plugin config UI.

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
| **UDP destination host** | `255.255.255.255` | Where the `VHW` sentence is broadcast/sent |
| **UDP destination port** | `1183` | UDP port for the `VHW` sentence |
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

The plugin registers a delta input handler (`app.registerDeltaInputHandler`), which sees every incoming delta at full rate before it enters the data model. The handler inspects each value and acts only on `navigation.speedThroughWater`; all deltas (matching or not) are passed through unchanged via `next(delta)`.

On each `navigation.speedThroughWater` value:
1. The STW value is skipped if null or non-finite
2. Current `navigation.attitude` roll is read via `getSelfPath`; the correction is skipped if roll is missing/non-finite, **or if the attitude data is more than 1 s old** (stale-sensor guard, so the last-known heel is not applied indefinitely)
3. STW is converted from m/s to knots, roll from radians to degrees
4. The correction is bilinearly interpolated from the table at (heel °, BSP kn); inputs outside the bin range are clamped to the nearest edge
5. `corrected = max(0, raw + correction)` — the result is floored at zero
6. The corrected value is published to `navigation.speedThroughWaterCorrected` via `app.handleMessage` (converted back to m/s, carrying the source delta's timestamp)
7. The corrected value is emitted as a `VHW` sentence over UDP (once the socket is bound and broadcast-enabled)

The plugin never writes to `navigation.speedThroughWater` itself, so the raw sensor value stays intact and there is no feedback loop from its own Signal K output.

Note that the `VHW` UDP output uses the conventional NMEA STW path — if you feed that UDP stream back into Signal K as `navigation.speedThroughWater`, the plugin will re-correct its own output. Keep the UDP output on a separate consumer.
