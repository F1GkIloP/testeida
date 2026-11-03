import { useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { isConfigured } from "./lib/config";
import { AuthScreen } from "./pages/AuthScreen";
import { Messenger } from "./pages/Messenger";
import { Setup } from "./pages/Setup";

function Gate() {
  const { session, profile, loading } = useAuth();
  if (loading) {
    return (
      <div className="empty">
        <div className="logo">
          <div className="moon" />
          Lunar
        </div>
      </div>
    );
  }
  if (!session || !profile) return <AuthScreen />;
  return <Messenger />;
}

export default function App() {
  const [ready, setReady] = useState(isConfigured());
  if (!ready) return <Setup onDone={() => setReady(true)} />;
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
