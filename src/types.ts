export type Suit = "S" | "C" | "D" | "H"; // Spades, Clubs, Diamonds, Hearts
export type Card = string; // e.g. "9S", "10D", "JC", "AH"

export interface GamePlayer {
  id: string;
  name: string;
  isAi: boolean;
}

export interface Seat {
  player: GamePlayer | null;
  seatIndex: number; // 0, 1, 2, 3
}

export interface Trick {
  cards: { [seatIndex: number]: Card };
  leadSeat: number;
  winnerSeat: number | null;
}

export interface GameState {
  dealerIndex: number; // 0-3
  turnIndex: number; // 0-3
  upCard: Card | null; // The turned up card from the kitty
  kitty: Card[]; // Remaining 4 cards after dealing
  hands: { [seatIndex: number]: Card[] }; // Hands of 5 cards each
  trumpSuit: Suit | null; // Suit of trump (S, C, D, H)
  makerSeat: number | null; // Which seat declared trump
  isAlone: boolean; // Did the maker go alone?
  tricks: Trick[]; // Completed tricks in the current hand (max 5)
  currentTrick: Trick | null; // Currently active trick
  scores: { team0: number; team1: number }; // Overall game scores (first to 10)
  handScores: { team0: number; team1: number }; // Tricks won in current hand (first to 5 tricks)
  winnerTeam: number | null; // 0 or 1, or null if game is ongoing
  lastHandSummary: string; // Description of what happened in the last hand
  logs: string[]; // Running log of gameplay actions (e.g. "Alice played KS")
}

export interface LobbyGame {
  id: string;
  name: string;
  creatorId: string;
  creatorName: string;
  status: "lobby" | "bidding_1" | "bidding_2" | "discarding" | "playing" | "finished";
  createdAt: number;
  seats: (GamePlayer | null)[]; // 4 slots representing seats 0 to 3
  aiSeats: number[]; // Indices of seats occupied by AI players
  gameState: GameState;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: number;
}
