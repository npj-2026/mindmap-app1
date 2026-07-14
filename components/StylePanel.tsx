"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  CaseSensitive,
  ChevronDown,
  ChevronRight,
  Copy,
  Italic,
  PaintBucket,
  Pilcrow,
  Shapes,
  Sparkles,
  Strikethrough,
  Underline,
} from "lucide-react";
import type { MindNode, NodeShape, NodeStyle } from "@/types/mindmap";
import { defaultNodeStyle, japaneseFontOptions, normalizeStyle, stylePresets } from "@/lib/stylePresets";
import { nodePalette } from "@/lib/colors";
import { readableTextColor } from "@/lib/styleRuntime";

type ApplyScope = "level" | "children" | "all";

type StylePanelProps = {
  selectedNodes: MindNode[];
  canEdit: boolean;
  hasCopiedStyle: boolean;
  onPatchStyle: (patch: Partial<NodeStyle>) => void;
  onPatchNode: (patch: Partial<Pick<MindNode, "width" | "height">>) => void;
  onCopyStyle: () => void;
  onPasteStyle: () => void;
  onApplyScope: (scope: ApplyScope) => void;
  onClose?: () => void;
};

const shapeOptions: Array<{ label: string; value: NodeShape }> = [
  { label: "角丸", value: "rounded" },
  { label: "四角", value: "rectangle" },
  { label: "カプセル", value: "capsule" },
  { label: "円", value: "circle" },
  { label: "楕円", value: "ellipse" },
  { label: "ひし形", value: "diamond" },
  { label: "六角形", value: "hexagon" },
  { label: "吹き出し", value: "speech" },
  { label: "付箋", value: "sticky" },
  { label: "下線のみ", value: "underline" },
  { label: "枠なし", value: "none" },
  { label: "自由角丸", value: "custom" },
];

const generatedPalette = Array.from({ length: 256 }, (_, index) => {
  const hue = (index % 32) * 11.25;
  const row = Math.floor(index / 32);
  const lightness = 28 + row * 7;
  return hslToHex(hue, row < 3 ? 78 : 62, lightness);
});

export function StylePanel({
  selectedNodes,
  canEdit,
  hasCopiedStyle,
  onPatchStyle,
  onPatchNode,
  onCopyStyle,
  onPasteStyle,
  onApplyScope,
  onClose,
}: StylePanelProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    easy: true,
    detail: false,
  });
  const primaryNode = selectedNodes[0];
  const style = normalizeStyle(primaryNode?.style, primaryNode?.color);
  const selectedCount = selectedNodes.length;
  const canUse = canEdit && selectedCount > 0;
  const readableSuggestion = useMemo(() => readableTextColor(style.backgroundColor), [style.backgroundColor]);

  function toggle(section: string) {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  }

  return (
    <aside className="style-panel" aria-label="選択中ノードのスタイル編集">
      <div className="style-panel-head">
        <div>
          <span className="panel-eyebrow">スタイル</span>
          <h2>{selectedCount > 1 ? `${selectedCount}個のノード` : primaryNode?.text || "ノード未選択"}</h2>
        </div>
        {onClose ? (
          <button type="button" className="panel-close" onClick={onClose} aria-label="スタイルパネルを閉じる">
            ×
          </button>
        ) : null}
      </div>

      {!primaryNode ? <div className="panel-empty">ノードを選ぶと、文字や色を編集できます。</div> : null}

      {primaryNode ? (
        <>
          <section className="panel-section open">
            <button type="button" className="section-toggle" onClick={() => toggle("easy")}>
              {openSections.easy ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              かんたん設定
            </button>
            {openSections.easy ? (
              <div className="section-body">
                <label className="field">
                  <span>フォント</span>
                  <select value={style.fontFamily} disabled={!canUse} onChange={(event) => onPatchStyle({ fontFamily: event.target.value })}>
                    {japaneseFontOptions.map((font) => (
                      <option key={font.label} value={font.value}>
                        {font.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>文字サイズ</span>
                  <input
                    type="range"
                    min="10"
                    max="48"
                    value={style.fontSize}
                    disabled={!canUse}
                    onChange={(event) => onPatchStyle({ fontSize: Number(event.target.value) })}
                  />
                  <em>{style.fontSize}px</em>
                </label>
                <ColorField label="文字色" value={style.textColor} disabled={!canUse} onChange={(textColor) => onPatchStyle({ textColor })} />
                <button
                  type="button"
                  className="suggest-button"
                  disabled={!canUse}
                  onClick={() => onPatchStyle({ textColor: readableSuggestion })}
                >
                  <Sparkles size={15} />
                  読みやすい文字色にする
                </button>
                <ColorField label="背景色" value={style.backgroundColor} disabled={!canUse} onChange={(backgroundColor) => onPatchStyle({ backgroundMode: "solid", backgroundColor })} />
                <label className="field">
                  <span>枠の形</span>
                  <select value={style.shape} disabled={!canUse} onChange={(event) => onPatchStyle({ shape: event.target.value as NodeShape })}>
                    {shapeOptions.map((shape) => (
                      <option key={shape.value} value={shape.value}>
                        {shape.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>枠線</span>
                  <select value={style.borderStyle} disabled={!canUse} onChange={(event) => onPatchStyle({ borderStyle: event.target.value as NodeStyle["borderStyle"] })}>
                    <option value="solid">実線</option>
                    <option value="dashed">破線</option>
                    <option value="dotted">点線</option>
                    <option value="double">二重線</option>
                    <option value="heavy">太い実線</option>
                    <option value="none">枠線なし</option>
                  </select>
                </label>
                <div className="preset-grid">
                  {stylePresets.map((preset) => (
                    <button key={preset.name} type="button" disabled={!canUse} onClick={() => onPatchStyle(preset.style)}>
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <section className="panel-section">
            <button type="button" className="section-toggle" onClick={() => toggle("detail")}>
              {openSections.detail ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              詳細設定
            </button>
            {openSections.detail ? (
              <div className="section-body detail-body">
                <SubSection title="文字" icon={<Pilcrow size={15} />}>
                  <div className="segmented">
                    <button type="button" disabled={!canUse} className={style.fontWeight >= 700 ? "active" : ""} onClick={() => onPatchStyle({ fontWeight: style.fontWeight >= 700 ? 400 : 700 })}>
                      <Bold size={15} />
                      太字
                    </button>
                    <button type="button" disabled={!canUse} className={style.fontWeight <= 300 ? "active" : ""} onClick={() => onPatchStyle({ fontWeight: style.fontWeight <= 300 ? 400 : 300 })}>
                      細字
                    </button>
                    <button type="button" disabled={!canUse} className={style.italic ? "active" : ""} onClick={() => onPatchStyle({ italic: !style.italic })}>
                      <Italic size={15} />
                      斜体
                    </button>
                    <button type="button" disabled={!canUse} className={style.underline ? "active" : ""} onClick={() => onPatchStyle({ underline: !style.underline })}>
                      <Underline size={15} />
                      下線
                    </button>
                    <button type="button" disabled={!canUse} className={style.strike ? "active" : ""} onClick={() => onPatchStyle({ strike: !style.strike })}>
                      <Strikethrough size={15} />
                      取消
                    </button>
                  </div>
                  <div className="segmented">
                    <button type="button" disabled={!canUse} className={style.textAlign === "left" ? "active" : ""} onClick={() => onPatchStyle({ textAlign: "left" })}>
                      <AlignLeft size={15} />
                      左
                    </button>
                    <button type="button" disabled={!canUse} className={style.textAlign === "center" ? "active" : ""} onClick={() => onPatchStyle({ textAlign: "center" })}>
                      <AlignCenter size={15} />
                      中央
                    </button>
                    <button type="button" disabled={!canUse} className={style.textAlign === "right" ? "active" : ""} onClick={() => onPatchStyle({ textAlign: "right" })}>
                      <AlignRight size={15} />
                      右
                    </button>
                  </div>
                  <Slider label="透明度" min={0} max={1} step={0.05} value={style.textOpacity} disabled={!canUse} suffix="" onChange={(textOpacity) => onPatchStyle({ textOpacity })} />
                  <Slider label="行間" min={1} max={2.2} step={0.05} value={style.lineHeight} disabled={!canUse} suffix="" onChange={(lineHeight) => onPatchStyle({ lineHeight })} />
                  <Slider label="文字間隔" min={0} max={8} step={0.5} value={style.letterSpacing} disabled={!canUse} suffix="px" onChange={(letterSpacing) => onPatchStyle({ letterSpacing })} />
                  <div className="segmented">
                    <button type="button" disabled={!canUse} className={style.writingMode === "horizontal" ? "active" : ""} onClick={() => onPatchStyle({ writingMode: "horizontal" })}>
                      横書き
                    </button>
                    <button type="button" disabled={!canUse} className={style.writingMode === "vertical" ? "active" : ""} onClick={() => onPatchStyle({ writingMode: "vertical" })}>
                      縦書き
                    </button>
                  </div>
                  <div className="segmented">
                    <button type="button" disabled={!canUse} onClick={() => onPatchStyle({ textTransform: "uppercase" })}>
                      <CaseSensitive size={15} />
                      大文字
                    </button>
                    <button type="button" disabled={!canUse} onClick={() => onPatchStyle({ textTransform: "lowercase" })}>
                      小文字
                    </button>
                    <button type="button" disabled={!canUse} onClick={() => onPatchStyle(textReset())}>
                      リセット
                    </button>
                  </div>
                </SubSection>

                <SubSection title="色" icon={<PaintBucket size={15} />}>
                  <ColorField label="枠線色" value={style.borderColor} disabled={!canUse} onChange={(borderColor) => onPatchStyle({ borderColor })} />
                  <ColorField label="影の色" value={style.shadowColor} disabled={!canUse} onChange={(shadowColor) => onPatchStyle({ shadowColor })} />
                </SubSection>

                <SubSection title="形・枠線" icon={<Shapes size={15} />}>
                  <Slider label="枠線太さ" min={0} max={12} step={1} value={style.borderWidth} disabled={!canUse} suffix="px" onChange={(borderWidth) => onPatchStyle({ borderWidth, borderTopWidth: borderWidth, borderRightWidth: borderWidth, borderBottomWidth: borderWidth, borderLeftWidth: borderWidth })} />
                  <Slider label="枠線透明度" min={0} max={1} step={0.05} value={style.borderOpacity} disabled={!canUse} suffix="" onChange={(borderOpacity) => onPatchStyle({ borderOpacity })} />
                  <Slider label="角丸" min={0} max={100} step={1} value={style.borderRadius} disabled={!canUse} suffix="px" onChange={(borderRadius) => onPatchStyle({ borderRadius, shape: "custom" })} />
                  <div className="four-grid">
                    <NumberField label="上" value={style.borderTopWidth} disabled={!canUse} onChange={(borderTopWidth) => onPatchStyle({ borderTopWidth })} />
                    <NumberField label="右" value={style.borderRightWidth} disabled={!canUse} onChange={(borderRightWidth) => onPatchStyle({ borderRightWidth })} />
                    <NumberField label="下" value={style.borderBottomWidth} disabled={!canUse} onChange={(borderBottomWidth) => onPatchStyle({ borderBottomWidth })} />
                    <NumberField label="左" value={style.borderLeftWidth} disabled={!canUse} onChange={(borderLeftWidth) => onPatchStyle({ borderLeftWidth })} />
                  </div>
                  <label className="field">
                    <span>枠線位置</span>
                    <select value={style.borderPosition} disabled={!canUse} onChange={(event) => onPatchStyle({ borderPosition: event.target.value as NodeStyle["borderPosition"] })}>
                      <option value="inside">内側</option>
                      <option value="center">中央</option>
                      <option value="outside">外側</option>
                    </select>
                  </label>
                  <button type="button" disabled={!canUse} onClick={() => onPatchStyle(borderReset())}>
                    枠線をリセット
                  </button>
                </SubSection>

                <SubSection title="背景・影" icon={<PaintBucket size={15} />}>
                  <label className="field">
                    <span>背景</span>
                    <select value={style.backgroundMode} disabled={!canUse} onChange={(event) => onPatchStyle({ backgroundMode: event.target.value as NodeStyle["backgroundMode"] })}>
                      <option value="solid">単色</option>
                      <option value="gradient">グラデーション</option>
                      <option value="none">背景なし</option>
                    </select>
                  </label>
                  <Slider label="背景透明度" min={0} max={1} step={0.05} value={style.backgroundOpacity} disabled={!canUse} suffix="" onChange={(backgroundOpacity) => onPatchStyle({ backgroundOpacity })} />
                  <ColorField label="開始色" value={style.gradientFrom} disabled={!canUse} onChange={(gradientFrom) => onPatchStyle({ backgroundMode: "gradient", gradientFrom })} />
                  <ColorField label="終了色" value={style.gradientTo} disabled={!canUse} onChange={(gradientTo) => onPatchStyle({ backgroundMode: "gradient", gradientTo })} />
                  <label className="field">
                    <span>方向</span>
                    <select value={style.gradientDirection} disabled={!canUse} onChange={(event) => onPatchStyle({ gradientDirection: event.target.value as NodeStyle["gradientDirection"] })}>
                      <option value="vertical">縦方向</option>
                      <option value="horizontal">横方向</option>
                      <option value="diagonal">斜め方向</option>
                      <option value="radial">放射状</option>
                    </select>
                  </label>
                  <label className="toggle-field">
                    <input type="checkbox" checked={style.shadowEnabled} disabled={!canUse} onChange={(event) => onPatchStyle({ shadowEnabled: event.target.checked })} />
                    影を付ける
                  </label>
                  <Slider label="影の濃さ" min={0} max={1} step={0.05} value={style.shadowOpacity} disabled={!canUse} suffix="" onChange={(shadowOpacity) => onPatchStyle({ shadowOpacity })} />
                  <Slider label="ぼかし" min={0} max={60} step={1} value={style.shadowBlur} disabled={!canUse} suffix="px" onChange={(shadowBlur) => onPatchStyle({ shadowBlur })} />
                  <div className="two-grid">
                    <NumberField label="横位置" value={style.shadowX} disabled={!canUse} min={-40} max={40} onChange={(shadowX) => onPatchStyle({ shadowX })} />
                    <NumberField label="縦位置" value={style.shadowY} disabled={!canUse} min={-40} max={40} onChange={(shadowY) => onPatchStyle({ shadowY })} />
                  </div>
                </SubSection>

                <SubSection title="サイズ・配置" icon={<Shapes size={15} />}>
                  <label className="toggle-field">
                    <input type="checkbox" checked={style.autoSize} disabled={!canUse} onChange={(event) => onPatchStyle({ autoSize: event.target.checked })} />
                    文字量に合わせる
                  </label>
                  <div className="two-grid">
                    <NumberField label="横幅" value={primaryNode.width} disabled={!canUse || style.autoSize} min={80} max={520} onChange={(width) => onPatchNode({ width })} />
                    <NumberField label="高さ" value={primaryNode.height} disabled={!canUse || style.autoSize} min={48} max={320} onChange={(height) => onPatchNode({ height })} />
                  </div>
                  <div className="two-grid">
                    <NumberField label="最小幅" value={style.minWidth} disabled={!canUse} min={80} max={520} onChange={(minWidth) => onPatchStyle({ minWidth })} />
                    <NumberField label="最小高さ" value={style.minHeight} disabled={!canUse} min={48} max={320} onChange={(minHeight) => onPatchStyle({ minHeight })} />
                  </div>
                  <div className="four-grid">
                    <NumberField label="上余白" value={style.paddingTop} disabled={!canUse} min={4} max={48} onChange={(paddingTop) => onPatchStyle({ paddingTop })} />
                    <NumberField label="右余白" value={style.paddingRight} disabled={!canUse} min={4} max={48} onChange={(paddingRight) => onPatchStyle({ paddingRight })} />
                    <NumberField label="下余白" value={style.paddingBottom} disabled={!canUse} min={4} max={48} onChange={(paddingBottom) => onPatchStyle({ paddingBottom })} />
                    <NumberField label="左余白" value={style.paddingLeft} disabled={!canUse} min={4} max={48} onChange={(paddingLeft) => onPatchStyle({ paddingLeft })} />
                  </div>
                  <Slider label="ノード間隔" min={80} max={260} step={10} value={style.siblingSpacing} disabled={!canUse} suffix="px" onChange={(siblingSpacing) => onPatchStyle({ siblingSpacing })} />
                  <label className="toggle-field">
                    <input type="checkbox" checked={style.emphasis} disabled={!canUse} onChange={(event) => onPatchStyle({ emphasis: event.target.checked })} />
                    重要として強調
                  </label>
                </SubSection>
              </div>
            ) : null}
          </section>

          <section className="panel-section action-section">
            <button type="button" disabled={!canUse} onClick={onCopyStyle}>
              <Copy size={15} />
              スタイルのみコピー
            </button>
            <button type="button" disabled={!canUse || !hasCopiedStyle} onClick={onPasteStyle}>
              貼り付け
            </button>
            <button type="button" disabled={!canUse} onClick={() => onApplyScope("level")}>
              同じ階層へ適用
            </button>
            <button type="button" disabled={!canUse} onClick={() => onApplyScope("children")}>
              配下へ適用
            </button>
            <button type="button" disabled={!canUse} onClick={() => onApplyScope("all")}>
              すべてへ適用
            </button>
            <button
              type="button"
              disabled={!canUse}
              onClick={() => window.localStorage.setItem("mindmap:default-style", JSON.stringify(style))}
            >
              デフォルトに保存
            </button>
          </section>
        </>
      ) : null}
    </aside>
  );
}

function SubSection({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sub-section">
      <button type="button" className="sub-toggle" onClick={() => setOpen((current) => !current)}>
        {icon}
        {title}
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
      </button>
      {open ? <div className="sub-body">{children}</div> : null}
    </div>
  );
}

function ColorField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [showPalette, setShowPalette] = useState(false);
  return (
    <div className="color-field">
      <div className="field">
        <span>{label}</span>
        <div className="color-row">
          <input type="color" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
          <input
            value={value}
            disabled={disabled}
            maxLength={7}
            onChange={(event) => {
              const next = event.target.value;
              if (/^#[0-9a-fA-F]{0,6}$/.test(next)) onChange(next);
            }}
          />
          <button type="button" disabled={disabled} onClick={() => setShowPalette((current) => !current)}>
            256色
          </button>
        </div>
      </div>
      {showPalette ? (
        <div className="mini-palette">
          {[...nodePalette, ...generatedPalette].slice(0, 256).map((color, index) => (
            <button
              key={`${color}-${index}`}
              type="button"
              style={{ background: color }}
              aria-label={`${label} ${color}`}
              onClick={() => onChange(color)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />
      <em>
        {Number.isInteger(value) ? value : value.toFixed(2)}
        {suffix}
      </em>
    </label>
  );
}

function NumberField({
  label,
  value,
  disabled,
  min = 0,
  max = 999,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <input type="number" min={min} max={max} value={Math.round(value)} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function textReset(): Partial<NodeStyle> {
  return {
    fontFamily: defaultNodeStyle.fontFamily,
    fontSize: defaultNodeStyle.fontSize,
    fontWeight: defaultNodeStyle.fontWeight,
    italic: false,
    underline: false,
    strike: false,
    textColor: defaultNodeStyle.textColor,
    textOpacity: 1,
    textAlign: defaultNodeStyle.textAlign,
    lineHeight: defaultNodeStyle.lineHeight,
    letterSpacing: 0,
    writingMode: "horizontal",
    textTransform: "none",
  };
}

function borderReset(): Partial<NodeStyle> {
  return {
    borderStyle: defaultNodeStyle.borderStyle,
    borderColor: defaultNodeStyle.borderColor,
    borderWidth: defaultNodeStyle.borderWidth,
    borderOpacity: 1,
    borderRadius: defaultNodeStyle.borderRadius,
    borderTopWidth: defaultNodeStyle.borderTopWidth,
    borderRightWidth: defaultNodeStyle.borderRightWidth,
    borderBottomWidth: defaultNodeStyle.borderBottomWidth,
    borderLeftWidth: defaultNodeStyle.borderLeftWidth,
    borderPosition: "center",
  };
}

function hslToHex(h: number, s: number, l: number) {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)]
    .map((value) =>
      Math.round(255 * value)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
