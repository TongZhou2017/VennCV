import { create } from "zustand";
import {
  allocNewFieldId,
  appDataToExportJson,
  cloneAppData,
  DEFAULT_RELATION_COLOR,
  DEFAULT_RELATION_WIDTH,
  defaultEmptyAppData,
  mergeImportJson,
  normalizeAppData,
  sanitizeAppDataInPlace,
} from "../domain/appData";
import {
  calculateProjectPosition,
  fieldIdsEqual,
  recalculateAllProjectPositions,
} from "../domain/projectLayout";
import {
  layoutFieldsVennPositions,
  VENN_FIELD_BASE_RADIUS,
  VENN_CENTER_X,
  VENN_CENTER_Y,
} from "../domain/fieldVennLayout";
import {
  validateAndFixProjectPositions,
  validateAppDataPreserveUserLayout,
  validateProjectPositionsWithoutMutatingFields,
} from "../domain/validate";
import type {
  AppDataJson,
  AppSettings,
  Project,
  ProjectRelation,
  ResearchField,
  UserConfig,
} from "../types";
import { defaultAppSettings } from "../types";
import {
  isValidWorkspaceStorageKey,
  loadUserConfig,
  normalizeNewWorkspaceFilename,
  resolveWorkspaceStorageKey,
  saveUserConfig,
  setUserLastEditedFile,
  verifyUser,
} from "../storage/config";
import type { WriteStorageResult } from "../storage/fs";
import { existsStorage, readStorage, writeStorage } from "../storage/fs";
import {
  appendSnapshot,
  deleteBranch,
  forkBranch,
  loadVersionStore,
  parseSnapshotData,
  persistVersionStore,
  renameBranch,
  switchBranch,
} from "../storage/versionStore";
import {
  readVisualizationRenderPrefsFromStorage,
  writeVisualizationRenderPrefsToStorage,
} from "../storage/uiPrefs";

let bannerNoticeToken = 0;

export type WorkspaceSwitchResult =
  | { ok: true }
  | { ok: false; message: string };

function syncOrdersFromData(data: AppDataJson): { fieldOrder: string[]; projectOrder: string[] } {
  return {
    fieldOrder: Object.keys(data.fields),
    projectOrder: Object.keys(data.projects),
  };
}

/** 保留侧栏顺序：删项剔除，新增项接在末尾 */
function mergeFieldOrder(prev: string[], data: AppDataJson): string[] {
  const keys = new Set(Object.keys(data.fields));
  const next = prev.filter((id) => keys.has(id));
  for (const id of Object.keys(data.fields)) {
    if (!next.includes(id)) next.push(id);
  }
  return next;
}

function mergeProjectOrder(prev: string[], data: AppDataJson): string[] {
  const keys = new Set(Object.keys(data.projects));
  const next = prev.filter((id) => keys.has(id));
  for (const id of Object.keys(data.projects)) {
    if (!next.includes(id)) next.push(id);
  }
  return next;
}

/** 领域布局/校验会改项目位置；若侧栏缓冲仍为旧几何，会触发属性面板 autosave 反复 commit */
function syncProjectEditBufferGeometry(get: () => AppState, set: (p: Partial<AppState>) => void) {
  const { selectedProjectId, projectEditBuffer, data } = get();
  if (!selectedProjectId || !projectEditBuffer) return;
  const p = data.projects[selectedProjectId];
  if (!p || projectEditBuffer.id !== selectedProjectId) return;
  const same =
    projectEditBuffer.position[0] === p.position[0] &&
    projectEditBuffer.position[1] === p.position[1] &&
    projectEditBuffer.radius === p.radius &&
    fieldIdsEqual(projectEditBuffer.field_ids, p.field_ids) &&
    (projectEditBuffer.canvas_hidden === true) === (p.canvas_hidden === true);
  if (same) return;
  const nextBuf: Project = {
    ...projectEditBuffer,
    position: [p.position[0], p.position[1]],
    field_ids: [...p.field_ids],
    radius: p.radius,
  };
  if (p.canvas_hidden === true) nextBuf.canvas_hidden = true;
  else delete nextBuf.canvas_hidden;
  set({ projectEditBuffer: nextBuf });
}

function pushHistorySlice(
  history: AppDataJson[],
  index: number,
  snapshot: AppDataJson,
  maxSize: number,
): { history: AppDataJson[]; index: number } {
  const base = history.slice(0, index + 1);
  base.push(cloneAppData(snapshot));
  const overflow = Math.max(0, base.length - maxSize);
  const trimmed = overflow > 0 ? base.slice(overflow) : base;
  return { history: trimmed, index: trimmed.length - 1 };
}

export interface AppState {
  isLoggedIn: boolean;
  currentUsername: string | null;
  loginUsername: string;
  loginPassword: string;
  loginError: string;
  availableUsers: string[];

  data: AppDataJson;
  fieldOrder: string[];
  projectOrder: string[];
  settings: AppSettings;

  selectedProjectId: string | null;
  projectEditBuffer: Project | null;
  /** Shift+点击累加；用于批量隐藏、移入回收站等 */
  multiSelectedProjectIds: string[];

  /** Cmd/Ctrl+从已选圆按下拖拽连线时的起点项目 id */
  relationDraftFromId: string | null;

  history: AppDataJson[];
  historyIndex: number;

  visualizationZoom: number;
  visualizationOffset: { x: number; y: number };

  /** 左侧栏（领域/项目列表）是否展开 */
  leftSidebarOpen: boolean;
  /** 右侧属性栏是否展开 */
  rightSidebarOpen: boolean;
  /** 工作区预览：可视化以绝对定位铺满主内容区（非仅 flex 收栏） */
  vizWorkspacePreview: boolean;
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
  setVizWorkspacePreview: (v: boolean) => void;
  toggleVizWorkspacePreview: () => void;

  exportModalBody: string | null;
  exportSuggestedName: string;

  storageError: string | null;
  clearStorageError: () => void;

  /** 工具栏操作等短暂提示（如时间戳检查点成功） */
  bannerNotice: { text: string; error: boolean } | null;
  showBannerNotice: (text: string, isError?: boolean) => void;

  /** 初始化登录页用户列表 */
  initAuth: () => void;
  setLoginUsername: (v: string) => void;
  setLoginPassword: (v: string) => void;
  submitLogin: () => void;
  logout: () => void;

  loadWorkspaceForUser: (username: string) => void;
  saveWorkspace: () => WriteStorageResult;
  /** 切换到同一用户下另一工作区 JSON（先保存当前） */
  switchWorkspaceStorageFile: (logicalPath: string) => WorkspaceSwitchResult;
  /** 将当前画布内容写入新的工作区文件并切换过去 */
  duplicateCurrentWorkspaceAsNewFile: (filenameInput: string) => WorkspaceSwitchResult;

  setSettings: (s: Partial<AppSettings>) => void;
  setVisualizationZoom: (z: number) => void;
  setVisualizationOffset: (o: { x: number; y: number }) => void;
  zoomBy: (factor: number) => void;

  undo: () => void;
  redo: () => void;
  commitData: (
    next: AppDataJson,
    skipHistory?: boolean,
    orderOverrides?: { fieldOrder?: string[]; projectOrder?: string[] },
    opts?: { mutateFields?: boolean; skipLayoutValidate?: boolean },
  ) => void;

  selectProject: (id: string | null, opts?: { additive?: boolean }) => void;
  clearMultiProjectSelection: () => void;
  selectProjectsWithSameStatus: () => void;
  selectProjectsWithSameFieldSet: () => void;
  selectProjectsWithSameName: () => void;
  setProjectsCanvasHidden: (ids: string[], hidden: boolean) => void;
  moveProjectsToTrash: (ids: string[]) => void;
  restoreProjectFromTrash: (id: string) => void;
  purgeProjectFromTrash: (id: string) => void;
  setProjectEditBuffer: (p: Project | null) => void;
  applyProjectBufferToData: (opts?: { skipHistory?: boolean }) => void;
  /** 用版本数据整体替换工作区并写入 workspace.json */
  replaceWorkspaceFromVersion: (data: AppDataJson) => WriteStorageResult;
  createVersionSnapshot: (label: string) => WriteStorageResult;
  /** 先 flush 侧栏属性缓冲（记入撤销），再按当前时间创建版本快照 */
  checkpointTimestamped: () => WriteStorageResult;
  restoreVersionSnapshot: (snapshotId: string, backupCurrent: boolean) => WriteStorageResult;
  forkVersionBranch: (fromSnapshotId: string, displayName: string) => WriteStorageResult;
  switchVersionBranch: (branchId: string) => WriteStorageResult;
  renameVersionBranch: (branchId: string, displayName: string) => WriteStorageResult;
  deleteVersionBranch: (branchId: string) => WriteStorageResult;

  addField: () => void;
  relayoutFieldsAsVenn: () => void;
  removeField: (id: string) => void;
  renameField: (id: string, name: string) => void;
  reorderFields: (fromFieldId: string, toFieldId: string) => void;

  addProject: () => void;
  /** 移入回收站（原删除按钮） */
  removeProject: (id: string) => void;
  /** 按侧栏顺序重排 projectOrder（传入项目 id），不改变项目数据 */
  reorderProjects: (fromProjectId: string, toProjectId: string) => void;
  setProjectPosition: (id: string, pos: [number, number]) => void;

  importJsonFile: (text: string) => void;
  prepareExport: () => void;
  closeExportModal: () => void;

  mergeUserConfigStoragePath: (username: string, userDir: string) => void;

  setRelationDraftFrom: (id: string | null) => void;
  createRelation: (fromId: string, toId: string, opts?: { indirect?: boolean }) => void;
  removeRelationAt: (index: number) => void;
  updateRelationAt: (index: number, patch: Partial<ProjectRelation>) => void;
  ensureGlobalRelationTag: (tag: string) => void;
}

function newProjectId(projects: Record<string, Project>): string {
  let n = Object.keys(projects).length + 1;
  for (;;) {
    const id = `project_${n}`;
    if (!projects[id]) return id;
    n += 1;
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  isLoggedIn: false,
  currentUsername: null,
  loginUsername: "",
  loginPassword: "",
  loginError: "",
  availableUsers: [],

  data: defaultEmptyAppData(),
  fieldOrder: [],
  projectOrder: [],
  settings: defaultAppSettings(),

  selectedProjectId: null,
  projectEditBuffer: null,
  multiSelectedProjectIds: [],
  relationDraftFromId: null,

  history: [defaultEmptyAppData()],
  historyIndex: 0,

  visualizationZoom: 1,
  visualizationOffset: { x: 0, y: 0 },

  leftSidebarOpen: true,
  rightSidebarOpen: true,
  vizWorkspacePreview: false,

  toggleLeftSidebar: () => set((s) => ({ leftSidebarOpen: !s.leftSidebarOpen })),
  toggleRightSidebar: () => set((s) => ({ rightSidebarOpen: !s.rightSidebarOpen })),
  setVizWorkspacePreview: (v) => set({ vizWorkspacePreview: v }),
  toggleVizWorkspacePreview: () => set((s) => ({ vizWorkspacePreview: !s.vizWorkspacePreview })),

  exportModalBody: null,
  exportSuggestedName: "venncv_export.json",

  storageError: null,
  clearStorageError: () => set({ storageError: null }),

  bannerNotice: null,
  showBannerNotice: (text, isError) => {
    const t = ++bannerNoticeToken;
    set({ bannerNotice: { text, error: !!isError } });
    window.setTimeout(() => {
      if (t === bannerNoticeToken) set({ bannerNotice: null });
    }, 4200);
  },

  initAuth: () => {
    const cfg = loadUserConfig();
    const users = cfg.users.map((u) => u.username).sort();
    set({ availableUsers: users });
  },

  setLoginUsername: (v) => set({ loginUsername: v }),
  setLoginPassword: (v) => set({ loginPassword: v }),

  submitLogin: () => {
    const { loginUsername, loginPassword } = get();
    if (!loginUsername.trim() || !loginPassword) {
      set({ loginError: "用户名和密码不能为空" });
      return;
    }
    const r = verifyUser(loginUsername.trim(), loginPassword);
    if (!r.ok) {
      set({ loginError: "用户名或密码错误" });
      return;
    }
    const username = loginUsername.trim();
    set({
      isLoggedIn: true,
      currentUsername: username,
      loginError: "",
      loginPassword: "",
    });
    get().loadWorkspaceForUser(username);
  },

  logout: () => {
    bannerNoticeToken += 1;
    set({
      isLoggedIn: false,
      currentUsername: null,
      bannerNotice: null,
      leftSidebarOpen: true,
      rightSidebarOpen: true,
      vizWorkspacePreview: false,
      selectedProjectId: null,
      projectEditBuffer: null,
      multiSelectedProjectIds: [],
      relationDraftFromId: null,
      data: defaultEmptyAppData(),
      fieldOrder: [],
      projectOrder: [],
      history: [defaultEmptyAppData()],
      historyIndex: 0,
      settings: {
        ...defaultAppSettings(),
        ...readVisualizationRenderPrefsFromStorage(),
      },
    });
  },

  loadWorkspaceForUser: (username) => {
    const key = resolveWorkspaceStorageKey(username);
    let data: AppDataJson;
    if (existsStorage(key)) {
      const raw = readStorage(key);
      try {
        data = normalizeAppData(JSON.parse(raw ?? "{}"));
        data = validateAppDataPreserveUserLayout(data);
      } catch {
        data = defaultEmptyAppData();
      }
    } else {
      data = defaultEmptyAppData();
    }
    const orders = syncOrdersFromData(data);
    const hist = pushHistorySlice([], -1, data, get().settings.max_history_size);
    set({
      data,
      ...orders,
      selectedProjectId: null,
      projectEditBuffer: null,
      multiSelectedProjectIds: [],
      relationDraftFromId: null,
      history: hist.history,
      historyIndex: hist.index,
      visualizationZoom: get().settings.default_zoom,
      visualizationOffset: { x: 0, y: 0 },
      settings: {
        ...get().settings,
        ...readVisualizationRenderPrefsFromStorage(),
      },
    });
    get().saveWorkspace();
    get().mergeUserConfigStoragePath(username, `users/${username}`);
  },

  saveWorkspace: () => {
    const { currentUsername, data } = get();
    if (!currentUsername) return { ok: true as const };
    const key = resolveWorkspaceStorageKey(currentUsername);
    const wr = writeStorage(key, appDataToExportJson(data));
    if (!wr.ok) {
      set({ storageError: wr.message });
      return wr;
    }
    const cfg = loadUserConfig();
    let changed = false;
    for (const u of cfg.users) {
      if (u.username === currentUsername) {
        if (u.last_edited_file !== key) {
          u.last_edited_file = key;
          changed = true;
        }
        break;
      }
    }
    if (changed) {
      const cr = saveUserConfig(cfg);
      if (!cr.ok) {
        set({ storageError: cr.message });
        return cr;
      }
    }
    set({ storageError: null });
    return { ok: true as const };
  },

  switchWorkspaceStorageFile: (logicalPath) => {
    const username = get().currentUsername;
    if (!username) return { ok: false, message: "未登录" };
    if (!isValidWorkspaceStorageKey(username, logicalPath)) {
      return { ok: false, message: "无效的工作区路径" };
    }
    const wr0 = get().saveWorkspace();
    if (!wr0.ok) return { ok: false, message: wr0.message };
    const cr = setUserLastEditedFile(username, logicalPath);
    if (!cr.ok) return { ok: false, message: cr.message };
    get().loadWorkspaceForUser(username);
    return { ok: true };
  },

  duplicateCurrentWorkspaceAsNewFile: (filenameInput) => {
    const username = get().currentUsername;
    if (!username) return { ok: false, message: "未登录" };
    const fname = normalizeNewWorkspaceFilename(filenameInput);
    if (!fname) {
      return { ok: false, message: "文件名仅允许字母、数字、点、下划线与连字符" };
    }
    const path = `users/${username}/${fname}`;
    const wr0 = get().saveWorkspace();
    if (!wr0.ok) return { ok: false, message: wr0.message };
    const body = appDataToExportJson(get().data);
    const wr1 = writeStorage(path, body);
    if (!wr1.ok) return { ok: false, message: wr1.message };
    const cr = setUserLastEditedFile(username, path);
    if (!cr.ok) return { ok: false, message: cr.message };
    get().loadWorkspaceForUser(username);
    return { ok: true };
  },

  mergeUserConfigStoragePath: (username, userDir) => {
    const cfg = loadUserConfig();
    let changed = false;
    for (const u of cfg.users) {
      if (u.username === username && !u.data_storage_path) {
        u.data_storage_path = userDir;
        changed = true;
        break;
      }
    }
    if (changed) {
      const cr = saveUserConfig(cfg);
      if (!cr.ok) set({ storageError: cr.message });
    }
  },

  setSettings: (partial) =>
    set((s) => {
      const next = { ...s.settings, ...partial };
      if (
        partial.visualization_use_svg !== undefined ||
        partial.visualization_force_konva_pixel_ratio_1 !== undefined
      ) {
        writeVisualizationRenderPrefsToStorage({
          visualization_use_svg: next.visualization_use_svg,
          visualization_force_konva_pixel_ratio_1: next.visualization_force_konva_pixel_ratio_1,
        });
      }
      return { settings: next };
    }),

  setVisualizationZoom: (z) => set({ visualizationZoom: Math.min(6, Math.max(0.08, z)) }),
  setVisualizationOffset: (o) => set({ visualizationOffset: o }),
  zoomBy: (factor) => {
    const z = get().visualizationZoom * factor;
    get().setVisualizationZoom(z);
  },

  undo: () => {
    const { historyIndex, history, fieldOrder, projectOrder } = get();
    if (historyIndex <= 0) return;
    const idx = historyIndex - 1;
    const data = cloneAppData(history[idx]);
    set({
      historyIndex: idx,
      data,
      fieldOrder: mergeFieldOrder(fieldOrder, data),
      projectOrder: mergeProjectOrder(projectOrder, data),
      projectEditBuffer: null,
      selectedProjectId: null,
      multiSelectedProjectIds: [],
      relationDraftFromId: null,
    });
  },

  redo: () => {
    const { historyIndex, history, fieldOrder, projectOrder } = get();
    if (historyIndex >= history.length - 1) return;
    const idx = historyIndex + 1;
    const data = cloneAppData(history[idx]);
    set({
      historyIndex: idx,
      data,
      fieldOrder: mergeFieldOrder(fieldOrder, data),
      projectOrder: mergeProjectOrder(projectOrder, data),
      projectEditBuffer: null,
      selectedProjectId: null,
      multiSelectedProjectIds: [],
      relationDraftFromId: null,
    });
  },

  commitData: (next, skipHistory, orderOverrides, opts) => {
    const { settings, history, historyIndex, fieldOrder, projectOrder } = get();
    sanitizeAppDataInPlace(next);
    const skipLayout = opts?.skipLayoutValidate === true;
    const validated = skipLayout
      ? next
      : opts?.mutateFields === false
        ? validateProjectPositionsWithoutMutatingFields(next)
        : validateAndFixProjectPositions(next);
    const fo =
      orderOverrides?.fieldOrder !== undefined
        ? mergeFieldOrder(orderOverrides.fieldOrder, validated)
        : mergeFieldOrder(fieldOrder, validated);
    const po =
      orderOverrides?.projectOrder !== undefined
        ? mergeProjectOrder(orderOverrides.projectOrder, validated)
        : mergeProjectOrder(projectOrder, validated);
    if (skipHistory) {
      set({ data: validated, fieldOrder: fo, projectOrder: po });
      get().saveWorkspace();
      return;
    }
    const { history: h, index } = pushHistorySlice(
      history,
      historyIndex,
      validated,
      settings.max_history_size,
    );
    set({
      data: validated,
      fieldOrder: fo,
      projectOrder: po,
      history: h,
      historyIndex: index,
    });
    get().saveWorkspace();
  },

  selectProject: (id, opts) => {
    const { data } = get();
    if (!id) {
      set({
        selectedProjectId: null,
        projectEditBuffer: null,
        multiSelectedProjectIds: [],
        relationDraftFromId: null,
      });
      return;
    }
    const p = data.projects[id];
    if (!p) return;
    if (opts?.additive) {
      const cur = get().multiSelectedProjectIds;
      const wasIn = cur.includes(id);
      const nextMulti = wasIn ? cur.filter((x) => x !== id) : [...cur, id];
      if (nextMulti.length === 0) {
        set({
          selectedProjectId: null,
          projectEditBuffer: null,
          multiSelectedProjectIds: [],
          relationDraftFromId: null,
        });
        return;
      }
      const primary = wasIn ? nextMulti[nextMulti.length - 1]! : id;
      const pp = data.projects[primary];
      if (!pp) return;
      set({
        selectedProjectId: primary,
        multiSelectedProjectIds: nextMulti,
        projectEditBuffer: { ...pp },
        relationDraftFromId: null,
      });
      return;
    }
    set({
      selectedProjectId: id,
      multiSelectedProjectIds: [id],
      projectEditBuffer: { ...p },
      relationDraftFromId: null,
    });
  },

  clearMultiProjectSelection: () => {
    const id = get().selectedProjectId;
    const { data } = get();
    if (!id || !data.projects[id]) {
      set({ multiSelectedProjectIds: [], selectedProjectId: null, projectEditBuffer: null });
      return;
    }
    set({
      multiSelectedProjectIds: [id],
      projectEditBuffer: { ...data.projects[id] },
    });
  },

  selectProjectsWithSameStatus: () => {
    const { data, selectedProjectId } = get();
    if (!selectedProjectId || !data.projects[selectedProjectId]) {
      get().showBannerNotice("请先选择一个项目", true);
      return;
    }
    const st = data.projects[selectedProjectId]!.status;
    const ids = Object.values(data.projects)
      .filter((p) => p.status === st)
      .map((p) => p.id);
    set({
      multiSelectedProjectIds: ids,
      selectedProjectId,
      projectEditBuffer: { ...data.projects[selectedProjectId]! },
      relationDraftFromId: null,
    });
    get().showBannerNotice(`已选中 ${ids.length} 个同状态项目`);
  },

  selectProjectsWithSameFieldSet: () => {
    const { data, selectedProjectId } = get();
    if (!selectedProjectId || !data.projects[selectedProjectId]) {
      get().showBannerNotice("请先选择一个项目", true);
      return;
    }
    const key = (fids: string[]) => [...fids].sort().join("|");
    const k = key(data.projects[selectedProjectId]!.field_ids);
    const ids = Object.values(data.projects)
      .filter((p) => key(p.field_ids) === k)
      .map((p) => p.id);
    set({
      multiSelectedProjectIds: ids,
      selectedProjectId,
      projectEditBuffer: { ...data.projects[selectedProjectId]! },
      relationDraftFromId: null,
    });
    get().showBannerNotice(`已选中 ${ids.length} 个同所属领域组合的项目`);
  },

  selectProjectsWithSameName: () => {
    const { data, selectedProjectId } = get();
    if (!selectedProjectId || !data.projects[selectedProjectId]) {
      get().showBannerNotice("请先选择一个项目", true);
      return;
    }
    const name = data.projects[selectedProjectId]!.name.trim();
    const ids = Object.values(data.projects)
      .filter((p) => p.name.trim() === name)
      .map((p) => p.id);
    set({
      multiSelectedProjectIds: ids,
      selectedProjectId,
      projectEditBuffer: { ...data.projects[selectedProjectId]! },
      relationDraftFromId: null,
    });
    get().showBannerNotice(`已选中 ${ids.length} 个同名项目`);
  },

  setProjectsCanvasHidden: (ids, hidden) => {
    if (ids.length === 0) return;
    const next = cloneAppData(get().data);
    for (const id of ids) {
      const p = next.projects[id];
      if (!p) continue;
      if (hidden) next.projects[id] = { ...p, canvas_hidden: true };
      else {
        const { canvas_hidden: _ch, ...rest } = p;
        next.projects[id] = rest as Project;
      }
    }
    get().commitData(next, true);
    const st = get();
    const sel = st.selectedProjectId;
    if (sel && st.data.projects[sel]) {
      set({ projectEditBuffer: { ...st.data.projects[sel] } });
    }
    syncProjectEditBufferGeometry(get, set);
  },

  moveProjectsToTrash: (ids) => {
    const uniq = [...new Set(ids)].filter(Boolean);
    if (uniq.length === 0) return;
    const next = cloneAppData(get().data);
    if (!next.deleted_projects) next.deleted_projects = {};
    for (const id of uniq) {
      const p = next.projects[id];
      if (!p) continue;
      const cut = next.relations.filter((r) => r.from_id === id || r.to_id === id);
      if (cut.length > 0) {
        next.deleted_relation_stash = [...(next.deleted_relation_stash ?? []), ...cut];
      }
      next.relations = next.relations.filter((r) => r.from_id !== id && r.to_id !== id);
      delete next.projects[id];
      next.deleted_projects[id] = { ...p };
    }
    get().commitData(next);
    const st = get();
    const sel = st.selectedProjectId;
    const still = sel && st.data.projects[sel];
    set({
      selectedProjectId: still ? sel : null,
      projectEditBuffer: still && sel ? { ...st.data.projects[sel] } : null,
      multiSelectedProjectIds: st.multiSelectedProjectIds.filter((i) => st.data.projects[i]),
      relationDraftFromId: null,
    });
  },

  restoreProjectFromTrash: (id) => {
    const { data } = get();
    const p = data.deleted_projects?.[id];
    if (!p) return;
    const next = cloneAppData(data);
    delete next.deleted_projects![id];
    next.projects[id] = { ...p };
    const stash = next.deleted_relation_stash ?? [];
    const touching = stash.filter((r) => r.from_id === id || r.to_id === id);
    const rest = stash.filter((r) => r.from_id !== id && r.to_id !== id);
    const kept: ProjectRelation[] = [];
    for (const r of touching) {
      if (next.projects[r.from_id] && next.projects[r.to_id]) {
        const dup = next.relations.some((x) => x.from_id === r.from_id && x.to_id === r.to_id);
        if (!dup) next.relations.push({ ...r });
      } else {
        kept.push(r);
      }
    }
    next.deleted_relation_stash = [...rest, ...kept];
    get().commitData(next, undefined, undefined, { skipLayoutValidate: true });
    get().showBannerNotice("已从回收站复原项目（连线已尽量恢复）");
  },

  purgeProjectFromTrash: (id) => {
    const next = cloneAppData(get().data);
    if (!next.deleted_projects?.[id]) return;
    delete next.deleted_projects[id];
    next.deleted_relation_stash = (next.deleted_relation_stash ?? []).filter(
      (r) => r.from_id !== id && r.to_id !== id,
    );
    get().commitData(next, true, undefined, { skipLayoutValidate: true });
  },

  setProjectEditBuffer: (p) => set({ projectEditBuffer: p }),

  applyProjectBufferToData: (opts) => {
    const { projectEditBuffer, data, selectedProjectId } = get();
    if (!projectEditBuffer || !selectedProjectId) return;
    const old = data.projects[selectedProjectId];
    if (!old) return;
    const next = cloneAppData(data);
    let position = projectEditBuffer.position;
    if (!fieldIdsEqual(old.field_ids, projectEditBuffer.field_ids)) {
      const temp = cloneAppData(data);
      temp.projects[selectedProjectId] = { ...projectEditBuffer, id: selectedProjectId };
      position = calculateProjectPosition(temp, selectedProjectId);
    }
    next.projects[selectedProjectId] = { ...projectEditBuffer, position };
    const merged = next.projects[selectedProjectId]!;
    const posEq =
      Math.abs(old.position[0] - merged.position[0]) < 1e-4 &&
      Math.abs(old.position[1] - merged.position[1]) < 1e-4;
    const geomSame =
      fieldIdsEqual(old.field_ids, merged.field_ids) &&
      posEq &&
      old.radius === merged.radius &&
      (old.canvas_hidden === true) === (merged.canvas_hidden === true);
    get().commitData(next, opts?.skipHistory, undefined, {
      skipLayoutValidate: geomSame,
      mutateFields: !geomSame,
    });
    set({ projectEditBuffer: { ...get().data.projects[selectedProjectId]! } });
  },

  replaceWorkspaceFromVersion: (raw) => {
    const data = validateAppDataPreserveUserLayout(normalizeAppData(raw));
    const orders = syncOrdersFromData(data);
    const hist = pushHistorySlice([], -1, data, get().settings.max_history_size);
    set({
      data,
      ...orders,
      selectedProjectId: null,
      projectEditBuffer: null,
      multiSelectedProjectIds: [],
      relationDraftFromId: null,
      history: hist.history,
      historyIndex: hist.index,
      visualizationZoom: get().settings.default_zoom,
      visualizationOffset: { x: 0, y: 0 },
    });
    return get().saveWorkspace();
  },

  createVersionSnapshot: (label) => {
    const u = get().currentUsername;
    if (!u) return { ok: false, code: "UNKNOWN", message: "未登录" } as WriteStorageResult;
    const vs = loadVersionStore(u);
    const { store: next } = appendSnapshot(vs, vs.currentBranchId, get().data, label);
    const pr = persistVersionStore(u, next);
    if (!pr.ok) {
      set({ storageError: pr.message });
      return pr;
    }
    set({ storageError: null });
    return { ok: true as const };
  },

  checkpointTimestamped: () => {
    const st = get();
    const { selectedProjectId, projectEditBuffer, data } = st;
    if (selectedProjectId && projectEditBuffer) {
      const p = data.projects[selectedProjectId];
      if (p && JSON.stringify(projectEditBuffer) !== JSON.stringify(p)) {
        st.applyProjectBufferToData({ skipHistory: false });
      }
    }
    const label = `检查点 ${new Date().toLocaleString()}`;
    const r = get().createVersionSnapshot(label);
    if (r.ok) {
      get().showBannerNotice(`已保存时间戳检查点：${label}`);
    } else {
      get().showBannerNotice(r.message, true);
    }
    return r;
  },

  restoreVersionSnapshot: (snapshotId, backupCurrent) => {
    const STASH = "__stash";
    const u = get().currentUsername;
    if (!u) return { ok: false, code: "UNKNOWN", message: "未登录" } as WriteStorageResult;
    let vs = loadVersionStore(u);
    const snap = vs.snapshots[snapshotId];
    if (!snap)
      return { ok: false, code: "UNKNOWN", message: "快照不存在" } as WriteStorageResult;
    if (backupCurrent) {
      const { store: withBackup, id: backupId } = appendSnapshot(
        vs,
        vs.currentBranchId,
        get().data,
        `恢复前备份 ${new Date().toLocaleString()}`,
      );
      vs = {
        ...withBackup,
        branchNames: {
          ...withBackup.branchNames,
          [STASH]: "恢复前自动备份",
        },
        tips: {
          ...withBackup.tips,
          [STASH]: backupId,
          [withBackup.currentBranchId]: snapshotId,
        },
      };
      const pr0 = persistVersionStore(u, vs);
      if (!pr0.ok) {
        set({ storageError: pr0.message });
        return pr0;
      }
    } else {
      vs = {
        ...vs,
        tips: { ...vs.tips, [vs.currentBranchId]: snapshotId },
      };
      const pr0 = persistVersionStore(u, vs);
      if (!pr0.ok) {
        set({ storageError: pr0.message });
        return pr0;
      }
    }
    const parsed = parseSnapshotData(snap);
    if (!parsed)
      return { ok: false, code: "UNKNOWN", message: "快照数据损坏" } as WriteStorageResult;
    return get().replaceWorkspaceFromVersion(parsed);
  },

  forkVersionBranch: (fromSnapshotId, displayName) => {
    const u = get().currentUsername;
    if (!u) return { ok: false, code: "UNKNOWN", message: "未登录" } as WriteStorageResult;
    const vs = loadVersionStore(u);
    const fr = forkBranch(vs, fromSnapshotId, displayName);
    if (!fr.ok) {
      return { ok: false, code: "UNKNOWN", message: fr.error } as WriteStorageResult;
    }
    const pr = persistVersionStore(u, fr.store);
    if (!pr.ok) {
      set({ storageError: pr.message });
      return pr;
    }
    set({ storageError: null });
    return get().replaceWorkspaceFromVersion(fr.data);
  },

  switchVersionBranch: (branchId) => {
    const u = get().currentUsername;
    if (!u) return { ok: false, code: "UNKNOWN", message: "未登录" } as WriteStorageResult;
    const vs = loadVersionStore(u);
    const sw = switchBranch(vs, branchId);
    if (!sw.ok) {
      return { ok: false, code: "UNKNOWN", message: sw.error } as WriteStorageResult;
    }
    const pr = persistVersionStore(u, sw.store);
    if (!pr.ok) {
      set({ storageError: pr.message });
      return pr;
    }
    set({ storageError: null });
    if (sw.data === null) {
      return get().replaceWorkspaceFromVersion(defaultEmptyAppData());
    }
    return get().replaceWorkspaceFromVersion(sw.data);
  },

  renameVersionBranch: (branchId, displayName) => {
    const u = get().currentUsername;
    if (!u) return { ok: false, code: "UNKNOWN", message: "未登录" } as WriteStorageResult;
    const vs = loadVersionStore(u);
    const next = renameBranch(vs, branchId, displayName);
    const pr = persistVersionStore(u, next);
    if (!pr.ok) set({ storageError: pr.message });
    else set({ storageError: null });
    return pr;
  },

  deleteVersionBranch: (branchId) => {
    const u = get().currentUsername;
    if (!u) return { ok: false, code: "UNKNOWN", message: "未登录" } as WriteStorageResult;
    const vs = loadVersionStore(u);
    const del = deleteBranch(vs, branchId);
    if (!del.ok) {
      return { ok: false, code: "UNKNOWN", message: del.error } as WriteStorageResult;
    }
    const pr = persistVersionStore(u, del.store);
    if (!pr.ok) {
      set({ storageError: pr.message });
      return pr;
    }
    set({ storageError: null });
    if (del.switchedWorkspace) {
      const sw = switchBranch(del.store, del.store.currentBranchId);
      if (!sw.ok) {
        return { ok: false, code: "UNKNOWN", message: sw.error } as WriteStorageResult;
      }
      if (sw.data === null) {
        return get().replaceWorkspaceFromVersion(defaultEmptyAppData());
      }
      return get().replaceWorkspaceFromVersion(sw.data);
    }
    return { ok: true as const };
  },

  addField: () => {
    const { data, fieldOrder } = get();
    const next = cloneAppData(data);
    const id = allocNewFieldId(next.fields);
    const f: ResearchField = {
      id,
      name: "新领域",
      description: "",
      position: [VENN_CENTER_X, VENN_CENTER_Y],
      radius: VENN_FIELD_BASE_RADIUS,
    };
    next.fields[id] = f;
    const orderIds = [...fieldOrder.filter((fid) => next.fields[fid])];
    if (!orderIds.includes(id)) orderIds.push(id);
    next.fields = layoutFieldsVennPositions(orderIds, next.fields);
    recalculateAllProjectPositions(next);
    get().commitData(next);
    syncProjectEditBufferGeometry(get, set);
  },

  relayoutFieldsAsVenn: () => {
    const { data, fieldOrder } = get();
    const next = cloneAppData(data);
    const orderIds = fieldOrder.filter((fid) => next.fields[fid]);
    if (orderIds.length === 0) return;
    next.fields = layoutFieldsVennPositions(orderIds, next.fields);
    recalculateAllProjectPositions(next);
    get().commitData(next);
    syncProjectEditBufferGeometry(get, set);
  },

  removeField: (id) => {
    const { data, fieldOrder } = get();
    const next = cloneAppData(data);
    delete next.fields[id];
    for (const p of Object.values(next.projects)) {
      p.field_ids = p.field_ids.filter((x) => x !== id);
    }
    const orderIds = fieldOrder.filter((fid) => fid !== id && next.fields[fid]);
    if (orderIds.length > 0) {
      next.fields = layoutFieldsVennPositions(orderIds, next.fields);
    }
    recalculateAllProjectPositions(next);
    get().commitData(next);
    syncProjectEditBufferGeometry(get, set);
  },

  renameField: (id, name) => {
    const { data } = get();
    const next = cloneAppData(data);
    if (next.fields[id]) next.fields[id] = { ...next.fields[id], name };
    get().commitData(next);
  },

  reorderFields: (fromFieldId, toFieldId) => {
    if (fromFieldId === toFieldId) return;
    const { fieldOrder, data } = get();
    const fromIdx = fieldOrder.indexOf(fromFieldId);
    const toIdx = fieldOrder.indexOf(toFieldId);
    if (fromIdx < 0 || toIdx < 0) return;
    if (fromIdx === toIdx || fromIdx + 1 === toIdx) return;
    const nextOrder = [...fieldOrder];
    const [moved] = nextOrder.splice(fromIdx, 1);
    let dest = toIdx > fromIdx ? toIdx - 1 : toIdx;
    dest = Math.max(0, Math.min(dest, nextOrder.length));
    nextOrder.splice(dest, 0, moved);
    const next = cloneAppData(data);
    const newFields: Record<string, ResearchField> = {};
    for (const fid of nextOrder) {
      if (next.fields[fid]) newFields[fid] = next.fields[fid];
    }
    for (const fid of Object.keys(next.fields)) {
      if (!newFields[fid]) newFields[fid] = next.fields[fid];
    }
    next.fields = newFields;
    const vennOrder = nextOrder.filter((fid) => next.fields[fid]);
    if (vennOrder.length > 0) {
      next.fields = layoutFieldsVennPositions(vennOrder, next.fields);
    }
    recalculateAllProjectPositions(next);
    get().commitData(next, false, { fieldOrder: nextOrder });
    syncProjectEditBufferGeometry(get, set);
  },

  addProject: () => {
    const { data } = get();
    const next = cloneAppData(data);
    const id = newProjectId(next.projects);
    const p: Project = {
      id,
      name: "新项目",
      description: "",
      status: "ToBeStarted",
      field_ids: [],
      position: [400, 400],
      radius: 20,
      completion_percentage: 0,
    };
    next.projects[id] = p;
    get().commitData(next);
    get().selectProject(id);
  },

  removeProject: (id) => {
    get().moveProjectsToTrash([id]);
  },

  reorderProjects: (fromProjectId, toProjectId) => {
    if (fromProjectId === toProjectId) return;
    const { projectOrder, data } = get();
    const visible = projectOrder.filter((id) => data.projects[id]);
    const fromIdx = visible.indexOf(fromProjectId);
    const toIdx = visible.indexOf(toProjectId);
    if (fromIdx < 0 || toIdx < 0) return;
    if (fromIdx === toIdx || fromIdx + 1 === toIdx) return;
    const perm = [...visible];
    const [moved] = perm.splice(fromIdx, 1);
    let dest = toIdx > fromIdx ? toIdx - 1 : toIdx;
    dest = Math.max(0, Math.min(dest, perm.length));
    perm.splice(dest, 0, moved);
    get().commitData(cloneAppData(data), false, { projectOrder: perm });
  },

  setProjectPosition: (id, pos) => {
    const { data } = get();
    const next = cloneAppData(data);
    if (!next.projects[id]) return;
    next.projects[id] = { ...next.projects[id], position: pos };
    // 每次拖放结束若写入撤销栈，会堆积多份整工作区深拷贝 + 校验再拷贝，数分钟内易撑爆内存导致 WebView 被系统结束（闪退）。
    // 整图 validate 会反复扩领域半径、推领域圆心，三圆交集越挤越小并加重计算；拖放仅做「不改动 fields」的轻校验。
    get().commitData(next, true, undefined, { mutateFields: false });
    if (get().selectedProjectId === id) {
      const p = get().data.projects[id];
      if (p) set({ projectEditBuffer: { ...p } });
    }
  },

  importJsonFile: (text) => {
    const { data } = get();
    const merged = mergeImportJson(data, text);
    get().commitData(merged);
  },

  prepareExport: () => {
    const json = appDataToExportJson(get().data);
    set({ exportModalBody: json, exportSuggestedName: "venncv_export.json" });
  },

  closeExportModal: () => set({ exportModalBody: null }),

  setRelationDraftFrom: (id) => set({ relationDraftFromId: id }),

  createRelation: (fromId, toId, opts) => {
    if (fromId === toId) return;
    const { data } = get();
    if (data.relations.some((r) => r.from_id === fromId && r.to_id === toId)) return;
    const next = cloneAppData(data);
    const rel: ProjectRelation = {
      from_id: fromId,
      to_id: toId,
      relation_type: opts?.indirect ? "Indirect" : "Direct",
      tags: [],
      color: [...DEFAULT_RELATION_COLOR] as ProjectRelation["color"],
      width: DEFAULT_RELATION_WIDTH,
    };
    next.relations.push(rel);
    get().commitData(next);
    set({ relationDraftFromId: null });
  },

  removeRelationAt: (index) => {
    const { data } = get();
    if (index < 0 || index >= data.relations.length) return;
    const next = cloneAppData(data);
    next.relations.splice(index, 1);
    get().commitData(next);
  },

  updateRelationAt: (index, patch) => {
    const { data } = get();
    if (index < 0 || index >= data.relations.length) return;
    const next = cloneAppData(data);
    next.relations[index] = { ...next.relations[index], ...patch };
    get().commitData(next);
  },

  ensureGlobalRelationTag: (tag) => {
    const t = tag.trim();
    if (!t) return;
    const { data } = get();
    if (data.relation_tags.includes(t)) return;
    const next = cloneAppData(data);
    next.relation_tags = [...next.relation_tags, t];
    get().commitData(next);
  },
}));

/** 创建用户（写入 config.yaml） */
export function createUserInConfig(username: string, password: string): string | null {
  if (!username.trim()) return "用户名为空";
  const cfg = loadUserConfig();
  if (cfg.users.some((u) => u.username === username.trim())) {
    return "用户已存在";
  }
  cfg.users.push({
    username: username.trim(),
    password_hash: password,
    data_storage_path: `users/${username.trim()}`,
    last_edited_file: null,
  });
  const wr = saveUserConfig(cfg);
  if (!wr.ok) return wr.message;
  return null;
}

export function loadUserConfigExternal(): UserConfig {
  return loadUserConfig();
}
