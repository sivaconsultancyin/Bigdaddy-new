import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  ArrowLeft,
  Volume2,
  VolumeX,
  HelpCircle,
  Eye,
  RotateCcw,
  X,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { TeenPattiApi } from './teenPatti.api';
import {
  Card,
  evaluateTeenPattiHand,
} from '../../../../shared/src/utils/teenPatti';
import { teenPattiAudio } from './TeenPattiAudio';
import {
  TeenPattiDealerTable,
  ActiveTeenPattiThrow,
} from './TeenPattiDealerTable';

interface PlayerState {
  id: string;
  name: string;
  isAi: boolean;
  isSeen: boolean;
  hasFolded: boolean;
  totalBet: number;
  cards: Card[] | null;
}

const CHIP_DENOMINATIONS = [
  { value: 50, label: '50', ring: 'border-rose-400 bg-rose-950 text-rose-200' },
  { value: 100, label: '100', ring: 'border-emerald-400 bg-emerald-950 text-emerald-200' },
  { value: 500, label: '500', ring: 'border-violet-400 bg-violet-950 text-violet-200' },
  { value: 1000, label: '1k', ring: 'border-amber-400 bg-amber-950 text-amber-200' },
  { value: 5000, label: '5k', ring: 'border-yellow-300 bg-zinc-900 text-yellow-200' },
];

const DEAL_SEQUENCE: Array<{ target: 'player' | 'dealer'; slotIndex: 0 | 1 | 2 }> = [
  { target: 'player', slotIndex: 0 },
  { target: 'dealer', slotIndex: 0 },
  { target: 'player', slotIndex: 1 },
  { target: 'dealer', slotIndex: 1 },
  { target: 'player', slotIndex: 2 },
  { target: 'dealer', slotIndex: 2 },
];

export const TeenPattiGame: React.FC<{ onBackToLobby: () => void }> = ({ onBackToLobby }) => {
  const { user, refreshWallet } = useAuth();

  // Audio & Rules Modal
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [showRulesModal, setShowRulesModal] = useState<boolean>(false);
  const [activeRulesTab, setActiveRulesTab] = useState<'ranks' | 'rules' | 'payouts'>('ranks');

  // Table State: Heads-up (Player vs Dealer)
  const [roundNumber, setRoundNumber] = useState<number>(101);
  const [bootAmount, setBootAmount] = useState<number>(50);
  const [selectedChip, setSelectedChip] = useState<number>(50);
  const [currentStake, setCurrentStake] = useState<number>(50);
  const [tablePot, setTablePot] = useState<number>(100);
  const [gameState, setGameState] = useState<'IDLE' | 'DEALING' | 'BETTING' | 'SHOWDOWN' | 'SETTLED'>('IDLE');

  // Player and Dealer
  const [player, setPlayer] = useState<PlayerState>({
    id: user?.id || 'player-self',
    name: user?.username || 'You',
    isAi: false,
    isSeen: false,
    hasFolded: false,
    totalBet: 50,
    cards: null,
  });

  const [dealer, setDealer] = useState<PlayerState>({
    id: 'dealer',
    name: 'Dealer',
    isAi: true,
    isSeen: false,
    hasFolded: false,
    totalBet: 50,
    cards: null,
  });

  // Cards & Card-by-Card Dealing / Reveal Counters
  const [playerCards, setPlayerCards] = useState<Card[]>([]);
  const [dealerCards, setDealerCards] = useState<Card[]>([]);
  const [playerDealtCount, setPlayerDealtCount] = useState<number>(0);
  const [dealerDealtCount, setDealerDealtCount] = useState<number>(0);
  const [dealerRevealedCount, setDealerRevealedCount] = useState<number>(0);
  const [activeThrow, setActiveThrow] = useState<ActiveTeenPattiThrow | null>(null);

  // Animations & Visuals
  const [isDealingAnimation, setIsDealingAnimation] = useState<boolean>(false);
  const [chipFlyingToPot, setChipFlyingToPot] = useState<boolean>(false);
  const [winnerInfo, setWinnerInfo] = useState<{ id: string; name: string; hand: string; amount: number } | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const timersRef = useRef<number[]>([]);
  const isMountedRef = useRef<boolean>(true);

  const clearScheduledTimers = () => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
    }
    timersRef.current = [];
  };

  const scheduleTimeout = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      if (isMountedRef.current) fn();
    }, ms);
    timersRef.current.push(id);
    return id;
  };

  useEffect(() => {
    teenPattiAudio.enabled = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearScheduledTimers();
    };
  }, []);

  // Resume active table if one is in progress; otherwise start a fresh round with card-by-card deal
  useEffect(() => {
    let active = true;
    const initTable = async () => {
      try {
        const stateRes: any = await TeenPattiApi.getState();
        if (!active) return;
        const table = stateRes?.table;
        if (table && table.status === 'BETTING') {
          const serverPlayer = table.players?.find((p: any) => !p.isAi);
          const serverDealer = table.players?.find((p: any) => p.isAi);
          setBootAmount(table.bootAmount ?? 50);
          setCurrentStake(table.currentStake ?? 50);
          setTablePot(table.pot ?? 100);
          setRoundNumber(table.roundNumber ?? 101);
          setPlayer({
            id: serverPlayer?.id || user?.id || 'player-self',
            name: serverPlayer?.name || user?.username || 'You',
            isAi: false,
            isSeen: Boolean(serverPlayer?.isSeen),
            hasFolded: Boolean(serverPlayer?.hasFolded),
            totalBet: serverPlayer?.totalBet ?? 50,
            cards: serverPlayer?.cards ?? null,
          });
          setDealer({
            id: 'dealer',
            name: serverDealer?.name || 'Dealer',
            isAi: true,
            isSeen: Boolean(serverDealer?.isSeen),
            hasFolded: Boolean(serverDealer?.hasFolded),
            totalBet: serverDealer?.totalBet ?? 50,
            cards: null,
          });
          if (Array.isArray(serverPlayer?.cards)) {
            setPlayerCards(serverPlayer.cards);
          }
          setPlayerDealtCount(3);
          setDealerDealtCount(3);
          setDealerRevealedCount(0);
          setGameState('BETTING');
          return;
        }
      } catch {
        // Start a fresh round
      }
      if (active) {
        void handleStartNewRound(50);
      }
    };
    void initTable();
    return () => {
      active = false;
    };
  }, []);

  const showNotification = (msg: string) => {
    setNoticeMessage(msg);
    scheduleTimeout(() => setNoticeMessage(null), 2800);
  };

  // Start new round with card-by-card Human Dealer dealing animation
  const handleStartNewRound = async (stake: number = selectedChip) => {
    if (isDealingAnimation) return;
    clearScheduledTimers();
    setErrorMessage(null);
    setWinnerInfo(null);
    setGameState('DEALING');
    setIsDealingAnimation(true);
    setPlayerCards([]);
    setDealerCards([]);
    setPlayerDealtCount(0);
    setDealerDealtCount(0);
    setDealerRevealedCount(0);
    setActiveThrow(null);

    try {
      const res: any = await TeenPattiApi.startBoot({ bootAmount: stake });
      if (!isMountedRef.current) return;
      const table = res?.table;
      const serverPlayer = table?.players?.find((p: any) => !p.isAi);
      const serverDealer = table?.players?.find((p: any) => p.isAi);
      const nextRoundNum = table?.roundNumber ?? roundNumber + 1;

      setBootAmount(table?.bootAmount ?? stake);
      setCurrentStake(table?.currentStake ?? stake);
      setTablePot(table?.pot ?? stake * 2);
      setRoundNumber(nextRoundNum);

      setPlayer({
        id: serverPlayer?.id || user?.id || 'player-self',
        name: serverPlayer?.name || user?.username || 'You',
        isAi: false,
        isSeen: Boolean(serverPlayer?.isSeen),
        hasFolded: Boolean(serverPlayer?.hasFolded),
        totalBet: serverPlayer?.totalBet ?? stake,
        cards: serverPlayer?.cards ?? null,
      });

      setDealer({
        id: 'dealer',
        name: serverDealer?.name || 'Dealer',
        isAi: true,
        isSeen: Boolean(serverDealer?.isSeen),
        hasFolded: Boolean(serverDealer?.hasFolded),
        totalBet: serverDealer?.totalBet ?? stake,
        cards: null,
      });

      refreshWallet();

      // Deal all 6 cards one by one from the shoe with throw + landing sync
      const stepIntervalMs = 390;
      const throwFlightMs = 310;

      DEAL_SEQUENCE.forEach((step, idx) => {
        const startMs = idx * stepIntervalMs;
        scheduleTimeout(() => {
          setActiveThrow({
            key: `tp-deal-${nextRoundNum}-${idx}`,
            target: step.target,
            slotIndex: step.slotIndex,
          });
          teenPattiAudio.playDealSound();

          scheduleTimeout(() => {
            if (step.target === 'player') {
              setPlayerDealtCount(step.slotIndex + 1);
            } else {
              setDealerDealtCount(step.slotIndex + 1);
            }
            setActiveThrow(null);
          }, throwFlightMs);
        }, startMs);
      });

      const totalDealDurationMs = DEAL_SEQUENCE.length * stepIntervalMs + 120;
      scheduleTimeout(() => {
        setActiveThrow(null);
        setPlayerDealtCount(3);
        setDealerDealtCount(3);
        setIsDealingAnimation(false);
        setGameState('BETTING');
        teenPattiAudio.playChipSound();
        showNotification(`Round #${nextRoundNum} started · Boot ₹${stake}`);
      }, totalDealDurationMs);
    } catch (err: any) {
      setIsDealingAnimation(false);
      setActiveThrow(null);
      setGameState('SETTLED');
      setErrorMessage(err?.message || 'Unable to start Teen Patti round');
    }
  };

  // See Cards action: reveals player's 3 cards
  const handleSeeCards = async () => {
    if (player.isSeen || gameState !== 'BETTING' || isDealingAnimation) return;

    teenPattiAudio.playFlipSound();
    try {
      const res: any = await TeenPattiApi.performAction({ action: 'see' });
      const serverPlayer = res?.table?.players?.find((p: any) => !p.isAi);
      const seenCards: Card[] = Array.isArray(serverPlayer?.cards) ? serverPlayer.cards : [];

      setPlayerCards(seenCards);
      setPlayer((prev) => ({ ...prev, isSeen: true, cards: seenCards }));

      if (seenCards.length === 3) {
        const evalResult = evaluateTeenPattiHand(seenCards);
        showNotification(`Hand Seen: ${evalResult.name} · Chaal ₹${currentStake * 2}`);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to reveal cards');
    }
  };

  // Blind or Chaal bet
  const handlePlaceBet = async (isBlind: boolean) => {
    if (gameState !== 'BETTING' || isDealingAnimation || player.hasFolded) return;
    const betAmount = isBlind ? currentStake : currentStake * 2;

    setChipFlyingToPot(true);
    teenPattiAudio.playChipSound();
    setErrorMessage(null);

    try {
      const res: any = await TeenPattiApi.performAction({
        action: isBlind ? 'blind' : 'chaal',
        amount: betAmount,
      });
      const table = res?.table;
      const serverPlayer = table?.players?.find((p: any) => !p.isAi);
      const serverDealer = table?.players?.find((p: any) => p.isAi);

      setPlayer((prev) => ({ ...prev, totalBet: serverPlayer?.totalBet ?? prev.totalBet + betAmount }));
      setDealer((prev) => ({ ...prev, totalBet: serverDealer?.totalBet ?? prev.totalBet + betAmount }));
      setTablePot(table?.pot ?? tablePot + betAmount * 2);
      refreshWallet();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error placing bet');
    } finally {
      scheduleTimeout(() => {
        setChipFlyingToPot(false);
        teenPattiAudio.playChipSound();
      }, 360);
    }
  };

  // Pack (Fold)
  const handlePack = async () => {
    if (gameState !== 'BETTING' || isDealingAnimation) return;

    teenPattiAudio.playFoldSound();
    setErrorMessage(null);

    try {
      const res: any = await TeenPattiApi.performAction({ action: 'pack' });
      const table = res?.table;
      const serverDealer = table?.players?.find((p: any) => p.isAi);
      const revealedDealerCards: Card[] = Array.isArray(serverDealer?.cards) ? serverDealer.cards : [];
      if (revealedDealerCards.length === 3) {
        setDealerCards(revealedDealerCards);
        setDealerRevealedCount(3);
      }

      setPlayer((prev) => ({ ...prev, hasFolded: true }));
      setGameState('SETTLED');
      setWinnerInfo({
        id: table?.winnerId || 'dealer',
        name: 'Dealer',
        hand: table?.winnerHand ? `Folded · Dealer had ${table.winnerHand}` : 'Player Folded',
        amount: table?.winAmount ?? tablePot,
      });
      showNotification('Hand folded to Dealer');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to fold hand');
    }
  };

  // Showdown: reveal dealer cards one by one to build suspense
  const handleShowdown = async () => {
    if (gameState !== 'BETTING' || isDealingAnimation) return;

    setGameState('SHOWDOWN');
    setErrorMessage(null);
    setDealerRevealedCount(0);
    teenPattiAudio.playShowdownFanfare();

    try {
      const res: any = await TeenPattiApi.performAction({ action: 'showdown' });
      if (!isMountedRef.current) return;
      const table = res?.table;
      const serverPlayer = table?.players?.find((p: any) => !p.isAi);
      const serverDealer = table?.players?.find((p: any) => p.isAi);
      const finalPlayerCards: Card[] = Array.isArray(serverPlayer?.cards) ? serverPlayer.cards : playerCards;
      const finalDealerCards: Card[] = Array.isArray(serverDealer?.cards) ? serverDealer.cards : [];
      const playerWon = table?.winnerId === (serverPlayer?.id || player.id);

      setPlayerCards(finalPlayerCards);
      setPlayer((prev) => ({ ...prev, cards: finalPlayerCards, isSeen: true }));
      setDealerCards(finalDealerCards);

      // Reveal Dealer's 3 cards card-by-card
      [1, 2, 3].forEach((count, i) => {
        scheduleTimeout(() => {
          teenPattiAudio.playFlipSound();
          setDealerRevealedCount(count);
        }, (i + 1) * 420);
      });

      scheduleTimeout(() => {
        setDealer((prev) => ({ ...prev, cards: finalDealerCards, isSeen: true }));
        setGameState('SETTLED');

        if (playerWon) {
          setWinnerInfo({
            id: serverPlayer?.id || player.id,
            name: serverPlayer?.name || player.name,
            hand: table?.winnerHand || 'Winning Hand',
            amount: table?.winAmount ?? tablePot,
          });
          teenPattiAudio.playWinFanfare();
          confetti({
            particleCount: 95,
            spread: 75,
            origin: { y: 0.6 },
            colors: ['#eab308', '#22c55e', '#f59e0b', '#ffffff'],
          });
          refreshWallet();
        } else {
          setWinnerInfo({
            id: 'dealer',
            name: 'Dealer',
            hand: table?.winnerHand || 'Dealer Winning Hand',
            amount: table?.winAmount ?? tablePot,
          });
          showNotification(`Dealer won · ${table?.winnerHand || 'Stronger Hand'}`);
        }
      }, 1550);
    } catch (err: any) {
      setGameState('BETTING');
      setErrorMessage(err?.message || 'Showdown failed');
    }
  };

  const myEvaluation = playerCards.length === 3 ? evaluateTeenPattiHand(playerCards) : null;
  const dealerEvaluation = dealerCards.length === 3 ? evaluateTeenPattiHand(dealerCards) : null;

  return (
    <div className="w-full px-3 py-2 space-y-2.5 text-zinc-100 pb-16 select-none font-sans">
      {/* 1. CLEAN SINGLE-ROW TOP BAR */}
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
            Teen Patti
          </div>
          <div className="text-[11px] text-zinc-400 font-mono tabular-nums">
            Round #{roundNumber}
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

      {/* 2. AUTHENTIC CASINO TABLE + HUMAN DEALER + CARD-BY-CARD DEALING */}
      <TeenPattiDealerTable
        gameState={gameState}
        tablePot={tablePot}
        currentStake={currentStake}
        bootAmount={bootAmount}
        playerName={player.name}
        playerTotalBet={player.totalBet}
        playerIsSeen={player.isSeen}
        playerHasFolded={player.hasFolded}
        playerCards={playerCards}
        playerDealtCount={playerDealtCount}
        playerHandLabel={myEvaluation ? `${myEvaluation.name} · ${myEvaluation.description}` : null}
        dealerTotalBet={dealer.totalBet}
        dealerCards={dealerCards}
        dealerDealtCount={dealerDealtCount}
        dealerRevealedCount={dealerRevealedCount}
        dealerHandLabel={dealerEvaluation ? `${dealerEvaluation.name} · ${dealerEvaluation.description}` : null}
        activeThrow={activeThrow}
        chipFlyingToPot={chipFlyingToPot}
        winnerInfo={winnerInfo}
        playerId={player.id}
        canSeeCards={!player.isSeen && gameState === 'BETTING' && !isDealingAnimation}
        onSeeCards={() => void handleSeeCards()}
      />

      {/* 3. CASINO CHIP SELECTOR TRAY (BOOT / STAKE) */}
      <div className="rounded-xl bg-zinc-900/90 border border-zinc-800 p-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-zinc-400 shrink-0 pl-1">Boot</span>
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
            {CHIP_DENOMINATIONS.map((chip) => {
              const isSelected = selectedChip === chip.value;
              return (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => {
                    setSelectedChip(chip.value);
                    teenPattiAudio.playChipSound();
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

      {/* 4. PRIMARY GAME CONTROLS */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-2.5">
        {gameState === 'SETTLED' ? (
          <button
            type="button"
            onClick={() => void handleStartNewRound(selectedChip)}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-zinc-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition active:scale-[0.98] min-h-[44px]"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Deal Next Round (Boot ₹{selectedChip})</span>
          </button>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => void handlePack()}
              disabled={gameState !== 'BETTING' || isDealingAnimation}
              className="py-2.5 rounded-xl bg-red-950/60 hover:bg-red-900/80 border border-red-800/60 text-red-200 font-semibold text-xs transition active:scale-95 disabled:opacity-50 min-h-[44px]"
            >
              Pack
            </button>

            <button
              type="button"
              onClick={() => void handleShowdown()}
              disabled={gameState !== 'BETTING' || isDealingAnimation}
              className="py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-semibold text-xs transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5 min-h-[44px]"
            >
              <Eye className="w-3.5 h-3.5 text-amber-400" />
              <span>Show</span>
            </button>

            {!player.isSeen ? (
              <button
                type="button"
                onClick={() => void handlePlaceBet(true)}
                disabled={gameState !== 'BETTING' || isDealingAnimation}
                className="py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-zinc-950 font-bold text-xs shadow-md transition active:scale-95 disabled:opacity-50 flex flex-col items-center justify-center leading-tight min-h-[44px] tabular-nums"
              >
                <span>Blind</span>
                <span className="font-mono text-[10px]">₹{currentStake}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handlePlaceBet(false)}
                disabled={gameState !== 'BETTING' || isDealingAnimation}
                className="py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-zinc-950 font-bold text-xs shadow-md transition active:scale-95 disabled:opacity-50 flex flex-col items-center justify-center leading-tight min-h-[44px] tabular-nums"
              >
                <span>Chaal</span>
                <span className="font-mono text-[10px]">₹{currentStake * 2}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* 5. RULES & HAND RANKINGS MODAL */}
      {showRulesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-md max-h-[88vh] bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/60">
              <h3 className="text-sm font-semibold text-amber-200">
                Teen Patti Rules & Hand Rankings
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
              {(['ranks', 'rules', 'payouts'] as const).map((tab) => (
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
                  {tab === 'ranks' ? 'Hand Rankings' : tab === 'rules' ? 'How to Play' : 'Multipliers'}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs leading-relaxed text-zinc-300">
              {activeRulesTab === 'ranks' && (
                <div className="space-y-2.5">
                  <div className="bg-zinc-900 border border-amber-500/40 rounded-xl p-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <strong className="text-amber-200">1. Trail / Trio / Set</strong>
                      <span className="text-[10px] font-mono text-emerald-400">Highest</span>
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      Three cards of the same rank (A-A-A highest down to 2-2-2).
                    </p>
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-2.5">
                    <strong className="text-zinc-100 block mb-1">2. Pure Sequence (Straight Flush)</strong>
                    <p className="text-[11px] text-zinc-400">Three consecutive cards of the same suit (A-K-Q highest).</p>
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-2.5">
                    <strong className="text-zinc-100 block mb-1">3. Sequence (Run)</strong>
                    <p className="text-[11px] text-zinc-400">Three consecutive cards of mixed suits.</p>
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-2.5">
                    <strong className="text-zinc-100 block mb-1">4. Color (Flush)</strong>
                    <p className="text-[11px] text-zinc-400">Three cards of the same suit not in sequence.</p>
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-2.5">
                    <strong className="text-zinc-100 block mb-1">5. Pair</strong>
                    <p className="text-[11px] text-zinc-400">Two cards of matching rank plus one side card.</p>
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-2.5">
                    <strong className="text-zinc-100 block mb-1">6. High Card</strong>
                    <p className="text-[11px] text-zinc-400">Highest single card determines the winner.</p>
                  </div>
                </div>
              )}

              {activeRulesTab === 'rules' && (
                <div className="space-y-3">
                  <div>
                    <h4 className="font-semibold text-amber-300 mb-1">1. Card-by-Card Deal</h4>
                    <p className="text-zinc-400">
                      The dealer contributes the matching Boot into the Pot and deals 3 cards alternating one-by-one to Player and Dealer.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-amber-300 mb-1">2. Blind vs. Seen</h4>
                    <p className="text-zinc-400">
                      Bet Blind at 1x stake or tap See Cards to view your hand and bet Chaal at 2x stake.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-amber-300 mb-1">3. Showdown</h4>
                    <p className="text-zinc-400">
                      Tap Show at any time to flip the Dealer&apos;s cards one by one. Higher hand wins the entire Pot.
                    </p>
                  </div>
                </div>
              )}

              {activeRulesTab === 'payouts' && (
                <div className="grid grid-cols-2 gap-2.5 tabular-nums">
                  <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-xl">
                    <span className="text-[11px] text-zinc-400 block">Trail (AAA)</span>
                    <span className="text-amber-400 font-mono font-bold text-sm">40x</span>
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-xl">
                    <span className="text-[11px] text-zinc-400 block">Pure Sequence</span>
                    <span className="text-emerald-400 font-mono font-bold text-sm">20x</span>
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-xl">
                    <span className="text-[11px] text-zinc-400 block">Sequence (Run)</span>
                    <span className="text-cyan-400 font-mono font-bold text-sm">8x</span>
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-xl">
                    <span className="text-[11px] text-zinc-400 block">Color (Flush)</span>
                    <span className="text-purple-400 font-mono font-bold text-sm">4x</span>
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-xl">
                    <span className="text-[11px] text-zinc-400 block">Pair</span>
                    <span className="text-blue-400 font-mono font-bold text-sm">2x</span>
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-xl">
                    <span className="text-[11px] text-zinc-400 block">High Card</span>
                    <span className="text-zinc-300 font-mono font-bold text-sm">1x</span>
                  </div>
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
