// Minimal reader for zip archives, enough for .docx and .pptx (zip files of XML). No dependency:
// the central directory is read by hand and entries are inflated with node:zlib.
// Not supported, and reported as such: zip64, multi-disk archives, encrypted entries.
import { inflateRawSync } from "node:zlib";

export class ZipError extends Error {
  /** "encrypted" when the archive is password-protected, otherwise "corrupt". */
  reason: "corrupt" | "encrypted";
  constructor(reason: "corrupt" | "encrypted", message: string) {
    super(message);
    this.reason = reason;
  }
}

interface Entry {
  name: string;
  method: number;
  flags: number;
  compressedSize: number;
  size: number;
  offset: number;
}

export interface Zip {
  names: string[];
  /** The inflated bytes of an entry, or null when the archive has no entry of that name. */
  read(name: string): Buffer | null;
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/**
 * Opens a zip archive held in memory. `maxEntryBytes` bounds what one entry may inflate to, so a
 * small upload cannot expand into something huge.
 */
export function openZip(bytes: Uint8Array, maxEntryBytes = 40 * 1024 * 1024): Zip {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end-of-central-directory record sits at the end, followed by a comment of at most 65535 bytes.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError("corrupt", "No zip directory found.");
  const count = buf.readUInt16LE(eocd + 10);
  const dirSize = buf.readUInt32LE(eocd + 12);
  const dirOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || dirOffset === 0xffffffff) throw new ZipError("corrupt", "zip64 archives are not supported.");
  if (dirOffset + dirSize > buf.length) throw new ZipError("corrupt", "The zip directory is cut off.");

  const entries = new Map<string, Entry>();
  let at = dirOffset;
  for (let k = 0; k < count; k++) {
    if (at + 46 > buf.length || buf.readUInt32LE(at) !== CENTRAL) throw new ZipError("corrupt", "The zip directory is damaged.");
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const name = buf.toString("utf8", at + 46, at + 46 + nameLen);
    entries.set(name, { name, flags: buf.readUInt16LE(at + 8), method: buf.readUInt16LE(at + 10), compressedSize: buf.readUInt32LE(at + 20), size: buf.readUInt32LE(at + 24), offset: buf.readUInt32LE(at + 42) });
    at += 46 + nameLen + extraLen + commentLen;
  }

  return {
    names: [...entries.keys()],
    read(name) {
      const e = entries.get(name);
      if (!e) return null;
      if (e.flags & 1) throw new ZipError("encrypted", `${name} is encrypted.`);
      if (e.size > maxEntryBytes) throw new ZipError("corrupt", `${name} is larger than this reader accepts.`);
      if (e.offset + 30 > buf.length || buf.readUInt32LE(e.offset) !== LOCAL) throw new ZipError("corrupt", `${name} has no valid header.`);
      const start = e.offset + 30 + buf.readUInt16LE(e.offset + 26) + buf.readUInt16LE(e.offset + 28);
      const data = buf.subarray(start, start + e.compressedSize);
      if (data.length !== e.compressedSize) throw new ZipError("corrupt", `${name} is cut off.`);
      if (e.method === 0) return Buffer.from(data);
      if (e.method !== 8) throw new ZipError("corrupt", `${name} uses an unsupported compression method.`);
      try {
        return inflateRawSync(data, { maxOutputLength: maxEntryBytes });
      } catch {
        throw new ZipError("corrupt", `${name} could not be unpacked.`);
      }
    },
  };
}
