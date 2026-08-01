/**
 * Asset Loader — Loads character sprites, wall tile sets, floor tiles, furniture,
 * and default layout from disk using shared asset pipeline modules.
 *
 * Ported from upstream (no VS Code dependency). Uses per-folder manifests
 * for furniture and supports multiple wall tile sets.
 */

import * as fs from "fs";
import * as path from "path";

import { CHAR_COUNT, CHAR_FRAMES_PER_ROW, WALL_BITMASK_COUNT } from "../shared/assets/constants.js";
import type { FurnitureAsset, InheritedProps, ManifestGroup, FurnitureManifest } from "../shared/assets/manifestUtils.js";
import { flattenManifest } from "../shared/assets/manifestUtils.js";
import { decodeCharacterPng, decodeFloorPng, parseWallPng, pngToSpriteData } from "../shared/assets/pngDecoder.js";
import type { CharacterDirectionSprites } from "../shared/assets/types.js";

export type { FurnitureAsset } from "../shared/assets/manifestUtils.js";
export type { CharacterDirectionSprites } from "../shared/assets/types.js";

export interface LoadedCharacterSprites {
  characters: CharacterDirectionSprites[];
}

/**
 * Wall tiles now use a sets-based format to support multiple wall tile sets.
 * Each set is an array of 16 sprites indexed by bitmask (N=1,E=2,S=4,W=8).
 */
export interface LoadedWallTiles {
  sets: string[][][][];
}

export interface LoadedFloorTiles {
  sprites: string[][][];
}

export interface LoadedFurnitureAssets {
  catalog: FurnitureAsset[];
  sprites: Record<string, string[][]>;
}

// ── Helper ──────────────────────────────────────────────────────────────

function listSortedPngs(dir: string, pattern: RegExp): { index: number; filename: string }[] {
  if (!fs.existsSync(dir)) return [];
  const files: { index: number; filename: string }[] = [];
  for (const entry of fs.readdirSync(dir)) {
    const match = pattern.exec(entry);
    if (match) {
      files.push({ index: parseInt(match[1], 10), filename: entry });
    }
  }
  return files.sort((a, b) => a.index - b.index);
}

// ── Character sprites ───────────────────────────────────────────────────

export function loadCharacterSprites(assetsRoot: string, customDirectory?: string): LoadedCharacterSprites | null {
  try {
    const charDir = path.join(assetsRoot, "characters");
    const characters: CharacterDirectionSprites[] = [];

    for (let ci = 0; ci < CHAR_COUNT; ci++) {
      const bundledPath = path.join(charDir, `char_${ci}.png`);
      if (!fs.existsSync(bundledPath)) {
        console.log(`[AssetLoader] No bundled character sprite found at: ${bundledPath}`);
        return null;
      }
      let pngBuffer = fs.readFileSync(bundledPath);
      const customPath = customDirectory ? path.join(customDirectory, `char_${ci}.png`) : null;
      if (customPath && fs.existsSync(customPath)) {
        try {
          pngBuffer = fs.readFileSync(customPath);
          decodeCharacterPng(pngBuffer);
          console.log(`[AssetLoader] Using custom character pack sprite: ${customPath}`);
        } catch (err) {
          console.warn(`[AssetLoader] Invalid custom sprite ${customPath}; using bundled fallback: ${err instanceof Error ? err.message : err}`);
          pngBuffer = fs.readFileSync(bundledPath);
        }
      }
      characters.push(decodeCharacterPng(pngBuffer));
    }

    console.log(
      `[AssetLoader] Loaded ${characters.length} character sprites (${CHAR_FRAMES_PER_ROW} frames x 3 directions each)`,
    );
    return { characters };
  } catch (err) {
    console.error(`[AssetLoader] Error loading character sprites: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// ── Wall tiles (multi-set) ──────────────────────────────────────────────

export function loadWallTiles(assetsRoot: string): LoadedWallTiles | null {
  try {
    const wallsDir = path.join(assetsRoot, "walls");
    if (!fs.existsSync(wallsDir)) {
      // Fall back to legacy single-file walls.png
      const legacyPath = path.join(assetsRoot, "walls.png");
      if (!fs.existsSync(legacyPath)) {
        console.log("[AssetLoader] No walls/ directory or walls.png found");
        return null;
      }
      const pngBuffer = fs.readFileSync(legacyPath);
      const sprites = parseWallPng(pngBuffer);
      console.log(`[AssetLoader] Loaded 1 wall tile set from legacy walls.png (${sprites.length} pieces)`);
      return { sets: [sprites] };
    }

    // Find all wall_N.png files and sort by index
    const wallFiles = listSortedPngs(wallsDir, /^wall_(\d+)\.png$/i);

    if (wallFiles.length === 0) {
      console.log("[AssetLoader] No wall_N.png files found in walls/");
      return null;
    }

    const sets: string[][][][] = [];
    for (const { filename } of wallFiles) {
      const filePath = path.join(wallsDir, filename);
      const pngBuffer = fs.readFileSync(filePath);
      const sprites = parseWallPng(pngBuffer);
      sets.push(sprites);
    }

    console.log(
      `[AssetLoader] Loaded ${sets.length} wall tile set(s) (${sets.length * WALL_BITMASK_COUNT} pieces total)`,
    );
    return { sets };
  } catch (err) {
    console.error(`[AssetLoader] Error loading wall tiles: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// ── Floor tiles ─────────────────────────────────────────────────────────

export function loadFloorTiles(assetsRoot: string): LoadedFloorTiles | null {
  try {
    const floorsDir = path.join(assetsRoot, "floors");
    if (!fs.existsSync(floorsDir)) {
      return null;
    }

    const floorFiles = listSortedPngs(floorsDir, /^floor_(\d+)\.png$/i);
    if (floorFiles.length === 0) {
      return null;
    }

    const sprites: string[][][] = [];
    for (const { filename } of floorFiles) {
      const filePath = path.join(floorsDir, filename);
      const pngBuffer = fs.readFileSync(filePath);
      sprites.push(decodeFloorPng(pngBuffer));
    }

    console.log(`[AssetLoader] Loaded ${sprites.length} floor tile patterns`);
    return { sprites };
  } catch (err) {
    console.error(`[AssetLoader] Error loading floor tiles: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// ── Furniture (manifest-based) ──────────────────────────────────────────

export function loadFurnitureAssets(assetsRoot: string): LoadedFurnitureAssets | null {
  try {
    const furnitureDir = path.join(assetsRoot, "furniture");
    if (!fs.existsSync(furnitureDir)) {
      return null;
    }

    const entries = fs.readdirSync(furnitureDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));

    if (dirs.length === 0) {
      return null;
    }

    const catalog: FurnitureAsset[] = [];
    const sprites: Record<string, string[][]> = {};

    for (const dir of dirs) {
      const itemDir = path.join(furnitureDir, dir.name);
      const manifestPath = path.join(itemDir, "manifest.json");

      if (!fs.existsSync(manifestPath)) {
        continue;
      }

      try {
        const manifestContent = fs.readFileSync(manifestPath, "utf-8");
        const manifest = JSON.parse(manifestContent) as FurnitureManifest;

        // Build the inherited props from the root manifest
        const inherited: InheritedProps = {
          groupId: manifest.id,
          name: manifest.name,
          category: manifest.category,
          canPlaceOnWalls: manifest.canPlaceOnWalls,
          canPlaceOnSurfaces: manifest.canPlaceOnSurfaces,
          backgroundTiles: manifest.backgroundTiles,
          isDoor: (manifest as Record<string, unknown>).isDoor === true,
        };

        let assets: FurnitureAsset[];

        if (manifest.type === "asset") {
          // Single asset manifest (no groups) — file defaults to {id}.png
          if (
            manifest.width == null ||
            manifest.height == null ||
            manifest.footprintW == null ||
            manifest.footprintH == null
          ) {
            continue;
          }
          assets = [
            {
              id: manifest.id,
              name: manifest.name,
              label: manifest.name,
              category: manifest.category,
              file: manifest.file ?? `${manifest.id}.png`,
              width: manifest.width,
              height: manifest.height,
              footprintW: manifest.footprintW,
              footprintH: manifest.footprintH,
              isDesk: manifest.isDesk ?? (manifest.category === "desks"),
              isDoor: (manifest as Record<string, unknown>).isDoor === true,
              canPlaceOnWalls: manifest.canPlaceOnWalls,
              canPlaceOnSurfaces: manifest.canPlaceOnSurfaces,
              backgroundTiles: manifest.backgroundTiles,
              groupId: manifest.id,
              ...((manifest as Record<string, unknown>).orientation ? { orientation: (manifest as Record<string, unknown>).orientation as string } : {}),
            },
          ];
        } else {
          // Group manifest — flatten recursively
          if (!manifest.members) continue;
          if (manifest.rotationScheme) {
            inherited.rotationScheme = manifest.rotationScheme;
          }
          const rootGroup: ManifestGroup = {
            type: "group",
            groupType: manifest.groupType as "rotation" | "state" | "animation",
            rotationScheme: manifest.rotationScheme,
            members: manifest.members,
          };
          assets = flattenManifest(rootGroup, inherited);
        }

        // Load PNGs for each asset
        for (const asset of assets) {
          try {
            const assetPath = path.join(itemDir, asset.file);
            const resolvedAsset = path.resolve(assetPath);
            const resolvedDir = path.resolve(itemDir);
            if (
              !resolvedAsset.startsWith(resolvedDir + path.sep) &&
              resolvedAsset !== resolvedDir
            ) {
              console.warn(`  [AssetLoader] Skipping asset with path outside directory: ${asset.file}`);
              continue;
            }
            if (!fs.existsSync(assetPath)) {
              console.warn(`  [AssetLoader] Asset file not found: ${asset.file} in ${dir.name}`);
              continue;
            }

            const pngBuffer = fs.readFileSync(assetPath);
            sprites[asset.id] = pngToSpriteData(pngBuffer, asset.width, asset.height);
          } catch (err) {
            console.warn(`  [AssetLoader] Error loading ${asset.id}: ${err instanceof Error ? err.message : err}`);
          }
        }

        catalog.push(...assets);
      } catch (err) {
        console.warn(`  [AssetLoader] Error processing ${dir.name}: ${err instanceof Error ? err.message : err}`);
      }
    }

    console.log(`[AssetLoader] Loaded ${Object.keys(sprites).length} / ${catalog.length} furniture assets`);
    return { catalog, sprites };
  } catch (err) {
    console.error(`[AssetLoader] Error loading furniture assets: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// ── Default layout ──────────────────────────────────────────────────────

export function loadDefaultLayout(assetsRoot: string): Record<string, unknown> | null {
  try {
    // Scan for versioned default layouts: default-layout-{N}.json
    let bestRevision = 0;
    let bestPath: string | null = null;

    if (fs.existsSync(assetsRoot)) {
      for (const file of fs.readdirSync(assetsRoot)) {
        const match = /^default-layout-(\d+)\.json$/.exec(file);
        if (match) {
          const rev = parseInt(match[1], 10);
          if (rev > bestRevision) {
            bestRevision = rev;
            bestPath = path.join(assetsRoot, file);
          }
        }
      }
    }

    // Fall back to unversioned default-layout.json
    if (!bestPath) {
      const fallback = path.join(assetsRoot, "default-layout.json");
      if (fs.existsSync(fallback)) {
        bestPath = fallback;
      }
    }

    if (!bestPath) {
      console.log("[AssetLoader] No default layout found in:", assetsRoot);
      return null;
    }

    const content = fs.readFileSync(bestPath, "utf-8");
    const layout = JSON.parse(content) as Record<string, unknown>;
    // Ensure layoutRevision matches the file's revision number
    if (bestRevision > 0 && !layout.layoutRevision) {
      layout.layoutRevision = bestRevision;
    }
    console.log(`[AssetLoader] Loaded default layout (${layout.cols}x${layout.rows}, revision ${layout.layoutRevision ?? 0}) from ${path.basename(bestPath)}`);
    return layout;
  } catch (err) {
    console.error(`[AssetLoader] Error loading default layout: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}
