const test = require('node:test')
const assert = require('node:assert')
const { parseLabeledCsv } = require('../index.js')._internals

test('reads a plain ascending table', () => {
  const { bspBins, heelBins, table } = parseLabeledCsv('h,1,2\n-10,0.1,0.2\n10,0.3,0.4')
  assert.deepStrictEqual(bspBins, [1, 2])
  assert.deepStrictEqual(heelBins, [-10, 10])
  assert.deepStrictEqual(table, [[0.1, 0.2], [0.3, 0.4]])
})

test('accepts a table written from either end', () => {
  const asc = parseLabeledCsv('h,1,2\n-10,0.1,0.2\n10,0.3,0.4')
  for (const csv of [
    'h,1,2\n10,0.3,0.4\n-10,0.1,0.2',   // heel descending
    'h,2,1\n-10,0.2,0.1\n10,0.4,0.3',   // bsp descending
    'h,2,1\n10,0.4,0.3\n-10,0.2,0.1'    // both
  ]) {
    const got = parseLabeledCsv(csv)
    assert.deepStrictEqual(got, asc, csv)
  }
})

test('rejects an order it cannot interpret', () => {
  assert.throws(() => parseLabeledCsv('h,1,2\n10,0.3,0.4\n-10,0.1,0.2\n0,0.5,0.6'), /in order/)
})

test('rejects duplicate bins, which would make interpolation ambiguous', () => {
  assert.throws(() => parseLabeledCsv('h,1,2\n0,0.1,0.2\n0,0.3,0.4'), /heel angle 0 appears more than once/)
  assert.throws(() => parseLabeledCsv('h,1,1\n0,0.1,0.2'), /BSP bin 1 appears more than once/)
})

test('a blank cell holds the nearest value rather than reading as zero', () => {
  const { table } = parseLabeledCsv('h,1,2,3\n0,,,0.3')
  assert.deepStrictEqual(table, [[0.3, 0.3, 0.3]])
})

test('a heel row that is blank throughout takes the nearest populated row', () => {
  const { table } = parseLabeledCsv('h,1,2\n-10,,\n0,0.3,0.4\n10,0.5,0.6')
  assert.deepStrictEqual(table, [[0.3, 0.4], [0.3, 0.4], [0.5, 0.6]])
})

test('an explicit zero still means zero', () => {
  const { table } = parseLabeledCsv('h,1,2\n0,0,0.2')
  assert.deepStrictEqual(table, [[0, 0.2]])
})

test('survives being pasted out of a spreadsheet', () => {
  const want = parseLabeledCsv('h,1,2\n-5,0.1,0.2\n5,0.3,0.4')
  const pasted = {
    'tab separated': 'h\t1\t2\n-5\t0.1\t0.2\n5\t0.3\t0.4',
    'semicolons': 'h;1;2\n-5;0.1;0.2\n5;0.3;0.4',
    'CRLF': 'h,1,2\r\n-5,0.1,0.2\r\n5,0.3,0.4',
    'byte order mark': '﻿h,1,2\n-5,0.1,0.2\n5,0.3,0.4',
    'trailing separator': 'h,1,2,\n-5,0.1,0.2,\n5,0.3,0.4,',
    'quoted cells': 'h,"1","2"\n-5,"0.1","0.2"\n5,"0.3","0.4"',
    'typographic minus': 'h,1,2\n−5,0.1,0.2\n5,0.3,0.4',
    'degree marks': 'h,1,2\n-5°,0.1,0.2\n5°,0.3,0.4',
    'padded for alignment': 'h ,  1 ,  2\n -5 , 0.1 , 0.2\n  5 , 0.3 , 0.4',
    'blank lines': 'h,1,2\n\n-5,0.1,0.2\n\n5,0.3,0.4\n'
  }
  for (const [what, csv] of Object.entries(pasted)) {
    assert.deepStrictEqual(parseLabeledCsv(csv), want, what)
  }
})

test('names the offending cell when the table is malformed', () => {
  const bad = {
    'h,1,2\n0,0.1,zz': /heel 0, BSP 2 is not a number: "zz"/,
    'h,1,2,3\n0,0.1,0.2': /has 2 correction values but the header lists 3/,
    'h,1,2\nxx,0.1,0.2': /heel angle in row 2 is not a number: "xx"/,
    'h,1,zz\n0,0.1,0.2': /BSP bin 2 in the header row is not a number/,
    'h,1,2': /expected a header row/,
    '': /expected a header row/,
    'h,1,2\n0,,\n10,,': /no numeric correction values/,
    'h,1,2\n0,Infinity,0.2': /is not a number: "Infinity"/,
    'h,1,2\n0,NaN,0.2': /is not a number: "NaN"/
  }
  for (const [csv, re] of Object.entries(bad)) {
    assert.throws(() => parseLabeledCsv(csv), re, JSON.stringify(csv))
  }
})

test('the built-in default table parses', () => {
  const { bspBins, heelBins, table } = parseLabeledCsv(require('../index.js')._internals.DEFAULT_TABLE)
  assert.ok(bspBins.length > 1 && heelBins.length > 1)
  assert.strictEqual(table.length, heelBins.length)
  for (const row of table) {
    assert.strictEqual(row.length, bspBins.length)
    for (const c of row) assert.ok(Number.isFinite(c))
  }
})
