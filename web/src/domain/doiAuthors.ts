import { cloneAppData } from "./appData";
import { CREDIT_ROLES, findKnownPerson, nextCatalogId, readOrcid, rememberPersonAddress, rememberPersonName, splitGivenName } from "./authors";
import { articleTypeFromLabels, newMilestoneId, parseIsoDate } from "./projectTime";
import type { AppDataJson, CreditRole, FundingAward, Project, SubmissionMilestoneKind } from "../types";

/** 与 Zotero DOI 识别相同的收紧规则：以 10. 开头，不把网址里的标点算进去。 */
const DOI_PATTERN = /\b10\.[0-9]{4,}\/[^\s&"']*[^\s&"'.,]/;
const CSL_ACCEPT = "application/vnd.citationstyles.csl+json";

export interface DoiCreator {
  family: string;
  given: string;
  literal: string;
  affiliations: string[];
  corresponding: boolean;
  coFirst: boolean;
  orcid: string;
  credit: CreditRole[];
}

export interface ProjectDoi {
  doi: string;
  url: string;
  venue: string;
  preprint: boolean;
}

/** 文献里能对上投稿时间点的日期。返修可以有多条，其余每种只留一条。 */
export interface PublicationDate {
  kind: Extract<SubmissionMilestoneKind, "SubmissionStart" | "Revision" | "Accepted" | "Published">;
  date: string;
}

export interface DoiPublicationFill {
  url: string;
  doi: string;
  dates: PublicationDate[];
  /** 文献类型。空字符串表示这次没认出来。 */
  articleType?: string;
  awards?: FundingAward[];
}

export interface DoiFillResult {
  data: AppDataJson;
  created: number;
  attached: number;
  total: number;
  /** 这次从文献写入了至少一项 CRediT 的人数 */
  credited: number;
  /** 这次新写进投稿记录的时间点数 */
  dated: number;
  /** 这次新写入的文献类型。已经有类型时为空。 */
  articleType: string;
  /** 这次新写入的基金号条数。已经有的号不重复计。 */
  funded: number;
}

export type DoiRequest = (url: string, accept?: string) => Promise<{ ok: boolean; json: unknown }>;
export type DoiTextRequest = (url: string) => Promise<{ ok: boolean; text: string }>;

/** 去掉包在 DOI 外面的括号，以及网址里多出来的 /pdf。 */
export function cleanDoi(doi: string): string {
  let text = doi.trim();
  if (text.endsWith(")") && !text.includes("(")) text = text.slice(0, -1);
  if (text.endsWith("}") && !text.includes("{")) text = text.slice(0, -1);
  if (!/https?:\/\//i.test(text)) text = text.replace(/\/pdf(?:\/.*)?$/i, "");
  text = text.replace(/\.(?:abstract|full|short)$/i, "");
  if (/^10\.1101\//i.test(text)) text = text.replace(/v\d+$/i, "");
  return text;
}

export function doiFromText(text: string): string | null {
  const match = DOI_PATTERN.exec(text);
  if (!match) return null;
  const doi = cleanDoi(match[0]);
  return DOI_PATTERN.test(doi) ? doi : null;
}

function pageUrl(text: string): URL | null {
  try {
    return new URL(text);
  } catch {
    return null;
  }
}

/** 牛津大学出版社的文章页没有把 DOI 写进网址，文章号就是 10.1093 后面的那一段。 */
function doiFromOup(text: string): string | null {
  const url = pageUrl(text);
  if (!url || url.hostname.toLowerCase() !== "academic.oup.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const journal = (parts[0] ?? "").toLowerCase();
  if (!/^[a-z][a-z0-9]*$/.test(journal)) return null;
  const article = [...parts].reverse().find((part) => /^[a-z]{1,}\d{2,}[a-z0-9]*$/i.test(part));
  if (!article) return null;
  return `10.1093/${journal}/${article.toLowerCase()}`;
}

/** nature.com/articles 的文章编号就是 10.1038 的后缀。 */
function doiFromNature(text: string): string | null {
  const url = pageUrl(text);
  if (!url || !/^(www\.)?nature\.com$/i.test(url.hostname)) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const index = parts.findIndex((part) => part.toLowerCase() === "articles");
  const id = parts[index + 1];
  if (index < 0 || !id || !/^[a-z0-9][a-z0-9-]*$/i.test(id)) return null;
  return `10.1038/${id}`;
}

/** 网址里的 DOI，或出版商文章页能直接对应上的 DOI。 */
export function doiFromLandingUrl(text: string): string | null {
  return doiFromText(text) ?? doiFromOup(text) ?? doiFromNature(text);
}

interface MdpiArticle {
  issn: string;
  volume: string;
  issue: string;
  article: string;
}

function mdpiArticle(text: string): MdpiArticle | null {
  const url = pageUrl(text);
  if (!url || !/^(www\.)?mdpi\.com$/i.test(url.hostname)) return null;
  const [issn, volume, issue, article] = url.pathname.split("/").filter(Boolean);
  if (!issn || !/^\d{4}-\d{3}[\dx]$/i.test(issn)) return null;
  if (!volume || !issue || !article || !/^\d+$/.test(volume) || !/^\d+$/.test(issue) || !/^\d+$/.test(article)) return null;
  return { issn, volume, issue, article };
}

function pageIsArticle(page: unknown, article: string): boolean {
  const text = Array.isArray(page) ? page.map((item) => textOf(item)).join("-") : textOf(page);
  return text === article || text.startsWith(`${article}-`) || text.startsWith(`${article}–`);
}

function doiFromCrossrefList(raw: unknown, article: MdpiArticle): string | null {
  if (!raw || typeof raw !== "object") return null;
  const items = (raw as { message?: { items?: unknown } }).message?.items;
  if (!Array.isArray(items)) return null;
  const matches: string[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const record = item as { DOI?: unknown; volume?: unknown; issue?: unknown; page?: unknown };
    if (textOf(record.volume) !== article.volume || textOf(record.issue) !== article.issue) continue;
    if (!pageIsArticle(record.page, article.article)) continue;
    const doi = doiFromText(textOf(record.DOI));
    if (doi && !matches.includes(doi)) matches.push(doi);
  }
  return matches.length === 1 ? matches[0] : null;
}

/**
 * 发表页存的常常是文章页，不是 doi.org。
 * 能从网址直接看出来的先用；MDPI 这种只写了 ISSN 和页码的，再用 Crossref 对上唯一的一篇。
 */
export async function resolvePublicationDoi(url: string, request: DoiRequest = fetchDoi): Promise<string | null> {
  const direct = doiFromLandingUrl(url);
  if (direct) return direct;
  const article = mdpiArticle(url);
  if (!article) return null;
  const endpoint =
    "https://api.crossref.org/works?query=" +
    encodeURIComponent(article.article) +
    `&filter=${encodeURIComponent(`issn:${article.issn}`)}&rows=20&select=DOI,volume,issue,page`;
  const response = await request(endpoint);
  return response.ok ? doiFromCrossrefList(response.json, article) : null;
}

/** 期刊在前，预印本在后。同一 DOI 只留一次。 */
export function projectDois(project: Project): ProjectDoi[] {
  const submissions = project.journal_submissions ?? [];
  const ordered = [...submissions.filter((item) => !item.is_preprint), ...submissions.filter((item) => item.is_preprint)];
  const found: ProjectDoi[] = [];
  const seen = new Set<string>();
  for (const submission of ordered) {
    const url = submission.url.trim();
    const doi = doiFromLandingUrl(url) ?? "";
    if (!doi && !/^https?:\/\//i.test(url)) continue;
    const key = (doi || url).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ doi, url, venue: submission.venue.trim(), preprint: submission.is_preprint });
  }
  return found;
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function affiliationsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) names.push(item.trim());
    else if (item && typeof item === "object" && typeof (item as { name?: unknown }).name === "string") {
      const name = (item as { name: string }).name.trim();
      if (name) names.push(name);
    }
  }
  return names;
}

function roleTexts(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((item) => roleTexts(item));
  if (value && typeof value === "object" && "role" in value) return roleTexts((value as { role?: unknown }).role);
  return [];
}

/** 长短语在前，避免短词先占掉「writing original draft」这一类。 */
const CREDIT_PHRASES: ReadonlyArray<readonly [string, CreditRole]> = [
  ["writing original draft", "WritingOriginalDraft"],
  ["writing review and editing", "WritingReviewEditing"],
  ["writing review editing", "WritingReviewEditing"],
  ["data curation", "DataCuration"],
  ["formal analysis", "FormalAnalysis"],
  ["funding acquisition", "FundingAcquisition"],
  ["project administration", "ProjectAdministration"],
  ["conceptualization", "Conceptualization"],
  ["conceptualisation", "Conceptualization"],
  ["investigation", "Investigation"],
  ["methodology", "Methodology"],
  ["resources", "Resources"],
  ["software", "Software"],
  ["supervision", "Supervision"],
  ["validation", "Validation"],
  ["visualization", "Visualization"],
  ["visualisation", "Visualization"],
];

function normalizeRoleText(text: string): string {
  const normalized = text
    .toLowerCase()
    .replace(/&amp;/g, " and ")
    .replace(/&/g, " and ")
    .replace(/[‐‑‒–—−]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized ? ` ${normalized} ` : "";
}

/** 从 CRediT 网址、短名或英文角色名里认出角色。普通的 author 不算。 */
function creditRolesFromText(text: string): CreditRole[] {
  const normalized = normalizeRoleText(text);
  if (!normalized) return [];
  const found = new Set<CreditRole>();
  for (const [phrase, role] of CREDIT_PHRASES) {
    if (normalized.includes(` ${phrase} `)) found.add(role);
  }
  return CREDIT_ROLES.filter((role) => found.has(role));
}

function unionCredit(current: readonly CreditRole[], extra: readonly CreditRole[]): CreditRole[] {
  const found = new Set<CreditRole>([...current, ...extra]);
  return CREDIT_ROLES.filter((role) => found.has(role));
}

function creatorFromRecord(item: unknown): (DoiCreator & { sequence: string }) | null {
  if (!item || typeof item !== "object") return null;
  const record = item as {
    family?: unknown;
    given?: unknown;
    literal?: unknown;
    name?: unknown;
    affiliation?: unknown;
    role?: unknown;
    sequence?: unknown;
    ORCID?: unknown;
    orcid?: unknown;
  };
  const family = textOf(record.family);
  const given = textOf(record.given);
  const literal = textOf(record.literal) || (!family && !given ? textOf(record.name) : "");
  if (!family && !given && !literal) return null;
  const roles = roleTexts(record.role).join(" ");
  return {
    family,
    given,
    literal,
    affiliations: affiliationsOf(record.affiliation),
    corresponding: /corresponding/i.test(roles),
    coFirst: /equal(?:ly)?(?:\s|-)?contrib|co-?first|joint first|contributed equally/i.test(roles),
    orcid: readOrcid(record.ORCID) || readOrcid(record.orcid),
    credit: creditRolesFromText(roles),
    sequence: textOf(record.sequence).toLowerCase(),
  };
}

/** CSL JSON 的 author，或 Crossref `message.author`。两位以上 sequence 为 first 时算共同第一。 */
export function creatorsFromDoiPayload(raw: unknown): DoiCreator[] {
  if (!raw || typeof raw !== "object") return [];
  const record = raw as { author?: unknown; message?: { author?: unknown } };
  const list = Array.isArray(record.author) ? record.author : record.message && Array.isArray(record.message.author) ? record.message.author : [];
  const creators: Array<DoiCreator & { sequence: string }> = [];
  for (const item of list) {
    const creator = creatorFromRecord(item);
    if (creator) creators.push(creator);
  }
  const firsts = creators.filter((item) => item.sequence === "first");
  if (firsts.length > 1) {
    for (const item of firsts) item.coFirst = true;
  }
  return creators.map((item) => ({
    family: item.family,
    given: item.given,
    literal: item.literal,
    affiliations: item.affiliations,
    corresponding: item.corresponding,
    coFirst: item.coFirst,
    orcid: item.orcid,
    credit: item.credit,
  }));
}

function plainXml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x2a;/gi, "*")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ArticleAuthorMark {
  family: string;
  given: string;
  corresponding: boolean;
  coFirst: boolean;
  credit: CreditRole[];
}

/** Europe PMC 全文 XML。✉ 或 Corresponding author 是通讯；contributed equally 或 equal-contrib 且至少两位才是共同第一。 */
export function authorMarksFromArticleXml(xml: string): ArticleAuthorMark[] {
  const notes = new Map<string, string>();
  const footnote = /<fn\b([^>]*)>([\s\S]*?)<\/fn>/gi;
  let found: RegExpExecArray | null;
  while ((found = footnote.exec(xml))) {
    const id = /\bid\s*=\s*"([^"]+)"/i.exec(found[1] ?? "")?.[1];
    if (id) notes.set(id, plainXml(found[2] ?? ""));
  }
  const groups: string[] = [];
  const group = /<contrib-group\b([^>]*)>([\s\S]*?)<\/contrib-group>/gi;
  while ((found = group.exec(xml))) {
    const attrs = found[1] ?? "";
    if (/content-type\s*=\s*"editor"/i.test(attrs)) continue;
    if (/content-type\s*=\s*"author"/i.test(attrs) || !/content-type\s*=/i.test(attrs)) groups.push(found[2] ?? "");
  }
  const marks: ArticleAuthorMark[] = [];
  const contrib = /<contrib\b([^>]*)>([\s\S]*?)<\/contrib>/gi;
  for (const body of groups) {
    contrib.lastIndex = 0;
    while ((found = contrib.exec(body))) {
      const attrs = found[1] ?? "";
      const block = found[2] ?? "";
      const family = plainXml(/<surname\b[^>]*>([\s\S]*?)<\/surname>/i.exec(block)?.[1] ?? "");
      const given = plainXml(/<given-names\b[^>]*>([\s\S]*?)<\/given-names>/i.exec(block)?.[1] ?? "");
      if (!family && !given) continue;
      const rids: string[] = [];
      let corresponding = /corresp\s*=\s*"yes"/i.test(attrs);
      const xref = /<xref\b([^>]*)>/gi;
      let link: RegExpExecArray | null;
      while ((link = xref.exec(block))) {
        const xrefAttrs = link[1] ?? "";
        if (/ref-type\s*=\s*"corresp"/i.test(xrefAttrs)) corresponding = true;
        const rid = /\brid\s*=\s*"([^"]+)"/i.exec(xrefAttrs)?.[1];
        if (rid) rids.push(rid);
      }
      const noteText = rids.map((id) => notes.get(id) ?? "").join(" ");
      if (/corresponding author|通讯作者/i.test(noteText)) corresponding = true;
      const coFirst = /equal-contrib\s*=\s*"yes"/i.test(attrs) || /contributed equally|equal contribution|共同第一|co-first/i.test(noteText);
      marks.push({ family, given, corresponding, coFirst, credit: creditRolesInContrib(block) });
    }
  }
  if (marks.filter((item) => item.coFirst).length < 2) {
    for (const item of marks) item.coFirst = false;
  }
  return marks;
}

function nameTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/-/g, "")
    .split(/[^a-z0-9\u3400-\u9fff]+/)
    .filter(Boolean);
}

function sameAuthorName(family: string, given: string, otherFamily: string, otherGiven: string): boolean {
  const leftFamily = nameTokens(family)[0] ?? "";
  const rightFamily = nameTokens(otherFamily)[0] ?? "";
  if (!leftFamily || leftFamily !== rightFamily) return false;
  const leftGiven = nameTokens(given).join("");
  const rightGiven = nameTokens(otherGiven).join("");
  if (!leftGiven || !rightGiven) return false;
  return leftGiven === rightGiven || leftGiven.startsWith(rightGiven) || rightGiven.startsWith(leftGiven);
}

function marksFromOpenAlex(raw: unknown): ArticleAuthorMark[] {
  if (!raw || typeof raw !== "object") return [];
  const items = (raw as { authorships?: unknown }).authorships;
  if (!Array.isArray(items)) return [];
  const marks: ArticleAuthorMark[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const record = item as { is_corresponding?: unknown; author?: { display_name?: unknown }; raw_author_name?: unknown };
    if (record.is_corresponding !== true) continue;
    const display = textOf(record.raw_author_name) || textOf(record.author?.display_name);
    const parts = nameTokens(display);
    if (parts.length < 2) continue;
    const family = parts[parts.length - 1] ?? "";
    const given = parts.slice(0, -1).join("");
    marks.push({ family, given, corresponding: true, coFirst: false, credit: [] });
  }
  return marks;
}

function applyMarks(creators: DoiCreator[], marks: ArticleAuthorMark[]): void {
  for (const mark of marks) {
    const creator = creators.find((item) => sameAuthorName(item.family, item.given, mark.family, mark.given));
    if (!creator) continue;
    if (mark.corresponding) creator.corresponding = true;
    if (mark.coFirst) creator.coFirst = true;
    if (mark.credit.length > 0) creator.credit = unionCredit(creator.credit, mark.credit);
  }
}

/** `<role>` 的正文，以及 CRediT 词表属性。中文角色名靠词表网址认。 */
function creditRolesInContrib(block: string): CreditRole[] {
  const chunks: string[] = [];
  const roleTag = /<role\b([^>]*?)(?:\/>|>([\s\S]*?)<\/role>)/gi;
  let match: RegExpExecArray | null;
  while ((match = roleTag.exec(block))) {
    const attrs = match[1] ?? "";
    chunks.push(
      /\bvocab-term\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? "",
      /\bvocab-term-identifier\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? "",
      /\bcontent-type\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? "",
      plainXml(match[2] ?? ""),
    );
  }
  return creditRolesFromText(chunks.join(" "));
}

function pmcidFromSearch(raw: unknown, doi: string): string | null {
  if (!raw || typeof raw !== "object") return null;
  const results = (raw as { resultList?: { result?: unknown } }).resultList?.result;
  if (!Array.isArray(results)) return null;
  const wanted = doi.toLowerCase();
  for (const item of results) {
    if (!item || typeof item !== "object") continue;
    const record = item as { doi?: unknown; pmcid?: unknown };
    if (textOf(record.doi).toLowerCase() !== wanted) continue;
    const pmcid = textOf(record.pmcid);
    if (/^PMC\d+$/i.test(pmcid)) return pmcid.toUpperCase();
  }
  return null;
}

const MONTH_NUMBER: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

function frontMatter(xml: string): string {
  return /<front\b[^>]*>([\s\S]*?)<\/front>/i.exec(xml)?.[1] ?? xml;
}

function xmlCalendarDate(attrs: string, inner: string): string | null {
  const iso = /\biso-8601-date\s*=\s*"(\d{4}-\d{2}-\d{2})"/i.exec(attrs)?.[1];
  if (iso && parseIsoDate(iso)) return iso;
  const year = /<year\b[^>]*>(\d{4})<\/year>/i.exec(inner)?.[1];
  const month = /<month\b[^>]*>(\d{1,2})<\/month>/i.exec(inner)?.[1];
  const day = /<day\b[^>]*>(\d{1,2})<\/day>/i.exec(inner)?.[1];
  if (!year || !month || !day) return null;
  return parseIsoDate(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
}

function historyKind(raw: string): { kind: PublicationDate["kind"]; electronic: boolean } | null {
  switch (raw.trim().toLowerCase()) {
    case "received":
    case "submit":
    case "submitted":
      return { kind: "SubmissionStart", electronic: false };
    case "rev-recd":
    case "rev-request":
    case "revised":
    case "revision":
      return { kind: "Revision", electronic: false };
    case "accepted":
      return { kind: "Accepted", electronic: false };
    case "epub":
    case "epub-ppub":
    case "electronic":
    case "published":
      return { kind: "Published", electronic: true };
    case "ppub":
    case "print":
      return { kind: "Published", electronic: false };
    default:
      return null;
  }
}

function addPublicationDate(
  dates: PublicationDate[],
  publishedOnline: { value: boolean },
  kind: PublicationDate["kind"],
  date: string,
  electronic: boolean,
): void {
  if (kind === "Published") {
    const existing = dates.find((item) => item.kind === "Published");
    if (!existing) {
      dates.push({ kind, date });
      publishedOnline.value = electronic;
      return;
    }
    if (electronic && !publishedOnline.value) {
      existing.date = date;
      publishedOnline.value = true;
    }
    return;
  }
  if (kind === "Revision") {
    if (!dates.some((item) => item.kind === "Revision" && item.date === date)) dates.push({ kind, date });
    return;
  }
  if (!dates.some((item) => item.kind === kind)) dates.push({ kind, date });
}

function readProseDates(text: string, dates: PublicationDate[], publishedOnline: { value: boolean }): void {
  const pattern = /\b(Received|Revised|Accepted)\s+(?:(\d{4})\s+([A-Za-z]+)\s+(\d{1,2})|(\d{1,2})\s+([A-Za-z]+)\s+(\d{4}))/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const word = (match[1] ?? "").toLowerCase();
    const kind = word === "received" ? "SubmissionStart" : word === "revised" ? "Revision" : word === "accepted" ? "Accepted" : null;
    if (!kind) continue;
    const yearFirst = Boolean(match[2]);
    const year = yearFirst ? match[2] : match[7];
    const month = MONTH_NUMBER[((yearFirst ? match[3] : match[6]) ?? "").toLowerCase()];
    const day = yearFirst ? match[4] : match[5];
    if (!year || !month || !day) continue;
    const iso = parseIsoDate(`${year}-${month}-${day.padStart(2, "0")}`);
    if (iso) addPublicationDate(dates, publishedOnline, kind, iso, false);
  }
}

function datePartsToIso(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const parts = (value as { "date-parts"?: unknown })["date-parts"];
  const first = Array.isArray(parts) ? parts[0] : null;
  if (!Array.isArray(first) || first.length < 3) return null;
  const [year, month, day] = first;
  if (typeof year !== "number" || typeof month !== "number" || typeof day !== "number") return null;
  return parseIsoDate(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
}

function workRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const message = (raw as { message?: unknown }).message;
  if (message && typeof message === "object" && !Array.isArray(message)) return message as Record<string, unknown>;
  return raw as Record<string, unknown>;
}

/** Crossref 或 CSL。在线发表优先。预印本的 accepted 只是入库日，不当成期刊接收。 */
export function publicationDatesFromDoiPayload(raw: unknown): PublicationDate[] {
  const record = workRecord(raw);
  if (!record) return [];
  const dates: PublicationDate[] = [];
  const publishedOnline = { value: false };
  const preprint = textOf(record.type) === "posted-content";
  if (!preprint) {
    const accepted = datePartsToIso(record.accepted);
    if (accepted) addPublicationDate(dates, publishedOnline, "Accepted", accepted, false);
  }
  const published =
    datePartsToIso(record["published-online"]) ??
    datePartsToIso(record.posted) ??
    datePartsToIso(record.published) ??
    datePartsToIso(record.issued) ??
    datePartsToIso(record["published-print"]);
  if (published) {
    const online = datePartsToIso(record["published-online"]) === published || datePartsToIso(record.posted) === published;
    addPublicationDate(dates, publishedOnline, "Published", published, online || preprint);
  }
  return dates;
}

/**
 * 全文前言里的收稿、返修、接收和发表。
 * 结构化 `date-type` 与牛津大学出版社那种 “Received 2023 Jan 23” 都认。
 * 在线发表优先于纸质；PMC 释放日不算投稿时间点。
 */
export function publicationDatesFromArticleXml(xml: string): PublicationDate[] {
  const front = frontMatter(xml);
  const dates: PublicationDate[] = [];
  const publishedOnline = { value: false };
  const blocks: string[] = [];
  const history = /<history\b[^>]*>([\s\S]*?)<\/history>/gi;
  const section = /<sec\b[^>]*\bsec-type\s*=\s*"history"[^>]*>([\s\S]*?)<\/sec>/gi;
  let found: RegExpExecArray | null;
  while ((found = history.exec(front))) blocks.push(found[1] ?? "");
  while ((found = section.exec(front))) blocks.push(found[1] ?? "");
  const dated = /<date\b([^>]*?)(?:\/>|>([\s\S]*?)<\/date>)/gi;
  for (const block of blocks) {
    dated.lastIndex = 0;
    while ((found = dated.exec(block))) {
      const attrs = found[1] ?? "";
      const label = /\bdate-type\s*=\s*"([^"]+)"/i.exec(attrs)?.[1] ?? "";
      const kind = historyKind(label);
      const iso = xmlCalendarDate(attrs, found[2] ?? "");
      if (kind && iso) addPublicationDate(dates, publishedOnline, kind.kind, iso, kind.electronic);
    }
    readProseDates(plainXml(block), dates, publishedOnline);
  }
  const pubHistory = /<pub-history\b[^>]*>([\s\S]*?)<\/pub-history>/gi;
  while ((found = pubHistory.exec(front))) {
    const event = /<event\b([^>]*)>([\s\S]*?)<\/event>/gi;
    let item: RegExpExecArray | null;
    while ((item = event.exec(found[1] ?? ""))) {
      const attrs = item[1] ?? "";
      const label = /\bevent-type\s*=\s*"([^"]+)"/i.exec(attrs)?.[1] ?? "";
      const kind = historyKind(label);
      const inner = /<date\b([^>]*?)(?:\/>|>([\s\S]*?)<\/date>)/i.exec(item[2] ?? "");
      const iso = inner ? xmlCalendarDate(inner[1] ?? "", inner[2] ?? "") : xmlCalendarDate(attrs, item[2] ?? "");
      if (kind && iso) addPublicationDate(dates, publishedOnline, kind.kind, iso, kind.electronic);
    }
  }
  const article = front.replace(/<pub-history\b[\s\S]*?<\/pub-history>/gi, "");
  const published = /<pub-date\b([^>]*?)(?:\/>|>([\s\S]*?)<\/pub-date>)/gi;
  while ((found = published.exec(article))) {
    const attrs = found[1] ?? "";
    const label = /\bpub-type\s*=\s*"([^"]+)"/i.exec(attrs)?.[1] ?? "electronic";
    const kind = historyKind(label);
    const iso = xmlCalendarDate(attrs, found[2] ?? "");
    if (kind?.kind === "Published" && iso) addPublicationDate(dates, publishedOnline, "Published", iso, kind.electronic);
  }
  return dates;
}

function mergePublicationDates(primary: PublicationDate[], extra: PublicationDate[]): PublicationDate[] {
  const dates = primary.map((item) => ({ ...item }));
  for (const item of extra) {
    if (item.kind === "Revision") {
      if (!dates.some((one) => one.kind === "Revision" && one.date === item.date)) dates.push({ ...item });
      continue;
    }
    if (!dates.some((one) => one.kind === item.kind)) dates.push({ ...item });
  }
  return dates;
}

/** 全文根节点上的 `article-type`。没有时再看前言里的栏目名。 */
export function articleTypeFromArticleXml(xml: string): string {
  const attrs = /<article\b([^>]*)>/i.exec(xml)?.[1] ?? "";
  const typed = /\barticle-type\s*=\s*"([^"]+)"/i.exec(attrs)?.[1] ?? "";
  const fromAttr = articleTypeFromLabels(typed ? [typed] : []);
  if (fromAttr) return fromAttr;
  const subjects: string[] = [];
  const subject = /<subject\b[^>]*>([\s\S]*?)<\/subject>/gi;
  let found: RegExpExecArray | null;
  const front = frontMatter(xml);
  while ((found = subject.exec(front))) {
    const text = plainXml(found[1] ?? "");
    if (text) subjects.push(text);
  }
  return articleTypeFromLabels(subjects);
}

/** Europe PMC 检索结果。资助类说明略过；只剩 Journal Article 时记为研究论文。 */
export function articleTypeFromPmcSearch(raw: unknown, doi: string): string {
  if (!raw || typeof raw !== "object") return "";
  const results = (raw as { resultList?: { result?: unknown } }).resultList?.result;
  if (!Array.isArray(results)) return "";
  const wanted = doi.toLowerCase();
  for (const item of results) {
    if (!item || typeof item !== "object") continue;
    const record = item as { doi?: unknown; pubType?: unknown; pubTypeList?: { pubType?: unknown } };
    if (textOf(record.doi).toLowerCase() !== wanted) continue;
    const listed = record.pubTypeList?.pubType;
    const labels = Array.isArray(listed) ? listed.map((entry) => textOf(entry)) : textOf(record.pubType).split(/[;；]/);
    return articleTypeFromLabels(labels, true);
  }
  return "";
}

/** Crossref 或 CSL 的 `type`。`journal-article` 太粗，综述也是这个值，所以留空。 */
export function articleTypeFromDoiPayload(raw: unknown): string {
  const record = workRecord(raw);
  if (!record) return "";
  return articleTypeFromLabels([textOf(record.type)]);
}

export function articleTypeFromOpenAlex(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  return articleTypeFromLabels([textOf((raw as { type?: unknown }).type)]);
}

const FUNDER_LABELS: ReadonlyArray<readonly [RegExp, string]> = [
  [/10\.13039\/501100001809|national natural science foundation of china|\bnsfc\b/i, "国家自然科学基金"],
  [/strategic priority research program of the chinese academy of sciences/i, "中国科学院战略性先导科技专项"],
  [/10\.13039\/501100004739|youth innovation promotion association/i, "中国科学院青年创新促进会"],
  [/national key research and development|national key r&d/i, "国家重点研发计划"],
  [/10\.13039\/501100002367|chinese academy of sciences/i, "中国科学院"],
];

function funderLabel(name: string, funderDoi = ""): string {
  const haystack = `${funderDoi} ${name}`;
  for (const [pattern, label] of FUNDER_LABELS) {
    if (pattern.test(haystack)) return label;
  }
  return name.trim().replace(/\s+/g, " ").replace(/^(?:the|and)\s+/i, "").slice(0, 80);
}

function awardNumber(raw: string): string {
  const text = raw.trim().replace(/\s+/g, "");
  if (!/^[A-Za-z0-9][A-Za-z0-9./-]{1,39}$/.test(text)) return "";
  if (!/\d/.test(text) || /^\d{4}$/.test(text)) return "";
  return text;
}

export function mergeAwards(primary: FundingAward[], extra: FundingAward[]): FundingAward[] {
  const awards = primary.map((item) => ({ ...item }));
  const seen = new Set(awards.map((item) => item.number.toUpperCase()));
  for (const item of extra) {
    const key = item.number.toUpperCase();
    if (!item.number || seen.has(key)) continue;
    seen.add(key);
    awards.push({ ...item });
    if (awards.length >= 16) break;
  }
  return awards;
}

function awardsFromProse(text: string): FundingAward[] {
  const plain = text.replace(/\s+/g, " ");
  const awards: FundingAward[] = [];
  const pattern = /([^.;[]{2,200})\s*\[([^[\]]+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(plain))) {
    let name = (match[1] ?? "").replace(/^.*\b(?:supported by|funded by|granted by|from)\s+/i, "");
    const pieces = name.split(",");
    name = (pieces[pieces.length - 1] ?? name).replace(/^(?:\s*and)?\s*the\s+/i, "").replace(/^and\s+/i, "").trim();
    if (!name) continue;
    const funder = funderLabel(name);
    for (const part of (match[2] ?? "").split(",")) {
      const number = awardNumber(part);
      if (number) awards.push({ funder, number });
    }
  }
  return mergeAwards([], awards);
}

function sectionsTitled(xml: string, title: string): string[] {
  const pattern = new RegExp(`<sec\\b[^>]*>\\s*<title>\\s*${title}\\s*</title>([\\s\\S]*?)</sec>`, "gi");
  const blocks: string[] = [];
  let found: RegExpExecArray | null;
  while ((found = pattern.exec(xml))) blocks.push(found[1] ?? "");
  return blocks;
}

/** 全文里的资助。结构化的基金号优先，资助说明里的方括号补上登记库没有的号。 */
export function awardsFromArticleXml(xml: string): FundingAward[] {
  const awards: FundingAward[] = [];
  const group = /<award-group\b[^>]*>([\s\S]*?)<\/award-group>/gi;
  let found: RegExpExecArray | null;
  while ((found = group.exec(xml))) {
    const block = found[1] ?? "";
    const source = plainXml(/<funding-source\b[^>]*>([\s\S]*?)<\/funding-source>/i.exec(block)?.[1] ?? "");
    const funder = funderLabel(source);
    const ident = /<award-id\b[^>]*>([\s\S]*?)<\/award-id>/gi;
    let id: RegExpExecArray | null;
    while ((id = ident.exec(block))) {
      const number = awardNumber(plainXml(id[1] ?? ""));
      if (number) awards.push({ funder, number });
    }
  }
  const prose = [
    ...sectionsTitled(xml, "Funding"),
    ...sectionsTitled(xml, "Financial support"),
  ];
  const fundingGroup = /<funding-group\b[^>]*>([\s\S]*?)<\/funding-group>/gi;
  while ((found = fundingGroup.exec(xml))) prose.push(found[1] ?? "");
  return mergeAwards(awards, awardsFromProse(prose.map((block) => plainXml(block)).join(" ")));
}

function crossrefAwardNumbers(value: unknown): string[] {
  if (typeof value === "string" || typeof value === "number") {
    const number = awardNumber(textOf(value));
    return number ? [number] : [];
  }
  if (Array.isArray(value)) return value.flatMap((item) => crossrefAwardNumbers(item));
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((item) => crossrefAwardNumbers(item));
  }
  return [];
}

/** Crossref `funder`。没有基金号的资助机构不记。 */
export function awardsFromDoiPayload(raw: unknown): FundingAward[] {
  const record = workRecord(raw);
  if (!record || !Array.isArray(record.funder)) return [];
  const awards: FundingAward[] = [];
  for (const item of record.funder) {
    if (!item || typeof item !== "object") continue;
    const row = item as { name?: unknown; DOI?: unknown; award?: unknown; "award-info"?: unknown };
    const funder = funderLabel(textOf(row.name), textOf(row.DOI));
    const numbers = [
      ...crossrefAwardNumbers(row.award),
      ...crossrefAwardNumbers(row["award-info"]),
    ];
    for (const number of numbers) awards.push({ funder, number });
  }
  return mergeAwards([], awards);
}

async function attachPublicationMarks(
  doi: string,
  creators: DoiCreator[],
  request: DoiRequest,
  readText: DoiTextRequest,
): Promise<{ dates: PublicationDate[]; articleType: string; awards: FundingAward[] }> {
  const search = await request(
    `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(`DOI:${doi}`)}&format=json&resultType=lite&pageSize=5`,
  );
  const pmcid = search.ok ? pmcidFromSearch(search.json, doi) : null;
  let dates: PublicationDate[] = [];
  let articleType = search.ok ? articleTypeFromPmcSearch(search.json, doi) : "";
  let awards: FundingAward[] = [];
  if (pmcid) {
    const xml = await readText(`https://www.ebi.ac.uk/europepmc/webservices/rest/${pmcid}/fullTextXML`);
    if (xml.ok) {
      applyMarks(creators, authorMarksFromArticleXml(xml.text));
      dates = publicationDatesFromArticleXml(xml.text);
      const fromXml = articleTypeFromArticleXml(xml.text);
      if (fromXml) articleType = fromXml;
      awards = awardsFromArticleXml(xml.text);
    }
  }
  const needCorresponding = !creators.some((item) => item.corresponding);
  if (needCorresponding || !articleType) {
    const fields = [needCorresponding ? "authorships" : "", articleType ? "" : "type"].filter(Boolean).join(",");
    const openAlex = await request(
      `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}?mailto=dev@localhost&select=${fields}`,
    );
    if (openAlex.ok) {
      if (needCorresponding) applyMarks(creators, marksFromOpenAlex(openAlex.json));
      if (!articleType) articleType = articleTypeFromOpenAlex(openAlex.json);
    }
  }
  if (creators.filter((item) => item.coFirst).length < 2) {
    for (const creator of creators) creator.coFirst = false;
  }
  return { dates, articleType, awards };
}

async function fetchDoi(url: string, accept?: string): Promise<{ ok: boolean; json: unknown }> {
  try {
    const response = await fetch(url, accept ? { headers: { Accept: accept } } : undefined);
    if (!response.ok) return { ok: false, json: null };
    return { ok: true, json: await response.json() };
  } catch {
    return { ok: false, json: null };
  }
}

async function fetchText(url: string): Promise<{ ok: boolean; text: string }> {
  try {
    const response = await fetch(url);
    if (!response.ok) return { ok: false, text: "" };
    return { ok: true, text: await response.text() };
  } catch {
    return { ok: false, text: "" };
  }
}

function absorbCredit(creators: DoiCreator[], extra: DoiCreator[]): void {
  for (const item of extra) {
    if (item.credit.length === 0) continue;
    const creator = creators.find((one) => sameAuthorName(one.family, one.given, item.family, item.given));
    if (!creator) continue;
    creator.credit = unionCredit(creator.credit, item.credit);
  }
}

/**
 * 先向 doi.org 要 CSL JSON，这是 Zotero 解析 DOI 的内容协商。
 * 没有作者时再读 Crossref 的 works 接口。CSL 里没有 CRediT 时，再用 Crossref 的角色补上。
 * 通讯作者、共同第一和全文里的 CRediT 再从 Europe PMC 补上；没有全文时，通讯作者用 OpenAlex。
 * 同一遍读取里带回收稿、返修、接收、发表日期、文献类型和基金号。全文优先，登记库只补还没有的项。
 */
export async function loadDoiCreators(
  doi: string,
  request: DoiRequest = fetchDoi,
  readText: DoiTextRequest = fetchText,
): Promise<{ ok: true; creators: DoiCreator[]; dates: PublicationDate[]; articleType: string; awards: FundingAward[] } | { ok: false; message: string }> {
  const cleaned = cleanDoi(doi);
  if (!doiFromText(cleaned)) return { ok: false, message: "DOI 无法识别" };
  const csl = await request(`https://doi.org/${encodeURIComponent(cleaned)}`, CSL_ACCEPT);
  const fromCsl = csl.ok ? creatorsFromDoiPayload(csl.json) : [];
  const crossrefUrl = `https://api.crossref.org/works/${encodeURIComponent(cleaned)}`;
  const crossref = fromCsl.length > 0 ? null : await request(crossrefUrl);
  const creators = fromCsl.length > 0 ? fromCsl : crossref?.ok ? creatorsFromDoiPayload(crossref.json) : [];
  if (creators.length === 0) return { ok: false, message: csl.ok || crossref?.ok ? "这篇文献没有作者" : "读不到这篇文献" };
  let deposited: { ok: boolean; json: unknown } | null = crossref;
  if (fromCsl.length > 0 && creators.every((item) => item.credit.length === 0)) {
    deposited = await request(crossrefUrl);
    if (deposited.ok) absorbCredit(creators, creatorsFromDoiPayload(deposited.json));
  }
  const fromArticle = await attachPublicationMarks(cleaned, creators, request, readText);
  const fromRecord = mergePublicationDates(
    deposited?.ok ? publicationDatesFromDoiPayload(deposited.json) : [],
    csl.ok ? publicationDatesFromDoiPayload(csl.json) : [],
  );
  let articleType = fromArticle.articleType;
  if (!articleType && deposited?.ok) articleType = articleTypeFromDoiPayload(deposited.json);
  if (!articleType && csl.ok) articleType = articleTypeFromDoiPayload(csl.json);
  if (!deposited && fromArticle.awards.length === 0) deposited = await request(crossrefUrl);
  const awards = mergeAwards(fromArticle.awards, deposited?.ok ? awardsFromDoiPayload(deposited.json) : []);
  return { ok: true, creators, dates: mergePublicationDates(fromArticle.dates, fromRecord), articleType, awards };
}

interface NamedCreator {
  name: string;
  family: string;
  given: string;
  middle: string;
  affiliations: string[];
  corresponding: boolean;
  coFirst: boolean;
  orcid: string;
  credit: CreditRole[];
}

function nameCreator(creator: DoiCreator): NamedCreator | null {
  const literal = creator.literal.trim();
  const family = creator.family.trim().slice(0, 40);
  const givenFull = creator.given.trim();
  const parts = splitGivenName(givenFull);
  const given = parts.given.slice(0, 40);
  const middle = parts.middle.slice(0, 40);
  const cjk = /[\u3400-\u9fff]/.test(family + givenFull);
  const combined = literal || (cjk ? `${family}${givenFull}` : [family, givenFull].filter(Boolean).join(" "));
  const name = combined.trim().slice(0, 80);
  if (!name) return null;
  return {
    name,
    family: literal ? "" : family,
    given: literal ? "" : given,
    middle: literal ? "" : middle,
    affiliations: creator.affiliations
      .map((item) => item.trim().slice(0, 240))
      .filter(Boolean)
      .slice(0, 8),
    corresponding: creator.corresponding,
    coFirst: creator.coFirst,
    orcid: readOrcid(creator.orcid),
    credit: unionCredit([], creator.credit),
  };
}

function submissionsForPublication(data: AppDataJson, projectId: string, publication: DoiPublicationFill | undefined) {
  const project = data.projects[projectId];
  const wanted = publication?.doi.trim().toLowerCase() ?? "";
  const sourceUrl = publication?.url.trim() ?? "";
  return (project?.journal_submissions ?? []).filter((item) => {
    if (sourceUrl && item.url.trim() === sourceUrl) return true;
    const landing = doiFromLandingUrl(item.url);
    return Boolean(wanted && landing && landing.toLowerCase() === wanted);
  });
}

function applyPublicationDates(data: AppDataJson, projectId: string, publication: DoiPublicationFill | undefined): number {
  const dates = publication?.dates ?? [];
  if (dates.length === 0) return 0;
  const targets = submissionsForPublication(data, projectId, publication);
  let added = 0;
  for (const submission of targets) {
    for (const point of dates) {
      const sameKind = submission.milestones.filter((item) => item.kind === point.kind);
      if (point.kind !== "Revision" && sameKind.length > 0) continue;
      if (sameKind.some((item) => item.date === point.date)) continue;
      submission.milestones.push({
        id: newMilestoneId(),
        kind: point.kind,
        label: "",
        date: point.date,
        note: "",
      });
      added += 1;
    }
  }
  return added;
}

function applyArticleType(data: AppDataJson, projectId: string, publication: DoiPublicationFill | undefined): string {
  const articleType = publication?.articleType?.trim() ?? "";
  if (!articleType) return "";
  let written = "";
  for (const submission of submissionsForPublication(data, projectId, publication)) {
    if ((submission.article_type ?? "").trim()) continue;
    submission.article_type = articleType;
    written = articleType;
  }
  return written;
}

function applyAwards(data: AppDataJson, projectId: string, publication: DoiPublicationFill | undefined): number {
  const incoming = publication?.awards ?? [];
  if (incoming.length === 0) return 0;
  let added = 0;
  for (const submission of submissionsForPublication(data, projectId, publication)) {
    const existing = submission.awards ?? [];
    const seen = new Set(existing.map((item) => item.number.toUpperCase()));
    const next = [...existing];
    for (const award of incoming) {
      const key = award.number.toUpperCase();
      if (!award.number || seen.has(key)) continue;
      seen.add(key);
      next.push(award);
      added += 1;
    }
    submission.awards = next;
  }
  return added;
}

/** 按文献作者顺序填进项目。已有的人沿用，空着的姓和名补上。文献标明的通讯、共同第一和 CRediT 会勾上，已经勾过的不会取消。投稿时间点只补还没有的种类，已有日期不改。基金号只补还没有的号。 */
export function applyDoiAuthors(
  source: AppDataJson,
  projectId: string,
  creators: DoiCreator[],
  publication?: DoiPublicationFill,
): DoiFillResult | null {
  if (!source.projects[projectId]) return null;
  const named = creators.map(nameCreator).filter((item): item is NamedCreator => item !== null);
  if (named.length === 0) return null;
  const data = cloneAppData(source);
  let created = 0;
  let attached = 0;
  const paperIds: string[] = [];
  const marks = new Map<string, { corresponding: boolean; coFirst: boolean; credit: CreditRole[] }>();
  for (const creator of named) {
    let person = findKnownPerson(data.people, {
      name: creator.name,
      family: creator.family,
      given: [creator.given, creator.middle].filter(Boolean).join(" "),
      orcid: creator.orcid,
    });
    if (!person) {
      const id = nextCatalogId("person", data.people);
      person = {
        id,
        name: creator.name,
        lab_ids: [],
        family_name: creator.family,
        given_name: creator.given,
        aliases: [],
        orcid: creator.orcid,
      };
      if (creator.middle) person.middle_name = creator.middle;
      data.people[id] = person;
      created += 1;
    } else {
      if (!person.family_name && creator.family) person.family_name = creator.family;
      if (!person.given_name && creator.given) person.given_name = creator.given;
      if (!person.middle_name && creator.middle) person.middle_name = creator.middle;
      if (!person.orcid && creator.orcid) person.orcid = creator.orcid;
      if (person.name !== creator.name) rememberPersonName(person, creator.name);
    }
    for (const address of creator.affiliations) rememberPersonAddress(person, address);
    const previous = marks.get(person.id) ?? { corresponding: false, coFirst: false, credit: [] };
    marks.set(person.id, {
      corresponding: previous.corresponding || creator.corresponding,
      coFirst: previous.coFirst || creator.coFirst,
      credit: unionCredit(previous.credit, creator.credit),
    });
    if (!paperIds.includes(person.id)) paperIds.push(person.id);
  }
  const leftovers = data.authorships
    .filter((link) => link.project_id === projectId && !paperIds.includes(link.person_id) && data.people[link.person_id])
    .sort((a, b) => a.position - b.position || a.person_id.localeCompare(b.person_id));
  const order = [...paperIds, ...leftovers.map((link) => link.person_id)];
  order.forEach((personId, index) => {
    const position = index + 1;
    const link = data.authorships.find((item) => item.project_id === projectId && item.person_id === personId);
    const mark = marks.get(personId);
    if (link) {
      link.position = position;
      if (mark?.corresponding) link.corresponding = true;
      if (mark?.coFirst) link.co_first = true;
      if (mark && mark.credit.length > 0) link.credit_roles = unionCredit(link.credit_roles, mark.credit);
      return;
    }
    data.authorships.push({
      project_id: projectId,
      person_id: personId,
      position,
      corresponding: mark?.corresponding ?? false,
      credit_roles: mark?.credit ?? [],
      primary: false,
      co_first: mark?.coFirst ?? false,
      responsibility: "",
    });
    attached += 1;
  });
  const credited = paperIds.filter((id) => (marks.get(id)?.credit.length ?? 0) > 0).length;
  const dated = applyPublicationDates(data, projectId, publication);
  const articleType = applyArticleType(data, projectId, publication);
  const funded = applyAwards(data, projectId, publication);
  return { data, created, attached, total: paperIds.length, credited, dated, articleType, funded };
}
