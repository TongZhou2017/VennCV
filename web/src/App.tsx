import { useAppStore } from "./store/appStore";
import { LoginScreen } from "./components/LoginScreen";
import { MainShell } from "./components/MainShell";

export default function App() {
  const isLoggedIn = useAppStore((s) => s.isLoggedIn);
  return (
    <div style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
      {isLoggedIn ? <MainShell /> : <LoginScreen />}
    </div>
  );
}
