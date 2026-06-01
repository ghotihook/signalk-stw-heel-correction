'use strict'

const DEFAULT_BSP_BINS = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5]

const DEFAULT_HEEL_BINS = [-35, -30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30, 35, 40]

const DEFAULT_CORRECTION_TABLE = [
  [+1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +0.6322, +0.5773, +0.4123, +0.4090, +0.4090, +0.4090],
  [+1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +0.8159, +0.6796, +0.6066, +0.4669, +0.4617, +0.4617, +0.4617],
  [+1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +0.8682, +0.8563, +0.8026, +0.7637, +0.7470, +0.8371, +0.7712, +0.7810, +0.7811],
  [+1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +0.9727, +0.9826, +0.9512, +0.8410, +0.8011, +0.8056, +1.0248, +1.2715, +1.4204, +1.4397, +1.4398],
  [+1.0580, +1.0580, +1.0580, +1.0580, +1.0593, +1.1180, +1.0911, +1.0321, +0.9220, +0.7991, +0.7660, +0.9052, +1.1592, +1.3266, +1.4780, +1.5468, +1.5487],
  [+1.2155, +1.2155, +1.2158, +1.2396, +1.2274, +1.1635, +1.0809, +0.9823, +0.9229, +0.8938, +0.9441, +1.0280, +1.1302, +1.1734, +1.3622, +1.5209, +1.5466],
  [+1.5131, +1.5148, +1.5018, +1.4311, +1.3465, +1.2532, +1.1700, +1.0944, +1.0971, +1.0867, +1.0252, +1.0039, +0.9968, +1.0845, +1.1346, +1.2492, +1.0941],
  [+1.4967, +1.5472, +1.5940, +1.4514, +1.3510, +1.2902, +1.2016, +1.1666, +1.1192, +1.0690, +1.0159, +1.0021, +0.9774, +1.0349, +1.1105, +1.2158, +1.1025],
  [+1.4886, +1.4843, +1.4913, +1.5087, +1.4188, +1.2582, +1.2073, +1.1650, +1.1314, +1.0973, +1.0586, +1.0530, +1.0432, +1.0289, +1.0617, +1.1850, +1.1878],
  [+1.2133, +1.2134, +1.2161, +1.2756, +1.3306, +1.2270, +1.1790, +1.1212, +1.0515, +1.0428, +1.0039, +1.0765, +1.1534, +1.0712, +0.9462, +0.9965, +0.9121],
  [+0.9862, +0.9862, +0.9862, +0.9882, +1.0068, +1.0640, +1.1539, +1.0270, +0.9503, +1.0031, +0.8795, +0.8627, +0.9501, +1.0728, +0.8860, +0.8656, +0.7746],
  [+1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +0.9748, +1.0673, +0.9799, +0.9172, +0.8250, +0.8027, +0.7744, +0.9357, +0.7858, +0.7651, +0.7696],
  [+1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +0.9428, +0.9271, +0.8248, +0.8119, +0.7365, +0.6583, +0.6237, +0.6042, +0.6041],
  [+1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +0.8090, +0.7893, +0.6347, +0.4862, +0.4670, +0.4664, +0.4664],
  [+1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +0.7300, +0.5900, +0.5878, +0.5881, +0.5881, +0.5888],
  [+1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +1.0000, +0.5920],
]

const MS_TO_KN = 1.94384
const RAD_TO_DEG = 180 / Math.PI

function parseFloatList(s) {
  return s.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v))
}

function parseCsvBlock(s) {
  return s.trim().split(/\r?\n/).map(row => parseFloatList(row))
}

// Returns [i0, i1, t] where bins[i0] <= v <= bins[i1] and t is the interpolation weight.
// Clamps to the bin range edges.
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
    name: 'STW Heel Correction',
    description: 'Corrects navigation.speedThroughWater for heel angle via 2D bilinear interpolation'
  }

  let active = false
  let handlerRegistered = false
  let bspBins, heelBins, correctionTable

  plugin.schema = {
    type: 'object',
    properties: {
      bspBins: {
        type: 'string',
        title: 'BSP bins (knots, comma-separated)',
        default: DEFAULT_BSP_BINS.join(', ')
      },
      heelBins: {
        type: 'string',
        title: 'Heel bins (degrees, comma-separated)',
        default: DEFAULT_HEEL_BINS.join(', ')
      },
      correctionTable: {
        type: 'string',
        title: 'Correction table (CSV — one row per heel bin, one column per BSP bin, values in knots)',
        default: DEFAULT_CORRECTION_TABLE.map(row => row.map(v => v.toFixed(4)).join(', ')).join('\n')
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
    bspBins = (options.bspBins) ? parseFloatList(options.bspBins) : DEFAULT_BSP_BINS.slice()
    heelBins = (options.heelBins) ? parseFloatList(options.heelBins) : DEFAULT_HEEL_BINS.slice()
    correctionTable = (options.correctionTable) ? parseCsvBlock(options.correctionTable) : DEFAULT_CORRECTION_TABLE.map(r => r.slice())
    active = true

    app.debug(`started: ${heelBins.length} heel bins [${heelBins[0]}°..${heelBins[heelBins.length-1]}°], ${bspBins.length} BSP bins [${bspBins[0]}..${bspBins[bspBins.length-1]} kn]`)
    app.setPluginStatus(`Active — ${heelBins.length}×${bspBins.length} correction table loaded`)

    if (!handlerRegistered) {
      app.registerDeltaInputHandler((delta, next) => {
        if (!active) {
          next(delta)
          return
        }

        // Skip our own output to avoid processing the corrected value as raw input
        for (const update of (delta.updates || [])) {
          if (update.source && update.source.label === plugin.id) {
            next(delta)
            return
          }
        }

        for (const update of (delta.updates || [])) {
          for (const v of (update.values || [])) {
            if (v.path !== 'navigation.speedThroughWater') continue
            if (v.value == null || !Number.isFinite(v.value)) continue

            const attitudeData = app.getSelfPath('navigation.attitude')
            const roll = (attitudeData && attitudeData.value != null) ? attitudeData.value.roll : null
            if (roll == null || !Number.isFinite(roll)) {
              app.debug('skipping correction: no valid roll/heel data available')
              continue
            }

            const stwKn = v.value * MS_TO_KN
            const heelDeg = roll * RAD_TO_DEG
            const correctionKn = bilinear(correctionTable, heelBins, bspBins, heelDeg, stwKn)
            const correctedMs = (stwKn + correctionKn) / MS_TO_KN

            app.debug(`STW ${stwKn.toFixed(2)} kn, heel ${heelDeg.toFixed(1)}° → correction ${correctionKn.toFixed(4)} kn → corrected ${(correctedMs * MS_TO_KN).toFixed(2)} kn`)

            app.handleMessage(plugin.id, {
              context: 'vessels.' + app.selfId,
              updates: [{
                source: { label: plugin.id, type: 'plugin' },
                timestamp: v.timestamp || update.timestamp || new Date().toISOString(),
                values: [{ path: 'navigation.speedThroughWater', value: correctedMs }]
              }]
            })
          }
        }

        next(delta)
      })
      handlerRegistered = true
    }
  }

  plugin.stop = function () {
    active = false
    app.debug('stopped')
    app.setPluginStatus('Stopped')
  }

  return plugin
}
