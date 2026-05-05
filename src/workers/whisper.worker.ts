import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = false;

type WhisperMessage =
  | { type: "init" }
  | { type: "transcribe"; pcm: Float32Array };

type WorkerResult =
  | { type: "download_progress"; file: string; progress: number; loaded: number; total: number }
  | { type: "ready" }
  | { type: "result"; segments: { start: number; end: number; text: string }[]; text: string }
  | { type: "error"; message: string };

let pipe: Awaited<ReturnType<typeof pipeline>> | null = null;

async function init() {
  // onnx-community/ models compiled for ort 1.20+
  // fp32: avoids MatMulNBits/QDQ optimizations that fail on ort 1.26.0-dev
  const modelId =
    navigator.hardwareConcurrency <= 4
      ? "onnx-community/whisper-tiny"
      : "onnx-community/whisper-base";

  pipe = await pipeline("automatic-speech-recognition", modelId, {
    dtype: "fp32",
    progress_callback: (p: unknown) => {
      const info = p as { file?: string; progress?: number; loaded?: number; total?: number };
      self.postMessage({
        type: "download_progress",
        file: info.file ?? "",
        progress: info.progress ?? 0,
        loaded: info.loaded ?? 0,
        total: info.total ?? 0,
      } satisfies WorkerResult);
    },
  });

  self.postMessage({ type: "ready" } satisfies WorkerResult);
}

async function transcribe(pcm: Float32Array) {
  if (!pipe) {
    self.postMessage({ type: "error", message: "Model not initialized" } satisfies WorkerResult);
    return;
  }

  try {
    const result = await (pipe as (input: Float32Array, options: object) => Promise<{ chunks?: { timestamp: [number, number]; text: string }[]; text: string }>)(pcm, {
      language: "korean",
      task: "transcribe",
      return_timestamps: true,
      chunk_length_s: 30,
    });

    const segments = (result.chunks ?? []).map((c) => ({
      start: c.timestamp[0] ?? 0,
      end: c.timestamp[1] ?? c.timestamp[0] ?? 0,
      text: c.text,
    }));

    self.postMessage({ type: "result", segments, text: result.text } satisfies WorkerResult);
  } catch (err) {
    self.postMessage({ type: "error", message: String(err) } satisfies WorkerResult);
  }
}

self.onmessage = async (e: MessageEvent<WhisperMessage>) => {
  const msg = e.data;
  if (msg.type === "init") {
    try {
      await init();
    } catch (err) {
      self.postMessage({ type: "error", message: `모델 초기화 실패: ${String(err)}` } satisfies WorkerResult);
    }
  } else if (msg.type === "transcribe") {
    await transcribe(msg.pcm);
  }
};
