'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function toBigIntLE(buf) {
  const reversed = Buffer.from(buf);
  reversed.reverse();
  const hex = reversed.toString('hex');
  return hex.length === 0 ? 0n : BigInt(`0x${hex}`);
}
exports.toBigIntLE = toBigIntLE;

function toBigIntBE(buf) {
  const hex = Buffer.from(buf).toString('hex');
  return hex.length === 0 ? 0n : BigInt(`0x${hex}`);
}
exports.toBigIntBE = toBigIntBE;

function toBufferLE(num, width) {
  const hex = num.toString(16);
  const buffer = Buffer.from(hex.padStart(width * 2, '0').slice(0, width * 2), 'hex');
  buffer.reverse();
  return buffer;
}
exports.toBufferLE = toBufferLE;

function toBufferBE(num, width) {
  const hex = num.toString(16);
  return Buffer.from(hex.padStart(width * 2, '0').slice(0, width * 2), 'hex');
}
exports.toBufferBE = toBufferBE;
