/** 名称里空格或连字符 `-` 前面的一段。没有分隔符时，整段名称就是前缀。 */
export function projectNamePrefix(name: string): string {
  const trimmed = name.trim();
  const head = trimmed.split(/[\s-]+/)[0] ?? "";
  return head;
}

/** 所属领域勾选名单。顺序无关。 */
export function fieldSetKey(fieldIds: readonly string[]): string {
  return [...fieldIds].sort().join("\0");
}

/**
 * 维恩图上的一块交集：只算还在侧栏里的领域。
 * 同时属于哪几圈，就和同样只属于这几圈的项目算同一种。
 */
export function vennRelationKey(fieldIds: readonly string[], knownFieldIds: ReadonlySet<string>): string {
  return fieldIds
    .filter((id) => knownFieldIds.has(id))
    .sort()
    .join("\0");
}
