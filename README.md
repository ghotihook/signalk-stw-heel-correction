# signalk-stw-heel-correction

Signal K plugin that corrects speed through water for heel angle using a 2D bilinear interpolation table.

A paddlewheel or impeller tilts with the boat as it heels, causing the raw STW reading to be inaccurate. This plugin subscribes to `navigation.speedThroughWater` from all external sources, looks up and interpolates a correction from a configurable (heel °, BSP kn) table, and emits the corrected value back to `navigation.speedThroughWater` under its own source label. Source priority then determines the canonical value for all consumers.

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

The plugin uses `subscriptionmanager.subscribe` with `sourcePolicy: 'all'`, which delivers every incoming delta from every source at full rate with no priority cascade on the input. This is the correct pattern for a corrector that needs to process every raw sample.

On each update:
1. The incoming source is checked — if it is the plugin's own output it is skipped (`u.$source === plugin.id`)
2. Current `navigation.attitude` roll is read and converted to degrees
3. STW is converted from m/s to knots
4. The correction is bilinearly interpolated from the table at (heel °, BSP kn)
5. The corrected value is emitted to `navigation.speedThroughWater` with no source object, so the server sets `$source` to the bare plugin id
6. Global source priority determines which value consumers see

**Why not `excludeSelf`?** `excludeSelf` runs a priority cascade on the input feed and delivers a single ranked value — correct for a plugin that wants the preferred upstream source with its own output masked out, but wrong for a full-rate corrector. With `excludeSelf` and the plugin ranked above the instrument, the cascade sees the plugin's (excluded) output as the preferred source that never arrives and holds the real source as a fallback, stalling input until the fallback timeout. `sourcePolicy: 'all'` bypasses the cascade entirely.

**SignalK version note:** `excludeSelf` is not present in v2.28.0-beta.2. The `u.$source === plugin.id` guard is the correct workaround and remains harmless on newer builds.
