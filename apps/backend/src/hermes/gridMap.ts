/** Slamware explore map: little-endian 36-byte header followed by signed 8-bit cells. */
export function parseExploreMap(bytes: Uint8Array) {
  if (bytes.byteLength < 36) throw new Error('Hermes map header is incomplete');
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const x = data.getFloat32(0, true);
  const y = data.getFloat32(4, true);
  const width = data.getUint32(8, true);
  const height = data.getUint32(12, true);
  const resolution = data.getFloat32(16, true);
  const size = data.getUint32(32, true);
  if (![x, y, resolution].every(Number.isFinite) || resolution <= 0
    || width === 0 || height === 0 || size !== width * height
    || size > 20_000_000 || bytes.byteLength !== 36 + size) {
    throw new Error('Hermes map dimensions or payload are invalid');
  }
  return { x, y, width, height, resolution,
    cellsBase64: Buffer.from(bytes.subarray(36)).toString('base64') };
}
