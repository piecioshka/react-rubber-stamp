/*
 * Regenerates the README screenshots in docs/screenshots/.
 *
 * Run with `npm run screenshots` (which builds dist/ first, since the stage
 * imports the built bundle rather than the TypeScript sources).
 *
 * Playwright is deliberately NOT a dependency of this package — it is a heavy
 * install for something only the maintainer runs. Instead this drives the
 * headless Chromium shell that Playwright leaves in the shared cache, over the
 * DevTools protocol. If you have never installed Playwright on this machine,
 * run `npx playwright install chromium` once.
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "docs", "screenshots");

/** Shot name -> the `.shot` variant rendered by scripts/shots/stage.js. */
const SHOTS = ["hero", "lengths", "distress", "speckle", "colors", "scale"];

/** Retina, so the grain survives being scaled down on a HiDPI display. */
const SCALE = 2;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

/**
 * Locates the newest chrome-headless-shell in Playwright's browser cache.
 *
 * The cache holds one directory per browser build, so this picks the highest
 * revision rather than assuming a version that will age out.
 */
async function findHeadlessShell() {
  const cache = join(homedir(), "Library", "Caches", "ms-playwright");

  if (!existsSync(cache)) {
    throw new Error(
      `No Playwright browser cache at ${cache}.\nRun: npx playwright install chromium`,
    );
  }

  const builds = (await readdir(cache))
    .filter((name) => name.startsWith("chromium_headless_shell-"))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));

  for (const build of builds) {
    const binary = join(
      cache,
      build,
      "chrome-headless-shell-mac-arm64",
      "chrome-headless-shell",
    );

    if (existsSync(binary)) {
      return binary;
    }
  }

  throw new Error(
    "Found the Playwright cache but no chrome-headless-shell binary.\nRun: npx playwright install chromium",
  );
}

/** Serves the repo root so the stage can import ../../dist/index.js. */
function serveRepo() {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    // Directory URLs resolve to their index.html, the way a static host does.
    const file = join(ROOT, path.endsWith("/") ? `${path}index.html` : path);

    try {
      const body = await readFile(file);
      res.writeHead(200, {
        "content-type": MIME[extname(file)] ?? "application/octet-stream",
      });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, port: server.address().port }),
    );
  });
}

/** Minimal CDP client: one WebSocket, promise per command id. */
async function connect(wsUrl) {
  // Node 22+ ships a global WebSocket, so this needs no `ws` dependency.
  const socket = new WebSocket(wsUrl);
  const pending = new Map();
  let nextId = 0;

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const entry = pending.get(message.id);

    if (!entry) {
      return;
    }

    pending.delete(message.id);
    message.error
      ? entry.reject(new Error(message.error.message))
      : entry.resolve(message.result);
  });

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener(
      "error",
      () => reject(new Error("CDP connect failed")),
      { once: true },
    );
  });

  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(
        JSON.stringify(
          sessionId
            ? { id, method, params, sessionId }
            : { id, method, params },
        ),
      );
    });

  return { send, close: () => socket.close() };
}

/** Polls an expression until it turns truthy, so we never race the render. */
async function waitFor(cdp, expression, description) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const { result } = await cdp.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });

    if (result.value) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timed out waiting for ${description}`);
}

async function capture(cdp, port, shot) {
  await cdp.send("Page.navigate", {
    url: `http://127.0.0.1:${port}/scripts/shots/?shot=${shot}`,
  });

  await waitFor(cdp, "!!document.querySelector('.shot')", `${shot} to render`);
  // Fonts settle after the first paint; a stamp measured mid-swap crops wrong.
  await waitFor(cdp, "document.fonts.ready.then(() => true)", "fonts");

  const { result } = await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const box = document.querySelector('.shot').getBoundingClientRect();
      return JSON.stringify({
        x: Math.floor(box.x),
        y: Math.floor(box.y),
        width: Math.ceil(box.width),
        height: Math.ceil(box.height),
      });
    })()`,
    returnByValue: true,
  });

  const clip = { ...JSON.parse(result.value), scale: SCALE };

  const { data } = await cdp.send("Page.captureScreenshot", {
    format: "png",
    clip,
    captureBeyondViewport: true,
  });

  const file = join(OUT_DIR, `${shot}.png`);
  await writeFile(file, Buffer.from(data, "base64"));

  const before = (await stat(file)).size;
  await compress(file);
  const after = (await stat(file)).size;

  return { file, width: clip.width, height: clip.height, before, after };
}

/**
 * Squeezes a captured PNG in place.
 *
 * These images ship inside the npm tarball, so the raw 2x captures (~100kB
 * each) are worth quantising. Both tools are optional: if neither is on PATH
 * the screenshots are still correct, only heavier.
 */
async function compress(file) {
  await run("pngquant", [
    "--force",
    "--skip-if-larger",
    "--output",
    file,
    "--quality",
    "65-90",
    file,
  ]);
  await run("oxipng", ["--quiet", "--opt", "4", "--strip", "safe", file]);
}

/** Runs a command, resolving false if it is missing rather than throwing. */
function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "ignore" });

    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

async function main() {
  const binary = await findHeadlessShell();
  const { server, port } = await serveRepo();

  await mkdir(OUT_DIR, { recursive: true });

  const browser = spawn(binary, [
    "--headless",
    "--remote-debugging-port=0",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    `--user-data-dir=${join(ROOT, "tmp", "shots-profile")}`,
    "--window-size=1600,1200",
  ]);

  // Chromium prints the DevTools endpoint to stderr once it is listening.
  const wsUrl = await new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(
      () => reject(new Error("Browser did not report a DevTools endpoint")),
      20000,
    );

    browser.stderr.on("data", (chunk) => {
      buffer += chunk;
      const match = buffer.match(/ws:\/\/[^\s]+/);

      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    });

    browser.on("exit", (code) =>
      reject(new Error(`Browser exited early with code ${code}`)),
    );
  });

  // `wsUrl` is the browser-level endpoint, which only speaks Target.* and
  // friends. Page.* and Runtime.* live on a page target, so open one and talk
  // to it over its own session.
  const browserCdp = await connect(wsUrl);

  const { targetId } = await browserCdp.send("Target.createTarget", {
    url: "about:blank",
  });

  const { sessionId } = await browserCdp.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });

  const cdp = {
    send: (method, params) => browserCdp.send(method, params, sessionId),
    close: () => browserCdp.close(),
  };

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  try {
    let total = 0;

    for (const shot of SHOTS) {
      const { width, height, before, after } = await capture(cdp, port, shot);
      const kb = (bytes) => `${Math.round(bytes / 1024)}kB`;
      total += after;

      console.log(
        `✓ ${shot.padEnd(9)} ${String(width).padStart(4)}×${String(height).padEnd(4)} ${kb(before).padStart(6)} → ${kb(after).padStart(6)}`,
      );
    }

    console.log(`\n  total ${Math.round(total / 1024)}kB`);
  } finally {
    cdp.close();
    browser.kill();
    server.close();
  }

  console.log(`\nDone — ${SHOTS.length} screenshots in docs/screenshots/.`);
}

await main();
