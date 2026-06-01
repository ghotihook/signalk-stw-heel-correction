# signalk-stw-heel-correction

Signal K plugin that corrects `navigation.speedThroughWater` for heel angle using a 2D bilinear interpolation table.

A paddlewheel or impeller tilts with the boat as it heels, causing the raw STW reading to be inaccurate. This plugin intercepts the raw delta from the instrument, looks up and interpolates a correction from a (heel °, BSP kn) table, and emits the corrected value back to `navigation.speedThroughWater` from the plugin's own source.

After installation, configure Signal K **source priority** for `navigation.speedThroughWater` to prefer `signalk-stw-heel-correction` over the raw instrument source.

---

## Installation (server — once)

```bash
git clone git@github.com:ghotihook/signalk-stw-heel-correction ~/signalk-stw-heel-correction
cd ~/.signalk
npm install file:/home/alex060/signalk-stw-heel-correction
sudo systemctl restart signalk
```

Then enable the plugin in the Signal K plugin config UI.

---

## Development workflow

Edit locally, then push to GitHub and pull on the server:

```bash
# Mac
git push

# Server
git -C ~/signalk-stw-heel-correction pull && sudo systemctl restart signalk
```

---

## Configuration

All fields are optional — the plugin ships with a default table for Sakura (Swan 36, AUS 373).

| Field | Description |
|---|---|
| **BSP bins** | Comma-separated boat speeds in knots that define the table columns |
| **Heel bins** | Comma-separated heel angles in degrees that define the table rows. Negative = port heel |
| **Correction table** | CSV block — one row per heel bin, one column per BSP bin. Values are additive corrections in knots: `corrected = raw + correction` |

The table is bilinearly interpolated between bins. Inputs outside the bin range are clamped to the nearest edge.

### Replacing the table

Paste a new CSV block into the Correction table field in the plugin config UI. Rows must match the heel bins order (top = most negative heel), columns must match the BSP bins order (left = slowest).

---

## How it works

The plugin registers a `registerDeltaInputHandler` which fires on every incoming delta before it reaches the Signal K data model. When a delta containing `navigation.speedThroughWater` arrives from an external source (instrument), the plugin:

1. Reads the current `navigation.attitude.roll` from the data model
2. Converts STW m/s → knots, roll radians → degrees
3. Bilinearly interpolates the correction from the table
4. Emits the corrected value via `handleMessage` under source `signalk-stw-heel-correction`
5. Calls `next(delta)` so the raw instrument value is also retained in the data model under its original source

The raw instrument value remains available. Source priority determines which value downstream consumers (autopilot, polars, etc.) see.
