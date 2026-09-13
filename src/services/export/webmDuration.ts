const SEGMENT_ID = 0x18538067;
const INFO_ID = 0x1549a966;
const TIME_SCALE_ID = 0x2ad7b1;
const DURATION_ID = 0x4489;

function vintLength(value: number): number {
  for (let length = 1; length <= 8; length += 1) {
    if (value < 2 ** (7 * length)) return length;
  }
  return 8;
}

function readVint(bytes: Uint8Array, offset: number): { length: number; value: number } | null {
  if (offset >= bytes.length) return null;
  const first = bytes[offset];
  let mask = 0x80;
  let length = 1;
  while (length <= 8 && (first & mask) === 0) {
    mask >>= 1;
    length += 1;
  }
  if (length > 8 || offset + length > bytes.length) return null;
  let value = first & (mask - 1);
  for (let i = 1; i < length; i += 1) value = value * 256 + bytes[offset + i];
  return { length, value };
}

function readId(bytes: Uint8Array, offset: number): { length: number; value: number } | null {
  if (offset >= bytes.length) return null;
  const first = bytes[offset];
  let mask = 0x80;
  let length = 1;
  while (length <= 4 && (first & mask) === 0) {
    mask >>= 1;
    length += 1;
  }
  if (length > 4 || offset + length > bytes.length) return null;
  let value = first;
  for (let i = 1; i < length; i += 1) value = value * 256 + bytes[offset + i];
  return { length, value };
}

function encodeVint(value: number): Uint8Array {
  const length = vintLength(value);
  const bytes = new Uint8Array(length);
  let remaining = value;
  for (let i = length - 1; i >= 0; i -= 1) {
    bytes[i] = remaining & 0xff;
    remaining = Math.floor(remaining / 256);
  }
  bytes[0] |= 1 << (8 - length);
  return bytes;
}

function encodeFloat(value: number): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, value, false);
  return bytes;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function element(id: number, payload: Uint8Array): Uint8Array {
  const idBytes = id <= 0xffffff ? id <= 0xffff ? id <= 0xff ? new Uint8Array([id]) : new Uint8Array([id >> 8, id]) : new Uint8Array([id >> 16, id >> 8, id]) : new Uint8Array([id >>> 24, id >>> 16, id >>> 8, id]);
  return concat(idBytes, encodeVint(payload.length), payload);
}

export async function fixWebmDuration(blob: Blob, durationSeconds: number): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let segmentStart = -1;
  let segmentHeaderEnd = -1;
  let segmentSize: ReturnType<typeof readVint> = null;
  for (let offset = 0; offset < bytes.length - 4; offset += 1) {
    const id = readId(bytes, offset);
    if (id?.value === SEGMENT_ID) {
      segmentStart = offset;
      segmentSize = readVint(bytes, offset + id.length);
      if (segmentSize) segmentHeaderEnd = offset + id.length + segmentSize.length;
      break;
    }
  }
  if (segmentStart < 0 || segmentHeaderEnd < 0 || !segmentSize) return blob;

  const segmentEnd = segmentSize.value === 0x7fffffffffffffff ? bytes.length : Math.min(bytes.length, segmentHeaderEnd + segmentSize.value);
  let infoStart = -1;
  let infoHeaderEnd = -1;
  let infoSize: ReturnType<typeof readVint> = null;
  for (let offset = segmentHeaderEnd; offset < segmentEnd;) {
    const id = readId(bytes, offset);
    const size = id ? readVint(bytes, offset + id.length) : null;
    if (!id || !size) break;
    const payloadStart = offset + id.length + size.length;
    if (id.value === INFO_ID) {
      infoStart = offset;
      infoHeaderEnd = payloadStart;
      infoSize = size;
      break;
    }
    if (size.value === 0x7fffffffffffffff) break;
    offset = payloadStart + size.value;
  }
  if (infoStart < 0 || infoHeaderEnd < 0 || !infoSize) return blob;

  const infoEnd = Math.min(bytes.length, infoHeaderEnd + infoSize.value);
  const infoPayload = bytes.slice(infoHeaderEnd, infoEnd);
  let timeScale = 1_000_000;
  let durationOffset = -1;
  let durationPayloadStart = -1;
  let durationPayloadSize = 0;
  for (let offset = 0; offset < infoPayload.length;) {
    const id = readId(infoPayload, offset);
    const size = id ? readVint(infoPayload, offset + id.length) : null;
    if (!id || !size || size.value === 0x7fffffffffffffff) break;
    const payloadStart = offset + id.length + size.length;
    if (id.value === TIME_SCALE_ID && size.value > 0 && size.value <= 4) {
      timeScale = 0;
      for (let i = 0; i < size.value; i += 1) timeScale = timeScale * 256 + infoPayload[payloadStart + i];
    }
    if (id.value === DURATION_ID) {
      durationOffset = offset;
      durationPayloadStart = payloadStart;
      durationPayloadSize = size.value;
      break;
    }
    offset = payloadStart + size.value;
  }

  const duration = durationSeconds * 1_000_000 / timeScale;
  const replacement = element(DURATION_ID, encodeFloat(duration));
  const nextInfoPayload = durationOffset >= 0
    ? concat(infoPayload.slice(0, durationOffset), replacement, infoPayload.slice(durationPayloadStart + durationPayloadSize))
    : concat(replacement, infoPayload);
  const nextInfo = concat(new Uint8Array([0x15, 0x49, 0xa9, 0x66]), encodeVint(nextInfoPayload.length), nextInfoPayload);
  const beforeInfo = bytes.slice(0, infoStart);
  const afterInfo = bytes.slice(infoEnd);
  return new Blob([concat(beforeInfo, nextInfo, afterInfo)], { type: blob.type || "video/webm" });
}
