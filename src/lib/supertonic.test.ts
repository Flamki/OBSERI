import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authFetch } = vi.hoisted(() => ({ authFetch: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({ authFetch }));
import { fetchSupertonicAudio, playSupertonicAudio, stopSupertonic } from "./supertonic";

class TestAudio {
  static instances: TestAudio[] = [];
  ended = false;
  onended: (() => void) | null = null;
  onpause: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn(async () => undefined);
  pause = vi.fn(() => this.onpause?.());
  removeAttribute = vi.fn();
  load = vi.fn();
  constructor() {
    TestAudio.instances.push(this);
  }
}

beforeEach(() => {
  TestAudio.instances = [];
  vi.stubGlobal("Audio", TestAudio);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-audio");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  authFetch.mockReset();
});
afterEach(() => {
  stopSupertonic();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Neural audio playback lifecycle", () => {
  it("reports playback only after the browser starts and not after cancellation", async () => {
    const started = vi.fn();
    const playback = playSupertonicAudio(new Blob(), started);
    expect(started).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(started).toHaveBeenCalledOnce();
    TestAudio.instances[0].onended?.();
    await playback;

    const cancelledStart = vi.fn();
    const cancelled = playSupertonicAudio(new Blob(), cancelledStart);
    const rejected = expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    stopSupertonic();
    await rejected;
    expect(cancelledStart).not.toHaveBeenCalled();
  });

  it("settles a stopped playback and releases its media resources", async () => {
    const playback = playSupertonicAudio(new Blob());
    const rejected = expect(playback).rejects.toMatchObject({ name: "AbortError" });
    stopSupertonic();
    await rejected;
    expect(TestAudio.instances[0].pause).toHaveBeenCalledOnce();
    expect(TestAudio.instances[0].load).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("allows the natural pause/ended event sequence to complete successfully", async () => {
    const playback = playSupertonicAudio(new Blob());
    const audio = TestAudio.instances[0];
    audio.ended = true;
    audio.onpause?.();
    audio.onended?.();
    await expect(playback).resolves.toBeUndefined();
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("replacing speech settles the previous playback without stopping the new one", async () => {
    const first = playSupertonicAudio(new Blob());
    const stopped = expect(first).rejects.toMatchObject({ name: "AbortError" });
    const second = playSupertonicAudio(new Blob());
    await stopped;
    expect(TestAudio.instances[1].pause).not.toHaveBeenCalled();
    TestAudio.instances[1].onended?.();
    await second;
  });
});

describe("Neural generation requests", () => {
  it("upgrades low quality requests and propagates cancellation to the network", async () => {
    const controller = new AbortController();
    authFetch.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
        }),
    );
    const pending = fetchSupertonicAudio("A real voice response", {
      qualitySteps: 2,
      signal: controller.signal,
    });
    const stopped = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    const init = authFetch.mock.calls[0][1];
    expect(JSON.parse(init.body).qualitySteps).toBe(5);
    controller.abort();
    await stopped;
    expect(init.signal.aborted).toBe(true);
  });
});
