import { useEffect, useMemo } from "react";
import { useAppStore } from "../store/appStore";
import { buildLabHome, labByPathSlug, type LabHomeModel } from "../domain/labHome";
import "./lab-home.css";

export function LabHomePage(props: { slug: string }) {
  const data = useAppStore((s) => s.data);
  const lab = labByPathSlug(data.labs, props.slug);
  if (!lab) {
    return (
      <main className="lab-home-page">
        <div className="lab-home">
          <p className="lab-home-missing">工作区里没有这个实验室。</p>
          <a href="/">返回工作区</a>
        </div>
      </main>
    );
  }
  return <LabHome labId={lab.id} page />;
}

export function LabHome(props: { labId: string; page?: boolean }) {
  const data = useAppStore((s) => s.data);
  const model = useMemo(() => buildLabHome(data, props.labId), [data, props.labId]);
  useEffect(() => {
    if (!props.page || !model) return;
    const previous = document.title;
    document.title = model.title;
    return () => {
      document.title = previous;
    };
  }, [props.page, model]);
  if (!model) return null;
  const page = (
    <article className="lab-home" style={{ ["--lab-accent" as string]: model.color }}>
      <header className="lab-home-hero">
        <p className="lab-home-kicker">实验室</p>
        <h1>{model.title}</h1>
        {model.english ? <p className="lab-home-english">{model.english}</p> : null}
        {props.page ? (
          <a className="lab-home-back" href="/">
            返回工作区
          </a>
        ) : null}
      </header>
      <nav className="lab-home-nav" aria-label="主页章节">
        <button type="button" onClick={() => scrollToSection("lab-people")}>
          成员
        </button>
        <button type="button" onClick={() => scrollToSection("lab-research")}>
          研究
        </button>
        <button type="button" onClick={() => scrollToSection("lab-papers")}>
          论文
        </button>
        <button type="button" onClick={() => scrollToSection("lab-address")}>
          地址
        </button>
      </nav>
      <HomeBody model={model} />
      <footer className="lab-home-foot">这一页根据工作区里的记录生成，不是实验室的官方网站。</footer>
    </article>
  );
  if (props.page) return <main className="lab-home-page">{page}</main>;
  return page;
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ block: "start" });
}

function HomeBody(props: { model: LabHomeModel }) {
  const { model } = props;
  return (
    <>
      <section id="lab-people">
        <h2>成员</h2>
        {model.groups.length === 0 ? <p className="lab-home-empty">还没有记下成员。</p> : null}
        {model.groups.map((group) => (
          <div key={group.key} className="lab-home-group">
            <h3>{group.label}</h3>
            <ul>
              {group.members.map((member) => (
                <li key={member.id}>
                  <strong>{member.name}</strong>
                  {member.latin ? <span>{member.latin}</span> : null}
                  <em>{member.role}</em>
                  {member.orcid ? (
                    <a href={`https://orcid.org/${member.orcid}`} target="_blank" rel="noreferrer">
                      ORCID
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
      <section id="lab-research">
        <h2>研究</h2>
        {model.research.length === 0 ? <p className="lab-home-empty">还没有记下进行中的项目。</p> : null}
        <ul className="lab-home-cards">
          {model.research.map((item) => (
            <li key={item.id}>
              <strong>{item.name}</strong>
              <em>{item.status}</em>
              {item.description ? <p>{item.description}</p> : null}
              {item.people ? <p>{item.people}</p> : null}
            </li>
          ))}
        </ul>
      </section>
      <section id="lab-papers">
        <h2>论文</h2>
        {model.papers.length === 0 ? <p className="lab-home-empty">还没有记下投稿或发表。</p> : null}
        <ol className="lab-home-papers">
          {model.papers.map((paper) => (
            <li key={paper.id}>
              <p>
                {paper.authors ? `${paper.authors}. ` : ""}
                <strong>{paper.title}</strong>
                {paper.venue ? `. ${paper.venue}` : ""}
                {paper.year ? ` (${paper.year})` : ""}
                {paper.kind ? `. ${paper.kind}` : ""}
              </p>
              {paper.url ? (
                <a href={paper.url} target="_blank" rel="noreferrer">
                  链接
                </a>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
      <section id="lab-address">
        <h2>地址</h2>
        {model.addresses.length === 0 ? <p className="lab-home-empty">还没有记下地址。</p> : null}
        <ul className="lab-home-address">
          {model.addresses.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </>
  );
}
