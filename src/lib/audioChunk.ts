const SAMPLE_RATE = 16000;
const CHUNK_DURATION_S = 60;

export function encodeWav(pcm: Float32Array, sampleRate: number): ArrayBuffer {
  const dataSize = pcm.length * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const str = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };

  str(0, "RIFF"); v.setUint32(4, 36 + dataSize, true);
  str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, dataSize, true);

  let off = 44;
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return buf;
}

export async function chunkAudioFile(
  file: File,
  chunkDurationS = CHUNK_DURATION_S,
): Promise<Blob[]> {
  const arrayBuf = await file.arrayBuffer();
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  const audio = await ctx.decodeAudioData(arrayBuf);
  await ctx.close();

  const pcm = audio.getChannelData(0); // mono
  const chunkLen = chunkDurationS * SAMPLE_RATE;
  const chunks: Blob[] = [];

  for (let start = 0; start < pcm.length; start += chunkLen) {
    const slice = pcm.slice(start, Math.min(start + chunkLen, pcm.length));
    chunks.push(new Blob([encodeWav(slice, SAMPLE_RATE)], { type: "audio/wav" }));
  }

  return chunks;
}
