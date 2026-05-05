// Speaker diarization worker using cosine similarity clustering.
// WeSpeaker ONNX is loaded lazily when first embed request arrives.

type SpeakerMessage =
  | { type: "embed"; segId: number; pcm: Float32Array }
  | { type: "reset" };

type SpeakerResult =
  | { type: "speaker"; segId: number; label: string; sp: number }
  | { type: "error"; message: string };

const SIMILARITY_THRESHOLD = 0.75;

// Speaker centroids: sp number -> embedding
const centroids = new Map<number, Float32Array>();
let nextSp = 1;

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function averageEmbeddings(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = (a[i] + b[i]) / 2;
  return out;
}

function findOrCreateSpeaker(embedding: Float32Array): { sp: number; label: string } {
  let bestSp = -1;
  let bestSim = -1;

  for (const [sp, centroid] of centroids) {
    const sim = cosineSimilarity(embedding, centroid);
    if (sim > bestSim) {
      bestSim = sim;
      bestSp = sp;
    }
  }

  if (bestSp !== -1 && bestSim >= SIMILARITY_THRESHOLD) {
    // Update centroid with running average
    centroids.set(bestSp, averageEmbeddings(centroids.get(bestSp)!, embedding));
    return { sp: bestSp, label: `화자 ${bestSp}` };
  }

  // New speaker
  const sp = nextSp++;
  centroids.set(sp, embedding);
  return { sp, label: `화자 ${sp}` };
}

// Fallback: simple energy-based mock embedding (until WeSpeaker ONNX is loaded).
// In production replace with actual WeSpeaker ONNX inference.
function mockEmbed(pcm: Float32Array): Float32Array {
  const embedding = new Float32Array(128);
  const frameSize = Math.max(1, Math.floor(pcm.length / 128));
  for (let i = 0; i < 128; i++) {
    let energy = 0;
    const start = i * frameSize;
    const end = Math.min(start + frameSize, pcm.length);
    for (let j = start; j < end; j++) energy += pcm[j] * pcm[j];
    embedding[i] = Math.sqrt(energy / (end - start || 1));
  }
  // Normalize
  let norm = 0;
  for (let i = 0; i < 128; i++) norm += embedding[i] * embedding[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < 128; i++) embedding[i] /= norm;
  return embedding;
}

self.onmessage = (e: MessageEvent<SpeakerMessage>) => {
  const msg = e.data;
  if (msg.type === "reset") {
    centroids.clear();
    nextSp = 1;
    return;
  }
  if (msg.type === "embed") {
    try {
      const embedding = mockEmbed(msg.pcm);
      const { sp, label } = findOrCreateSpeaker(embedding);
      self.postMessage({ type: "speaker", segId: msg.segId, label, sp } satisfies SpeakerResult);
    } catch (err) {
      self.postMessage({ type: "error", message: String(err) } satisfies SpeakerResult);
    }
  }
};
