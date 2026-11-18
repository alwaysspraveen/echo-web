// Speech-to-text on this device with Whisper (transformers.js). The model downloads once
// (~80 MB) and is then cached by the browser, so later searches work instantly.
import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

const MODEL = 'onnx-community/whisper-base';
let asr: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

function load() {
  asr ??= (async () => {
    const progress = (p: { status: string; progress?: number; file?: string }) => {
      if (p.status === 'progress' && p.file?.endsWith('.onnx')) self.postMessage({ type: 'progress', progress: p.progress ?? 0 });
    };
    const make = (device: 'webgpu' | 'wasm') =>
      pipeline('automatic-speech-recognition', MODEL, {
        device,
        dtype: device === 'webgpu' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8',
        progress_callback: progress,
      }) as Promise<AutomaticSpeechRecognitionPipeline>;
    const hasGpu = 'gpu' in navigator && !!(await (navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter().catch(() => null));
    return hasGpu ? make('webgpu').catch(() => make('wasm')) : make('wasm');
  })();
  asr.catch(() => { asr = null; });
  return asr;
}

self.onmessage = async (e: MessageEvent<{ type: 'warm' } | { type: 'transcribe'; id: number; audio: Float32Array }>) => {
  const msg = e.data;
  try {
    if (msg.type === 'warm') { await load(); self.postMessage({ type: 'ready' }); return; }
    const run = await load();
    self.postMessage({ type: 'ready' });
    const out = await run(msg.audio, { task: 'transcribe', chunk_length_s: 30 });
    const text = (Array.isArray(out) ? out[0] : out).text;
    self.postMessage({ type: 'result', id: msg.id, text });
  } catch (err) {
    self.postMessage({ type: 'error', id: 'id' in msg ? msg.id : -1, message: String(err) });
  }
};
