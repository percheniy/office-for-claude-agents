/**
 * Original addition by Sergey Gridchin, 2026.
 * Licensed under the Sergey Source-Available Noncommercial License 1.0.
 * See LICENSE-SERGEY-ADDITIONS and NOTICE.
 */

import crypto from "crypto";
import type { IncomingMessage } from "http";

export interface ServerSecurityConfig {
  bindHost: string;
  remoteMode: boolean;
  authToken?: string;
}

export interface WebSocketAuthorization {
  authorized: boolean;
  readOnly: boolean;
  reason?: string;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.trim().toLowerCase());
}

export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  const normalized = address.replace(/^::ffff:/, "").toLowerCase();
  return normalized === "127.0.0.1" || normalized === "::1" || normalized === "localhost";
}

export function getServerSecurityConfig(env: NodeJS.ProcessEnv = process.env): ServerSecurityConfig {
  const bindHost = (env.PIXEL_AGENTS_BIND_HOST || "127.0.0.1").trim();
  const remoteMode = !isLoopbackHost(bindHost);
  const authToken = env.PIXEL_AGENTS_AUTH_TOKEN?.trim() || undefined;

  if (remoteMode && !authToken) {
    throw new Error(
      "Remote mode requires PIXEL_AGENTS_AUTH_TOKEN. Keep PIXEL_AGENTS_BIND_HOST at 127.0.0.1 for local-only access.",
    );
  }

  return { bindHost, remoteMode, authToken };
}

function tokenMatches(expected: string | undefined, provided: string | null): boolean {
  if (!expected || !provided) return false;
  const expectedBytes = Buffer.from(expected, "utf8");
  const providedBytes = Buffer.from(provided, "utf8");
  return expectedBytes.length === providedBytes.length
    && crypto.timingSafeEqual(expectedBytes, providedBytes);
}

function getBearerToken(req: IncomingMessage): string | null {
  const authorization = req.headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim() || null;
  }
  return null;
}

export function authorizeWebSocketRequest(
  req: IncomingMessage,
  config: ServerSecurityConfig,
  shareTokenValid: (token: string) => boolean,
): WebSocketAuthorization {
  // The request URL is untrusted; use a fixed parser base instead of the Host header.
  const url = new URL(req.url || "/", "http://localhost");
  const shareToken = url.searchParams.get("share");

  if (shareToken) {
    if (!shareTokenValid(shareToken)) {
      return { authorized: false, readOnly: true, reason: "Share token expired" };
    }
    return { authorized: true, readOnly: true };
  }

  if (!config.remoteMode) {
    return { authorized: true, readOnly: false };
  }

  const providedToken = url.searchParams.get("auth") || getBearerToken(req);
  if (!tokenMatches(config.authToken, providedToken)) {
    return { authorized: false, readOnly: false, reason: "Authentication required" };
  }

  return { authorized: true, readOnly: false };
}

export function canUsePermissionBypass(remoteMode: boolean, remoteAddress: string | undefined): boolean {
  return !remoteMode && isLoopbackAddress(remoteAddress);
}
