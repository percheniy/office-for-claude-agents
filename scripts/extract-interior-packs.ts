/**
 * Interior / MetroCity Pack Extraction Script
 *
 * Restores the furniture assets that live in the office layout but come from
 * neither the upstream base set nor Modern Office Revamped: home interior
 * items (cupboards, lamps, paintings, fireplace, sofas) and MetroCity cars.
 *
 * Each entry in SOURCES points at a sprite sheet plus the region to cut.
 * Regions are resolved three ways: `column` splits the sheet on fully
 * transparent columns and takes the Nth object, `cell` indexes a fixed grid,
 * and `rect` gives explicit pixel bounds. The cut is then trimmed to its
 * content and snapped outward to the 16px tile grid, exactly like
 * extract-modern-office.ts, so footprints stay consistent across packs.
 *
 * Usage:  npx tsx scripts/extract-interior-packs.ts
 * Output: webview-ui/public/assets/furniture/<ID>/  (PNG + manifest.json)
 */

import * as fs from "fs";
import * as path from "path";
import { PNG } from "pngjs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const TILE = 16;
const ALPHA_THRESHOLD = 10;

const PACKS_DIR = "/Users/grid/Desktop/asset-packs";
const OUTPUT_DIR = path.join(root, "webview-ui/public/assets/furniture");

type Region =
  | { kind: "column"; index: number }
  | { kind: "cell"; cell: number; cols: number; size: number }
  | { kind: "rect"; x: number; y: number; w: number; h: number };

interface Source {
  id: string;
  name: string;
  sheet: string;
  region: Region;
  category: string;
  canPlaceOnWalls?: boolean;
}

const SOURCES: Source[] = [
  {
    id: "CUPBOARD_2",
    name: "Cupboard 2",
    sheet: "Interior/Home/Cupboard-Sheet.png",
    region: { kind: "column", index: 2 },
    category: "storage",
  },
  {
    id: "CUPBOARD_6",
    name: "Cupboard 6",
    sheet: "Interior/Home/Cupboard-Sheet.png",
    region: { kind: "column", index: 6 },
    category: "storage",
  },
  {
    id: "LAMP_3",
    name: "Lamp 3",
    sheet: "Interior/Home/Lights-Sheet.png",
    region: { kind: "column", index: 3 },
    category: "decor",
  },
  {
    id: "LAMP_6",
    name: "Lamp 6",
    sheet: "Interior/Home/Lights-Sheet.png",
    region: { kind: "column", index: 6 },
    category: "decor",
  },
  {
    id: "PAINTING_SMALL_1",
    name: "Small Painting 1",
    sheet: "Interior/Home/Paintings-Sheet.png",
    region: { kind: "column", index: 1 },
    category: "wall",
    canPlaceOnWalls: true,
  },
  {
    id: "HOME_MISC_1",
    name: "Home Misc 1",
    sheet: "Interior/Home/Miscellaneous-Sheet.png",
    region: { kind: "column", index: 1 },
    category: "misc",
  },
  {
    id: "FIREPLACE_SMALL_F0",
    name: "Small Fireplace",
    sheet: "Interior/Home/Chimney-Sheet.png",
    region: { kind: "column", index: 1 },
    category: "decor",
  },
  {
    id: "SOFA_DARK_GRAY_SIDE",
    name: "Dark Gray Sofa (side)",
    sheet: "Interior/Home/LivingRoom1-Sheet.png",
    region: { kind: "cell", cell: 39, cols: 4, size: 96 },
    category: "chairs",
  },
  {
    id: "DARK_SEDAN_FRONT",
    name: "Dark Sedan (front)",
    sheet: "MetroCity/Cars-Sheet.png",
    region: { kind: "rect", x: 417, y: 172, w: 61, h: 42 },
    category: "misc",
  },
  {
    id: "POLICE_CAR_FRONT",
    name: "Police Car (front)",
    sheet: "MetroCity/Cars-Sheet.png",
    region: { kind: "rect", x: 546, y: 40, w: 60, h: 46 },
    category: "misc",
  },
  {
    id: "SPORTS_CAR_FRONT",
    name: "Sports Car (front)",
    sheet: "MetroCity/Cars-Sheet.png",
    region: { kind: "rect", x: 1053, y: 175, w: 69, h: 39 },
    category: "misc",
  },
  {
    id: "MI_067",
    name: "Modern Interiors 67",
    sheet: "Modern_Interiors_Free/Interiors_free/16x16/Interiors_free_16x16.png",
    region: { kind: "rect", x: 38, y: 394, w: 21, h: 14 },
    category: "wall",
    canPlaceOnWalls: true,
  },
];

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function isColumnEmpty(png: PNG, x: number): boolean {
  for (let y = 0; y < png.height; y++) {
    if (png.data[(y * png.width + x) * 4 + 3] > ALPHA_THRESHOLD) return false;
  }
  return true;
}

/** Split a sheet on fully transparent columns and return the Nth object band */
function columnBand(png: PNG, index: number): Rect {
  const bands: Array<[number, number]> = [];
  let start: number | null = null;
  for (let x = 0; x < png.width; x++) {
    const empty = isColumnEmpty(png, x);
    if (!empty && start === null) start = x;
    else if (empty && start !== null) {
      bands.push([start, x]);
      start = null;
    }
  }
  if (start !== null) bands.push([start, png.width]);

  const band = bands[index - 1];
  if (!band) {
    throw new Error(`column band ${index} not found (sheet has ${bands.length})`);
  }
  return { x: band[0], y: 0, w: band[1] - band[0], h: png.height };
}

function gridCell(cell: number, cols: number, size: number): Rect {
  const row = Math.floor((cell - 1) / cols);
  const col = (cell - 1) % cols;
  return { x: col * size, y: row * size, w: size, h: size };
}

/** Tight bounding box of non-transparent pixels inside a region */
function contentBounds(png: PNG, region: Rect): Rect | null {
  let minX = region.x + region.w;
  let minY = region.y + region.h;
  let maxX = -1;
  let maxY = -1;
  for (let y = region.y; y < region.y + region.h; y++) {
    for (let x = region.x; x < region.x + region.w; x++) {
      if (png.data[(y * png.width + x) * 4 + 3] > ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Grow a rect outward until both axes align to the tile grid */
function snapToGrid(rect: Rect): Rect {
  const x = Math.floor(rect.x / TILE) * TILE;
  const y = Math.floor(rect.y / TILE) * TILE;
  const x2 = Math.ceil((rect.x + rect.w) / TILE) * TILE;
  const y2 = Math.ceil((rect.y + rect.h) / TILE) * TILE;
  return { x, y, w: x2 - x, h: y2 - y };
}

/** Center a snapped rect on its content so wide sprites keep their padding */
function centerOnContent(content: Rect, snapped: Rect, png: PNG): Rect {
  const slack = snapped.w - content.w;
  const shift = Math.floor(slack / 2);
  const x = Math.max(0, Math.min(png.width - snapped.w, content.x - shift));
  return { ...snapped, x };
}

function cropPng(src: PNG, rect: Rect): PNG {
  const dst = new PNG({ width: rect.w, height: rect.h });
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      const sx = rect.x + x;
      const sy = rect.y + y;
      const srcIdx = (sy * src.width + sx) * 4;
      const dstIdx = (y * rect.w + x) * 4;
      const inside = sx >= 0 && sx < src.width && sy >= 0 && sy < src.height;
      dst.data[dstIdx] = inside ? src.data[srcIdx] : 0;
      dst.data[dstIdx + 1] = inside ? src.data[srcIdx + 1] : 0;
      dst.data[dstIdx + 2] = inside ? src.data[srcIdx + 2] : 0;
      dst.data[dstIdx + 3] = inside ? src.data[srcIdx + 3] : 0;
    }
  }
  return dst;
}

function resolveRegion(png: PNG, region: Region): Rect {
  if (region.kind === "column") return columnBand(png, region.index);
  if (region.kind === "cell") return gridCell(region.cell, region.cols, region.size);
  return { x: region.x, y: region.y, w: region.w, h: region.h };
}

function main(): void {
  let extracted = 0;

  for (const source of SOURCES) {
    const sheetPath = path.join(PACKS_DIR, source.sheet);
    if (!fs.existsSync(sheetPath)) {
      console.error(`Sheet not found for ${source.id}: ${sheetPath}`);
      continue;
    }

    const png = PNG.sync.read(fs.readFileSync(sheetPath));
    const region = resolveRegion(png, source.region);
    const content = contentBounds(png, region);
    if (!content) {
      console.error(`No content for ${source.id} in ${source.sheet}`);
      continue;
    }

    const rect = centerOnContent(content, snapToGrid(content), png);
    const sprite = cropPng(png, rect);
    const tileW = rect.w / TILE;
    const tileH = rect.h / TILE;

    // Tall sprites stand on their bottom row; wide ones occupy up to two rows.
    const footprintH = tileH > tileW ? 1 : Math.min(tileH, 2);
    const backgroundTiles = Math.max(0, tileH - footprintH);

    const itemDir = path.join(OUTPUT_DIR, source.id);
    fs.mkdirSync(itemDir, { recursive: true });
    fs.writeFileSync(path.join(itemDir, `${source.id}.png`), PNG.sync.write(sprite));
    fs.writeFileSync(
      path.join(itemDir, "manifest.json"),
      JSON.stringify(
        {
          id: source.id,
          name: source.name,
          category: source.category,
          type: "asset",
          canPlaceOnWalls: source.canPlaceOnWalls ?? false,
          canPlaceOnSurfaces: false,
          backgroundTiles,
          width: rect.w,
          height: rect.h,
          footprintW: tileW,
          footprintH,
        },
        null,
        2,
      ) + "\n",
    );

    console.log(`${source.id}: ${rect.w}x${rect.h} (${tileW}x${tileH} tiles)`);
    extracted++;
  }

  console.log(`\nDone! Extracted: ${extracted} / ${SOURCES.length}`);
  console.log("Rebuild to apply: npm run build");
}

main();
