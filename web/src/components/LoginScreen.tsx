import { useEffect, useState } from "react";
import { getRuntimeStorageInfo } from "../storage/runtimeStorage";
import { formatRememberUntil } from "../storage/rememberLogin";
import { initPersistentStorage } from "../storage/initLibrary";
import {
  fetchLibraryChoices,
  forgetUserLibrary,
  LibrarySwitchError,
  switchUserLibrary,
  type LibraryChoice,
} from "../storage/fs";
import { loadSyncAccount } from "../storage/syncAccount";
import { loadUserSummaries, type UserWorkspaceSummary } from "../storage/userSummary";
import { PROJECT_STATUS_META } from "../types";
import { createUserInConfig, useAppStore } from "../store/appStore";
import { LoginCloudPanel } from "./LoginCloudPanel";
import { LoginCloudUpload } from "./LoginCloudUpload";
import "./login.css";

const ACCENTS = ["#0f6e6e", "#1d4e89", "#8a4b2f", "#3d5a40", "#5c4d7a", "#0e7490"];

function accentFor(name: string): string {
  let index = 0;
  for (const char of name) index = (index + char.charCodeAt(0)) % ACCENTS.length;
  return ACCENTS[index] ?? ACCENTS[0];
}

function UserCard({
  card,
  selected,
  onSelect,
}: {
  card: UserWorkspaceSummary;
  selected: boolean;
  onSelect: (username: string) => void;
}) {
  return (
    <button
      type="button"
      className={selected ? "login-card is-selected" : "login-card"}
      onClick={() => onSelect(card.username)}
      aria-pressed={selected}
    >
      <div className="login-card-top">
        <span className="login-avatar" style={{ background: accentFor(card.username) }}>
          {card.username.slice(0, 1).toUpperCase()}
        </span>
        <span>
          <span className="login-name">{card.username}</span>
          <span className="login-file">{card.workspaceFile || "尚无工作区"}</span>
        </span>
        {card.rememberedUntil ? (
          <span className="login-badge login-badge-remember">免密码</span>
        ) : card.needsPassword ? (
          <span className="login-badge">待设密码</span>
        ) : null}
      </div>
      <div className="login-count">
        <strong>{card.projectCount}</strong>
        <span>个项目</span>
      </div>
      {card.rememberedUntil ? (
        <p className="login-names">免密码至 {formatRememberUntil(card.rememberedUntil)}，点击直接进入</p>
      ) : null}
      {card.fieldNames.length > 0 ? (
        <p className="login-fields">{card.fieldNames.join(" · ")}</p>
      ) : (
        <p className="login-fields">还没有领域</p>
      )}
      {card.previewNames.length > 0 ? (
        <p className="login-names">{card.previewNames.join(" · ")}</p>
      ) : null}
      {card.namedHiddenCount > 0 ? (
        <p className="login-names">另有 {card.namedHiddenCount} 个已命名项目</p>
      ) : null}
      {card.placeholderCount > 0 ? (
        <p className="login-names">其中 {card.placeholderCount} 个还没有正式名称</p>
      ) : null}
      {card.statusCounts.length > 0 ? (
        <p className="login-status">
          {card.statusCounts.map((item) => (
            <i key={item.status}>
              <b style={{ background: PROJECT_STATUS_META[item.status].fill }} />
              {item.label} {item.count}
            </i>
          ))}
        </p>
      ) : null}
    </button>
  );
}

export function LoginScreen() {
  const initAuth = useAppStore((s) => s.initAuth);
  const usersWithoutPassword = useAppStore((s) => s.usersWithoutPassword);
  const loginUsername = useAppStore((s) => s.loginUsername);
  const loginPassword = useAppStore((s) => s.loginPassword);
  const loginError = useAppStore((s) => s.loginError);
  const selectLoginUser = useAppStore((s) => s.selectLoginUser);
  const loginWithRememberedSession = useAppStore((s) => s.loginWithRememberedSession);
  const loginRemember = useAppStore((s) => s.loginRemember);
  const setLoginRemember = useAppStore((s) => s.setLoginRemember);
  const setLoginPassword = useAppStore((s) => s.setLoginPassword);
  const submitLogin = useAppStore((s) => s.submitLogin);
  const [cards, setCards] = useState<UserWorkspaceSummary[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState("");
  const [newPass, setNewPass] = useState("");
  const [createErr, setCreateErr] = useState("");
  const [pathOpen, setPathOpen] = useState(false);
  const [choices, setChoices] = useState<LibraryChoice[]>([]);
  const [draftPath, setDraftPath] = useState("");
  const [pathError, setPathError] = useState("");
  const [pendingCreate, setPendingCreate] = useState<string | null>(null);
  const [pathBusy, setPathBusy] = useState(false);
  const [source, setSource] = useState<"local" | "cloud">("local");
  const [cloudReady, setCloudReady] = useState(false);
  const storage = getRuntimeStorageInfo();

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  useEffect(() => {
    setCards(loadUserSummaries());
  }, [usersWithoutPassword]);

  useEffect(() => {
    const account = loadSyncAccount();
    setCloudReady(Boolean(account.email && account.password));
  }, [source, storage.dataDirectory, usersWithoutPassword]);

  useEffect(() => {
    if (source !== "local") return;
    setCards(loadUserSummaries());
  }, [source, storage.dataDirectory]);

  const selected = cards.find((card) => card.username === loginUsername) ?? null;
  const selectedNeedsPassword = selected?.needsPassword ?? false;

  async function reloadChoices(): Promise<void> {
    setChoices(await fetchLibraryChoices());
  }

  async function useLibraryPath(libraryPath: string, create: boolean): Promise<void> {
    setPathBusy(true);
    setPathError("");
    try {
      const next = await switchUserLibrary(libraryPath, create);
      await initPersistentStorage();
      initAuth();
      selectLoginUser("");
      setCards(loadUserSummaries());
      setChoices(next);
      setPendingCreate(null);
      setDraftPath("");
    } catch (error) {
      if (error instanceof LibrarySwitchError) {
        switch (error.code) {
          case "NEED_CREATE":
            setPendingCreate(libraryPath);
            setPathError("这个文件夹还不存在。要创建并用作新的用户库吗？");
            break;
          case "FAILED":
            setPendingCreate(null);
            setPathError(error.message);
            break;
          default: {
            const unexpected: never = error.code;
            setPathError(unexpected);
          }
        }
      } else {
        setPendingCreate(null);
        setPathError(error instanceof Error ? error.message : "切换用户数据路径失败");
      }
    } finally {
      setPathBusy(false);
    }
  }

  async function forgetLibraryPath(libraryPath: string): Promise<void> {
    setPathBusy(true);
    setPathError("");
    try {
      setChoices(await forgetUserLibrary(libraryPath));
    } catch (error) {
      setPathError(error instanceof Error ? error.message : "移出常用路径失败");
    } finally {
      setPathBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-inner">
        <p className="login-kicker">{storage.kind}</p>
        <h1>VennCV</h1>
        <p className="login-lead">先选择读取本机已有用户，或在这里设置坚果云。</p>
        <div className="login-source" role="group" aria-label="数据来源">
          <button
            type="button"
            className={source === "local" ? "is-selected" : ""}
            aria-pressed={source === "local"}
            onClick={() => setSource("local")}
          >
            读取本地
          </button>
          <button
            type="button"
            className={source === "cloud" ? "is-selected" : ""}
            aria-pressed={source === "cloud"}
            onClick={() => setSource("cloud")}
          >
            设置坚果云
          </button>
        </div>
        <div className="login-library">
          <div className="login-library-current">
            <span>用户数据路径</span>
            <code>{storage.dataDirectory || "尚未连接"}</code>
            <button
              type="button"
              className="login-ghost"
              onClick={() => {
                const next = !pathOpen;
                setPathOpen(next);
                setPathError("");
                setPendingCreate(null);
                if (next) {
                  void reloadChoices().catch((error: unknown) => {
                    setPathError(error instanceof Error ? error.message : "读取常用路径失败");
                  });
                }
              }}
            >
              {pathOpen ? "收起" : "切换"}
            </button>
          </div>
          {pathOpen ? (
            <div className="login-library-panel">
              <ul className="login-library-list">
                {choices.map((choice) => (
                  <li key={choice.path}>
                    <span>
                      <strong>{choice.label}</strong>
                      <code>{choice.path}</code>
                    </span>
                    {choice.current ? (
                      <em>当前</em>
                    ) : (
                      <span className="login-library-actions">
                        <button
                          type="button"
                          className="login-ghost"
                          disabled={pathBusy}
                          aria-label={choice.exists ? `使用 ${choice.label}` : `创建并使用 ${choice.label}`}
                          onClick={() => void useLibraryPath(choice.path, !choice.exists)}
                        >
                          {choice.exists ? "使用" : "创建并使用"}
                        </button>
                        {choice.builtin ? null : (
                          <button
                            type="button"
                            className="login-ghost"
                            disabled={pathBusy}
                            aria-label={`移出 ${choice.label}`}
                            onClick={() => void forgetLibraryPath(choice.path)}
                          >
                            移出
                          </button>
                        )}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <form
                className="login-library-add"
                onSubmit={(event) => {
                  event.preventDefault();
                  const target = pendingCreate ?? draftPath.trim();
                  if (!target) {
                    setPathError("请填写路径");
                    return;
                  }
                  void useLibraryPath(target, pendingCreate !== null);
                }}
              >
                <label htmlFor="library-path">其他路径</label>
                <input
                  id="library-path"
                  value={draftPath}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="从根目录开始的完整路径"
                  onChange={(event) => {
                    setDraftPath(event.target.value);
                    setPendingCreate(null);
                  }}
                />
                <button type="submit" className="login-primary" disabled={pathBusy}>
                  {pendingCreate ? "创建并使用" : "使用此路径"}
                </button>
              </form>
              {pathError ? (
                <p className="login-error" role="alert">
                  {pathError}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {source === "cloud" ? (
          <LoginCloudPanel
            libraryKey={storage.dataDirectory}
            onImported={() => {
              initAuth();
              setCards(loadUserSummaries());
            }}
          />
        ) : null}

        {source === "local" ? (
        <>
        <div className="login-grid">
          {cards.map((card) => (
            <div className="login-user" key={card.username}>
              <UserCard
                card={card}
                selected={card.username === loginUsername}
                onSelect={(username) => {
                  const found = cards.find((item) => item.username === username);
                  setShowCreate(false);
                  if (found?.rememberedUntil) {
                    loginWithRememberedSession(username);
                    return;
                  }
                  if (username !== loginUsername) selectLoginUser(username);
                }}
              />
              {cloudReady ? (
                <LoginCloudUpload
                  key={`${storage.dataDirectory}:${card.username}`}
                  username={card.username}
                  onSynced={() => setCards(loadUserSummaries())}
                />
              ) : null}
            </div>
          ))}
          <button
            type="button"
            className="login-card login-card-new"
            onClick={() => {
              setShowCreate((open) => !open);
              setCreateErr("");
            }}
          >
            <strong>{showCreate ? "收起" : "新建用户"}</strong>
            <span>创建一个空的工作区</span>
          </button>
        </div>

        {selected ? (
          <form
            className="login-dock"
            onSubmit={(event) => {
              event.preventDefault();
              submitLogin();
            }}
          >
            <div>
              <h2>进入 {selected.username}</h2>
              <p>
                {selected.projectCount} 个项目
                {selected.fieldNames.length > 0 ? ` · ${selected.fieldNames.join("、")}` : ""}
              </p>
              {selectedNeedsPassword ? (
                <p>这个用户已有本地数据，但还没有密码。输入至少 4 位新密码即可设置并登录。</p>
              ) : null}
            </div>
            <div>
              <label htmlFor="login-password">{selectedNeedsPassword ? "设置密码" : "密码"}</label>
              <input
                id="login-password"
                key={selected.username}
                type="password"
                value={loginPassword}
                autoFocus
                onChange={(event) => setLoginPassword(event.target.value)}
              />
              <label className="login-remember">
                <input
                  type="checkbox"
                  checked={loginRemember}
                  onChange={(event) => setLoginRemember(event.target.checked)}
                />
                记住登录，3 天内不用再输入密码
              </label>
            </div>
            <button type="submit" className="login-primary">
              {selectedNeedsPassword ? "设置密码并登录" : "登录"}
            </button>
            {loginError ? (
              <p className="login-error" role="alert">
                {loginError}
              </p>
            ) : null}
          </form>
        ) : null}

        {showCreate ? (
          <form
            className="login-create"
            onSubmit={(event) => {
              event.preventDefault();
              const err = createUserInConfig(newUser, newPass);
              if (err) {
                setCreateErr(err);
                return;
              }
              setCreateErr("");
              setNewUser("");
              setNewPass("");
              setShowCreate(false);
              initAuth();
            }}
          >
            <h2>新建用户</h2>
            <div>
              <label htmlFor="new-username">用户名</label>
              <input
                id="new-username"
                value={newUser}
                onChange={(event) => setNewUser(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="new-password">密码</label>
              <input
                id="new-password"
                type="password"
                value={newPass}
                onChange={(event) => setNewPass(event.target.value)}
              />
            </div>
            {createErr ? <p className="login-error">{createErr}</p> : null}
            <div className="login-create-actions">
              <button type="submit" className="login-primary">
                创建
              </button>
              <button type="button" className="login-ghost" onClick={() => setShowCreate(false)}>
                取消
              </button>
            </div>
          </form>
        ) : null}
        </>
        ) : null}
      </div>
    </div>
  );
}
