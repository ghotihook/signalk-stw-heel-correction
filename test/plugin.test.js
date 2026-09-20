const test = require('node:test')
const assert = require('node:assert')
const factory = require('../index.js')

const MS_TO_KN = 1.94384
const RAD = Math.PI / 180
const KN = kn => kn / MS_TO_KN

// A fake Signal K app: collects what the plugin publishes, says, and complains about.
function harness (options = {}, attitude = { roll: -10 * RAD, ageMs: 0 }) {
  const published = [], meta = [], statuses = [], errors = [], debug = []
  let onDelta = null, sm = null
  const app = {
    debug: m => debug.push(m),
    error: m => errors.push(m),
    setPluginError: m => errors.push(m),
    setPluginStatus: m => statuses.push(m),
    getSelfPath (path) {
      if (path !== 'navigation.attitude' || attitude === null) return undefined
      if (attitude.raw !== undefined) return attitude.raw
      return {
        value: { roll: attitude.roll },
        timestamp: new Date(Date.now() - attitude.ageMs).toISOString()
      }
    },
    handleMessage (id, delta) {
      const u = delta.updates[0]
      if (u.meta) meta.push(...u.meta.map(x => x.path))
      else published.push({ id, values: u.values, timestamp: u.timestamp })
    },
    get subscriptionmanager () { return sm }
  }
  const plugin = factory(app)
  plugin.start(options)
  sm = { subscribe: (s, unsub, onErr, cb) => { onDelta = cb; unsub.push(() => { onDelta = null }) } }
  return {
    plugin, published, meta, statuses, errors, debug, app,
    attitude (next) { attitude = next },
    ready: () => new Promise(r => setTimeout(r, 700)),
    // returns the paths published for this delta, or null if the plugin stayed quiet
    feed (kn, source = 'paddlewheel') {
      if (!onDelta) return null
      const before = published.length
      onDelta({ updates: [{ $source: source, timestamp: '2026-01-01T00:00:00.000Z',
        values: [{ path: 'navigation.speedThroughWater', value: KN(kn) }] }] })
      return published.length > before ? published[published.length - 1] : null
    },
    feedRaw (value, source = 'paddlewheel') {
      if (!onDelta) return null
      const before = published.length
      onDelta({ updates: [{ $source: source, timestamp: 't',
        values: [{ path: 'navigation.speedThroughWater', value }] }] })
      return published.length > before ? published[published.length - 1] : null
    },
    feedPath (path) {
      if (!onDelta) return null
      const before = published.length
      onDelta({ updates: [{ $source: 'x', timestamp: 't', values: [{ path, value: 3 }] }] })
      return published.length > before ? published[published.length - 1] : null
    },
    kn: out => out && out.values[0].value * MS_TO_KN
  }
}

test('subscribes with sourcePolicy all, which is what a full-rate corrector needs', async () => {
  let sub = null
  const app = { debug(){}, error(){}, setPluginError(){}, setPluginStatus(){},
    getSelfPath: () => undefined, handleMessage(){},
    subscriptionmanager: { subscribe: (s, u) => { sub = s; u.push(() => {}) } } }
  factory(app).start({})
  assert.strictEqual(sub.sourcePolicy, 'all')
  assert.strictEqual(sub.context, 'vessels.self')
  assert.deepStrictEqual(sub.subscribe, [{ path: 'navigation.speedThroughWater' }])
})

test('publishes a corrected value on the standard path by default', async () => {
  const h = harness()
  await h.ready()
  const out = h.feed(6)
  assert.strictEqual(out.values[0].path, 'navigation.speedThroughWater')
  assert.strictEqual(out.id, 'signalk-stw-heel-correction')
  assert.strictEqual(out.timestamp, '2026-01-01T00:00:00.000Z', 'carries the source timestamp')
})

test('output path setting selects the path(s)', async () => {
  for (const [mode, paths] of [
    ['standard', ['navigation.speedThroughWater']],
    ['corrected', ['navigation.speedThroughWaterCorrected']],
    ['both', ['navigation.speedThroughWater', 'navigation.speedThroughWaterCorrected']]
  ]) {
    const h = harness({ outputPath: mode })
    await h.ready()
    assert.deepStrictEqual(h.feed(6).values.map(v => v.path), paths, mode)
  }
})

test('declares units for the corrected path, which is not in the schema', async () => {
  const bare = harness({ outputPath: 'standard' }); await bare.ready()
  assert.deepStrictEqual(bare.meta, [])
  const corr = harness({ outputPath: 'corrected' }); await corr.ready()
  assert.deepStrictEqual(corr.meta, ['navigation.speedThroughWaterCorrected'])
})

test('ignores its own output, however the source is spelled', async () => {
  const h = harness(); await h.ready()
  assert.strictEqual(h.feed(6, 'signalk-stw-heel-correction'), null)
  assert.strictEqual(h.feed(6, 'signalk-stw-heel-correction.II'), null)
  assert.ok(h.feed(6, 'paddlewheel'))
})

test('catches its own value returning under a foreign source, and says so once', async () => {
  const h = harness(); await h.ready()
  const mine = h.feed(6).values[0].value
  assert.strictEqual(h.feedRaw(mine, 'somewhere.else'), null)
  assert.strictEqual(h.feedRaw(mine, 'somewhere.else'), null)
  assert.strictEqual(h.errors.filter(e => /Loop guard/.test(e)).length, 1)
})

test('a repeated raw sample is never mistaken for an echo', async () => {
  // A zero correction republishes the input, and m/s -> kn -> m/s is not bit-exact,
  // so this is where float noise used to get remembered as an "output".
  const h = harness({ correctionTable: 'h,1,10\n-40,0,0\n40,0,0', minSpeedKn: 0 })
  await h.ready()
  let dropped = 0
  for (let i = 1; i < 3000; i++) {
    const ms = i * 0.0001
    h.feedRaw(ms)
    if (h.feedRaw(ms) === null) dropped++
  }
  assert.strictEqual(dropped, 0)
  assert.strictEqual(h.errors.filter(e => /Loop guard/.test(e)).length, 0)
})

test('goes quiet when it cannot correct, so priorities fall back to the sensor', async () => {
  const cases = {
    'no attitude at all': null,
    'roll missing': { roll: null, ageMs: 0 },
    'roll not finite': { roll: Infinity, ageMs: 0 },
    'heel stale': { roll: 0.2, ageMs: 5000 },
    'heel timestamp in the future': { roll: 0.2, ageMs: -60000 },
    'heel beyond what a boat does': { roll: 3.0, ageMs: 0 },
    'roll published in degrees by mistake': { roll: 20, ageMs: 0 }
  }
  for (const [what, att] of Object.entries(cases)) {
    const h = harness(); await h.ready()
    h.attitude(att)
    assert.strictEqual(h.feed(6), null, what)
  }
})

test('rejects impossible speeds rather than republishing them', async () => {
  const h = harness(); await h.ready()
  assert.strictEqual(h.feed(-5), null, 'negative STW')
  assert.strictEqual(h.feed(900), null, 'absurd STW')
  assert.strictEqual(h.feedRaw(null), null, 'null')
  assert.strictEqual(h.feedRaw(NaN), null, 'NaN')
  assert.strictEqual(h.feedRaw(Infinity), null, 'Infinity')
  // and a genuine zero still gets through afterwards
  assert.ok(h.feedRaw(0), 'zero is a real reading')
})

test('passes the raw value through below the minimum speed', async () => {
  const h = harness({ minSpeedKn: 1.0 }); await h.ready()
  const out = h.feed(0.6)
  assert.ok(Math.abs(h.kn(out) - 0.6) < 1e-9)
})

test('tolerates an unwrapped attitude object', async () => {
  const h = harness(); await h.ready()
  h.attitude({ raw: { roll: -10 * RAD, timestamp: new Date().toISOString() } })
  assert.ok(h.feed(6), 'should still correct')
})

test('ignores other paths', async () => {
  const h = harness(); await h.ready()
  for (const p of ['navigation.speedOverGround', 'navigation.attitude', 'navigation.speedThroughWaterCorrected']) {
    assert.strictEqual(h.feedPath(p), null, p)
  }
})

test('reports a bad table instead of starting', () => {
  const h = harness({ correctionTable: 'h,1,2\n0,0.1,zz' })
  assert.ok(h.errors.some(e => /Correction table:.*zz/.test(e)))
})

test('starts with no options at all', () => {
  const app = { debug(){}, error(){}, setPluginError(){}, setPluginStatus(){},
    getSelfPath: () => undefined, handleMessage(){},
    subscriptionmanager: { subscribe: (s, u) => u.push(() => {}) } }
  assert.doesNotThrow(() => factory(app).start())
})

test('subscribes late if subscriptionmanager is not ready yet', async () => {
  let subscribed = false
  const app = { debug(){}, error(){}, setPluginError(){}, setPluginStatus(){},
    getSelfPath: () => undefined, handleMessage(){}, subscriptionmanager: undefined }
  const plugin = factory(app)
  plugin.start({})
  assert.strictEqual(subscribed, false)
  app.subscriptionmanager = { subscribe: (s, u) => { subscribed = true; u.push(() => {}) } }
  await new Promise(r => setTimeout(r, 900))
  assert.strictEqual(subscribed, true)
  plugin.stop()
})

test('stop unsubscribes and stays stopped', async () => {
  const h = harness(); await h.ready()
  assert.ok(h.feed(6))
  h.plugin.stop()
  assert.strictEqual(h.feed(6), null)
})

test('status says what it is doing', async () => {
  const h = harness({ minSpeedKn: 1.0 }); await h.ready()
  assert.ok(h.statuses.some(s => /Waiting for navigation\.speedThroughWater/.test(s)))
  h.feed(6)
  assert.ok(h.statuses.some(s => /^Correcting — heel -?\d+°/.test(s)), h.statuses.join(' | '))
  h.attitude(null)
  h.feed(6)
  assert.ok(h.statuses.some(s => /Not publishing — no heel data/.test(s)))
})
