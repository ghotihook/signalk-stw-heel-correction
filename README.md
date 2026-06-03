# signalk-stw-heel-correction

Signal K plugin that corrects speed through water for heel angle using a 2D bilinear interpolation table.

A paddlewheel or impeller tilts with the boat as it heels, causing the raw STW reading to be inaccurate. This plugin reads `navigation.speedThroughWater` and `navigation.attitude` on every incoming update, looks up and interpolates a correction from a configurable (heel °, BSP kn) table, and emits the result to `navigation.speedThroughWaterCorrected`. The raw `navigation.speedThroughWater` value is unchanged.

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

1. `registerDeltaInputHandler` fires on every incoming delta
2. For each value where `path === navigation.speedThroughWater`, the plugin reads the current `navigation.attitude` roll and converts units (m/s → kn, rad → deg)
3. The correction is bilinearly interpolated from the table at (heel, BSP)
4. The corrected value is emitted to `navigation.speedThroughWaterCorrected` via `handleMessage`
5. The original delta passes through unchanged

Reading and writing on separate paths avoids any source priority conflict — the plugin fires on every incoming STW update continuously.
