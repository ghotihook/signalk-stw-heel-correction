'use strict'

// corrected = raw + correction  (positive correction = paddlewheel under-reads at that heel/bsp)
const DEFAULT_TABLE = `heel\\bsp,0.5,1.0,1.5,2.0,2.5,3.0,3.5,4.0,4.5,5.0,5.5,6.0,6.5,7.0,7.5,8.0,8.5
-35,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,-0.2640,-0.4746,-0.5039,-0.5047,-0.5047,-0.5047
-30,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,-0.0761,-0.3019,-0.5147,-0.6905,-0.7250,-0.7264,-0.7264
-25,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.7882,0.0509,-0.2146,-0.2696,-0.4312,-0.4502,-0.4549,-0.5025,-0.5026
-20,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.6523,0.5461,0.4627,-0.1389,-0.2367,-0.2062,-0.0227,0.1565,0.3099,0.3284,0.3284
-15,0.0935,0.0935,0.0936,0.0957,0.1419,0.4376,0.2922,0.1296,-0.0576,-0.1831,-0.2490,-0.1213,0.0616,0.2057,0.3765,0.4204,0.4207
-10,0.1237,0.1237,0.1241,0.1965,0.3012,0.2022,0.0718,-0.0482,-0.0757,-0.0889,-0.0816,-0.0001,0.0567,0.1591,0.3079,0.3699,0.3655
-5,0.4749,0.4749,0.4648,0.4070,0.3552,0.2671,0.1670,0.0940,0.1015,0.0864,0.0247,0.0002,-0.0029,0.0908,0.1294,-0.0099,0.0087
0,0.5489,0.5450,0.4901,0.4434,0.3375,0.2824,0.2049,0.1723,0.1342,0.0919,0.0750,0.0485,-0.0161,0.0014,0.0447,0.0371,0.0448
5,0.4478,0.4432,0.3594,0.4050,0.3686,0.2490,0.1586,0.1542,0.1091,0.0748,0.0464,0.0202,0.0271,0.0046,-0.0343,0.0301,0.0159
10,0.1419,0.1421,0.1522,0.2202,0.2382,0.1562,0.1080,0.1014,0.0644,0.0442,0.0374,0.0512,0.0860,0.0463,-0.1129,-0.1199,-0.1513
15,-0.1083,-0.1083,-0.1082,-0.0939,-0.0205,0.0942,0.0133,-0.0396,-0.0859,-0.0779,-0.1267,-0.1364,-0.0687,0.0312,-0.1421,-0.2092,-0.2261
20,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0462,-0.0985,-0.1796,-0.2186,-0.2672,-0.2213,-0.2539,-0.1584,-0.2342,-0.2855,-0.2793
25,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,-0.1434,-0.3018,-0.3865,-0.2665,-0.3146,-0.4589,-0.3860,-0.3547,-0.3561
30,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,-0.3124,-0.2987,-0.3993,-0.6581,-0.6963,-0.6981,-0.6980
35,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,-0.2126,-0.2754,-0.3557,-0.3581,-0.3574,-0.3282
40,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,-0.2001`

const MS_TO_KN = 1.94384
const RAD_TO_DEG = 180 / Math.PI
const STW_PATH = 'navigation.speedThroughWater'
const CORRECTED_PATH = 'navigation.speedThroughWaterCorrected'
const DEFAULT_MIN_SPEED_KN = 1.0
const ATTITUDE_MAX_AGE_MS = 1000
const STATUS_INTERVAL_MS = 1000

// A blank cell means "no data for this heel/speed combination" — typically a corner
// of the grid the boat never occupies. Extend the nearest known value into it rather
// than reading it as a zero correction: a zero would pull a real correction toward
// nothing as the boat approached the edge of the measured region, which is the same
// edge-holding behaviour inputs outside the bin range already get.
function fillGaps(table) {
  const cols = table[0].length

  for (const row of table) {
    let last = null
    for (let j = 0; j < cols; j++) {
      if (row[j] !== null) last = row[j]
      else if (last !== null) row[j] = last
    }
    last = null
    for (let j = cols - 1; j >= 0; j--) {
      if (row[j] !== null) last = row[j]
      else if (last !== null) row[j] = last
    }
  }

  // A row filled above is filled completely, so an empty first cell means the whole
  // heel row was blank. Take it from the nearest heel row that has data.
  for (let i = 0; i < table.length; i++) {
    if (table[i][0] !== null) continue
    let src = null
    for (let d = 1; d < table.length && src === null; d++) {
      if (i - d >= 0 && table[i - d][0] !== null) src = table[i - d]
      else if (i + d < table.length && table[i + d][0] !== null) src = table[i + d]
    }
    if (src) table[i] = src.slice()
  }

  if (table.some(r => r.some(c => c === null))) {
    throw new Error('no numeric correction values found anywhere in the table')
  }
  return table
}

function parseLabeledCsv(s) {
  const rows = s.trim().split(/\r?\n/)
    .map(r => r.split(',').map(c => c.trim()))
    .filter(r => r.some(c => c !== ''))

  if (rows.length < 2) {
    throw new Error('expected a header row of BSP bins and at least one heel row')
  }

  const bspBins = rows[0].slice(1).map((c, j) => {
    const n = Number(c)
    if (c === '' || !Number.isFinite(n)) {
      throw new Error(`BSP bin ${j + 1} in the header row is not a number: "${c}"`)
    }
    return n
  })

  if (bspBins.length === 0) throw new Error('header row lists no BSP bins')

  const heelBins = []
  const table = []
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i]
    const heel = Number(cells[0])
    if (cells[0] === '' || !Number.isFinite(heel)) {
      throw new Error(`heel angle in row ${i + 1} is not a number: "${cells[0]}"`)
    }
    const values = cells.slice(1)
    if (values.length !== bspBins.length) {
      throw new Error(
        `heel row ${heel} has ${values.length} correction values but the header lists ${bspBins.length} BSP bins`
      )
    }
    heelBins.push(heel)
    table.push(values.map((c, j) => {
      if (c === '') return null
      const n = Number(c)
      if (!Number.isFinite(n)) {
        throw new Error(`correction at heel ${heel}, BSP ${bspBins[j]} is not a number: "${c}"`)
      }
      return n
    }))
  }

  return { bspBins, heelBins, table: fillGaps(table) }
}

function clampedBracket(bins, v) {
  if (v <= bins[0]) return [0, 0, 0]
  if (v >= bins[bins.length - 1]) return [bins.length - 1, bins.length - 1, 0]
  let i = 0
  while (i < bins.length - 2 && bins[i + 1] < v) i++
  const t = (v - bins[i]) / (bins[i + 1] - bins[i])
  return [i, i + 1, t]
}

function bilinear(table, heelBins, bspBins, heel, bsp) {
  const [hi0, hi1, ht] = clampedBracket(heelBins, heel)
  const [si0, si1, st] = clampedBracket(bspBins, bsp)
  return (
    table[hi0][si0] * (1 - ht) * (1 - st) +
    table[hi0][si1] * (1 - ht) * st +
    table[hi1][si0] * ht * (1 - st) +
    table[hi1][si1] * ht * st
  )
}

module.exports = function (app) {
  const plugin = {
    id: 'signalk-stw-heel-correction',
    name: 'gh - STW Heel Correction',
    description: `Corrects ${STW_PATH} for heel angle and republishes it under this plugin's own source, so Signal K source priorities can rank it above the raw paddlewheel`
  }

  let unsubscribes = []
  let retryTimer = null

  plugin.schema = {
    type: 'object',
    properties: {
      outputPath: {
        type: 'string',
        title: 'Where to publish the corrected value',
        enum: ['standard', 'corrected', 'both'],
        enumNames: [
          `${STW_PATH} — republished under this plugin's source, ranked by Source Priorities (recommended)`,
          `${CORRECTED_PATH} — a separate path, leaving the raw value untouched`,
          'Both paths'
        ],
        default: 'standard'
      },
      minSpeedKn: {
        type: 'number',
        title: 'Minimum speed (knots) to apply the correction — below this the raw STW is passed through uncorrected',
        default: DEFAULT_MIN_SPEED_KN
      },
      correctionTable: {
        type: 'string',
        title: 'Correction table — labeled CSV. Row 1: heel\\bsp,0.5,1.0,1.5,... (BSP bins in knots). Rows 2+: -35,0.00,0.00,... (heel angle in degrees, then one correction value per BSP bin). Values in knots: corrected = raw + correction.',
        default: DEFAULT_TABLE
      }
    }
  }

  plugin.uiSchema = {
    correctionTable: {
      'ui:widget': 'textarea',
      'ui:options': { rows: 20 }
    }
  }

  plugin.start = function (options) {
    stopEverything()

    let bspBins, heelBins, correctionTable
    try {
      const parsed = parseLabeledCsv(options.correctionTable || DEFAULT_TABLE)
      bspBins = parsed.bspBins
      heelBins = parsed.heelBins
      correctionTable = parsed.table
    } catch (e) {
      app.setPluginError(`Correction table: ${e.message}`)
      return
    }

    const minSpeedKn = Number.isFinite(options.minSpeedKn) ? options.minSpeedKn : DEFAULT_MIN_SPEED_KN

    const outputPath = options.outputPath || 'standard'
    const outputPaths =
      outputPath === 'corrected' ? [CORRECTED_PATH]
      : outputPath === 'both' ? [STW_PATH, CORRECTED_PATH]
      : [STW_PATH]
    // Only an output on STW_PATH can feed back into our own input.
    const writesStandardPath = outputPaths.includes(STW_PATH)

    if (outputPaths.includes(CORRECTED_PATH)) {
      // CORRECTED_PATH is not in the Signal K schema, so consumers have no units for
      // it unless we say so.
      app.handleMessage(plugin.id, {
        updates: [{
          meta: [{
            path: CORRECTED_PATH,
            value: { units: 'm/s', description: 'Speed through water, corrected for heel angle' }
          }]
        }]
      })
    }

    // Loop guard. The server sets $source to plugin.id on deltas we publish with no
    // explicit source object, so an exact match is the documented check — but this
    // plugin has previously been bitten by a $source that did not match exactly, and
    // an unbroken loop now lands on the boat's primary STW path. Tolerate a suffix.
    function isOwnSource(src) {
      if (!src) return false
      const s = String(src)
      return s === plugin.id || s.startsWith(plugin.id + '.')
    }

    // Backstop echo detector: remember values we published that differ from their
    // input, so a re-delivered output is recognisable even if its $source is not.
    // Only non-pass-through values are recorded, so a genuine sample can never match.
    const recentOutputs = []
    let loopWarned = false
    function noteOutput(ms) {
      recentOutputs.push(ms)
      if (recentOutputs.length > 32) recentOutputs.shift()
    }
    function isOwnEcho(ms) {
      return recentOutputs.some(o => Math.abs(o - ms) < 1e-12)
    }

    // What happens to consumers while the plugin is not publishing depends on
    // whether anything else is serving the path.
    const fallback = writesStandardPath
      ? 'raw source in use'
      : `${CORRECTED_PATH} going stale`

    // Refresh on a state change, and once a second within a state so the live
    // numbers in the correcting status keep moving.
    let lastState = null
    let lastStatusAt = 0
    function reportState(state, detail) {
      const now = Date.now()
      if (state === lastState && now - lastStatusAt < STATUS_INTERVAL_MS) return
      lastState = state
      lastStatusAt = now
      app.setPluginStatus(detail)
    }

    function onDelta(delta) {
      for (const update of (delta.updates || [])) {
        if (isOwnSource(update.$source)) continue

        for (const v of (update.values || [])) {
          if (v.path !== STW_PATH) continue
          if (v.value == null || !Number.isFinite(v.value)) continue

          if (isOwnEcho(v.value)) {
            if (!loopWarned) {
              loopWarned = true
              app.error(
                `Loop guard mismatch: received a value this plugin published, but its ` +
                `$source was "${update.$source}" rather than "${plugin.id}". Skipping it ` +
                `to avoid a feedback loop — please report this $source value.`
              )
            }
            continue
          }

          const stwKn = v.value * MS_TO_KN

          const attitudeData = app.getSelfPath('navigation.attitude')
          const roll = (attitudeData && attitudeData.value != null) ? attitudeData.value.roll : null
          const attitudeAge = (attitudeData && attitudeData.timestamp)
            ? (Date.now() - new Date(attitudeData.timestamp).getTime())
            : Infinity

          // Without usable heel there is no correction to make, so go silent and let
          // source priorities fall back to the raw sensor rather than republishing a
          // value we have not improved.
          if (roll == null || !Number.isFinite(roll)) {
            reportState('noroll', `Not publishing — no heel data, ${fallback}`)
            app.debug('no valid roll/heel data — going silent')
            continue
          }
          if (!(attitudeAge < ATTITUDE_MAX_AGE_MS)) {
            reportState('stale', `Not publishing — heel data stale, ${fallback}`)
            app.debug(`attitude stale (${attitudeAge} ms) — going silent`)
            continue
          }

          const heelDeg = roll * RAD_TO_DEG
          let correctionKn = 0
          if (stwKn < minSpeedKn) {
            reportState('slow', `Not correcting — ${stwKn.toFixed(1)} kn is below the ${minSpeedKn} kn minimum, publishing raw`)
            app.debug(`STW ${stwKn.toFixed(2)} kn below minimum ${minSpeedKn} kn — passing through uncorrected`)
          } else {
            correctionKn = bilinear(correctionTable, heelBins, bspBins, heelDeg, stwKn)
            const signed = `${correctionKn >= 0 ? '+' : ''}${correctionKn.toFixed(2)}`
            reportState('correcting', `Correcting — heel ${heelDeg.toFixed(0)}°, ${signed} kn → ${Math.max(0, stwKn + correctionKn).toFixed(2)} kn`)
            app.debug(`STW ${stwKn.toFixed(2)} kn, heel ${heelDeg.toFixed(1)}° → correction ${correctionKn.toFixed(4)} kn → corrected ${Math.max(0, stwKn + correctionKn).toFixed(2)} kn`)
          }

          const correctedKn = Math.max(0, stwKn + correctionKn)
          const correctedMs = correctedKn / MS_TO_KN

          if (writesStandardPath && correctedMs !== v.value) noteOutput(correctedMs)

          // No source object: the server stamps $source with plugin.id, which is what
          // both the loop guard above and the user's Source Priorities entry match on.
          app.handleMessage(plugin.id, {
            updates: [{
              timestamp: update.timestamp,
              values: outputPaths.map(path => ({ path, value: correctedMs }))
            }]
          })
        }
      }
    }

    // The one place the priority hint is actionable: nothing is arriving yet, so the
    // user is most likely still setting the plugin up.
    const waitingStatus = writesStandardPath
      ? `Waiting for ${STW_PATH} — rank "${plugin.id}" above the sensor in Source Priorities`
      : `Waiting for ${STW_PATH}`

    // sourcePolicy 'all' delivers every source at full rate with no priority cascade
    // on the input feed. excludeSelf is wrong here: its cascade stalls a full-rate
    // corrector once this plugin outranks the sensor, waiting on its own excluded
    // output until the fallback timeout.
    const subscription = {
      context: 'vessels.self',
      sourcePolicy: 'all',
      subscribe: [{ path: STW_PATH }]
    }

    // subscriptionmanager has not always been ready at plugin.start; retry briefly
    // rather than silently never subscribing.
    function trySubscribe(attempt) {
      retryTimer = null
      const sm = app.subscriptionmanager
      if (sm && typeof sm.subscribe === 'function') {
        try {
          sm.subscribe(subscription, unsubscribes, (err) => app.setPluginError(String(err)), onDelta)
          app.debug(`subscribed to ${STW_PATH} (sourcePolicy: all)`)
          // Nothing more happens until a delta arrives, so say so rather than
          // leaving a "starting" status up indefinitely when STW is not flowing.
          app.setPluginStatus(waitingStatus)
          return
        } catch (e) {
          app.error(`subscribe failed: ${e.message}`)
        }
      }
      if (attempt >= 20) {
        app.setPluginError('Could not subscribe — subscriptionmanager unavailable')
        return
      }
      retryTimer = setTimeout(() => trySubscribe(attempt + 1), 500)
    }

    app.debug(`started: ${heelBins.length}×${bspBins.length} table, min speed ${minSpeedKn} kn, publishing ${outputPaths.join(' + ')} as "${plugin.id}"`)
    app.setPluginStatus(`Starting — output ${outputPaths.join(' + ')}`)
    trySubscribe(0)
  }

  function stopEverything() {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
    unsubscribes.forEach(f => f())
    unsubscribes = []
  }

  plugin.stop = function () {
    stopEverything()
    app.debug('stopped')
    app.setPluginStatus('Stopped')
  }

  return plugin
}
