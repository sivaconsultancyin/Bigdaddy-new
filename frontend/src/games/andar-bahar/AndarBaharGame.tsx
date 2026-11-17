import React, { useState, useEffect, useRef } from 'react';
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
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useGameState } from '../../context/GameStateContext';
import { AndarBaharApi } from './andarBahar.api';
import { SUIT_COLORS } from '../../../../shared/src/utils/teenPatti';
import {
  AndarBaharHistoryItem,
  AndarBaharRound,
  AndarBaharRoundStatus,
} from '../../../../shared/src/types';
import { andarBaharAudio } from './AndarBaharAudio';
import {
  AndarBaharDealerTable,
  ActiveCardThrow,
} from './AndarBaharDealerTable';

const CHIP_DENOMINATIONS = [
  { value: 10, label: '10', ring: 'border-sky-400 bg-sky-950 text-sky-200' },
  { value: 50, label: '50', ring: 'border-rose-400 bg-rose-950 text-rose-200' },
  { value: 100, label: '100', ring: 'border-emerald-400 bg-emerald-950 text-emerald-200' },
  { value: 500, label: '500', ring: 'border-violet-400 bg-violet-950 text-violet-200' },
  { value: 1000, label: '1k', ring: 'border-amber-400 bg-amber-950 text-amber-200' },
  { value: 5000, label: '5k', ring: 'border-yellow-300 bg-zinc-900 text-yellow-200' },
];

export const AndarBaharGame: React.FC<{ onBackToLobby: () => void }> = ({ onBackToLobby }) => {
  const { refreshWallet } = useAuth();
  const {
    andarBaharRound: polledRound,
    andarBaharHistory: polledHistory,
  } = useGameState();

  const [authoritativeRound, setAuthoritativeRound] = useState<AndarBaharRound | null>(null);
  const [authoritativeHistory, setAuthoritativeHistory] = useState<AndarBaharHistoryItem[]>([]);
  const andarBaharRound = authoritativeRound ?? polledRound;
  const andarBaharHistory = authoritativeRound ? authoritativeHistory : polledHistory;

  // Audio & Rules Modal
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [showRulesModal, setShowRulesModal] = useState<boolean>(false);
  const [activeRulesTab, setActiveRulesTab] = useState<'rules' | 'payouts' | 'faq'>('rules');

  // Betting State
  const [selectedChip, setSelectedChip] = useState<number>(50);
  const [myBets, setMyBets] = useState<Record<string, number>>({});
  const [isSubmittingBet, setIsSubmittingBet] = useState<boolean>(false);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Staggered Human Dealer Dealing Animation State
  const [revealedCount, setRevealedCount] = useState<number>(0);
  const [activeThrow, setActiveThrow] = useState<ActiveCardThrow | null>(null);
  const revealedCountRef = useRef<number>(0);
  const isAnimatingThrowRef = useRef<boolean>(false);
  const throwTimerRef = useRef<number | null>(null);
  const revealTimerRef = useRef<number | null>(null);

  // Live Countdown Timer
  const [timeLeftSec, setTimeLeftSec] = useState<number>(13);
  const lastRoundIdRef = useRef<string | null>(null);
  const lastResultFiredRef = useRef<string | null>(null);
  const myBetsRef = useRef<Record<string, number>>({});
  myBetsRef.current = myBets;

  useEffect(() => {
    andarBaharAudio.enabled = soundEnabled;
  }, [soundEnabled]);

  // Fast authoritative polling for smooth one-by-one card dealing & synced myBets
  useEffect(() => {
    let mounted = true;
    const syncState = async () => {
      try {
        const data: any = await AndarBaharApi.getState();
        if (!mounted || !data?.round) return;
        setAuthoritativeRound(data.round);
        if (Array.isArray(data.history)) {
          setAuthoritativeHistory(data.history);
        }
        if (Array.isArray(data.myBets)) {
          const aggregated: Record<string, number> = {};
          for (const b of data.myBets) {
            const amt = Number(b.amount) || 0;
            if (amt > 0 && b.type) {
              aggregated[b.type] = (aggregated[b.type] || 0) + amt;
            }
          }
          setMyBets(aggregated);
        }
      } catch {
        // Retain fallback polled state from GameStateContext
      }
    };

    void syncState();
    const interval = window.setInterval(() => void syncState(), 400);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  // Synchronized countdown timer
  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now();
      if (andarBaharRound.status === AndarBaharRoundStatus.BETTING) {
        const diff = Math.max(0, Math.ceil((andarBaharRound.bettingEndsAt - now) / 1000));
        setTimeLeftSec(diff);
      } else {
        setTimeLeftSec(0);
      }
    }, 200);

    return () => window.clearInterval(interval);
  }, [andarBaharRound.status, andarBaharRound.bettingEndsAt]);

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (throwTimerRef.current) window.clearTimeout(throwTimerRef.current);
      if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
    };
  }, []);

  // Reset visual state on new round boundary
  useEffect(() => {
    if (andarBaharRound.id && andarBaharRound.id !== lastRoundIdRef.current) {
      const isInitialMount = lastRoundIdRef.current === null;
      lastRoundIdRef.current = andarBaharRound.id;
      if (throwTimerRef.current) window.clearTimeout(throwTimerRef.current);
      if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
      isAnimatingThrowRef.current = false;
      setActiveThrow(null);

      // If joining mid-round with cards already dealt, show existing pile immediately
      const initialDealt = Array.isArray(andarBaharRound.dealCards) ? andarBaharRound.dealCards.length : 0;
      const startCount = isInitialMount ? initialDealt : 0;
      revealedCountRef.current = startCount;
      setRevealedCount(startCount);

      if (!isInitialMount && andarBaharRound.status === AndarBaharRoundStatus.BETTING) {
        setMyBets({});
        lastResultFiredRef.current = null;
      }
    }
  }, [andarBaharRound.id, andarBaharRound.status, andarBaharRound.dealCards]);

  // Staggered human dealer card-throwing sequencer
  useEffect(() => {
    const serverCards = Array.isArray(andarBaharRound.dealCards) ? andarBaharRound.dealCards : [];
    if (serverCards.length <= revealedCountRef.current) return;
    if (isAnimatingThrowRef.current) return;

    const dealNext = () => {
      const currentIdx = revealedCountRef.current;
      if (currentIdx >= serverCards.length) {
        isAnimatingThrowRef.current = false;
        setActiveThrow(null);
        return;
      }

      isAnimatingThrowRef.current = true;
      const nextItem = serverCards[currentIdx];
      setActiveThrow({
        key: `${andarBaharRound.id}-${currentIdx}`,
        side: nextItem.side,
        card: nextItem.card,
      });
      andarBaharAudio.playDealSound();

      // Card lands on the felt pile as the dealer throw completes
      throwTimerRef.current = window.setTimeout(() => {
        revealedCountRef.current = currentIdx + 1;
        setRevealedCount(currentIdx + 1);
        setActiveThrow(null);

        revealTimerRef.current = window.setTimeout(() => {
          isAnimatingThrowRef.current = false;
          if (revealedCountRef.current < serverCards.length) {
            dealNext();
          }
        }, 70);
      }, 340);
    };

    dealNext();
  }, [andarBaharRound.id, andarBaharRound.dealCards]);

  // Celebration & audio once all cards are visually dealt and RESULT is active
  useEffect(() => {
    const serverCount = Array.isArray(andarBaharRound.dealCards) ? andarBaharRound.dealCards.length : 0;
    const allVisuallyDealt = revealedCount >= serverCount;

    if (
      andarBaharRound.status === AndarBaharRoundStatus.RESULT &&
      andarBaharRound.winningSide &&
      allVisuallyDealt &&
      lastResultFiredRef.current !== andarBaharRound.id
    ) {
      lastResultFiredRef.current = andarBaharRound.id;
      andarBaharAudio.playMatchSound();

      const currentBets = myBetsRef.current;
      const jokerColor = andarBaharRound.jokerCard ? SUIT_COLORS[andarBaharRound.jokerCard.suit] : null;
      const wonJokerColorBet =
        (jokerColor === 'red' && (currentBets.joker_red ?? 0) > 0) ||
        (jokerColor === 'black' && (currentBets.joker_black ?? 0) > 0);
      const myWonBet = currentBets[andarBaharRound.winningSide] ?? 0;

      if (myWonBet > 0 || wonJokerColorBet) {
        andarBaharAudio.playWinFanfare();
        confetti({
          particleCount: 85,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#10b981', '#f59e0b', '#fbbf24', '#ffffff'],
        });
      }
      refreshWallet();
    }
  }, [
    andarBaharRound.id,
    andarBaharRound.status,
    andarBaharRound.winningSide,
    andarBaharRound.jokerCard,
    andarBaharRound.dealCards,
    revealedCount,
    refreshWallet,
  ]);

  const showNotification = (msg: string) => {
    setNoticeMessage(msg);
    window.setTimeout(() => setNoticeMessage(null), 2800);
  };

  const handlePlaceBet = async (side: string) => {
    if (andarBaharRound.status !== AndarBaharRoundStatus.BETTING) {
      setErrorMessage('Betting is closed for this round. Wait for the next deal.');
      window.setTimeout(() => setErrorMessage(null), 2500);
      return;
    }

    andarBaharAudio.playChipSound();
    setIsSubmittingBet(true);
    setErrorMessage(null);

    try {
      await AndarBaharApi.placeBet({
        bets: [{ type: side, amount: selectedChip.toString() }],
      });

      setMyBets((prev) => ({
        ...prev,
        [side]: (prev[side] || 0) + selectedChip,
      }));

      const labelMap: Record<string, string> = {
        andar: 'ANDAR',
        bahar: 'BAHAR',
        joker_red: 'JOKER RED',
        joker_black: 'JOKER BLACK',
      };
      showNotification(`₹${selectedChip} placed on ${labelMap[side] || side.toUpperCase()}`);
      refreshWallet();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error placing bet');
      window.setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setIsSubmittingBet(false);
    }
  };

  const visibleDealtCards = Array.isArray(andarBaharRound.dealCards)
    ? andarBaharRound.dealCards.slice(0, revealedCount)
    : [];

  const showSettledWinner =
    andarBaharRound.status === AndarBaharRoundStatus.RESULT &&
    revealedCount >= (andarBaharRound.dealCards?.length || 0);

  return (
    <div className="w-full px-3 py-2 space-y-2.5 text-zinc-100 pb-16 select-none font-sans">
      {/* 1. CLEAN SINGLE-ROW TOP NAVIGATION & TABLE CONTROLS */}
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
            Andar Bahar
          </div>
          <div className="text-[11px] text-zinc-400 font-mono tabular-nums">
            Round #{andarBaharRound.roundNumber}
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

      {/* 2. UNBOXED HISTORY & LIVE ROUND PHASE SUMMARY */}
      <div className="space-y-1.5 px-0.5">
        <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
          <div className="font-medium">
            {andarBaharRound.status === AndarBaharRoundStatus.BETTING && (
              <span className="text-emerald-400">Place Your Bets</span>
            )}
            {andarBaharRound.status === AndarBaharRoundStatus.DEALING && (
              <span className="text-amber-300">
                Dealer Dealing · Card {revealedCount}
              </span>
            )}
            {andarBaharRound.status === AndarBaharRoundStatus.RESULT && (
              <span className="text-amber-300 font-semibold">
                {showSettledWinner
                  ? `${andarBaharRound.winningSide?.toUpperCase()} Won · Card ${andarBaharRound.totalCardsDealt}`
                  : `Dealer Dealing · Card ${revealedCount}`}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 font-mono text-xs text-zinc-300">
            <Timer className="w-3.5 h-3.5 text-zinc-400" />
            {andarBaharRound.status === AndarBaharRoundStatus.BETTING ? (
              <span className="font-bold text-emerald-400">{timeLeftSec}s</span>
            ) : andarBaharRound.status === AndarBaharRoundStatus.DEALING || !showSettledWinner ? (
              <span className="text-amber-300 font-semibold">Live</span>
            ) : (
              <span className="text-zinc-400">Next round</span>
            )}
          </div>
        </div>

        {/* Clean Unboxed History Strip */}
        <div className="flex items-center gap-2 text-[11px] text-zinc-400 overflow-x-auto scrollbar-none pb-0.5 tabular-nums">
          <span className="text-zinc-500 shrink-0">Recent</span>
          <div className="flex items-center gap-2">
            {andarBaharHistory.slice(0, 8).map((h, idx) => {
              const isAndar = h.winningSide === 'andar';
              return (
                <React.Fragment key={h.roundNumber ?? idx}>
                  {idx > 0 && <span className="text-zinc-700">/</span>}
                  <span
                    className={`font-mono font-semibold whitespace-nowrap ${
                      isAndar ? 'text-sky-300' : 'text-amber-300'
                    }`}
                    title={`Round #${h.roundNumber}: ${h.winningSide.toUpperCase()} won in ${h.totalCards} cards`}
                  >
                    {isAndar ? 'A' : 'B'}·{h.totalCards}
                  </span>
                </React.Fragment>
              );
            })}
          </div>
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

      {/* 3. AUTHENTIC CASINO TABLE + HUMAN DEALER DEALING ANIMATION */}
      <AndarBaharDealerTable
        status={andarBaharRound.status}
        jokerCard={andarBaharRound.jokerCard}
        firstSide={andarBaharRound.firstSide === 'andar' ? 'andar' : 'bahar'}
        dealtCards={visibleDealtCards}
        activeThrow={activeThrow}
        winningSide={showSettledWinner ? andarBaharRound.winningSide : null}
        andarBetAmount={andarBaharRound.andarBetAmount || '0'}
        baharBetAmount={andarBaharRound.baharBetAmount || '0'}
        totalBetAmount={andarBaharRound.totalBetAmount || '0'}
        totalBetsCount={andarBaharRound.totalBetsCount || 0}
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
                    andarBaharAudio.playChipSound();
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

      {/* 5. JOKER COLOR SIDE WAGERS */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void handlePlaceBet('joker_red')}
          disabled={andarBaharRound.status !== AndarBaharRoundStatus.BETTING || isSubmittingBet}
          className={`p-3 rounded-xl border text-left transition active:scale-[0.98] disabled:opacity-50 ${
            myBets.joker_red
              ? 'bg-red-950/60 border-amber-400 ring-1 ring-amber-400'
              : 'bg-zinc-900 hover:bg-zinc-800/90 border-zinc-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-red-400">Joker Red (♥ / ♦)</span>
            <span className="text-[11px] font-mono text-zinc-400 tabular-nums">1.95x</span>
          </div>
          {myBets.joker_red ? (
            <div className="mt-1 text-[11px] font-mono font-semibold text-amber-300 tabular-nums">
              Bet ₹{myBets.joker_red.toLocaleString()}
            </div>
          ) : (
            <div className="mt-1 text-[11px] text-zinc-500">Trump color wager</div>
          )}
        </button>

        <button
          type="button"
          onClick={() => void handlePlaceBet('joker_black')}
          disabled={andarBaharRound.status !== AndarBaharRoundStatus.BETTING || isSubmittingBet}
          className={`p-3 rounded-xl border text-left transition active:scale-[0.98] disabled:opacity-50 ${
            myBets.joker_black
              ? 'bg-zinc-800 border-amber-400 ring-1 ring-amber-400'
              : 'bg-zinc-900 hover:bg-zinc-800/90 border-zinc-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-200">Joker Black (♠ / ♣)</span>
            <span className="text-[11px] font-mono text-zinc-400 tabular-nums">1.95x</span>
          </div>
          {myBets.joker_black ? (
            <div className="mt-1 text-[11px] font-mono font-semibold text-amber-300 tabular-nums">
              Bet ₹{myBets.joker_black.toLocaleString()}
            </div>
          ) : (
            <div className="mt-1 text-[11px] text-zinc-500">Trump color wager</div>
          )}
        </button>
      </div>

      {/* 6. RULES & PAYOUTS MODAL */}
      {showRulesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-md max-h-[88vh] bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/60">
              <h3 className="text-sm font-semibold text-amber-200">
                Andar Bahar Rules & Payouts
              </h3>
              <button
                type="button"
                onClick={() => setShowRulesModal(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                aria-label="Close rules"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1 p-2 bg-zinc-900 border-b border-zinc-800">
              {(['rules', 'payouts', 'faq'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveRulesTab(tab)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition whitespace-nowrap ${
                    activeRulesTab === tab
                      ? 'bg-amber-500 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {tab === 'rules' ? 'How to Play' : tab === 'payouts' ? 'Payout Odds' : 'Live Table'}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs leading-relaxed text-zinc-300">
              {activeRulesTab === 'rules' && (
                <div className="space-y-3">
                  <div>
                    <h4 className="font-semibold text-amber-300 mb-1">1. Game Objective</h4>
                    <p className="text-zinc-400">
                      The dealer reveals one Joker card in the center of the felt, then alternates dealing cards to Andar and Bahar until a card matching the Joker rank appears.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-amber-300 mb-1">2. First Card Rule</h4>
                    <p className="text-zinc-400">
                      Black Joker (♠ / ♣): first card goes to Andar. Red Joker (♥ / ♦): first card goes to Bahar.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-amber-300 mb-1">3. Settlement</h4>
                    <p className="text-zinc-400">
                      Whichever side receives the matching rank wins immediately and payouts credit automatically to your wallet.
                    </p>
                  </div>
                </div>
              )}

              {activeRulesTab === 'payouts' && (
                <div className="grid grid-cols-2 gap-2.5 tabular-nums">
                  <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-xl">
                    <span className="text-[11px] text-zinc-400 block">First Dealt Side</span>
                    <span className="text-emerald-400 font-mono font-bold text-sm">1.90x</span>
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-xl">
                    <span className="text-[11px] text-zinc-400 block">Second Dealt Side</span>
                    <span className="text-amber-300 font-mono font-bold text-sm">2.00x</span>
                  </div>
                  <div className="col-span-2 bg-zinc-900 border border-zinc-800 p-3 rounded-xl">
                    <span className="text-[11px] text-zinc-400 block">Joker Red / Black</span>
                    <span className="text-zinc-100 font-mono font-bold text-sm">1.95x</span>
                  </div>
                </div>
              )}

              {activeRulesTab === 'faq' && (
                <div>
                  <h4 className="font-semibold text-amber-300 mb-1">Synchronized Live Table</h4>
                  <p className="text-zinc-400">
                    All connected players share the same authoritative server round, Joker card, countdown timer, and card-by-card deal sequence.
                  </p>
                </div>
              )}
            </div>

            <div className="p-3 border-t border-zinc-800 bg-zinc-900/60 flex justify-end">
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
