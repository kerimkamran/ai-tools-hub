/**
 * An original, stylised mascot for the assistant -- a flat-illustration
 * Victorian inventor (receding hairline, full grey beard, dark coat and bow
 * tie) holding a classic candlestick telephone to his ear. It is deliberately
 * NOT a portrait likeness of the real, historical Alexander Graham Bell --
 * no photograph or existing artwork of him was referenced -- just an
 * original character built from the era's well-known silhouette, in the
 * hub's own flat, minimal style and brand colours.
 *
 * Purely decorative: the name "Graham Bell" is always rendered as visible
 * text next to it, so this stays aria-hidden.
 */
export function GrahamBellIllustration({ size = 96, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="100" cy="100" r="98" style={{ fill: "var(--primary)" }} opacity={0.12} />
      <circle cx="100" cy="100" r="90" fill="none" style={{ stroke: "var(--primary)" }} strokeWidth="2" opacity={0.35} />

      {/* Coat shoulders */}
      <path d="M40 190 C 40 148, 68 128, 100 128 C 132 128, 160 148, 160 190 Z" fill="#26333f" />
      {/* Collar */}
      <path d="M84 132 L100 150 L116 132 L108 122 L92 122 Z" fill="#f4f0ea" />
      {/* Bow tie */}
      <path d="M100 144 L84 134 L84 150 Z" style={{ fill: "var(--leaf)" }} />
      <path d="M100 144 L116 134 L116 150 Z" style={{ fill: "var(--leaf)" }} />
      <circle cx="100" cy="144" r="4.5" style={{ fill: "var(--leaf)" }} />

      {/* Neck */}
      <rect x="90" y="106" width="20" height="24" rx="8" fill="#e2b18f" />

      {/* Head */}
      <ellipse cx="100" cy="84" rx="38" ry="40" fill="#eabf98" />

      {/* Ears */}
      <ellipse cx="63" cy="88" rx="7" ry="10" fill="#e2b18f" />
      <ellipse cx="137" cy="88" rx="7" ry="10" fill="#e2b18f" />

      {/* Receding hairline: a thin grey band above the ears, bald on top */}
      <path
        d="M65 66 C 70 44, 90 32, 100 32 C 110 32, 130 44, 135 66 C 128 58, 116 52, 100 52 C 84 52, 72 58, 65 66 Z"
        fill="#c9c9c9"
      />
      <path d="M62 70 C 60 82, 62 94, 68 100 C 63 88, 64 76, 68 68 Z" fill="#c9c9c9" />
      <path d="M138 70 C 140 82, 138 94, 132 100 C 137 88, 136 76, 132 68 Z" fill="#c9c9c9" />

      {/* Eyebrows */}
      <path d="M76 78 Q84 73 92 77" fill="none" stroke="#8a8a8a" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M108 77 Q116 73 124 78" fill="none" stroke="#8a8a8a" strokeWidth="3.5" strokeLinecap="round" />

      {/* Eyes */}
      <circle cx="86" cy="86" r="3.2" fill="#3a2a20" />
      <circle cx="114" cy="86" r="3.2" fill="#3a2a20" />

      {/* Nose */}
      <path d="M99 84 Q95 98 100 102 Q104 100 101 96" fill="none" stroke="#c99a72" strokeWidth="2.5" strokeLinecap="round" />

      {/* Full Victorian beard and moustache, covering the mouth */}
      <path
        d="M62 92
           C 58 112, 62 138, 78 152
           C 88 160, 112 160, 122 152
           C 138 138, 142 112, 138 92
           C 132 104, 122 100, 116 96
           C 110 108, 90 108, 84 96
           C 78 100, 68 104, 62 92 Z"
        fill="#e7e4de"
      />
      <path d="M78 96 C 84 102, 116 102, 122 96 C 118 106, 108 110, 100 110 C 92 110, 82 106, 78 96 Z" fill="#d8d4cc" />

      {/* Classic candlestick telephone, held up near his ear */}
      <g transform="translate(140 96) rotate(18)">
        {/* stand */}
        <rect x="-4" y="0" width="8" height="34" rx="3" fill="#1c1c1c" />
        <ellipse cx="0" cy="36" rx="13" ry="5" fill="#1c1c1c" />
        {/* mouthpiece cone on top */}
        <path d="M-9 -2 L9 -2 L5 -14 L-5 -14 Z" fill="#1c1c1c" />
        <circle cx="0" cy="-15" r="6.5" fill="#111" />
      </g>
      {/* Earpiece receiver at his ear, connected by a short cord */}
      <path d="M140 82 C 132 78, 122 78, 116 82" fill="none" stroke="#1c1c1c" strokeWidth="2" />
      <ellipse cx="115" cy="82" rx="8" ry="5" fill="#1c1c1c" transform="rotate(-20 115 82)" />

      {/* Hand holding the stand */}
      <ellipse cx="140" cy="118" rx="11" ry="9" fill="#e2b18f" />
    </svg>
  );
}
