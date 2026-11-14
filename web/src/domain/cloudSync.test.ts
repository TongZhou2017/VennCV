import { describe, expect, it } from "vitest";
import type { DavTransport } from "./jianguoyun";
import { decideFile, manifestText, runUserSync, sha256Text } from "./cloudSync";

const account = { email: "a@b.c", password: "secret", folder: "VennCV" };

function server(seed: Record<string, string> = {}) {
  const files = new Map(Object.entries(seed));
  const puts: string[] = [];
  const transport: DavTransport = async (call) => {
    if (call.password !== "secret") return { status: 401, body: "" };
    if (call.method === "GET") {
      const body = files.get(call.path);
      return body === undefined ? { status: 404, body: "" } : { status: 200, body };
    }
    if (call.method === "PUT") {
      puts.push(call.path);
      files.set(call.path, call.body ?? "");
      return { status: 204, body: "" };
    }
    if (call.method === "MKCOL") return { status: 201, body: "" };
    if (call.method === "PROPFIND") {
      const prefix = `${call.path}/`;
      const children = [...files.keys()].filter((key) => key.startsWith(prefix) && !key.slice(prefix.length).includes("/"));
      const rows = [
        `<d:response><d:href>/dav/${call.path}/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>`,
        ...children.map((key) => {
          const name = key.slice(prefix.length);
          return `<d:response><d:href>/dav/${key}</d:href><d:propstat><d:prop><d:resourcetype/></d:prop></d:propstat></d:response>`.replace(
            key,
            `${call.path}/${name}`,
          );
        }),
      ];
      return { status: 207, body: `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${rows.join("")}</d:multistatus>` };
    }
    return { status: 500, body: "" };
  };
  return { files, puts, transport };
}

describe("sync decisions", () => {
  it("uploads only a local change and downloads only a cloud change", () => {
    expect(decideFile("local", null, null)).toBe("upload");
    expect(decideFile(null, "remote", null)).toBe("download");
    expect(decideFile("next", "base", "base")).toBe("upload");
    expect(decideFile("base", "next", "base")).toBe("download");
    expect(decideFile("local", "remote", "base")).toBe("conflict");
    expect(decideFile("same", "same", null)).toBe("keep");
  });
});

describe("user sync", () => {
  it("uploads a new local workspace and writes the manifest last", async () => {
    const dav = server();
    const result = await runUserSync({
      transport: dav.transport,
      account,
      username: "admin",
      localFiles: { "workspace.json": "hello" },
      base: null,
    });
    expect(result).toMatchObject({ ok: true, status: "synced", message: "已同步", generation: 1 });
    expect(dav.puts).toEqual(["VennCV/users/admin/workspace.json", "VennCV/users/admin/sync.json"]);
    const manifest = JSON.parse(dav.files.get("VennCV/users/admin/sync.json") ?? "");
    expect(manifest.generation).toBe(1);
    expect(manifest.files["workspace.json"]).toBe(await sha256Text("hello"));
  });

  it("does not upload when both sides changed, and keeps the cloud copy", async () => {
    const baseHash = await sha256Text("one");
    const remoteHash = await sha256Text("cloud");
    const dav = server({
      "VennCV/users/admin/workspace.json": "cloud",
      "VennCV/users/admin/sync.json": manifestText(2, { "workspace.json": remoteHash }),
    });
    const result = await runUserSync({
      transport: dav.transport,
      account,
      username: "admin",
      localFiles: { "workspace.json": "local" },
      base: { generation: 2, files: { "workspace.json": baseHash } },
    });
    expect(result).toMatchObject({
      ok: true,
      status: "conflict",
      conflicts: { "workspace.json": "cloud" },
    });
    expect(dav.puts).toEqual([]);
    expect(dav.files.get("VennCV/users/admin/workspace.json")).toBe("cloud");
  });

  it("downloads when only the cloud changed", async () => {
    const baseHash = await sha256Text("one");
    const remoteHash = await sha256Text("cloud");
    const dav = server({
      "VennCV/users/admin/workspace.json": "cloud",
      "VennCV/users/admin/sync.json": manifestText(4, { "workspace.json": remoteHash }),
    });
    const result = await runUserSync({
      transport: dav.transport,
      account,
      username: "admin",
      localFiles: { "workspace.json": "one" },
      base: { generation: 4, files: { "workspace.json": baseHash } },
    });
    expect(result).toMatchObject({
      ok: true,
      status: "synced",
      generation: 4,
      downloads: { "workspace.json": "cloud" },
    });
    expect(dav.puts).toEqual([]);
  });

  it("refuses to overwrite a cloud folder that has no sync record", async () => {
    const dav = server({ "VennCV/users/admin/workspace.json": "already" });
    const result = await runUserSync({
      transport: dav.transport,
      account,
      username: "admin",
      localFiles: { "workspace.json": "local" },
      base: null,
    });
    expect(result).toEqual({ ok: false, message: "云端已有文件，但没有同步记录，没有覆盖。" });
    expect(dav.puts).toEqual([]);
  });

  it("stops when the password is rejected", async () => {
    const dav = server();
    const result = await runUserSync({
      transport: dav.transport,
      account: { ...account, password: "nope" },
      username: "admin",
      localFiles: { "workspace.json": "hello" },
      base: null,
    });
    expect(result).toEqual({ ok: false, message: "邮箱或应用密码不正确" });
    expect(dav.puts).toEqual([]);
  });

  it("does not upload when another device moves the sync record", async () => {
    const hash = await sha256Text("one");
    const first = manifestText(1, { "workspace.json": hash });
    const second = manifestText(2, { "workspace.json": hash });
    const puts: string[] = [];
    let reads = 0;
    const transport: DavTransport = async (call) => {
      if (call.method === "GET" && call.path.endsWith("/sync.json")) {
        reads += 1;
        return { status: 200, body: reads === 1 ? first : second, etag: reads === 1 ? "m1" : "m2" };
      }
      if (call.method === "GET") return { status: 200, body: "one", etag: "f1" };
      if (call.method === "PUT") {
        puts.push(call.path);
        return { status: 204, body: "" };
      }
      if (call.method === "MKCOL") return { status: 201, body: "" };
      return { status: 500, body: "" };
    };
    const result = await runUserSync({
      transport,
      account,
      username: "admin",
      localFiles: { "workspace.json": "local-edit" },
      base: { generation: 1, files: { "workspace.json": hash } },
    });
    expect(result).toEqual({ ok: true, status: "stale" });
    expect(puts).toEqual([]);
  });

  it("stops when the cloud file changes before the upload", async () => {
    const hash = await sha256Text("one");
    const manifest = manifestText(1, { "workspace.json": hash });
    const puts: string[] = [];
    const transport: DavTransport = async (call) => {
      if (call.method === "GET" && call.path.endsWith("/sync.json")) return { status: 200, body: manifest, etag: "m1" };
      if (call.method === "GET") return { status: 200, body: "one", etag: "f1" };
      if (call.method === "PUT" && call.path.endsWith("/workspace.json")) {
        puts.push(`${call.ifMatch ?? ""} ${call.path}`);
        return { status: 412, body: "" };
      }
      if (call.method === "PUT") {
        puts.push(call.path);
        return { status: 204, body: "" };
      }
      if (call.method === "MKCOL") return { status: 201, body: "" };
      return { status: 500, body: "" };
    };
    const result = await runUserSync({
      transport,
      account,
      username: "admin",
      localFiles: { "workspace.json": "local-edit" },
      base: { generation: 1, files: { "workspace.json": hash } },
    });
    expect(result).toEqual({ ok: true, status: "stale" });
    expect(puts).toEqual(["f1 VennCV/users/admin/workspace.json"]);
  });

  it("merges concurrent edits to different projects", async () => {
    const ancestor = JSON.stringify({ projects: { a: { id: "a", name: "甲" } } });
    const remoteBody = JSON.stringify({ projects: { a: { id: "a", name: "甲" }, c: { id: "c", name: "丙" } } });
    const localBody = JSON.stringify({ projects: { a: { id: "a", name: "甲" }, b: { id: "b", name: "乙" } } });
    const dav = server({
      "VennCV/users/admin/workspace.json": remoteBody,
      "VennCV/users/admin/sync.json": manifestText(3, { "workspace.json": await sha256Text(remoteBody) }),
    });
    const result = await runUserSync({
      transport: dav.transport,
      account,
      username: "admin",
      localFiles: { "workspace.json": localBody },
      base: { generation: 3, files: { "workspace.json": await sha256Text(ancestor) } },
      baseFiles: { "workspace.json": ancestor },
    });
    expect(result).toMatchObject({ ok: true, status: "synced", message: "已合并两边的修改", generation: 4 });
    const uploaded = JSON.parse(dav.files.get("VennCV/users/admin/workspace.json") ?? "{}") as {
      projects: Record<string, { name: string }>;
    };
    expect(Object.keys(uploaded.projects).sort()).toEqual(["a", "b", "c"]);
  });

  it("does not merge when the same field changed on both sides", async () => {
    const ancestor = JSON.stringify({ projects: { a: { id: "a", name: "甲" } } });
    const remoteBody = JSON.stringify({ projects: { a: { id: "a", name: "云端" } } });
    const localBody = JSON.stringify({ projects: { a: { id: "a", name: "本机" } } });
    const dav = server({
      "VennCV/users/admin/workspace.json": remoteBody,
      "VennCV/users/admin/sync.json": manifestText(3, { "workspace.json": await sha256Text(remoteBody) }),
    });
    const result = await runUserSync({
      transport: dav.transport,
      account,
      username: "admin",
      localFiles: { "workspace.json": localBody },
      base: { generation: 3, files: { "workspace.json": await sha256Text(ancestor) } },
      baseFiles: { "workspace.json": ancestor },
    });
    expect(result).toMatchObject({ ok: true, status: "conflict" });
    expect(dav.puts).toEqual([]);
    expect(dav.files.get("VennCV/users/admin/workspace.json")).toBe(remoteBody);
  });
});
