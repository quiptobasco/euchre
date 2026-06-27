import { useState, useEffect } from "react";
import { auth } from "./firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import Login from "./components/Login";
import LobbyList from "./components/LobbyList";
import GameBoard from "./components/GameBoard";
import { RefreshCw } from "lucide-react";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-100 font-sans" id="loading-app-spinner">
        <div className="text-center space-y-2">
          <RefreshCw className="h-8 w-8 animate-spin text-indigo-400 mx-auto" />
          <p className="text-xs text-slate-400">Loading Euchre Card Room...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (selectedGameId) {
    return (
      <GameBoard 
        gameId={selectedGameId} 
        onLeaveGame={() => setSelectedGameId(null)} 
      />
    );
  }

  return <LobbyList onSelectGame={setSelectedGameId} />;
}

