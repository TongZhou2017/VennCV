import { useAppStore } from "../store/appStore";

export function ExportModal() {
  const body = useAppStore((s) => s.exportModalBody);
  const suggestedName = useAppStore((s) => s.exportSuggestedName);
  const closeExportModal = useAppStore((s) => s.closeExportModal);

  if (!body) return null;

  const download = () => {
    const blob = new Blob([body], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = suggestedName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          width: "min(560px, 92vw)",
          maxHeight: "80vh",
          background: "#fff",
          borderRadius: 8,
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 16 }}>导出数据</h2>
        <p style={{ margin: 0, fontSize: 12, color: "#666" }}>
          可复制下方 JSON，或使用「下载文件」。建议文件名：{suggestedName}
        </p>
        <textarea
          readOnly
          value={body}
          style={{
            flex: 1,
            minHeight: 220,
            fontFamily: "ui-monospace, monospace",
            fontSize: 11,
            padding: 8,
          }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={() => closeExportModal()}>
            关闭
          </button>
          <button type="button" onClick={() => download()}>
            下载文件
          </button>
        </div>
      </div>
    </div>
  );
}
