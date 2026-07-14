export const participantColors = [
  "#2563eb",
  "#0891b2",
  "#16a34a",
  "#0f766e",
  "#0284c7",
  "#65a30d",
  "#059669",
  "#1d4ed8",
];

export function pickColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return participantColors[hash % participantColors.length];
}

export const nodePalette = [
  "#2563eb",
  "#06b6d4",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
  "#84cc16",
  "#64748b",
  "#f59e0b",
];
