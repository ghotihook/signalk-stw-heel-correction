const test = require('node:test')
const assert = require('node:assert')
const { parseLabeledCsv, clampedBracket, bilinear } = require('../index.js')._internals

const CSV = 'h,1,2,3\n-10,0.0,0.1,0.2\n0,1.0,1.1,1.2\n10,2.0,2.1,2.2'
const { bspBins, heelBins, table } = parseLabeledCsv(CSV)
const at = (h, s) => bilinear(table, heelBins, bspBins, h, s)

test('grid points come back exactly', () => {
  assert.strictEqual(at(-10, 1), 0.0)
  assert.strictEqual(at(0, 2), 1.1)
  assert.strictEqual(at(10, 3), 2.2)
})

test('interpolates between bins', () => {
  assert.ok(Math.abs(at(-5, 1) - 0.5) < 1e-12)
  assert.ok(Math.abs(at(0, 1.5) - 1.05) < 1e-12)
  assert.ok(Math.abs(at(5, 2.5) - 1.65) < 1e-12)
})

test('clamps outside the grid to the nearest edge', () => {
  assert.strictEqual(at(-90, 1), at(-10, 1))
  assert.strictEqual(at(90, 3), at(10, 3))
  assert.strictEqual(at(0, 0.001), at(0, 1))
  assert.strictEqual(at(0, 999), at(0, 3))
})

test('a single-bin axis is still usable', () => {
  const one = parseLabeledCsv('h,5\n0,0.4')
  assert.strictEqual(bilinear(one.table, one.heelBins, one.bspBins, 30, 9), 0.4)
})

test('clampedBracket brackets correctly and never runs off the ends', () => {
  const bins = [0, 1, 2, 3]
  assert.deepStrictEqual(clampedBracket(bins, -5), [0, 0, 0])
  assert.deepStrictEqual(clampedBracket(bins, 99), [3, 3, 0])
  const [lo, hi, t] = clampedBracket(bins, 1.25)
  assert.strictEqual(lo, 1); assert.strictEqual(hi, 2)
  assert.ok(Math.abs(t - 0.25) < 1e-12)
  for (let v = -1; v <= 4; v += 0.05) {
    const [a, b, f] = clampedBracket(bins, v)
    assert.ok(a >= 0 && b < bins.length, `index out of range at ${v}`)
    assert.ok(Number.isFinite(f) && f >= 0 && f <= 1, `bad fraction ${f} at ${v}`)
  }
})

test('never produces a non-finite correction across the whole plausible envelope', () => {
  const real = parseLabeledCsv(require('../index.js')._internals.DEFAULT_TABLE)
  for (let h = -120; h <= 120; h += 1.5) {
    for (let s = -5; s <= 120; s += 1.5) {
      const c = bilinear(real.table, real.heelBins, real.bspBins, h, s)
      assert.ok(Number.isFinite(c), `non-finite at heel ${h}, ${s} kn`)
    }
  }
})

test('reversing the table does not change the answers', () => {
  const rev = parseLabeledCsv('h,3,2,1\n10,2.2,2.1,2.0\n0,1.2,1.1,1.0\n-10,0.2,0.1,0.0')
  for (let h = -12; h <= 12; h += 0.7) {
    for (let s = 0.5; s <= 3.5; s += 0.3) {
      const a = bilinear(table, heelBins, bspBins, h, s)
      const b = bilinear(rev.table, rev.heelBins, rev.bspBins, h, s)
      assert.ok(Math.abs(a - b) < 1e-12, `heel ${h}, ${s} kn: ${a} vs ${b}`)
    }
  }
})
