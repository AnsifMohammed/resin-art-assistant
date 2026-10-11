interface AvatarProps {
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  showOnline?: boolean;
}

// Stable distinct hues for names
const AVATAR_COLORS = [
  "#F59E0B", // amber
  "#0F766E", // teal
  "#8B5CF6", // violet
  "#3B82F6", // blue
  "#EC4899", // pink
  "#10B981", // emerald
  "#F97316", // orange
  "#6366F1", // indigo
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    const first = parts[0][0] || "";
    const second = parts[1][0] || "";
    return `${first}${second}`.toUpperCase();
  }
  return (name.slice(0, 2) || "SA").toUpperCase();
}

function getColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index] ?? "#F59E0B";
}

export function Avatar({ name, size = "md", className = "", showOnline }: AvatarProps) {
  const initials = getInitials(name);
  const color = getColor(name);

  const sizeClasses = {
    sm: "w-7 h-7 text-xs",
    md: "w-9 h-9 text-sm",
    lg: "w-11 h-11 text-base",
    xl: "w-14 h-14 text-lg",
  }[size];

  return (
    <div className={`relative inline-flex shrink-0 ${className}`}>
      <div
        className={`${sizeClasses} rounded-full flex items-center justify-center font-semibold text-white shadow-xs select-none`}
        style={{ backgroundColor: color }}
        aria-label={name}
      >
        {initials}
      </div>
      {showOnline && (
        <span
          className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-surface"
          title="Online"
        />
      )}
    </div>
  );
}
