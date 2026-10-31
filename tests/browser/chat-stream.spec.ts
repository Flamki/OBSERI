import { test, expect, type Page } from "@playwright/test";
import type { ChatStreamEvent } from "../../src/lib/chat-stream";
import { createSoul } from "../../src/lib/soul";

declare global {
  interface Window {
    __chatRequest: { chunks: unknown[] };
    __answerEvent: (event: ChatStreamEvent) => void;
    __tts: Array<{ text: string; qualitySteps: number }>;
    __spoken: string[];
    __recognition: { onresult: ((event: unknown) => void) | null };
    __voiceEvent: (event: unknown) => void;
    __closeVoiceStream: () => void;
  }
}

async function widget(page: Page) {
  const soul = createSoul("https://merchant.example");
  await page.addInitScript(() => {
    window.name = JSON.stringify({
      session: "test-session",
      parentOrigin: location.origin,
      path: "/",
    });
  });
  await page.route(/neonauth.*\/auth\//, (route) => route.fulfill({ json: null }));
  await page.route(`**/api/souls/${soul.id}`, (route) => route.fulfill({ json: { soul } }));
  await page.route("**/api/souls/*/conversations*", (route) =>
    route.fulfill({ json: { accepted: true } }),
  );
  return soul;
}

test("text appears while the model is still answering, with sources only after validation", async ({
  page,
}) => {
  const soul = await widget(page);
  await page.addInitScript(() => {
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      if (String(input) !== "/api/chat") return realFetch(input, init);
      window.__chatRequest = JSON.parse(String(init?.body));
      return new Response(
        new ReadableStream({
          start(controller) {
            window.__answerEvent = (event: unknown) =>
              controller.enqueue(new TextEncoder().encode(JSON.stringify(event) + "\n"));
            window.__answerEvent({ type: "answer", text: "We build websites" });
          },
        }),
        { headers: { "content-type": "application/x-ndjson" } },
      );
    };
  });
  await page.goto(`/widget/${soul.id}?mode=chat`);
  await page.getByPlaceholder("Ask this website...").fill("What do you build?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("We build websites", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send message" })).toBeDisabled();
  expect(await page.evaluate(() => window.__chatRequest.chunks)).toEqual([]);
  await expect(page.getByText(/is thinking/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Services" })).toHaveCount(0);
  await page.evaluate(() =>
    window.__answerEvent({
      type: "result",
      result: {
        answer: "We build websites for businesses.",
        citations: [
          {
            chunkId: "services",
            title: "Services",
            url: "https://merchant.example/services",
            excerpt: "We build websites.",
          },
        ],
        followUp: "",
        leadIntent: "none",
        mode: "model",
      },
    }),
  );
  await expect(page.getByText("We build websites for businesses.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Services/ })).toHaveAttribute(
    "href",
    "https://merchant.example/services",
  );
  await page.getByPlaceholder("Ask this website...").fill("Next question");
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("We build websites", { exact: true })).toBeVisible();
  await page.evaluate(() => window.__answerEvent({ type: "error", message: "Please try again." }));
  await expect(page.getByText("Please try again.")).toBeVisible();
  await expect(page.getByText("We build websites", { exact: true })).toHaveCount(0);
  await expect(page.getByText("We build websites for businesses.", { exact: true })).toBeVisible();
});

test("voice reuses its prepared greeting and starts final speech before the text connection closes", async ({
  page,
}) => {
  const soul = await widget(page);
  await page.addInitScript(() => {
    const w = window;
    w.__spoken = [];
    w.__tts = [];
    Object.defineProperty(w, "Audio", {
      value: class {
        ended = false;
        onended: (() => void) | null = null;
        onpause: (() => void) | null = null;
        onerror = null;
        async play() {
          w.__spoken.push("started");
          queueMicrotask(() => {
            this.ended = true;
            this.onended?.();
          });
        }
        pause() {
          this.onpause?.();
        }
        removeAttribute() {}
        load() {}
      },
    });
    Object.defineProperty(w, "SpeechRecognition", {
      value: class {
        onresult: ((event: unknown) => void) | null = null;
        start() {
          w.__recognition = this;
        }
        stop() {}
        abort() {}
      },
    });
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      if (String(input) === "/api/voice/speak") {
        w.__tts.push(JSON.parse(String(init?.body)));
        return new Response(new Blob(["mock audio"], { type: "audio/wav" }));
      }
      if (String(input) === "/api/chat/stream") {
        return new Response(
          new ReadableStream({
            start(controller) {
              w.__voiceEvent = (event: unknown) =>
                controller.enqueue(new TextEncoder().encode(JSON.stringify(event) + "\n"));
              w.__closeVoiceStream = () => controller.close();
              w.__voiceEvent({ type: "delta", text: "The CMS uses PostgreSQL." });
              // No trailing whitespace: this sentence must flush on done, not EOF.
              w.__voiceEvent({ type: "done" });
            },
          }),
          { headers: { "content-type": "application/x-ndjson" } },
        );
      }
      return realFetch(input, init);
    };
  });
  await page.goto(`/widget/${soul.id}?mode=chat`);
  await page.getByRole("button", { name: "Open voice chat" }).click();
  await expect.poll(() => page.evaluate(() => window.__tts.length)).toBe(1);
  await page.getByRole("button", { name: "Start voice call" }).click();
  await expect.poll(() => page.evaluate(() => window.__spoken.length)).toBe(1);
  expect(await page.evaluate(() => window.__tts.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => Boolean(window.__recognition))).toBe(true);
  await page.evaluate(() =>
    window.__recognition.onresult?.({
      results: [{ 0: { transcript: "Which project uses PostgreSQL?" }, isFinal: true }],
    }),
  );
  await expect.poll(() => page.evaluate(() => window.__tts.length)).toBe(2);
  expect(await page.evaluate(() => window.__tts[1].text)).toBe("The CMS uses PostgreSQL.");
  expect(await page.evaluate(() => window.__tts[1].qualitySteps)).toBe(5);
  await expect.poll(() => page.evaluate(() => window.__spoken.length)).toBe(2);
  await page.evaluate(() => window.__closeVoiceStream());
  await page.getByRole("button", { name: "End voice call" }).click();
});
