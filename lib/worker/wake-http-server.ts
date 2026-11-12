/**
 * Minimal wake/health HTTP server for Fly worker processes.
 */
import http from "node:http";

import { verifyWorkerWakeAuthorization } from "./wake-auth";

export type WorkerWakeHttpServerOptions = {
  onWake: () => void;
  env?: NodeJS.ProcessEnv;
  port?: number;
};

function readListenPort(
  env: NodeJS.ProcessEnv,
  explicit?: number,
): number {
  if (typeof explicit === "number" && Number.isFinite(explicit) && explicit >= 0) {
    return Math.floor(explicit);
  }
  const raw = env.PORT?.trim();
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 8080;
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

/**
 * Start a tiny HTTP server: GET /healthz, POST /wake.
 * Does not replace the poll loop — call alongside it.
 */
export function startWorkerWakeHttpServer(
  options: WorkerWakeHttpServerOptions,
): http.Server {
  const env = options.env ?? process.env;
  const port = readListenPort(env, options.port);

  const server = http.createServer((req, res) => {
    const method = req.method ?? "GET";
    let pathname = "/";
    try {
      pathname = new URL(req.url ?? "/", "http://worker.local").pathname;
    } catch {
      sendJson(res, 400, { error: "BAD_REQUEST" });
      return;
    }

    if (method === "GET" && pathname === "/healthz") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (method === "POST" && pathname === "/wake") {
      const auth = verifyWorkerWakeAuthorization(
        req.headers.authorization,
        env,
      );
      if (!auth.ok) {
        sendJson(res, auth.status, { error: auth.error });
        return;
      }
      try {
        options.onWake();
      } catch (error) {
        console.error("[worker-wake] onWake failed", {
          message: error instanceof Error ? error.message : "unknown",
        });
        sendJson(res, 500, { error: "INTERNAL_ERROR" });
        return;
      }
      res.writeHead(204, { "cache-control": "no-store" });
      res.end();
      return;
    }

    sendJson(res, 404, { error: "NOT_FOUND" });
  });

  server.listen(port, () => {
    console.info("[worker-wake] http listening", { port });
  });

  server.on("error", (error) => {
    console.error("[worker-wake] http server error", {
      message: error instanceof Error ? error.message : "unknown",
    });
  });

  return server;
}
