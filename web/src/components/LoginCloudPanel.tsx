import { useEffect, useState } from "react";
import { DEFAULT_SYNC_FOLDER, syncFolderPath, type SyncAccountFields } from "../domain/nutstore";
import { loadUserConfig } from "../storage/config";
import { listNutstoreUsers, testNutstore } from "../storage/nutstoreClient";
import { loadSyncAccount, saveSyncAccount } from "../storage/syncAccount";
import { importRemoteUser } from "../storage/userCloud";

export function LoginCloudPanel({ libraryKey, onImported }: { libraryKey: string; onImported?: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [folder, setFolder] = useState(DEFAULT_SYNC_FOLDER);
  const [savedPassword, setSavedPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [users, setUsers] = useState<string[] | null>(null);
  const [userNote, setUserNote] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [localUsers, setLocalUsers] = useState<string[]>([]);

  async function refreshUsers(next: SyncAccountFields): Promise<void> {
    setUserNote("");
    const result = await listNutstoreUsers(next);
    if (!result.ok) {
      setUsers(null);
      setUserNote(result.message);
      return;
    }
    setUsers(result.users);
    setPicked((current) => current.filter((name) => result.users.includes(name)));
    setLocalUsers(loadUserConfig().users.map((user) => user.username));
    setUserNote(result.users.length === 0 ? "这个远程目录下还没有用户。" : "");
  }

  useEffect(() => {
    const account = loadSyncAccount();
    setEmail(account.email);
    setFolder(account.folder);
    setSavedPassword(account.password);
    setPassword("");
    setMessage("");
    setUsers(null);
    setPicked([]);
    setLocalUsers(loadUserConfig().users.map((user) => user.username));
    setUserNote("");
    if (!account.email || !account.password) return;
    let cancelled = false;
    setBusy(true);
    void listNutstoreUsers(account).then((result) => {
      if (cancelled) return;
      setBusy(false);
      if (!result.ok) {
        setUsers(null);
        setUserNote(result.message);
        return;
      }
      setUsers(result.users);
      setPicked([]);
      setLocalUsers(loadUserConfig().users.map((user) => user.username));
      setUserNote(result.users.length === 0 ? "这个远程目录下还没有用户。" : "");
    });
    return () => {
      cancelled = true;
    };
  }, [libraryKey]);

  const account = () => ({
    email: email.trim(),
    password: password || savedPassword,
    folder,
  });

  return (
    <form
      className="login-cloud"
      onSubmit={(event) => {
        event.preventDefault();
        const next = account();
        const written = saveSyncAccount(next);
        if (!written.ok) {
          setMessage(written.message);
          return;
        }
        setSavedPassword(next.password);
        setPassword("");
        setMessage("已保存在本机。");
        setBusy(true);
        void refreshUsers(next).then(() => setBusy(false));
      }}
    >
      <h2>设置坚果云</h2>
      <p>
        用坚果云邮箱和应用密码。应用密码在坚果云的安全选项里生成，不是登录密码。账号写在当前用户库，不进任何工作区。查看用户后勾选要同步的人，一个也可以。回到读取本地后，为新用户设置至少 4 位密码再进入。
      </p>
      <section aria-label="坚果云路径下的用户">
        <h3>{(syncFolderPath(folder) ?? folder.trim()) || DEFAULT_SYNC_FOLDER} 下的用户</h3>
        {users && users.length > 0 ? (
          <>
            <ul className="login-cloud-users">
              {users.map((name) => (
                <li key={name}>
                  <label>
                    <input
                      type="checkbox"
                      checked={picked.includes(name)}
                      disabled={busy}
                      onChange={() => {
                        setPicked((current) =>
                          current.includes(name) ? current.filter((item) => item !== name) : [...current, name],
                        );
                      }}
                    />
                    <span>{name}</span>
                    {localUsers.includes(name) ? <span className="login-cloud-user-note">已在本机</span> : null}
                  </label>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="login-primary"
              disabled={busy || picked.length === 0}
              onClick={() => {
                const next = account();
                const chosen = picked.filter((name) => users.includes(name));
                if (chosen.length === 0) return;
                setBusy(true);
                setMessage("");
                const written = saveSyncAccount(next);
                if (!written.ok) {
                  setBusy(false);
                  setMessage(written.message);
                  return;
                }
                setSavedPassword(next.password);
                setPassword("");
                void (async () => {
                  const lines: string[] = [];
                  for (const name of chosen) {
                    const result = await importRemoteUser(name);
                    lines.push(result.ok ? `${name} 已同步到本机` : `${name}：${result.message}`);
                  }
                  setLocalUsers(loadUserConfig().users.map((user) => user.username));
                  setMessage(lines.join(" "));
                  setBusy(false);
                  onImported?.();
                })();
              }}
            >
              同步到本地
            </button>
          </>
        ) : (
          <p role="status">{userNote || (savedPassword ? "正在读取远程用户…" : "保存账号后，点查看用户。")}</p>
        )}
      </section>
      <div>
        <label htmlFor="cloud-email">邮箱</label>
        <input
          id="cloud-email"
          type="email"
          aria-label="坚果云邮箱"
          autoComplete="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div>
        <label htmlFor="cloud-password">应用密码</label>
        <input
          id="cloud-password"
          type="password"
          aria-label="坚果云应用密码"
          autoComplete="new-password"
          value={password}
          placeholder={savedPassword ? "已保存，留空则沿用" : ""}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <div>
        <label htmlFor="cloud-folder">远程目录</label>
        <input
          id="cloud-folder"
          type="text"
          aria-label="坚果云远程目录"
          value={folder}
          onChange={(event) => setFolder(event.target.value)}
        />
      </div>
      <div className="login-create-actions">
        <button type="submit" className="login-ghost" disabled={busy}>
          保存账号
        </button>
        <button
          type="button"
          className="login-ghost"
          disabled={busy}
          onClick={() => {
            const next = account();
            setBusy(true);
            setMessage("");
            const written = saveSyncAccount(next);
            if (!written.ok) {
              setBusy(false);
              setMessage(written.message);
              return;
            }
            setSavedPassword(next.password);
            setPassword("");
            void refreshUsers(next).then(() => setBusy(false));
          }}
        >
          查看用户
        </button>
        <button
          type="button"
          className="login-primary"
          disabled={busy}
          onClick={() => {
            const next = account();
            setBusy(true);
            setMessage("");
            const written = saveSyncAccount(next);
            if (!written.ok) {
              setBusy(false);
              setMessage(written.message);
              return;
            }
            setSavedPassword(next.password);
            setPassword("");
            void testNutstore(next).then((result) => {
              if (!result.ok) {
                setBusy(false);
                setMessage(result.message);
                return;
              }
              setMessage("已连通，验证文件已写入远程目录。");
              void refreshUsers(next).then(() => setBusy(false));
            });
          }}
        >
          测试连接
        </button>
      </div>
      {message ? (
        <p className="login-status-line" role="status">
          {message}
        </p>
      ) : null}
    </form>
  );
}
