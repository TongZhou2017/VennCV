import { useEffect, useState } from "react";
import { createUserInConfig, useAppStore } from "../store/appStore";

export function LoginScreen() {
  const initAuth = useAppStore((s) => s.initAuth);
  const availableUsers = useAppStore((s) => s.availableUsers);
  const loginUsername = useAppStore((s) => s.loginUsername);
  const loginPassword = useAppStore((s) => s.loginPassword);
  const loginError = useAppStore((s) => s.loginError);
  const setLoginUsername = useAppStore((s) => s.setLoginUsername);
  const setLoginPassword = useAppStore((s) => s.setLoginPassword);
  const submitLogin = useAppStore((s) => s.submitLogin);

  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState("");
  const [newPass, setNewPass] = useState("");
  const [createErr, setCreateErr] = useState("");

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  return (
    <div
      style={{
        minHeight: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f3f3f3",
      }}
    >
      <div
        style={{
          width: 400,
          padding: 32,
          background: "#fff",
          borderRadius: 8,
          boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
        }}
      >
        <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>VennCV</h1>
        <p style={{ margin: "0 0 24px", color: "#666", fontSize: 13 }}>科研项目管理系统（Web）</p>

        <label style={{ display: "block", marginBottom: 8, fontSize: 12, color: "#666" }}>用户</label>
        <select
          value={availableUsers.includes(loginUsername) ? loginUsername : ""}
          onChange={(e) => setLoginUsername(e.target.value)}
          style={{ width: "100%", padding: "8px 10px", marginBottom: 16 }}
        >
          <option value="">请选择用户</option>
          {availableUsers.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>

        <label style={{ display: "block", marginBottom: 8, fontSize: 12, color: "#666" }}>密码</label>
        <input
          type="password"
          value={loginPassword}
          onChange={(e) => setLoginPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitLogin()}
          style={{ width: "100%", padding: "8px 10px", marginBottom: 16 }}
        />

        {loginError ? (
          <p style={{ color: "#c00", fontSize: 12, margin: "0 0 12px" }}>{loginError}</p>
        ) : null}

        <button
          type="button"
          onClick={() => submitLogin()}
          style={{
            width: "100%",
            padding: "10px",
            background: "#007acc",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            marginBottom: 12,
          }}
        >
          登录
        </button>

        <button
          type="button"
          onClick={() => {
            setShowCreate(!showCreate);
            setCreateErr("");
          }}
          style={{
            width: "100%",
            padding: "8px",
            background: "transparent",
            border: "1px solid #ccc",
            borderRadius: 4,
          }}
        >
          {showCreate ? "取消创建" : "创建新用户"}
        </button>

        {showCreate ? (
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid #eee" }}>
            <label style={{ display: "block", marginBottom: 8, fontSize: 12 }}>新用户名</label>
            <input
              value={newUser}
              onChange={(e) => setNewUser(e.target.value)}
              style={{ width: "100%", padding: 8, marginBottom: 12 }}
            />
            <label style={{ display: "block", marginBottom: 8, fontSize: 12 }}>新密码</label>
            <input
              type="password"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              style={{ width: "100%", padding: 8, marginBottom: 12 }}
            />
            {createErr ? <p style={{ color: "#c00", fontSize: 12 }}>{createErr}</p> : null}
            <button
              type="button"
              onClick={() => {
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
              style={{
                width: "100%",
                padding: "8px",
                background: "#f8f8f8",
                border: "1px solid #ccc",
                borderRadius: 4,
              }}
            >
              确认创建
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
