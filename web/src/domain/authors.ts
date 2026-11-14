import type {
  AppDataJson,
  AuthorDisplayMode,
  AuthorNameStyle,
  CreditRole,
  Lab,
  LabStage,
  LabStageRecord,
  Person,
  PersonAffiliation,
  Project,
  ProjectAuthorship,
  ProjectStatus,
} from "../types";
import { coerceAuthorRole, coerceProjectStatus } from "../types";
import { effectiveCompletion, isBlockDone } from "./progress";

export const LAB_COLOR_PALETTE = ["#5c6bc0", "#00897b", "#8e24aa", "#ef6c00", "#c62828", "#1565c0"];
export const UNASSIGNED_LAB_COLOR = "#9e9e9e";
const LAB_COLOR = /^#[0-9a-fA-F]{6}$/;
const SATELLITE_GAP = 3;

export const CREDIT_ROLES: CreditRole[] = [
  "Conceptualization",
  "DataCuration",
  "FormalAnalysis",
  "FundingAcquisition",
  "Investigation",
  "Methodology",
  "ProjectAdministration",
  "Resources",
  "Software",
  "Supervision",
  "Validation",
  "Visualization",
  "WritingOriginalDraft",
  "WritingReviewEditing",
];

export type AuthorTableSort = "position" | "lab" | "credit";

export function creditRoleLabel(role: CreditRole): string {
  switch (role) {
    case "Conceptualization":
      return "概念构思";
    case "DataCuration":
      return "数据管理";
    case "FormalAnalysis":
      return "形式分析";
    case "FundingAcquisition":
      return "获取资助";
    case "Investigation":
      return "调查研究";
    case "Methodology":
      return "研究方法";
    case "ProjectAdministration":
      return "项目管理";
    case "Resources":
      return "资源提供";
    case "Software":
      return "软件";
    case "Supervision":
      return "监督指导";
    case "Validation":
      return "验证";
    case "Visualization":
      return "可视化";
    case "WritingOriginalDraft":
      return "初稿撰写";
    case "WritingReviewEditing":
      return "审阅与编辑";
    default: {
      const unexpected: never = role;
      return unexpected;
    }
  }
}

export function creditRoleLabelEn(role: CreditRole): string {
  switch (role) {
    case "Conceptualization":
      return "Conceptualization";
    case "DataCuration":
      return "Data curation";
    case "FormalAnalysis":
      return "Formal analysis";
    case "FundingAcquisition":
      return "Funding acquisition";
    case "Investigation":
      return "Investigation";
    case "Methodology":
      return "Methodology";
    case "ProjectAdministration":
      return "Project administration";
    case "Resources":
      return "Resources";
    case "Software":
      return "Software";
    case "Supervision":
      return "Supervision";
    case "Validation":
      return "Validation";
    case "Visualization":
      return "Visualization";
    case "WritingOriginalDraft":
      return "Writing – original draft";
    case "WritingReviewEditing":
      return "Writing – review & editing";
    default: {
      const unexpected: never = role;
      return unexpected;
    }
  }
}

function creditRank(role: CreditRole): number {
  const index = CREDIT_ROLES.indexOf(role);
  return index < 0 ? CREDIT_ROLES.length : index;
}

function coerceCreditRoles(raw: unknown): CreditRole[] {
  if (!Array.isArray(raw)) return [];
  const found = new Set<CreditRole>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    if ((CREDIT_ROLES as readonly string[]).includes(item)) found.add(item as CreditRole);
  }
  return CREDIT_ROLES.filter((role) => found.has(role));
}

export function authorShortName(name: string): string {
  return [...name.trim()].slice(0, 2).join("");
}

export function sanitizeLabColor(raw: unknown): string {
  if (typeof raw === "string" && LAB_COLOR.test(raw.trim())) return raw.trim().toLowerCase();
  return LAB_COLOR_PALETTE[0];
}

export function nextCatalogId(prefix: "lab" | "person", existing: Record<string, unknown>): string {
  let n = 1;
  for (;;) {
    const id = `${prefix}_${n}`;
    if (!existing[id]) return id;
    n += 1;
  }
}

export function nextLabColor(labs: Record<string, Lab>): string {
  return LAB_COLOR_PALETTE[Object.keys(labs).length % LAB_COLOR_PALETTE.length];
}

function readLabIds(raw: { lab_id?: unknown; lab_ids?: unknown }, labs: Record<string, Lab>): string[] {
  const ids: string[] = [];
  const push = (value: unknown) => {
    if (typeof value !== "string" || !labs[value] || ids.includes(value)) return;
    ids.push(value);
  };
  if (Array.isArray(raw.lab_ids)) {
    for (const id of raw.lab_ids) push(id);
  }
  push(raw.lab_id);
  return ids;
}

const ORCID_PATTERN = /\b(\d{4}-\d{4}-\d{4}-\d{3}[\dX])\b/i;

export function readOrcid(value: unknown): string {
  const text = typeof value === "string" ? value : "";
  const match = ORCID_PATTERN.exec(text.trim());
  return match ? match[1].toUpperCase() : "";
}

export function compactPersonName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, "");
}

function fullNameTokens(value: string): string[] | null {
  const parts = value.toLowerCase().split(/[^a-z0-9\u3400-\u9fff]+/).filter(Boolean);
  if (parts.length < 2 || parts.some((part) => part.length < 2)) return null;
  return [...parts].sort();
}

function sameFullName(left: string, right: string): boolean {
  const compactLeft = compactPersonName(left);
  const compactRight = compactPersonName(right);
  if (compactLeft && compactLeft === compactRight) return true;
  const leftTokens = fullNameTokens(left);
  const rightTokens = fullNameTokens(right);
  if (!leftTokens || !rightTokens || leftTokens.length !== rightTokens.length) return false;
  return leftTokens.every((token, index) => token === rightTokens[index]);
}

export function personAliases(person: Pick<Person, "aliases">): string[] {
  return Array.isArray(person.aliases) ? person.aliases : [];
}

function givenWithMiddle(person: Pick<Person, "given_name" | "middle_name">): string {
  return [person.given_name, person.middle_name ?? ""].map((part) => part.trim()).filter(Boolean).join(" ");
}

function storedNames(person: Person): string[] {
  const given = givenWithMiddle(person);
  const western = [person.family_name, given].filter(Boolean).join(" ");
  const swapped = [given, person.family_name].filter(Boolean).join(" ");
  return [person.name, ...personAliases(person), western, swapped].map((item) => item.trim()).filter(Boolean);
}

/** 英文名的第一段是名，后面是中间名。汉字名不拆。 */
export function splitGivenName(given: string): { given: string; middle: string } {
  const trimmed = given.trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "";
  if (parts.length < 2 || !/[A-Za-z]/.test(first)) return { given: trimmed, middle: "" };
  return { given: first, middle: parts.slice(1).join(" ") };
}

function hasCjk(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value);
}

function readBounded(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

/** 文献里的单位名是否已经记在这条单位的中文名、英文名或显示名上。 */
export function labKnownAs(lab: Pick<Lab, "name" | "name_zh" | "name_en">, affiliation: string): boolean {
  const key = affiliation.trim().toLowerCase().replace(/\s+/g, "");
  if (!key) return false;
  return [lab.name, lab.name_zh ?? "", lab.name_en ?? ""].some((item) => item.trim().toLowerCase().replace(/\s+/g, "") === key);
}

/** 把文献里的单位名补进还空着的那种语言。显示名优先用中文名。 */
export function rememberLabName(lab: Lab, affiliation: string): void {
  const trimmed = affiliation.trim().slice(0, 80);
  if (!trimmed) return;
  if (hasCjk(trimmed)) {
    if (!lab.name_zh) lab.name_zh = trimmed;
  } else if (!lab.name_en) {
    lab.name_en = trimmed;
  }
  lab.name = lab.name_zh || lab.name_en || lab.name;
}

const ADDRESS_MAX = 240;
const ADDRESS_CAP = 8;

function foldAddress(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

export function personAffiliations(person: Pick<Person, "affiliations">): PersonAffiliation[] {
  return Array.isArray(person.affiliations) ? person.affiliations : [];
}

export function affiliationLabel(item: PersonAffiliation): string {
  return item.name_zh || item.name_en || "";
}

/** 读入地址。同一条里的中文和英文都留下，空的丢掉。 */
export function normalizePersonAffiliations(value: unknown): PersonAffiliation[] {
  if (!Array.isArray(value)) return [];
  const out: PersonAffiliation[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as { name_zh?: unknown; name_en?: unknown; name?: unknown };
    let zh = readBounded(raw.name_zh, ADDRESS_MAX);
    let en = readBounded(raw.name_en, ADDRESS_MAX);
    const legacy = readBounded(raw.name, ADDRESS_MAX);
    if (!zh && !en && legacy) {
      if (hasCjk(legacy)) zh = legacy;
      else en = legacy;
    }
    if (!zh && !en) continue;
    const key = `${foldAddress(zh)}|${foldAddress(en)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const next: PersonAffiliation = {};
    if (zh) next.name_zh = zh;
    if (en) next.name_en = en;
    out.push(next);
    if (out.length >= ADDRESS_CAP) break;
  }
  return out;
}

export const LAB_STAGES: LabStage[] = ["master", "phd", "postdoc", "assistant", "pi"];
export const JOB_TITLES = ["教授", "副教授", "助理教授", "研究员", "副研究员", "助理研究员", "讲师"] as const;
const IDENTITY_TAG_CAP = 6;
const IDENTITY_CATALOG_CAP = 12;
const IDENTITY_TAG_MAX = 40;

export function labStageLabel(stage: LabStage): string {
  switch (stage) {
    case "master":
      return "硕士生";
    case "phd":
      return "博士生";
    case "postdoc":
      return "博后";
    case "assistant":
      return "科研助理";
    case "pi":
      return "PI";
    default: {
      const unexpected: never = stage;
      return unexpected;
    }
  }
}

function labelToStage(value: string): LabStage | null {
  switch (value.trim()) {
    case "硕士生":
      return "master";
    case "博士生":
      return "phd";
    case "博后":
      return "postdoc";
    case "科研助理":
      return "assistant";
    case "PI":
    case "pi":
      return "pi";
    default:
      return null;
  }
}

function readLabStage(value: unknown): LabStage | null {
  if (value === "master" || value === "phd" || value === "postdoc" || value === "assistant" || value === "pi") return value;
  return null;
}

/** 同一实验室可以同时记下多项。旧数据里的单个 `stage` 并进来，并按预设顺序排列。 */
function readLabStages(stages: unknown, legacyStage: unknown): LabStage[] {
  const found = new Set<LabStage>();
  if (Array.isArray(stages)) {
    for (const item of stages) {
      const stage = readLabStage(item);
      if (stage) found.add(stage);
    }
  }
  const single = readLabStage(legacyStage);
  if (single) found.add(single);
  return LAB_STAGES.filter((stage) => found.has(stage));
}

function readIdentityTags(value: unknown, legacyNote: unknown, cap = IDENTITY_TAG_CAP): string[] {
  const source = Array.isArray(value) ? [...value, legacyNote] : [legacyNote];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of source) {
    const text = readBounded(item, IDENTITY_TAG_MAX);
    if (!text || labelToStage(text)) continue;
    const key = compactPersonName(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= cap) break;
  }
  return out;
}

/** 实验室里长期保留的身份。预设身份不重复收进这张表。 */
export function normalizeIdentityCatalog(value: unknown): string[] {
  return readIdentityTags(value, undefined, IDENTITY_CATALOG_CAP);
}

function personNameForms(person: Pick<Person, "name" | "family_name" | "given_name" | "middle_name" | "aliases">): string[] {
  const forms = [person.name, ...(person.aliases ?? [])];
  const family = person.family_name.trim();
  const given = givenWithMiddle(person);
  if (family && given) forms.push(`${family} ${given}`, `${given} ${family}`);
  const plainGiven = person.given_name.trim();
  if (family && plainGiven && plainGiven !== given) forms.push(`${family} ${plainGiven}`, `${plainGiven} ${family}`);
  return forms.map((item) => item.trim()).filter(Boolean);
}

/** 实验室以这个人的名字命名时，这个人就是该实验室的负责人。 */
export function personIsLabHead(
  person: Pick<Person, "name" | "family_name" | "given_name" | "middle_name" | "aliases">,
  lab: Pick<Lab, "name" | "name_zh" | "name_en">,
): boolean {
  const forms = personNameForms(person);
  const labNames = [lab.name, lab.name_zh ?? "", lab.name_en ?? ""].map((item) => item.trim()).filter(Boolean);
  return forms.some((left) => labNames.some((right) => sameFullName(left, right)));
}

/** 这个人在该实验室里算 PI：实验室负责人、人物页标了 PI，或身份里点了 PI。 */
export function personAdvisesLab(person: Pick<Person, "name" | "family_name" | "given_name" | "middle_name" | "aliases" | "pi" | "lab_ids" | "lab_roles">, lab: Pick<Lab, "id" | "name" | "name_zh" | "name_en">): boolean {
  if (!person.lab_ids.includes(lab.id)) return false;
  if (person.pi || personIsLabHead(person, lab)) return true;
  return (person.lab_roles ?? []).some((role) => role.lab_id === lab.id && (role.stages ?? []).includes("pi"));
}

/** 读入实验室身份。同一实验室只留第一条。`allowed` 给出时，不在其中的实验室丢掉。 */
export function normalizeLabStageRecords(value: unknown, allowed: ReadonlySet<string> | null): LabStageRecord[] {
  if (!Array.isArray(value)) return [];
  const out: LabStageRecord[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as { lab_id?: unknown; stage?: unknown; stages?: unknown; note?: unknown; tags?: unknown; advisor_id?: unknown };
    const labId = String(raw.lab_id ?? "").trim();
    if (!labId || seen.has(labId)) continue;
    if (allowed && !allowed.has(labId)) continue;
    const stageText = String(raw.stage ?? "").trim();
    const stages = readLabStages(raw.stages, raw.stage);
    const tags = readIdentityTags(raw.tags, stageText === "other" || stageText === "" ? raw.note : undefined);
    const advisorId = readBounded(raw.advisor_id, 80);
    if (stages.length === 0 && tags.length === 0 && !advisorId) continue;
    seen.add(labId);
    const next: LabStageRecord = { lab_id: labId };
    if (stages.length > 0) next.stages = stages;
    if (tags.length > 0) next.tags = tags;
    if (advisorId) next.advisor_id = advisorId;
    out.push(next);
    if (out.length >= 8) break;
  }
  return out;
}

/** 实验室负责人在自己的实验室里记为 PI。`createForMembership` 为真时，当前所属的实验室也会补上。 */
export function assignLabHeadRoles(
  person: Pick<Person, "name" | "family_name" | "given_name" | "middle_name" | "aliases" | "lab_ids">,
  roles: LabStageRecord[],
  labs: Record<string, Pick<Lab, "name" | "name_zh" | "name_en"> | undefined>,
  createForMembership: boolean,
): LabStageRecord[] {
  const next = roles.map((role) => ({ ...role }));
  const apply = (labId: string, create: boolean) => {
    const lab = labs[labId];
    if (!lab || !personIsLabHead(person, lab)) return;
    const index = next.findIndex((role) => role.lab_id === labId);
    if (index < 0) {
      if (create) next.push({ lab_id: labId, stages: ["pi"] });
      return;
    }
    next[index] = { lab_id: labId, stages: ["pi"] };
  };
  for (const role of [...next]) apply(role.lab_id, false);
  if (createForMembership) {
    for (const labId of person.lab_ids) apply(labId, true);
  }
  return next;
}

export function formatLabStage(role: LabStageRecord | undefined, advisorName = ""): string {
  if (!role) return "";
  const parts: string[] = [];
  for (const stage of role.stages ?? []) parts.push(labStageLabel(stage));
  for (const tag of role.tags ?? []) parts.push(tag);
  const body = parts.join("、");
  const advisor = advisorName.trim();
  if (advisor && body) return `${advisor}的${body}`;
  return body;
}

/** 去掉指不到人、或当前已不在这个实验室的导师。投稿当时的记录不要求导师现在还在实验室里。 */
export function settleAdvisors(
  roles: LabStageRecord[] | undefined,
  selfId: string,
  people: Record<string, Pick<Person, "id" | "lab_ids"> | undefined>,
  requireMembership: boolean,
): LabStageRecord[] {
  const next: LabStageRecord[] = [];
  for (const role of roles ?? []) {
    const advisor = role.advisor_id ? people[role.advisor_id] : undefined;
    const sameLab = !!advisor && advisor.lab_ids.includes(role.lab_id);
    const kept = advisor && advisor.id !== selfId && (!requireMembership || sameLab) ? role.advisor_id : undefined;
    const cleaned: LabStageRecord = { ...role };
    if (kept) cleaned.advisor_id = kept;
    else delete cleaned.advisor_id;
    if (!cleaned.stages?.length && !cleaned.tags?.length && !cleaned.advisor_id) continue;
    next.push(cleaned);
  }
  return next;
}

export function formatPaperRoles(
  roles: LabStageRecord[] | undefined,
  labs: Record<string, Pick<Lab, "name"> | undefined>,
  people?: Record<string, Pick<Person, "name"> | undefined>,
): string {
  return (roles ?? [])
    .map((role) => {
      const name = labs[role.lab_id]?.name;
      const advisor = role.advisor_id ? people?.[role.advisor_id]?.name ?? "" : "";
      const stage = formatLabStage(role, advisor);
      if (!name || !stage) return "";
      return `${name} ${stage}`;
    })
    .filter(Boolean)
    .join("；");
}

/** 把文章里的一条地址记到这个人身上。已经有同样写法时不重复记，也不改实验室。 */
export function rememberPersonAddress(person: Person, address: string): void {
  const trimmed = address.trim().slice(0, ADDRESS_MAX);
  const key = foldAddress(trimmed);
  if (!key) return;
  const list = personAffiliations(person);
  const known = list.some(
    (item) => foldAddress(item.name_zh ?? "") === key || foldAddress(item.name_en ?? "") === key || foldAddress(affiliationLabel(item)) === key,
  );
  if (known || list.length >= ADDRESS_CAP) return;
  const next = hasCjk(trimmed) ? { name_zh: trimmed } : { name_en: trimmed };
  person.affiliations = [...list, next];
}

export function normalizePersonAliases(aliases: unknown, name: string): string[] {
  if (!Array.isArray(aliases)) return [];
  const seen = new Set<string>([compactPersonName(name)]);
  const names: string[] = [];
  for (const item of aliases) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim().slice(0, 80);
    const key = compactPersonName(trimmed);
    if (!trimmed || !key || seen.has(key)) continue;
    seen.add(key);
    names.push(trimmed);
    if (names.length >= 12) break;
  }
  return names;
}

/** 记下另一种写法。和常用名或已有写法只差空格、标点、大小写时不重复记。 */
export function rememberPersonName(person: Person, name: string): void {
  const trimmed = name.trim().slice(0, 80);
  const key = compactPersonName(trimmed);
  if (!key || storedNames(person).some((item) => compactPersonName(item) === key)) return;
  person.aliases = [...personAliases(person), trimmed].slice(0, 12);
}

export interface PersonNameQuery {
  name: string;
  family: string;
  given: string;
  orcid: string;
}

function namesMatch(person: Person, query: PersonNameQuery): boolean {
  const queryOrcid = readOrcid(query.orcid);
  const personOrcid = readOrcid(person.orcid);
  if (queryOrcid && personOrcid && queryOrcid !== personOrcid) return false;
  if (queryOrcid && personOrcid && queryOrcid === personOrcid) return true;
  const candidates = [query.name, [query.family, query.given].filter(Boolean).join(" "), [query.given, query.family].filter(Boolean).join(" ")];
  return storedNames(person).some((stored) => candidates.some((candidate) => candidate && sameFullName(stored, candidate)));
}

function givenInitial(given: string): string | null {
  const compact = given.trim().replace(/\./g, "");
  return /^[A-Za-z]$/.test(compact) ? compact.toLowerCase() : null;
}

/** 先认 ORCID，再认完整姓名和已记下的其他写法。缩写只在库里只有一位对得上时才用。 */
export function findKnownPerson(people: Record<string, Person>, query: PersonNameQuery): Person | undefined {
  const list = Object.values(people);
  const queryOrcid = readOrcid(query.orcid);
  if (queryOrcid) {
    const byOrcid = list.find((person) => readOrcid(person.orcid) === queryOrcid);
    if (byOrcid) return byOrcid;
  }
  const named = list.filter((person) => namesMatch(person, query));
  if (named.length === 1) return named[0];
  if (named.length > 1) return undefined;
  const initial = givenInitial(query.given);
  const family = compactPersonName(query.family);
  if (!initial || !family) return undefined;
  const hits = list.filter((person) => {
    if (queryOrcid && readOrcid(person.orcid) && queryOrcid !== readOrcid(person.orcid)) return false;
    if (compactPersonName(person.family_name) !== family) return false;
    const given = compactPersonName(givenWithMiddle(person));
    return given.length > 1 && given.startsWith(initial);
  });
  return hits.length === 1 ? hits[0] : undefined;
}

/** 把另一位并进来：名字留在其他写法里，项目作者改记在留下的这一位上。 */
export function mergePeopleInto(data: AppDataJson, keepId: string, dropId: string): boolean {
  if (keepId === dropId) return false;
  const keep = data.people[keepId];
  const drop = data.people[dropId];
  if (!keep || !drop) return false;
  rememberPersonName(keep, drop.name);
  for (const alias of personAliases(drop)) rememberPersonName(keep, alias);
  if (!keep.family_name && drop.family_name) keep.family_name = drop.family_name;
  if (!keep.given_name && drop.given_name) keep.given_name = drop.given_name;
  if (!keep.middle_name && drop.middle_name) keep.middle_name = drop.middle_name;
  for (const item of personAffiliations(drop)) {
    if (item.name_zh) rememberPersonAddress(keep, item.name_zh);
    if (item.name_en) rememberPersonAddress(keep, item.name_en);
  }
  if (!readOrcid(keep.orcid) && readOrcid(drop.orcid)) keep.orcid = readOrcid(drop.orcid);
  for (const labId of drop.lab_ids) {
    if (!keep.lab_ids.includes(labId)) keep.lab_ids.push(labId);
  }
  if (drop.pi) keep.pi = true;
  if (!keep.job && drop.job) keep.job = drop.job;
  const roles = normalizeLabStageRecords([...(keep.lab_roles ?? []), ...(drop.lab_roles ?? [])], new Set(keep.lab_ids));
  if (roles.length > 0) keep.lab_roles = roles;
  else delete keep.lab_roles;
  const keepProjects = new Set(data.authorships.filter((link) => link.person_id === keepId).map((link) => link.project_id));
  data.authorships = data.authorships.flatMap((link) => {
    if (link.person_id !== dropId) return [link];
    if (keepProjects.has(link.project_id)) return [];
    keepProjects.add(link.project_id);
    return [{ ...link, person_id: keepId }];
  });
  for (const person of Object.values(data.people)) {
    if (!person.lab_roles) continue;
    for (const role of person.lab_roles) {
      if (role.advisor_id === dropId) role.advisor_id = keepId;
    }
  }
  for (const link of data.authorships) {
    for (const role of link.paper_roles ?? []) {
      if (role.advisor_id === dropId) role.advisor_id = keepId;
    }
  }
  delete data.people[dropId];
  return true;
}

/** 读入和保存前就地补齐。旧的单一实验室和作者角色会转成多实验室、位次和通讯标记。 */
export function sanitizeAuthorsInPlace(data: AppDataJson): void {
  const labsIn = data.labs && typeof data.labs === "object" ? data.labs : {};
  const labs: Record<string, Lab> = {};
  const identityCatalogReady = new Set<string>();
  for (const [key, raw] of Object.entries(labsIn)) {
    if (!raw || typeof raw !== "object") continue;
    const name = String(raw.name ?? "").trim().slice(0, 80);
    if (!name || !key) continue;
    const nameZh = readBounded(raw.name_zh, 80);
    const nameEn = readBounded(raw.name_en, 80);
    const lab: Lab = { id: key, name, color: sanitizeLabColor(raw.color) };
    if (nameZh) lab.name_zh = nameZh;
    else if (!nameEn && hasCjk(name)) lab.name_zh = name;
    if (nameEn) lab.name_en = nameEn;
    else if (!hasCjk(name) && name !== lab.name_zh) lab.name_en = name;
    lab.name = lab.name_zh || lab.name_en || name;
    if (Array.isArray(raw.identities)) {
      identityCatalogReady.add(key);
      const identities = normalizeIdentityCatalog(raw.identities);
      if (identities.length > 0) lab.identities = identities;
      else lab.identities = [];
    }
    labs[key] = lab;
  }
  data.labs = labs;

  const peopleIn = data.people && typeof data.people === "object" ? data.people : {};
  const people: Record<string, Person> = {};
  for (const [key, value] of Object.entries(peopleIn)) {
    const raw = value as {
      name?: unknown;
      lab_id?: unknown;
      lab_ids?: unknown;
      family_name?: unknown;
      given_name?: unknown;
      middle_name?: unknown;
      aliases?: unknown;
      affiliations?: unknown;
      lab_roles?: unknown;
      pi?: unknown;
      job?: unknown;
      orcid?: unknown;
      network_center?: unknown;
      network_x?: unknown;
      network_y?: unknown;
    };
    if (!raw || typeof raw !== "object") continue;
    const name = String(raw.name ?? "").trim().slice(0, 80);
    if (!name || !key) continue;
    const person: Person = {
      id: key,
      name,
      lab_ids: readLabIds(raw, labs),
      family_name: String(raw.family_name ?? "").trim().slice(0, 40),
      given_name: String(raw.given_name ?? "").trim().slice(0, 40),
      aliases: normalizePersonAliases(raw.aliases, name),
      orcid: readOrcid(raw.orcid),
    };
    const middle = readBounded(raw.middle_name, 40);
    if (middle) person.middle_name = middle;
    const affiliations = normalizePersonAffiliations(raw.affiliations);
    if (affiliations.length > 0) person.affiliations = affiliations;
    const labRoles = assignLabHeadRoles(person, normalizeLabStageRecords(raw.lab_roles, new Set(person.lab_ids)), labs, true);
    if (labRoles.length > 0) person.lab_roles = labRoles;
    if (raw.pi === true) person.pi = true;
    const job = readBounded(raw.job, 40);
    if (job) person.job = job;
    if (raw.network_center === true) person.network_center = true;
    const networkX = readNetworkCoord(raw.network_x);
    const networkY = readNetworkCoord(raw.network_y);
    if (networkX !== null && networkY !== null) {
      person.network_x = networkX;
      person.network_y = networkY;
    }
    people[key] = person;
  }
  data.people = people;
  for (const person of Object.values(people)) {
    const roles = settleAdvisors(person.lab_roles, person.id, people, true);
    if (roles.length > 0) person.lab_roles = roles;
    else delete person.lab_roles;
  }

  const seen = new Set<string>();
  const drafts: Array<ProjectAuthorship & { legacyFirst: boolean }> = [];
  const list = Array.isArray(data.authorships) ? data.authorships : [];
  for (const value of list) {
    const raw = value as {
      project_id?: unknown;
      person_id?: unknown;
      role?: unknown;
      position?: unknown;
      corresponding?: unknown;
      credit_roles?: unknown;
      primary?: unknown;
      co_first?: unknown;
      responsibility?: unknown;
      paper_roles?: unknown;
    };
    if (!raw || typeof raw !== "object") continue;
    const projectId = String(raw.project_id ?? "");
    const personId = String(raw.person_id ?? "");
    if (!people[personId]) continue;
    const projectKnown = Boolean(data.projects[projectId] || data.deleted_projects?.[projectId]);
    if (!projectKnown) continue;
    const key = `${projectId}\0${personId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const legacy = coerceAuthorRole(raw.role);
    const explicitPosition = Number(raw.position);
    const hasPosition = Number.isFinite(explicitPosition) && explicitPosition >= 1;
    const corresponding =
      raw.corresponding === true || (raw.corresponding === undefined && legacy === "Corresponding");
    const paperRoles = normalizeLabStageRecords(raw.paper_roles, new Set(Object.keys(labs)));
    drafts.push({
      project_id: projectId,
      person_id: personId,
      position: hasPosition ? Math.min(999, Math.round(explicitPosition)) : 0,
      corresponding,
      credit_roles: coerceCreditRoles(raw.credit_roles),
      primary: raw.primary === true,
      co_first: raw.co_first === true,
      responsibility: String(raw.responsibility ?? "").trim().slice(0, 200),
      ...(paperRoles.length > 0 ? { paper_roles: paperRoles } : {}),
      legacyFirst: !hasPosition && legacy === "First",
    });
  }

  const byProject = new Map<string, Array<ProjectAuthorship & { legacyFirst: boolean }>>();
  for (const draft of drafts) {
    const group = byProject.get(draft.project_id) ?? [];
    group.push(draft);
    byProject.set(draft.project_id, group);
  }
  const authorships: ProjectAuthorship[] = [];
  for (const group of byProject.values()) {
    const placed = group.filter((item) => item.position > 0).sort((a, b) => a.position - b.position);
    const pending = group.filter((item) => item.position <= 0);
    pending.sort((a, b) => Number(b.legacyFirst) - Number(a.legacyFirst));
    const used = new Set(placed.map((item) => item.position));
    let next = 1;
    for (const item of pending) {
      while (used.has(next)) next += 1;
      item.position = next;
      used.add(next);
      next += 1;
    }
    const ordered = [...placed, ...pending].sort((a, b) => a.position - b.position);
    for (const item of ordered) {
      const person = people[item.person_id];
      const paperRoles = settleAdvisors(
        person ? assignLabHeadRoles(person, item.paper_roles ?? [], labs, false) : [],
        item.person_id,
        people,
        false,
      );
      authorships.push({
        project_id: item.project_id,
        person_id: item.person_id,
        position: item.position,
        corresponding: item.corresponding,
        credit_roles: item.credit_roles,
        primary: item.co_first || item.corresponding,
        co_first: item.co_first,
        responsibility: item.responsibility,
        ...(paperRoles.length > 0 ? { paper_roles: paperRoles } : {}),
      });
    }
  }
  const rememberCatalog = (role: LabStageRecord) => {
    const lab = labs[role.lab_id];
    if (!lab || identityCatalogReady.has(lab.id)) return;
    const next = normalizeIdentityCatalog([...(lab.identities ?? []), ...(role.tags ?? [])]);
    if (next.length > 0) lab.identities = next;
  };
  for (const person of Object.values(people)) {
    for (const role of person.lab_roles ?? []) rememberCatalog(role);
  }
  for (const link of authorships) {
    for (const role of link.paper_roles ?? []) rememberCatalog(role);
  }
  data.authorships = authorships;
}

export interface AuthorSatellite {
  personId: string;
  name: string;
  shortName: string;
  color: string;
  dx: number;
  dy: number;
  radius: number;
}

/** 这个人在本项目上还有没有做完的待办。 */
export function hasOpenAuthorTodo(project: Pick<Project, "progress_blocks">, personId: string): boolean {
  return (project.progress_blocks ?? []).some((block) => block.person_id === personId && !isBlockDone(block));
}

function authorshipOnCanvas(
  mode: AuthorDisplayMode,
  project: Pick<Project, "progress_blocks">,
  link: { person_id: string; primary: boolean },
): boolean {
  switch (mode) {
    case "off":
      return false;
    case "todo":
      return hasOpenAuthorTodo(project, link.person_id);
    case "primary":
      return link.primary && hasOpenAuthorTodo(project, link.person_id);
    case "all":
      return true;
    default: {
      const unreachable: never = mode;
      return unreachable;
    }
  }
}

export function projectAuthorSatellites(
  project: Pick<Project, "id" | "radius" | "progress_blocks">,
  data: Pick<AppDataJson, "people" | "labs" | "authorships">,
  mode: AuthorDisplayMode,
): AuthorSatellite[] {
  const links = data.authorships
    .filter((link) => link.project_id === project.id && data.people[link.person_id])
    .filter((link) => authorshipOnCanvas(mode, project, link))
    .slice()
    .sort((a, b) => {
      if (a.position !== b.position) return a.position - b.position;
      const byName = data.people[a.person_id].name.localeCompare(data.people[b.person_id].name, "zh");
      if (byName !== 0) return byName;
      return a.person_id.localeCompare(b.person_id);
    });
  if (links.length === 0) return [];
  const radius = Math.max(6, Math.min(11, project.radius * 0.42));
  const ring = project.radius + SATELLITE_GAP + radius;
  const shoulder = -2.15;
  const span = Math.min(1.15, Math.max(0, links.length - 1) * 0.62);
  return links.map((link, index) => {
    const person = data.people[link.person_id];
    const lab = person.lab_ids.map((id) => data.labs[id]).find((item) => item);
    const angle = shoulder - span / 2 + (links.length === 1 ? 0 : (span * index) / (links.length - 1));
    return {
      personId: person.id,
      name: person.name,
      shortName: authorShortName(person.name),
      color: lab?.color ?? UNASSIGNED_LAB_COLOR,
      dx: Math.cos(angle) * ring,
      dy: Math.sin(angle) * ring,
      radius,
    };
  });
}

/** 碰撞半径含当前会画出来的作者环。作者环画在项目圆外。 */
export function projectCollisionRadius(
  project: Pick<Project, "id" | "radius" | "progress_blocks">,
  data: Pick<AppDataJson, "people" | "labs" | "authorships">,
  mode: AuthorDisplayMode,
): number {
  let radius = project.radius;
  for (const satellite of projectAuthorSatellites(project, data, mode)) {
    radius = Math.max(radius, Math.hypot(satellite.dx, satellite.dy) + satellite.radius);
  }
  return radius;
}

export interface PersonProjectProgress {
  projectId: string;
  name: string;
  status: ProjectStatus;
  completion: number;
  responsibility: string;
}

export function personProjectProgress(data: AppDataJson, personId: string): PersonProjectProgress[] {
  const rows: PersonProjectProgress[] = [];
  for (const link of data.authorships) {
    if (link.person_id !== personId) continue;
    const project = data.projects[link.project_id];
    if (!project) continue;
    rows.push({
      projectId: project.id,
      name: project.name,
      status: coerceProjectStatus(project.status),
      completion: effectiveCompletion(project),
      responsibility: link.responsibility,
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, "zh") || a.projectId.localeCompare(b.projectId));
  return rows;
}

function nameParts(person: Person): { family: string; given: string } {
  const family = person.family_name.trim();
  const given = givenWithMiddle(person);
  if (family || given) return { family: family || person.name.trim(), given };
  const name = person.name.trim();
  const spaced = name.split(/\s+/).filter(Boolean);
  if (spaced.length >= 2) return { family: spaced[0] ?? "", given: spaced.slice(1).join(" ") };
  const chars = [...name];
  const han = chars.length >= 2 && chars.every((ch) => /\p{Script=Han}/u.test(ch));
  if (han) return { family: chars[0] ?? "", given: chars.slice(1).join("") };
  return { family: name, given: "" };
}

function latinInitials(given: string): string {
  const letters: string[] = [];
  for (const part of given.split(/[\s-]+/).filter(Boolean)) {
    const first = [...part][0];
    if (!first || !/[A-Za-z]/.test(first)) return "";
    letters.push(first.toUpperCase());
  }
  return letters.join("");
}

export function formatAuthorName(person: Person, style: AuthorNameStyle): string {
  const full = person.name.trim();
  switch (style) {
    case "full":
      return full;
    case "familyInitials":
    case "initialsFamily": {
      const { family, given } = nameParts(person);
      const initials = latinInitials(given);
      if (!family || !initials) return full;
      if (style === "familyInitials") return `${family} ${initials}`;
      return `${initials} ${family}`;
    }
    default: {
      const unexpected: never = style;
      return unexpected;
    }
  }
}

export function labSortKey(person: Person, labs: Record<string, Lab>): string {
  return person.lab_ids
    .map((id) => labs[id]?.name ?? "")
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "zh"))
    .join("、");
}

export function creditSortKey(roles: CreditRole[]): string {
  return [...roles]
    .sort((a, b) => creditRank(a) - creditRank(b))
    .map((role) => creditRoleLabel(role))
    .join("、");
}

export function sortProjectAuthors(
  links: ProjectAuthorship[],
  data: Pick<AppDataJson, "people" | "labs">,
  sort: AuthorTableSort,
): ProjectAuthorship[] {
  const copy = links.slice();
  copy.sort((a, b) => {
    const personA = data.people[a.person_id];
    const personB = data.people[b.person_id];
    const byPosition = a.position - b.position || a.person_id.localeCompare(b.person_id);
    if (!personA || !personB) return byPosition;
    switch (sort) {
      case "position":
        return byPosition;
      case "lab": {
        const byLab = labSortKey(personA, data.labs).localeCompare(labSortKey(personB, data.labs), "zh");
        return byLab || byPosition;
      }
      case "credit": {
        const rankA = a.credit_roles.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...a.credit_roles.map(creditRank));
        const rankB = b.credit_roles.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...b.credit_roles.map(creditRank));
        const byCredit = rankA - rankB || creditSortKey(a.credit_roles).localeCompare(creditSortKey(b.credit_roles), "zh");
        return byCredit || byPosition;
      }
      default: {
        const unexpected: never = sort;
        return unexpected;
      }
    }
  });
  return copy;
}

/** 按位次导出。原名用中文 CRediT；缩写用英文 CRediT。共同第一后加 †，通讯作者后加 *。 */
export function authorContributionText(
  data: Pick<AppDataJson, "people" | "authorships">,
  projectId: string,
  style: AuthorNameStyle,
): string {
  const links = data.authorships
    .filter((link) => link.project_id === projectId && data.people[link.person_id])
    .slice()
    .sort((a, b) => a.position - b.position || a.person_id.localeCompare(b.person_id));
  const english = style !== "full";
  const parts = links.map((link) => {
    const person = data.people[link.person_id];
    const name = `${formatAuthorName(person, style)}${link.co_first ? "†" : ""}${link.corresponding ? "*" : ""}`;
    const roles = [...link.credit_roles]
      .sort((a, b) => creditRank(a) - creditRank(b))
      .map((role) => (english ? creditRoleLabelEn(role) : creditRoleLabel(role)));
    const roleText = roles.length > 0 ? roles.join(english ? ", " : "、") : english ? "Contribution not specified" : "未填写贡献";
    return english ? `${name}: ${roleText}` : `${name}：${roleText}`;
  });
  if (parts.length === 0) return "";
  return english ? `${parts.join("; ")}.` : `${parts.join("；")}。`;
}

export interface CollabNode {
  personId: string;
  name: string;
  labId: string | null;
  labName: string;
  color: string;
  center: boolean;
  x: number;
  y: number;
}

function readNetworkCoord(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return Math.round(Math.max(-4000, Math.min(4000, raw)) * 10) / 10;
}

function savedNetworkPoint(person: Person): { x: number; y: number } | null {
  if (typeof person.network_x !== "number" || typeof person.network_y !== "number") return null;
  if (!Number.isFinite(person.network_x) || !Number.isFinite(person.network_y)) return null;
  return { x: person.network_x, y: person.network_y };
}

export interface CollabEdge {
  a: string;
  b: string;
  shared: number;
}

export interface CollaborationModel {
  nodes: CollabNode[];
  edges: CollabEdge[];
}

/** 只统计还在主列表里的项目。同一对人物的边粗细等于共同项目数。 */
export function buildCollaborationLayout(data: AppDataJson): CollaborationModel {
  const active = new Set(Object.keys(data.projects));
  const involved = new Set<string>();
  const peopleByProject = new Map<string, string[]>();
  for (const link of data.authorships) {
    if (!active.has(link.project_id) || !data.people[link.person_id]) continue;
    involved.add(link.person_id);
    const list = peopleByProject.get(link.project_id) ?? [];
    if (!list.includes(link.person_id)) list.push(link.person_id);
    peopleByProject.set(link.project_id, list);
  }

  const weight = new Map<string, number>();
  for (const ids of peopleByProject.values()) {
    const sorted = [...ids].sort();
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        const key = `${sorted[i]}\0${sorted[j]}`;
        weight.set(key, (weight.get(key) ?? 0) + 1);
      }
    }
  }

  const nodeAt = (personId: string, x: number, y: number): CollabNode => {
    const person = data.people[personId];
    const knownLabs = person.lab_ids.map((id) => data.labs[id]).filter((lab) => lab);
    const lab = knownLabs[0];
    return {
      personId,
      name: person.name,
      labId: lab?.id ?? null,
      labName: knownLabs.length > 0 ? knownLabs.map((item) => item.name).join("、") : "未归入实验室",
      color: lab?.color ?? UNASSIGNED_LAB_COLOR,
      center: person.network_center === true,
      x,
      y,
    };
  };
  const centerIds = [...involved].filter((id) => data.people[id]?.network_center === true).sort();
  const otherIds = [...involved].filter((id) => !centerIds.includes(id));
  const placed = new Map<string, { x: number; y: number }>();
  centerIds.forEach((personId, index) => {
    const saved = savedNetworkPoint(data.people[personId]);
    if (saved) {
      placed.set(personId, saved);
      return;
    }
    if (centerIds.length === 1) {
      placed.set(personId, { x: 0, y: 0 });
      return;
    }
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / centerIds.length;
    placed.set(personId, { x: Math.cos(angle) * 52, y: Math.sin(angle) * 52 });
  });
  const anchor = centerIds.reduce(
    (sum, id) => {
      const point = placed.get(id) ?? { x: 0, y: 0 };
      return { x: sum.x + point.x, y: sum.y + point.y };
    },
    { x: 0, y: 0 },
  );
  const origin = centerIds.length > 0 ? { x: anchor.x / centerIds.length, y: anchor.y / centerIds.length } : { x: 0, y: 0 };
  const freeOthers = otherIds.filter((id) => !savedNetworkPoint(data.people[id]));
  for (const personId of otherIds) {
    const saved = savedNetworkPoint(data.people[personId]);
    if (saved) placed.set(personId, saved);
  }
  const freeGroups = new Map<string, string[]>();
  for (const personId of freeOthers) {
    const person = data.people[personId];
    const labKey = person.lab_ids.filter((id) => data.labs[id]).sort().join("|");
    const list = freeGroups.get(labKey) ?? [];
    list.push(personId);
    list.sort((a, b) => data.people[a].name.localeCompare(data.people[b].name, "zh") || a.localeCompare(b));
    freeGroups.set(labKey, list);
  }
  const freeKeys = [...freeGroups.keys()].sort((a, b) => a.localeCompare(b));
  const ring = centerIds.length > 0 ? Math.max(180, 90 + freeOthers.length * 16) : freeKeys.length <= 1 ? 0 : 220;
  freeKeys.forEach((labKey, groupIndex) => {
    const members = freeGroups.get(labKey) ?? [];
    const groupAngle = -Math.PI / 2 + (2 * Math.PI * groupIndex) / Math.max(freeKeys.length, 1);
    const gx = origin.x + Math.cos(groupAngle) * ring;
    const gy = origin.y + Math.sin(groupAngle) * ring;
    const inner = members.length <= 1 ? 0 : 36 + members.length * 8;
    members.forEach((personId, personIndex) => {
      const angle = members.length <= 1 ? 0 : -Math.PI / 2 + (2 * Math.PI * personIndex) / members.length;
      placed.set(personId, { x: gx + Math.cos(angle) * inner, y: gy + Math.sin(angle) * inner });
    });
  });
  const nodes = [...involved].map((personId) => {
    const point = placed.get(personId) ?? { x: 0, y: 0 };
    return nodeAt(personId, point.x, point.y);
  });

  const edges: CollabEdge[] = [];
  for (const [key, shared] of weight) {
    const [a, b] = key.split("\0");
    if (!a || !b || !involved.has(a) || !involved.has(b)) continue;
    edges.push({ a, b, shared });
  }
  edges.sort((left, right) => left.a.localeCompare(right.a) || left.b.localeCompare(right.b));
  nodes.sort((left, right) => left.personId.localeCompare(right.personId));
  return { nodes, edges };
}
