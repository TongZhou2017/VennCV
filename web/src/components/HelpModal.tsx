import { useEffect, useState } from "react";

type Chapter = {
  id: string;
  title: string;
  paragraphs: string[];
};

const CHAPTERS: Chapter[] = [
  {
    id: "venn",
    title: "维恩图",
    paragraphs: [
      "拖动项目球可以移动它。在空白处拖动可以平移画面，按住 Alt 或鼠标中键也可以。滚轮缩放，右上角也有放大和缩小。图例可以拖到别的位置，并让开角落里的缩放按钮。",
      "按住 ⌘ 或 Ctrl，再点击另一个项目，会在两个项目之间连线。同时按住 Shift，连线是虚线。也可以在已选中的圆上按住 ⌘ 或 Ctrl，拖到目标后松开。",
      "在图上右键可以刷新布局、按条件选择、导出图片，或把图片复制到剪贴板。刷新布局会按侧栏里的领域顺序，把领域重新摆成相交的维恩图。",
      "背景、图例和渲染方式在工具栏的设置里。",
    ],
  },
  {
    id: "select",
    title: "选择",
    paragraphs: [
      "先点中一个项目，再把光标停在右键菜单的「选择」上，会画出同状态、同领域、同前缀、同维恩关系。",
      "同状态选出状态相同的项目。同领域选出所属领域勾选完全相同的项目。",
      "同前缀按名称的第一段比较。默认用空格或连字符 - 分开，例如 MAGIC 和 MAGIC-RNA 是同一前缀。名称里没有分隔符时，整段名称就是前缀。",
      "同维恩关系选出落在同一块交集里的项目。一个项目同时属于哪几圈，就和同样只属于这几圈的项目算同一种。已经从侧栏删掉的领域不参加比较。",
      "选中多项时，可视化区域右下角会写出已选数量。多于一项时，可以在那里回到只保留当前这一项。项目栏里按住 Shift 再点击，也可以逐个加减。",
    ],
  },
  {
    id: "timeline",
    title: "时间线",
    paragraphs: [
      "放大看更短的一段时间，缩小看更长的一段时间，最多回到全部日期。全局把窗口中心和尺度一起收回来。",
      "今天把窗口中心跳到今天。项目把窗口对准当前选中项目的时间范围。拖动横轴可以左右移动窗口。",
    ],
  },
  {
    id: "collab",
    title: "合作",
    paragraphs: [
      "拖动圆可以移动人物。在空白处拖动可以平移。设为中心的人排在中间。",
      "点一个人，右侧待办事项列出这个人记下的进展。点一条就打开那个项目的待办。",
    ],
  },
  {
    id: "projects",
    title: "项目栏",
    paragraphs: [
      "每一行在拖动点和序号之间有一只眼睛。睁开表示画在维恩图上，点一下就隐藏，再点一次恢复。",
      "行末的叉把项目移入回收站，回收站里可以复原。左右边缘的三角形用来展开或收起侧栏。",
    ],
  },
  {
    id: "figure",
    title: "图片",
    paragraphs: [
      "在维恩图上右键，可以导出 PNG 或 SVG，也可以把当前画面复制到剪贴板。",
      "导出的是维恩图本身，不含周围的按钮和侧栏。",
    ],
  },
];

type Props = {
  open: boolean;
  onClose: () => void;
};

export function HelpModal({ open, onClose }: Props) {
  const [chapterId, setChapterId] = useState(CHAPTERS[0]!.id);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const chapter = CHAPTERS.find((item) => item.id === chapterId) ?? CHAPTERS[0]!;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1001,
      }}
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="help-title"
        style={{
          width: "min(720px, 94vw)",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          background: "#fff",
          borderRadius: 8,
          boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
          overflow: "hidden",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", padding: "16px 20px 0" }}>
          <h2 id="help-title" style={{ margin: 0, fontSize: 16, flex: 1 }}>
            帮助
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭帮助"
            style={{
              border: "1px solid #ddd",
              borderRadius: 6,
              background: "#fff",
              padding: "4px 10px",
              cursor: "pointer",
            }}
          >
            关闭
          </button>
        </div>
        <div style={{ display: "flex", minHeight: 0, flex: 1, padding: 16, gap: 16 }}>
          <nav aria-label="帮助章节" style={{ width: 120, flexShrink: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {CHAPTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={item.id === chapter.id ? "true" : undefined}
                onClick={() => setChapterId(item.id)}
                style={{
                  textAlign: "left",
                  border: "none",
                  borderRadius: 6,
                  padding: "6px 8px",
                  cursor: "pointer",
                  background: item.id === chapter.id ? "rgba(55,53,47,0.1)" : "transparent",
                  color: "#37352f",
                  fontSize: 13,
                }}
              >
                {item.title}
              </button>
            ))}
          </nav>
          <article style={{ flex: 1, overflow: "auto", paddingRight: 4 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>{chapter.title}</h3>
            {chapter.paragraphs.map((paragraph) => (
              <p key={paragraph} style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.6, color: "#37352f" }}>
                {paragraph}
              </p>
            ))}
          </article>
        </div>
      </div>
    </div>
  );
}
