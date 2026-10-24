import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

type DateInput = string | number | Date | null | undefined;

/** "2 minutes ago", "in 3 hours". Empty string for null. */
export function formatRelative(date: DateInput): string {
  if (date === null || date === undefined) return "";
  return dayjs(date).fromNow();
}

/** "3:42 PM" */
export function formatTime(date: DateInput): string {
  if (date === null || date === undefined) return "";
  return dayjs(date).format("h:mm A");
}

/** "28 Sep 2026, 3:42 PM" */
export function formatDateTime(date: DateInput): string {
  if (date === null || date === undefined) return "";
  return dayjs(date).format("D MMM YYYY, h:mm A");
}

/** Chat/list timestamp: time if today, "Yesterday", weekday within a week, otherwise "28 Sep". */
export function formatShortDate(date: DateInput): string {
  if (date === null || date === undefined) return "";
  const d = dayjs(date);
  const now = dayjs();
  if (d.isSame(now, "day")) return d.format("h:mm A");
  if (d.isSame(now.subtract(1, "day"), "day")) return "Yesterday";
  if (now.diff(d, "day") < 7) return d.format("ddd");
  return d.isSame(now, "year") ? d.format("D MMM") : d.format("D MMM YYYY");
}

/** Day separator in a chat thread: "Today", "Yesterday", "Mon, 21 Sep". */
export function formatDayLabel(date: DateInput): string {
  if (date === null || date === undefined) return "";
  const d = dayjs(date);
  const now = dayjs();
  if (d.isSame(now, "day")) return "Today";
  if (d.isSame(now.subtract(1, "day"), "day")) return "Yesterday";
  return d.isSame(now, "year") ? d.format("ddd, D MMM") : d.format("D MMM YYYY");
}

/** "45s", "12m", "5h 20m", "25d 9h" — max 2 units */
export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined || !Number.isFinite(totalSeconds)) return "–";
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (h < 24) return remM > 0 ? `${h}h ${remM}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return remH > 0 ? `${d}d ${remH}h` : `${d}d`;
}

export const WINDOW_URGENT_MS = 2 * 60 * 60 * 1000;

export interface WindowTimeLeft {
  /** Milliseconds until the 24h window closes (0 when closed). */
  ms: number;
  expired: boolean;
  /** Less than 2 hours left: show in red. */
  urgent: boolean;
  /** "3h 12m left", "8m left", "Window closed", "No window". */
  label: string;
}

/** Time left in Meta's 24-hour customer service window. */
export function windowTimeLeft(windowClosesAt: DateInput, now: number = Date.now()): WindowTimeLeft {
  if (windowClosesAt === null || windowClosesAt === undefined) {
    return { ms: 0, expired: true, urgent: false, label: "No window" };
  }
  const ms = dayjs(windowClosesAt).valueOf() - now;
  if (ms <= 0) return { ms: 0, expired: true, urgent: true, label: "Window closed" };
  const totalMinutes = Math.floor(ms / 60_000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const label = h > 0 ? `${h}h ${m}m left` : m > 0 ? `${m}m left` : "<1m left";
  return { ms, expired: false, urgent: ms < WINDOW_URGENT_MS, label };
}

/** 0.42 → "42%" */
export function formatPercent(ratio: number | null | undefined, digits = 0): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return "–";
  return `${(ratio * 100).toFixed(digits)}%`;
}

/** Customer display name. */
export function customerLabel(c: { name: string | null; handleOrPhone: string }): string {
  return c.name?.trim() || c.handleOrPhone;
}

/** "ai_active" → "AI active", "new_lead" → "New lead" */
export function humanize(value: string): string {
  const s = value.replace(/_/g, " ").replace(/\bai\b/gi, "AI");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** camelCase keys too: "messageId" → "Message id", "assignedToUserId" → "Assigned to user id". */
export function humanizeKey(key: string): string {
  return humanize(key.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase());
}
