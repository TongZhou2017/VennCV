import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { Connect, Plugin, PreviewServer, ViteDevServer } from "vite";
import {
  catalogHome,
  envLibraryRoot,
  forgetLibraryRoot,
  LibraryRootError,
  listLibraryChoices,
  platformLibraryRoot,
  resolveStartupRoot,
  switchLibraryRoot,
} from "./user-library/libraryRoots";
import { openLibrary, readLibrarySnapshot, writeLibraryFile } from "./user-library/nodeStore";

type LibraryRequest = {
  url?: string;
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  socket: { remoteAddress?: string };
  on(event: "data", listener: (chunk: Buffer) => void): void;
  on(event: "end", listener: () => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  destroy(): void;
};

type LibraryResponse = {
  statusCode: number;
  headersSent: boolean;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
};

const PREFIX = "/__venncv/user-library";

function projectRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function legacyRoots(): string[] {
  const roots = [projectRoot()];
  const extra = process.env.VENNCV_LEGACY_DATA_DIR?.trim();
  if (extra) roots.push(path.resolve(extra));
  return roots;
}

function isLoopback(req: LibraryRequest): boolean {
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

function readBody(req: LibraryRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 33 * 1024 * 1024) {
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

function sendJson(res: LibraryResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(text);
}

function sendText(res: LibraryResponse, status: number, message: string): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(message);
}

function snapshotBody(root: string): { root: string; files: ReturnType<typeof readLibrarySnapshot> } {
  return { root, files: readLibrarySnapshot(root) };
}

async function handle(req: LibraryRequest, res: LibraryResponse, state: { root: string }): Promise<void> {
  if (!isLoopback(req) || !isLocalHostHeader(req.headers.host)) {
    sendText(res, 403, "用户库只接受本机访问");
    return;
  }
  if (req.headers["x-venncv-library"] !== "1") {
    sendText(res, 403, "拒绝访问用户库");
    return;
  }
  const rawUrl = req.url ?? "/";
  const queryAt = rawUrl.indexOf("?");
  const route = queryAt === -1 ? rawUrl : rawUrl.slice(0, queryAt);
  const root = state.root;
  if (req.method === "GET" && route === `${PREFIX}/health`) {
    sendJson(res, 200, { ok: true, root });
    return;
  }
  if (req.method === "GET" && route === `${PREFIX}/snapshot`) {
    sendJson(res, 200, snapshotBody(root));
    return;
  }
  if (req.method === "GET" && route === `${PREFIX}/choices`) {
    sendJson(res, 200, {
      current: root,
      platform: platformLibraryRoot(),
      choices: listLibraryChoices(catalogHome(), root, platformLibraryRoot()),
    });
    return;
  }
  if (req.method === "POST" && (route === `${PREFIX}/switch` || route === `${PREFIX}/forget`)) {
    const raw = await readBody(req);
    const parsed = JSON.parse(raw) as { path?: unknown; create?: unknown };
    if (typeof parsed.path !== "string") {
      sendText(res, 400, "请求格式无效");
      return;
    }
    const home = catalogHome();
    try {
      if (route === `${PREFIX}/forget`) {
        forgetLibraryRoot(home, state.root, parsed.path);
      } else {
        const next = switchLibraryRoot(home, parsed.path, parsed.create === true, undefined, state.root);
        state.root = next;
        openLibrary(next, legacyRoots(), platformLibraryRoot());
      }
    } catch (error) {
      if (error instanceof LibraryRootError && error.code === "NEED_CREATE") {
        sendJson(res, 409, { code: "NEED_CREATE", message: error.message });
        return;
      }
      throw error;
    }
    sendJson(res, 200, {
      ...snapshotBody(state.root),
      choices: listLibraryChoices(home, state.root, platformLibraryRoot()),
    });
    return;
  }
  if (req.method === "PUT" && route === `${PREFIX}/file`) {
    const raw = await readBody(req);
    const parsed = JSON.parse(raw) as { path?: unknown; contents?: unknown };
    if (typeof parsed.path !== "string" || typeof parsed.contents !== "string") {
      sendText(res, 400, "请求格式无效");
      return;
    }
    writeLibraryFile(root, parsed.path, parsed.contents);
    sendJson(res, 200, { ok: true });
    return;
  }
  sendText(res, 404, "未知的用户库接口");
}

function attach(middlewares: Connect.Server, state: { root: string }): void {
  openLibrary(state.root, legacyRoots(), platformLibraryRoot());
  middlewares.use((req, res, next) => {
    const request = req as LibraryRequest;
    const response = res as LibraryResponse;
    const pathname = (request.url ?? "").split("?")[0];
    if (!pathname.startsWith(PREFIX)) {
      next();
      return;
    }
    void handle(request, response, state).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "用户库错误";
      if (!response.headersSent) sendText(response, 400, message);
    });
  });
}

export function userLibraryPlugin(): Plugin {
  const state = { root: resolveStartupRoot(envLibraryRoot(), catalogHome()) };
  return {
    name: "venncv-user-library",
    configureServer(server: ViteDevServer) {
      attach(server.middlewares, state);
    },
    configurePreviewServer(server: PreviewServer) {
      attach(server.middlewares, state);
    },
  };
}
