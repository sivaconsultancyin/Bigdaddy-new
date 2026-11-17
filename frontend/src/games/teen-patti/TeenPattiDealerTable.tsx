import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Eye, Trophy, Coins } from 'lucide-react';
import {
  Card,
  SUIT_SYMBOLS,
  SUIT_COLORS,
  getRankLabel,
} from '../../../../shared/src/utils/teenPatti';

export interface ActiveTeenPattiThrow {
  key: string;
  target: 'player' | 'dealer';
  slotIndex: 0 | 1 | 2;
}

interface TeenPattiDealerTableProps {
  gameState: 'IDLE' | 'DEALING' | 'BETTING' | 'SHOWDOWN' | 'SETTLED';
  tablePot: number;
  currentStake: number;
  bootAmount: number;
  playerName: string;
  playerTotalBet: number;
  playerIsSeen: boolean;
  playerHasFolded: boolean;
  playerCards: Card[];
  playerDealtCount: number;
  playerHandLabel: string | null;
  dealerTotalBet: number;
  dealerCards: Card[];
  dealerDealtCount: number;
  dealerRevealedCount: number;
  dealerHandLabel: string | null;
  activeThrow: ActiveTeenPattiThrow | null;
  chipFlyingToPot: boolean;
  winnerInfo: { id: string; name: string; hand: string; amount: number } | null;
  playerId: string;
  canSeeCards: boolean;
  onSeeCards: () => void;
}

const CasinoCardBack: React.FC<{ label?: string; glowing?: boolean }> = ({
  label = 'ROYAL',
  glowing = false,
}) => (
  <div
    className={`w-[54px] h-[76px] rounded-xl bg-gradient-to-br from-red-800 via-red-950 to-zinc-950 border-2 border-amber-400/75 shadow-[0_8px_18px_rgba(0,0,0,0.6)] p-1 flex items-center justify-center relative overflow-hidden select-none ${
      glowing ? 'ring-2 ring-amber-300/80 shadow-[0_0_20px_rgba(251,191,36,0.35)]' : ''
    }`}
  >
    <div
      className="w-full h-full rounded-lg border border-amber-300/40 flex flex-col items-center justify-center"
      style={{
        backgroundImage:
          'repeating-linear-gradient(45deg, rgba(251,191,36,0.14) 0px, rgba(251,191,36,0.14) 2px, transparent 2px, transparent 6px)',
      }}
    >
      <span className="text-[9px] font-bold tracking-widest text-amber-200/90 uppercase">
        {label}
      </span>
    </div>
  </div>
);

const FlipPlayingCard: React.FC<{
  dealt: boolean;
  revealed: boolean;
  card?: Card;
  isWinnerCard?: boolean;
  rotationClass?: string;
  backLabel?: string;
}> = ({
  dealt,
  revealed,
  card,
  isWinnerCard = false,
  rotationClass = '',
  backLabel = 'ROYAL',
}) => {
  const prefersReducedMotion = useReducedMotion();

  if (!dealt) {
    return (
      <div
        className={`w-[54px] h-[76px] rounded-xl border border-dashed border-amber-300/25 bg-black/20 flex items-center justify-center ${rotationClass}`}
      >
        <span className="text-[9px] font-medium text-emerald-100/40">Wait</span>
      </div>
    );
  }

  const isRed = card ? SUIT_COLORS[card.suit] === 'red' : false;

  return (
    <motion.div
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.78, y: -12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      style={{ perspective: 900 }}
      className={`relative ${rotationClass}`}
    >
      <motion.div
        initial={false}
        animate={
          prefersReducedMotion
            ? { rotateY: revealed && card ? 0 : 180 }
            : {
                rotateY: revealed && card ? 0 : 180,
                scale: isWinnerCard ? 1.05 : 1,
                y: isWinnerCard ? -3 : 0,
              }
        }
        transition={{
          rotateY: { duration: prefersReducedMotion ? 0.15 : 0.56, ease: [0.22, 1, 0.36, 1] },
          scale: { duration: 0.3 },
        }}
        style={{ transformStyle: 'preserve-3d' }}
        className="relative w-[54px] h-[76px]"
      >
        {/* CARD FRONT */}
        <div
          style={{ backfaceVisibility: 'hidden' }}
          className={`absolute inset-0 rounded-xl bg-gradient-to-br from-white via-stone-50 to-stone-200 border-2 flex flex-col justify-between p-1.5 select-none shadow-[0_8px_18px_rgba(0,0,0,0.58)] ${
            isWinnerCard
              ? 'border-amber-400 ring-2 ring-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.45)]'
              : 'border-amber-400/80'
          }`}
        >
          {card ? (
            <>
              <div className="flex items-center justify-between leading-none">
                <span className={`text-xs font-black tabular-nums ${isRed ? 'text-red-600' : 'text-zinc-900'}`}>
                  {getRankLabel(card.rank)}
                </span>
                <span className={`text-xs ${isRed ? 'text-red-600' : 'text-zinc-900'}`}>
                  {SUIT_SYMBOLS[card.suit]}
                </span>
              </div>
              <div className="flex items-center justify-center my-auto">
                <span className={`text-2xl leading-none ${isRed ? 'text-red-600' : 'text-zinc-900'}`}>
                  {SUIT_SYMBOLS[card.suit]}
                </span>
              </div>
              <div className="flex items-center justify-between leading-none rotate-180">
                <span className={`text-xs font-black tabular-nums ${isRed ? 'text-red-600' : 'text-zinc-900'}`}>
                  {getRankLabel(card.rank)}
                </span>
                <span className={`text-xs ${isRed ? 'text-red-600' : 'text-zinc-900'}`}>
                  {SUIT_SYMBOLS[card.suit]}
                </span>
              </div>
            </>
          ) : null}
        </div>

        {/* CARD BACK */}
        <div
          style={{
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
          className="absolute inset-0"
        >
          <CasinoCardBack label={backLabel} />
        </div>
      </motion.div>
    </motion.div>
  );
};

export const TeenPattiDealerTable: React.FC<TeenPattiDealerTableProps> = ({
  gameState,
  tablePot,
  currentStake,
  bootAmount,
  playerName,
  playerTotalBet,
  playerIsSeen,
  playerHasFolded,
  playerCards,
  playerDealtCount,
  playerHandLabel,
  dealerTotalBet,
  dealerCards,
  dealerDealtCount,
  dealerRevealedCount,
  dealerHandLabel,
  activeThrow,
  chipFlyingToPot,
  winnerInfo,
  playerId,
  canSeeCards,
  onSeeCards,
}) => {
  const prefersReducedMotion = useReducedMotion();

  const isDealing = gameState === 'DEALING';
  const isBetting = gameState === 'BETTING';
  const isShowdown = gameState === 'SHOWDOWN';
  const isSettled = gameState === 'SETTLED';

  const playerWon = Boolean(winnerInfo && winnerInfo.id === playerId);
  const dealerWon = Boolean(winnerInfo && winnerInfo.id === 'dealer');
  const totalDealtCards = playerDealtCount + dealerDealtCount;

  // Dealer head & eye tracking toward the active card slot or winner
  const gazeOffsetX = (() => {
    if (prefersReducedMotion) return 0;
    if (activeThrow) {
      return activeThrow.slotIndex === 0 ? -2.4 : activeThrow.slotIndex === 2 ? 2.4 : 0;
    }
    if (isShowdown) return 0;
    return 0;
  })();

  const headTiltDeg = (() => {
    if (prefersReducedMotion) return 0;
    if (activeThrow) {
      return activeThrow.slotIndex === 0 ? -5.5 : activeThrow.slotIndex === 2 ? 5.5 : 0;
    }
    if (isSettled && dealerWon) return -3;
    if (isSettled && playerWon) return 3;
    return 0;
  })();

  const rightArmAnimate = (() => {
    if (prefersReducedMotion) return { x: 0, y: 0, rotate: 0 };
    if (activeThrow) {
      const slotShift = activeThrow.slotIndex === 0 ? -28 : activeThrow.slotIndex === 1 ? -4 : 26;
      const dropY = activeThrow.target === 'player' ? 24 : 10;
      return {
        x: [-18, -6, slotShift, 0],
        y: [4, -2, dropY, 0],
        rotate: [16, 4, activeThrow.slotIndex === 0 ? 28 : -22, 0],
      };
    }
    if (isShowdown) {
      return { x: -12, y: 8, rotate: 16 };
    }
    if (isBetting) {
      return { x: [0, 3, 0], y: [0, -2, 0], rotate: [0, -4, 0] };
    }
    return { x: 0, y: 0, rotate: 0 };
  })();

  const leftArmAnimate = (() => {
    if (prefersReducedMotion) return { x: 0, y: 0, rotate: 0 };
    if (activeThrow) {
      return { x: [0, -3, 0], y: [0, 2, 0], rotate: [0, -5, 0] };
    }
    return { x: 0, y: 0, rotate: 0 };
  })();

  const throwDestX = activeThrow
    ? activeThrow.slotIndex === 0
      ? -64
      : activeThrow.slotIndex === 1
      ? 0
      : 64
    : 0;
  const throwDestY = activeThrow?.target === 'player' ? 236 : 44;

  const statusCueText = (() => {
    if (isDealing && activeThrow) {
      return `Dealing card ${totalDealtCards + 1} of 6 to ${
        activeThrow.target === 'player' ? playerName : 'Dealer'
      }`;
    }
    if (isDealing) return 'Dealer dealing 3 cards each...';
    if (isShowdown) {
      return `Showdown · Revealing Dealer card ${Math.min(3, dealerRevealedCount + 1)} of 3`;
    }
    if (isSettled && winnerInfo) {
      return `${winnerInfo.name} wins ₹${winnerInfo.amount.toLocaleString()} · ${winnerInfo.hand}`;
    }
    if (playerIsSeen) {
      return `Seen play · Chaal ₹${(currentStake * 2).toLocaleString()} or Show`;
    }
    return `Blind play · ₹${currentStake.toLocaleString()} stake or tap See Cards`;
  })();

  return (
    <div className="relative w-full select-none">
      {/* =====================================================================
          1. HUMAN CASINO DEALER AT HEAD OF TABLE
          ===================================================================== */}
      <div className="relative z-10 flex flex-col items-center -mb-7 pointer-events-none">
        <div className="relative w-[220px] h-[126px] flex items-end justify-center">
          <div
            className="absolute inset-x-4 top-2 bottom-2 rounded-full opacity-60 blur-xl"
            style={{
              background:
                'radial-gradient(circle at 50% 40%, rgba(217, 119, 6, 0.28), rgba(16, 185, 129, 0.08) 65%, transparent 80%)',
            }}
          />

          <svg
            viewBox="0 0 220 132"
            className="w-full h-full overflow-visible drop-shadow-[0_8px_14px_rgba(0,0,0,0.65)]"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="tpSkin" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#E6B28A" />
                <stop offset="100%" stopColor="#C88B60" />
              </linearGradient>
              <linearGradient id="tpSuitVest" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#26262b" />
                <stop offset="100%" stopColor="#121216" />
              </linearGradient>
              <linearGradient id="tpHair" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#2c1d16" />
                <stop offset="100%" stopColor="#140d0a" />
              </linearGradient>
              <linearGradient id="tpSleeve" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f8fafc" />
                <stop offset="100%" stopColor="#cbd5e1" />
              </linearGradient>
            </defs>

            {/* Dealer Torso / Waistcoat */}
            <motion.g
              animate={prefersReducedMotion ? {} : { y: isBetting ? [0, -1.2, 0] : 0 }}
              transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <path
                d="M54 114 C56 86, 74 78, 110 78 C146 78, 164 86, 166 114 Z"
                fill="url(#tpSleeve)"
              />
              <path
                d="M66 116 C68 89, 82 80, 110 80 C138 80, 152 89, 154 116 Z"
                fill="url(#tpSuitVest)"
                stroke="#3f3f46"
                strokeWidth="0.9"
              />
              <polygon points="94,80 110,108 126,80" fill="#f8fafc" />
              <path d="M94 80 L110 108 L104 112 L88 84 Z" fill="#7f1d1d" />
              <path d="M126 80 L110 108 L116 112 L132 84 Z" fill="#7f1d1d" />
              <circle cx="110" cy="111" r="1.7" fill="#fbbf24" />
              <polygon points="101,81 110,85 101,89" fill="#991b1b" />
              <polygon points="119,81 110,85 119,89" fill="#991b1b" />
              <circle cx="110" cy="85" r="2.2" fill="#f59e0b" />
              <rect x="102" y="65" width="16" height="17" rx="6" fill="url(#tpSkin)" />
              <path d="M102 71 Q110 76 118 71" fill="rgba(0,0,0,0.18)" />
            </motion.g>

            {/* Head & Reactive Gaze */}
            <motion.g
              style={{ originX: '110px', originY: '66px' }}
              animate={{ rotate: headTiltDeg, x: gazeOffsetX * 1.1 }}
              transition={{ type: 'spring', stiffness: 210, damping: 20 }}
            >
              <ellipse cx="89" cy="49" rx="3.4" ry="5.5" fill="#d39a70" />
              <ellipse cx="131" cy="49" rx="3.4" ry="5.5" fill="#d39a70" />
              <path
                d="M91 40 C91 24, 129 24, 129 40 L128 53 C127 65, 118 70, 110 70 C102 70, 93 65, 92 53 Z"
                fill="url(#tpSkin)"
              />
              <path
                d="M89 42 C87 23, 102 17, 112 18 C126 18, 133 27, 131 42 C128 33, 122 29, 110 29 C99 29, 93 34, 89 42 Z"
                fill="url(#tpHair)"
              />
              <path d="M97 41 Q101.5 39 105.5 41" stroke="#2c1d16" strokeWidth="1.7" strokeLinecap="round" fill="none" />
              <path d="M114.5 41 Q118.5 39 123 41" stroke="#2c1d16" strokeWidth="1.7" strokeLinecap="round" fill="none" />
              <ellipse cx="101.5" cy="46" rx="3.2" ry="2.2" fill="#ffffff" />
              <ellipse cx="118.5" cy="46" rx="3.2" ry="2.2" fill="#ffffff" />
              <motion.circle cx={101.5 + gazeOffsetX * 0.45} cy="46.2" r="1.45" fill="#1c1410" />
              <motion.circle cx={118.5 + gazeOffsetX * 0.45} cy="46.2" r="1.45" fill="#1c1410" />
              <path d="M110 47 L109 53 L111.5 54" stroke="#b3754a" strokeWidth="1.3" strokeLinecap="round" fill="none" />
              <path
                d={isSettled ? 'M103 59 Q110 64 117 59' : 'M104 60 Q110 63 116 60'}
                stroke="#8f4f38"
                strokeWidth="1.6"
                strokeLinecap="round"
                fill="none"
              />
            </motion.g>

            {/* Left Arm */}
            <motion.g
              style={{ originX: '64px', originY: '92px' }}
              animate={leftArmAnimate}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            >
              <path
                d="M64 90 C50 96, 42 108, 46 119 L59 120 C59 111, 64 103, 72 99 Z"
                fill="url(#tpSleeve)"
              />
              <rect x="46" y="116" width="13" height="4" rx="1.5" fill="#e2e8f0" />
              <circle cx="49" cy="118" r="1.2" fill="#f59e0b" />
              <path
                d="M46 119 C44 126, 52 130, 60 127 C64 125, 64 120, 58 119 Z"
                fill="url(#tpSkin)"
              />
              <line x1="50" y1="123" x2="50" y2="127" stroke="#b9784e" strokeWidth="0.9" strokeLinecap="round" />
              <line x1="54" y1="123" x2="54" y2="127" stroke="#b9784e" strokeWidth="0.9" strokeLinecap="round" />
            </motion.g>

            {/* Right Dealing Arm & Hand (throws cards one by one) */}
            <motion.g
              style={{ originX: '156px', originY: '92px' }}
              animate={rightArmAnimate}
              transition={
                activeThrow
                  ? { duration: 0.36, times: [0, 0.25, 0.65, 1], ease: [0.22, 1, 0.36, 1] }
                  : isBetting
                  ? { duration: 2.8, repeat: Infinity, ease: 'easeInOut' }
                  : { type: 'spring', stiffness: 190, damping: 18 }
              }
            >
              <path
                d="M156 90 C170 96, 178 108, 174 119 L161 120 C161 111, 156 103, 148 99 Z"
                fill="url(#tpSleeve)"
              />
              <rect x="161" y="116" width="13" height="4" rx="1.5" fill="#e2e8f0" />
              <circle cx="171" cy="118" r="1.2" fill="#f59e0b" />
              <path
                d="M161 119 C157 123, 157 128, 165 129 C172 130, 177 125, 174 119 Z"
                fill="url(#tpSkin)"
              />
              {activeThrow && (
                <rect
                  x="152"
                  y="122"
                  width="14"
                  height="20"
                  rx="2.5"
                  fill="#991b1b"
                  stroke="#fbbf24"
                  strokeWidth="1.2"
                  transform="rotate(-14 159 132)"
                />
              )}
              <line x1="164" y1="124" x2="163" y2="128" stroke="#b9784e" strokeWidth="0.9" strokeLinecap="round" />
              <line x1="168" y1="124" x2="168" y2="128" stroke="#b9784e" strokeWidth="0.9" strokeLinecap="round" />
            </motion.g>
          </svg>
        </div>
      </div>

      {/* =====================================================================
          2. LUXURY MAHOGANY & EMERALD FELT TEEN PATTI CASINO TABLE
          ===================================================================== */}
      <div
        className="relative rounded-t-[86px] rounded-b-[28px] p-[9px] shadow-[0_18px_40px_rgba(0,0,0,0.85)]"
        style={{
          background: 'linear-gradient(160deg, #6b3b20 0%, #3d1f0f 45%, #2a1409 100%)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
        }}
      >
        <div
          className="relative rounded-t-[78px] rounded-b-[20px] p-3 pt-7 overflow-hidden"
          style={{
            background: 'radial-gradient(ellipse at 50% 24%, #146c43 0%, #0d5031 52%, #072e1c 100%)',
            boxShadow: 'inset 0 8px 24px rgba(0,0,0,0.68), inset 0 0 0 2px rgba(251, 191, 36, 0.24)',
          }}
        >
          {/* Felt Weave Texture */}
          <div
            className="absolute inset-0 opacity-[0.07] pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(rgba(255,255,255,0.6) 0.6px, transparent 0.6px)',
              backgroundSize: '6px 6px',
            }}
          />

          {/* Inlaid Gold Casino Table Trim */}
          <div className="absolute inset-2.5 rounded-t-[70px] rounded-b-[16px] border border-amber-300/25 pointer-events-none" />

          {/* =================================================================
              CARD-BY-CARD FLYING THROW OVERLAY (SHOE -> DEALER OR PLAYER SLOT)
              ================================================================= */}
          <AnimatePresence>
            {activeThrow && !prefersReducedMotion && (
              <motion.div
                key={activeThrow.key}
                initial={{
                  x: -88,
                  y: 6,
                  scale: 0.66,
                  rotate: -18,
                  opacity: 0.96,
                }}
                animate={{
                  x: throwDestX,
                  y: throwDestY,
                  scale: 1,
                  rotate: activeThrow.slotIndex === 0 ? -4 : activeThrow.slotIndex === 2 ? 4 : 0,
                  opacity: 1,
                }}
                exit={{ opacity: 0, scale: 0.94 }}
                transition={{
                  duration: 0.34,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="pointer-events-none absolute left-1/2 top-4 -ml-[27px] z-30"
              >
                <CasinoCardBack label="ROYAL" glowing />
              </motion.div>
            )}
          </AnimatePresence>

          {/* =================================================================
              DEALER SECTION: SHOE + DEALER'S 3 CARDS + STAKES
              ================================================================= */}
          <div className="relative z-10 grid grid-cols-3 items-start gap-2 mb-2.5">
            {/* Dealer Shoe Stack */}
            <div className="flex flex-col items-center pt-1">
              <div className="relative w-11 h-14">
                <div className="absolute inset-0 translate-x-1 translate-y-1 rounded-md bg-red-950 border border-amber-500/40 shadow" />
                <div className="absolute inset-0 translate-x-0.5 translate-y-0.5 rounded-md bg-red-900 border border-amber-400/50 shadow" />
                <motion.div
                  animate={
                    activeThrow && !prefersReducedMotion
                      ? { x: [0, 3, 0], y: [0, -2, 0] }
                      : { x: 0, y: 0 }
                  }
                  transition={{ duration: 0.24 }}
                  className="relative w-11 h-14 rounded-md bg-gradient-to-br from-red-800 via-red-900 to-rose-950 border border-amber-400/70 shadow-lg flex items-center justify-center overflow-hidden"
                >
                  <div
                    className="w-8 h-10 rounded-sm border border-amber-300/40 opacity-80"
                    style={{
                      backgroundImage:
                        'repeating-linear-gradient(45deg, rgba(251,191,36,0.18) 0px, rgba(251,191,36,0.18) 2px, transparent 2px, transparent 6px)',
                    }}
                  />
                </motion.div>
              </div>
              <span className="mt-1 text-[10px] font-medium text-emerald-100/75 tabular-nums">
                Shoe · {totalDealtCards}/6
              </span>
            </div>

            {/* Dealer Label + Hand */}
            <div className="col-span-2 flex flex-col items-center">
              <div className="flex items-center justify-between w-full max-w-[205px] mb-1.5 text-[11px] tabular-nums">
                <span className="font-semibold text-amber-200 tracking-wide">
                  Dealer Hand
                </span>
                <span className="font-mono text-emerald-100/80">
                  Bet ₹{dealerTotalBet.toLocaleString()}
                </span>
              </div>

              <div className="flex items-center justify-center gap-2">
                {[0, 1, 2].map((idx) => {
                  const rot = idx === 0 ? '-rotate-3' : idx === 2 ? 'rotate-3' : '';
                  const isCardDealt = idx < dealerDealtCount;
                  const isCardRevealed = idx < dealerRevealedCount;
                  return (
                    <FlipPlayingCard
                      key={`dealer-slot-${idx}`}
                      dealt={isCardDealt}
                      revealed={isCardRevealed}
                      card={dealerCards[idx]}
                      isWinnerCard={isSettled && dealerWon}
                      rotationClass={rot}
                      backLabel="DEALER"
                    />
                  );
                })}
              </div>

              {dealerHandLabel && dealerRevealedCount >= 3 && (
                <div className="mt-1.5 text-[11px] font-semibold text-amber-300">
                  {dealerHandLabel}
                </div>
              )}
            </div>
          </div>

          {/* =================================================================
              CENTER POT MEDALLION & LIVE DEAL STATUS CUE
              ================================================================= */}
          <div className="relative z-10 flex flex-col items-center my-2">
            <div className="relative flex items-center justify-center">
              <div
                className={`px-5 py-2.5 rounded-2xl border bg-black/35 backdrop-blur-xs text-center shadow-[inset_0_2px_10px_rgba(0,0,0,0.65)] transition-all ${
                  winnerInfo
                    ? 'border-amber-300 ring-2 ring-amber-400/60'
                    : 'border-amber-400/45'
                }`}
              >
                <div className="flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-200/85">
                  {winnerInfo ? (
                    <Trophy className="w-3.5 h-3.5 text-amber-300" />
                  ) : (
                    <Coins className="w-3.5 h-3.5 text-amber-300" />
                  )}
                  <span>{winnerInfo ? `${winnerInfo.name} Won` : 'Table Pot'}</span>
                </div>
                <div className="text-lg font-black font-mono text-amber-300 tabular-nums leading-tight mt-0.5">
                  ₹{tablePot.toLocaleString()}
                </div>
                <div className="text-[10px] text-emerald-200/80 tabular-nums">
                  Boot ₹{bootAmount.toLocaleString()} · Stake ₹{currentStake.toLocaleString()}
                </div>
              </div>

              <AnimatePresence>
                {chipFlyingToPot && !prefersReducedMotion && (
                  <motion.div
                    initial={{ y: 54, scale: 0.7, opacity: 0.9 }}
                    animate={{ y: 0, scale: 1.1, opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.36, ease: 'easeOut' }}
                    className="absolute w-7 h-7 rounded-full bg-amber-400 border-2 border-dashed border-white shadow-lg pointer-events-none"
                  />
                )}
              </AnimatePresence>
            </div>

            <div className="mt-2 text-center px-2">
              <span className="text-[11px] font-medium text-amber-100/90">
                {statusCueText}
              </span>
            </div>
          </div>

          {/* =================================================================
              PLAYER SECTION: YOUR 3 CARDS + SEE ACTION + STAKE SUMMARY
              ================================================================= */}
          <div
            className={`relative z-10 rounded-2xl border p-3 transition-all ${
              isSettled && playerWon
                ? 'border-amber-300 bg-emerald-950/65 ring-2 ring-amber-400/80 shadow-[0_0_24px_rgba(251,191,36,0.28)]'
                : playerHasFolded
                ? 'border-red-400/30 bg-black/30 opacity-85'
                : 'border-amber-300/35 bg-black/25'
            }`}
          >
            <div className="flex items-center justify-between gap-2 pb-2 mb-2.5 border-b border-amber-300/20 text-xs tabular-nums">
              <div className="font-semibold text-white truncate">
                {playerName}
                <span className="text-emerald-200/75 font-normal">
                  {' '}
                  · {playerHasFolded ? 'Folded' : playerIsSeen ? 'Seen' : 'Blind'}
                </span>
              </div>
              <div className="font-mono font-semibold text-amber-200 shrink-0">
                Your Bet ₹{playerTotalBet.toLocaleString()}
              </div>
            </div>

            {/* Player 3 Card Slots */}
            <div className="flex items-center justify-center gap-2.5 py-1">
              {[0, 1, 2].map((idx) => {
                const rot = idx === 0 ? '-rotate-3' : idx === 2 ? 'rotate-3' : '';
                const isCardDealt = idx < playerDealtCount;
                const card = playerCards[idx];
                const isCardRevealed =
                  Boolean(card) &&
                  (playerIsSeen || isShowdown || isSettled);

                return (
                  <FlipPlayingCard
                    key={`player-slot-${idx}`}
                    dealt={isCardDealt}
                    revealed={isCardRevealed}
                    card={card}
                    isWinnerCard={isSettled && playerWon}
                    rotationClass={rot}
                    backLabel="BLIND"
                  />
                );
              })}
            </div>

            {/* Hand Evaluation or Quick See Cards Button */}
            <div className="mt-2.5 flex items-center justify-center min-h-[34px]">
              {playerIsSeen && playerHandLabel ? (
                <div className="text-xs font-semibold text-amber-300 text-center">
                  {playerHandLabel}
                </div>
              ) : canSeeCards ? (
                <button
                  type="button"
                  onClick={onSeeCards}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold shadow-md transition active:scale-95 min-h-[40px]"
                >
                  <Eye className="w-4 h-4" />
                  <span>See Cards</span>
                </button>
              ) : (
                <div className="text-[11px] text-emerald-100/70">
                  {playerHasFolded
                    ? 'Hand folded to Dealer'
                    : isDealing
                    ? 'Cards dealing one by one...'
                    : 'Showdown complete'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
