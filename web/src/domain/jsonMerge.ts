/**
 * 工作区 JSON 的三方合并。
 * 对象按键合并，和 Automerge 的 Map 一样：只有一边改过的键留下，两边改了不同的值就停。
 * 带 id 的列表按条目合并，和 Joplin 按笔记同步一样，共同祖先留在本机。
 * 同一条、同一个键两边都改过时，不猜哪边对。
 */

type Merge = { ok: true; value: unknown } | { ok: false };

type ListKind = "id" | "edge" | "auth" | "string";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function listKind(items: unknown[]): ListKind | "empty" | "opaque" {
  if (items.length === 0) return "empty";
  const kinds = new Set<ListKind | "opaque">();
  for (const item of items) {
    if (typeof item === "string") {
      kinds.add("string");
      continue;
    }
    if (!isRecord(item)) return "opaque";
    if (typeof item.id === "string") kinds.add("id");
    else if (typeof item.from_id === "string" && typeof item.to_id === "string") kinds.add("edge");
    else if (typeof item.project_id === "string" && typeof item.person_id === "string") kinds.add("auth");
    else return "opaque";
  }
  if (kinds.size !== 1) return "opaque";
  const kind = [...kinds][0];
  return kind === "opaque" ? "opaque" : kind;
}

function identity(item: unknown, kind: ListKind): string | null {
  if (kind === "string") return typeof item === "string" ? item : null;
  if (!isRecord(item)) return null;
  if (kind === "id") return typeof item.id === "string" ? item.id : null;
  if (kind === "edge" && typeof item.from_id === "string" && typeof item.to_id === "string") {
    return `${item.from_id}>${item.to_id}:${String(item.relation_type ?? "")}`;
  }
  if (kind === "auth" && typeof item.project_id === "string" && typeof item.person_id === "string") {
    return `${item.project_id}:${item.person_id}`;
  }
  return null;
}

function indexList(items: unknown[], kind: ListKind): Map<string, unknown> | null {
  const indexed = new Map<string, unknown>();
  for (const item of items) {
    const id = identity(item, kind);
    if (id === null || indexed.has(id)) return null;
    indexed.set(id, item);
  }
  return indexed;
}

function sameOrder(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function place(order: string[], extras: string[], source: string[]): string[] | null {
  const result = [...order];
  for (const id of extras) {
    const at = source.indexOf(id);
    let inserted = false;
    for (let index = at - 1; index >= 0; index -= 1) {
      const anchor = result.indexOf(source[index]);
      if (anchor >= 0) {
        result.splice(anchor + 1, 0, id);
        inserted = true;
        break;
      }
    }
    if (!inserted) result.push(id);
  }
  return result.length === new Set(result).size ? result : null;
}

function mergeOrder(base: string[], local: string[], remote: string[], keep: Set<string>): string[] | null {
  const present = (ids: string[]) => ids.filter((id) => keep.has(id));
  const baseOrder = present(base);
  const localOrder = present(local);
  const remoteOrder = present(remote);
  const sharedLocal = localOrder.filter((id) => remoteOrder.includes(id));
  const sharedRemote = remoteOrder.filter((id) => localOrder.includes(id));
  const sharedBase = baseOrder.filter((id) => sharedLocal.includes(id));
  if (!sameOrder(sharedLocal, sharedRemote) && !sameOrder(sharedLocal, sharedBase) && !sameOrder(sharedRemote, sharedBase)) {
    return null;
  }
  const followRemote = sameOrder(sharedLocal, sharedBase) && !sameOrder(sharedRemote, sharedBase);
  const skeleton = followRemote ? remoteOrder : localOrder;
  const extras = (followRemote ? localOrder : remoteOrder).filter((id) => !skeleton.includes(id));
  const source = followRemote ? local : remote;
  return place(skeleton, extras, source);
}

function mergeArray(base: unknown[], local: unknown[], remote: unknown[]): Merge {
  const kinds = [listKind(base), listKind(local), listKind(remote)].filter((kind) => kind !== "empty");
  if (kinds.length === 0) return { ok: true, value: [] };
  if (kinds.some((kind) => kind === "opaque")) return { ok: false };
  const kind = kinds[0];
  if (!kind || kind === "opaque" || kinds.some((item) => item !== kind)) return { ok: false };
  const baseItems = indexList(base, kind);
  const localItems = indexList(local, kind);
  const remoteItems = indexList(remote, kind);
  if (!baseItems || !localItems || !remoteItems) return { ok: false };
  const merged = mergeObject(Object.fromEntries(baseItems), Object.fromEntries(localItems), Object.fromEntries(remoteItems));
  if (!merged.ok) return merged;
  if (!isRecord(merged.value)) return { ok: false };
  const record = merged.value;
  const order = mergeOrder([...baseItems.keys()], [...localItems.keys()], [...remoteItems.keys()], new Set(Object.keys(record)));
  if (!order) return { ok: false };
  return { ok: true, value: order.map((id) => record[id]) };
}

function mergeObject(base: Record<string, unknown>, local: Record<string, unknown>, remote: Record<string, unknown>): Merge {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const key of [...Object.keys(local), ...Object.keys(remote), ...Object.keys(base)]) {
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const hasBase = Object.prototype.hasOwnProperty.call(base, key);
    const hasLocal = Object.prototype.hasOwnProperty.call(local, key);
    const hasRemote = Object.prototype.hasOwnProperty.call(remote, key);
    if (!hasLocal && !hasRemote) continue;
    if (!hasLocal || !hasRemote) {
      const kept = hasLocal ? local[key] : remote[key];
      const changed = hasBase && canonical(kept) !== canonical(base[key]);
      if (hasBase && !changed) continue;
      if (hasBase && changed) return { ok: false };
      out[key] = kept;
      continue;
    }
    if (!hasBase) {
      if (canonical(local[key]) !== canonical(remote[key])) return { ok: false };
      out[key] = local[key];
      continue;
    }
    const merged = mergeValue(base[key], local[key], remote[key]);
    if (!merged.ok) return merged;
    out[key] = merged.value;
  }
  return { ok: true, value: out };
}

function mergeValue(base: unknown, local: unknown, remote: unknown): Merge {
  if (canonical(local) === canonical(remote)) return { ok: true, value: local };
  if (canonical(local) === canonical(base)) return { ok: true, value: remote };
  if (canonical(remote) === canonical(base)) return { ok: true, value: local };
  if (isRecord(base) && isRecord(local) && isRecord(remote)) return mergeObject(base, local, remote);
  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) return mergeArray(base, local, remote);
  return { ok: false };
}

export function mergeJsonText(
  base: string,
  local: string,
  remote: string,
): { ok: true; text: string } | { ok: false } {
  let baseValue: unknown;
  let localValue: unknown;
  let remoteValue: unknown;
  try {
    baseValue = JSON.parse(base);
    localValue = JSON.parse(local);
    remoteValue = JSON.parse(remote);
  } catch {
    return { ok: false };
  }
  const merged = mergeValue(baseValue, localValue, remoteValue);
  if (!merged.ok) return merged;
  if (canonical(merged.value) === canonical(remoteValue)) return { ok: true, text: remote };
  if (canonical(merged.value) === canonical(localValue)) return { ok: true, text: local };
  return { ok: true, text: JSON.stringify(merged.value, null, 2) };
}
