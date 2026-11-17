import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { isNewerRoundSnapshot } from '../../../shared/src/aviatorRealtime';
import {
  AndarBaharRound,
  AndarBaharHistoryItem,
  AndarBaharRoundBet,
  DragonTigerRound,
  DragonTigerHistoryItem,
  DragonTigerRoundBet,
  DiceRound,
  DiceHistoryItem,
  DiceRoundBet,
} from '../../../shared/src/types';
import { aviatorEngine } from '../games/aviator/aviator.engine';
import { rouletteEngine } from '../games/roulette/roulette.engine';
import { diceEngine } from '../games/dice/dice.engine';
import { dragonTigerEngine } from '../games/dragon-tiger/dragon-tiger.engine';
import { andarBaharEngine } from '../games/andar-bahar/andar-bahar.engine';

export interface RouletteLiveState {
  id: string;
  roundNumber: number;
  status: 'BETTING' | 'SPINNING' | 'RESULT';
  bettingEndsAt: number;
  spinEndsAt: number | null;
  winningNumber: number | null;
  color: 'red' | 'black' | 'green' | null;
  totalBetsCount: number;
  totalBetAmount: string;
  recentWinners?: Array<{ username: string; totalPayout: string; netProfit: string }>;
}

export interface RouletteBetFeedItem {
  id: string;
  username: string;
  type: string;
  amount: string;
  numbers?: number[];
}

interface GameStateContextType {
  isConnected: boolean;
  apiHealth: 'checking' | 'online' | 'degraded' | 'offline';
  apiLastCheckedAt: number | null;
  apiResponseTimeMs: number | null;
  roundDataStatus: 'waiting' | 'fresh' | 'stale' | 'offline';
  lastSuccessfulRoundAt: number | null;
  lastRoundError: string | null;
  isSimulatedFallback: boolean;
  isRealtimeConnected: boolean;
  lastRealtimeEventAt: number | null;
  realtimeEventLagMs: number | null;
  realtimeEventCount: number;
  realtimeSequenceGapCount: number;
  realtimeStaleEventCount: number;
  pollingFallbackCount: number;
  realtimeReconnectCount: number;
  multiplier: number;
  roundState: {
    id?: string;
    roundNumber?: number;
    status: 'WAITING' | 'RUNNING' | 'CRASHED' | 'SETTLED';
    startTime?: number;
    crashMultiplier?: number;
  };
  recentHistory: Array<{ roundNumber: number; crashMultiplier: number }>;
  // European Roulette live in-APK state
  rouletteRound: RouletteLiveState;
  rouletteHistory: Array<{ number: number; color: 'red' | 'black' | 'green'; timestamp?: string }>;
  addRouletteHistoryItem: (item: { number: number; color: 'red' | 'black' | 'green'; timestamp?: string }) => void;
  rouletteLiveBets: RouletteBetFeedItem[];
  // Andar Bahar live in-APK state
  andarBaharRound: AndarBaharRound;
  andarBaharHistory: AndarBaharHistoryItem[];
  andarBaharLiveBets: AndarBaharRoundBet[];
  // Dragon Tiger live in-APK state
  dragonTigerRound: DragonTigerRound;
  dragonTigerHistory: DragonTigerHistoryItem[];
  dragonTigerLiveBets: DragonTigerRoundBet[];
  dragonTigerMyBets: Array<{ id: string; roundId: string; amount: string; type: string; status: string; payoutAmount: string }>;
  // Lucky 10 Dice live in-APK state
  diceRound: DiceRound;
  diceHistory: DiceHistoryItem[];
  diceLiveBets: DiceRoundBet[];
  lastEvent: { event: string; data: any } | null;
}

const GameStateContext = createContext<GameStateContextType | undefined>(undefined);

function mapAviatorRound(round: ReturnType<typeof aviatorEngine.getPublicRoundState>) {
  return {
    id: round.id,
    roundNumber: round.roundNumber,
    status: round.status as 'WAITING' | 'RUNNING' | 'CRASHED' | 'SETTLED',
    startTime: round.startedAt ? new Date(round.startedAt).getTime() : undefined,
    crashMultiplier: round.crashMultiplier ?? undefined,
  };
}

function mapRouletteRound(round: ReturnType<typeof rouletteEngine.getPublicRoundState>): RouletteLiveState {
  return {
    id: round.id,
    roundNumber: round.roundNumber,
    status: round.status as 'BETTING' | 'SPINNING' | 'RESULT',
    bettingEndsAt: round.bettingEndsAt,
    spinEndsAt: round.spinEndsAt,
    winningNumber: round.winningNumber,
    color: round.color,
    totalBetsCount: round.totalBetsCount,
    totalBetAmount: round.totalBetAmount,
    recentWinners: round.recentWinners,
  };
}

export const GameStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, refreshWallet } = useAuth();
  const userRef = useRef(user);
  userRef.current = user;

  // All 6 casino game engines run directly inside the APK / browser client;
  // only wallet transfers & balances talk to Supabase.
  const [isConnected] = useState(true);
  const [apiHealth] = useState<'checking' | 'online' | 'degraded' | 'offline'>('online');
  const [apiLastCheckedAt, setApiLastCheckedAt] = useState<number | null>(() => Date.now());
  const [apiResponseTimeMs] = useState<number | null>(0);
  const [roundDataStatus] = useState<'waiting' | 'fresh' | 'stale' | 'offline'>('fresh');
  const [lastSuccessfulRoundAt, setLastSuccessfulRoundAt] = useState<number | null>(() => Date.now());
  const [lastRoundError] = useState<string | null>(null);
  const [isSimulatedFallback] = useState(false);
  const [isRealtimeConnected] = useState(true);
  const [lastRealtimeEventAt, setLastRealtimeEventAt] = useState<number | null>(() => Date.now());
  const [realtimeEventLagMs] = useState<number | null>(0);
  const [realtimeEventCount, setRealtimeEventCount] = useState(0);
  const [realtimeSequenceGapCount] = useState(0);
  const [realtimeStaleEventCount] = useState(0);
  const [pollingFallbackCount] = useState(0);
  const [realtimeReconnectCount] = useState(0);

  const initialAviator = aviatorEngine.getPublicRoundState();
  const [multiplier, setMultiplier] = useState<number>(initialAviator.multiplier || 1.0);
  const [authoritativeMultiplier, setAuthoritativeMultiplier] = useState<number>(initialAviator.multiplier || 1.0);
  const displayedMultiplierRef = useRef<number>(initialAviator.multiplier || 1.0);
  const lastAuthoritativeMultiplierRef = useRef<{ value: number; at: number; roundId: string | null }>({
    value: initialAviator.multiplier || 1.0,
    at: Date.now(),
    roundId: initialAviator.id,
  });

  const animatedRoundIdRef = useRef<string | undefined>(initialAviator.id);
  const [roundState, setRoundState] = useState(() => mapAviatorRound(initialAviator));
  const roundStateRef = useRef(roundState);
  roundStateRef.current = roundState;
  const latestObservedRoundRef = useRef<{ id?: string; roundNumber?: number; status: 'WAITING' | 'RUNNING' | 'CRASHED' | 'SETTLED' }>({
    id: initialAviator.id,
    roundNumber: initialAviator.roundNumber,
    status: initialAviator.status as 'WAITING' | 'RUNNING' | 'CRASHED' | 'SETTLED',
  });

  const [recentHistory, setRecentHistory] = useState<Array<{ roundNumber: number; crashMultiplier: number }>>(() =>
    aviatorEngine.getHistory().map((h) => ({ roundNumber: h.roundNumber, crashMultiplier: h.crashMultiplier }))
  );

  // European Roulette state
  const [rouletteRound, setRouletteRound] = useState<RouletteLiveState>(() =>
    mapRouletteRound(rouletteEngine.getPublicRoundState())
  );
  const [rouletteHistory, setRouletteHistory] = useState<Array<{ number: number; color: 'red' | 'black' | 'green'; timestamp?: string }>>(() =>
    rouletteEngine.getHistory()
  );
  const [rouletteLiveBets, setRouletteLiveBets] = useState<RouletteBetFeedItem[]>(() =>
    rouletteEngine.getCurrentRoundBets().map((b: any) => ({
      id: b.id,
      username: b.username || 'Player',
      type: b.type,
      amount: String(b.amount),
      numbers: b.numbers,
    }))
  );

  // Andar Bahar state
  const [andarBaharRound, setAndarBaharRound] = useState<AndarBaharRound>(() =>
    andarBaharEngine.getPublicRoundState()
  );
  const [andarBaharHistory, setAndarBaharHistory] = useState<AndarBaharHistoryItem[]>(() =>
    andarBaharEngine.getHistory()
  );
  const [andarBaharLiveBets, setAndarBaharLiveBets] = useState<AndarBaharRoundBet[]>(() =>
    andarBaharEngine.getCurrentRoundBets()
  );

  // Dragon Tiger state
  const [dragonTigerRound, setDragonTigerRound] = useState<DragonTigerRound>(() =>
    dragonTigerEngine.getPublicRoundState()
  );
  const [dragonTigerHistory, setDragonTigerHistory] = useState<DragonTigerHistoryItem[]>(() =>
    dragonTigerEngine.getHistory()
  );
  const [dragonTigerLiveBets, setDragonTigerLiveBets] = useState<DragonTigerRoundBet[]>(() =>
    dragonTigerEngine.getCurrentRoundBets()
  );
  const [dragonTigerMyBets, setDragonTigerMyBets] = useState<
    Array<{ id: string; roundId: string; amount: string; type: string; status: string; payoutAmount: string }>
  >(() => (user?.id ? dragonTigerEngine.getUserBets(user.id) : []));

  // Lucky 10 Dice state
  const [diceRound, setDiceRound] = useState<DiceRound>(() => diceEngine.getPublicRoundState());
  const [diceHistory, setDiceHistory] = useState<DiceHistoryItem[]>(() => diceEngine.getHistory());
  const [diceLiveBets, setDiceLiveBets] = useState<DiceRoundBet[]>(() => diceEngine.getCurrentRoundBets());

  const [lastEvent, setLastEvent] = useState<{ event: string; data: any } | null>(null);
  const settledResultIdsRef = useRef<Record<string, string>>({});

  const addRouletteHistoryItem = useCallback(
    (item: { number: number; color: 'red' | 'black' | 'green'; timestamp?: string }) => {
      setRouletteHistory((prev) => {
        if (prev.length > 0 && prev[0].number === item.number) {
          return prev;
        }
        return [item, ...prev.slice(0, 24)];
      });
    },
    []
  );

  const notifyWalletSettlement = useCallback(
    (key: string, roundId: string | undefined, status: string | undefined) => {
      if (!roundId || !status || !['RESULT', 'SETTLED', 'CRASHED'].includes(status)) return;
      const resultKey = `${roundId}:${status}`;
      if (settledResultIdsRef.current[key] === resultKey) return;
      settledResultIdsRef.current[key] = resultKey;
      if (userRef.current) {
        void refreshWallet();
      }
    },
    [refreshWallet]
  );

  // Keep user's Dragon Tiger bet list synchronized when user changes
  useEffect(() => {
    setDragonTigerMyBets(user?.id ? dragonTigerEngine.getUserBets(user.id) : []);
  }, [user?.id]);

  // Subscribe directly to all in-APK continuous game engines
  useEffect(() => {
    const touchHeartbeat = () => {
      const now = Date.now();
      setLastRealtimeEventAt(now);
      setLastSuccessfulRoundAt(now);
      setApiLastCheckedAt(now);
      setRealtimeEventCount((c) => c + 1);
    };

    const unsubAviator = aviatorEngine.subscribe((event, payload) => {
      touchHeartbeat();
      const round = aviatorEngine.getPublicRoundState();
      const bets = aviatorEngine.getCurrentRoundBets();
      const history = aviatorEngine.getHistory().map((h) => ({
        roundNumber: h.roundNumber,
        crashMultiplier: h.crashMultiplier,
      }));

      const incomingRound = {
        id: round.id,
        roundNumber: Number(round.roundNumber),
        status: round.status as 'WAITING' | 'RUNNING' | 'CRASHED' | 'SETTLED',
      };
      const currentRound = latestObservedRoundRef.current ?? roundStateRef.current;

      if (isNewerRoundSnapshot(incomingRound, currentRound)) {
        latestObservedRoundRef.current = incomingRound;
        setRoundState(mapAviatorRound(round));

        const incomingMultiplier = Number(
          ['CRASHED', 'SETTLED'].includes(round.status)
            ? round.crashMultiplier ?? round.multiplier ?? 1
            : round.multiplier ?? 1
        );
        const prevMult = lastAuthoritativeMultiplierRef.current;
        const sameRunningRound = round.status === 'RUNNING' && prevMult?.roundId === round.id;
        const safeMultiplier = sameRunningRound
          ? Math.max(incomingMultiplier, prevMult?.value ?? incomingMultiplier)
          : incomingMultiplier;

        lastAuthoritativeMultiplierRef.current = {
          value: safeMultiplier,
          at: Date.now(),
          roundId: round.id,
        };
        setAuthoritativeMultiplier(safeMultiplier);
        notifyWalletSettlement('aviator', round.id, round.status);
      }

      if (event === 'aviator:bet_cashed_out' && userRef.current) {
        void refreshWallet();
      }

      setRecentHistory(history.slice(0, 20));
      setLastEvent({
        event: 'production:crash_state',
        data: { round, bets, history, payload },
      });
    });

    const unsubRoulette = rouletteEngine.subscribe((event, payload) => {
      touchHeartbeat();
      const round = mapRouletteRound(rouletteEngine.getPublicRoundState());
      const history = rouletteEngine.getHistory();
      const bets = rouletteEngine.getCurrentRoundBets().map((b: any) => ({
        id: b.id,
        username: b.username || 'Player',
        type: b.type,
        amount: String(b.amount),
        numbers: b.numbers,
      }));

      setRouletteRound(round);
      setRouletteHistory(history);
      setRouletteLiveBets(bets);

      if (event === 'roulette:round_result') {
        setLastEvent({
          event: 'roulette:round_result',
          data: {
            round,
            winningNumber: payload?.winningNumber ?? round.winningNumber,
            color: payload?.color ?? round.color,
            history,
          },
        });
        notifyWalletSettlement('roulette', round.id, round.status);
      }
    });

    const unsubDice = diceEngine.subscribe((event) => {
      touchHeartbeat();
      const round = diceEngine.getPublicRoundState();
      setDiceRound(round);
      setDiceHistory(diceEngine.getHistory());
      setDiceLiveBets(diceEngine.getCurrentRoundBets());
      if (event === 'dice:round_result') {
        notifyWalletSettlement('dice', round.id, round.status);
      }
    });

    const unsubDragonTiger = dragonTigerEngine.subscribe((event) => {
      touchHeartbeat();
      const round = dragonTigerEngine.getPublicRoundState();
      setDragonTigerRound(round);
      setDragonTigerHistory(dragonTigerEngine.getHistory());
      setDragonTigerLiveBets(dragonTigerEngine.getCurrentRoundBets());
      setDragonTigerMyBets(userRef.current?.id ? dragonTigerEngine.getUserBets(userRef.current.id) : []);
      if (event === 'dragon_tiger:round_result') {
        notifyWalletSettlement('dragonTiger', round.id, round.status);
      }
    });

    const unsubAndarBahar = andarBaharEngine.subscribe((event) => {
      touchHeartbeat();
      const round = andarBaharEngine.getPublicRoundState();
      setAndarBaharRound(round);
      setAndarBaharHistory(andarBaharEngine.getHistory());
      setAndarBaharLiveBets(andarBaharEngine.getCurrentRoundBets());
      if (event === 'andar_bahar:round_result') {
        notifyWalletSettlement('andarBahar', round.id, round.status);
      }
    });

    return () => {
      unsubAviator();
      unsubRoulette();
      unsubDice();
      unsubDragonTiger();
      unsubAndarBahar();
    };
  }, [notifyWalletSettlement, refreshWallet]);

  // Smooth 60fps Aviator multiplier easing loop between authoritative engine ticks
  const authoritativeMultiplierRef = useRef(authoritativeMultiplier);
  authoritativeMultiplierRef.current = authoritativeMultiplier;

  useEffect(() => {
    if (roundState.id !== animatedRoundIdRef.current) {
      animatedRoundIdRef.current = roundState.id;
      displayedMultiplierRef.current = 1.0;
      setMultiplier(1.0);
      if (roundState.id && lastAuthoritativeMultiplierRef.current?.roundId !== roundState.id) {
        lastAuthoritativeMultiplierRef.current = {
          value: 1,
          at: Date.now(),
          roundId: roundState.id,
        };
        authoritativeMultiplierRef.current = 1;
        setAuthoritativeMultiplier(1);
      }
    }

    if (roundState.status === 'WAITING') {
      displayedMultiplierRef.current = 1.0;
      setMultiplier(1.0);
      return;
    }

    const terminal = roundState.status === 'CRASHED' || roundState.status === 'SETTLED';
    if (terminal) {
      displayedMultiplierRef.current = authoritativeMultiplierRef.current;
      setMultiplier(authoritativeMultiplierRef.current);
      return;
    }

    let frame = 0;
    let previousTimestamp: number | null = null;
    const animate = (timestamp: number) => {
      if (previousTimestamp === null) previousTimestamp = timestamp;
      const deltaMs = Math.min(50, Math.max(0, timestamp - previousTimestamp));
      previousTimestamp = timestamp;

      const current = displayedMultiplierRef.current;
      const target = Math.max(current, authoritativeMultiplierRef.current);
      const difference = target - current;
      const blend = 1 - Math.exp(-deltaMs / 65);
      const nextValue = difference <= 0.0005 ? target : Math.min(target, current + difference * blend);
      if (nextValue !== current) {
        displayedMultiplierRef.current = nextValue;
        setMultiplier(nextValue);
      }
      frame = window.requestAnimationFrame(animate);
    };

    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [roundState.id, roundState.status]);

  return (
    <GameStateContext.Provider
      value={{
        isConnected,
        apiHealth,
        apiLastCheckedAt,
        apiResponseTimeMs,
        roundDataStatus,
        lastSuccessfulRoundAt,
        lastRoundError,
        isSimulatedFallback,
        isRealtimeConnected,
        lastRealtimeEventAt,
        realtimeEventLagMs,
        realtimeEventCount,
        realtimeSequenceGapCount,
        realtimeStaleEventCount,
        pollingFallbackCount,
        realtimeReconnectCount,
        multiplier,
        roundState,
        recentHistory,
        rouletteRound,
        rouletteHistory,
        addRouletteHistoryItem,
        rouletteLiveBets,
        andarBaharRound,
        andarBaharHistory,
        andarBaharLiveBets,
        dragonTigerRound,
        dragonTigerHistory,
        dragonTigerLiveBets,
        dragonTigerMyBets,
        diceRound,
        diceHistory,
        diceLiveBets,
        lastEvent,
      }}
    >
      {children}
    </GameStateContext.Provider>
  );
};

export function useGameState() {
  const context = useContext(GameStateContext);
  if (!context) {
    throw new Error('useGameState must be used within a GameStateProvider');
  }
  return context;
}
