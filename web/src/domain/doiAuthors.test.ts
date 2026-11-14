import { describe, expect, it } from "vitest";
import { defaultEmptyAppData } from "./appData";
import {
  applyDoiAuthors,
  awardsFromArticleXml,
  awardsFromDoiPayload,
  articleTypeFromArticleXml,
  articleTypeFromDoiPayload,
  articleTypeFromOpenAlex,
  articleTypeFromPmcSearch,
  authorMarksFromArticleXml,
  creatorsFromDoiPayload,
  doiFromText,
  loadDoiCreators,
  projectDois,
  publicationDatesFromArticleXml,
  publicationDatesFromDoiPayload,
  resolvePublicationDoi,
} from "./doiAuthors";
import { articleTypeLabel } from "./projectTime";
import type { AppDataJson, Project } from "../types";

function project(patch: Partial<Project> = {}): Project {
  return {
    id: "p1",
    name: "甲",
    description: "",
    status: "Published",
    field_ids: [],
    position: [0, 0],
    radius: 20,
    completion_percentage: 100,
    ...patch,
  };
}

describe("doi text", () => {
  it("keeps the DOI and drops the url punctuation around it", () => {
    expect(doiFromText("https://doi.org/10.1038/171737a0")).toBe("10.1038/171737a0");
    expect(doiFromText("见 10.1000/abc)")).toBe("10.1000/abc");
    expect(doiFromText("https://publisher.example/10.1000/xyz/pdf")).toBe("10.1000/xyz");
    expect(doiFromText("https://www.biorxiv.org/content/10.1101/2025.10.08.681285v1.abstract")).toBe("10.1101/2025.10.08.681285");
    expect(doiFromText("没有号码")).toBeNull();
  });

  it("reads a publisher article link that does not contain the DOI", () => {
    const dois = projectDois(
      project({
        journal_submissions: [
          {
            id: "a",
            venue: "Bioinformatics",
            is_preprint: false,
            url: "https://academic.oup.com/bioinformatics/article/39/6/btad339/7177989",
            milestones: [],
          },
          {
            id: "b",
            venue: "Nature Communications",
            is_preprint: false,
            url: "https://www.nature.com/articles/s41467-026-72351-6",
            milestones: [],
          },
        ],
      }),
    );
    expect(dois.map((item) => item.doi)).toEqual(["10.1093/bioinformatics/btad339", "10.1038/s41467-026-72351-6"]);
  });

  it("matches one MDPI article from the issn, volume, issue and page", async () => {
    const doi = await resolvePublicationDoi("https://www.mdpi.com/2076-2607/11/4/949", async () => ({
      ok: true,
      json: {
        message: {
          items: [
            { DOI: "10.3390/microorganisms8060949", volume: "8", issue: "6", page: "949" },
            { DOI: "10.3390/microorganisms11040949", volume: "11", issue: "4", page: "949" },
          ],
        },
      },
    }));
    expect(doi).toBe("10.3390/microorganisms11040949");
  });

  it("lists the journal DOI before the preprint", () => {
    const dois = projectDois(
      project({
        journal_submissions: [
          { id: "a", venue: "bioRxiv", is_preprint: true, url: "https://doi.org/10.1101/2020.01.01.123456", milestones: [] },
          { id: "b", venue: "Nature", is_preprint: false, url: "https://doi.org/10.1038/171737a0", milestones: [] },
        ],
      }),
    );
    expect(dois.map((item) => item.doi)).toEqual(["10.1038/171737a0", "10.1101/2020.01.01.123456"]);
  });
});

describe("doi creators", () => {
  it("reads CSL authors and falls back to Crossref", async () => {
    const quiet = async () => ({ ok: false, text: "" });
    const csl = await loadDoiCreators(
      "10.1038/171737a0",
      async (url, accept) => {
        if (!url.startsWith("https://doi.org/")) return { ok: false, json: null };
        expect(url).toBe("https://doi.org/10.1038%2F171737a0");
        expect(accept).toBe("application/vnd.citationstyles.csl+json");
        return {
          ok: true,
          json: {
            author: [
              { family: "Watson", given: "J. D.", affiliation: [{ name: "Cavendish Laboratory" }] },
              { family: "Crick", given: "F. H. C." },
            ],
          },
        };
      },
      quiet,
    );
    expect(csl).toMatchObject({ ok: true });
    if (!csl.ok) return;
    expect(csl.creators.map((item) => item.family)).toEqual(["Watson", "Crick"]);

    const calls: string[] = [];
    const fallback = await loadDoiCreators(
      "10.1000/empty",
      async (url) => {
        calls.push(url);
        if (url.startsWith("https://doi.org/")) return { ok: true, json: { author: [] } };
        if (url.startsWith("https://api.crossref.org/works/")) {
          return { ok: true, json: { message: { author: [{ family: "Doe", given: "Jane" }] } } };
        }
        return { ok: false, json: null };
      },
      quiet,
    );
    expect(calls.slice(0, 2)).toEqual([
      "https://doi.org/10.1000%2Fempty",
      "https://api.crossref.org/works/10.1000%2Fempty",
    ]);
    expect(fallback).toMatchObject({ ok: true, creators: [{ family: "Doe", given: "Jane" }] });
    expect(creatorsFromDoiPayload({ message: { author: [{ name: "WorldFish" }] } })).toEqual([
      { family: "", given: "", literal: "WorldFish", affiliations: [], corresponding: false, coFirst: false, orcid: "", credit: [] },
    ]);
  });

  it("writes the article address on the person and leaves labs alone", () => {
    const data: AppDataJson = {
      ...defaultEmptyAppData(),
      projects: { p1: project() },
      labs: {
        lab_1: {
          id: "lab_1",
          name: "卡文迪许实验室",
          name_zh: "卡文迪许实验室",
          name_en: "Cavendish Laboratory",
          color: "#5c6bc0",
        },
      },
    };
    const filled = applyDoiAuthors(data, "p1", [
      {
        family: "Watson",
        given: "James Dewey",
        literal: "",
        affiliations: ["Cavendish Laboratory"],
        corresponding: false,
        coFirst: false,
        orcid: "",
        credit: [],
      },
    ]);
    expect(Object.keys(filled?.data.labs ?? {})).toEqual(["lab_1"]);
    const person = Object.values(filled?.data.people ?? {})[0];
    expect(person?.given_name).toBe("James");
    expect(person?.middle_name).toBe("Dewey");
    expect(person?.lab_ids).toEqual([]);
    expect(person?.affiliations).toEqual([{ name_en: "Cavendish Laboratory" }]);
    expect(filled?.data.labs.lab_1?.name).toBe("卡文迪许实验室");
  });

  it("adds authors in paper order and reuses a person already in the library", () => {
    const data: AppDataJson = {
      ...defaultEmptyAppData(),
      projects: { p1: project() },
      people: {
        person_1: { id: "person_1", name: "Watson J. D.", lab_ids: [], family_name: "", given_name: "", aliases: [], orcid: "" },
      },
      authorships: [
        {
          project_id: "p1",
          person_id: "person_1",
          position: 4,
          corresponding: true,
          credit_roles: ["WritingOriginalDraft"],
          primary: true,
          co_first: false,
          responsibility: "结构",
        },
      ],
    };
    const filled = applyDoiAuthors(data, "p1", [
      { family: "Watson", given: "J. D.", literal: "", affiliations: ["Cavendish Laboratory"], corresponding: false, coFirst: true, orcid: "", credit: ["Conceptualization"] },
      { family: "Crick", given: "F. H. C.", literal: "", affiliations: ["Cavendish Laboratory"], corresponding: true, coFirst: true, orcid: "", credit: ["Software", "Supervision"] },
    ]);
    expect(filled).not.toBeNull();
    if (!filled) return;
    expect(filled.created).toBe(1);
    expect(filled.attached).toBe(1);
    expect(filled.total).toBe(2);
    expect(filled.credited).toBe(2);
    const watson = filled.data.people.person_1;
    expect(watson.family_name).toBe("Watson");
    expect(watson.given_name).toBe("J.");
    expect(watson.middle_name).toBe("D.");
    expect(watson.lab_ids).toEqual([]);
    expect(watson.affiliations).toEqual([{ name_en: "Cavendish Laboratory" }]);
    expect(filled.data.labs).toEqual({});
    const links = filled.data.authorships
      .filter((link) => link.project_id === "p1")
      .sort((a, b) => a.position - b.position);
    expect(links.map((link) => filled.data.people[link.person_id].name)).toEqual(["Watson J. D.", "Crick F. H. C."]);
    expect(links[0].corresponding).toBe(true);
    expect(links[0].co_first).toBe(true);
    expect(links[1].corresponding).toBe(true);
    expect(links[1].co_first).toBe(true);
    expect(links[0].credit_roles).toEqual(["Conceptualization", "WritingOriginalDraft"]);
    expect(links[1].credit_roles).toEqual(["Software", "Supervision"]);
    expect(links[0].responsibility).toBe("结构");
    const again = applyDoiAuthors(filled.data, "p1", [
      { family: "Watson", given: "J. D.", literal: "", affiliations: ["Cavendish Laboratory"], corresponding: false, coFirst: false, orcid: "", credit: [] },
      { family: "Crick", given: "F. H. C.", literal: "", affiliations: ["Cavendish Laboratory"], corresponding: false, coFirst: false, orcid: "", credit: [] },
    ]);
    expect(again?.created).toBe(0);
    expect(again?.attached).toBe(0);
    expect(again?.credited).toBe(0);
    expect(again?.data.authorships.every((link) => link.corresponding && link.co_first)).toBe(true);
    expect(again?.data.authorships.find((link) => link.person_id === "person_1")?.credit_roles).toEqual([
      "Conceptualization",
      "WritingOriginalDraft",
    ]);
    expect(Object.keys(again?.data.people ?? {})).toHaveLength(2);
    expect(again?.data.labs).toEqual({});
    expect(again?.data.people.person_1?.affiliations).toEqual([{ name_en: "Cavendish Laboratory" }]);
  });

  it("marks the corresponding author and only treats two equal contributors as co-first", () => {
    const itol = authorMarksFromArticleXml(`
      <contrib-group content-type="author">
        <contrib><name><surname>Zhou</surname><given-names>Tong</given-names></name></contrib>
        <contrib><name><surname>Xu</surname><given-names>Kuidong</given-names></name><xref rid="cor1" ref-type="author-notes">✉</xref></contrib>
      </contrib-group>
      <author-notes><fn id="cor1"><p>Corresponding author. E-mail: kxu@qdio.ac.cn</p></fn></author-notes>
    `);
    expect(itol).toEqual([
      { family: "Zhou", given: "Tong", corresponding: false, coFirst: false, credit: [] },
      { family: "Xu", given: "Kuidong", corresponding: true, coFirst: false, credit: [] },
    ]);
    const shared = authorMarksFromArticleXml(`
      <contrib-group content-type="author">
        <contrib equal-contrib="yes"><name><surname>Zhou</surname><given-names>Tong</given-names></name></contrib>
        <contrib equal-contrib="yes"><name><surname>Xu</surname><given-names>Kuidong</given-names></name></contrib>
      </contrib-group>
    `);
    expect(shared.map((item) => item.coFirst)).toEqual([true, true]);
    const joint = creatorsFromDoiPayload({
      author: [
        { family: "Zhou", given: "Tong", sequence: "first" },
        { family: "Xu", given: "Kuidong", sequence: "first" },
        { family: "Zhao", given: "Feng", sequence: "additional" },
      ],
    });
    expect(joint.map((item) => item.coFirst)).toEqual([true, true, false]);
  });

  it("reads CRediT from Crossref roles and from the article role tags", () => {
    const deposited = creatorsFromDoiPayload({
      message: {
        author: [
          {
            family: "Xu",
            given: "Kuidong",
            role: [
              { vocabulary: "crossref", role: "author" },
              { vocabulary: "credit", role: "http://credit.niso.org/contributor-roles/supervision/" },
              { vocabulary: "credit", role: "writing-original-draft" },
            ],
          },
        ],
      },
    });
    expect(deposited[0]?.credit).toEqual(["Supervision", "WritingOriginalDraft"]);
    expect(deposited[0]?.corresponding).toBe(false);
    const itol = authorMarksFromArticleXml(`
      <contrib-group content-type="author">
        <contrib><name><surname>Zhou</surname><given-names>Tong</given-names></name></contrib>
        <contrib>
          <name><surname>Xu</surname><given-names>Kuidong</given-names></name>
          <role>Funding acquisition, Project administration, Resources, Supervision, Validation, Writing - review &amp; editing</role>
        </contrib>
        <contrib>
          <name><surname>Hua</surname><given-names>Zhongyi</given-names></name>
          <role vocab="credit" vocab-term-identifier="http://credit.niso.org/contributor-roles/software/">软件</role>
        </contrib>
      </contrib-group>
    `);
    expect(itol.map((item) => item.credit)).toEqual([
      [],
      ["FundingAcquisition", "ProjectAdministration", "Resources", "Supervision", "Validation", "WritingReviewEditing"],
      ["Software"],
    ]);
  });

  it("copies full-text CRediT onto the authors loaded from CSL", async () => {
    const loaded = await loadDoiCreators(
      "10.1093/bioinformatics/btad339",
      async (url) => {
        if (url.startsWith("https://doi.org/")) {
          return { ok: true, json: { author: [{ family: "Zhou", given: "Tong" }, { family: "Xu", given: "Kuidong" }] } };
        }
        if (url.includes("/search?")) {
          return { ok: true, json: { resultList: { result: [{ doi: "10.1093/bioinformatics/btad339", pmcid: "PMC1" }] } } };
        }
        return { ok: false, json: null };
      },
      async () => ({
        ok: true,
        text: `<contrib-group content-type="author"><contrib><name><surname>Xu</surname><given-names>Kuidong</given-names></name><role>Software, Validation</role></contrib></contrib-group>`,
      }),
    );
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.creators.find((item) => item.family === "Xu")?.credit).toEqual(["Software", "Validation"]);
    expect(loaded.creators.find((item) => item.family === "Zhou")?.credit).toEqual([]);
    expect(loaded.dates).toEqual([]);
  });

  it("reads received, revised, accepted, and the online publication date", () => {
    const itol = publicationDatesFromArticleXml(`
      <front>
        <sec sec-type="history"><p>Received 2023 Jan 23; Revised 2023 May 4; Accepted 2023 May 23; Collection date 2023 Jun.</p></sec>
        <pub-date><day>24</day><month>5</month><year>2023</year></pub-date>
        <pub-history><event event-type="pmc-release"><date><day>7</day><month>6</month><year>2023</year></date></event></pub-history>
      </front>
    `);
    expect(itol).toEqual([
      { kind: "SubmissionStart", date: "2023-01-23" },
      { kind: "Revision", date: "2023-05-04" },
      { kind: "Accepted", date: "2023-05-23" },
      { kind: "Published", date: "2023-05-24" },
    ]);
    const structured = publicationDatesFromArticleXml(`
      <history>
        <date date-type="received" iso-8601-date="2023-01-23"/>
        <date date-type="rev-recd"><day>4</day><month>5</month><year>2023</year></date>
        <date date-type="accepted"><day>23</day><month>5</month><year>2023</year></date>
      </history>
      <pub-date pub-type="ppub"><day>1</day><month>6</month><year>2023</year></pub-date>
      <pub-date pub-type="epub"><day>24</day><month>5</month><year>2023</year></pub-date>
    `);
    expect(structured).toEqual(itol);
  });

  it("keeps the online date and does not treat a preprint deposit as acceptance", () => {
    expect(
      publicationDatesFromDoiPayload({
        message: {
          type: "journal-article",
          accepted: { "date-parts": [[2023, 5, 23]] },
          "published-online": { "date-parts": [[2023, 5, 24]] },
          "published-print": { "date-parts": [[2023, 6, 1]] },
          created: { "date-parts": [[2023, 5, 24]] },
        },
      }),
    ).toEqual([
      { kind: "Accepted", date: "2023-05-23" },
      { kind: "Published", date: "2023-05-24" },
    ]);
    expect(
      publicationDatesFromDoiPayload({
        message: {
          type: "posted-content",
          accepted: { "date-parts": [[2025, 10, 10]] },
          posted: { "date-parts": [[2025, 10, 10]] },
        },
      }),
    ).toEqual([{ kind: "Published", date: "2025-10-10" }]);
  });

  it("writes dates onto the matching submission and leaves an existing date in place", () => {
    const url = "https://academic.oup.com/bioinformatics/article/39/6/btad339/7177989";
    const creator = {
      family: "Zhou",
      given: "Tong",
      literal: "",
      affiliations: [],
      corresponding: false,
      coFirst: false,
      orcid: "",
      credit: [],
    };
    const dates = [
      { kind: "SubmissionStart" as const, date: "2023-01-23" },
      { kind: "Revision" as const, date: "2023-05-04" },
      { kind: "Accepted" as const, date: "2023-05-23" },
      { kind: "Published" as const, date: "2023-05-24" },
    ];
    const data: AppDataJson = {
      ...defaultEmptyAppData(),
      projects: {
        p1: project({
          journal_submissions: [
            {
              id: "journal",
              venue: "Bioinformatics",
              is_preprint: false,
              url,
              milestones: [{ id: "keep", kind: "Accepted", label: "", date: "2020-01-01", note: "手填" }],
            },
            {
              id: "other",
              venue: "Nature",
              is_preprint: false,
              url: "https://www.nature.com/articles/s41467-026-72351-6",
              milestones: [],
            },
          ],
        }),
      },
    };
    const filled = applyDoiAuthors(data, "p1", [creator], { url, doi: "10.1093/bioinformatics/btad339", dates });
    const journal = filled?.data.projects.p1.journal_submissions?.find((item) => item.id === "journal");
    expect(filled?.dated).toBe(3);
    expect(journal?.milestones.map((item) => [item.kind, item.date, item.note])).toEqual([
      ["Accepted", "2020-01-01", "手填"],
      ["SubmissionStart", "2023-01-23", ""],
      ["Revision", "2023-05-04", ""],
      ["Published", "2023-05-24", ""],
    ]);
    expect(filled?.data.projects.p1.journal_submissions?.find((item) => item.id === "other")?.milestones).toEqual([]);
    const again = applyDoiAuthors(filled?.data ?? data, "p1", [creator], { url, doi: "10.1093/bioinformatics/btad339", dates });
    expect(again?.dated).toBe(0);
  });

  it("prefers the article history when the deposit record has another publication day", async () => {
    const loaded = await loadDoiCreators(
      "10.1093/bioinformatics/btad339",
      async (url) => {
        if (url.startsWith("https://doi.org/")) {
          return {
            ok: true,
            json: { issued: { "date-parts": [[2023, 6, 1]] }, author: [{ family: "Zhou", given: "Tong" }] },
          };
        }
        if (url.includes("api.crossref.org")) {
          return {
            ok: true,
            json: {
              message: {
                type: "journal-article",
                "published-online": { "date-parts": [[2023, 5, 24]] },
                author: [],
              },
            },
          };
        }
        if (url.includes("/search?")) {
          return { ok: true, json: { resultList: { result: [{ doi: "10.1093/bioinformatics/btad339", pmcid: "PMC1" }] } } };
        }
        return { ok: false, json: null };
      },
      async () => ({
        ok: true,
        text: `<front><sec sec-type="history"><p>Received 23 January 2023; Accepted 2023 May 23.</p></sec><pub-date><day>24</day><month>5</month><year>2023</year></pub-date></front>`,
      }),
    );
    expect(loaded.ok ? loaded.dates : []).toEqual([
      { kind: "SubmissionStart", date: "2023-01-23" },
      { kind: "Accepted", date: "2023-05-23" },
      { kind: "Published", date: "2023-05-24" },
    ]);
    expect(loaded.ok ? loaded.articleType : "x").toBe("");
  });

  it("reads a research article, a review, or the more specific type", () => {
    expect(articleTypeFromArticleXml(`<article article-type="research-article"></article>`)).toBe("research-article");
    expect(articleTypeFromArticleXml(`<article article-type="review-article"></article>`)).toBe("review");
    expect(articleTypeFromArticleXml(`<article article-type="brief-report"></article>`)).toBe("brief-report");
    expect(articleTypeFromArticleXml(`<article article-type="data-paper"></article>`)).toBe("data-paper");
    expect(articleTypeLabel("research-article")).toBe("研究论文");
    expect(articleTypeLabel("review")).toBe("综述");
    expect(articleTypeLabel("brief-report")).toBe("简报");
    expect(articleTypeLabel("data-paper")).toBe("data paper");
    expect(
      articleTypeFromPmcSearch(
        {
          resultList: {
            result: [
              {
                doi: "10.1/x",
                pubType: "brief-report; Research Support, Non-U.S. Gov't; Journal Article",
              },
            ],
          },
        },
        "10.1/x",
      ),
    ).toBe("brief-report");
    expect(
      articleTypeFromPmcSearch({ resultList: { result: [{ doi: "10.1/y", pubType: "Journal Article" }] } }, "10.1/y"),
    ).toBe("research-article");
    expect(
      articleTypeFromPmcSearch(
        { resultList: { result: [{ doi: "10.1/z", pubTypeList: { pubType: ["Review", "Journal Article"] } }] } },
        "10.1/z",
      ),
    ).toBe("review");
    expect(articleTypeFromDoiPayload({ message: { type: "journal-article" } })).toBe("");
    expect(articleTypeFromDoiPayload({ message: { type: "posted-content" } })).toBe("preprint");
    expect(articleTypeFromOpenAlex({ type: "review" })).toBe("review");
    expect(articleTypeFromOpenAlex({ type: "article" })).toBe("research-article");
  });

  it("writes the article type once and keeps a type already chosen", () => {
    const url = "https://academic.oup.com/bioinformatics/article/39/6/btad339/7177989";
    const creator = {
      family: "Zhou",
      given: "Tong",
      literal: "",
      affiliations: [],
      corresponding: false,
      coFirst: false,
      orcid: "",
      credit: [],
    };
    const data: AppDataJson = {
      ...defaultEmptyAppData(),
      projects: {
        p1: project({
          journal_submissions: [
            { id: "journal", venue: "Bioinformatics", is_preprint: false, url, milestones: [] },
            {
              id: "kept",
              venue: "Nature",
              is_preprint: false,
              url: "https://www.nature.com/articles/s41467-026-72351-6",
              article_type: "review",
              milestones: [],
            },
          ],
        }),
      },
    };
    const filled = applyDoiAuthors(data, "p1", [creator], {
      url,
      doi: "10.1093/bioinformatics/btad339",
      dates: [],
      articleType: "brief-report",
    });
    expect(filled?.articleType).toBe("brief-report");
    expect(filled?.data.projects.p1.journal_submissions?.find((item) => item.id === "journal")?.article_type).toBe(
      "brief-report",
    );
    expect(filled?.data.projects.p1.journal_submissions?.find((item) => item.id === "kept")?.article_type).toBe("review");
    const again = applyDoiAuthors(filled?.data ?? data, "p1", [creator], {
      url,
      doi: "10.1093/bioinformatics/btad339",
      dates: [],
      articleType: "research-article",
    });
    expect(again?.articleType).toBe("");
    expect(again?.data.projects.p1.journal_submissions?.find((item) => item.id === "journal")?.article_type).toBe(
      "brief-report",
    );
  });

  it("keeps every grant number from the funding note and the registry", () => {
    const xml = `<sec><title>Funding</title><p>This work was supported by the National Natural Science Foundation of China [41930533, 41876171], the Strategic Priority Research Program of the Chinese Academy of Sciences [XDB42000000], and the Youth Innovation Promotion Association CAS [2022206]. See also [2023].</p></sec>`;
    expect(awardsFromArticleXml(xml)).toEqual([
      { funder: "国家自然科学基金", number: "41930533" },
      { funder: "国家自然科学基金", number: "41876171" },
      { funder: "中国科学院战略性先导科技专项", number: "XDB42000000" },
      { funder: "中国科学院青年创新促进会", number: "2022206" },
    ]);
    expect(
      awardsFromDoiPayload({
        message: {
          funder: [
            { DOI: "10.13039/501100001809", name: "National Natural Science Foundation of China", award: ["41930533"] },
            { name: "Youth Innovation Promotion Association CAS", award: ["2022206"] },
          ],
        },
      }),
    ).toEqual([
      { funder: "国家自然科学基金", number: "41930533" },
      { funder: "中国科学院青年创新促进会", number: "2022206" },
    ]);
    const url = "https://academic.oup.com/bioinformatics/article/39/6/btad339/7177989";
    const creator = {
      family: "Zhou",
      given: "Tong",
      literal: "",
      affiliations: [],
      corresponding: false,
      coFirst: false,
      orcid: "",
      credit: [],
    };
    const data: AppDataJson = {
      ...defaultEmptyAppData(),
      projects: { p1: project({ journal_submissions: [{ id: "journal", venue: "Bioinformatics", is_preprint: false, url, article_type: "", milestones: [], awards: [{ funder: "已有", number: "41930533" }] }] }) },
    };
    const filled = applyDoiAuthors(data, "p1", [creator], {
      url,
      doi: "10.1093/bioinformatics/btad339",
      dates: [],
      awards: awardsFromArticleXml(xml),
    });
    expect(filled?.funded).toBe(3);
    expect(filled?.data.projects.p1.journal_submissions?.[0]?.awards).toEqual([
      { funder: "已有", number: "41930533" },
      { funder: "国家自然科学基金", number: "41876171" },
      { funder: "中国科学院战略性先导科技专项", number: "XDB42000000" },
      { funder: "中国科学院青年创新促进会", number: "2022206" },
    ]);
  });
});
