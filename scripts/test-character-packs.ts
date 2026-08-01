import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { loadCharacterSprites } from "../server/assetLoader.js";

const root = mkdtempSync(join(tmpdir(), "pixel-character-pack-"));
const bundled = join(process.cwd(), "webview-ui/public/assets");
const bundledRoot = join(root, "bundled");
mkdirSync(join(bundledRoot, "characters"), { recursive: true });
const custom = join(root, "characters");
mkdirSync(custom);
for (let index = 0; index < 6; index++) copyFileSync(join(bundled, "characters", `char_${index}.png`), join(bundledRoot, "characters", `char_${index}.png`));

writeFileSync(join(custom, "char_0.png"), PNG.sync.write(new PNG({ width: 112, height: 96 })));
writeFileSync(join(custom, "char_1.png"), Buffer.from("not a png"));
const loaded = loadCharacterSprites(bundledRoot, custom);
assert.equal(loaded?.characters.length, 6);
console.log("character pack tests passed: valid override loaded and invalid sprite fell back");
