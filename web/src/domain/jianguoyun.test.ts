import { describe, expect, it } from "vitest";
import { cloudUploadNames } from "../storage/libraryPaths";
import {
  SYNC_MARKER_BODY,
  cloudChildNames,
  isSafeDavPath,
  listJianguoyunUsers,
  probeJianguoyun,
  readSyncAccount,
  syncFolderPath,
  writeSyncAccount,
  type DavCall,
  type DavResponse,
} from "./jianguoyun";

function scripted(steps: DavResponse[]): (call: DavCall) => Promise<DavResponse> {
  const pending = [...steps];
  return async () => pending.shift() ?? { status: 500, body: "" };
}

describe("jianguoyun probe", () => {
  it("creates the folder, then writes and reads the marker", async () => {
    const calls: DavCall[] = [];
    const result = await probeJianguoyun(async (call) => {
      calls.push(call);
      if (call.method === "MKCOL") return { status: 201, body: "" };
      if (call.method === "PUT") return { status: 204, body: "" };
      if (call.method === "GET") return { status: 200, body: SYNC_MARKER_BODY };
      return { status: 500, body: "" };
    }, { email: "a@b.c", password: "secret", folder: "VennCV" });
    expect(result).toEqual({ ok: true });
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "MKCOL VennCV",
      "PUT VennCV/.venncv-sync",
      "GET VennCV/.venncv-sync",
    ]);
    expect(calls[1]?.body).toBe(SYNC_MARKER_BODY);
  });

  it("treats an existing folder as connected", async () => {
    const result = await probeJianguoyun(
      scripted([
        { status: 405, body: "" },
        { status: 201, body: "" },
        { status: 200, body: SYNC_MARKER_BODY },
      ]),
      { email: "a@b.c", password: "secret", folder: "" },
    );
    expect(result).toEqual({ ok: true });
  });

  it("stops when the password is rejected", async () => {
    const result = await probeJianguoyun(scripted([{ status: 401, body: "" }]), {
      email: "a@b.c",
      password: "nope",
      folder: "VennCV",
    });
    expect(result).toEqual({ ok: false, message: "邮箱或应用密码不正确" });
  });

  it("rejects a folder that could leave the chosen directory", () => {
    expect(syncFolderPath("a/b")).toBeNull();
    expect(syncFolderPath("..")).toBeNull();
    expect(isSafeDavPath("VennCV/.venncv-sync")).toBe(true);
    expect(isSafeDavPath("VennCV/users/admin/workspace.json")).toBe(true);
    expect(isSafeDavPath("VennCV/users/admin/sync.json")).toBe(true);
    expect(isSafeDavPath("VennCV/users/admin/remember_login.json")).toBe(false);
    expect(isSafeDavPath("VennCV/users/admin/sync_state.json")).toBe(false);
    expect(isSafeDavPath("VennCV/users/admin/sync_base.json")).toBe(false);
    expect(isSafeDavPath("https://evil.example/dav")).toBe(false);
  });

  it("keeps the saved password out of the echoed form and off the upload list", () => {
    const raw = writeSyncAccount({ email: " a@b.c ", password: "secret", folder: "" });
    expect(readSyncAccount(raw)).toEqual({ email: "a@b.c", password: "secret", folder: "VennCV" });
    expect(readSyncAccount("{")).toEqual({ email: "", password: "", folder: "VennCV" });
    expect(
      cloudUploadNames([
        "workspace.json",
        "sync_account.json",
        "remember_login.json",
        "version_store.json",
        "sync_state.json",
        "sync_base.json",
        "cloud_upload.json",
        "cloud_conflict.json",
        "sync.json",
        "config.yaml",
      ]),
    ).toEqual(["workspace.json", "version_store.json"]);
  });
});

const TOP_XML = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">
  <d:response><d:href>/dav/VennCV/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
  <d:response><d:href>/dav/VennCV/.venncv-sync</d:href><d:propstat><d:prop><d:resourcetype/></d:prop></d:propstat></d:response>
  <d:response><d:href>/dav/VennCV/users/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
  <d:response><d:href>/dav/VennCV/guest/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
</d:multistatus>`;

const NESTED_XML = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">
  <d:response><d:href>/dav/VennCV/users/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
  <d:response><d:href>/dav/VennCV/users/local/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
  <d:response><d:href>/dav/VennCV/users/%E9%98%BF%E6%98%8E/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
  <d:response><d:href>/dav/VennCV/users/workspace.json</d:href><d:propstat><d:prop><d:resourcetype/></d:prop></d:propstat></d:response>
</d:multistatus>`;

describe("jianguoyun users", () => {
  it("reads users inside the users folder and keeps other folders beside it", async () => {
    const calls: string[] = [];
    const result = await listJianguoyunUsers(async (call) => {
      calls.push(`${call.method} ${call.path}`);
      if (call.path === "VennCV") return { status: 207, body: TOP_XML };
      if (call.path === "VennCV/users") return { status: 207, body: NESTED_XML };
      return { status: 500, body: "" };
    }, { email: "a@b.c", password: "secret", folder: "VennCV" });
    expect(calls).toEqual(["PROPFIND VennCV", "PROPFIND VennCV/users"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.users).toEqual([...result.users].sort((a, b) => a.localeCompare(b, "zh")));
    expect(new Set(result.users)).toEqual(new Set(["guest", "local", "阿明"]));
    expect(cloudChildNames(TOP_XML, "VennCV")).toEqual(["guest", "users"]);
  });

  it("lists folders directly under the remote path when there is no users folder", async () => {
    const xml = TOP_XML.replace("<d:response><d:href>/dav/VennCV/users/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>", "");
    const result = await listJianguoyunUsers(async () => ({ status: 207, body: xml }), {
      email: "a@b.c",
      password: "secret",
      folder: "VennCV",
    });
    expect(result).toEqual({ ok: true, users: ["guest"] });
  });

  it("reports a rejected password while listing", async () => {
    const result = await listJianguoyunUsers(async () => ({ status: 401, body: "" }), {
      email: "a@b.c",
      password: "nope",
      folder: "VennCV",
    });
    expect(result).toEqual({ ok: false, message: "邮箱或应用密码不正确" });
  });
});
