import React, { useState, useEffect, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';
import {
  ArrowLeft,
  Volume2,
  VolumeX,
  HelpCircle,
  X,
  AlertCircle,
  CheckCircle2,
  Timer,
  Users,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useGameState } from '../../context/GameStateContext';
import { DragonTigerApi } from './dragonTiger.api';
import { getRankLabel } from '../../../../shared/src/utils/teenPatti';
import {
  DragonTigerHistoryItem,
  DragonTigerRound,
  DragonTigerRoundBet,
  DragonTigerRoundStatus,
} from '../../../../shared/src/types';
import { dragonTigerAudio } from './DragonTigerAudio';
import {
  DragonTigerDealerTable,
  DragonTigerRevealStage,
} from './DragonTigerDealerTable';

const CHIP_DENOMINATIONS = [
  { value: 10, label: '10', ring: 'border-sky-400 bg-sky-950 text-sky-200' },
  { value: 50, label: '50', ring: 'border-rose-400 bg-rose-950 text-rose-200' },
  { value: 100, label: '100', ring: 'border-emerald-400 bg-emerald-950 text-emerald-200' },
  { value: 500, label: '500', ring: 'border-violet-400 bg-violet-950 text-violet-200' },
  { value: 1000, label: '1k', ring: 'border-amber-400 bg-amber-950 text-amber-200' },
  { value: 5000, label: '5k', ring: 'border-yellow-300 bg-zinc-900 text-yellow-200' },
];

export const DragonTigerGame: React.FC<{ onBackToLobby: () => void }> = ({ onBackToLobby }) => {
  const { user, refreshWallet } = useAuth();
  const {
    dragonTigerRound: polledRound,
    dragonTigerHistory: polledHistory,
    dragonTigerLiveBets: polledLiveBets,
    dragonTigerMyBets: polledMyBets,
  } = useGameState();

  const [authoritativeRound, setAuthoritativeRound] = useState<DragonTigerRound | null>(null);
  const [authoritativeHistory, setAuthoritativeHistory] = useState<DragonTigerHistoryItem[]>([]);
  const [authoritativeLiveBets, setAuthoritativeLiveBets] = useState<DragonTigerRoundBet[] | null>(null);
  const [authoritativeMyBets, setAuthoritativeMyBets] = useState<Array<{
    id: string;
    roundId: string;
    amount: string;
    type: string;
    status: string;
    payoutAmount: string;
  }> | null>(null);

  const dragonTigerRound = authoritativeRound ?? polledRound;
  const dragonTigerHistory = authoritativeRound ? authoritativeHistory : polledHistory;
  const dragonTigerLiveBets = authoritativeLiveBets ?? polledLiveBets;
  const dragonTigerMyBets = authoritativeMyBets ?? polledMyBets;

  const hasAuthoritativeRound = Boolean(dragonTigerRound.id);
  const canPlaceBets = hasAuthoritativeRound && dragonTigerRound.status === DragonTigerRoundStatus.BETTING;

  // Audio & Modals
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [showRulesModal, setShowRulesModal] = useState<boolean>(false);
  const [activeRulesTab, setActiveRulesTab] = useState<'rules' | 'payouts' | 'rankings' | 'faq'>('rules');
  const [showCommunityDrawer, setShowCommunityDrawer] = useState<boolean>(false);

  // Betting State
  const [selectedChip, setSelectedChip] = useState<number>(50);
  const [myBets, setMyBets] = useState<Record<string, number>>({});
  const [lastRoundBets, setLastRoundBets] = useState<Record<string, number>>({});
  const [isSubmittingBet, setIsSubmittingBet] = useState<boolean>(false);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Slow Suspenseful Dealer Reveal Choreography
  const [revealStage, setRevealStage] = useState<DragonTigerRevealStage>('idle');

  // Countdown Seconds
  const [timeLeftSec, setTimeLeftSec] = useState<number>(12);
  const lastRoundIdRef = useRef<string | null>(null);
  const startedRevealRoundRef = useRef<string | null>(null);
  const lastResultFiredRef = useRef<string | null>(null);
  const lastTickSecondRef = useRef<number | null>(null);
  const pendingTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const revealTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const submittingBetRef = useRef(false);
  const myBetsRef = useRef<Record<string, number>>({});
  myBetsRef.current = myBets;

  const scheduleTimeout = useCallback((callback: () => void, delayMs: number) => {
    const timeout = setTimeout(() => {
      pendingTimeoutsRef.current.delete(timeout);
      callback();
    }, delayMs);
    pendingTimeoutsRef.current.add(timeout);
    return timeout;
  }, []);

  const clearRevealTimers = useCallback(() => {
    revealTimersRef.current.forEach((t) => clearTimeout(t));
    revealTimersRef.current = [];
  }, []);

  useEffect(() => () => {
    pendingTimeoutsRef.current.forEach((t) => clearTimeout(t));
    pendingTimeoutsRef.current.clear();
    clearRevealTimers();
  }, [clearRevealTimers]);

  useEffect(() => {
    dragonTigerAudio.enabled = soundEnabled;
  }, [soundEnabled]);

  // Fast authoritative polling (450ms) so slow reveal starts cleanly with server
  useEffect(() => {
    let mounted = true;
    const syncState = async () => {
      try {
        const data: any = await DragonTigerApi.getState();
        if (!mounted || !data?.round) return;
        setAuthoritativeRound(data.round);
        if (Array.isArray(data.history)) {
          setAuthoritativeHistory(data.history);
        }
        if (Array.isArray(data.allBets)) {
          setAuthoritativeLiveBets(data.allBets);
        }
        if (Array.isArray(data.myBets)) {
          setAuthoritativeMyBets(data.myBets);
        }
      } catch {
        // Fallback to polled context
      }
    };

    void syncState();
    const interval = window.setInterval(() => void syncState(), 450);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  // Synchronized countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      if (dragonTigerRound.status === DragonTigerRoundStatus.BETTING) {
        const diff = Math.max(0, Math.ceil((dragonTigerRound.bettingEndsAt - now) / 1000));
        setTimeLeftSec(diff);
        if (diff <= 3 && diff > 0 && lastTickSecondRef.current !== diff) {
          lastTickSecondRef.current = diff;
          dragonTigerAudio.playTick();
        }
      } else {
        lastTickSecondRef.current = null;
        setTimeLeftSec(0);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [dragonTigerRound.status, dragonTigerRound.bettingEndsAt]);

  // Reconcile personal bet totals from server myBets
  useEffect(() => {
    if (!dragonTigerRound.id) return;
    const currentRoundBets = dragonTigerMyBets.filter((b) => b.roundId === dragonTigerRound.id);
    const totals: Record<string, number> = {};
    for (const bet of currentRoundBets) {
      const type = String(bet.type ?? '').toLowerCase();
      const amount = Number(bet.amount);
      if (['dragon', 'tiger', 'tie'].includes(type) && Number.isFinite(amount)) {
        totals[type] = (totals[type] || 0) + amount;
      }
    }
    setMyBets(totals);
  }, [dragonTigerMyBets, dragonTigerRound.id]);

  // Round boundary & slow suspenseful reveal choreography
  useEffect(() => {
    if (!dragonTigerRound.id) return;

    if (dragonTigerRound.id !== lastRoundIdRef.current) {
      const isInitialMount = lastRoundIdRef.current === null;
      lastRoundIdRef.current = dragonTigerRound.id;
      clearRevealTimers();
      startedRevealRoundRef.current = null;

      if (!isInitialMount && Object.keys(myBetsRef.current).length > 0) {
        setLastRoundBets(myBetsRef.current);
      }

      if (dragonTigerRound.status === DragonTigerRoundStatus.BETTING) {
        setRevealStage('idle');
        setMyBets({});
        lastResultFiredRef.current = null;
      } else if (isInitialMount && dragonTigerRound.status === DragonTigerRoundStatus.RESULT) {
        // Joined while result is already shown
        setRevealStage('both_revealed');
      }
    }

    if (
      dragonTigerRound.status === DragonTigerRoundStatus.REVEALING &&
      startedRevealRoundRef.current !== dragonTigerRound.id
    ) {
      startedRevealRoundRef.current = dragonTigerRound.id;
      clearRevealTimers();

      // Stage 1 (0ms): Dealer reaches & slowly places Dragon card face-down
      setRevealStage('dealing_dragon');
      dragonTigerAudio.playDealSound();

      // Stage 2 (950ms): Dealer turns & slowly places Tiger card face-down
      revealTimersRef.current.push(
        setTimeout(() => {
          setRevealStage('dealing_tiger');
          dragonTigerAudio.playDealSound();
        }, 950),
      );

      // Stage 3 (1900ms): Both cards lie face-down building tension
      revealTimersRef.current.push(
        setTimeout(() => {
          setRevealStage('suspense_hold');
        }, 1900),
      );

      // Stage 4 (2500ms): Slow 3D flip of Dragon card
      revealTimersRef.current.push(
        setTimeout(() => {
          setRevealStage('revealing_dragon');
          dragonTigerAudio.playFlipSound();
        }, 2500),
      );

      // Stage 5 (3600ms): Curiosity pause showing Dragon rank while Tiger is still hidden
      revealTimersRef.current.push(
        setTimeout(() => {
          setRevealStage('curiosity_pause');
        }, 3600),
      );

      // Stage 6 (4350ms): Dramatic slow 3D flip of Tiger card
      revealTimersRef.current.push(
        setTimeout(() => {
          setRevealStage('revealing_tiger');
          dragonTigerAudio.playFlipSound();
        }, 4350),
      );

      // Stage 7 (5450ms): Both cards settled face-up ready for RESULT celebration
      revealTimersRef.current.push(
        setTimeout(() => {
          setRevealStage('both_revealed');
        }, 5450),
      );
    }

    // Fallback: if RESULT arrived without running REVEALING (e.g. tab backgrounded), reveal cleanly
    if (
      dragonTigerRound.status === DragonTigerRoundStatus.RESULT &&
      startedRevealRoundRef.current !== dragonTigerRound.id &&
      revealStage !== 'both_revealed'
    ) {
      startedRevealRoundRef.current = dragonTigerRound.id;
      setRevealStage('both_revealed');
    }
  }, [dragonTigerRound.id, dragonTigerRound.status, clearRevealTimers, revealStage]);

  // Victory sound, confetti & wallet refresh only after both cards are visually revealed
  useEffect(() => {
    if (
      dragonTigerRound.status === DragonTigerRoundStatus.RESULT &&
      dragonTigerRound.winner &&
      revealStage === 'both_revealed' &&
      lastResultFiredRef.current !== dragonTigerRound.id
    ) {
      lastResultFiredRef.current = dragonTigerRound.id;

      if (dragonTigerRound.winner === 'dragon') {
        dragonTigerAudio.playDragonVictory();
      } else if (dragonTigerRound.winner === 'tiger') {
        dragonTigerAudio.playTigerVictory();
      } else {
        dragonTigerAudio.playTieSound();
      }

      const w = dragonTigerRound.winner;
      const roundMyBets = dragonTigerMyBets.filter((b) => b.roundId === dragonTigerRound.id);
      const userWon = roundMyBets.some(
        (bet) =>
          String(bet.type).toLowerCase() === w &&
          String(bet.status).toUpperCase() === 'WON',
      );

      if (userWon) {
        dragonTigerAudio.playWinFanfare();
        confetti({
          particleCount: 95,
          spread: 75,
          origin: { y: 0.6 },
          colors: ['#ef4444', '#f59e0b', '#10b981', '#ffffff'],
        });
      }
      refreshWallet();
    }
  }, [
    dragonTigerRound.id,
    dragonTigerRound.status,
    dragonTigerRound.winner,
    revealStage,
    dragonTigerMyBets,
    refreshWallet,
  ]);

  const showNotification = (msg: string) => {
    setNoticeMessage(msg);
    scheduleTimeout(() => setNoticeMessage(null), 2800);
  };

  const handlePlaceBet = async (side: 'dragon' | 'tiger' | 'tie') => {
    if (!hasAuthoritativeRound || dragonTigerRound.status !== DragonTigerRoundStatus.BETTING) {
      setErrorMessage('Betting is closed for this round. Wait for the next deal.');
      scheduleTimeout(() => setErrorMessage(null), 2500);
      return;
    }

    if (submittingBetRef.current || !user?.id) return;
    submittingBetRef.current = true;
    dragonTigerAudio.playChipSound();
    setIsSubmittingBet(true);
    setErrorMessage(null);

    try {
      await DragonTigerApi.placeBet(
        { bets: [{ type: side, amount: selectedChip.toString() }] },
        user.id,
      );
      setMyBets((prev) => ({
        ...prev,
        [side]: (prev[side] || 0) + selectedChip,
      }));
      showNotification(`₹${selectedChip} placed on ${side.toUpperCase()}`);
      refreshWallet();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error placing bet');
      scheduleTimeout(() => setErrorMessage(null), 3200);
    } finally {
      submittingBetRef.current = false;
      setIsSubmittingBet(false);
    }
  };

  const handleDoubleBets = async () => {
    if (!canPlaceBets || submittingBetRef.current || !user?.id) return;
    const currentKeys = Object.keys(myBets).filter((k) => myBets[k] > 0);
    if (currentKeys.length === 0) return;

    const additionalBets = currentKeys.map((k) => ({
      type: k,
      amount: myBets[k].toString(),
    }));

    submittingBetRef.current = true;
    setIsSubmittingBet(true);
    try {
      await DragonTigerApi.placeBet({ bets: additionalBets }, user.id);
      dragonTigerAudio.playChipSound();
      setMyBets((prev) => {
        const next = { ...prev };
        for (const k of currentKeys) next[k] = next[k] * 2;
        return next;
      });
      showNotification('Bets doubled');
      refreshWallet();
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not double bets');
      scheduleTimeout(() => setErrorMessage(null), 3000);
    } finally {
      submittingBetRef.current = false;
      setIsSubmittingBet(false);
    }
  };

  const handleRebet = async () => {
    if (!canPlaceBets || submittingBetRef.current || !user?.id) return;
    const rebetKeys = Object.keys(lastRoundBets).filter((k) => lastRoundBets[k] > 0);
    if (rebetKeys.length === 0) return;

    const betsToPlace = rebetKeys.map((k) => ({
      type: k,
      amount: lastRoundBets[k].toString(),
    }));

    submittingBetRef.current = true;
    setIsSubmittingBet(true);
    try {
      await DragonTigerApi.placeBet({ bets: betsToPlace }, user.id);
      dragonTigerAudio.playChipSound();
      setMyBets((prev) => {
        const next = { ...prev };
        for (const k of rebetKeys) next[k] = (next[k] || 0) + lastRoundBets[k];
        return next;
      });
      showNotification('Previous bets repeated');
      refreshWallet();
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not repeat bets');
      scheduleTimeout(() => setErrorMessage(null), 3000);
    } finally {
      submittingBetRef.current = false;
      setIsSubmittingBet(false);
    }
  };

  const totalMyBetAmount = Object.values(myBets).reduce((acc, v) => acc + v, 0);

  const totalRounds = dragonTigerHistory.length || 1;
  const dragonWins = dragonTigerHistory.filter((h) => h.winner === 'dragon').length;
  const tigerWins = dragonTigerHistory.filter((h) => h.winner === 'tiger').length;
  const tieWins = dragonTigerHistory.filter((h) => h.winner === 'tie').length;
  const dragonPct = Math.round((dragonWins / totalRounds) * 100);
  const tigerPct = Math.round((tigerWins / totalRounds) * 100);
  const tiePct = Math.round((tieWins / totalRounds) * 100);

  const settledVisible =
    dragonTigerRound.status === DragonTigerRoundStatus.RESULT &&
    revealStage === 'both_revealed';

  return (
    <div className="w-full px-3 py-2 space-y-2.5 text-zinc-100 pb-16 select-none font-sans">
      {/* 1. CLEAN SINGLE-ROW HEADER */}
      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-zinc-800/80">
        <button
          type="button"
          onClick={onBackToLobby}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-medium border border-zinc-800 transition active:scale-95 whitespace-nowrap shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Lobby</span>
        </button>

        <div className="text-center min-w-0">
          <div className="text-sm font-semibold text-zinc-100 tracking-tight truncate">
            Dragon Tiger
          </div>
          <div className="text-[11px] text-zinc-400 font-mono tabular-nums">
            Round #{dragonTigerRound.roundNumber}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowRulesModal(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-zinc-300 hover:text-amber-300 transition rounded-lg bg-zinc-900 hover:bg-zinc-800 text-xs font-medium border border-zinc-800 whitespace-nowrap"
          >
            <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
            <span>Rules</span>
          </button>
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 text-zinc-400 hover:text-amber-300 transition rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800"
            aria-label={soundEnabled ? 'Mute sound' : 'Enable sound'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-amber-400" /> : <VolumeX className="w-4 h-4 text-zinc-500" />}
          </button>
        </div>
      </div>

      {/* 2. UNBOXED STATUS, COUNTDOWN & ROADMAP */}
      <div className="space-y-1.5 px-0.5">
        <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
          <div className="font-medium">
            {!hasAuthoritativeRound && (
              <span className="text-zinc-400">Connecting to table</span>
            )}
            {hasAuthoritativeRound && dragonTigerRound.status === DragonTigerRoundStatus.BETTING && (
              <span className="text-emerald-400">Place Your Bets</span>
            )}
            {(dragonTigerRound.status === DragonTigerRoundStatus.REVEALING ||
              (dragonTigerRound.status === DragonTigerRoundStatus.RESULT && !settledVisible)) && (
              <span className="text-amber-300">Slow Card Reveal</span>
            )}
            {settledVisible && (
              <span className="text-amber-300 font-semibold">
                {dragonTigerRound.winner === 'tie'
                  ? 'Tie Round · 9:1 Payout'
                  : `${dragonTigerRound.winner?.toUpperCase()} Won`}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowCommunityDrawer(true)}
              className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition tabular-nums"
            >
              <Users className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-mono">{dragonTigerRound.totalBetsCount || 0}</span>
            </button>

            <div className="flex items-center gap-1.5 font-mono text-xs text-zinc-300">
              <Timer className="w-3.5 h-3.5 text-zinc-400" />
              {canPlaceBets ? (
                <span className={`font-bold ${timeLeftSec <= 3 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {timeLeftSec}s
                </span>
              ) : (
                <span className="text-amber-300">
                  {settledVisible ? 'Next round' : 'Revealing'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Unboxed Roadmap & Percentages */}
        <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400 tabular-nums">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            <span className="text-zinc-500 shrink-0">Recent</span>
            {dragonTigerHistory.length === 0 ? (
              <span className="text-zinc-600">No rounds settled yet</span>
            ) : (
              dragonTigerHistory.slice(0, 10).map((item, idx) => (
                <React.Fragment key={item.roundNumber ?? idx}>
                  {idx > 0 && <span className="text-zinc-700">/</span>}
                  <span
                    className={`font-mono font-semibold whitespace-nowrap ${
                      item.winner === 'dragon'
                        ? 'text-red-400'
                        : item.winner === 'tiger'
                        ? 'text-amber-300'
                        : 'text-emerald-400'
                    }`}
                    title={`Round #${item.roundNumber}: D ${getRankLabel(item.dragonCard.rank)} vs T ${getRankLabel(item.tigerCard.rank)}`}
                  >
                    {item.winner === 'dragon' ? 'D' : item.winner === 'tiger' ? 'T' : 'Tie'}
                  </span>
                </React.Fragment>
              ))
            )}
          </div>

          {dragonTigerHistory.length > 0 && (
            <div className="flex items-center gap-2 font-mono text-[11px] shrink-0">
              <span className="text-red-400">D {dragonPct}%</span>
              <span className="text-amber-300">T {tigerPct}%</span>
              <span className="text-emerald-400">Tie {tiePct}%</span>
            </div>
          )}
        </div>
      </div>

      {/* Notices */}
      {noticeMessage && (
        <div className="px-3 py-2 rounded-lg bg-emerald-950/70 border border-emerald-700/50 text-emerald-200 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{noticeMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="px-3 py-2 rounded-lg bg-red-950/80 border border-red-800/60 text-red-200 text-xs font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 3. CASINO TABLE + HUMAN DEALER SLOW REVEAL STAGE */}
      <DragonTigerDealerTable
        status={dragonTigerRound.status}
        revealStage={revealStage}
        dragonCard={dragonTigerRound.dragonCard}
        tigerCard={dragonTigerRound.tigerCard}
        winner={dragonTigerRound.winner}
        dragonBetAmount={dragonTigerRound.dragonBetAmount || '0'}
        tigerBetAmount={dragonTigerRound.tigerBetAmount || '0'}
        tieBetAmount={dragonTigerRound.tieBetAmount || '0'}
        totalBetAmount={dragonTigerRound.totalBetAmount || '0'}
        totalBetsCount={dragonTigerRound.totalBetsCount || 0}
        myBets={myBets}
        selectedChip={selectedChip}
        isSubmittingBet={isSubmittingBet}
        onPlaceBet={(side) => void handlePlaceBet(side)}
      />

      {/* 4. CASINO CHIP SELECTOR TRAY */}
      <div className="rounded-xl bg-zinc-900/90 border border-zinc-800 p-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-zinc-400 shrink-0 pl-1">Chip</span>
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
            {CHIP_DENOMINATIONS.map((chip) => {
              const isSelected = selectedChip === chip.value;
              return (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => {
                    setSelectedChip(chip.value);
                    dragonTigerAudio.playChipSound();
                  }}
                  className={`w-10 h-10 rounded-full border-2 border-dashed font-mono font-bold text-[11px] flex items-center justify-center shrink-0 transition-transform active:scale-95 tabular-nums ${
                    chip.ring
                  } ${
                    isSelected
                      ? 'ring-2 ring-amber-400 scale-105 shadow-[0_0_12px_rgba(251,191,36,0.35)]'
                      : 'opacity-75 hover:opacity-100'
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 5. ROUND CONTROLS & CURRENT STAKE */}
      <div className="flex items-center justify-between gap-2 bg-zinc-900/80 border border-zinc-800 rounded-xl px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleDoubleBets()}
            disabled={!canPlaceBets || totalMyBetAmount === 0 || isSubmittingBet}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-amber-300 text-xs font-semibold border border-zinc-700 transition active:scale-95"
          >
            2x Double
          </button>
          <button
            type="button"
            onClick={() => void handleRebet()}
            disabled={!canPlaceBets || isSubmittingBet || Object.keys(lastRoundBets).length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 text-xs font-semibold border border-zinc-700 transition active:scale-95"
          >
            <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
            <span>Rebet</span>
          </button>
        </div>

        <div className="text-right tabular-nums">
          <div className="text-[11px] text-zinc-400">Your Round Bet</div>
          <div className="text-sm font-mono font-bold text-amber-300">
            ₹{totalMyBetAmount.toLocaleString()}
          </div>
        </div>
      </div>

      {/* 6. LIVE COMMUNITY BETS DRAWER */}
      {showCommunityDrawer && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs flex justify-end">
          <div className="w-80 max-w-[85vw] h-full bg-zinc-950 border-l border-zinc-800 p-4 flex flex-col justify-between shadow-2xl">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-amber-400" />
                  <h3 className="font-semibold text-sm text-zinc-100">Live Player Bets</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCommunityDrawer(false)}
                  className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white"
                  aria-label="Close live bets"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-3 space-y-2 max-h-[75vh] overflow-y-auto pr-1">
                {dragonTigerLiveBets.length === 0 ? (
                  <p className="text-xs text-zinc-500 text-center py-8">
                    No bets placed in this round yet.
                  </p>
                ) : (
                  dragonTigerLiveBets.map((bet) => (
                    <div
                      key={bet.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs"
                    >
                      <div>
                        <div className="font-medium text-zinc-200">{bet.username}</div>
                        <div
                          className={`text-[11px] font-semibold uppercase ${
                            bet.type === 'dragon'
                              ? 'text-red-400'
                              : bet.type === 'tiger'
                              ? 'text-amber-300'
                              : 'text-emerald-400'
                          }`}
                        >
                          {bet.type}
                        </div>
                      </div>
                      <span className="font-mono font-bold text-zinc-100 tabular-nums">
                        ₹{parseInt(bet.amount, 10).toLocaleString()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. RULES & PAYOUTS MODAL */}
      {showRulesModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl p-4 shadow-2xl flex flex-col max-h-[88vh] overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="font-semibold text-sm text-amber-200">
                Dragon Tiger Rules & Payouts
              </h3>
              <button
                type="button"
                onClick={() => setShowRulesModal(false)}
                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition"
                aria-label="Close rules"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1 p-2 bg-zinc-900 rounded-xl my-2.5">
              {(['rules', 'payouts', 'rankings', 'faq'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveRulesTab(tab)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                    activeRulesTab === tab
                      ? 'bg-amber-500 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {tab === 'rules'
                    ? 'Rules'
                    : tab === 'payouts'
                    ? 'Payouts'
                    : tab === 'rankings'
                    ? 'Card Ranks'
                    : 'FAQ'}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto py-1 text-xs text-zinc-300 space-y-3">
              {activeRulesTab === 'rules' && (
                <div className="space-y-3">
                  <div>
                    <h4 className="font-semibold text-amber-300 mb-1">1. Objective</h4>
                    <p className="leading-relaxed text-zinc-400">
                      The dealer places one card face-down on Dragon and one face-down on Tiger, then flips Dragon first followed by Tiger. Whichever side draws the higher rank wins.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-amber-300 mb-1">2. Card Values</h4>
                    <p className="leading-relaxed text-zinc-400">
                      Ace is the lowest card (1 point) and King is the highest (13 points). Suits do not break ties—equal ranks result in a Tie round.
                    </p>
                  </div>
                </div>
              )}

              {activeRulesTab === 'payouts' && (
                <div className="space-y-2 tabular-nums">
                  <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-zinc-900 border border-zinc-800">
                    <span className="font-semibold text-red-400">Dragon</span>
                    <span className="font-mono font-bold text-white">1 : 1</span>
                    <span className="text-zinc-400">Dragon card higher</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-zinc-900 border border-zinc-800">
                    <span className="font-semibold text-amber-300">Tiger</span>
                    <span className="font-mono font-bold text-white">1 : 1</span>
                    <span className="text-zinc-400">Tiger card higher</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-zinc-900 border border-zinc-800">
                    <span className="font-semibold text-emerald-400">Tie</span>
                    <span className="font-mono font-bold text-emerald-300">9 : 1</span>
                    <span className="text-zinc-400">Equal rank (9x payout)</span>
                  </div>
                </div>
              )}

              {activeRulesTab === 'rankings' && (
                <div className="space-y-2">
                  <div className="text-zinc-400">Lowest to highest card rank:</div>
                  <div className="flex flex-wrap gap-1.5 font-mono text-xs">
                    {['A (1)', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J (11)', 'Q (12)', 'K (13)'].map((label) => (
                      <span
                        key={label}
                        className="px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {activeRulesTab === 'faq' && (
                <div className="space-y-2.5">
                  <div>
                    <h5 className="font-semibold text-amber-300 mb-1">What happens on a Tie?</h5>
                    <p className="text-zinc-400">
                      Only Tie bets win (9:1 gross payout). Dragon and Tiger bets lose when both cards share the same rank.
                    </p>
                  </div>
                  <div>
                    <h5 className="font-semibold text-amber-300 mb-1">When do payouts credit?</h5>
                    <p className="text-zinc-400">
                      Winning payouts settle automatically into your wallet at the end of the reveal phase.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 mt-2 border-t border-zinc-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowRulesModal(false)}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs transition active:scale-95"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
