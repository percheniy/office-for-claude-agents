/**
 * Original addition by Sergey Gridchin, 2026.
 * Licensed under the Sergey Source-Available Noncommercial License 1.0.
 * See LICENSE-SERGEY-ADDITIONS and NOTICE.
 */

import { execFileSync } from "child_process";

export type AgentControlAction = "prompt" | "approve" | "deny" | "interrupt";

export interface ControlIdentity {
  tmuxTarget: string;
  pid?: number;
  processStartTime?: string;
}

const SAFE_TARGET = /^[A-Za-z0-9._:-]+$/;
const MAX_PROMPT_LENGTH = 2000;

function runTmux(args: string[]): boolean {
  try {
    execFileSync("tmux", args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function validTarget(target: string): boolean {
  return SAFE_TARGET.test(target);
}

export function sendAgentControl(identity: ControlIdentity, action: AgentControlAction, prompt?: string, run: (args: string[]) => boolean = runTmux): { ok: boolean; reason?: string } {
  if (!validTarget(identity.tmuxTarget)) return { ok: false, reason: "tmux target is invalid" };
  if (!run(["has-session", "-t", identity.tmuxTarget])) return { ok: false, reason: "tmux session no longer exists" };

  if (action === "interrupt") {
    return run(["send-keys", "-t", identity.tmuxTarget, "C-c"])
      ? { ok: true } : { ok: false, reason: "tmux did not accept interrupt" };
  }

  const text = action === "approve" ? "y" : action === "deny" ? "n" : (prompt || "").replace(/[\u0000-\u001F\u007F]/g, " ").trim();
  if (!text) return { ok: false, reason: "prompt is empty" };
  if (text.length > MAX_PROMPT_LENGTH) return { ok: false, reason: `prompt exceeds ${MAX_PROMPT_LENGTH} characters` };
  if (!run(["send-keys", "-t", identity.tmuxTarget, "-l", text])) return { ok: false, reason: "tmux did not accept input" };
  return run(["send-keys", "-t", identity.tmuxTarget, "Enter"])
    ? { ok: true } : { ok: false, reason: "tmux did not accept Enter" };
}
