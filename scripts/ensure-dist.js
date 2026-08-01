#!/usr/bin/env node

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const distServer = "dist/server.js";
if (existsSync(distServer)) process.exit(0);

if (!existsSync("server/index.ts") || !existsSync("webview-ui/package.json")) {
  console.error("dist/server.js is missing from this package. Reinstall the package or run npm run build from a source checkout.");
  process.exit(1);
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npm, ["run", "build"], { stdio: "inherit" });
process.exit(result.status ?? 1);
