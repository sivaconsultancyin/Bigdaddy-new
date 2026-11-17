import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Card,
  SUIT_SYMBOLS,
  SUIT_COLORS,
  getRankLabel,
} from '../../../../shared/src/utils/teenPatti';
import { DragonTigerRoundStatus } from '../../../../shared/src/types';

export type DragonTigerRevealStage =
  | 'idle'
  | 'dealing_dragon'
  | 'dealing_tiger'
  | 'suspense_hold'
  | 'revealing_dragon'
  | 'curiosity_pause'
  | 'revealing_tiger'
  | 'both_revealed';

interface DragonTigerDealerTableProps {
  status: DragonTigerRoundStatus | string;
  revealStage: DragonTigerRevealStage;
  dragonCard: Card | null;
  tigerCard: Card | null;
  winner: 'dragon' | 'tiger' | 'tie' | null;
  dragonBetAmount: string;
  tigerBetAmount: string;
  tieBetAmount: string;
  totalBetAmount: string;
  totalBetsCount: number;
  myBets: Record<string, number>;
  selectedChip: number;
  isSubmittingBet: boolean;
  onPlaceBet: (side: 'dragon' | 'tiger' | 'tie') => void;
}

function getDtPointLabel(rank: number): string {
  if (rank === 14 || rank === 1) return 'Ace · 1 pt';
  if (rank === 11) return 'Jack · 11 pts';
  if (rank === 12) return 'Queen · 12 pts';
  if (rank === 13) return 'King · 13 pts';
  return `${rank} pts`;
}

const CasinoCardBack: React.FC<{ side: 'dragon' | 'tiger'; glowing?: boolean }> = ({
  side,
  glowing = false,
}) => {
  const accentBorder =
    side === 'dragon' ? 'border-red-400/75' : 'border-amber-400/75';
  const innerBg =
    side === 'dragon'
      ? 'from-red-900 via-red-950 to-zinc-950'
      : 'from-amber-900 via-amber-950 to-zinc-950';

  return (
    <div
      className={`w-[72px] h-[102px] rounded-xl bg-gradient-to-br ${innerBg} border-2 ${accentBorder} shadow-[0_8px_18px_rgba(0,0,0,0.6)] p-1.5 flex items-center justify-center relative overflow-hidden ${
        glowing ? 'ring-2 ring-amber-300/70 shadow-[0_0_20px_rgba(251,191,36,0.35)]' : ''
      }`}
    >
      <div
        className="w-full h-full rounded-lg border border-amber-300/40 flex flex-col items-center justify-center"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, rgba(251,191,36,0.13) 0px, rgba(251,191,36,0.13) 2px, transparent 2px, transparent 7px)',
        }}
      >
        <span className="text-[10px] font-bold tracking-widest text-amber-200/90 uppercase">
          {side === 'dragon' ? 'D' : 'T'}
        </span>
      </div>
    </div>
  );
};

const SlowFlipCard: React.FC<{
  side: 'dragon' | 'tiger';
  placed: boolean;
  revealed: boolean;
  peeking: boolean;
  card: Card | null;
  isWinner: boolean;
  isBetting: boolean;
}> = ({ side, placed, revealed, peeking, card, isWinner, isBetting }) => {
  const prefersReducedMotion = useReducedMotion();

  if (!placed) {
    return (
      <div
        className={`w-[72px] h-[102px] rounded-xl border border-dashed flex flex-col items-center justify-center text-center px-1 ${
          side === 'dragon'
            ? 'border-red-400/35 bg-black/20 text-red-100/50'
            : 'border-amber-400/35 bg-black/20 text-amber-100/50'
        }`}
      >
        <span className="text-[10px] font-medium">
          {isBetting ? 'Bet Open' : 'Dealing'}
        </span>
      </div>
    );
  }

  const isRed = card ? SUIT_COLORS[card.suit] === 'red' : false;

  return (
    <div style={{ perspective: 900 }} className="relative">
      <motion.div
        initial={false}
        animate={
          prefersReducedMotion
            ? { rotateY: revealed ? 0 : 180, scale: 1, y: 0 }
            : {
                rotateY: revealed ? 0 : 180,
                scale: peeking ? 1.08 : isWinner ? 1.04 : 1,
                y: peeking ? -7 : 0,
              }
        }
        transition={{
          rotateY: { duration: prefersReducedMotion ? 0.15 : 0.92, ease: [0.22, 1, 0.36, 1] },
          scale: { duration: 0.45, ease: 'easeOut' },
          y: { duration: 0.45, ease: 'easeOut' },
        }}
        style={{ transformStyle: 'preserve-3d' }}
        className="relative w-[72px] h-[102px]"
      >
        {/* CARD FRONT (FACE UP) */}
        <div
          style={{ backfaceVisibility: 'hidden' }}
          className={`absolute inset-0 rounded-xl bg-gradient-to-br from-white via-stone-50 to-stone-200 border-2 flex flex-col justify-between p-1.5 select-none shadow-[0_10px_22px_rgba(0,0,0,0.58)] ${
            isWinner
              ? 'border-amber-400 ring-2 ring-amber-300 shadow-[0_0_24px_rgba(251,191,36,0.45)]'
              : side === 'dragon'
              ? 'border-red-400/80'
              : 'border-amber-400/80'
          }`}
        >
          {card ? (
            <>
              <div className="flex items-center justify-between leading-none">
                <span className={`text-sm font-black tabular-nums ${isRed ? 'text-red-600' : 'text-zinc-900'}`}>
                  {getRankLabel(card.rank)}
                </span>
                <span className={`text-sm ${isRed ? 'text-red-600' : 'text-zinc-900'}`}>
                  {SUIT_SYMBOLS[card.suit]}
                </span>
              </div>
              <div className="flex items-center justify-center my-auto">
                <span className={`text-3xl leading-none ${isRed ? 'text-red-600' : 'text-zinc-900'}`}>
                  {SUIT_SYMBOLS[card.suit]}
                </span>
              </div>
              <div className="flex items-center justify-between leading-none rotate-180">
                <span className={`text-sm font-black tabular-nums ${isRed ? 'text-red-600' : 'text-zinc-900'}`}>
                  {getRankLabel(card.rank)}
                </span>
                <span className={`text-sm ${isRed ? 'text-red-600' : 'text-zinc-900'}`}>
                  {SUIT_SYMBOLS[card.suit]}
                </span>
              </div>
            </>
          ) : null}
        </div>

        {/* CARD BACK (FACE DOWN - CURIOSITY WAIT) */}
        <div
          style={{
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
          className="absolute inset-0"
        >
          <CasinoCardBack side={side} glowing={peeking} />
        </div>
      </motion.div>
    </div>
  );
};

export const DragonTigerDealerTable: React.FC<DragonTigerDealerTableProps> = ({
  status,
  revealStage,
  dragonCard,
  tigerCard,
  winner,
  dragonBetAmount,
  tigerBetAmount,
  tieBetAmount,
  totalBetAmount,
  totalBetsCount,
  myBets,
  selectedChip,
  isSubmittingBet,
  onPlaceBet,
}) => {
  const prefersReducedMotion = useReducedMotion();

  const isBetting = status === DragonTigerRoundStatus.BETTING;
  const isResult = status === DragonTigerRoundStatus.RESULT && revealStage === 'both_revealed';

  const dragonPlaced =
    revealStage !== 'idle' && revealStage !== 'dealing_dragon';
  const tigerPlaced =
    revealStage === 'suspense_hold' ||
    revealStage === 'revealing_dragon' ||
    revealStage === 'curiosity_pause' ||
    revealStage === 'revealing_tiger' ||
    revealStage === 'both_revealed';

  const dragonRevealed =
    revealStage === 'revealing_dragon' ||
    revealStage === 'curiosity_pause' ||
    revealStage === 'revealing_tiger' ||
    revealStage === 'both_revealed';

  const tigerRevealed =
    revealStage === 'revealing_tiger' || revealStage === 'both_revealed';

  // Dealer head/gaze tracking
  const lookSide: 'left' | 'right' | 'center' =
    revealStage === 'dealing_dragon' || revealStage === 'revealing_dragon'
      ? 'left'
      : revealStage === 'dealing_tiger' ||
        revealStage === 'curiosity_pause' ||
        revealStage === 'revealing_tiger'
      ? 'right'
      : isResult && winner === 'dragon'
      ? 'left'
      : isResult && winner === 'tiger'
      ? 'right'
      : 'center';

  const headTiltDeg = prefersReducedMotion
    ? 0
    : lookSide === 'left'
    ? -6.5
    : lookSide === 'right'
    ? 6.5
    : 0;

  const gazeOffsetX = prefersReducedMotion
    ? 0
    : lookSide === 'left'
    ? -2.3
    : lookSide === 'right'
    ? 2.3
    : 0;

  // Dealer right dealing arm animation
  const rightArmAnimate = (() => {
    if (prefersReducedMotion) return { x: 0, y: 0, rotate: 0 };
    if (revealStage === 'dealing_dragon') {
      return {
        x: [-18, -10, -44, -8],
        y: [4, -2, 20, 2],
        rotate: [16, 4, 34, 4],
      };
    }
    if (revealStage === 'dealing_tiger') {
      return {
        x: [-18, 4, 38, 0],
        y: [4, -2, 20, 0],
        rotate: [16, -6, -32, 0],
      };
    }
    if (revealStage === 'revealing_dragon') {
      return { x: -24, y: 10, rotate: 24 };
    }
    if (revealStage === 'curiosity_pause' || revealStage === 'revealing_tiger') {
      return { x: 24, y: 10, rotate: -24 };
    }
    if (isResult && winner === 'dragon') {
      return { x: -26, y: 8, rotate: 26 };
    }
    if (isResult && winner === 'tiger') {
      return { x: 26, y: 8, rotate: -26 };
    }
    if (isBetting) {
      return { x: [0, 3, 0], y: [0, -2, 0], rotate: [0, -4, 0] };
    }
    return { x: 0, y: 0, rotate: 0 };
  })();

  const leftArmAnimate = (() => {
    if (prefersReducedMotion) return { x: 0, y: 0, rotate: 0 };
    if (revealStage === 'dealing_dragon' || revealStage === 'dealing_tiger') {
      return { x: [0, -3, 0], y: [0, 2, 0], rotate: [0, -5, 0] };
    }
    if (revealStage === 'suspense_hold') {
      return { x: -6, y: 3, rotate: 8 };
    }
    if (isResult && winner === 'dragon') {
      return { x: -12, y: 4, rotate: 14 };
    }
    return { x: 0, y: 0, rotate: 0 };
  })();

  const throwingSide: 'dragon' | 'tiger' | null =
    revealStage === 'dealing_dragon'
      ? 'dragon'
      : revealStage === 'dealing_tiger'
      ? 'tiger'
      : null;

  const curiosityBannerText = (() => {
    if (isBetting) return 'Place bets on Dragon, Tiger, or Tie';
    if (revealStage === 'dealing_dragon') return 'Dealer placing Dragon card face-down...';
    if (revealStage === 'dealing_tiger') return 'Dealer placing Tiger card face-down...';
    if (revealStage === 'suspense_hold') return 'Cards set on felt · Lifting Dragon first...';
    if (revealStage === 'revealing_dragon') return 'Revealing Dragon card...';
    if (revealStage === 'curiosity_pause' && dragonCard) {
      return `Dragon shows ${getRankLabel(dragonCard.rank)} · Revealing Tiger next...`;
    }
    if (revealStage === 'revealing_tiger') return 'Revealing Tiger card...';
    if (isResult && winner) {
      return winner === 'tie'
        ? 'Tie Round · 9:1 Payout'
        : `${winner.toUpperCase()} Wins the Duel`;
    }
    return 'Preparing next round';
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
              <linearGradient id="dtSkin" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#E6B28A" />
                <stop offset="100%" stopColor="#C88B60" />
              </linearGradient>
              <linearGradient id="dtSuitVest" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#26262b" />
                <stop offset="100%" stopColor="#121216" />
              </linearGradient>
              <linearGradient id="dtHair" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#2c1d16" />
                <stop offset="100%" stopColor="#140d0a" />
              </linearGradient>
              <linearGradient id="dtSleeve" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f8fafc" />
                <stop offset="100%" stopColor="#cbd5e1" />
              </linearGradient>
            </defs>

            {/* Dealer Torso */}
            <motion.g
              animate={
                prefersReducedMotion ? {} : { y: isBetting ? [0, -1.2, 0] : 0 }
              }
              transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <path
                d="M54 114 C56 86, 74 78, 110 78 C146 78, 164 86, 166 114 Z"
                fill="url(#dtSleeve)"
              />
              <path
                d="M66 116 C68 89, 82 80, 110 80 C138 80, 152 89, 154 116 Z"
                fill="url(#dtSuitVest)"
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
              <rect x="102" y="65" width="16" height="17" rx="6" fill="url(#dtSkin)" />
              <path d="M102 71 Q110 76 118 71" fill="rgba(0,0,0,0.18)" />
            </motion.g>

            {/* Head & Reactive Face/Gaze */}
            <motion.g
              style={{ originX: '110px', originY: '66px' }}
              animate={{ rotate: headTiltDeg, x: gazeOffsetX * 1.1 }}
              transition={{ type: 'spring', stiffness: 180, damping: 20 }}
            >
              <ellipse cx="89" cy="49" rx="3.4" ry="5.5" fill="#d39a70" />
              <ellipse cx="131" cy="49" rx="3.4" ry="5.5" fill="#d39a70" />
              <path
                d="M91 40 C91 24, 129 24, 129 40 L128 53 C127 65, 118 70, 110 70 C102 70, 93 65, 92 53 Z"
                fill="url(#dtSkin)"
              />
              <path
                d="M89 42 C87 23, 102 17, 112 18 C126 18, 133 27, 131 42 C128 33, 122 29, 110 29 C99 29, 93 34, 89 42 Z"
                fill="url(#dtHair)"
              />
              <path d="M97 41 Q101.5 39 105.5 41" stroke="#2c1d16" strokeWidth="1.7" strokeLinecap="round" fill="none" />
              <path d="M114.5 41 Q118.5 39 123 41" stroke="#2c1d16" strokeWidth="1.7" strokeLinecap="round" fill="none" />
              <ellipse cx="101.5" cy="46" rx="3.2" ry="2.2" fill="#ffffff" />
              <ellipse cx="118.5" cy="46" rx="3.2" ry="2.2" fill="#ffffff" />
              <motion.circle cx={101.5 + gazeOffsetX * 0.45} cy="46.2" r="1.45" fill="#1c1410" />
              <motion.circle cx={118.5 + gazeOffsetX * 0.45} cy="46.2" r="1.45" fill="#1c1410" />
              <path d="M110 47 L109 53 L111.5 54" stroke="#b3754a" strokeWidth="1.3" strokeLinecap="round" fill="none" />
              <path
                d={isResult ? 'M103 59 Q110 64 117 59' : 'M104 60 Q110 63 116 60'}
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
              transition={{ duration: 0.55, ease: 'easeOut' }}
            >
              <path
                d="M64 90 C50 96, 42 108, 46 119 L59 120 C59 111, 64 103, 72 99 Z"
                fill="url(#dtSleeve)"
              />
              <rect x="46" y="116" width="13" height="4" rx="1.5" fill="#e2e8f0" />
              <circle cx="49" cy="118" r="1.2" fill="#f59e0b" />
              <path
                d="M46 119 C44 126, 52 130, 60 127 C64 125, 64 120, 58 119 Z"
                fill="url(#dtSkin)"
              />
              <line x1="50" y1="123" x2="50" y2="127" stroke="#b9784e" strokeWidth="0.9" strokeLinecap="round" />
              <line x1="54" y1="123" x2="54" y2="127" stroke="#b9784e" strokeWidth="0.9" strokeLinecap="round" />
            </motion.g>

            {/* Right Dealing Arm & Hand (Slow deliberative deal motion) */}
            <motion.g
              style={{ originX: '156px', originY: '92px' }}
              animate={rightArmAnimate}
              transition={
                throwingSide
                  ? { duration: 0.85, times: [0, 0.25, 0.72, 1], ease: [0.22, 1, 0.36, 1] }
                  : isBetting
                  ? { duration: 2.8, repeat: Infinity, ease: 'easeInOut' }
                  : { type: 'spring', stiffness: 150, damping: 18 }
              }
            >
              <path
                d="M156 90 C170 96, 178 108, 174 119 L161 120 C161 111, 156 103, 148 99 Z"
                fill="url(#dtSleeve)"
              />
              <rect x="161" y="116" width="13" height="4" rx="1.5" fill="#e2e8f0" />
              <circle cx="171" cy="118" r="1.2" fill="#f59e0b" />
              <path
                d="M161 119 C157 123, 157 128, 165 129 C172 130, 177 125, 174 119 Z"
                fill="url(#dtSkin)"
              />
              {throwingSide && (
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
          2. LUXURY MAHOGANY & EMERALD FELT CASINO TABLE
          ===================================================================== */}
      <div
        className="relative rounded-t-[86px] rounded-b-[28px] p-[9px] shadow-[0_18px_40px_rgba(0,0,0,0.85)]"
        style={{
          background:
            'linear-gradient(160deg, #6b3b20 0%, #3d1f0f 45%, #2a1409 100%)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
        }}
      >
        <div
          className="relative rounded-t-[78px] rounded-b-[20px] p-3 pt-7 overflow-hidden"
          style={{
            background:
              'radial-gradient(ellipse at 50% 24%, #146c43 0%, #0d5031 52%, #072e1c 100%)',
            boxShadow:
              'inset 0 8px 24px rgba(0,0,0,0.68), inset 0 0 0 2px rgba(251, 191, 36, 0.24)',
          }}
        >
          {/* Felt Weave Texture */}
          <div
            className="absolute inset-0 opacity-[0.07] pointer-events-none"
            style={{
              backgroundImage:
                'radial-gradient(rgba(255,255,255,0.6) 0.6px, transparent 0.6px)',
              backgroundSize: '6px 6px',
            }}
          />

          {/* Inlaid Gold Casino Table Trim */}
          <div className="absolute inset-2.5 rounded-t-[70px] rounded-b-[16px] border border-amber-300/25 pointer-events-none" />

          {/* =================================================================
              SLOW FACE-DOWN FLYING CARD THROW OVERLAY (CURIOSITY BUILDER)
              ================================================================= */}
          <AnimatePresence>
            {throwingSide && !prefersReducedMotion && (
              <motion.div
                key={`throw-${throwingSide}`}
                initial={{
                  x: -74,
                  y: 8,
                  scale: 0.66,
                  rotate: -18,
                  opacity: 0.95,
                }}
                animate={{
                  x: throwingSide === 'dragon' ? -95 : 95,
                  y: 126,
                  scale: 1,
                  rotate: throwingSide === 'dragon' ? -4 : 4,
                  opacity: 1,
                }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{
                  duration: 0.78,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="pointer-events-none absolute left-1/2 top-4 -ml-[36px] z-30"
              >
                <CasinoCardBack side={throwingSide} glowing />
              </motion.div>
            )}
          </AnimatePresence>

          {/* =================================================================
              TOP TABLE ROW: DEALER SHOE + CURIOSITY CUE + TIE 9:1 SPOT
              ================================================================= */}
          <div className="relative z-10 grid grid-cols-3 items-center gap-2 mb-3">
            {/* Dealer Card Shoe */}
            <div className="flex flex-col items-center justify-center">
              <div className="relative w-12 h-16">
                <div className="absolute inset-0 translate-x-1 translate-y-1 rounded-md bg-red-950 border border-amber-500/40 shadow" />
                <div className="absolute inset-0 translate-x-0.5 translate-y-0.5 rounded-md bg-red-900 border border-amber-400/50 shadow" />
                <motion.div
                  animate={
                    throwingSide && !prefersReducedMotion
                      ? { x: [0, 3, 0], y: [0, -2, 0] }
                      : { x: 0, y: 0 }
                  }
                  transition={{ duration: 0.35 }}
                  className="relative w-12 h-16 rounded-md bg-gradient-to-br from-red-800 via-red-900 to-rose-950 border border-amber-400/70 shadow-lg flex items-center justify-center overflow-hidden"
                >
                  <div
                    className="w-9 h-12 rounded-sm border border-amber-300/40 opacity-80"
                    style={{
                      backgroundImage:
                        'repeating-linear-gradient(45deg, rgba(251,191,36,0.18) 0px, rgba(251,191,36,0.18) 2px, transparent 2px, transparent 6px)',
                    }}
                  />
                </motion.div>
              </div>
              <span className="mt-1 text-[10px] font-medium text-emerald-100/75">
                Dealer Shoe
              </span>
            </div>

            {/* Center TIE (9:1) Medallion Bet Zone */}
            <div className="flex flex-col items-center">
              <button
                type="button"
                onClick={() => onPlaceBet('tie')}
                disabled={!isBetting || isSubmittingBet}
                className={`w-full max-w-[106px] rounded-2xl border px-2.5 py-2 text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
                  isResult && winner === 'tie'
                    ? 'border-amber-300 bg-emerald-950/80 ring-2 ring-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.35)]'
                    : myBets.tie
                    ? 'border-amber-400 bg-black/40 shadow-md'
                    : isBetting
                    ? 'border-amber-300/45 bg-black/25 hover:bg-black/40 hover:border-amber-300/80 active:scale-95 cursor-pointer'
                    : 'border-emerald-300/20 bg-black/25 cursor-default'
                }`}
              >
                <div className="text-xs font-bold tracking-wider text-emerald-200">TIE</div>
                <div className="text-[11px] font-mono text-amber-300 tabular-nums">9 : 1</div>
                <div className="mt-0.5 text-[10px] font-mono text-emerald-100/75 tabular-nums">
                  {myBets.tie
                    ? `Bet ₹${myBets.tie.toLocaleString()}`
                    : `Pool ₹${parseInt(tieBetAmount || '0', 10).toLocaleString()}`}
                </div>
              </button>
            </div>

            {/* Right Table Rule Cue */}
            <div className="flex flex-col items-center justify-center text-center px-1">
              <div className="rounded-lg border border-amber-400/25 bg-black/25 px-2 py-1.5 w-full">
                <div className="text-[10px] text-amber-200/80 font-medium">High Card</div>
                <div className="text-[11px] font-semibold text-white mt-0.5 tabular-nums">
                  Ace = 1
                </div>
                <div className="text-[11px] font-semibold text-amber-300 tabular-nums">
                  King = 13
                </div>
              </div>
            </div>
          </div>

          {/* Curiosity / Suspense Banner Strip on Felt */}
          <div className="relative z-10 mb-2.5 text-center">
            <span className="text-[11px] font-medium text-amber-200/95 tracking-wide">
              {curiosityBannerText}
            </span>
          </div>

          {/* =================================================================
              DRAGON VS TIGER FELT CARD & BETTING ZONES
              ================================================================= */}
          <div className="relative z-10 grid grid-cols-2 gap-2.5">
            {/* LEFT HALF: DRAGON */}
            <button
              type="button"
              onClick={() => onPlaceBet('dragon')}
              disabled={!isBetting || isSubmittingBet}
              className={`group relative rounded-2xl border p-2.5 text-left transition-all flex flex-col justify-between min-h-[214px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
                isResult && winner === 'dragon'
                  ? 'border-amber-300 bg-red-950/55 ring-2 ring-amber-400/85 shadow-[0_0_24px_rgba(251,191,36,0.3)]'
                  : myBets.dragon
                  ? 'border-amber-400/80 bg-black/30 shadow-lg'
                  : isBetting
                  ? 'border-red-400/40 bg-black/25 hover:bg-black/35 hover:border-red-300/75 active:scale-[0.985] cursor-pointer'
                  : 'border-emerald-300/20 bg-black/25 cursor-default'
              }`}
            >
              <div className="flex items-baseline justify-between gap-1 border-b border-red-300/25 pb-1.5">
                <div>
                  <div className="text-sm font-bold tracking-wide text-red-200">DRAGON</div>
                  <div className="text-[11px] text-emerald-100/75 tabular-nums">1 : 1</div>
                </div>
                <span className="text-[11px] font-mono text-amber-200/90 tabular-nums">
                  {dragonRevealed && dragonCard
                    ? getDtPointLabel(dragonCard.rank)
                    : dragonPlaced
                    ? 'Hidden'
                    : 'Ready'}
                </span>
              </div>

              <div className="my-2.5 flex-1 flex items-center justify-center">
                <SlowFlipCard
                  side="dragon"
                  placed={dragonPlaced}
                  revealed={dragonRevealed}
                  peeking={revealStage === 'revealing_dragon'}
                  card={dragonCard}
                  isWinner={isResult && winner === 'dragon'}
                  isBetting={isBetting}
                />
              </div>

              <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-emerald-400/15 text-[11px] tabular-nums">
                <span className="text-emerald-100/75">
                  Pool ₹{parseInt(dragonBetAmount || '0', 10).toLocaleString()}
                </span>
                {myBets.dragon ? (
                  <span className="font-mono font-bold text-amber-300">
                    Bet ₹{myBets.dragon.toLocaleString()}
                  </span>
                ) : (
                  <span className="text-amber-200/80 font-medium">
                    {isBetting ? `Tap +₹${selectedChip}` : isResult && winner === 'dragon' ? 'Winner' : 'Locked'}
                  </span>
                )}
              </div>
            </button>

            {/* RIGHT HALF: TIGER */}
            <button
              type="button"
              onClick={() => onPlaceBet('tiger')}
              disabled={!isBetting || isSubmittingBet}
              className={`group relative rounded-2xl border p-2.5 text-left transition-all flex flex-col justify-between min-h-[214px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
                isResult && winner === 'tiger'
                  ? 'border-amber-300 bg-amber-950/55 ring-2 ring-amber-400/85 shadow-[0_0_24px_rgba(251,191,36,0.3)]'
                  : myBets.tiger
                  ? 'border-amber-400/80 bg-black/30 shadow-lg'
                  : isBetting
                  ? 'border-amber-400/40 bg-black/25 hover:bg-black/35 hover:border-amber-300/75 active:scale-[0.985] cursor-pointer'
                  : 'border-emerald-300/20 bg-black/25 cursor-default'
              }`}
            >
              <div className="flex items-baseline justify-between gap-1 border-b border-amber-300/25 pb-1.5">
                <div>
                  <div className="text-sm font-bold tracking-wide text-amber-200">TIGER</div>
                  <div className="text-[11px] text-emerald-100/75 tabular-nums">1 : 1</div>
                </div>
                <span className="text-[11px] font-mono text-amber-200/90 tabular-nums">
                  {tigerRevealed && tigerCard
                    ? getDtPointLabel(tigerCard.rank)
                    : tigerPlaced
                    ? 'Hidden'
                    : 'Ready'}
                </span>
              </div>

              <div className="my-2.5 flex-1 flex items-center justify-center">
                <SlowFlipCard
                  side="tiger"
                  placed={tigerPlaced}
                  revealed={tigerRevealed}
                  peeking={revealStage === 'revealing_tiger'}
                  card={tigerCard}
                  isWinner={isResult && winner === 'tiger'}
                  isBetting={isBetting}
                />
              </div>

              <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-emerald-400/15 text-[11px] tabular-nums">
                <span className="text-emerald-100/75">
                  Pool ₹{parseInt(tigerBetAmount || '0', 10).toLocaleString()}
                </span>
                {myBets.tiger ? (
                  <span className="font-mono font-bold text-amber-300">
                    Bet ₹{myBets.tiger.toLocaleString()}
                  </span>
                ) : (
                  <span className="text-amber-200/80 font-medium">
                    {isBetting ? `Tap +₹${selectedChip}` : isResult && winner === 'tiger' ? 'Winner' : 'Locked'}
                  </span>
                )}
              </div>
            </button>
          </div>

          {/* Table Pot Summary Footer on Felt */}
          <div className="relative z-10 mt-2.5 flex items-center justify-between px-1 text-[11px] text-emerald-100/80 tabular-nums">
            <span>
              Table Pot:{' '}
              <strong className="font-mono text-amber-200">
                ₹{parseInt(totalBetAmount || '0', 10).toLocaleString()}
              </strong>
            </span>
            <span className="font-mono">{totalBetsCount} bets</span>
          </div>
        </div>
      </div>
    </div>
  );
};
