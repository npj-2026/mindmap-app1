const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

test("actual Next.js mind map supports zoom and Markdown document import", { timeout: 90000 }, async (t) => {
  if (!fs.existsSync(chromePath)) {
    t.skip("Google Chrome is not available in this environment");
    return;
  }
  if (typeof WebSocket === "undefined") {
    t.skip("Node WebSocket is not available in this environment");
    return;
  }

  const appPort = await freePort();
  const debugPort = await freePort();
  const app = startNextApp(appPort);
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
    app.kill("SIGTERM");
    await Promise.all([waitForExit(chrome), waitForExit(app)]);
    fs.rmSync(profileDir, { recursive: true, force: true });
  });

  const pageUrl = `http://127.0.0.1:${appPort}/viewport-test`;
  await waitForUrl(pageUrl, 60000, () => app.logs());

  const tab = await openChromeTab(debugPort, pageUrl);
  const cdp = await connectCdp(tab.webSocketDebuggerUrl);
  t.after(() => cdp.close());

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Page.navigate", { url: pageUrl });
  await waitFor(() => cdp.evaluate(`
    Boolean(
      document.querySelector('[data-testid="mindmap-canvas"]') &&
      document.querySelector('[data-testid="mindmap-world"]') &&
      document.querySelector('[data-testid="mindmap-root-node"]') &&
      !document.querySelector('.loading-overlay')
    )
  `), 30000);
  await cdp.evaluate(installBrowserHelpersScript());
  await waitFor(() => cdp.evaluate(`
    (() => {
      const state = window.__mindmapZoomTest.read();
      return state.nodeCount >= 4 &&
        (state.transform.x !== 0 || state.transform.y !== 0 || state.transform.scale !== 1);
    })()
  `), 10000);

  const initial = await cdp.evaluate("window.__mindmapZoomTest.read()");
  await clickAndWaitForScale(cdp, "zoom-in", (scale) => scale > initial.transform.scale);
  const zoomedIn = await cdp.evaluate("window.__mindmapZoomTest.read()");

  assert.ok(zoomedIn.transform.scale > initial.transform.scale);
  assert.ok(zoomedIn.rootRect.width > initial.rootRect.width);

  await clickAndWaitForScale(cdp, "zoom-out", (scale) => Math.abs(scale - initial.transform.scale) < 0.001);
  const zoomedBack = await cdp.evaluate("window.__mindmapZoomTest.read()");

  assertAlmostEqual(zoomedBack.transform.scale, initial.transform.scale, 0.001);
  assertAlmostEqual(zoomedBack.rootRect.width, initial.rootRect.width, 0.5);

  const beforeCenter = await cdp.evaluate("window.__mindmapZoomTest.worldAtCanvasCenter()");
  const beforeScale = zoomedBack.transform.scale;
  await cdp.evaluate(`
    (() => {
      for (let index = 0; index < 5; index += 1) {
        document.querySelector('[data-testid="zoom-in"]').click();
      }
    })()
  `);
  await waitFor(() => cdp.evaluate(`window.__mindmapZoomTest.read().transform.scale > ${beforeScale + 0.45}`));
  const afterCenter = await cdp.evaluate("window.__mindmapZoomTest.worldAtCanvasCenter()");
  assertAlmostEqual(afterCenter.x, beforeCenter.x, 0.01);
  assertAlmostEqual(afterCenter.y, beforeCenter.y, 0.01);

  await clickAndWaitForScale(cdp, "zoom-reset", (scale) => Math.abs(scale - 1) < 0.001);
  const reset = await cdp.evaluate("window.__mindmapZoomTest.read()");
  assertAlmostEqual(reset.transform.scale, 1, 0.001);
  assertAlmostEqual(reset.rootCenter.x, reset.canvasCenter.x, 1);
  assertAlmostEqual(reset.rootCenter.y, reset.canvasCenter.y, 1);

  await cdp.evaluate("document.querySelector('[data-testid=\"zoom-fit\"]').click()");
  await waitFor(() => cdp.evaluate("window.__mindmapZoomTest.read().allNodesInsideCanvas"), 10000);
  const fitted = await cdp.evaluate("window.__mindmapZoomTest.read()");
  assert.equal(fitted.allNodesInsideCanvas, true);
  assert.ok(fitted.transform.scale <= 1);

  const beforeWheelState = await cdp.evaluate("window.__mindmapZoomTest.read()");
  const beforeWheel = await cdp.evaluate("window.__mindmapZoomTest.worldAtLocalPoint(320, 210)");
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
  await waitFor(() => cdp.evaluate(`window.__mindmapZoomTest.read().transform.scale > ${beforeWheelState.transform.scale}`));
  const afterWheel = await cdp.evaluate("window.__mindmapZoomTest.worldAtLocalPoint(320, 210)");
  assertAlmostEqual(afterWheel.x, beforeWheel.x, 0.01);
  assertAlmostEqual(afterWheel.y, beforeWheel.y, 0.01);

  await cdp.evaluate("window.__mindmapZoomTest.clickButtonByText('資料から作成')");
  await waitFor(() => cdp.evaluate("Boolean(document.querySelector('.document-textarea'))"), 10000);
  await cdp.evaluate(`
    window.__mindmapZoomTest.setTextarea('.document-textarea', ${JSON.stringify(sixLevelMarkdown())});
    window.__mindmapZoomTest.clickButtonByText('作成前プレビューを作る');
  `);
  await waitFor(() => cdp.evaluate("window.__mindmapZoomTest.readPreviewChain().titles.length === 6"), 15000);
  const preview = await cdp.evaluate("window.__mindmapZoomTest.readPreviewChain()");
  assert.deepEqual(preview.titles, [
    "Needsproject JAPAN",
    "通信・デジタル支援",
    "事業者向け支援",
    "Webサイト支援",
    "既存サイト診断",
    "SEO・表示速度・導線を分析",
  ]);
  assert.deepEqual(preview.childCounts, [1, 1, 1, 1, 1, 0]);

  await cdp.evaluate(`
    window.__mindmapZoomTest.selectApplyMode('replace');
    window.__mindmapZoomTest.setChecked('.confirm-line input', true);
    window.__mindmapZoomTest.clickButtonByText('マップへ反映');
  `);
  await waitFor(() => cdp.evaluate("!document.querySelector('.document-modal')"), 10000);
  await cdp.evaluate("window.__mindmapZoomTest.openMoreMenu()");
  await cdp.evaluate("window.__mindmapZoomTest.clickButtonByText('すべて展開')");
  await waitFor(() => cdp.evaluate("window.__mindmapZoomTest.readCanvasNodes().length >= 6"), 10000);
  const canvasNodes = await cdp.evaluate("window.__mindmapZoomTest.readCanvasNodes()");
  const expected = [
    ["Needsproject JAPAN", 0],
    ["通信・デジタル支援", 1],
    ["事業者向け支援", 2],
    ["Webサイト支援", 3],
    ["既存サイト診断", 4],
    ["SEO・表示速度・導線を分析", 5],
  ];
  for (const [title, depth] of expected) {
    const node = canvasNodes.find((item) => item.text === title);
    assert.ok(node, `expected canvas node ${title}`);
    assert.equal(node.depth, depth, `expected ${title} to be depth ${depth}`);
  }
});

function startNextApp(port) {
  const output = [];
  const child = childProcess.spawn("npm", [
    "run",
    "dev",
    "--",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk) => output.push(chunk.toString()));
  child.logs = () => output.join("");
  return child;
}

function sixLevelMarkdown() {
  return `# Needsproject JAPAN

## 通信・デジタル支援
### 事業者向け支援
#### Webサイト支援
##### 既存サイト診断
###### SEO・表示速度・導線を分析`;
}

function installBrowserHelpersScript() {
  return `
    (() => {
      const transformPattern = /translate3d\\(([-+]?\\d*\\.?\\d+(?:e[-+]?\\d+)?)px, ([-+]?\\d*\\.?\\d+(?:e[-+]?\\d+)?)px, 0(?:px)?\\) scale\\(([-+]?\\d*\\.?\\d+(?:e[-+]?\\d+)?)\\)/i;

      function element(testId) {
        const found = document.querySelector('[data-testid="' + testId + '"]');
        if (!found) throw new Error('Missing element: ' + testId);
        return found;
      }

      function rectValue(rect) {
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height
        };
      }

      function parseTransform() {
        const value = element('mindmap-world').style.transform;
        const match = value.match(transformPattern);
        if (!match) throw new Error('Unexpected transform: ' + value);
        return {
          x: Number(match[1]),
          y: Number(match[2]),
          scale: Number(match[3])
        };
      }

      function visible(element) {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }

      function dispatchInput(element, value) {
        const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(element, value);
        element.dispatchEvent(new InputEvent('input', { bubbles: true, data: value }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }

      function buttonByText(text) {
        const button = Array.from(document.querySelectorAll('button')).find((candidate) =>
          visible(candidate) &&
          !candidate.disabled &&
          candidate.textContent.replace(/\\s+/g, '').includes(text.replace(/\\s+/g, ''))
        );
        if (!button) throw new Error('Missing button: ' + text);
        return button;
      }

      function firstDirectNode(container) {
        return container ? Array.from(container.children).find((child) => child.classList.contains('preview-node')) : null;
      }

      function worldAtLocalPoint(localX, localY) {
        const transform = parseTransform();
        return {
          x: (localX - transform.x) / transform.scale,
          y: (localY - transform.y) / transform.scale
        };
      }

      function read() {
        const canvas = element('mindmap-canvas');
        const canvasRect = canvas.getBoundingClientRect();
        const rootRect = element('mindmap-root-node').getBoundingClientRect();
        const nodeRects = Array.from(document.querySelectorAll('[data-testid="mindmap-root-node"], [data-testid="mindmap-node"]'))
          .map((node) => rectValue(node.getBoundingClientRect()));
        const transform = parseTransform();
        const rootCenter = {
          x: rootRect.left + rootRect.width / 2,
          y: rootRect.top + rootRect.height / 2
        };
        const canvasCenter = {
          x: canvasRect.left + canvasRect.width / 2,
          y: canvasRect.top + canvasRect.height / 2
        };
        return {
          transform,
          nodeCount: nodeRects.length,
          canvasRect: rectValue(canvasRect),
          rootRect: rectValue(rootRect),
          rootCenter,
          canvasCenter,
          allNodesInsideCanvas: nodeRects.every((rect) =>
            rect.left >= canvasRect.left - 1 &&
            rect.top >= canvasRect.top - 1 &&
            rect.right <= canvasRect.right + 1 &&
            rect.bottom <= canvasRect.bottom + 1
          )
        };
      }

      window.__mindmapZoomTest = {
        parseTransform,
        read,
        worldAtLocalPoint,
        worldAtCanvasCenter() {
          const canvasRect = element('mindmap-canvas').getBoundingClientRect();
          return worldAtLocalPoint(canvasRect.width / 2, canvasRect.height / 2);
        },
        clickButtonByText(text) {
          buttonByText(text).click();
        },
        setTextarea(selector, value) {
          const textarea = document.querySelector(selector);
          if (!textarea) throw new Error('Missing textarea: ' + selector);
          dispatchInput(textarea, value);
        },
        setChecked(selector, checked) {
          const input = document.querySelector(selector);
          if (!input) throw new Error('Missing checkbox: ' + selector);
          if (input.checked !== checked) input.click();
        },
        selectApplyMode(value) {
          const select = Array.from(document.querySelectorAll('select')).find((candidate) =>
            Array.from(candidate.options).some((option) => option.value === value)
          );
          if (!select) throw new Error('Missing apply mode select');
          select.value = value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        },
        readPreviewChain() {
          const titleInput = document.querySelector('.document-preview .field input');
          const titles = titleInput ? [titleInput.value] : [];
          const childCounts = [];
          let node = firstDirectNode(document.querySelector('.preview-tree'));
          while (node) {
            const title = node.querySelector(':scope > .preview-node-main input').value;
            const children = node.querySelector(':scope > .preview-children');
            const directChildren = children
              ? Array.from(children.children).filter((child) => child.classList.contains('preview-node'))
              : [];
            titles.push(title);
            childCounts.push(directChildren.length);
            node = directChildren[0] || null;
          }
          if (titles.length) childCounts.unshift(document.querySelectorAll('.preview-tree > .preview-node').length);
          return { titles, childCounts };
        },
        openMoreMenu() {
          buttonByText('その他').click();
        },
        readCanvasNodes() {
          return Array.from(document.querySelectorAll('[data-testid="mindmap-root-node"], [data-testid="mindmap-node"]'))
            .map((node) => ({
              text: node.querySelector('textarea')?.value || '',
              depth: Number(node.dataset.depth),
              parentId: node.dataset.parentId || null,
              left: node.getBoundingClientRect().left,
              width: node.getBoundingClientRect().width
            }));
        }
      };
    })()
  `;
}

async function clickAndWaitForScale(cdp, testId, predicate) {
  await cdp.evaluate(`document.querySelector('[data-testid="${testId}"]').click()`);
  await waitFor(async () => {
    const state = await cdp.evaluate("window.__mindmapZoomTest.read()");
    return predicate(state.transform.scale);
  }, 10000);
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

async function waitForUrl(url, timeoutMs, logs) {
  await waitFor(async () => {
    const response = await fetch(url).catch(() => null);
    return Boolean(response?.ok);
  }, timeoutMs, () => {
    const detail = logs?.();
    return detail ? `\nNext.js output:\n${detail}` : "";
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
        throw new Error(
          result.exceptionDetails.exception?.description ||
            result.exceptionDetails.exception?.value ||
            result.exceptionDetails.text ||
            "Browser evaluation failed",
        );
      }
      return result.result.value;
    },
    close() {
      socket.close();
    },
  }));
}

async function waitFor(callback, timeoutMs = 8000, message = () => "") {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await callback()) return;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`Timed out waiting for browser condition${message()}`);
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
