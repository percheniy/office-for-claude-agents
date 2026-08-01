/**
 * Original addition by Sergey Gridchin, 2026.
 * Licensed under the Sergey Source-Available Noncommercial License 1.0.
 * See LICENSE-SERGEY-ADDITIONS and NOTICE.
 */

import { readFileSync, unlinkSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";

export interface ServerPidRecord {
  pid: number;
  port: number;
  bindHost: string;
  owner: "office-for-claude-agents";
}

export function readServerPidRecord(path: string): ServerPidRecord | null {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as Partial<ServerPidRecord>;
    if (
      parsed.owner !== "office-for-claude-agents"
      || typeof parsed.pid !== "number"
      || !Number.isInteger(parsed.pid)
      || parsed.pid <= 0
      || typeof parsed.port !== "number"
      || !Number.isInteger(parsed.port)
      || parsed.port <= 0
      || typeof parsed.bindHost !== "string"
    ) {
      return null;
    }
    return parsed as ServerPidRecord;
  } catch {
    return null;
  }
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function isOwnedServerProcess(pid: number): boolean {
  try {
    const command = process.platform === "win32"
      ? execFileSync("wmic", ["process", "where", `ProcessId=${pid}`, "get", "CommandLine"], { encoding: "utf-8" })
      : execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf-8" });
    return /(?:^|[\\/])dist[\\/]server\.js(?:\s|$)/.test(command)
      || /(?:^|[\\/])server[\\/]index\.ts(?:\s|$)/.test(command);
  } catch {
    return false;
  }
}

export function writeServerPidRecord(path: string, record: ServerPidRecord): void {
  writeFileSync(path, JSON.stringify(record), "utf-8");
}

export function removeServerPidRecordIfOwned(path: string, pid: number): void {
  const record = readServerPidRecord(path);
  if (record?.pid === pid) {
    try { unlinkSync(path); } catch { /* already removed */ }
  }
}
