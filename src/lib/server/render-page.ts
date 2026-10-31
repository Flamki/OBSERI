import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { assertPublicHttpUrlResolved, ScanError } from "../scanner";

/** A fresh browser per page: no cookies, storage or authenticated sessions are shared. */
export async function renderPublicPage(url: string, parentSignal?: AbortSignal) {
  await assertPublicHttpUrlResolved(url);
  const signal = AbortSignal.any([
    AbortSignal.timeout(25_000),
    ...(parentSignal ? [parentSignal] : []),
  ]);
  signal.throwIfAborted();
  const executablePath =
    process.env.OBSERI_CHROMIUM_PATH ||
    (process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : await chromium.executablePath());
  const browser = await puppeteer.launch({
    executablePath,
    args: [
      ...(process.platform === "linux" ? chromium.args : []),
      "--disable-dev-shm-usage",
      "--disable-quic",
      "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
    ],
    headless: true,
    timeout: 15_000,
  });
  const abort = () => {
    void browser.close().catch(() => undefined);
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    const page = await browser.newPage();
    await page.setBypassServiceWorker(true);
    await page.setUserAgent("ObseriBot/1.0 (+https://obseri.com; website knowledge crawler)");
    await page.setViewport({ width: 1280, height: 900 });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(window, "WebSocket", {
        value: class {
          constructor() {
            throw new Error("Unavailable in crawler");
          }
        },
      });
      Object.defineProperty(window, "RTCPeerConnection", { value: undefined });
    });
    await page.setRequestInterception(true);
    let requests = 0;
    const checked = new Map<string, Promise<string>>();
    page.on("request", (request) => {
      void (async () => {
        try {
          if (
            ++requests > 160 ||
            signal.aborted ||
            !["GET", "HEAD"].includes(request.method()) ||
            ["image", "media", "font", "websocket"].includes(request.resourceType())
          ) {
            await request.abort();
            return;
          }
          const target = new URL(request.url());
          if (
            !["https:", "http:"].includes(target.protocol) ||
            (target.port && !["80", "443"].includes(target.port))
          ) {
            await request.abort();
            return;
          }
          // Check every redirect and subresource; never allow localhost/metadata/private DNS targets.
          let validation = checked.get(target.origin);
          if (!validation) {
            validation = assertPublicHttpUrlResolved(target.origin);
            checked.set(target.origin, validation);
          }
          await validation;
          await request.continue();
        } catch {
          await request.abort().catch(() => undefined);
        }
      })();
    });
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
    if (!response?.ok())
      throw new ScanError(
        `Browser source returned HTTP ${response?.status() ?? 0}.`,
        502,
        "render_failed",
      );
    await page.waitForNetworkIdle({ idleTime: 600, timeout: 5_000 }).catch(() => undefined);
    await page
      .waitForFunction(() => (document.body?.innerText.trim().length ?? 0) >= 40, {
        timeout: 4_000,
      })
      .catch(() => undefined);
    signal.throwIfAborted();
    const finalUrl = await assertPublicHttpUrlResolved(page.url());
    const result = await page.evaluate(() => {
      for (const element of document.querySelectorAll("script,style,noscript,svg,canvas,template"))
        element.remove();
      return {
        title: document.title,
        text: (document.body?.innerText ?? "").slice(0, 120_001),
        links: Array.from(
          document.querySelectorAll("a[href]"),
          (a) => (a as HTMLAnchorElement).href,
        ).slice(0, 500),
      };
    });
    return { ...result, finalUrl };
  } finally {
    signal.removeEventListener("abort", abort);
    await browser.close().catch(() => undefined);
  }
}
