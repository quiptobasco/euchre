import React, { useState, useEffect } from "react";
import { db, auth } from "../firebase";
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  query, 
  orderBy, 
  deleteDoc, 
  doc 
} from "firebase/firestore";
import { LobbyGame } from "../types";
import { createInitialGameState } from "../euchreEngine";
import { Plus, Users, Play, LogOut, ChevronRight, User, Trash2 } from "lucide-react";
import { handleFirestoreError, OperationType } from "../utils/firestoreError";

interface LobbyListProps {
  onSelectGame: (gameId: string) => void;
}

export default function LobbyList({ onSelectGame }: LobbyListProps) {
  const [games, setGames] = useState<LobbyGame[]>([]);
  const [newGameName, setNewGameName] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const currentUser = auth.currentUser;

  useEffect(() => {
    const q = query(collection(db, "games"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const activeGames: LobbyGame[] = [];
      snapshot.forEach((doc) => {
        activeGames.push({ id: doc.id, ...doc.data() } as LobbyGame);
      });
      setGames(activeGames);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, "games");
    });

    return unsubscribe;
  }, []);

  const handleCreateGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !newGameName.trim()) return;

    setCreating(true);
    try {
      const initialGameData = {
        name: newGameName.trim(),
        creatorId: currentUser.uid,
        creatorName: currentUser.displayName || "Anonymous",
        status: "lobby",
        createdAt: Date.now(),
        // Creator sits at seat 0
        seats: [
          { id: currentUser.uid, name: currentUser.displayName || "Player 1", isAi: false },
          null,
          null,
          null
        ],
        aiSeats: [],
        gameState: createInitialGameState()
      };

      const docRef = await addDoc(collection(db, "games"), initialGameData);
      setNewGameName("");
      onSelectGame(docRef.id);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "games");
    } finally {
      setCreating(false);
    }
  };

  const handleLogout = () => {
    auth.signOut();
  };

  const handleDeleteGame = async (gameId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid triggering card click/select
    if (window.confirm("Are you sure you want to close this table?")) {
      try {
        await deleteDoc(doc(db, "games", gameId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `games/${gameId}`);
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans" id="lobby-container">
      {/* Top Navbar */}
      <nav className="border-b border-slate-800 bg-slate-900 px-6 py-4 shadow-lg" id="lobby-navbar">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 shadow-inner shadow-black/40">
              <span className="font-sans text-xl font-bold text-white">E</span>
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-white">Euchre<span className="text-indigo-400">Pro</span></h1>
              <p className="text-[10px] font-mono uppercase tracking-widest text-slate-500">MULTIPLAYER CLUB</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 rounded-full bg-slate-800 py-1.5 px-3 border border-slate-700 text-xs text-slate-200">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              <span>{currentUser?.displayName || "Euchre Player"}</span>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-400 transition-all hover:bg-red-950/40 hover:text-red-400 hover:border-red-900/60"
              id="logout-btn"
            >
              <LogOut className="h-3.5 w-3.5" /> Log Out
            </button>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 py-8 md:px-6">
        <div className="grid gap-8 md:grid-cols-3">
          {/* Left: Create Table Card */}
          <div className="space-y-6 md:col-span-1">
            <div className="rounded-2xl border-2 border-slate-800 bg-slate-900/50 p-6 shadow-xl" id="create-table-card">
              <h2 className="text-lg font-bold tracking-tight text-white mb-2">Create a Card Table</h2>
              <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                Start a new lobby. Up to 4 human players can join, or fill empty spots with advanced AI bots!
              </p>

              <form onSubmit={handleCreateGame} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400 tracking-wider">TABLE NAME</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Friday Night Euchre"
                    value={newGameName}
                    onChange={(e) => setNewGameName(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    id="table-name-input"
                  />
                </div>

                <button
                  type="submit"
                  disabled={creating || !newGameName.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white transition-all hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-600/10 disabled:opacity-50 active:scale-[0.98]"
                  id="create-game-btn"
                >
                  <Plus className="h-4 w-4" /> {creating ? "Creating..." : "Create Table"}
                </button>
              </form>
            </div>

            {/* Euchre Rules Cheat Sheet */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/20 p-5 text-xs text-slate-400 space-y-3">
              <h3 className="font-bold text-indigo-400 uppercase tracking-wider text-[10px]">Euchre Quick Rules</h3>
              <ul className="list-disc list-inside space-y-1.5 leading-relaxed">
                <li>Played with 24 cards (9 through Ace of each suit).</li>
                <li>4 players, split into two competing teams of 2.</li>
                <li>First team to reach <strong className="text-slate-200">10 points</strong> wins the match.</li>
                <li>Right Bower (trump Jack) is the highest card.</li>
                <li>Left Bower (same color Jack) is the 2nd highest.</li>
                <li>Makers must win 3+ tricks to score; else "Euchred"!</li>
              </ul>
            </div>
          </div>

          {/* Right: Active Tables */}
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Active Tables <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400 font-normal">{games.length}</span>
              </h2>
            </div>

            {loading ? (
              <div className="flex h-48 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/50" id="loading-tables-spinner">
                <div className="text-center space-y-2">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent mx-auto"></div>
                  <p className="text-xs text-slate-400">Polishing the card tables...</p>
                </div>
              </div>
            ) : games.length === 0 ? (
              <div className="flex flex-col h-64 items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 text-center p-6" id="no-tables-placeholder">
                <Users className="h-10 w-10 text-slate-600 mb-3" />
                <p className="text-sm font-semibold text-slate-300">No active tables right now</p>
                <p className="text-xs text-slate-500 max-w-sm mt-1 leading-relaxed">
                  Be the first to create a table and invite friends, or test your skills against the bots!
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2" id="lobby-games-grid">
                {games.map((game) => {
                  const playerCount = game.seats.filter(Boolean).length;
                  const canJoin = playerCount < 4 && game.status === "lobby";
                  
                  return (
                    <div
                      key={game.id}
                      onClick={() => onSelectGame(game.id)}
                      className="group cursor-pointer rounded-2xl border-2 border-slate-800 bg-slate-900/50 p-5 shadow-lg transition-all hover:border-indigo-500/45 hover:-translate-y-0.5 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="font-bold text-slate-100 group-hover:text-indigo-400 transition-colors line-clamp-1">
                            {game.name}
                          </h3>
                          <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase border ${
                            game.status === "lobby" 
                              ? "bg-indigo-950/60 text-indigo-400 border-indigo-900/40" 
                              : "bg-amber-950/60 text-amber-400 border-amber-900/40"
                          }`}>
                            {game.status === "lobby" ? "Open" : "In Progress"}
                          </span>
                        </div>

                        <p className="text-[11px] text-slate-500">
                          Host: <span className="text-slate-300 font-medium">{game.creatorName}</span>
                        </p>

                        {/* Players layout list */}
                        <div className="mt-4 flex flex-wrap gap-1.5">
                          {game.seats.map((player, sIdx) => (
                            <div 
                              key={sIdx} 
                              className={`rounded-md px-2 py-0.5 text-[10px] font-medium border ${
                                player 
                                  ? player.isAi 
                                    ? "bg-slate-950 text-slate-500 border-slate-800"
                                    : "bg-indigo-950/30 text-indigo-300 border-indigo-900/30"
                                  : "bg-slate-950/10 text-slate-600 border-dashed border-slate-850"
                              }`}
                            >
                              Seat {sIdx + 1}: {player ? player.name : "Empty"}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="mt-5 border-t border-slate-800/60 pt-4 flex items-center justify-between">
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Users className="h-3.5 w-3.5 text-slate-500" />
                          <span>{playerCount} / 4 players</span>
                        </span>

                        <div className="flex items-center gap-2">
                          {game.creatorId === currentUser?.uid && (
                            <button
                              onClick={(e) => handleDeleteGame(game.id, e)}
                              className="rounded p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-950/40 transition-colors"
                              title="Close Table"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <div className="flex h-7 items-center justify-center rounded-lg bg-indigo-950 text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white px-3 py-1 text-xs font-semibold transition-all border border-indigo-900/50">
                            {canJoin ? "Join" : "Watch"} <ChevronRight className="ml-1 h-3 w-3" />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
