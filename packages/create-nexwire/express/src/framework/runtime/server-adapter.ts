import type { AddressInfo } from "node:net";
import type { Express } from "express";
import type { RealtimeServeWebSocket } from "@/framework/realtime/socket.js";
import { runtime } from "@/framework/runtime/runtime.js";

export type HttpServerHandle = {
  address(): string | AddressInfo | null;
  close(): Promise<void>;
  native: unknown;
};

async function startNode(app: Express, port: number, _websocket?: RealtimeServeWebSocket): Promise<HttpServerHandle> {
  const { createServer } = await import("node:http");

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(port, resolve));

  return {
    native: server,
    address: () => server.address(),
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  };
}

async function startBun(app: Express, port: number, _websocket?: RealtimeServeWebSocket): Promise<HttpServerHandle> {
  const server = await startNode(app, port);
  return server;
}

export async function startHttpServer(app: Express, port: number, websocket?: RealtimeServeWebSocket): Promise<HttpServerHandle> {
  const activeRuntime = runtime();
  if (activeRuntime === "bun") return startBun(app, port, websocket);
  return startNode(app, port, websocket);
}
