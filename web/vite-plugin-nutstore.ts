import { request as httpsRequest } from "node:https";
import type { Connect, Plugin, PreviewServer, ViteDevServer } from "vite";
import { NUTSTORE_DAV_ROOT, isSafeDavPath, type DavMethod } from "./src/domain/nutstore";

type DavRequest = {
  url?: string;
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  socket: { remoteAddress?: string };
  on(event: "data", listener: (chunk: Buffer) => void): void;
  on(event: "end", listener: () => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  destroy(): void;
};

type DavResponse = {
  statusCode: number;
  headersSent: boolean;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
};

const ROUTE = "/__venncv/nutstore";
const METHODS = new Set<DavMethod>(["MKCOL", "PUT", "GET", "DELETE", "PROPFIND"]);

function isLoopback(req: DavRequest): boolean {
  const addr = req.socket.remoteAddress ?? "";
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

function isLocalHostHeader(host: string | string[] | undefined): boolean {
  const raw = Array.isArray(host) ? host[0] : host;
  if (!raw) return false;
  const value = raw.toLowerCase();
  return (
    value === "localhost" ||
    value.startsWith("localhost:") ||
    value === "127.0.0.1" ||
    value.startsWith("127.0.0.1:") ||
    value === "[::1]" ||
    value.startsWith("[::1]:")
  );
}

function readBody(req: DavRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new Error("内容过大"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: DavResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function sendText(res: DavResponse, status: number, message: string): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(message);
}

function davUrl(method: DavMethod, path: string): string {
  const encoded = path.split("/").map((part) => encodeURIComponent(part)).join("/");
  return method === "MKCOL" || method === "PROPFIND" ? `${NUTSTORE_DAV_ROOT}${encoded}/` : `${NUTSTORE_DAV_ROOT}${encoded}`;
}

function isDavMethod(method: string): method is DavMethod {
  switch (method) {
    case "MKCOL":
    case "PUT":
    case "GET":
    case "DELETE":
    case "PROPFIND":
      return true;
    default:
      return false;
  }
}

function headerValue(headers: Record<string, string | string[] | undefined> | undefined, name: string): string {
  const value = headers?.[name];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function forward(payload: {
  method: DavMethod;
  path: string;
  body: string;
  email: string;
  password: string;
  ifMatch: string;
  ifNoneMatch: string;
}): Promise<{ status: number; body: string; etag: string }> {
  const headers: Record<string, string> = {
    Authorization: `Basic ${Buffer.from(`${payload.email}:${payload.password}`, "utf8").toString("base64")}`,
  };
  if (payload.ifMatch) headers["If-Match"] = payload.ifMatch;
  if (payload.ifNoneMatch) headers["If-None-Match"] = payload.ifNoneMatch;
  if (payload.method === "PROPFIND") {
    headers.Depth = "1";
    headers["Content-Type"] = "application/xml; charset=utf-8";
  }
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      davUrl(payload.method, payload.path),
      { method: payload.method, headers },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            etag: headerValue(response.headers, "etag"),
          }),
        );
        response.on("error", reject);
      },
    );
    req.on("error", reject);
    if (payload.method === "PUT" || payload.method === "PROPFIND") req.write(payload.body);
    req.end();
  });
}

async function handle(req: DavRequest, res: DavResponse): Promise<void> {
  if (!isLoopback(req) || !isLocalHostHeader(req.headers.host)) {
    sendText(res, 403, "坚果云代理只接受本机访问");
    return;
  }
  if (req.headers["x-venncv-library"] !== "1") {
    sendText(res, 403, "拒绝访问坚果云代理");
    return;
  }
  if (req.method !== "POST") {
    sendText(res, 404, "未知的坚果云接口");
    return;
  }
  const raw = await readBody(req);
  const parsed = JSON.parse(raw) as {
    method?: unknown;
    path?: unknown;
    body?: unknown;
    email?: unknown;
    password?: unknown;
    ifMatch?: unknown;
    ifNoneMatch?: unknown;
  };
  if (typeof parsed.method !== "string" || !isDavMethod(parsed.method) || !METHODS.has(parsed.method)) {
    sendText(res, 400, "不支持的请求");
    return;
  }
  if (typeof parsed.path !== "string" || !isSafeDavPath(parsed.path)) {
    sendText(res, 400, "远程路径无效");
    return;
  }
  if (typeof parsed.email !== "string" || typeof parsed.password !== "string" || !parsed.email.trim() || !parsed.password) {
    sendText(res, 400, "请填写坚果云邮箱和应用密码");
    return;
  }
  const ifMatch = typeof parsed.ifMatch === "string" ? parsed.ifMatch : "";
  const ifNoneMatch = typeof parsed.ifNoneMatch === "string" ? parsed.ifNoneMatch : "";
  if ([ifMatch, ifNoneMatch].some((value) => value.length > 200 || /[\r\n]/.test(value))) {
    sendText(res, 400, "同步条件无效");
    return;
  }
  try {
    const result = await forward({
      method: parsed.method,
      path: parsed.path,
      body: typeof parsed.body === "string" ? parsed.body : "",
      email: parsed.email.trim(),
      password: parsed.password,
      ifMatch,
      ifNoneMatch,
    });
    sendJson(res, 200, result);
  } catch {
    sendJson(res, 200, { status: 0, body: "连不上坚果云" });
  }
}

function attach(middlewares: Connect.Server): void {
  middlewares.use((req, res, next) => {
    const request = req as DavRequest;
    const response = res as DavResponse;
    const pathname = (request.url ?? "").split("?")[0];
    if (pathname !== ROUTE) {
      next();
      return;
    }
    void handle(request, response).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "坚果云代理错误";
      if (!response.headersSent) sendText(response, 400, message);
    });
  });
}

export function nutstorePlugin(): Plugin {
  return {
    name: "venncv-nutstore",
    configureServer(server: ViteDevServer) {
      attach(server.middlewares);
    },
    configurePreviewServer(server: PreviewServer) {
      attach(server.middlewares);
    },
  };
}
