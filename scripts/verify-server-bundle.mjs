import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

// Native optional dependencies are loaded dynamically by canvas and can escape
// Nitro's trace. Copy the builder's exact platform package, then test without
// access to this repository's node_modules. Failure blocks deployment.
const require = createRequire(import.meta.url);
const canvasRequire = createRequire(require.resolve("@napi-rs/canvas"));
const canvasPackage = canvasRequire("./package.json");
const server = resolve(".vercel/output/functions/__server.func");
let copied = 0;
for (const name of Object.keys(canvasPackage.optionalDependencies ?? {})) {
  let entry;
  try { entry = canvasRequire.resolve(name); } catch { continue; }
  await cp(dirname(entry), join(server, "node_modules", name), { recursive: true });
  copied++;
}
if (!copied) throw new Error("PDF native runtime is missing from the build environment.");

const isolated = await mkdtemp(join(tmpdir(), "obseri-bundle-check-"));
try {
  await cp(join(server, "node_modules"), join(isolated, "node_modules"), { recursive: true });
  await cp("scripts/fixtures/knowledge.pdf", join(isolated, "knowledge.pdf"));
  await writeFile(join(isolated, "check.mjs"), `
    import assert from 'node:assert/strict';
    import { PDFParse } from 'pdf-parse';
    import puppeteer from 'puppeteer-core';
    import chromium from '@sparticuz/chromium';
    import { access, readFile } from 'node:fs/promises';
    import { createRequire } from 'node:module';
    import { dirname, join } from 'node:path';
    const parser = new PDFParse({data: new Uint8Array(await readFile('knowledge.pdf')), verbosity: 0});
    try { assert.match((await parser.getText()).text, /Bundle extraction works/); }
    finally { await parser.destroy(); }
    assert.equal(typeof puppeteer.launch, 'function');
    const require = createRequire(import.meta.url);
    await access(join(dirname(require.resolve('@sparticuz/chromium')), '../bin/chromium.br'));
    if (process.platform === 'linux') {
      const browser = await puppeteer.launch({args: chromium.args, executablePath: await chromium.executablePath(), headless: true});
      try {
        const page = await browser.newPage();
        await page.setContent('<div id="result"></div><script>document.getElementById("result").textContent="Rendered successfully"</script>');
        assert.equal(await page.$eval('#result', el => el.textContent), 'Rendered successfully');
      } finally { await browser.close(); }
    }
    console.log('Isolated deployment bundle: PDF extraction and browser runtime passed.');
  `);
  execFileSync(process.execPath, [join(isolated, "check.mjs")], {
    cwd: isolated, stdio: "inherit", timeout: 60_000,
    env: { ...process.env, NODE_PATH: "" },
  });
} finally {
  await rm(isolated, { recursive: true, force: true });
}
