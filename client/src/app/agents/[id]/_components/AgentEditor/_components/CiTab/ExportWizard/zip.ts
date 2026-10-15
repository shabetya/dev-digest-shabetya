/**
 * Minimal, dependency-free STORED-method ZIP writer (AC-8: "Copy files as a
 * zip" — no GitHub write). `CiExportInput` has no field for the server to
 * accept a hand-edited file set back, and the server's `export-ci` response
 * is JSON text, not a binary — so the archive is built here, client-side,
 * from the `CiFile[]` the server already returned. STORED (uncompressed) is
 * enough for a handful of small text files and keeps this file small and
 * dependency-free; a real compressor is not worth the weight here.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc = CRC_TABLE[(crc ^ b) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff];
}
function u32(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

export interface ZipEntry {
  path: string;
  contents: string;
}

/** Fixed DOS date/time (2026-01-01 00:00:00) — deterministic, not meaningful for a generated-on-demand archive. */
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

export function buildZip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: number[][] = [];
  const centralParts: number[][] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Array.from(encoder.encode(entry.path));
    const dataBytes = encoder.encode(entry.contents);
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    const localHeader = [
      ...u32(0x04034b50),
      ...u16(20), // version needed
      ...u16(0), // flags
      ...u16(0), // compression: stored
      ...u16(DOS_TIME),
      ...u16(DOS_DATE),
      ...u32(crc),
      ...u32(size), // compressed size
      ...u32(size), // uncompressed size
      ...u16(nameBytes.length),
      ...u16(0), // extra field length
      ...nameBytes,
    ];
    localParts.push(localHeader, Array.from(dataBytes));

    const localHeaderOffset = offset;
    offset += localHeader.length + dataBytes.length;

    centralParts.push([
      ...u32(0x02014b50),
      ...u16(20), // version made by
      ...u16(20), // version needed
      ...u16(0), // flags
      ...u16(0), // compression
      ...u16(DOS_TIME),
      ...u16(DOS_DATE),
      ...u32(crc),
      ...u32(size),
      ...u32(size),
      ...u16(nameBytes.length),
      ...u16(0), // extra field length
      ...u16(0), // comment length
      ...u16(0), // disk number start
      ...u16(0), // internal attrs
      ...u32(0), // external attrs
      ...u32(localHeaderOffset),
      ...nameBytes,
    ]);
  }

  const centralDirStart = offset;
  const centralDirBytes = centralParts.flat();
  const centralDirSize = centralDirBytes.length;

  const endRecord = [
    ...u32(0x06054b50),
    ...u16(0), // disk number
    ...u16(0), // disk with central dir
    ...u16(entries.length), // entries on this disk
    ...u16(entries.length), // total entries
    ...u32(centralDirSize),
    ...u32(centralDirStart),
    ...u16(0), // comment length
  ];

  return new Uint8Array([...localParts.flat(), ...centralDirBytes, ...endRecord]);
}
