import assert from "node:assert/strict";
import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import {
  authorizeWebSocketRequest,
  canUsePermissionBypass,
  getServerSecurityConfig,
} from "../server/security.js";

function connect(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    let opened = false;
    ws.once("open", () => {
      opened = true;
      ws.close();
    });
    ws.once("close", () => resolve(opened));
    ws.once("error", () => {
      // The denied case receives an HTTP 401 before the WebSocket handshake.
    });
  });
}

async function main(): Promise<void> {
  const localConfig = getServerSecurityConfig({});
  assert.equal(localConfig.bindHost, "127.0.0.1");
  assert.equal(localConfig.remoteMode, false);

  const remoteConfig = getServerSecurityConfig({
    PIXEL_AGENTS_BIND_HOST: "0.0.0.0",
    PIXEL_AGENTS_AUTH_TOKEN: "test-token",
  });
  assert.equal(remoteConfig.remoteMode, true);
  assert.throws(
    () => getServerSecurityConfig({ PIXEL_AGENTS_BIND_HOST: "0.0.0.0" }),
    /requires PIXEL_AGENTS_AUTH_TOKEN/,
  );

  assert.equal(canUsePermissionBypass(false, "127.0.0.1"), true);
  assert.equal(canUsePermissionBypass(true, "127.0.0.1"), false);
  assert.equal(canUsePermissionBypass(false, "192.0.2.10"), false);

  const server = createServer();
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const auth = authorizeWebSocketRequest(req, remoteConfig, () => false);
    if (!auth.authorized) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });
  wss.on("connection", (ws) => ws.close());

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `ws://127.0.0.1:${address.port}`;

  assert.equal(await connect(baseUrl), false, "remote WebSocket without auth must be denied");
  assert.equal(await connect(`${baseUrl}?auth=test-token`), true, "remote WebSocket with auth must be allowed");

  await new Promise<void>((resolve) => server.close(() => resolve()));
  wss.close();
  console.log("security tests passed: denied unauthenticated and allowed authenticated WebSocket");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
