/**
 * Live audio levels for the voice widget: the visitor's microphone (for the orb and for
 * talk-over detection) and the agent's own voice output (so the orb moves with real speech).
 * Everything degrades gracefully: without Web Audio or microphone access, levels read 0 and
 * callers fall back to simulated motion.
 */

type WebkitWindow = typeof window & { webkitAudioContext?: typeof AudioContext };

let context: AudioContext | null = null;
let inputAnalyser: AnalyserNode | null = null;
let outputAnalyser: AnalyserNode | null = null;
let micStream: MediaStream | null = null;
let micSource: MediaStreamAudioSourceNode | null = null;
let buffer: Uint8Array<ArrayBuffer> | null = null;
const tapped = new WeakSet<HTMLMediaElement>();

/** Root-mean-square level of 8-bit time-domain samples, scaled to 0–1. */
export function rmsLevel(samples: ArrayLike<number>): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const centered = (samples[index] - 128) / 128;
    sum += centered * centered;
  }
  return Math.min(1, Math.sqrt(sum / samples.length) * 4);
}

function audioContext(): AudioContext | null {
  if (context) return context;
  if (typeof window === "undefined") return null;
  const Constructor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
  if (!Constructor) return null;
  try {
    context = new Constructor();
    outputAnalyser = context.createAnalyser();
    outputAnalyser.fftSize = 512;
    outputAnalyser.smoothingTimeConstant = 0.6;
    outputAnalyser.connect(context.destination);
  } catch {
    context = null;
  }
  return context;
}

/** Call from a user gesture (the Call button) so audio is allowed to start. */
export async function resumeAudio(): Promise<void> {
  const ctx = audioContext();
  if (ctx && ctx.state !== "running") await ctx.resume().catch(() => undefined);
}

/** Opens the microphone with echo cancellation. Returns false when unavailable or denied. */
export async function startMicMeter(): Promise<boolean> {
  const ctx = audioContext();
  if (!ctx || !navigator.mediaDevices?.getUserMedia) return false;
  if (micStream) return true;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    micSource = ctx.createMediaStreamSource(micStream);
    inputAnalyser = ctx.createAnalyser();
    inputAnalyser.fftSize = 512;
    inputAnalyser.smoothingTimeConstant = 0.5;
    micSource.connect(inputAnalyser);
    return true;
  } catch {
    stopMicMeter();
    return false;
  }
}

export function stopMicMeter(): void {
  micSource?.disconnect();
  micSource = null;
  inputAnalyser = null;
  micStream?.getTracks().forEach((track) => track.stop());
  micStream = null;
}

function read(analyser: AnalyserNode | null): number {
  if (!analyser) return 0;
  if (!buffer || buffer.length !== analyser.fftSize) {
    buffer = new Uint8Array(new ArrayBuffer(analyser.fftSize));
  }
  analyser.getByteTimeDomainData(buffer);
  return rmsLevel(buffer);
}

export function inputLevel(): number {
  return read(inputAnalyser);
}

export function outputLevel(): number {
  return read(outputAnalyser);
}

export function micMeterActive(): boolean {
  return Boolean(inputAnalyser);
}

/**
 * Routes an audio element through the output analyser so the orb follows the real voice.
 * Skipped unless the audio context is running, because a suspended context would mute it.
 */
export function tapOutput(audio: HTMLMediaElement): boolean {
  const ctx = context;
  if (!ctx || !outputAnalyser || ctx.state !== "running" || tapped.has(audio)) return false;
  try {
    ctx.createMediaElementSource(audio).connect(outputAnalyser);
    tapped.add(audio);
    return true;
  } catch {
    return false;
  }
}

/** A short, quiet two-note cue for call start and end. */
export function playCue(kind: "connect" | "disconnect"): void {
  const ctx = context;
  if (!ctx || ctx.state !== "running") return;
  const notes = kind === "connect" ? [587.33, 880] : [659.25, 440];
  notes.forEach((frequency, index) => {
    const start = ctx.currentTime + index * 0.11;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.05, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.24);
  });
}
