import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useAppStore } from "../store/appStore";
import { isTauriApp } from "../platform/tauri";
import { Toolbar } from "./Toolbar";
import { LeftSidebar } from "./LeftSidebar";
import { PropertyPanel } from "./PropertyPanel";
import { VisualizationCanvas } from "./VisualizationCanvas";
import { TimelineView } from "./TimelineView";
import { CollaborationView } from "./CollaborationView";
import { ExportModal } from "./ExportModal";
import { PersonLibrary } from "./PersonLibrary";
import { SettingsModal } from "./SettingsModal";
import { VersionHistoryModal } from "./VersionHistoryModal";
import { readVisualizationRenderPrefsFromStorage } from "../storage/uiPrefs";
import type { WorkspaceView } from "../store/appStore";

function WorkspaceCanvas({ view }: { view: WorkspaceView }) {
  switch (view) {
    case "venn":
      return <VisualizationCanvas />;
    case "timeline":
      return <TimelineView />;
    case "collaboration":
      return <CollaborationView />;
    default: {
      const unreachable: never = view;
      return unreachable;
    }
  }
}

export function MainShell() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [toolbarLeadingInset, setToolbarLeadingInset] = useState(0);
  const setSettings = useAppStore((s) => s.setSettings);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const saveWorkspace = useAppStore((s) => s.saveWorkspace);
  const prepareExport = useAppStore((s) => s.prepareExport);
  const importJsonFile = useAppStore((s) => s.importJsonFile);
  const storageError = useAppStore((s) => s.storageError);
  const clearStorageError = useAppStore((s) => s.clearStorageError);
  const bannerNotice = useAppStore((s) => s.bannerNotice);
  const leftSidebarOpen = useAppStore((s) => s.leftSidebarOpen);
  const personLibraryOpen = useAppStore((s) => s.personLibraryOpen);
  const setPersonLibraryOpen = useAppStore((s) => s.setPersonLibraryOpen);
  const rightSidebarOpen = useAppStore((s) => s.rightSidebarOpen);
  const vizWorkspacePreview = useAppStore((s) => s.vizWorkspacePreview);
  const workspaceView = useAppStore((s) => s.workspaceView);
  const setVizWorkspacePreview = useAppStore((s) => s.setVizWorkspacePreview);
  const vennPreview = vizWorkspacePreview && workspaceView === "venn";
  const importRef = useRef<HTMLInputElement>(null);

  const onImportPick = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result ?? "");
        importJsonFile(text);
      };
      reader.readAsText(f);
      e.target.value = "";
    },
    [importJsonFile],
  );

  useEffect(() => {
    setSettings(readVisualizationRenderPrefsFromStorage());
  }, [setSettings]);

  useEffect(() => {
    const flush = () => {
      const st = useAppStore.getState();
      if (!st.selectedProjectId || !st.projectEditBuffer) return;
      const p = st.data.projects[st.selectedProjectId];
      if (p && JSON.stringify(st.projectEditBuffer) !== JSON.stringify(p)) {
        st.applyProjectBufferToData({ skipHistory: true });
      }
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, []);

  useEffect(() => {
    if (!isTauriApp()) return;
    const ua = navigator.userAgent;
    const isMac = /Mac/.test(ua) && !/iPhone|iPad/.test(ua);
    if (isMac) {
      setToolbarLeadingInset(72);
    }
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      if (!isTauriApp()) return;
      try {
        const { listen } = await import("@tauri-apps/api/event");
        if (cancelled) return;
        unlisten = await listen<{ id: string }>("app:menu", (event) => {
          const id = event.payload.id;
          const st = useAppStore.getState();
          switch (id) {
            case "settings":
              setSettingsOpen(true);
              break;
            case "save":
              st.saveWorkspace();
              break;
            case "import":
              importRef.current?.click();
              break;
            case "export":
              st.prepareExport();
              break;
            case "undo":
              st.undo();
              break;
            case "redo":
              st.redo();
              break;
            case "zoom_in":
              st.zoomBy(1.1);
              break;
            case "zoom_out":
              st.zoomBy(1 / 1.1);
              break;
            case "logout":
              st.logout();
              break;
            default:
              break;
          }
        });
      } catch {
        /* 非 Tauri 或 API 不可用时忽略 */
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (
        t.tagName === "INPUT" ||
        t.tagName === "TEXTAREA" ||
        t.tagName === "SELECT" ||
        t.isContentEditable
      ) {
        return;
      }
      if (e.key === "Escape" && useAppStore.getState().vizWorkspacePreview) {
        e.preventDefault();
        setVizWorkspacePreview(false);
        return;
      }
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveWorkspace();
      }
      if (meta && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if (meta && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, saveWorkspace, setVizWorkspacePreview]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {storageError ? (
        <div
          role="alert"
          style={{
            flexShrink: 0,
            padding: "8px 12px",
            background: "#ffebee",
            borderBottom: "1px solid #ffcdd2",
            fontSize: 12,
            color: "#b71c1c",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <span>{storageError}</span>
          <button
            type="button"
            onClick={() => clearStorageError()}
            style={{
              flexShrink: 0,
              padding: "4px 10px",
              fontSize: 11,
              cursor: "pointer",
              border: "1px solid #ccc",
              borderRadius: 4,
              background: "#fff",
            }}
          >
            知道了
          </button>
        </div>
      ) : null}
      <input
        ref={importRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        onChange={onImportPick}
      />
      <Toolbar
        leadingInsetPx={toolbarLeadingInset}
        onImportClick={() => importRef.current?.click()}
        onExportClick={() => prepareExport()}
        onSettingsClick={() => setSettingsOpen(true)}
        onVersionsClick={() => setVersionsOpen(true)}
      />
      {bannerNotice ? (
        <div
          role="status"
          style={{
            flexShrink: 0,
            padding: "6px 12px",
            fontSize: 12,
            lineHeight: 1.4,
            background: bannerNotice.error ? "#ffebee" : "#e8f5e9",
            color: bannerNotice.error ? "#b71c1c" : "#1b5e20",
            borderBottom: `1px solid ${bannerNotice.error ? "#ffcdd2" : "#c8e6c9"}`,
          }}
        >
          {bannerNotice.text}
        </div>
      ) : null}
      <div
        style={{
          flex: 1,
          display: "flex",
          minHeight: 0,
          position: "relative",
        }}
      >
        {leftSidebarOpen && !vennPreview ? <LeftSidebar /> : null}
        <div
          style={
            vennPreview
              ? {
                  position: "absolute",
                  left: 0,
                  top: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 5,
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 0,
                  minWidth: 0,
                }
              : {
                  flex: 1,
                  minWidth: 0,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  position: "relative",
                }
          }
        >
          <WorkspaceCanvas view={workspaceView} />
          {vennPreview ? (
            <button
              type="button"
              onClick={() => setVizWorkspacePreview(false)}
              style={{
                position: "absolute",
                top: 10,
                right: 12,
                zIndex: 20,
                padding: "6px 12px",
                fontSize: 12,
                cursor: "pointer",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.35)",
                background: "rgba(0,0,0,0.45)",
                color: "#fff",
                boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
              }}
              title="退出预览（Esc）"
            >
              退出预览
            </button>
          ) : null}
        </div>
        {rightSidebarOpen && !vennPreview ? <PropertyPanel /> : null}
      </div>
      <ExportModal />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <PersonLibrary open={personLibraryOpen} onClose={() => setPersonLibraryOpen(false)} />
      <VersionHistoryModal open={versionsOpen} onClose={() => setVersionsOpen(false)} />
    </div>
  );
}
