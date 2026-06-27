import { Card, Suit, Trick, GameState, GamePlayer } from "./types";

// Standard Euchre 24-card deck
export const EUCHRE_DECK: Card[] = [
  "9S", "10S", "JS", "QS", "KS", "AS",
  "9C", "10C", "JC", "QC", "KC", "AC",
  "9D", "10D", "JD", "QD", "KD", "AD",
  "9H", "10H", "JH", "QH", "KH", "AH"
];

// Helper to check same color suits
export function getOppositeSuit(suit: Suit): Suit {
  switch (suit) {
    case "S": return "C";
    case "C": return "S";
    case "D": return "H";
    case "H": return "D";
  }
}

// Get actual suit of a card, accounting for the Left Bower
export function getCardSuit(card: Card, trumpSuit: Suit | null): Suit {
  const rank = card.slice(0, -1);
  const printedSuit = card.slice(-1) as Suit;
  
  if (rank === "J" && trumpSuit) {
    if (printedSuit === trumpSuit) return trumpSuit;
    if (printedSuit === getOppositeSuit(trumpSuit)) return trumpSuit; // Left Bower belongs to Trump suit!
  }
  return printedSuit;
}

// Get descriptive card name for logging
export function getCardName(card: Card, trumpSuit: Suit | null): string {
  const rank = card.slice(0, -1);
  const printedSuit = card.slice(-1);
  
  let suitName = "";
  switch (printedSuit) {
    case "S": suitName = "Spades ♠"; break;
    case "C": suitName = "Clubs ♣"; break;
    case "D": suitName = "Diamonds ♦"; break;
    case "H": suitName = "Hearts ♥"; break;
  }

  let rankName = rank;
  if (rank === "J") {
    if (trumpSuit) {
      if (printedSuit === trumpSuit) {
        return "Right Bower (Jack of " + suitName + ")";
      }
      if (printedSuit === getOppositeSuit(trumpSuit)) {
        return "Left Bower (Jack of " + suitName + ")";
      }
    }
    rankName = "Jack";
  } else if (rank === "Q") rankName = "Queen";
  else if (rank === "K") rankName = "King";
  else if (rank === "A") rankName = "Ace";

  return `${rankName} of ${suitName}`;
}

// Evaluate strength power of a card for trick comparisons
export function getCardPower(card: Card, ledSuit: Suit, trumpSuit: Suit | null): number {
  const rank = card.slice(0, -1);
  const printedSuit = card.slice(-1) as Suit;

  if (trumpSuit) {
    // Right Bower
    if (rank === "J" && printedSuit === trumpSuit) {
      return 100;
    }
    // Left Bower
    if (rank === "J" && printedSuit === getOppositeSuit(trumpSuit)) {
      return 99;
    }
    // Other Trump Cards
    if (getCardSuit(card, trumpSuit) === trumpSuit) {
      switch (rank) {
        case "A": return 98;
        case "K": return 97;
        case "Q": return 96;
        case "10": return 95;
        case "9": return 94;
      }
    }
  }

  // Follow Led Suit (making sure we don't treat Left Bower as ledSuit if it's trump)
  if (getCardSuit(card, trumpSuit) === ledSuit) {
    switch (rank) {
      case "A": return 88;
      case "K": return 87;
      case "Q": return 86;
      case "J": return 85;
      case "10": return 84;
      case "9": return 83;
    }
  }

  // Off-suit trash cards
  switch (rank) {
    case "A": return 14;
    case "K": return 13;
    case "Q": return 12;
    case "J": return 11;
    case "10": return 10;
    case "9": return 9;
  }
  return 0;
}

// Determine if playing a card is legal under the standard Euchre rules
export function isCardPlayable(card: Card, hand: Card[], currentTrick: Trick | null, trumpSuit: Suit | null): boolean {
  if (!currentTrick || Object.keys(currentTrick.cards).length === 0) {
    // Lead player can play any card
    return true;
  }

  const leadCard = currentTrick.cards[currentTrick.leadSeat];
  const ledSuit = getCardSuit(leadCard, trumpSuit);

  // Check if player has any cards that match the led suit
  const hasLedSuit = hand.some(c => getCardSuit(c, trumpSuit) === ledSuit);

  if (hasLedSuit) {
    // If they have led suit, they must play a card of the led suit
    return getCardSuit(card, trumpSuit) === ledSuit;
  }

  // If they don't have led suit, any card is playable (ruffing/discarding)
  return true;
}

// Get the winner seat index of the current trick
export function getTrickWinner(trick: Trick, trumpSuit: Suit | null): number {
  const leadCard = trick.cards[trick.leadSeat];
  const ledSuit = getCardSuit(leadCard, trumpSuit);

  let bestPower = -1;
  let winnerSeat = trick.leadSeat;

  for (const seatStr of Object.keys(trick.cards)) {
    const seatIndex = parseInt(seatStr, 10);
    const card = trick.cards[seatIndex];
    const power = getCardPower(card, ledSuit, trumpSuit);
    if (power > bestPower) {
      bestPower = power;
      winnerSeat = seatIndex;
    }
  }

  return winnerSeat;
}

// Shuffle a deck of cards
export function shuffleDeck(deck: Card[]): Card[] {
  const result = [...deck];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Create initial empty game state
export function createInitialGameState(): GameState {
  return {
    dealerIndex: 0,
    turnIndex: 1,
    upCard: null,
    kitty: [],
    hands: { 0: [], 1: [], 2: [], 3: [] },
    trumpSuit: null,
    makerSeat: null,
    isAlone: false,
    tricks: [],
    currentTrick: null,
    scores: { team0: 0, team1: 0 },
    handScores: { team0: 0, team1: 0 },
    winnerTeam: null,
    lastHandSummary: "Waiting for players to join and start the game.",
    logs: ["Table created. Join a seat to start."]
  };
}

// Deal a new hand of Euchre
export function startNewHand(state: GameState): GameState {
  const deck = shuffleDeck(EUCHRE_DECK);
  
  // Deal 5 cards to each of 4 players
  const hands: { [seatIndex: number]: Card[] } = {
    0: deck.slice(0, 5),
    1: deck.slice(5, 10),
    2: deck.slice(10, 15),
    3: deck.slice(15, 20)
  };

  const upCard = deck[20];
  const kitty = deck.slice(20); // Last 4 cards

  // Sort hands to group suits together for better UX
  for (let i = 0; i < 4; i++) {
    hands[i] = sortHand(hands[i], null);
  }

  return {
    ...state,
    hands,
    upCard,
    kitty,
    trumpSuit: null,
    makerSeat: null,
    isAlone: false,
    tricks: [],
    currentTrick: null,
    handScores: { team0: 0, team1: 0 },
    turnIndex: (state.dealerIndex + 1) % 4,
    logs: [
      `--- Deal Hand ---`,
      `New hand dealt. Dealer is Player ${state.dealerIndex + 1}.`,
      `The up card is ${upCard.slice(0, -1)}${getSuitSymbol(upCard.slice(-1) as Suit)}.`
    ]
  };
}

// Sort cards by suit and power
export function sortHand(hand: Card[], trumpSuit: Suit | null): Card[] {
  return [...hand].sort((a, b) => {
    const suitA = getCardSuit(a, trumpSuit);
    const suitB = getCardSuit(b, trumpSuit);
    if (suitA !== suitB) {
      return suitA.localeCompare(suitB);
    }
    // If same suit, sort by power
    const powerA = getCardPower(a, suitA, trumpSuit);
    const powerB = getCardPower(b, suitB, trumpSuit);
    return powerB - powerA; // Descending strength
  });
}

function getSuitSymbol(suit: Suit): string {
  switch (suit) {
    case "S": return "♠";
    case "C": return "♣";
    case "D": return "♦";
    case "H": return "♥";
  }
}

// Get the partner's seat index
export function getPartnerSeat(seatIndex: number): number {
  return (seatIndex + 2) % 4;
}

// Check if a seat's team matches Team 0 or Team 1
export function getTeamOfSeat(seatIndex: number): number {
  return (seatIndex === 0 || seatIndex === 2) ? 0 : 1;
}

// ==========================================
// AI LOGIC ENGINE (Bidding & Playing)
// ==========================================

// AI bidding choice for Bidding Phase 1 (Up card ordering)
export function getAiBidding1Decision(
  seatIndex: number,
  hand: Card[],
  upCard: Card,
  dealerIndex: number
): { action: "pass" | "order_up"; alone: boolean } {
  const upCardSuit = upCard.slice(-1) as Suit;
  
  // Count how many cards would count as trump (including upCard if we are the dealer)
  let trumpCount = 0;
  let highCardStrength = 0; // Evaluate based on J, Q, K, A in that suit
  
  const tempHand = [...hand];
  if (seatIndex === dealerIndex) {
    tempHand.push(upCard); // Add the up card conceptually since we get to pick it up
  }

  tempHand.forEach(card => {
    if (getCardSuit(card, upCardSuit) === upCardSuit) {
      trumpCount++;
      const rank = card.slice(0, -1);
      if (rank === "J") {
        highCardStrength += 15; // Bower
      } else if (rank === "A") {
        highCardStrength += 10;
      } else if (rank === "K") {
        highCardStrength += 8;
      } else {
        highCardStrength += 5;
      }
    } else {
      // Off-suit Aces are extremely strong
      if (card.slice(0, -1) === "A") {
        highCardStrength += 6;
      }
    }
  });

  // AI order up threshold:
  // - 3+ trumps is almost always an order up
  // - 2 trumps with high cards (e.g. Right Bower + another)
  // - If partner is the dealer, we order it up even with less because partner gets the trump!
  let threshold = 28;
  if (seatIndex === dealerIndex) {
    threshold = 24; // Easier to pick it up yourself
  } else if (getPartnerSeat(seatIndex) === dealerIndex) {
    threshold = 20; // Support partner's deal!
  }

  if (highCardStrength >= threshold || trumpCount >= 3) {
    // Decide whether to go alone (if hand is absolutely stellar: 4+ trumps with Bower)
    const hasRightBower = tempHand.some(c => c.slice(0, -1) === "J" && c.slice(-1) === upCardSuit);
    const alone = trumpCount >= 4 && hasRightBower && Math.random() > 0.5;
    return { action: "order_up", alone };
  }

  return { action: "pass", alone: false };
}

// AI choice for Bidding Phase 2 (Suit naming)
export function getAiBidding2Decision(
  seatIndex: number,
  hand: Card[],
  upCard: Card,
  dealerIndex: number
): { action: "pass" | "declare"; suit: Suit | null; alone: boolean } {
  const upCardSuit = upCard.slice(-1) as Suit;
  const availableSuits: Suit[] = ["S", "C", "D", "H"].filter(s => s !== upCardSuit) as Suit[];

  let bestSuit: Suit | null = null;
  let bestStrength = -1;

  availableSuits.forEach(suit => {
    let count = 0;
    let strength = 0;

    hand.forEach(card => {
      if (getCardSuit(card, suit) === suit) {
        count++;
        const rank = card.slice(0, -1);
        if (rank === "J") strength += 15;
        else if (rank === "A") strength += 10;
        else if (rank === "K") strength += 8;
        else strength += 5;
      } else {
        if (card.slice(0, -1) === "A") strength += 6;
      }
    });

    if (count >= 2 && strength > bestStrength) {
      bestStrength = strength;
      bestSuit = suit;
    }
  });

  // Threshold for declaring trump in Phase 2
  const isStickTheDealer = seatIndex === dealerIndex;
  
  if (bestSuit && (bestStrength >= 22 || isStickTheDealer)) {
    const alone = bestStrength >= 40 && Math.random() > 0.6;
    return { action: "declare", suit: bestSuit, alone };
  }

  return { action: "pass", suit: null, alone: false };
}

// AI choice for Discarding
export function getAiDiscardDecision(hand: Card[], upCard: Card): Card {
  // Combine hand and upCard, then choose the weakest one to discard
  // (Cannot discard the upCard itself easily unless it's the weakest, which is rare)
  const fullHand = [...hand, upCard];
  const trumpSuit = upCard.slice(-1) as Suit;

  // Let's find the weakest card
  // A card is weak if it's off-suit, low rank (9 or 10), and not part of a short suit
  // Better to create a "short suit" (discarding the only card of a suit so we can trump it later!)
  let discardChoice = fullHand[0];
  let worstValue = 999;

  // Group cards by suit to find singletons (only 1 card in that off-suit)
  const suitCounts: { [s in Suit]?: number } = {};
  fullHand.forEach(c => {
    const s = getCardSuit(c, trumpSuit);
    suitCounts[s] = (suitCounts[s] || 0) + 1;
  });

  fullHand.forEach(card => {
    const s = getCardSuit(card, trumpSuit);
    const r = card.slice(0, -1);
    
    // Trump is sacred, do not discard unless hand is entirely trump (extremely rare)
    if (s === trumpSuit) {
      return;
    }

    let val = 0;
    // Base rank value
    if (r === "A") val += 20;
    else if (r === "K") val += 15;
    else if (r === "Q") val += 12;
    else if (r === "J") val += 10;
    else if (r === "10") val += 5;
    else if (r === "9") val += 3;

    // Discarding a singleton creates a void, which is highly advantageous!
    if (suitCounts[s] === 1) {
      val -= 10; // Prefer discarding singletons to create a void!
    }

    if (val < worstValue) {
      worstValue = val;
      discardChoice = card;
    }
  });

  return discardChoice;
}

// AI choice for playing a card
export function getAiPlayDecision(
  seatIndex: number,
  hand: Card[],
  currentTrick: Trick | null,
  trumpSuit: Suit | null,
  isAlone: boolean,
  makerSeat: number | null
): Card {
  // Filter playable cards
  const playable = hand.filter(card => isCardPlayable(card, hand, currentTrick, trumpSuit));
  if (playable.length === 1) {
    return playable[0];
  }

  // If leading the trick
  if (!currentTrick || Object.keys(currentTrick.cards).length === 0) {
    // 1. Try to lead high Trump cards to "pull trumps" if we are the makers of trump
    const isMakerTeam = makerSeat !== null && getTeamOfSeat(seatIndex) === getTeamOfSeat(makerSeat);
    const trumpsInHand = playable.filter(c => getCardSuit(c, trumpSuit) === trumpSuit);
    
    if (isMakerTeam && trumpsInHand.length > 0) {
      // Sort trumps by strength and play highest
      const sortedTrumps = sortHand(trumpsInHand, trumpSuit);
      return sortedTrumps[0]; // Pull trump!
    }

    // 2. Play non-trump Aces (Aces are "green" lay-down tricks if trump is gone)
    const offSuitAces = playable.filter(c => getCardSuit(c, trumpSuit) !== trumpSuit && c.slice(0, -1) === "A");
    if (offSuitAces.length > 0) {
      return offSuitAces[Math.floor(Math.random() * offSuitAces.length)];
    }

    // 3. Otherwise, play a random low non-trump card to avoid leading away from high cards
    const nonTrumps = playable.filter(c => getCardSuit(c, trumpSuit) !== trumpSuit);
    if (nonTrumps.length > 0) {
      // Play lowest power non-trump card
      return nonTrumps.reduce((weakest, c) => {
        const leadS = getCardSuit(c, trumpSuit);
        return getCardPower(c, leadS, trumpSuit) < getCardPower(weakest, leadS, trumpSuit) ? c : weakest;
      }, nonTrumps[0]);
    }

    return playable[Math.floor(Math.random() * playable.length)];
  }

  // If not leading the trick:
  const leadCard = currentTrick.cards[currentTrick.leadSeat];
  const ledSuit = getCardSuit(leadCard, trumpSuit);

  // Analyze trick so far
  let winningSeat = currentTrick.leadSeat;
  let bestPower = -1;
  for (const sStr of Object.keys(currentTrick.cards)) {
    const sIdx = parseInt(sStr, 10);
    const card = currentTrick.cards[sIdx];
    const power = getCardPower(card, ledSuit, trumpSuit);
    if (power > bestPower) {
      bestPower = power;
      winningSeat = sIdx;
    }
  }

  const partnerSeat = getPartnerSeat(seatIndex);
  const partnerIsWinning = winningSeat === partnerSeat;

  // If our partner is already winning the trick, we can sluff off a low card (save our high ones!)
  if (partnerIsWinning && !isAlone) {
    // Discard the lowest power playable card
    return playable.reduce((lowest, card) => {
      return getCardPower(card, ledSuit, trumpSuit) < getCardPower(lowest, ledSuit, trumpSuit) ? card : lowest;
    }, playable[0]);
  }

  // Partner is not winning, or they are gone (maker went alone). We need to win if possible!
  // Find which playable cards can beat the current best power
  const winningCards = playable.filter(card => getCardPower(card, ledSuit, trumpSuit) > bestPower);

  if (winningCards.length > 0) {
    // Play the LOWEST of our winning cards (no need to waste a Right Bower if an 10 of trump wins!)
    return winningCards.reduce((lowestWinning, card) => {
      return getCardPower(card, ledSuit, trumpSuit) < getCardPower(lowestWinning, ledSuit, trumpSuit) ? card : lowestWinning;
    }, winningCards[0]);
  }

  // We can't win the trick. Throw away our lowest power card!
  return playable.reduce((lowest, card) => {
    return getCardPower(card, ledSuit, trumpSuit) < getCardPower(lowest, ledSuit, trumpSuit) ? card : lowest;
  }, playable[0]);
}
