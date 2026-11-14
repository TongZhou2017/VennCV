import { useEffect, useState } from "react";
import { useAppStore } from "./store/appStore";
import { LoginScreen } from "./components/LoginScreen";
import { MainShell } from "./components/MainShell";
import { LabHomePage } from "./components/LabHome";
import { labSlugFromPath } from "./domain/labHome";
import { claimLabTabHandoff } from "./storage/labTabSession";

export default function App() {
  const isLoggedIn = useAppStore((s) => s.isLoggedIn);
  const enterKnownSession = useAppStore((s) => s.enterKnownSession);
  const labSlug = labSlugFromPath(window.location.pathname);
  const [handoffUser] = useState(() =>
    labSlug ? claimLabTabHandoff(localStorage, sessionStorage) : null,
  );
  const [handoffDone, setHandoffDone] = useState(!handoffUser);
  useEffect(() => {
    if (!handoffUser) return;
    enterKnownSession(handoffUser);
    setHandoffDone(true);
  }, [handoffUser, enterKnownSession]);
  if (handoffUser && !handoffDone) {
    return <div style={{ height: "100%", minHeight: 0 }} />;
  }
  return (
    <div style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
      {isLoggedIn ? labSlug ? <LabHomePage slug={labSlug} /> : <MainShell /> : <LoginScreen />}
    </div>
  );
}
