import { useEffect, useState } from "react";
import { DEFAULT_SYNC_FOLDER, syncFolderPath, type SyncAccountFields } from "../domain/nutstore";
import { listNutstoreUsers, testNutstore } from "../storage/nutstoreClient";
import { loadSyncAccount, saveSyncAccount } from "../storage/syncAccount";

export function LoginCloudPanel({ libraryKey }: { libraryKey: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [folder, setFolder] = useState(DEFAULT_SYNC_FOLDER);
  const [savedPassword, setSavedPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [users, setUsers] = useState<string[] | null>(null);
  const [userNote, setUserNote] = useState("");

  async function refreshUsers(next: SyncAccountFields): Promise<void> {
    setUserNote("");
    const result = await listNutstoreUsers(next);
    if (!result.ok) {
      setUsers(null);
      setUserNote(result.message);
      return;
    }
    setUsers(result.users);
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
        用坚果云邮箱和应用密码。应用密码在坚果云的安全选项里生成，不是登录密码。账号写在当前用户库，不进任何工作区。下面列出这个远程目录里的用户。回到读取本地后，可以分别打开每个用户的上传。
      </p>
      <section aria-label="坚果云路径下的用户">
        <h3>{(syncFolderPath(folder) ?? folder.trim()) || DEFAULT_SYNC_FOLDER} 下的用户</h3>
        {users && users.length > 0 ? (
          <ul className="login-cloud-users">
            {users.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        ) : (
          <p role="status">{userNote || (savedPassword ? "正在读取远程用户…" : "保存账号后，这里会列出这个目录下的用户。")}</p>
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
