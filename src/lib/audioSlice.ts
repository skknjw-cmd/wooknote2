const SAMPLE_RATE = 16000;

export function sliceFloat32(buf: Float32Array, startSec: number, endSec: number): Float32Array {
  const startIdx = Math.floor(startSec * SAMPLE_RATE);
  const endIdx = Math.ceil(endSec * SAMPLE_RATE);
  return buf.subarray(Math.max(0, startIdx), Math.min(buf.length, endIdx));
}

export function flattenPCM(chunks: Float32Array[], startSample: number, endSample: number): Float32Array {
  let totalLength = 0;
  let cursor = 0;
  for (const chunk of chunks) {
    if (cursor + chunk.length > startSample && cursor < endSample) {
      const from = Math.max(0, startSample - cursor);
      const to = Math.min(chunk.length, endSample - cursor);
      totalLength += to - from;
    }
    cursor += chunk.length;
  }

  const out = new Float32Array(totalLength);
  let outIdx = 0;
  cursor = 0;
  for (const chunk of chunks) {
    if (cursor + chunk.length > startSample && cursor < endSample) {
      const from = Math.max(0, startSample - cursor);
      const to = Math.min(chunk.length, endSample - cursor);
      out.set(chunk.subarray(from, to), outIdx);
      outIdx += to - from;
    }
    cursor += chunk.length;
  }
  return out;
}

export { SAMPLE_RATE };
