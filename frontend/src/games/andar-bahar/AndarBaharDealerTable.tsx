import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Card,
  SUIT_SYMBOLS,
  SUIT_COLORS,
  getRankLabel,
} from '../../../../shared/src/utils/teenPatti';
import { AndarBaharRoundStatus } from '../../../../shared/src/types';

export interface DealtCardItem {
  side: 'andar' | 'bahar';
  card: Card;
}

export interface ActiveCardThrow {
  key: string;
  side: 'andar' | 'bahar';
  card: Card;
}

interface AndarBaharDealerTableProps {
  status: AndarBaharRoundStatus | string;
  jokerCard: Card | null;
  firstSide: 'andar' | 'bahar';
  dealtCards: DealtCardItem[];
  activeThrow: ActiveCardThrow | null;
  winningSide: 'andar' | 'bahar' | null;
  andarBetAmount: string;
  baharBetAmount: string;
  totalBetAmount: string;
  totalBetsCount: number;
  myBets: Record<string, number>;
  selectedChip: number;
  isSubmittingBet: boolean;
  onPlaceBet: (side: 'andar' | 'bahar') => void;
}

const CasinoCardFace: React.FC<{
  card: Card;
  size?: 'sm' | 'md';
  isWinningMatch?: boolean;
}> = ({ card, size = 'sm', isWinningMatch = false }) => {
  const isRed = SUIT_COLORS[card.suit] === 'red';
  const rankLabel = getRankLabel(card.rank);
  const suitSymbol = SUIT_SYMBOLS[card.suit];

  if (size === 'md') {
    return (
      <div
        className={`w-14 h-20 rounded-lg bg-gradient-to-br from-white via-stone-50 to-stone-200 border-2 flex flex-col justify-between p-1.5 select-none shadow-[0_8px_18px_rgba(0,0,0,0.55)] ${
          isWinningMatch ? 'border-amber-400 ring-2 ring-amber-300/80' : 'border-amber-400/90'
        }`}
      >
        <div className="flex items-center justify-between leading-none">
          <span className={`text-xs font-black tracking-tight ${isRed ? 'text-red-600' : 'text-zinc-900'}`}>
            {rankLabel}
          </span>
          <span className={`text-xs ${isRed ? 'text-red-600' : 'text-zinc-900'}`}>{suitSymbol}</span>
        </div>
        <div className="flex items-center justify-center my-auto">
          <span className={`text-2xl leading-none ${isRed ? 'text-red-600' : 'text-zinc-900'}`}>
            {suitSymbol}
          </span>
        </div>
        <div className="flex items-center justify-end leading-none rotate-180">
          <span className={`text-xs font-black tracking-tight ${isRed ? 'text-red-600' : 'text-zinc-900'}`}>
            {rankLabel}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`w-9 h-[52px] rounded-md flex flex-col justify-between p-1 select-none shadow-[0_4px_10px_rgba(0,0,0,0.48)] border transition-transform ${
        isWinningMatch
          ? 'bg-gradient-to-br from-amber-100 via-yellow-50 to-amber-200 border-amber-400 ring-2 ring-amber-400 -translate-y-1 z-20'
          : 'bg-gradient-to-br from-white to-stone-100 border-stone-300'
      }`}
    >
      <div className="flex items-center justify-between leading-none">
        <span className={`text-[10px] font-black tabular-nums ${isRed ? 'text-red-600' : 'text-zinc-900'}`}>
          {rankLabel}
        </span>
        <span className={`text-[10px] ${isRed ? 'text-red-600' : 'text-zinc-900'}`}>{suitSymbol}</span>
      </div>
      <div className="flex items-center justify-center my-auto">
        <span className={`text-base leading-none ${isRed ? 'text-red-600' : 'text-zinc-900'}`}>
          {suitSymbol}
        </span>
      </div>
      <div className="flex items-center justify-end leading-none rotate-180">
        <span className={`text-[8px] font-bold ${isRed ? 'text-red-600' : 'text-zinc-900'}`}>
          {rankLabel}
        </span>
      </div>
    </div>
  );
};

export const AndarBaharDealerTable: React.FC<AndarBaharDealerTableProps> = ({
  status,
  jokerCard,
  firstSide,
  dealtCards,
  activeThrow,
  winningSide,
  andarBetAmount,
  baharBetAmount,
  totalBetAmount,
  totalBetsCount,
  myBets,
  selectedChip,
  isSubmittingBet,
  onPlaceBet,
}) => {
  const prefersReducedMotion = useReducedMotion();

  const andarCards = dealtCards.filter((c) => c.side === 'andar');
  const baharCards = dealtCards.filter((c) => c.side === 'bahar');
  const isBetting = status === AndarBaharRoundStatus.BETTING;
  const isDealing = status === AndarBaharRoundStatus.DEALING;
  const isResult = status === AndarBaharRoundStatus.RESULT;

  const activeSide: 'andar' | 'bahar' | null = activeThrow
    ? activeThrow.side
    : isResult
    ? winningSide
    : null;

  // Dealer gaze & head lean follows the side being dealt or celebrating
  const headTiltDeg = prefersReducedMotion
    ? 0
    : activeSide === 'andar'
    ? -6
    : activeSide === 'bahar'
    ? 6
    : 0;
  const gazeOffsetX = prefersReducedMotion
    ? 0
    : activeSide === 'andar'
    ? -2.2
    : activeSide === 'bahar'
    ? 2.2
    : 0;

  // Right arm throw animation keyframes whenever a card is thrown from the shoe
  const rightArmAnimate = (() => {
    if (prefersReducedMotion) return { x: 0, y: 0, rotate: 0 };
    if (activeThrow) {
      return activeThrow.side === 'andar'
        ? {
            x: [-18, -8, -42, 0],
            y: [4, -2, 22, 0],
            rotate: [18, 6, 36, 0],
          }
        : {
            x: [-18, 6, 38, 0],
            y: [4, -2, 22, 0],
            rotate: [18, -8, -34, 0],
          };
    }
    if (isResult && winningSide) {
      return winningSide === 'andar'
        ? { x: -24, y: 8, rotate: 24 }
        : { x: 24, y: 8, rotate: -24 };
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
    if (isResult && winningSide === 'andar') {
      return { x: -10, y: 4, rotate: 14 };
    }
    return { x: 0, y: 0, rotate: 0 };
  })();

  const isJokerRed = jokerCard ? SUIT_COLORS[jokerCard.suit] === 'red' : false;
  const andarOdds = firstSide === 'andar' ? '1.90x' : '2.00x';
  const baharOdds = firstSide === 'bahar' ? '1.90x' : '2.00x';

  const visibleAndarCards = andarCards.slice(-6);
  const visibleBaharCards = baharCards.slice(-6);

  return (
    <div className="relative w-full select-none">
      {/* =====================================================================
          1. HUMAN CASINO DEALER AT HEAD OF TABLE
          ===================================================================== */}
      <div className="relative z-10 flex flex-col items-center -mb-7 pointer-events-none">
        <div className="relative w-[220px] h-[126px] flex items-end justify-center">
          {/* Warm ambient casino spotlight behind dealer */}
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
              <linearGradient id="abSkin" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#E6B28A" />
                <stop offset="100%" stopColor="#C88B60" />
              </linearGradient>
              <linearGradient id="abSuitVest" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#26262b" />
                <stop offset="100%" stopColor="#121216" />
              </linearGradient>
              <linearGradient id="abHair" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#2c1d16" />
                <stop offset="100%" stopColor="#140d0a" />
              </linearGradient>
              <linearGradient id="abSleeve" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f8fafc" />
                <stop offset="100%" stopColor="#cbd5e1" />
              </linearGradient>
            </defs>

            {/* Dealer Torso / Shoulders */}
            <motion.g
              animate={
                prefersReducedMotion
                  ? {}
                  : { y: isBetting ? [0, -1.2, 0] : 0 }
              }
              transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
            >
              {/* Crisp White Shirt Shoulders */}
              <path
                d="M54 114 C56 86, 74 78, 110 78 C146 78, 164 86, 166 114 Z"
                fill="url(#abSleeve)"
              />
              {/* Tailored Black Waistcoat */}
              <path
                d="M66 116 C68 89, 82 80, 110 80 C138 80, 152 89, 154 116 Z"
                fill="url(#abSuitVest)"
                stroke="#3f3f46"
                strokeWidth="0.9"
              />
              {/* Burgundy & Gold Lapel V-Opening */}
              <polygon points="94,80 110,108 126,80" fill="#f8fafc" />
              <path d="M94 80 L110 108 L104 112 L88 84 Z" fill="#7f1d1d" />
              <path d="M126 80 L110 108 L116 112 L132 84 Z" fill="#7f1d1d" />
              {/* Gold Waistcoat Buttons */}
              <circle cx="110" cy="111" r="1.7" fill="#fbbf24" />
              {/* Bow Tie */}
              <polygon points="101,81 110,85 101,89" fill="#991b1b" />
              <polygon points="119,81 110,85 119,89" fill="#991b1b" />
              <circle cx="110" cy="85" r="2.2" fill="#f59e0b" />

              {/* Neck */}
              <rect x="102" y="65" width="16" height="17" rx="6" fill="url(#abSkin)" />
              <path d="M102 71 Q110 76 118 71" fill="rgba(0,0,0,0.18)" />
            </motion.g>

            {/* Head & Reactive Face/Gaze */}
            <motion.g
              style={{ originX: '110px', originY: '66px' }}
              animate={{ rotate: headTiltDeg, x: gazeOffsetX * 1.1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 20 }}
            >
              {/* Ears */}
              <ellipse cx="89" cy="49" rx="3.4" ry="5.5" fill="#d39a70" />
              <ellipse cx="131" cy="49" rx="3.4" ry="5.5" fill="#d39a70" />
              {/* Face */}
              <path
                d="M91 40 C91 24, 129 24, 129 40 L128 53 C127 65, 118 70, 110 70 C102 70, 93 65, 92 53 Z"
                fill="url(#abSkin)"
              />
              {/* Hair */}
              <path
                d="M89 42 C87 23, 102 17, 112 18 C126 18, 133 27, 131 42 C128 33, 122 29, 110 29 C99 29, 93 34, 89 42 Z"
                fill="url(#abHair)"
              />
              {/* Eyebrows */}
              <path d="M97 41 Q101.5 39 105.5 41" stroke="#2c1d16" strokeWidth="1.7" strokeLinecap="round" fill="none" />
              <path d="M114.5 41 Q118.5 39 123 41" stroke="#2c1d16" strokeWidth="1.7" strokeLinecap="round" fill="none" />
              {/* Eyes + Tracking Pupils */}
              <ellipse cx="101.5" cy="46" rx="3.2" ry="2.2" fill="#ffffff" />
              <ellipse cx="118.5" cy="46" rx="3.2" ry="2.2" fill="#ffffff" />
              <motion.circle
                cx={101.5 + gazeOffsetX * 0.45}
                cy="46.2"
                r="1.45"
                fill="#1c1410"
              />
              <motion.circle
                cx={118.5 + gazeOffsetX * 0.45}
                cy="46.2"
                r="1.45"
                fill="#1c1410"
              />
              {/* Subtle Nose & Warm Smile */}
              <path d="M110 47 L109 53 L111.5 54" stroke="#b3754a" strokeWidth="1.3" strokeLinecap="round" fill="none" />
              <path
                d={isResult ? 'M103 59 Q110 64 117 59' : 'M104 60 Q110 63 116 60'}
                stroke="#8f4f38"
                strokeWidth="1.6"
                strokeLinecap="round"
                fill="none"
              />
            </motion.g>

            {/* Left Arm (steadying the dealing shoe on the felt) */}
            <motion.g
              style={{ originX: '64px', originY: '92px' }}
              animate={leftArmAnimate}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            >
              {/* Shirt Sleeve */}
              <path
                d="M64 90 C50 96, 42 108, 46 119 L59 120 C59 111, 64 103, 72 99 Z"
                fill="url(#abSleeve)"
              />
              {/* Gold Cufflink */}
              <rect x="46" y="116" width="13" height="4" rx="1.5" fill="#e2e8f0" />
              <circle cx="49" cy="118" r="1.2" fill="#f59e0b" />
              {/* Left Hand resting near deck */}
              <path
                d="M46 119 C44 126, 52 130, 60 127 C64 125, 64 120, 58 119 Z"
                fill="url(#abSkin)"
              />
              <line x1="50" y1="123" x2="50" y2="127" stroke="#b9784e" strokeWidth="0.9" strokeLinecap="round" />
              <line x1="54" y1="123" x2="54" y2="127" stroke="#b9784e" strokeWidth="0.9" strokeLinecap="round" />
            </motion.g>

            {/* Right Dealing Arm & Articulated Hand (throws cards Left/Right!) */}
            <motion.g
              style={{ originX: '156px', originY: '92px' }}
              animate={rightArmAnimate}
              transition={
                activeThrow
                  ? { duration: 0.44, times: [0, 0.25, 0.62, 1], ease: [0.22, 1, 0.36, 1] }
                  : isBetting
                  ? { duration: 2.8, repeat: Infinity, ease: 'easeInOut' }
                  : { type: 'spring', stiffness: 200, damping: 18 }
              }
            >
              {/* Shirt Sleeve */}
              <path
                d="M156 90 C170 96, 178 108, 174 119 L161 120 C161 111, 156 103, 148 99 Z"
                fill="url(#abSleeve)"
              />
              {/* Gold Cufflink */}
              <rect x="161" y="116" width="13" height="4" rx="1.5" fill="#e2e8f0" />
              <circle cx="171" cy="118" r="1.2" fill="#f59e0b" />
              {/* Articulated Dealing Hand + Fingers */}
              <path
                d="M161 119 C157 123, 157 128, 165 129 C172 130, 177 125, 174 119 Z"
                fill="url(#abSkin)"
              />
              {/* Dealing Card Held Between Fingers during Throw */}
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
        {/* Inner Padded Leather Rail Rim */}
        <div
          className="relative rounded-t-[78px] rounded-b-[20px] p-3 pt-7 overflow-hidden"
          style={{
            background:
              'radial-gradient(ellipse at 50% 24%, #146c43 0%, #0d5031 52%, #072e1c 100%)',
            boxShadow:
              'inset 0 8px 24px rgba(0,0,0,0.68), inset 0 0 0 2px rgba(251, 191, 36, 0.24)',
          }}
        >
          {/* Subtle Felt Weave Texture */}
          <div
            className="absolute inset-0 opacity-[0.07] pointer-events-none"
            style={{
              backgroundImage:
                'radial-gradient(rgba(255,255,255,0.6) 0.6px, transparent 0.6px)',
              backgroundSize: '6px 6px',
            }}
          />

          {/* Inlaid Gold Casino Table Markings Arc */}
          <div className="absolute inset-2.5 rounded-t-[70px] rounded-b-[16px] border border-amber-300/25 pointer-events-none" />

          {/* =================================================================
              FLYING CARD THROW OVERLAY (DEALER SHOE -> ANDAR OR BAHAR)
              ================================================================= */}
          <AnimatePresence>
            {activeThrow && !prefersReducedMotion && (
              <motion.div
                key={activeThrow.key}
                initial={{
                  x: -44,
                  y: 6,
                  scale: 0.68,
                  rotate: -18,
                  rotateY: 180,
                  opacity: 0.95,
                }}
                animate={{
                  x: activeThrow.side === 'andar' ? -92 : 92,
                  y: 122,
                  scale: 1,
                  rotate: activeThrow.side === 'andar' ? -6 : 6,
                  rotateY: 0,
                  opacity: 1,
                }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{
                  duration: 0.38,
                  ease: [0.16, 1, 0.3, 1],
                }}
                style={{
                  perspective: 600,
                  transformStyle: 'preserve-3d',
                }}
                className="pointer-events-none absolute left-1/2 top-4 -ml-[18px] z-30"
              >
                <CasinoCardFace card={activeThrow.card} size="sm" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* =================================================================
              TABLE TOP ROW: DEALER CARD SHOE + CENTRAL JOKER PEDESTAL + ODDS
              ================================================================= */}
          <div className="relative z-10 grid grid-cols-3 items-center gap-2 mb-3">
            {/* Dealer Shoe Stack (Left of Joker) */}
            <div className="flex flex-col items-center justify-center">
              <div className="relative w-12 h-16">
                {/* Stacked Deck Depth */}
                <div className="absolute inset-0 translate-x-1 translate-y-1 rounded-md bg-red-950 border border-amber-500/40 shadow" />
                <div className="absolute inset-0 translate-x-0.5 translate-y-0.5 rounded-md bg-red-900 border border-amber-400/50 shadow" />
                <motion.div
                  animate={
                    activeThrow && !prefersReducedMotion
                      ? { x: [0, 3, 0], y: [0, -2, 0] }
                      : { x: 0, y: 0 }
                  }
                  transition={{ duration: 0.25 }}
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
              <span className="mt-1 text-[10px] font-medium text-emerald-100/75 tracking-wide">
                Shoe · {dealtCards.length} dealt
              </span>
            </div>

            {/* Center Joker Card Pedestal */}
            <div className="flex flex-col items-center">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-200 mb-1">
                Joker Card
              </span>
              {jokerCard ? (
                <div className="relative p-1 rounded-xl border border-amber-400/60 bg-black/25 shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)]">
                  <CasinoCardFace card={jokerCard} size="md" />
                </div>
              ) : (
                <div className="w-16 h-22 rounded-xl border border-dashed border-amber-400/40 bg-black/20 flex items-center justify-center text-[11px] text-emerald-100/60">
                  Wait
                </div>
              )}
              <span className="mt-1 text-[10px] font-medium text-emerald-100/85 text-center leading-tight">
                {jokerCard
                  ? `Match ${getRankLabel(jokerCard.rank)} · ${isJokerRed ? 'Bahar 1st' : 'Andar 1st'}`
                  : 'Next round'}
              </span>
            </div>

            {/* Table Rules / First-Side Cue (Right of Joker) */}
            <div className="flex flex-col items-center justify-center text-center px-1">
              <div className="rounded-lg border border-amber-400/25 bg-black/25 px-2 py-1.5 w-full">
                <div className="text-[10px] text-amber-200/80 font-medium">Table Rules</div>
                <div className="text-[11px] font-semibold text-white mt-0.5 tabular-nums">
                  1st: 1.90x
                </div>
                <div className="text-[11px] font-semibold text-amber-300 tabular-nums">
                  2nd: 2.00x
                </div>
              </div>
            </div>
          </div>

          {/* =================================================================
              ANDAR & BAHAR FELT LANDING & INTERACTIVE BET ZONES
              ================================================================= */}
          <div className="relative z-10 grid grid-cols-2 gap-2.5">
            {/* LEFT HALF: ANDAR */}
            <button
              type="button"
              onClick={() => onPlaceBet('andar')}
              disabled={!isBetting || isSubmittingBet}
              className={`group relative rounded-2xl border p-2.5 text-left transition-all flex flex-col justify-between min-h-[178px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
                winningSide === 'andar'
                  ? 'border-amber-300 bg-emerald-950/65 ring-2 ring-amber-400/80 shadow-[0_0_24px_rgba(251,191,36,0.28)]'
                  : myBets.andar
                  ? 'border-amber-400/80 bg-black/30 shadow-lg'
                  : isBetting
                  ? 'border-amber-300/35 bg-black/25 hover:bg-black/35 hover:border-amber-300/70 active:scale-[0.985] cursor-pointer'
                  : 'border-emerald-300/20 bg-black/25 cursor-default'
              }`}
            >
              {/* Zone Header */}
              <div className="flex items-baseline justify-between gap-1 border-b border-amber-300/20 pb-1.5">
                <div>
                  <div className="text-sm font-bold tracking-wide text-white">ANDAR</div>
                  <div className="text-[11px] text-emerald-100/75 tabular-nums">
                    {andarOdds} {firstSide === 'andar' ? '· 1st' : '· 2nd'}
                  </div>
                </div>
                <span className="text-[11px] font-mono text-amber-200/90 tabular-nums">
                  {andarCards.length} cards
                </span>
              </div>

              {/* Dealt Card Cascade on Felt */}
              <div className="my-2 flex-1 flex items-center justify-center min-h-[60px]">
                {andarCards.length === 0 ? (
                  <span className="text-[11px] text-emerald-100/50">
                    {isBetting ? `Tap +₹${selectedChip}` : 'Waiting for deal'}
                  </span>
                ) : (
                  <div className="flex items-center justify-center pl-2">
                    {visibleAndarCards.map((item, idx) => {
                      const isMatch =
                        Boolean(jokerCard && item.card.rank === jokerCard.rank);
                      return (
                        <motion.div
                          key={`${item.card.suit}-${item.card.rank}`}
                          initial={prefersReducedMotion ? { opacity: 0 } : { scale: 0.85, opacity: 0, y: -8 }}
                          animate={{ scale: 1, opacity: 1, y: 0 }}
                          transition={{ duration: 0.22, ease: 'easeOut' }}
                          className={idx === 0 ? '' : '-ml-4'}
                          style={{ zIndex: idx + 1 }}
                        >
                          <CasinoCardFace card={item.card} isWinningMatch={isMatch} />
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Placed Chip / Side Total */}
              <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-emerald-400/15 text-[11px] tabular-nums">
                <span className="text-emerald-100/75">
                  Pool ₹{parseInt(andarBetAmount || '0', 10).toLocaleString()}
                </span>
                {myBets.andar ? (
                  <span className="font-mono font-bold text-amber-300">
                    Bet ₹{myBets.andar.toLocaleString()}
                  </span>
                ) : (
                  <span className="text-amber-200/80 font-medium">
                    {isBetting ? 'Tap to bet' : isDealing ? 'Live' : winningSide === 'andar' ? 'Winner' : 'Settled'}
                  </span>
                )}
              </div>
            </button>

            {/* RIGHT HALF: BAHAR */}
            <button
              type="button"
              onClick={() => onPlaceBet('bahar')}
              disabled={!isBetting || isSubmittingBet}
              className={`group relative rounded-2xl border p-2.5 text-left transition-all flex flex-col justify-between min-h-[178px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
                winningSide === 'bahar'
                  ? 'border-amber-300 bg-emerald-950/65 ring-2 ring-amber-400/80 shadow-[0_0_24px_rgba(251,191,36,0.28)]'
                  : myBets.bahar
                  ? 'border-amber-400/80 bg-black/30 shadow-lg'
                  : isBetting
                  ? 'border-amber-300/35 bg-black/25 hover:bg-black/35 hover:border-amber-300/70 active:scale-[0.985] cursor-pointer'
                  : 'border-emerald-300/20 bg-black/25 cursor-default'
              }`}
            >
              {/* Zone Header */}
              <div className="flex items-baseline justify-between gap-1 border-b border-amber-300/20 pb-1.5">
                <div>
                  <div className="text-sm font-bold tracking-wide text-white">BAHAR</div>
                  <div className="text-[11px] text-emerald-100/75 tabular-nums">
                    {baharOdds} {firstSide === 'bahar' ? '· 1st' : '· 2nd'}
                  </div>
                </div>
                <span className="text-[11px] font-mono text-amber-200/90 tabular-nums">
                  {baharCards.length} cards
                </span>
              </div>

              {/* Dealt Card Cascade on Felt */}
              <div className="my-2 flex-1 flex items-center justify-center min-h-[60px]">
                {baharCards.length === 0 ? (
                  <span className="text-[11px] text-emerald-100/50">
                    {isBetting ? `Tap +₹${selectedChip}` : 'Waiting for deal'}
                  </span>
                ) : (
                  <div className="flex items-center justify-center pl-2">
                    {visibleBaharCards.map((item, idx) => {
                      const isMatch =
                        Boolean(jokerCard && item.card.rank === jokerCard.rank);
                      return (
                        <motion.div
                          key={`${item.card.suit}-${item.card.rank}`}
                          initial={prefersReducedMotion ? { opacity: 0 } : { scale: 0.85, opacity: 0, y: -8 }}
                          animate={{ scale: 1, opacity: 1, y: 0 }}
                          transition={{ duration: 0.22, ease: 'easeOut' }}
                          className={idx === 0 ? '' : '-ml-4'}
                          style={{ zIndex: idx + 1 }}
                        >
                          <CasinoCardFace card={item.card} isWinningMatch={isMatch} />
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Placed Chip / Side Total */}
              <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-emerald-400/15 text-[11px] tabular-nums">
                <span className="text-emerald-100/75">
                  Pool ₹{parseInt(baharBetAmount || '0', 10).toLocaleString()}
                </span>
                {myBets.bahar ? (
                  <span className="font-mono font-bold text-amber-300">
                    Bet ₹{myBets.bahar.toLocaleString()}
                  </span>
                ) : (
                  <span className="text-amber-200/80 font-medium">
                    {isBetting ? 'Tap to bet' : isDealing ? 'Live' : winningSide === 'bahar' ? 'Winner' : 'Settled'}
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
