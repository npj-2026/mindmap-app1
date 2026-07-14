require("./helpers/register-ts.cjs");

const assert = require("node:assert/strict");
const test = require("node:test");
const { generateFallbackMap, hasMarkdownOutline } = require("../lib/ai/fallback.ts");
const { generateMindMapFromDocument } = require("../lib/ai/provider.ts");

const options = {
  method: "brief",
  detail: "normal",
  maxDepth: 6,
  maxTopLevel: 8,
  maxChildren: 8,
  customInstruction: "",
};

function titlesByChain(map) {
  const titles = [map.title];
  let current = map.children[0];
  while (current) {
    titles.push(current.title);
    current = current.children[0];
  }
  return titles;
}

function childCountsByChain(map) {
  const counts = [map.children.length];
  let current = map.children[0];
  while (current) {
    counts.push(current.children.length);
    current = current.children[0];
  }
  return counts;
}

test("Markdown headings create a six-level mind map without flattening", () => {
  const text = `# Needsproject JAPAN

## 通信・デジタル支援
### 事業者向け支援
#### Webサイト支援
##### 既存サイト診断
###### SEO・表示速度・導線を分析`;

  const map = generateFallbackMap({ name: "markdown.md", text, kind: "text" }, options);

  assert.equal(hasMarkdownOutline(text), true);
  assert.deepEqual(titlesByChain(map), [
    "Needsproject JAPAN",
    "通信・デジタル支援",
    "事業者向け支援",
    "Webサイト支援",
    "既存サイト診断",
    "SEO・表示速度・導線を分析",
  ]);
  assert.deepEqual(childCountsByChain(map), [1, 1, 1, 1, 1, 0]);
});

test("Indented bullets keep hierarchy before trimming text", () => {
  const text = `中心テーマ
- 大項目
  - 中項目
    - 小項目
      - 詳細項目`;

  const map = generateFallbackMap({ name: "bullets.txt", text, kind: "text" }, options);

  assert.deepEqual(titlesByChain(map), ["中心テーマ", "大項目", "中項目", "小項目", "詳細項目"]);
  assert.deepEqual(childCountsByChain(map), [1, 1, 1, 1, 0]);
});

test("Markdown structure bypasses AI reconstruction even when AI_API_KEY is set", async () => {
  const originalKey = process.env.AI_API_KEY;
  const originalFetch = global.fetch;
  process.env.AI_API_KEY = "test-key";
  global.fetch = async () => {
    throw new Error("fetch should not be called for deterministic markdown");
  };

  try {
    const text = `# Needsproject JAPAN

## 通信・デジタル支援
### 事業者向け支援`;
    const response = await generateMindMapFromDocument({ name: "markdown.md", text, kind: "text" }, options);

    assert.equal(response.aiConfigured, true);
    assert.deepEqual(titlesByChain(response.map), [
      "Needsproject JAPAN",
      "通信・デジタル支援",
      "事業者向け支援",
    ]);
    assert.deepEqual(childCountsByChain(response.map), [1, 1, 0]);
  } finally {
    if (originalKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = originalKey;
    global.fetch = originalFetch;
  }
});
