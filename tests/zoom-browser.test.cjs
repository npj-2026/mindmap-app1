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
  await cdp.send("Page.bringToFront");
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
  await cdp.evaluate("document.fonts ? document.fonts.ready.then(() => true) : true");
  await new Promise((resolve) => setTimeout(resolve, 100));

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
  for (let index = 0; index < 5; index += 1) {
    await mouseClickTestId(cdp, "zoom-in");
  }
  await waitFor(() => cdp.evaluate(`window.__mindmapZoomTest.read().transform.scale > ${beforeScale + 0.45}`));
  const afterCenter = await cdp.evaluate("window.__mindmapZoomTest.worldAtCanvasCenter()");
  assertAlmostEqual(afterCenter.x, beforeCenter.x, 0.02);
  assertAlmostEqual(afterCenter.y, beforeCenter.y, 0.02);

  await clickAndWaitForScale(cdp, "zoom-reset", (scale) => Math.abs(scale - 1) < 0.001);
  const reset = await cdp.evaluate("window.__mindmapZoomTest.read()");
  assertAlmostEqual(reset.transform.scale, 1, 0.001);
  assertAlmostEqual(reset.rootCenter.x, reset.canvasCenter.x, 12);
  assertAlmostEqual(reset.rootCenter.y, reset.canvasCenter.y, 12);

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 820,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await new Promise((resolve) => setTimeout(resolve, 250));

  await mouseClickTestId(cdp, "zoom-fit");
  await waitFor(() => cdp.evaluate("window.__mindmapZoomTest.read().allNodesInsideCanvas"), 10000);
  const fitted = await cdp.evaluate("window.__mindmapZoomTest.read()");
  assert.equal(fitted.allNodesInsideCanvas, true);
  assert.ok(fitted.transform.scale <= 1);

  await mouseClickByText(cdp, "パネルを閉じる");
  await waitFor(() => cdp.evaluate(`
    (() => {
      const state = window.__mindmapZoomTest.read();
      return state.canvasRect.left <= 1 &&
        state.allNodesInsideCanvas &&
        Math.abs(state.nodeBoundsCenter.x - state.canvasCenter.x) <= 8 &&
        Math.abs(state.nodeBoundsCenter.y - state.canvasCenter.y) <= 8;
    })()
  `), 10000);
  const leftPanelClosed = await cdp.evaluate("window.__mindmapZoomTest.read()");
  assert.equal(leftPanelClosed.allNodesInsideCanvas, true);
  assertAlmostEqual(leftPanelClosed.nodeBoundsCenter.x, leftPanelClosed.canvasCenter.x, 8);
  assertAlmostEqual(leftPanelClosed.nodeBoundsCenter.y, leftPanelClosed.canvasCenter.y, 8);

  await mouseClickSelector(cdp, '[aria-label="スタイルパネルを閉じる"]');
  await waitFor(() => cdp.evaluate(`
    (() => {
      const state = window.__mindmapZoomTest.read();
      return state.canvasRect.width > ${leftPanelClosed.canvasRect.width + 180} &&
        state.allNodesInsideCanvas &&
        Math.abs(state.nodeBoundsCenter.x - state.canvasCenter.x) <= 8 &&
        Math.abs(state.nodeBoundsCenter.y - state.canvasCenter.y) <= 8;
    })()
  `), 10000, async () => {
    const state = await cdp.evaluate("window.__mindmapZoomTest.read()").catch((error) => ({ error: String(error) }));
    const layout = await cdp.evaluate("window.__mindmapZoomTest.readLayout()").catch((error) => ({ error: String(error) }));
    return `\nAfter style panel close:\n${JSON.stringify({ state, layout }, null, 2)}`;
  });
  const bothPanelsClosed = await cdp.evaluate("window.__mindmapZoomTest.read()");
  assert.equal(bothPanelsClosed.allNodesInsideCanvas, true);
  assertAlmostEqual(bothPanelsClosed.nodeBoundsCenter.x, bothPanelsClosed.canvasCenter.x, 8);
  assertAlmostEqual(bothPanelsClosed.nodeBoundsCenter.y, bothPanelsClosed.canvasCenter.y, 8);

  await mouseClickSelector(cdp, '[aria-label="左パネルを開く"]');
  await waitFor(() => cdp.evaluate(`
    (() => {
      const state = window.__mindmapZoomTest.read();
      return state.canvasRect.width < ${bothPanelsClosed.canvasRect.width - 120} && state.allNodesInsideCanvas;
    })()
  `), 10000);
  await mouseClickByText(cdp, "パネルを閉じる");
  await waitFor(() => cdp.evaluate(`
    (() => {
      const state = window.__mindmapZoomTest.read();
      return state.canvasRect.width > ${leftPanelClosed.canvasRect.width + 180} && state.allNodesInsideCanvas;
    })()
  `), 10000);

  const beforeWheelState = await cdp.evaluate("window.__mindmapZoomTest.read()");
  const wheelPoint = await cdp.evaluate("window.__mindmapZoomTest.backgroundPointInCanvas()");
  const beforeWheel = await cdp.evaluate(`
    window.__mindmapZoomTest.worldAtLocalPoint(${wheelPoint.localX}, ${wheelPoint.localY})
  `);
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: Math.round(wheelPoint.x),
    y: Math.round(wheelPoint.y),
  });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: Math.round(wheelPoint.x),
    y: Math.round(wheelPoint.y),
    deltaY: -240,
    deltaX: 0,
  });
  await cdp.send("Input.synthesizeScrollGesture", {
    x: Math.round(wheelPoint.x),
    y: Math.round(wheelPoint.y),
    yDistance: 240,
    xDistance: 0,
    speed: 800,
    gestureSourceType: "mouse",
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const afterNativeWheelAttempt = await cdp.evaluate("window.__mindmapZoomTest.read()");
  if (Math.abs(afterNativeWheelAttempt.transform.scale - beforeWheelState.transform.scale) <= 0.001) {
    await cdp.evaluate(`
      window.__mindmapZoomTest.dispatchWheelAtCanvasPoint(${wheelPoint.localX}, ${wheelPoint.localY}, -240)
    `);
  }
  await waitFor(() => cdp.evaluate(`
    Math.abs(window.__mindmapZoomTest.read().transform.scale - ${beforeWheelState.transform.scale}) > 0.001
  `));
  const afterWheel = await cdp.evaluate(`
    window.__mindmapZoomTest.worldAtLocalPoint(${wheelPoint.localX}, ${wheelPoint.localY})
  `);
  assertAlmostEqual(afterWheel.x, beforeWheel.x, 1);
  assertAlmostEqual(afterWheel.y, beforeWheel.y, 1);

  const beforePan = await cdp.evaluate("window.__mindmapZoomTest.read().transform");
  const panStart = await cdp.evaluate("window.__mindmapZoomTest.backgroundPointInCanvas()");
  const panX = Math.round(panStart.x);
  const panY = Math.round(panStart.y);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: panX, y: panY, pointerType: "mouse" });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: panX, y: panY, button: "left", buttons: 1, clickCount: 1, pointerType: "mouse" });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: panX + 80, y: panY + 40, button: "left", buttons: 1, pointerType: "mouse" });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: panX + 80, y: panY + 40, button: "left", buttons: 0, clickCount: 1, pointerType: "mouse" });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const afterNativePanAttempt = await cdp.evaluate("window.__mindmapZoomTest.read().transform");
  if (
    Math.abs(afterNativePanAttempt.x - beforePan.x) <= 20 &&
    Math.abs(afterNativePanAttempt.y - beforePan.y) <= 20
  ) {
    await cdp.evaluate(`
      window.__mindmapZoomTest.dispatchMousePan(${panStart.localX}, ${panStart.localY}, 80, 40)
    `);
  }
  await waitFor(() => cdp.evaluate(`
    (() => {
      const current = window.__mindmapZoomTest.read().transform;
      return Math.abs(current.x - ${beforePan.x}) > 20 || Math.abs(current.y - ${beforePan.y}) > 20;
    })()
  `), 10000);
  const afterPan = await cdp.evaluate("window.__mindmapZoomTest.read().transform");
  await mouseClickTestId(cdp, "zoom-in");
  const afterZoomButton = await cdp.evaluate("window.__mindmapZoomTest.read().transform");
  assert.ok(afterZoomButton.scale > afterPan.scale, "zoom button should increase scale after panning");
  assert.ok(Math.abs(afterZoomButton.x - afterPan.x) < 500, "zoom button should not start canvas panning");
  assert.ok(Math.abs(afterZoomButton.y - afterPan.y) < 500, "zoom button should not start canvas panning");

  const compactLayout = await cdp.evaluate("window.__mindmapZoomTest.readLayout()");
  assert.ok(compactLayout.appbar.height <= 53, `appbar height ${compactLayout.appbar.height}`);
  assert.ok(compactLayout.toolbar.height <= 57, `toolbar height ${compactLayout.toolbar.height}`);
  assert.ok(compactLayout.canvas.height > compactLayout.appbar.height + compactLayout.toolbar.height);
  assert.equal(compactLayout.zoom.flexDirection, "row");
  assert.equal(compactLayout.zoom.flexWrap, "nowrap");
  assert.ok(compactLayout.zoom.height <= 45, `zoom controls height ${compactLayout.zoom.height}`);
  assert.ok(compactLayout.zoom.right <= compactLayout.canvas.right + 1);
  assert.ok(compactLayout.zoom.bottom <= compactLayout.canvas.bottom + 1);

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 430,
    height: 760,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const narrowLayout = await cdp.evaluate("window.__mindmapZoomTest.readLayout()");
  assert.equal(narrowLayout.zoom.flexDirection, "row");
  assert.equal(narrowLayout.zoom.flexWrap, "nowrap");
  assert.ok(narrowLayout.zoom.height <= 45);
  assert.ok(narrowLayout.zoom.bottom <= narrowLayout.canvas.bottom + 1);

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 900,
    height: 520,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const shortLayout = await cdp.evaluate("window.__mindmapZoomTest.readLayout()");
  assert.ok(shortLayout.canvas.height > 260, `canvas height ${shortLayout.canvas.height}`);
  assert.ok(shortLayout.zoom.bottom <= shortLayout.canvas.bottom + 1);

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 820,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await new Promise((resolve) => setTimeout(resolve, 250));

  const sampleTexts = [
    "DX支援",
    "通信・デジタル支援",
    "Needs Project Japan 総合デジタル支援事業",
    "AIアナライザーを活用した既存Webサイト診断・SEO改善・MEO対策支援",
  ];
  for (let index = 0; index < sampleTexts.length; index += 1) {
    const point = await cdp.evaluate(`window.__mindmapZoomTest.centerOfNodeTextarea(${index})`);
    await dispatchMouseClick(cdp, point);
    await cdp.evaluate(`window.__mindmapZoomTest.selectNodeTextarea(${index})`);
    await cdp.send("Input.insertText", { text: sampleTexts[index] });
    await waitFor(() => cdp.evaluate(`
      window.__mindmapZoomTest.readCanvasNodes()[${index}]?.text === ${JSON.stringify(sampleTexts[index])}
    `), 10000);
  }
  await waitFor(() => cdp.evaluate(`
    (() => {
      const check = window.__mindmapZoomTest.compactNodeCheck();
      return check.widthsStrictlyIncrease &&
        check.allSingleLine &&
        check.buttonsOnRight &&
        check.compactHeight &&
        check.noOverlap;
    })()
  `), 10000, async () => {
    const check = await cdp.evaluate("window.__mindmapZoomTest.compactNodeCheck()").catch((error) => ({ error: String(error) }));
    return `\nCompact node check:\n${JSON.stringify(check, null, 2)}`;
  });
  const compactCheck = await cdp.evaluate("window.__mindmapZoomTest.compactNodeCheck()");
  assert.equal(compactCheck.widthsStrictlyIncrease, true);
  assert.equal(compactCheck.allSingleLine, true);
  assert.equal(compactCheck.buttonsOnRight, true);
  assert.equal(compactCheck.compactHeight, true);
  assert.equal(compactCheck.noOverlap, true);

  await cdp.evaluate("window.__mindmapZoomTest.clickButtonByText('資料から作成')");
  await waitFor(() => cdp.evaluate("Boolean(document.querySelector('.document-textarea'))"), 10000);
  await cdp.evaluate(`
    window.__mindmapZoomTest.setTextarea('.document-textarea', ${JSON.stringify(sixLevelMarkdown())});
  `);
  await mouseClickByText(cdp, "作成前プレビューを作る");
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
  assert.deepEqual(preview.childCounts, [3, 1, 1, 1, 1, 0]);

  await cdp.evaluate(`
    window.__mindmapZoomTest.selectApplyMode('replace');
    window.__mindmapZoomTest.setChecked('.confirm-line input', true);
  `);
  await cdp.evaluate("window.__mindmapZoomTest.clickButtonByText('マップへ反映')");
  await waitFor(() => cdp.evaluate("!document.querySelector('.document-modal')"), 10000);
  await mouseClickByText(cdp, "その他");
  await mouseClickByText(cdp, "すべて展開");
  await waitFor(() => cdp.evaluate("window.__mindmapZoomTest.readCanvasNodes().length >= 6"), 10000);
  await mouseClickByText(cdp, "右向きに整列");
  await new Promise((resolve) => setTimeout(resolve, 250));
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
  assertCompactTidyLayout(canvasNodes);
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
###### SEO・表示速度・導線を分析

## 業務改善
### 予約管理
#### 問い合わせ対応

## 集客支援
### SNS・MEO支援`;
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

      function centerOf(node) {
        const rect = node.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
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
        const style = getComputedStyle(element);
        if (element.closest('.left-collapsed .left-rail, .style-collapsed .style-panel')) return false;
        return rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          Number(style.opacity || 1) > 0.01;
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
        button.scrollIntoView?.({ block: 'center', inline: 'center' });
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
        const nodeBounds = nodeRects.length
          ? {
              left: Math.min(...nodeRects.map((rect) => rect.left)),
              top: Math.min(...nodeRects.map((rect) => rect.top)),
              right: Math.max(...nodeRects.map((rect) => rect.right)),
              bottom: Math.max(...nodeRects.map((rect) => rect.bottom))
            }
          : rectValue(canvasRect);
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
          nodeBoundsCenter: {
            x: (nodeBounds.left + nodeBounds.right) / 2,
            y: (nodeBounds.top + nodeBounds.bottom) / 2
          },
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
        absolutePointInCanvas(localX, localY) {
          const rect = element('mindmap-canvas').getBoundingClientRect();
          return { x: rect.left + localX, y: rect.top + localY };
        },
        backgroundPointInCanvas() {
          const canvas = element('mindmap-canvas');
          const rect = canvas.getBoundingClientRect();
          const candidates = [
            [40, 40],
            [Math.max(30, rect.width * 0.25), Math.max(30, rect.height * 0.25)],
            [Math.max(30, rect.width * 0.5), Math.max(30, rect.height * 0.35)],
            [Math.max(30, rect.width * 0.75), Math.max(30, rect.height * 0.25)],
            [Math.max(30, rect.width * 0.2), Math.max(30, rect.height * 0.7)],
            [Math.max(30, rect.width * 0.7), Math.max(30, rect.height * 0.7)]
          ];
          for (const [localX, localY] of candidates) {
            const x = rect.left + localX;
            const y = rect.top + localY;
            const target = document.elementFromPoint(x, y);
            if (
              target &&
              target.closest('[data-testid="mindmap-canvas"]') &&
              !target.closest('button,input,textarea,select,a,[role="button"],.zoom-controls,.selection-panel,.toolbar,.more-popover,.document-modal,.mind-node')
            ) {
              return { x, y, localX, localY };
            }
          }
          return { x: rect.left + 40, y: rect.top + 40, localX: 40, localY: 40 };
        },
        dispatchWheelAtCanvasPoint(localX, localY, deltaY) {
          const canvas = element('mindmap-canvas');
          const rect = canvas.getBoundingClientRect();
          canvas.dispatchEvent(new WheelEvent('wheel', {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + localX,
            clientY: rect.top + localY,
            deltaX: 0,
            deltaY
          }));
        },
        dispatchMousePan(localX, localY, dx, dy) {
          const canvas = element('mindmap-canvas');
          const rect = canvas.getBoundingClientRect();
          const startX = rect.left + localX;
          const startY = rect.top + localY;
          canvas.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            clientX: startX,
            clientY: startY,
            button: 0,
            buttons: 1
          }));
          canvas.dispatchEvent(new MouseEvent('mousemove', {
            bubbles: true,
            cancelable: true,
            clientX: startX + dx,
            clientY: startY + dy,
            button: 0,
            buttons: 1
          }));
          canvas.dispatchEvent(new MouseEvent('mouseup', {
            bubbles: true,
            cancelable: true,
            clientX: startX + dx,
            clientY: startY + dy,
            button: 0,
            buttons: 0
          }));
        },
        centerOfTestId(testId) {
          return centerOf(element(testId));
        },
        centerOfButtonText(text) {
          return centerOf(buttonByText(text));
        },
        centerOfSelector(selector) {
          const found = document.querySelector(selector);
          if (!found) throw new Error('Missing selector: ' + selector);
          return centerOf(found);
        },
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
              id: node.dataset.nodeId || '',
              text: node.querySelector('textarea')?.value || '',
              depth: Number(node.dataset.depth),
              parentId: node.dataset.parentId || null,
              left: node.getBoundingClientRect().left,
              top: node.getBoundingClientRect().top,
              right: node.getBoundingClientRect().right,
              bottom: node.getBoundingClientRect().bottom,
              width: node.getBoundingClientRect().width,
              height: node.getBoundingClientRect().height
            }));
        },
        centerOfNodeTextarea(index) {
          const textarea = Array.from(document.querySelectorAll('.mind-node textarea'))[index];
          if (!textarea) throw new Error('Missing node textarea at index ' + index);
          return centerOf(textarea);
        },
        selectNodeTextarea(index) {
          const textarea = Array.from(document.querySelectorAll('.mind-node textarea'))[index];
          if (!textarea) throw new Error('Missing node textarea at index ' + index);
          textarea.focus();
          textarea.select();
          return true;
        },
        compactNodeCheck() {
          const scale = parseTransform().scale || 1;
          const nodes = Array.from(document.querySelectorAll('[data-testid="mindmap-root-node"], [data-testid="mindmap-node"]'));
          const rows = nodes.slice(0, 4).map((node) => {
            const rect = node.getBoundingClientRect();
            const textarea = node.querySelector('textarea');
            const toolbar = node.querySelector('.node-toolbar');
            const textRect = textarea.getBoundingClientRect();
            const toolbarRect = toolbar.getBoundingClientRect();
            return {
              text: textarea.value,
              width: rect.width / scale,
              height: rect.height / scale,
              nodeLeft: rect.left,
              nodeRight: rect.right,
              nodeTop: rect.top,
              nodeBottom: rect.bottom,
              textRight: textRect.right,
              textCenterY: textRect.top + textRect.height / 2,
              toolbarLeft: toolbarRect.left,
              toolbarCenterY: toolbarRect.top + toolbarRect.height / 2,
              textareaScrollHeight: textarea.scrollHeight,
              textareaClientHeight: textarea.clientHeight,
              textareaScrollWidth: textarea.scrollWidth,
              textareaClientWidth: textarea.clientWidth,
              whiteSpace: getComputedStyle(textarea).whiteSpace,
              wordBreak: getComputedStyle(textarea).wordBreak,
              overflowWrap: getComputedStyle(textarea).overflowWrap
            };
          });
          const rects = nodes.map((node) => node.getBoundingClientRect());
          const overlaps = [];
          for (let outer = 0; outer < rects.length; outer += 1) {
            for (let inner = outer + 1; inner < rects.length; inner += 1) {
              const a = rects[outer];
              const b = rects[inner];
              const hasOverlap =
                a.left < b.right - 2 &&
                a.right > b.left + 2 &&
                a.top < b.bottom - 2 &&
                a.bottom > b.top + 2;
              if (hasOverlap) overlaps.push([outer, inner]);
            }
          }
          return {
            rows,
            widthsStrictlyIncrease:
              rows.length >= 4 &&
              rows[0].textareaClientWidth < rows[1].textareaClientWidth &&
              rows[1].textareaClientWidth < rows[2].textareaClientWidth &&
              rows[2].textareaClientWidth < rows[3].textareaClientWidth,
            allSingleLine: rows.every((row) =>
              row.textareaScrollWidth <= row.textareaClientWidth + 2 &&
              row.whiteSpace === 'pre' &&
              row.wordBreak === 'keep-all' &&
              row.overflowWrap === 'normal'
            ),
            buttonsOnRight: rows.every((row) =>
              row.toolbarLeft >= row.textRight - 1 &&
              Math.abs(row.toolbarCenterY - row.textCenterY) <= 8
            ),
            compactHeight: rows.every((row) => row.height <= 58),
            noOverlap: overlaps.length === 0,
            overlaps
          };
        },
        readLayout() {
          const appbar = document.querySelector('.appbar').getBoundingClientRect();
          const toolbar = document.querySelector('.toolbar').getBoundingClientRect();
          const canvas = element('mindmap-canvas').getBoundingClientRect();
          const zoomNode = document.querySelector('.zoom-controls');
          const zoom = zoomNode.getBoundingClientRect();
          const zoomStyle = getComputedStyle(zoomNode);
          return {
            appbar: rectValue(appbar),
            toolbar: rectValue(toolbar),
            canvas: rectValue(canvas),
            zoom: {
              ...rectValue(zoom),
              flexDirection: zoomStyle.flexDirection,
              flexWrap: zoomStyle.flexWrap,
              whiteSpace: zoomStyle.whiteSpace
            }
          };
        }
      };
    })()
  `;
}

async function clickAndWaitForScale(cdp, testId, predicate) {
  await mouseClickTestId(cdp, testId);
  await waitFor(async () => {
    const state = await cdp.evaluate("window.__mindmapZoomTest.read()");
    return predicate(state.transform.scale);
  }, 10000);
}

async function mouseClickTestId(cdp, testId) {
  const point = await cdp.evaluate(`window.__mindmapZoomTest.centerOfTestId(${JSON.stringify(testId)})`);
  await dispatchMouseClick(cdp, point);
}

async function mouseClickByText(cdp, text) {
  const point = await cdp.evaluate(`window.__mindmapZoomTest.centerOfButtonText(${JSON.stringify(text)})`);
  await dispatchMouseClick(cdp, point);
}

async function mouseClickSelector(cdp, selector) {
  const point = await cdp.evaluate(`window.__mindmapZoomTest.centerOfSelector(${JSON.stringify(selector)})`);
  await dispatchMouseClick(cdp, point);
}

async function dispatchMouseClick(cdp, point) {
  const x = Math.round(point.x);
  const y = Math.round(point.y);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, pointerType: "mouse" });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    buttons: 1,
    clickCount: 1,
    pointerType: "mouse",
  });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    buttons: 0,
    clickCount: 1,
    pointerType: "mouse",
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
  throw new Error(`Timed out waiting for browser condition${await message()}`);
}

function assertAlmostEqual(actual, expected, tolerance) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

function assertCompactTidyLayout(nodes) {
  const root = nodes.find((node) => node.depth === 0);
  assert.ok(root, "expected root node in compact layout check");
  const byId = new Map(nodes.map((node) => [node.id, node]));

  const byParent = new Map();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const group = byParent.get(node.parentId) ?? [];
    group.push(node);
    byParent.set(node.parentId, group);
  }

  const rootChildren = byParent.get("root") ?? [];
  assert.ok(rootChildren.length >= 3, "expected multiple root children for tidy layout check");
  const rootChildLefts = rootChildren.map((node) => Math.round(node.left));
  assert.ok(Math.max(...rootChildLefts) - Math.min(...rootChildLefts) <= 2, "root children should share one column");

  for (const [parentId, children] of byParent.entries()) {
    const parent = byId.get(parentId);
    assert.ok(parent, `expected parent ${parentId}`);
    if (!children.length) continue;
    assert.ok(children.every((child) => child.left > parent.right), `${parent.text} children should be right-facing`);
    const top = Math.min(...children.map((child) => child.top));
    const bottom = Math.max(...children.map((child) => child.bottom));
    const parentCenter = (parent.top + parent.bottom) / 2;
    const childrenCenter = (top + bottom) / 2;
    assert.ok(
      Math.abs(parentCenter - childrenCenter) <= 8,
      `${parent.text} should be centered on children: parent=${parentCenter}, children=${childrenCenter}, children=${children
        .map((child) => child.text)
        .join(", ")}`,
    );

    const sorted = [...children].sort((a, b) => a.top - b.top);
    for (let index = 1; index < sorted.length; index += 1) {
      const gap = sorted[index].top - sorted[index - 1].bottom;
      assert.ok(gap >= -2, "sibling nodes should not overlap vertically");
      assert.ok(gap <= 90, `sibling gap should stay compact, got ${gap}`);
    }
  }

  for (let outer = 0; outer < nodes.length; outer += 1) {
    for (let inner = outer + 1; inner < nodes.length; inner += 1) {
      const a = nodes[outer];
      const b = nodes[inner];
      const overlaps =
        a.left < b.right - 2 &&
        a.right > b.left + 2 &&
        a.top < b.bottom - 2 &&
        a.bottom > b.top + 2;
      assert.equal(overlaps, false, `${a.text} should not overlap ${b.text}`);
    }
  }
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
