#!/usr/bin/env node
/*
  Renders one still picture of each landscape scene into
  public/landscape-stills/<preset>.webp.

  Those stills are what NightLandscape shows instead of the live 3D page for
  visitors who have reduce-motion on, or save-data, or whose browser can't
  draw the scene. Run this again whenever public/landscape.html changes how a
  scene looks, then commit the new images.

    node scripts/make_landscape_stills.mjs                    all seven scenes
    node scripts/make_landscape_stills.mjs night rain         just those
    node scripts/make_landscape_stills.mjs --out /some/dir    write elsewhere
    node scripts/make_landscape_stills.mjs --browser "/path/to/chrome"

  Needs Node 22 or newer (for the built-in WebSocket) and a Chrome, Chromium,
  Brave or Edge on this machine. Nothing is installed and nothing is
  downloaded: the browser is started headless with a throwaway profile, loads
  only the local file public/landscape.html, and drives it over a debugging
  port that listens on this machine only. It draws with the software WebGL
  that ships in the browser, so it works without a graphics card; the flags
  for that have "unsafe" in their names because they are meant for untrusted
  pages, and this page is our own. It takes a few minutes.
*/
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = join(ROOT, "public", "landscape.html");
const PRESETS = ["sunrise", "noon", "sunset", "night", "rain", "storm", "snow"];
const SIZE = { width: 1200, height: 1000 }; // wider than the band, so it can be cropped to any shape
const QUALITY = 70;
const SETTLE_MS = 4000; // after the scene says it is ready, let the first moments of animation pass

const BROWSERS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

function parseArgs(argv) {
  const out = { presets: [], dir: join(ROOT, "public", "landscape-stills"), browser: process.env.CHROME_PATH };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") out.dir = resolve(argv[++i]);
    else if (argv[i] === "--browser") out.browser = argv[++i];
    else if (PRESETS.includes(argv[i])) out.presets.push(argv[i]);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!out.presets.length) out.presets = PRESETS;
  out.browser ||= BROWSERS.find(existsSync);
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (typeof WebSocket === "undefined") throw new Error("This needs Node 22 or newer (it uses the built-in WebSocket).");
  const args = parseArgs(process.argv.slice(2));
  if (!args.browser || !existsSync(args.browser)) throw new Error("No Chrome-type browser found. Pass --browser <path>.");
  if (!existsSync(PAGE)) throw new Error(`Missing ${PAGE}`);
  mkdirSync(args.dir, { recursive: true });

  const profile = mkdtempSync(join(tmpdir(), "hf-stills-"));
  const proc = spawn(
    args.browser,
    [
      "--headless=new",
      "--remote-debugging-port=0", // the browser picks a free port and writes it into the profile
      `--user-data-dir=${profile}`,
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
      "--mute-audio",
      "--no-first-run",
      "--disable-extensions",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  try {
    // The browser writes DevToolsActivePort: line 1 is the port.
    let port;
    for (let i = 0; i < 100 && !port; i++) {
      await sleep(200);
      try {
        port = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0].trim();
      } catch {
        /* not there yet */
      }
    }
    if (!port) throw new Error("The browser did not start.");
    const target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page");
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolveOpen, rejectOpen) => {
      ws.onopen = resolveOpen;
      ws.onerror = rejectOpen;
    });

    let id = 0;
    const pending = new Map();
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pending.has(d.id)) {
        pending.get(d.id)(d);
        pending.delete(d.id);
      }
    };
    const send = (method, params = {}) =>
      new Promise((res) => {
        const i = ++id;
        pending.set(i, res);
        ws.send(JSON.stringify({ id: i, method, params }));
      });
    const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result?.result?.value;

    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", { ...SIZE, deviceScaleFactor: 1, mobile: false });

    for (const preset of args.presets) {
      await send("Page.navigate", { url: `${pathToFileURL(PAGE).href}?variant=${preset}` });
      // The page sets window.__landscapeState once the scene is built.
      let ready = false;
      for (let i = 0; i < 300 && !ready; i++) {
        await sleep(500);
        ready = await evaluate("!!window.__landscapeState");
      }
      if (!ready) throw new Error(`The ${preset} scene never said it was ready.`);
      await sleep(SETTLE_MS);
      const shot = await send("Page.captureScreenshot", { format: "webp", quality: QUALITY });
      if (!shot.result?.data) throw new Error(`No picture came back for ${preset}: ${JSON.stringify(shot.error)}`);
      const file = join(args.dir, `${preset}.webp`);
      const bytes = Buffer.from(shot.result.data, "base64");
      writeFileSync(file, bytes);
      console.log(`${preset.padEnd(8)} ${(bytes.length / 1024).toFixed(0).padStart(4)} KB  ${file}`);
    }
    // Ask the browser to quit properly so its helper processes go with it.
    ws.send(JSON.stringify({ id: ++id, method: "Browser.close" }));
    await sleep(500);
    ws.close();
  } finally {
    proc.kill();
    rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
