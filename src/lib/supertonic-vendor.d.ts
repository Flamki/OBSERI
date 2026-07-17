import type * as ort from "onnxruntime-web";

export class Style {
  ttl: ort.Tensor;
  dp: ort.Tensor;
}

export class TextToSpeech {
  sampleRate: number;
  call(
    text: string,
    lang: string,
    style: Style,
    totalStep: number,
    speed?: number,
    silenceDuration?: number,
    progressCallback?: ((step: number, total: number) => void) | null,
  ): Promise<{ wav: number[]; duration: number[] }>;
}

export function loadVoiceStyle(paths: string[], verbose?: boolean): Promise<Style>;
export function loadTextToSpeech(
  onnxDir: string,
  sessionOptions?: ort.InferenceSession.SessionOptions,
  progressCallback?: ((name: string, index: number, total: number) => void) | null,
): Promise<{ textToSpeech: TextToSpeech; cfgs: unknown }>;
export function writeWavFile(audioData: number[], sampleRate: number): ArrayBuffer;
