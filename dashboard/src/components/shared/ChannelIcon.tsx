import { MessageCircle } from "lucide-react";
import { InstagramIcon } from "./InstagramIcon.tsx";

interface ChannelIconProps {
  channel: "whatsapp" | "instagram" | "both";
  size?: number;
  className?: string;
  showLabel?: boolean;
}

export function ChannelIcon({ channel, size = 16, className = "", showLabel = false }: ChannelIconProps) {
  if (channel === "whatsapp") {
    return (
      <span className={`inline-flex items-center gap-1.5 ${className}`} title="WhatsApp">
        <span
          className="flex items-center justify-center rounded-full text-white shrink-0 p-0.5"
          style={{ backgroundColor: "#25D366" }}
        >
          <MessageCircle size={size} fill="currentColor" className="text-white" />
        </span>
        {showLabel && <span className="text-xs font-medium text-text">WhatsApp</span>}
      </span>
    );
  }

  if (channel === "instagram") {
    return (
      <span className={`inline-flex items-center gap-1.5 ${className}`} title="Instagram">
        <span
          className="flex items-center justify-center rounded-md text-white shrink-0 p-0.5"
          style={{
            background: "linear-gradient(45deg, #F58529, #DD2A7B, #8134AF)",
          }}
        >
          <InstagramIcon size={size} className="text-white" />
        </span>
        {showLabel && <span className="text-xs font-medium text-text">Instagram</span>}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 text-xs text-text-muted ${className}`}>
      <ChannelIcon channel="whatsapp" size={size - 2} />
      <ChannelIcon channel="instagram" size={size - 2} />
      {showLabel && <span>All channels</span>}
    </span>
  );
}
