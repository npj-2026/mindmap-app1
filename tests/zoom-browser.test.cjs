require("./helpers/register-ts.cjs");

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  calculateViewportBounds,
  centerNodeOrBoundsInViewport,
  clampZoom,
  fitNodesInViewport,
  viewportTransformCss,
  zoomTransformAtPoint,
} = require("../lib/viewport.ts");

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

test("viewport zoom changes DOM size without drifting the anchor point", async (t) => {
  if (!fs.existsSync(chromePath)) {
    t.skip("Google Chrome is not available in this environment");
    return;
  }
  if (typeof WebSocket === "undefined") {
    t.skip("Node WebSocket is not available in this environment");
    return;
  }

  const httpServer = await startFixtureServer();
  const debugPort = await freePort();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "mindmap-zoom-chrome-"));
  const chrome = childProcess.spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-extensions",
    "--no-default-browser-check",
    "--no-first-run",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDir}`,
    "about:blank",
  ], {
    stdio: "ignore",
  });

  t.after(async () => {
    chrome.kill("SIGTERM");
    await waitForExit(chrome);
    await new Promise((resolve) => httpServer.close(resolve));
    fs.rmSync(profileDir, { recursive: true, force: true });
  });

  const fixtureUrl = `http://127.0.0.1:${httpServer.address().port}/`;
  const tab = await openChromeTab(debugPort, fixtureUrl);
  const cdp = await connectCdp(tab.webSocketDebuggerUrl);
  t.after(() => cdp.close());

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Page.navigate", { url: fixtureUrl });
  await waitFor(() => cdp.evaluate("window.__zoomReady === true"));

  const initial = await cdp.evaluate("window.readZoomState()");
  await cdp.evaluate("document.querySelector('[data-testid=\"zoom-in\"]').click()");
  const zoomedIn = await cdp.evaluate("window.readZoomState()");

  assert.ok(zoomedIn.transform.scale > initial.transform.scale);
  assert.ok(zoomedIn.rootRect.width > initial.rootRect.width);

  await cdp.evaluate("document.querySelector('[data-testid=\"zoom-out\"]').click()");
  const zoomedBack = await cdp.evaluate("window.readZoomState()");

  assertAlmostEqual(zoomedBack.transform.scale, initial.transform.scale, 0.001);
  assertAlmostEqual(zoomedBack.rootRect.width, initial.rootRect.width, 0.01);

  const beforeCenter = await cdp.evaluate("window.worldAtCanvasCenter()");
  for (let index = 0; index < 5; index += 1) {
    await cdp.evaluate("document.querySelector('[data-testid=\"zoom-in\"]').click()");
  }
  const afterCenter = await cdp.evaluate("window.worldAtCanvasCenter()");
  assertAlmostEqual(afterCenter.x, beforeCenter.x, 0.01);
  assertAlmostEqual(afterCenter.y, beforeCenter.y, 0.01);

  await cdp.evaluate("document.querySelector('[data-testid=\"zoom-reset\"]').click()");
  const reset = await cdp.evaluate("window.readZoomState()");
  assertAlmostEqual(reset.transform.scale, 1, 0.001);
  assertAlmostEqual(reset.rootCenter.x, reset.canvasCenter.x, 0.5);
  assertAlmostEqual(reset.rootCenter.y, reset.canvasCenter.y, 0.5);

  await cdp.evaluate("document.querySelector('[data-testid=\"zoom-fit\"]').click()");
  const fitted = await cdp.evaluate("window.readZoomState()");
  assert.equal(fitted.allNodesInsideCanvas, true);
  assert.ok(fitted.transform.scale <= 1);

  const beforeWheel = await cdp.evaluate("window.worldAtLocalPoint(320, 210)");
  await cdp.evaluate(`
    (() => {
      const canvas = document.querySelector('[data-testid="mindmap-canvas"]');
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + 320,
        clientY: rect.top + 210,
        deltaY: -100
      }));
    })()
  `);
  const afterWheel = await cdp.evaluate("window.worldAtLocalPoint(320, 210)");
  assertAlmostEqual(afterWheel.x, beforeWheel.x, 0.01);
  assertAlmostEqual(afterWheel.y, beforeWheel.y, 0.01);
});

function fixtureHtml() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; }
    .canvas {
      position: relative;
      width: 800px;
      height: 500px;
      overflow: hidden;
      touch-action: none;
      overscroll-behavior: none;
    }
    .world {
      position: absolute;
      inset: 0;
      width: 1600px;
      height: 900px;
      transform-origin: 0 0;
      transition: none;
    }
    .mind-node {
      position: absolute;
      box-sizing: border-box;
      border: 2px solid #2563eb;
      border-radius: 8px;
      background: #fff;
    }
    .zoom-controls {
      position: absolute;
      right: 12px;
      bottom: 12px;
    }
  </style>
</head>
<body>
  <div class="canvas" data-testid="mindmap-canvas">
    <div class="world" data-testid="mindmap-world">
      <div class="mind-node" data-testid="mindmap-root-node" style="left:300px;top:220px;width:200px;height:80px"></div>
      <div class="mind-node" data-testid="mindmap-node" style="left:980px;top:420px;width:180px;height:70px"></div>
    </div>
    <div class="zoom-controls">
      <button data-testid="zoom-out">-</button>
      <button data-testid="zoom-reset">100%</button>
      <button data-testid="zoom-in">+</button>
      <button data-testid="zoom-fit">全体</button>
    </div>
  </div>
  <script>
    const MIN_ZOOM = 0.25;
    const MAX_ZOOM = 2.5;
    const ZOOM_STEP = 0.1;
    const exports = { MIN_ZOOM, MAX_ZOOM };
    ${clampZoom.toString()}
    ${calculateViewportBounds.toString()}
    ${zoomTransformAtPoint.toString()}
    ${centerNodeOrBoundsInViewport.toString()}
    ${fitNodesInViewport.toString()}
    ${viewportTransformCss.toString()}

    const canvas = document.querySelector('[data-testid="mindmap-canvas"]');
    const world = document.querySelector('[data-testid="mindmap-world"]');
    const nodes = [
      { id: "root", x: 300, y: 220, width: 200, height: 80 },
      { id: "child", x: 980, y: 420, width: 180, height: 70 }
    ];
    let transform = centerNodeOrBoundsInViewport(nodes[0], nodes, canvas.getBoundingClientRect(), 1);

    function applyTransform() {
      world.style.transform = viewportTransformCss(transform);
    }
    function setTransform(next) {
      transform = next;
      applyTransform();
    }
    function localCenter() {
      const rect = canvas.getBoundingClientRect();
      return { x: rect.width / 2, y: rect.height / 2 };
    }
    function rectValue(rect) {
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    }

    document.querySelector('[data-testid="zoom-in"]').addEventListener("click", () => {
      setTransform(zoomTransformAtPoint(transform, transform.scale + ZOOM_STEP, localCenter()));
    });
    document.querySelector('[data-testid="zoom-out"]').addEventListener("click", () => {
      setTransform(zoomTransformAtPoint(transform, transform.scale - ZOOM_STEP, localCenter()));
    });
    document.querySelector('[data-testid="zoom-reset"]').addEventListener("click", () => {
      setTransform(centerNodeOrBoundsInViewport(nodes[0], nodes, canvas.getBoundingClientRect(), 1));
    });
    document.querySelector('[data-testid="zoom-fit"]').addEventListener("click", () => {
      setTransform(fitNodesInViewport(nodes, canvas.getBoundingClientRect(), { maxScale: 1 }).transform);
    });
    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      const rect = canvas.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      const clampedDelta = Math.max(-100, Math.min(100, event.deltaY));
      setTransform(zoomTransformAtPoint(transform, transform.scale * Math.exp(-clampedDelta * 0.0015), { x: localX, y: localY }));
    });

    window.worldAtLocalPoint = (localX, localY) => ({
      x: (localX - transform.x) / transform.scale,
      y: (localY - transform.y) / transform.scale
    });
    window.worldAtCanvasCenter = () => {
      const center = localCenter();
      return window.worldAtLocalPoint(center.x, center.y);
    };
    window.readZoomState = () => {
      const canvasRect = canvas.getBoundingClientRect();
      const rootRect = document.querySelector('[data-testid="mindmap-root-node"]').getBoundingClientRect();
      const nodeRects = Array.from(document.querySelectorAll('.mind-node')).map((node) => rectValue(node.getBoundingClientRect()));
      const rootCenter = { x: rootRect.left + rootRect.width / 2, y: rootRect.top + rootRect.height / 2 };
      const canvasCenter = { x: canvasRect.left + canvasRect.width / 2, y: canvasRect.top + canvasRect.height / 2 };
      return {
        transform,
        canvasRect: rectValue(canvasRect),
        rootRect: rectValue(rootRect),
        rootCenter,
        canvasCenter,
        allNodesInsideCanvas: nodeRects.every((rect) =>
          rect.left >= canvasRect.left - 0.5 &&
          rect.top >= canvasRect.top - 0.5 &&
          rect.right <= canvasRect.right + 0.5 &&
          rect.bottom <= canvasRect.bottom + 0.5
        )
      };
    };

    applyTransform();
    window.__zoomReady = true;
  </script>
</body>
</html>`;
}

function startFixtureServer() {
  const html = fixtureHtml();
  const server = http.createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function freePort() {
  const server = net.createServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function openChromeTab(debugPort, url) {
  await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`).catch(() => null);
    return Boolean(response?.ok);
  });

  let response = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`, {
    method: "PUT",
  });
  if (!response.ok) {
    response = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`);
  }
  assert.equal(response.ok, true, "Chrome did not open a test tab");
  return response.json();
}

function connectCdp(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  return opened.then(() => ({
    send(method, params = {}) {
      const messageId = ++id;
      const promise = new Promise((resolve, reject) => {
        pending.set(messageId, { resolve, reject });
      });
      socket.send(JSON.stringify({ id: messageId, method, params }));
      return promise;
    },
    async evaluate(expression) {
      const result = await this.send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text || "Browser evaluation failed");
      }
      return result.result.value;
    },
    close() {
      socket.close();
    },
  }));
}

async function waitFor(callback, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await callback()) return;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error("Timed out waiting for browser condition");
}

function assertAlmostEqual(actual, expected, tolerance) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

function waitForExit(child, timeoutMs = 3000) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
