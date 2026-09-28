import { cn } from "../../lib/cn.ts";
import type { ChannelType } from "../../types/index.ts";

/**
 * Channel glyph. lucide-react 1.x ships no brand icons, so these are small inline SVGs
 * (simplified outlines, not the official logos).
 */
export function ChannelIcon({ channel, className }: { channel: ChannelType; className?: string }) {
  const label = channel === "whatsapp" ? "WhatsApp" : "Instagram";
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={label}
      className={cn("h-4 w-4 shrink-0", channel === "whatsapp" ? "text-green-600" : "text-pink-600", className)}
    >
      <title>{label}</title>
      {channel === "whatsapp" ? (
        <>
          <path d="M3 21l1.65-4.6A9 9 0 1 1 8 19.6L3 21z" />
          <path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-1.8-1.8l.8-1-1-2L9 9.5z" />
        </>
      ) : (
        <>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

export const channelLabels: Record<ChannelType, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
};
