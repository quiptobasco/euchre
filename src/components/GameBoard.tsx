import { useState, useEffect, useMemo, useRef } from "react";
import { db, auth } from "../firebase";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { handleFirestoreError, OperationType } from "../utils/firestoreError";
import { LobbyGame, GameState, Card, Suit, GamePlayer, Trick } from "../types";
import { 
  getCardSuit, 
  getCardName, 
  getCardPower, 
  isCardPlayable, 
  getTrickWinner, 
  startNewHand, 
  createInitialGameState,
  getAiBidding1Decision,
  getAiBidding2Decision,
  getAiDiscardDecision,
  getAiPlayDecision,
  sortHand,
  getPartnerSeat,
  getTeamOfSeat
} from "../euchreEngine";
import { 
  Crown, ArrowLeft, Play, ArrowRight, Shield, RefreshCw, Volume2, Info, CheckCircle2, AlertCircle
} from "lucide-react";
import LobbyChat from "./LobbyChat";

async function updateGameDoc(gameId: string, data: any) {
  try {
    await updateDoc(doc(db, "games", gameId), data);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `games/${gameId}`);
  }
}

interface GameBoardProps {
  gameId: string;
  onLeaveGame: () => void;
}

export default function GameBoard({ gameId, onLeaveGame }: GameBoardProps) {
  const [game, setGame] = useState<LobbyGame | null>(null);
  const [loading, setLoading] = useState(true);
  const [goingAlone, setGoingAlone] = useState(false);
  const [showSummary, setShowSummary] = useState(true);
  
  const currentUser = auth.currentUser;
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Subscribe to the game document
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "games", gameId), (docSnap) => {
      if (docSnap.exists()) {
        setGame({ id: docSnap.id, ...docSnap.data() } as LobbyGame);
      } else {
        onLeaveGame();
      }
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `games/${gameId}`);
    });

    return unsubscribe;
  }, [gameId, onLeaveGame]);

  // Scroll game logs to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [game?.gameState?.logs]);

  // Find current user's seat index (-1 if spectating)
  const mySeatIndex = useMemo(() => {
    if (!game || !currentUser) return -1;
    return game.seats.findIndex(p => p?.id === currentUser.uid);
  }, [game, currentUser]);

  // Only the first active human player in the table handles AI turns
  const isAiOperator = useMemo(() => {
    if (!game || !currentUser) return false;
    
    // List all seat indices occupied by active human players
    const humanSeats = game.seats
      .map((p, idx) => (p && !p.isAi ? idx : -1))
      .filter(idx => idx !== -1);
    
    if (humanSeats.length === 0) return false;
    
    // If I am the human player with the smallest seat index, I'm the AI Operator
    return mySeatIndex === humanSeats[0];
  }, [game, mySeatIndex, currentUser]);

  // Trigger AI turns when it's an AI's turn
  useEffect(() => {
    if (!game || !isAiOperator) return;
    if (game.status === "lobby" || game.status === "finished") return;

    const { gameState, status } = game;
    const currentTurn = gameState.turnIndex;
    const activePlayer = game.seats[currentTurn];

    // If active player is null or marked as AI, trigger AI decision
    if (!activePlayer || activePlayer.isAi) {
      const timeoutId = setTimeout(async () => {
        // Fetch fresh copy inside timeout or rely on current state closure
        await runAiTurn(currentTurn);
      }, 1500); // 1.5 second delay makes the game feel highly natural

      return () => clearTimeout(timeoutId);
    }
  }, [game, isAiOperator]);

  // Run AI actions
  const runAiTurn = async (aiSeatIndex: number) => {
    if (!game) return;
    const state = { ...game.gameState };
    const logs = [...state.logs];
    let nextStatus = game.status;
    let nextTurn = state.turnIndex;

    const aiHand = state.hands[aiSeatIndex] || [];
    const aiPlayerName = game.seats[aiSeatIndex]?.name || `AI ${aiSeatIndex + 1}`;

    if (game.status === "bidding_1") {
      const decision = getAiBidding1Decision(aiSeatIndex, aiHand, state.upCard!, state.dealerIndex);
      if (decision.action === "order_up") {
        state.trumpSuit = state.upCard!.slice(-1) as Suit;
        state.makerSeat = aiSeatIndex;
        state.isAlone = decision.alone;
        nextStatus = "discarding";
        nextTurn = state.dealerIndex; // Dealer must discard

        logs.push(`[Bid] ${aiPlayerName} ordered up the ${state.upCard!.slice(0, -1)}${getSuitSymbol(state.upCard!.slice(-1) as Suit)}! ${decision.alone ? "🔥 They are going ALONE!" : ""}`);
      } else {
        logs.push(`[Bid] ${aiPlayerName} passed.`);
        if (aiSeatIndex === state.dealerIndex) {
          // All passed on first round
          nextStatus = "bidding_2";
          nextTurn = (state.dealerIndex + 1) % 4;
          logs.push(`All players passed on the upcard. Trump suit naming begins!`);
        } else {
          nextTurn = (aiSeatIndex + 1) % 4;
        }
      }
    } else if (game.status === "bidding_2") {
      const decision = getAiBidding2Decision(aiSeatIndex, aiHand, state.upCard!, state.dealerIndex);
      if (decision.action === "declare") {
        state.trumpSuit = decision.suit;
        state.makerSeat = aiSeatIndex;
        state.isAlone = decision.alone;
        nextStatus = "playing";
        
        // Dealer's left leads the first trick
        let firstLead = (state.dealerIndex + 1) % 4;
        if (decision.alone && firstLead === getPartnerSeat(aiSeatIndex)) {
          // Skip partner if they went alone
          firstLead = (state.dealerIndex + 2) % 4;
        }
        nextTurn = firstLead;

        // Initialize current trick
        state.currentTrick = {
          cards: {},
          leadSeat: firstLead,
          winnerSeat: null
        };

        // Sort everyone's hands with the newly selected trump suit!
        for (let i = 0; i < 4; i++) {
          state.hands[i] = sortHand(state.hands[i], state.trumpSuit);
        }

        logs.push(`[Bid] ${aiPlayerName} named ${getSuitName(decision.suit!)} ${getSuitSymbol(decision.suit!)} as trump! ${decision.alone ? "🔥 Going ALONE!" : ""}`);
      } else {
        logs.push(`[Bid] ${aiPlayerName} passed.`);
        if (aiSeatIndex === state.dealerIndex) {
          // Under "Stick the Dealer", the AI dealer is forced to choose, but if they somehow pass, misdeal
          logs.push(`Dealer forced to reshuffle due to misdeal.`);
          state.dealerIndex = (state.dealerIndex + 1) % 4;
          const freshState = startNewHand(state);
          await updateGameDoc(gameId, {
            status: "bidding_1",
            gameState: freshState
          });
          return;
        } else {
          nextTurn = (aiSeatIndex + 1) % 4;
        }
      }
    } else if (game.status === "discarding") {
      // AI Dealer discarding
      const discardCard = getAiDiscardDecision(aiHand, state.upCard!);
      
      // Update dealer's hand
      const finalHand = [...aiHand, state.upCard!].filter(c => c !== discardCard);
      state.hands[aiSeatIndex] = sortHand(finalHand, state.trumpSuit);
      
      nextStatus = "playing";
      let firstLead = (state.dealerIndex + 1) % 4;
      if (state.isAlone && firstLead === getPartnerSeat(state.makerSeat!)) {
        firstLead = (state.dealerIndex + 2) % 4;
      }
      nextTurn = firstLead;

      // Initialize trick
      state.currentTrick = {
        cards: {},
        leadSeat: firstLead,
        winnerSeat: null
      };

      // Sort everyone's hands with selected trump
      for (let i = 0; i < 4; i++) {
        state.hands[i] = sortHand(state.hands[i], state.trumpSuit);
      }

      logs.push(`[Game] Dealer ${aiPlayerName} discarded a card and picked up the upcard.`);
    } else if (game.status === "playing") {
      // AI plays card
      const cardToPlay = getAiPlayDecision(
        aiSeatIndex,
        aiHand,
        state.currentTrick,
        state.trumpSuit,
        state.isAlone,
        state.makerSeat
      );

      await playCardInState(aiSeatIndex, cardToPlay, state, logs);
      return; // playCardInState will handle saving back to DB
    }

    // Save updated state to DB
    await updateGameDoc(gameId, {
      status: nextStatus,
      gameState: {
        ...state,
        turnIndex: nextTurn,
        logs
      }
    });
  };

  // Human sits in an empty seat
  const handleSit = async (seatIndex: number) => {
    if (!game || !currentUser) return;
    
    // Check if player is already sitting in another seat
    const alreadySittingIdx = game.seats.findIndex(p => p?.id === currentUser.uid);

    const updatedSeats = [...game.seats];
    const updatedAiSeats = [...game.aiSeats];

    if (alreadySittingIdx !== -1) {
      // vacate old seat
      updatedSeats[alreadySittingIdx] = null;
    }

    updatedSeats[seatIndex] = {
      id: currentUser.uid,
      name: currentUser.displayName || "Anonymous",
      isAi: false
    };

    // Remove AI if sitting on that seat
    const aiIdx = updatedAiSeats.indexOf(seatIndex);
    if (aiIdx !== -1) {
      updatedAiSeats.splice(aiIdx, 1);
    }

    await updateGameDoc(gameId, {
      seats: updatedSeats,
      aiSeats: updatedAiSeats
    });
  };

  // Add an AI bot to an empty seat
  const handleAddAi = async (seatIndex: number) => {
    if (!game) return;
    
    const botNames = ["Alice AI", "Bob AI", "Charlie AI", "Daisy AI"];
    const name = botNames[seatIndex];

    const updatedSeats = [...game.seats];
    updatedSeats[seatIndex] = {
      id: `ai_${seatIndex}`,
      name,
      isAi: true
    };

    const updatedAiSeats = [...game.aiSeats];
    if (!updatedAiSeats.includes(seatIndex)) {
      updatedAiSeats.push(seatIndex);
    }

    await updateGameDoc(gameId, {
      seats: updatedSeats,
      aiSeats: updatedAiSeats
    });
  };

  // Remove AI bot from seat
  const handleRemoveAi = async (seatIndex: number) => {
    if (!game) return;

    const updatedSeats = [...game.seats];
    updatedSeats[seatIndex] = null;

    const updatedAiSeats = game.aiSeats.filter(s => s !== seatIndex);

    await updateGameDoc(gameId, {
      seats: updatedSeats,
      aiSeats: updatedAiSeats
    });
  };

  // Vacate current seat
  const handleLeaveSeat = async () => {
    if (!game || mySeatIndex === -1) return;

    const updatedSeats = [...game.seats];
    updatedSeats[mySeatIndex] = null;

    await updateGameDoc(gameId, {
      seats: updatedSeats
    });
  };

  // Start the match!
  const handleStartGame = async () => {
    if (!game) return;
    
    // Verify that all 4 seats are full
    const isFull = game.seats.every(p => p !== null);
    if (!isFull) {
      alert("Please fill all 4 seats with human players or AI bots before starting!");
      return;
    }

    // Initialize state
    let state = createInitialGameState();
    state = startNewHand(state);

    await updateGameDoc(gameId, {
      status: "bidding_1",
      gameState: state
    });
  };

  // Human player makes a bid in Phase 1 (Up card)
  const handleBid1 = async (action: "pass" | "order_up") => {
    if (!game || mySeatIndex === -1) return;
    const state = { ...game.gameState };
    const logs = [...state.logs];
    let nextStatus = game.status;
    let nextTurn = state.turnIndex;

    const myName = game.seats[mySeatIndex]!.name;

    if (action === "order_up") {
      state.trumpSuit = state.upCard!.slice(-1) as Suit;
      state.makerSeat = mySeatIndex;
      state.isAlone = goingAlone;
      nextStatus = "discarding";
      nextTurn = state.dealerIndex; // Dealer must discard

      logs.push(`[Bid] ${myName} ordered up the ${state.upCard!.slice(0, -1)}${getSuitSymbol(state.upCard!.slice(-1) as Suit)}! ${goingAlone ? "🔥 They are going ALONE!" : ""}`);
      setGoingAlone(false); // Reset toggle
    } else {
      logs.push(`[Bid] ${myName} passed.`);
      if (mySeatIndex === state.dealerIndex) {
        // Everyone passed, go to Phase 2
        nextStatus = "bidding_2";
        nextTurn = (state.dealerIndex + 1) % 4;
        logs.push(`All players passed on the upcard. Trump suit naming begins!`);
      } else {
        nextTurn = (mySeatIndex + 1) % 4;
      }
    }

    await updateGameDoc(gameId, {
      status: nextStatus,
      gameState: {
        ...state,
        turnIndex: nextTurn,
        logs
      }
    });
  };

  // Human player declares a trump suit in Phase 2
  const handleBid2 = async (suit: Suit | null) => {
    if (!game || mySeatIndex === -1) return;
    const state = { ...game.gameState };
    const logs = [...state.logs];
    let nextStatus = game.status;
    let nextTurn = state.turnIndex;

    const myName = game.seats[mySeatIndex]!.name;

    if (suit) {
      state.trumpSuit = suit;
      state.makerSeat = mySeatIndex;
      state.isAlone = goingAlone;
      nextStatus = "playing";
      
      let firstLead = (state.dealerIndex + 1) % 4;
      if (goingAlone && firstLead === getPartnerSeat(mySeatIndex)) {
        firstLead = (state.dealerIndex + 2) % 4;
      }
      nextTurn = firstLead;

      state.currentTrick = {
        cards: {},
        leadSeat: firstLead,
        winnerSeat: null
      };

      // Sort everyone's hands with selected trump
      for (let i = 0; i < 4; i++) {
        state.hands[i] = sortHand(state.hands[i], state.trumpSuit);
      }

      logs.push(`[Bid] ${myName} declared ${getSuitName(suit)} ${getSuitSymbol(suit)} as trump! ${goingAlone ? "🔥 Going ALONE!" : ""}`);
      setGoingAlone(false); // Reset toggle
    } else {
      logs.push(`[Bid] ${myName} passed.`);
      if (mySeatIndex === state.dealerIndex) {
        // Under Stick the Dealer, they shouldn't pass, but let's handle safety
        logs.push(`Stick the Dealer rule forces Dealer to choose!`);
        return;
      } else {
        nextTurn = (mySeatIndex + 1) % 4;
      }
    }

    await updateGameDoc(gameId, {
      status: nextStatus,
      gameState: {
        ...state,
        turnIndex: nextTurn,
        logs
      }
    });
  };

  // Human dealer discarding a card
  const handleDiscard = async (card: Card) => {
    if (!game || mySeatIndex === -1) return;
    const state = { ...game.gameState };
    const logs = [...state.logs];

    const myHand = state.hands[mySeatIndex];
    // Remove selected card, add upcard
    const finalHand = [...myHand, state.upCard!].filter(c => c !== card);
    state.hands[mySeatIndex] = sortHand(finalHand, state.trumpSuit);

    const nextStatus = "playing";
    let firstLead = (state.dealerIndex + 1) % 4;
    if (state.isAlone && firstLead === getPartnerSeat(state.makerSeat!)) {
      firstLead = (state.dealerIndex + 2) % 4;
    }
    const nextTurn = firstLead;

    state.currentTrick = {
      cards: {},
      leadSeat: firstLead,
      winnerSeat: null
    };

    // Sort everyone's hands
    for (let i = 0; i < 4; i++) {
      state.hands[i] = sortHand(state.hands[i], state.trumpSuit);
    }

    logs.push(`[Game] Dealer ${game.seats[mySeatIndex]!.name} discarded a card and picked up the upcard.`);

    await updateGameDoc(gameId, {
      status: nextStatus,
      gameState: {
        ...state,
        turnIndex: nextTurn,
        logs
      }
    });
  };

  // Human plays card
  const handlePlayCard = async (card: Card) => {
    if (!game || mySeatIndex === -1) return;
    const state = { ...game.gameState };
    const logs = [...state.logs];

    const playable = isCardPlayable(card, state.hands[mySeatIndex], state.currentTrick, state.trumpSuit);
    if (!playable) {
      alert("Illegal move! You must follow the led suit if you have it.");
      return;
    }

    await playCardInState(mySeatIndex, card, state, logs);
  };

  // Play card logic shared by humans and AI
  const playCardInState = async (seatIndex: number, card: Card, state: GameState, logs: string[]) => {
    const playerName = game?.seats[seatIndex]?.name || `Player ${seatIndex + 1}`;
    
    // Remove from hand
    state.hands[seatIndex] = state.hands[seatIndex].filter(c => c !== card);

    // Add to trick
    state.currentTrick!.cards[seatIndex] = card;

    const cardsInTrick = Object.keys(state.currentTrick!.cards).length;
    
    // Calculate expected cards in a complete trick (4 if normal, 3 if going alone)
    const expectedCards = state.isAlone ? 3 : 4;

    if (cardsInTrick < expectedCards) {
      // Trick is still ongoing
      let nextTurn = (seatIndex + 1) % 4;
      // Skip partner if they went alone
      if (state.isAlone && nextTurn === getPartnerSeat(state.makerSeat!)) {
        nextTurn = (nextTurn + 1) % 4;
      }
      state.turnIndex = nextTurn;
      logs.push(`[Game] ${playerName} played ${getCardName(card, state.trumpSuit)}.`);
    } else {
      // Trick is complete! Determine winner
      const winnerSeat = getTrickWinner(state.currentTrick!, state.trumpSuit);
      const winnerName = game?.seats[winnerSeat]?.name || `Player ${winnerSeat + 1}`;

      // Increment scores
      if (getTeamOfSeat(winnerSeat) === 0) {
        state.handScores.team0++;
      } else {
        state.handScores.team1++;
      }

      state.currentTrick!.winnerSeat = winnerSeat;
      state.tricks.push(state.currentTrick!);

      logs.push(`[Game] ${playerName} played ${getCardName(card, state.trumpSuit)}.`);
      logs.push(`🏆 Trick won by ${winnerName} with ${getCardName(state.currentTrick!.cards[winnerSeat], state.trumpSuit)}!`);

      // Next trick starts with the winner
      state.turnIndex = winnerSeat;
      
      // Reset current trick for next round
      state.currentTrick = {
        cards: {},
        leadSeat: winnerSeat,
        winnerSeat: null
      };

      // Check if hand is fully complete (5 tricks)
      if (state.tricks.length === 5) {
        // Evaluate hand scores and award points
        const makerTeam = getTeamOfSeat(state.makerSeat!);
        const makerTricks = makerTeam === 0 ? state.handScores.team0 : state.handScores.team1;
        const defenderTricks = makerTeam === 0 ? state.handScores.team1 : state.handScores.team0;

        let pointsAwarded = 0;
        let pointsWinnerTeam = -1;
        let handSummary = "";

        if (makerTricks >= 3) {
          pointsWinnerTeam = makerTeam;
          if (makerTricks === 5) {
            // Sweep!
            if (state.isAlone) {
              pointsAwarded = 4;
              handSummary = `Team ${makerTeam + 1} swept all 5 tricks ALONE! Awarded 4 points.`;
            } else {
              pointsAwarded = 2;
              handSummary = `Team ${makerTeam + 1} swept all 5 tricks! Awarded 2 points.`;
            }
          } else {
            pointsAwarded = 1;
            handSummary = `Team ${makerTeam + 1} won ${makerTricks} tricks. Awarded 1 point.`;
          }
        } else {
          // Euchred! Defenders win points
          pointsWinnerTeam = makerTeam === 0 ? 1 : 0;
          pointsAwarded = 2;
          handSummary = `Team ${makerTeam + 1} was EUCHRED! Defenders (Team ${pointsWinnerTeam + 1}) get 2 points.`;
        }

        if (pointsWinnerTeam === 0) {
          state.scores.team0 += pointsAwarded;
        } else {
          state.scores.team1 += pointsAwarded;
        }

        state.lastHandSummary = handSummary;
        logs.push(`\n--- Hand Over ---`);
        logs.push(handSummary);
        logs.push(`Overall Score: Team 1: ${state.scores.team0} pts | Team 2: ${state.scores.team1} pts\n`);

        // Check if game is won
        if (state.scores.team0 >= 10 || state.scores.team1 >= 10) {
          state.winnerTeam = state.scores.team0 >= 10 ? 0 : 1;
          logs.push(`🏁 MATCH WON BY TEAM ${state.winnerTeam + 1}!`);
          await updateGameDoc(gameId, {
            status: "finished",
            gameState: state
          });
          return;
        } else {
          // Advance dealer and start fresh hand
          state.dealerIndex = (state.dealerIndex + 1) % 4;
          state = startNewHand(state);
        }
      }
    }

    // Save playing updates back to DB
    await updateGameDoc(gameId, {
      gameState: state
    });
  };

  const handleResetGame = async () => {
    if (!game) return;
    let state = createInitialGameState();
    state = startNewHand(state);

    await updateGameDoc(gameId, {
      status: "bidding_1",
      gameState: state
    });
  };

  // Convert seat indices relative to the local player so they are always at the bottom!
  const getRelativeSeatIndex = (offset: number) => {
    const base = mySeatIndex !== -1 ? mySeatIndex : 0;
    return (base + offset) % 4;
  };

  if (loading || !game) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-100 font-sans">
        <div className="text-center space-y-2">
          <RefreshCw className="h-8 w-8 animate-spin text-emerald-400 mx-auto" />
          <p className="text-xs text-slate-400">Loading game room...</p>
        </div>
      </div>
    );
  }

  const { gameState, status } = game;
  const currentTrick = gameState?.currentTrick;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col justify-between" id="game-room-container">
      {/* Top Bar / Header */}
      <header className="h-16 bg-slate-900 border-b border-slate-700 flex items-center justify-between px-6 shrink-0 shadow-lg" id="game-room-header">
        <div className="flex items-center space-x-4">
          <button
            onClick={onLeaveGame}
            className="rounded-lg p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white transition-all border border-slate-700/50"
            id="back-to-lobby-btn"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-white shadow-inner shadow-black/40">E</div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-white line-clamp-1">{game.name}</h1>
              <p className="text-[9px] font-mono uppercase tracking-wider text-slate-500">
                {status === "lobby" ? "Lobby Room" : "Active Room"}
              </p>
            </div>
          </div>
        </div>

        {/* Dynamic Scoreboard */}
        {status !== "lobby" ? (
          <div className="flex items-center space-x-6" id="scoreboard">
            <div className="flex space-x-6 text-sm uppercase tracking-widest font-semibold">
              <div className="flex flex-col items-center">
                <span className="text-slate-400 text-[11px]">North / South</span>
                <span className="text-indigo-400 font-extrabold font-mono text-sm tracking-wide">Score: {gameState.scores.team0.toString().padStart(2, '0')}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-slate-400 text-[11px]">East / West</span>
                <span className="text-rose-400 font-extrabold font-mono text-sm tracking-wide">Score: {gameState.scores.team1.toString().padStart(2, '0')}</span>
              </div>
            </div>
            <div className="h-8 w-[1px] bg-slate-700 hidden sm:block"></div>
            <div className="hidden sm:flex items-center space-x-2 bg-slate-800 py-1.5 px-3 rounded-full border border-slate-700 shadow-sm">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              <span className="text-[10px] font-medium text-slate-300">User: {currentUser?.displayName || "Player"}</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center space-x-2 bg-slate-800 py-1.5 px-3 rounded-full border border-slate-700 shadow-sm">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
            <span className="text-[10px] font-medium text-slate-300">User: {currentUser?.displayName || "Player"}</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          {mySeatIndex === -1 ? (
            <span className="rounded bg-amber-950/60 text-amber-400 text-[10px] px-2 py-0.5 border border-amber-900/40 font-mono">
              SPECTATING
            </span>
          ) : (
            <span className="rounded bg-indigo-950/60 text-indigo-400 text-[10px] px-2 py-0.5 border border-indigo-900/40 font-mono font-bold">
              SEAT {mySeatIndex + 1}
            </span>
          )}
        </div>
      </header>

      {/* Main Table + Chat Split */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 p-4 gap-4 overflow-hidden" id="game-split-grid">
        
        {/* Play Felt Area (Grid spans 3 columns on big screens) */}
        <div className="lg:col-span-3 flex flex-col justify-between items-center relative rounded-2xl bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-900 border-2 border-slate-800 p-4 sm:p-6 lg:p-8 overflow-hidden min-h-[500px] sm:min-h-[600px] lg:min-h-[660px]" id="game-felt-area">
          
          {/* Subtle felt texture background overlay */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.02)_0%,transparent_75%)] pointer-events-none" />

          {status === "lobby" ? (
            /* ==========================================
               LOBBY SCREEN (Seat Selection & Start)
               ========================================== */
            <div className="flex-1 flex flex-col justify-center items-center w-full max-w-xl space-y-8" id="lobby-config-panel">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold text-white tracking-tight">Join your seats at the table</h2>
                <p className="text-sm text-slate-400">Team 1 is Seats 1 & 3 (North/South). Team 2 is Seats 2 & 4 (East/West).</p>
              </div>

              <div className="grid grid-cols-2 gap-4 w-full" id="seats-grid">
                {[0, 1, 2, 3].map((sIdx) => {
                  const player = game.seats[sIdx];
                  const teamNum = getTeamOfSeat(sIdx) + 1;
                  return (
                    <div 
                      key={sIdx} 
                      className={`rounded-xl border-2 p-4 flex flex-col justify-between h-38 transition-all ${
                        player 
                          ? player.isAi 
                            ? "bg-slate-900/50 border-slate-800 text-slate-400"
                            : "bg-indigo-950/20 border-indigo-800/40 text-indigo-300"
                          : "bg-slate-950/40 border-slate-800 border-dashed hover:border-slate-700 hover:bg-slate-950/60"
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-mono text-xs text-slate-500">SEAT {sIdx + 1} (Team {teamNum})</span>
                        {player && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                            player.isAi 
                              ? "bg-slate-800 border-slate-700 text-slate-400" 
                              : "bg-indigo-900/50 border-indigo-700/50 text-indigo-300"
                          }`}>
                            {player.isAi ? "BOT" : "HUMAN"}
                          </span>
                        )}
                      </div>

                      <div className="my-2">
                        {player ? (
                          <p className="font-bold text-base text-slate-200 truncate">{player.name}</p>
                        ) : (
                          <p className="text-sm text-slate-600 font-light italic">Empty Spot</p>
                        )}
                      </div>

                      <div className="flex gap-2">
                        {!player ? (
                          <>
                            <button
                              onClick={() => handleSit(sIdx)}
                              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-sm py-1.5 font-semibold transition-all shadow-md shadow-indigo-600/10 active:scale-95"
                            >
                              Sit
                            </button>
                            {game.creatorId === currentUser?.uid && (
                              <button
                                onClick={() => handleAddAi(sIdx)}
                                className="bg-slate-850 hover:bg-slate-800 text-slate-300 rounded text-sm px-3 py-1.5 font-semibold border border-slate-800 transition-colors"
                              >
                                + Bot
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            {player.id === currentUser?.uid && (
                              <button
                                onClick={handleLeaveSeat}
                                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm py-1.5 transition-colors"
                              >
                                Leave
                              </button>
                            )}
                            {game.creatorId === currentUser?.uid && player.isAi && (
                              <button
                                onClick={() => handleRemoveAi(sIdx)}
                                className="flex-1 bg-red-950/60 border border-red-900/40 hover:bg-red-900/50 text-red-300 rounded text-sm py-1.5 transition-colors"
                              >
                                Remove Bot
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {game.creatorId === currentUser?.uid ? (
                <button
                  onClick={handleStartGame}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-base px-10 py-4 rounded-xl shadow-lg shadow-indigo-600/20 transition-all hover:-translate-y-0.5 active:translate-y-0"
                  id="start-match-btn"
                >
                  <Play className="h-5 w-5" /> Start Match
                </button>
              ) : (
                <div className="text-center rounded-lg bg-slate-950 border border-slate-850 px-8 py-5">
                  <p className="text-sm text-slate-400">
                    Waiting for the host (<strong className="text-slate-300">{game.creatorName}</strong>) to launch the table...
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* ==========================================
               ACTIVE PLAY FELT BOARD
               ========================================== */
            <div className="flex-1 w-full flex flex-col justify-between items-center relative" id="active-euchre-felt">
              
              {/* TOP PLAYER (Partner: Relative Offset 2) */}
              <div className="absolute top-1 sm:top-2 flex flex-col items-center" id="seat-north">
                <PlayerAvatar 
                  player={game.seats[getRelativeSeatIndex(2)]} 
                  seatNum={getRelativeSeatIndex(2)}
                  isTurn={gameState.turnIndex === getRelativeSeatIndex(2)}
                  isDealer={gameState.dealerIndex === getRelativeSeatIndex(2)}
                  cardsLeft={gameState.hands[getRelativeSeatIndex(2)]?.length}
                  isSkipped={gameState.isAlone && getRelativeSeatIndex(2) === getPartnerSeat(gameState.makerSeat!)}
                />
              </div>

              {/* LEFT PLAYER (West: Relative Offset 1) */}
              <div className="absolute left-1 sm:left-2 top-1/2 -translate-y-1/2 flex flex-col items-center" id="seat-west">
                <PlayerAvatar 
                  player={game.seats[getRelativeSeatIndex(1)]} 
                  seatNum={getRelativeSeatIndex(1)}
                  isTurn={gameState.turnIndex === getRelativeSeatIndex(1)}
                  isDealer={gameState.dealerIndex === getRelativeSeatIndex(1)}
                  cardsLeft={gameState.hands[getRelativeSeatIndex(1)]?.length}
                  isSkipped={gameState.isAlone && getRelativeSeatIndex(1) === getPartnerSeat(gameState.makerSeat!)}
                />
              </div>

              {/* RIGHT PLAYER (East: Relative Offset 3) */}
              <div className="absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 flex flex-col items-center" id="seat-east">
                <PlayerAvatar 
                  player={game.seats[getRelativeSeatIndex(3)]} 
                  seatNum={getRelativeSeatIndex(3)}
                  isTurn={gameState.turnIndex === getRelativeSeatIndex(3)}
                  isDealer={gameState.dealerIndex === getRelativeSeatIndex(3)}
                  cardsLeft={gameState.hands[getRelativeSeatIndex(3)]?.length}
                  isSkipped={gameState.isAlone && getRelativeSeatIndex(3) === getPartnerSeat(gameState.makerSeat!)}
                />
              </div>

              {/* CENTER CARD FELT PILE */}
              <div className="flex-1 flex items-center justify-center relative w-full h-full my-6 sm:my-12" id="center-felt-pile">
                {/* Visual Trump Suit Card overlay helper */}
                {gameState.trumpSuit && (
                  <div className="absolute top-2 left-2 bg-slate-950/80 border border-slate-800 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs text-slate-300 font-semibold shadow-sm" id="trump-indicator">
                    <span className="text-[9px] font-mono text-slate-500 uppercase">Trump:</span>
                    <span className={getSuitColor(gameState.trumpSuit)}>
                      {getSuitName(gameState.trumpSuit)} {getSuitSymbol(gameState.trumpSuit)}
                    </span>
                  </div>
                )}

                {/* Hands tricks scored in current hand overlay */}
                <div className="absolute top-2 right-2 bg-slate-950/80 border border-slate-800 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 flex items-center gap-1 sm:gap-2 text-[10px] sm:text-xs font-semibold shadow-md" id="tricks-won-box">
                  <span className="text-[9px] font-mono text-slate-500 uppercase">Tricks:</span>
                  <span className="text-indigo-400">T1: {gameState.handScores.team0}/5</span>
                  <span className="text-slate-600">|</span>
                  <span className="text-rose-400">T2: {gameState.handScores.team1}/5</span>
                </div>

                {/* Render cards in active Trick center pile */}
                {status === "playing" && currentTrick && (
                  <div className="relative h-44 w-44 sm:h-52 sm:w-52 bg-slate-950/30 rounded-full border border-slate-800/60 flex items-center justify-center shadow-inner" id="active-trick-felt-pile">
                    {/* South (Bottom) */}
                    {currentTrick.cards[getRelativeSeatIndex(0)] && (
                      <div className="absolute bottom-1 sm:bottom-2 scale-85 sm:scale-100 transition-all duration-300" id="card-played-south">
                        <CardView card={currentTrick.cards[getRelativeSeatIndex(0)]} trumpSuit={gameState.trumpSuit} />
                      </div>
                    )}
                    {/* West (Left) */}
                    {currentTrick.cards[getRelativeSeatIndex(1)] && (
                      <div className="absolute left-1 sm:left-2 rotate-90 scale-85 sm:scale-100 transition-all duration-300" id="card-played-west">
                        <CardView card={currentTrick.cards[getRelativeSeatIndex(1)]} trumpSuit={gameState.trumpSuit} />
                      </div>
                    )}
                    {/* North (Top) */}
                    {currentTrick.cards[getRelativeSeatIndex(2)] && (
                      <div className="absolute top-1 sm:top-2 scale-85 sm:scale-100 transition-all duration-300" id="card-played-north">
                        <CardView card={currentTrick.cards[getRelativeSeatIndex(2)]} trumpSuit={gameState.trumpSuit} />
                      </div>
                    )}
                    {/* East (Right) */}
                    {currentTrick.cards[getRelativeSeatIndex(3)] && (
                      <div className="absolute right-1 sm:right-2 -rotate-90 scale-85 sm:scale-100 transition-all duration-300" id="card-played-east">
                        <CardView card={currentTrick.cards[getRelativeSeatIndex(3)]} trumpSuit={gameState.trumpSuit} />
                      </div>
                    )}

                    {/* Trick indicator/text */}
                    {Object.keys(currentTrick.cards).length === 0 && (
                      <p className="text-[10px] sm:text-xs font-mono text-slate-600 font-medium select-none text-center max-w-[80px] sm:max-w-[100px]">
                        Lead card here
                      </p>
                    )}
                  </div>
                )}

                {/* Show Kitty/UpCard if in bidding phase */}
                {(status === "bidding_1" || status === "bidding_2" || status === "discarding") && gameState.upCard && (
                  <div className="flex flex-col items-center justify-center space-y-2 border border-slate-800 bg-slate-950/30 p-4 rounded-xl shadow-xl animate-fade-in" id="bidding-upcard-felt-holder">
                    <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Turned Up Card</p>
                    <div className="relative transition-transform duration-300">
                      {status === "bidding_1" || status === "discarding" ? (
                        <CardView card={gameState.upCard} trumpSuit={null} />
                      ) : (
                        /* Turned Down Card represents Phase 2 bidding */
                        <CardBack />
                      )}
                    </div>
                  </div>
                )}

                {/* Game finished screen overlay */}
                {status === "finished" && (
                  <div className="absolute inset-0 bg-slate-950/95 flex flex-col justify-center items-center rounded-xl p-6 z-20 space-y-4" id="finished-overlay">
                    <Crown className="h-12 w-12 text-amber-400 animate-bounce" />
                    <h3 className="text-2xl font-black text-white uppercase tracking-wider">MATCH OVER!</h3>
                    <p className="text-sm font-semibold text-slate-300">
                      Winners: <span className={gameState.winnerTeam === 0 ? "text-indigo-400" : "text-rose-400"}>
                        {gameState.winnerTeam === 0 ? "Team 1 (Seats 1 & 3)" : "Team 2 (Seats 2 & 4)"}
                      </span>
                    </p>
                    <div className="bg-slate-900 border-2 border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-400 text-center shadow-lg">
                      Final Score: Team 1: {gameState.scores.team0} | Team 2: {gameState.scores.team1}
                    </div>
                    {game.creatorId === currentUser?.uid && (
                      <button
                        onClick={handleResetGame}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-6 py-2.5 rounded-lg flex items-center gap-1.5 shadow-md shadow-indigo-950/50 transition-all active:scale-[0.98]"
                        id="play-again-btn"
                      >
                        <RefreshCw className="h-3.5 w-3.5 animate-spin-once" /> Play Again
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* BOTTOM INTERACTIVE CONTROLS / PLAYER SEAT */}
              <div className="w-full flex flex-col items-center mt-auto" id="seat-south">
                
                {/* Active Bidding / Discard Controls Overlay */}
                {mySeatIndex !== -1 && gameState.turnIndex === mySeatIndex && (
                  <div className="mb-2 sm:mb-4 bg-slate-950/95 border-2 border-indigo-500/30 rounded-2xl p-4 sm:p-5 flex flex-col items-center gap-3 sm:gap-4 shadow-2xl animate-fade-in z-10 max-w-xs sm:max-w-md w-full animate-bounce-subtle" id="interactive-bid-controls">
                    
                    {status === "bidding_1" && (
                      <>
                        <p className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Order Up the Trump Suit?</p>
                        
                        <div className="flex items-center gap-2 mb-0.5">
                          <input 
                            type="checkbox" 
                            id="go-alone-check-1" 
                            checked={goingAlone} 
                            onChange={(e) => setGoingAlone(e.target.checked)}
                            className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 sm:h-4 sm:w-4" 
                          />
                          <label htmlFor="go-alone-check-1" className="text-[11px] sm:text-xs text-rose-400 font-semibold cursor-pointer select-none">
                            🔥 GO ALONE! (Partner is skipped)
                          </label>
                        </div>

                        <div className="flex gap-2 sm:gap-3 w-full">
                          <button
                            onClick={() => handleBid1("pass")}
                            className="flex-1 bg-slate-900 hover:bg-slate-800 text-white py-2 sm:py-2.5 text-xs sm:text-sm font-bold rounded-lg transition-colors border border-slate-700"
                          >
                            Pass
                          </button>
                          <button
                            onClick={() => handleBid1("order_up")}
                            className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2 sm:py-2.5 text-xs sm:text-sm font-bold rounded-lg transition-colors border border-indigo-500"
                          >
                            Order Up
                          </button>
                        </div>
                      </>
                    )}

                    {status === "bidding_2" && (
                      <>
                        <p className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Choose Trump Suit</p>
                        
                        <div className="flex items-center gap-2 mb-0.5">
                          <input 
                            type="checkbox" 
                            id="go-alone-check-2" 
                            checked={goingAlone} 
                            onChange={(e) => setGoingAlone(e.target.checked)}
                            className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 sm:h-4 sm:w-4" 
                          />
                          <label htmlFor="go-alone-check-2" className="text-[11px] sm:text-xs text-rose-400 font-semibold cursor-pointer select-none">
                            🔥 GO ALONE!
                          </label>
                        </div>

                        {/* Suit declaration buttons */}
                        <div className="grid grid-cols-2 gap-2 sm:gap-3 w-full mb-0.5">
                          {["S", "C", "D", "H"].filter(s => s !== gameState.upCard!.slice(-1)).map((suitStr) => {
                            const suit = suitStr as Suit;
                            return (
                              <button
                                key={suit}
                                onClick={() => handleBid2(suit)}
                                className="bg-slate-900 hover:bg-slate-850 text-slate-100 py-1.5 sm:py-2 text-xs sm:text-sm font-bold rounded border border-slate-800 flex items-center justify-center gap-1.5 sm:gap-2 transition-colors"
                              >
                                <span className={`text-sm sm:text-base ${getSuitColor(suit)}`}>{getSuitSymbol(suit)}</span>
                                <span className="text-[10px] sm:text-xs">{getSuitName(suit)}</span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Disable Pass if under Stick the Dealer */}
                        <button
                          onClick={() => handleBid2(null)}
                          disabled={mySeatIndex === gameState.dealerIndex}
                          className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-white py-1.5 sm:py-2 text-xs sm:text-sm font-bold rounded-lg border border-slate-700 transition-colors"
                        >
                          {mySeatIndex === gameState.dealerIndex ? "Dealer Stick (Must Choose)" : "Pass"}
                        </button>
                      </>
                    )}

                    {status === "discarding" && (
                      <div className="text-center space-y-1 sm:space-y-1.5">
                        <p className="text-xs sm:text-sm font-bold text-indigo-400 uppercase tracking-wider">DISCARD A CARD</p>
                        <p className="text-[11px] sm:text-xs text-slate-400 leading-relaxed">
                          Click any card in your hand below to discard it and accept the turned up card.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Bottom Avatar / Seat Panel info */}
                <PlayerAvatar 
                  player={game.seats[getRelativeSeatIndex(0)]} 
                  seatNum={getRelativeSeatIndex(0)}
                  isTurn={gameState.turnIndex === getRelativeSeatIndex(0)}
                  isDealer={gameState.dealerIndex === getRelativeSeatIndex(0)}
                  cardsLeft={null} // Don't show cards count for local user, we can see their hand instead
                  isSkipped={gameState.isAlone && getRelativeSeatIndex(0) === getPartnerSeat(gameState.makerSeat!)}
                />

                {/* Hand of Cards */}
                {mySeatIndex !== -1 && (
                  <div className="mt-4 flex flex-col items-center w-full" id="local-player-hand-section">
                    
                    {/* Render active hand cards */}
                    <div className="flex gap-1 sm:gap-2 justify-center items-end h-28 sm:h-32 px-2 sm:px-4 py-1 sm:py-2" id="cards-hand-row">
                      {/* If dealer is discarding, we show their hand + the upcard together so they can choose from 6 cards */}
                      {(status === "discarding" && gameState.turnIndex === mySeatIndex 
                        ? [...(gameState.hands[mySeatIndex] || []), gameState.upCard!]
                        : (gameState.hands[mySeatIndex] || [])
                      ).map((card, cIdx) => {
                        const isInteractive = gameState.turnIndex === mySeatIndex && (status === "playing" || status === "discarding");
                        const playable = status === "playing" && isCardPlayable(card, gameState.hands[mySeatIndex] || [], currentTrick, gameState.trumpSuit);
                        
                        return (
                          <div
                            key={cIdx}
                            onClick={() => {
                              if (!isInteractive) return;
                              if (status === "discarding") {
                                handleDiscard(card);
                              } else {
                                handlePlayCard(card);
                              }
                            }}
                            className={`transform transition-all duration-200 ${
                              isInteractive 
                                ? playable || status === "discarding"
                                  ? "cursor-pointer hover:-translate-y-6 hover:shadow-2xl hover:scale-105" 
                                  : "opacity-40"
                                : "opacity-80"
                            }`}
                            style={{ zIndex: cIdx }}
                          >
                            <CardView card={card} trumpSuit={gameState.trumpSuit} />
                          </div>
                        );
                      })}
                    </div>

                    {/* Partner skipped going alone status line */}
                    {gameState.isAlone && getRelativeSeatIndex(0) === getPartnerSeat(gameState.makerSeat!) && (
                      <div className="rounded-full bg-rose-950/40 border border-rose-900/40 text-rose-300 font-bold px-4 py-1 text-[10px] uppercase font-mono tracking-wider mt-1">
                        💤 Partner Went Alone! You sit out this hand.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar: Game Logs & Live Lobby Chat */}
        <div className="flex flex-col h-full gap-4 max-h-[600px] lg:max-h-none" id="game-sidebar">
          
          {/* Mini Hand Log Console */}
          {status !== "lobby" && (
            <div className="flex flex-col h-40 border border-slate-800 bg-slate-950 rounded-2xl overflow-hidden shadow-xl" id="logs-widget">
              <div className="flex items-center gap-1.5 border-b border-slate-900 bg-slate-950 px-4 py-2 text-slate-100">
                <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-xs font-bold tracking-wider uppercase text-slate-200">Table Log</span>
              </div>
              
              <div className="flex-1 overflow-y-auto p-3 space-y-1 font-mono text-[11px] text-slate-300" id="game-logs-container">
                {gameState.logs && gameState.logs.slice(-15).map((log, index) => (
                  <div key={index} className="leading-relaxed border-b border-slate-950/50 pb-1">
                    {log}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          )}

          {/* Real-time chat integration */}
          <div className="flex-1" id="real-time-chat-wrapper">
            <LobbyChat gameId={gameId} />
          </div>
        </div>

      </div>
    </div>
  );
}

// ==========================================
// SEATING DISPLAY CARD (PlayerAvatar)
// ==========================================
interface PlayerAvatarProps {
  player: GamePlayer | null;
  seatNum: number;
  isTurn: boolean;
  isDealer: boolean;
  cardsLeft: number | null;
  isSkipped: boolean;
}

function PlayerAvatar({ player, seatNum, isTurn, isDealer, cardsLeft, isSkipped }: PlayerAvatarProps) {
  return (
    <div className={`flex flex-col items-center p-2.5 sm:p-4 rounded-xl sm:rounded-2xl transition-all duration-300 ${
      isTurn 
        ? "bg-indigo-950/45 border-2 border-indigo-500/55 shadow-xl shadow-indigo-950/35 scale-102 sm:scale-105" 
        : "bg-slate-950/80 border border-slate-850"
    } w-24 sm:w-28 text-center`} id={`avatar-seat-${seatNum}`}>
      <div className="relative">
        <div className={`h-10 w-10 sm:h-12 sm:w-12 rounded-full flex items-center justify-center font-extrabold text-sm sm:text-base select-none border-2 transition-all duration-300 ${
          isTurn 
            ? "bg-indigo-600 border-indigo-400 text-white animate-pulse" 
            : player 
              ? player.isAi 
                ? "bg-slate-800 border-slate-700 text-slate-300"
                : "bg-indigo-900 border-indigo-700 text-indigo-100"
              : "bg-slate-950 border-dashed border-slate-800 text-slate-600"
        }`} id={`avatar-circle-${seatNum}`}>
          {player ? player.name.slice(0, 2).toUpperCase() : "?"}
        </div>

        {/* Dealer symbol */}
        {isDealer && (
          <span className="absolute -top-1 -right-1 bg-amber-500 text-slate-950 font-bold rounded-full text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 shadow border border-amber-400" title="Dealer Buck">
            D
          </span>
        )}
      </div>

      <div className="mt-1.5 sm:mt-2 w-full">
        <p className="text-[11px] sm:text-xs font-bold text-slate-200 truncate leading-none">
          {player ? player.name : "Open Seat"}
        </p>
        <span className="text-[9px] sm:text-[10px] font-mono text-slate-500 block mt-0.5 sm:mt-1">
          Seat {seatNum + 1}
        </span>
      </div>

      {/* Cards indicator */}
      {player && cardsLeft !== null && cardsLeft > 0 && !isSkipped && (
        <div className="mt-1 sm:mt-1.5 flex items-center gap-0.5 sm:gap-1 justify-center" title={`${cardsLeft} cards in hand`}>
          {Array.from({ length: cardsLeft }).map((_, idx) => (
            <div key={idx} className="h-3 w-1.5 sm:h-4 sm:w-2 bg-gradient-to-t from-indigo-700 to-indigo-500 rounded-sm border-[0.5px] border-indigo-400/30" />
          ))}
        </div>
      )}

      {/* Skipping indicators */}
      {isSkipped && (
        <span className="mt-1 sm:mt-1.5 text-[8px] sm:text-[9px] font-bold text-rose-400 bg-rose-950/40 rounded px-1 sm:px-1.5 py-0.5 tracking-wider">
          SKIPPED
        </span>
      )}
    </div>
  );
}

// ==========================================
// CARD VIEW RENDER (CardView & CardBack)
// ==========================================
interface CardViewProps {
  card: Card;
  trumpSuit: Suit | null;
}

function CardView({ card, trumpSuit }: CardViewProps) {
  const rank = card.slice(0, -1);
  const printedSuit = card.slice(-1) as Suit;
  const resolvedSuit = getCardSuit(card, trumpSuit);

  const isRed = resolvedSuit === "H" || resolvedSuit === "D";
  const suitSymbol = getSuitSymbol(printedSuit);

  // Check if it is a Bower
  const isRightBower = trumpSuit && rank === "J" && printedSuit === trumpSuit;
  const isLeftBower = trumpSuit && rank === "J" && printedSuit === getOppositeSuit(trumpSuit);

  return (
    <div 
      className={`relative rounded-xl border bg-white flex flex-col justify-between p-1 sm:p-1.5 shadow-md transition-shadow select-none w-[64px] h-[96px] sm:w-[76px] sm:h-[114px] ${
        isRightBower 
          ? "border-amber-400 shadow-amber-500/20 ring-1 ring-amber-400 animate-pulse animate-duration-1000" 
          : isLeftBower 
            ? "border-amber-300 shadow-amber-400/20 ring-1 ring-amber-300"
            : "border-slate-300"
      }`}
      id={`card-renderer-${card}`}
    >
      {/* Top Left Rank */}
      <div className={`text-xs sm:text-sm font-bold leading-none ${isRed ? "text-red-600" : "text-slate-900"}`}>
        {rank}
        <span className="block text-[10px] sm:text-xs">{suitSymbol}</span>
      </div>

      {/* Center Large Symbol/Bower name */}
      <div className="flex flex-col items-center justify-center self-center animate-fade-in" id="card-suit-center">
        {isRightBower ? (
          <div className="text-center">
            <span className="text-[9px] sm:text-[11px] font-black text-amber-500 leading-none block">RIGHT</span>
            <span className="text-[7px] sm:text-[9px] font-bold text-amber-500 leading-none">BOWER</span>
          </div>
        ) : isLeftBower ? (
          <div className="text-center">
            <span className="text-[9px] sm:text-[11px] font-black text-amber-500 leading-none block">LEFT</span>
            <span className="text-[7px] sm:text-[9px] font-bold text-amber-500 leading-none">BOWER</span>
          </div>
        ) : (
          <span className={`text-2xl sm:text-3xl ${isRed ? "text-red-600" : "text-slate-900"}`}>{suitSymbol}</span>
        )}
      </div>

      {/* Bottom Right Rank (inverted/rotated) */}
      <div className={`text-xs sm:text-sm font-bold leading-none self-end rotate-180 ${isRed ? "text-red-600" : "text-slate-900"}`}>
        {rank}
        <span className="block text-[10px] sm:text-xs">{suitSymbol}</span>
      </div>
    </div>
  );
}

function CardBack() {
  return (
    <div 
      className="rounded-xl border border-indigo-500/50 bg-gradient-to-tr from-indigo-950 via-slate-900 to-indigo-950 p-1 flex items-center justify-center shadow-lg w-[64px] h-[96px] sm:w-[76px] sm:h-[114px]"
      id="card-back-renderer"
    >
      <div className="w-full h-full rounded-lg border border-indigo-850/40 bg-indigo-950/20 flex items-center justify-center flex-wrap gap-0.5 sm:gap-1 p-1">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full bg-indigo-500/10 border border-indigo-400/20 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

// Helper formatting utilities
function getSuitSymbol(suit: Suit): string {
  switch (suit) {
    case "S": return "♠";
    case "C": return "♣";
    case "D": return "♦";
    case "H": return "♥";
  }
}

function getSuitColor(suit: Suit): string {
  return suit === "H" || suit === "D" ? "text-rose-500" : "text-slate-300";
}

function getSuitName(suit: Suit): string {
  switch (suit) {
    case "S": return "Spades";
    case "C": return "Clubs";
    case "D": return "Diamonds";
    case "H": return "Hearts";
  }
}

function getOppositeSuit(suit: Suit): Suit {
  switch (suit) {
    case "S": return "C";
    case "C": return "S";
    case "D": return "H";
    case "H": return "D";
  }
}
