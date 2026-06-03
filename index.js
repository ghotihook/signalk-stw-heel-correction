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

function parseLabeledCsv(s) {
  const rows = s.trim().split(/\r?\n/).map(r => r.split(',').map(c => c.trim()))
  const bspBins = rows[0].slice(1).map(Number)
  const heelBins = []
  const table = []
  for (let i = 1; i < rows.length; i++) {
    heelBins.push(Number(rows[i][0]))
    table.push(rows[i].slice(1).map(Number))
  }
  return { bspBins, heelBins, table }
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
    name: 'gh - STW Heel Correction',
    description: 'Corrects navigation.speedThroughWater for heel angle via 2D bilinear interpolation'
  }

  let unsubscribe = null
  let bspBins, heelBins, correctionTable

  plugin.schema = {
    type: 'object',
    properties: {
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
    const parsed = parseLabeledCsv(options.correctionTable || DEFAULT_TABLE)
    bspBins = parsed.bspBins
    heelBins = parsed.heelBins
    correctionTable = parsed.table

    if (correctionTable.length !== heelBins.length || correctionTable.some(r => r.length !== bspBins.length)) {
      app.setPluginError('Correction table dimensions do not match bin counts — check CSV')
      return
    }

    app.debug(`started: ${heelBins.length} heel bins [${heelBins[0]}°..${heelBins[heelBins.length-1]}°], ${bspBins.length} BSP bins [${bspBins[0]}..${bspBins[bspBins.length-1]} kn]`)
    app.setPluginStatus(`Active — ${heelBins.length}×${bspBins.length} correction table loaded`)

    unsubscribe = app.registerDeltaInputHandler((delta, next) => {
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
              timestamp: update.timestamp || new Date().toISOString(),
              values: [{ path: 'navigation.speedThroughWaterCorrected', value: correctedMs }]
            }]
          })
        }
      }

      next(delta)
    })
  }

  plugin.stop = function () {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
    app.debug('stopped')
    app.setPluginStatus('Stopped')
  }

  return plugin
}
