'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const converter = require('./dist/node.js');

test('converts big- and little-endian buffers', () => {
  assert.equal(converter.toBigIntLE(Buffer.from([0x34, 0x12])), 0x1234n);
  assert.equal(converter.toBigIntBE(Buffer.from([0x12, 0x34])), 0x1234n);
  assert.equal(converter.toBigIntLE(Buffer.alloc(0)), 0n);
  assert.equal(converter.toBigIntBE(Buffer.alloc(0)), 0n);
});

test('round-trips fixed-width buffers without native code', () => {
  assert.deepEqual(converter.toBufferLE(0x1234n, 4), Buffer.from([0x34, 0x12, 0, 0]));
  assert.deepEqual(converter.toBufferBE(0x1234n, 4), Buffer.from([0, 0, 0x12, 0x34]));
});

test('safely converts input larger than common native integer widths', () => {
  const input = Buffer.alloc(256, 0xab);
  assert.equal(converter.toBigIntLE(input), BigInt(`0x${Buffer.from(input).reverse().toString('hex')}`));
});
