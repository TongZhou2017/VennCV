import { invoke } from "@tauri-apps/api/core";
import {
  runUserSync,
  type SyncBase,
  type UserSyncResult,
} from "../domain/cloudSync";
import {
  isSafeDavPath,
  listJianguoyunUsers as listRemoteUsers,
  probeJianguoyun,
  type DavCall,
  type DavResponse,
  type SyncAccountFields,
} from "../domain/jianguoyun";
import { isTauriApp } from "../platform/tauri";

async function transport(call: DavCall): Promise<DavResponse> {
  if (!isSafeDavPath(call.path)) return { status: 0, body: "远程路径无效" };
  if (isTauriApp()) {
    try {
      return await invoke<DavResponse>("jianguoyun_webdav", {
        method: call.method,
        path: call.path,
        body: call.body ?? null,
        email: call.email,
        password: call.password,
        ifMatch: call.ifMatch ?? null,
        ifNoneMatch: call.ifNoneMatch ?? null,
      });
    } catch (error) {
      const message = typeof error === "string" ? error : "连不上坚果云";
      return { status: 0, body: message };
    }
  }
  let response: Response;
  try {
    response = await fetch("/__venncv/jianguoyun", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-VennCV-Library": "1",
      },
      body: JSON.stringify({
        method: call.method,
        path: call.path,
        body: call.body ?? "",
        email: call.email,
        password: call.password,
        ifMatch: call.ifMatch ?? "",
        ifNoneMatch: call.ifNoneMatch ?? "",
      }),
    });
  } catch {
    return { status: 0, body: "连不上坚果云" };
  }
  if (!response.ok) {
    const text = await response.text();
    return { status: 0, body: text || "连不上坚果云" };
  }
  const parsed = (await response.json()) as Partial<DavResponse>;
  return {
    status: typeof parsed.status === "number" ? parsed.status : 0,
    body: typeof parsed.body === "string" ? parsed.body : "",
    etag: typeof parsed.etag === "string" && parsed.etag ? parsed.etag : undefined,
  };
}

export function testJianguoyun(account: SyncAccountFields): Promise<{ ok: true } | { ok: false; message: string }> {
  return probeJianguoyun(transport, account);
}

export function listJianguoyunUsers(
  account: SyncAccountFields,
): Promise<{ ok: true; users: string[] } | { ok: false; message: string }> {
  return listRemoteUsers(transport, account);
}

export function syncJianguoyunUser(
  account: SyncAccountFields,
  username: string,
  localFiles: Record<string, string>,
  base: SyncBase | null,
  baseFiles: Record<string, string> = {},
): Promise<UserSyncResult> {
  return runUserSync({ transport, account, username, localFiles, base, baseFiles });
}
