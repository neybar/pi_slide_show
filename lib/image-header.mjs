// Pixel dimensions from image headers only (never a full decode). Used to tell the
// browser how big an original is before it downloads it. Returns null when unknown.

const MAX_JPEG_SEGMENTS = 64; // header walk limit; a SOF normally comes within a handful

/**
 * Raw (pre-EXIF-rotation) dimensions of a PNG, GIF or WebP from the file head.
 * @param {Buffer} buf
 * @returns {{width:number,height:number}|null}
 */
export function dimensionsFromHead(buf) {
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47 && buf.toString('latin1', 12, 16) === 'IHDR') {
    return ok(buf.readUInt32BE(16), buf.readUInt32BE(20));
  }
  if (buf.length >= 10 && buf.toString('latin1', 0, 3) === 'GIF') {
    return ok(buf.readUInt16LE(6), buf.readUInt16LE(8));
  }
  if (buf.length >= 30 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    const kind = buf.toString('latin1', 12, 16);
    if (kind === 'VP8X') return ok(buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1);
    if (kind === 'VP8L' && buf[20] === 0x2f) {
      const b = buf.readUInt32LE(21);
      return ok((b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1);
    }
    if (kind === 'VP8 ' && buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a) {
      return ok(buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff);
    }
  }
  return null;
}

/**
 * Raw dimensions of a JPEG by walking marker segments to the first SOF. Segments
 * past the buffer are fetched with readAt(offset, length) -> Buffer, so a large
 * EXIF or ICC block does not hide the SOF.
 * @param {Buffer} head - File head starting at offset 0
 * @param {(offset:number, length:number) => Promise<Buffer>} readAt
 * @returns {Promise<{width:number,height:number}|null>}
 */
export async function jpegDimensions(head, readAt) {
  if (head.length < 4 || head[0] !== 0xff || head[1] !== 0xd8) return null;
  let pos = 2;
  for (let i = 0; i < MAX_JPEG_SEGMENTS; i++) {
    const hdr = pos + 4 <= head.length ? head.subarray(pos, pos + 4) : await readAt(pos, 4);
    if (hdr.length < 4 || hdr[0] !== 0xff) return null;
    const marker = hdr[1];
    if (marker === 0xff) { pos += 1; continue; }            // fill byte
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { pos += 2; continue; }
    if (marker === 0xd9 || marker === 0xda) return null;    // EOI / SOS before any SOF
    const len = hdr.readUInt16BE(2);
    if (len < 2) return null;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      const seg = pos + 9 <= head.length ? head.subarray(pos, pos + 9) : await readAt(pos, 9);
      if (seg.length < 9) return null;
      return ok(seg.readUInt16BE(7), seg.readUInt16BE(5));
    }
    pos += 2 + len;
  }
  return null;
}

function ok(width, height) {
  return width > 0 && height > 0 ? { width, height } : null;
}
