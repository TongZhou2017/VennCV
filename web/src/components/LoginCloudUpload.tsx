import { useState } from "react";
import {
  cloudSyncSummary,
  cloudUploadEnabled,
  setCloudUploadEnabled,
  syncUserNow,
} from "../storage/userCloud";

export function LoginCloudUpload({ username }: { username: string }) {
  const [enabled, setEnabled] = useState(() => cloudUploadEnabled(username));
  const [note, setNote] = useState(() => cloudSyncSummary(username));
  const [busy, setBusy] = useState(false);

  async function run(nextEnabled: boolean): Promise<void> {
    const written = setCloudUploadEnabled(username, nextEnabled);
    if (!written.ok) {
      setNote(written.message);
      return;
    }
    setEnabled(nextEnabled);
    if (!nextEnabled) {
      setNote("已停止上传。云端已有的文件还留着。");
      return;
    }
    setBusy(true);
    setNote("同步中");
    const result = await syncUserNow(username);
    setBusy(false);
    setNote(result.message);
  }

  return (
    <>
      <button
        type="button"
        className="login-cloud-toggle"
        aria-pressed={enabled}
        aria-label={enabled ? `${username} 云同步已开启` : `${username} 开启云同步`}
        disabled={busy}
        onClick={() => void run(!enabled)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M7.2 18.5h9.7a4.2 4.2 0 0 0 .5-8.4 5.6 5.6 0 0 0-10.8-1.5 3.6 3.6 0 0 0 .6 9.9z"
          />
        </svg>
      </button>
      {enabled || note ? (
        <div className="login-upload">
          {enabled ? (
            <button type="button" className="login-ghost" disabled={busy} onClick={() => void run(true)}>
              立即同步
            </button>
          ) : null}
          {note ? <p role="status">{note}</p> : null}
        </div>
      ) : null}
    </>
  );
}
