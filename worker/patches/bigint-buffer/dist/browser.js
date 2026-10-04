'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function toBigIntLE(buf) {
  const reversed = Uint8Array.from(buf).reverse();
  const hex = Array.from(reversed, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return hex.length === 0 ? 0n : BigInt(`0x${hex}`);
}
exports.toBigIntLE = toBigIntLE;

function toBigIntBE(buf) {
  const hex = Array.from(buf, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return hex.length === 0 ? 0n : BigInt(`0x${hex}`);
}
exports.toBigIntBE = toBigIntBE;

function toBufferLE(num, width) {
  const hex = num.toString(16);
  return Uint8Array.from(
    Array.from(hex.padStart(width * 2, '0').slice(0, width * 2).matchAll(/.{2}/g), ([part]) => parseInt(part, 16)),
  ).reverse();
}
exports.toBufferLE = toBufferLE;

function toBufferBE(num, width) {
  const hex = num.toString(16);
  return Uint8Array.from(
    Array.from(hex.padStart(width * 2, '0').slice(0, width * 2).matchAll(/.{2}/g), ([part]) => parseInt(part, 16)),
  );
}
exports.toBufferBE = toBufferBE;
