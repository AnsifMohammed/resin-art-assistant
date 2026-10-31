interface SabaLogoProps {
  className?: string;
  size?: number | string;
  alt?: string;
}

/**
 * Saba Art official 4-tile staggered logo mark (S A B A).
 * Top-left: Gray 'S', Top-right: Cyan 'B', Bottom-left: Cyan 'A', Bottom-right: Gray 'A'.
 */
export function SabaLogo({ className = "w-7 h-7", size, alt = "Saba Art Logo" }: SabaLogoProps) {
  const style = size ? { width: size, height: size } : undefined;

  return (
    <img
      src="/logo.png"
      alt={alt}
      style={style}
      className={`shrink-0 object-contain aspect-square select-none ${className}`}
      draggable={false}
    />
  );
}

/**
 * Scalable Vector SVG mark representation of Saba Art's 4-tile logo.
 */
export function SabaLogoMark({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 aspect-square select-none ${className}`}
      aria-label="Saba Art"
    >
      {/* Top-Left: S (Charcoal Gray) */}
      <rect x="16" y="5" width="82" height="82" rx="4" fill="#606060" />
      <text
        x="57"
        y="66"
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Outfit', 'Inter', sans-serif"
        fontSize="58"
        fontWeight="700"
        fill="#FFFFFF"
        textAnchor="middle"
      >
        S
      </text>

      {/* Top-Right: B (Vibrant Cyan) */}
      <rect x="102" y="28" width="82" height="82" rx="4" fill="#38C7D8" />
      <text
        x="143"
        y="89"
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Outfit', 'Inter', sans-serif"
        fontSize="58"
        fontWeight="700"
        fill="#FFFFFF"
        textAnchor="middle"
      >
        B
      </text>

      {/* Bottom-Left: A (Vibrant Cyan) */}
      <rect x="16" y="90" width="82" height="82" rx="4" fill="#38C7D8" />
      <text
        x="57"
        y="151"
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Outfit', 'Inter', sans-serif"
        fontSize="58"
        fontWeight="700"
        fill="#FFFFFF"
        textAnchor="middle"
      >
        A
      </text>

      {/* Bottom-Right: A (Charcoal Gray) */}
      <rect x="102" y="113" width="82" height="82" rx="4" fill="#606060" />
      <text
        x="143"
        y="174"
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Outfit', 'Inter', sans-serif"
        fontSize="58"
        fontWeight="700"
        fill="#FFFFFF"
        textAnchor="middle"
      >
        A
      </text>
    </svg>
  );
}
