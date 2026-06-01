'use strict'

const DEFAULT_BSP_BINS = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5]

const DEFAULT_HEEL_BINS = [-35, -30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30, 35, 40]

const DEFAULT_CORRECTION_TABLE = [
  [+0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, -0.3678, -0.4227, -0.5877, -0.5910, -0.5910, -0.5910],
  [+0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, -0.1841, -0.3204, -0.3934, -0.5331, -0.5383, -0.5383, -0.5383],
  [+0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, -0.1318, -0.1437, -0.1974, -0.2363, -0.2530, -0.1629, -0.2288, -0.2190, -0.2189],
  [+0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, -0.0273, -0.0174, -0.0488, -0.1590, -0.1989, -0.1944, +0.0248, +0.2715, +0.4204, +0.4397, +0.4398],
  [+0.0580, +0.0580, +0.0580, +0.0580, +0.0593, +0.1180, +0.0911, +0.0321, -0.0780, -0.2009, -0.2340, -0.0948, +0.1592, +0.3266, +0.4780, +0.5468, +0.5487],
  [+0.2155, +0.2155, +0.2158, +0.2396, +0.2274, +0.1635, +0.0809, -0.0177, -0.0771, -0.1062, -0.0559, +0.0280, +0.1302, +0.1734, +0.3622, +0.5209, +0.5466],
  [+0.5131, +0.5148, +0.5018, +0.4311, +0.3465, +0.2532, +0.1700, +0.0944, +0.0971, +0.0867, +0.0252, +0.0039, -0.0032, +0.0845, +0.1346, +0.2492, +0.0941],
  [+0.4967, +0.5472, +0.5940, +0.4514, +0.3510, +0.2902, +0.2016, +0.1666, +0.1192, +0.0690, +0.0159, +0.0021, -0.0226, +0.0349, +0.1105, +0.2158, +0.1025],
  [+0.4886, +0.4843, +0.4913, +0.5087, +0.4188, +0.2582, +0.2073, +0.1650, +0.1314, +0.0973, +0.0586, +0.0530, +0.0432, +0.0289, +0.0617, +0.1850, +0.1878],
  [+0.2133, +0.2134, +0.2161, +0.2756, +0.3306, +0.2270, +0.1790, +0.1212, +0.0515, +0.0428, +0.0039, +0.0765, +0.1534, +0.0712, -0.0538, -0.0035, -0.0879],
  [-0.0138, -0.0138, -0.0138, -0.0118, +0.0068, +0.0640, +0.1539, +0.0270, -0.0497, +0.0031, -0.1205, -0.1373, -0.0499, +0.0728, -0.1140, -0.1344, -0.2254],
  [+0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, -0.0252, +0.0673, -0.0201, -0.0828, -0.1750, -0.1973, -0.2256, -0.0643, -0.2142, -0.2349, -0.2304],
  [+0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, -0.0572, -0.0729, -0.1752, -0.1881, -0.2635, -0.3417, -0.3763, -0.3958, -0.3959],
  [+0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, -0.1910, -0.2107, -0.3653, -0.5138, -0.5330, -0.5336, -0.5336],
  [+0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, -0.2700, -0.4100, -0.4122, -0.4119, -0.4119, -0.4112],
  [+0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, +0.0000, -0.4080],
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

    if (!handlerRegistered) {
      app.registerDeltaInputHandler((delta, next) => {
        if (!active) {
          next(delta)
          return
        }

        // Skip our own output to avoid processing the corrected value as raw input
        for (const update of (delta.updates || [])) {
          if (update.source && update.source.$source === plugin.id) {
            next(delta)
            return
          }
        }

        for (const update of (delta.updates || [])) {
          for (const v of (update.values || [])) {
            if (v.path !== 'navigation.speedThroughWater') continue
            if (v.value == null || !Number.isFinite(v.value)) continue

            const rollData = app.getSelfPath('navigation.attitude.roll')
            const roll = (rollData != null) ? rollData.value : null
            if (roll == null || !Number.isFinite(roll)) continue

            const stwKn = v.value * MS_TO_KN
            const heelDeg = roll * RAD_TO_DEG
            const correctionKn = bilinear(correctionTable, heelBins, bspBins, heelDeg, stwKn)
            const correctedMs = (stwKn + correctionKn) / MS_TO_KN

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
  }

  return plugin
}
