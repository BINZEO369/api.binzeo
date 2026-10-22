import "server-only";
import { EventEmitter } from "node:events";
import { createRequest, createResponse } from "node-mocks-http";
import type { RequestHandler } from "express";

export async function runJabiyenGateway(
  handler: RequestHandler,
  request: Request,
  prefix: "/api/jabiyen-public" | "/api/jabiyen-admin",
  path: string[],
) {
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > 64 * 1024) {
    return Response.json({ success: false, error: "Request body is too large." }, { status: 413, headers: { "Cache-Control": "no-store" } });
  }
  let parsedBody: unknown;
  if (body) {
    try {
      parsedBody = JSON.parse(body);
    } catch {
      return Response.json({ success: false, error: "Request body must be valid JSON." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
  }
  // The legacy routers normalize /api/jabiyen-*/<path> to /api/<path>.
  // Accept both the clean canonical path and the old /api/<path> variant.
  const routePath = path[0] === "api" ? path.slice(1) : path;
  const url = `${prefix}/${routePath.join("/")}${new URL(request.url).search}`;
  const incoming = createRequest({
    method: request.method as never,
    url,
    originalUrl: url,
    headers: Object.fromEntries(request.headers.entries()),
    body: parsedBody as never,
  });
  const outgoing = createResponse({ eventEmitter: EventEmitter });

  await new Promise<void>((resolve, reject) => {
    outgoing.on("end", resolve);
    outgoing.on("finish", resolve);
    try {
      handler(incoming as never, outgoing as never, (error?: unknown) => error ? reject(error) : resolve());
    } catch (error) {
      reject(error);
    }
  });

  const raw = outgoing._getData();
  const status = outgoing.statusCode || 200;
  const headers = new Headers();
  const responseHeaders = outgoing._getHeaders();
  for (const [key, value] of Object.entries(responseHeaders)) headers.set(key, String(value));
  headers.set("Cache-Control", "no-store");
  return new Response(raw || null, { status, headers });
}
