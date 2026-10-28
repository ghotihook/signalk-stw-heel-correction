# Changelog

## 0.3.0 — 2026-10-29

- **Fix: feedback loop with another STW plugin.** Alongside `signalk-performance-processor` in Replace mode, each plugin corrected the other's STW and handed it back, so STW ran away. STW is now read **from sensors only** by default: updates that carry a `source` object from a data connection, never STW another plugin has published.
- New **Input source** setting: name the `$source` to correct, which may be another plugin for a deliberate one-way chain.
- **Rate limit as a circuit breaker:** the corrected value is never published more often than 20 Hz. A feedback loop is cut at its first repeat, and a backlog flushed after a dropout is thinned rather than stopped; nothing latches. While updates are being dropped, the status says so, with a count and the source driving them, for 10 s after the last one; the first is logged.
- The status says when STW is arriving only from another plugin, or not from the chosen input source.
- README links the changelog; the package description is rewritten for the App Store listing.

## 0.2.3 — 2026-09-21

- Fix the test script so the suite runs on Node 22 and 24. `node --test test/` treats the directory as a file on those versions, so the tests never started; it now runs `node --test`.
- Tests no longer wait on real time, taking a fraction of a second instead of about sixteen.
- Add the Signal K plugin CI workflow, a changelog and an App Store screenshot.

## 0.2.2 — 2026-09-21

- README explains why heel correction matters and how to install from the App Store.

## 0.2.1 — 2026-09-21

- Documentation corrected and filled out, including a full description of the correction table format.

## 0.2.0 — 2026-09-20

- Republish corrected STW on `navigation.speedThroughWater` under the plugin's own source, so Source Priorities rank it above the raw sensor. Output path setting: standard, corrected, or both.
- Blank correction-table cells are treated as missing and filled from the nearest known value, not as zero.
- Tables written in either direction are accepted; duplicate bins and malformed cells are reported in the plugin status.
- Heel and speed plausibility checks, stale and future-dated attitude rejection, and a backstop loop guard.
- Clear status lines, an app icon, App Store packaging, and a test suite.
- UDP VHW output removed; output is Signal K only.

## 0.1.0 — 2026-06-01

- First version: corrects STW for heel from a bilinear interpolation table.
