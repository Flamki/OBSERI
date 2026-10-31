import { test, expect } from "@playwright/test";
import { createSoul } from "../../src/lib/soul";

function silentWav() {
  const frames = 4410;
  const wav = Buffer.alloc(44 + frames * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(44100, 24);
  wav.writeUInt32LE(88200, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(frames * 2, 40);
  return wav;
}

test("voice calls synthesize whole sentences and ending a call cancels pending audio", async ({
  page,
}) => {
  const soul = createSoul("https://merchant.example");
  const first =
    "I build websites and AI applications that help businesses answer questions and connect with their customers.";
  const second = "Tell me about your project and I can suggest the right approach.";
  await page.addInitScript(() => {
    window.name = JSON.stringify({
      session: "test-session",
      parentOrigin: "http://127.0.0.1:8080",
    });
    class Recognition {
      onresult: ((event: unknown) => void) | null = null;
      start() {
        (window as any).testTranscript = (text: string) =>
          this.onresult?.({
            results: [Object.assign([{ transcript: text }], { isFinal: true })],
          });
      }
      stop() {}
      abort() {}
    }
    (window as any).SpeechRecognition = Recognition;
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      (window as any).audioPlayCount = ((window as any).audioPlayCount || 0) + 1;
      return originalPlay.call(this);
    };
  });
  await page.route(`**/api/souls/${soul.id}`, (route) => route.fulfill({ json: { soul } }));
  await page.route("**/api/souls/*/conversations", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await page.route("**/api/chat/stream", (route) =>
    route.fulfill({
      contentType: "application/x-ndjson",
      body:
        [first.slice(0, 75), first.slice(75) + " ", second]
          .map((text) => JSON.stringify({ type: "delta", text }))
          .join("\n") + "\n",
    }),
  );
  const requests: { text: string; qualitySteps: number }[] = [];
  let holdAudio = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/voice/speak", async (route) => {
    requests.push(route.request().postDataJSON());
    if (holdAudio) await gate;
    await route.fulfill({ contentType: "audio/wav", body: silentWav() }).catch(() => undefined);
  });
  await page.goto(`/widget/${soul.id}?mode=voice`);
  await page.getByRole("button", { name: "Start voice call", exact: true }).click();
  await expect(page.getByText("Listening...", { exact: true })).toBeVisible();
  await page.evaluate(() => (window as any).testTranscript("What do you build?"));
  await expect
    .poll(() => requests.filter((r) => r.text !== soul.personality.greeting).length)
    .toBe(2);
  expect(requests.filter((r) => r.text !== soul.personality.greeting)).toEqual([
    expect.objectContaining({ text: first, qualitySteps: 5 }),
    expect.objectContaining({ text: second, qualitySteps: 5 }),
  ]);
  await expect(page.getByText("Listening...", { exact: true })).toBeVisible();
  const before = await page.evaluate(() => (window as any).audioPlayCount);
  holdAudio = true;
  const count = requests.length;
  await page.evaluate(() => (window as any).testTranscript("Tell me more."));
  await expect.poll(() => requests.length).toBe(count + 1);
  await page.getByRole("button", { name: "End voice call", exact: true }).click();
  release();
  await expect(page.getByRole("button", { name: "Start voice call", exact: true })).toBeVisible();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => (window as any).audioPlayCount)).toBe(before);
  expect(requests.length).toBe(count + 1);
  await expect(page.getByText(/temporarily unavailable/)).toHaveCount(0);
});
