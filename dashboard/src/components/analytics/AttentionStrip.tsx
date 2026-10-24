import { useNavigate } from "react-router-dom";
import { AlertTriangle, Clock, Package, CreditCard, CheckCircle2 } from "lucide-react";

export interface AttentionData {
  openEscalations: number;
  windowsClosingSoon: number;
  pendingOrders: number;
  unpaidBalance: number;
}

interface AttentionStripProps {
  data: AttentionData;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** ₹4,200 → "₹4.2k", ₹1,25,000 → "₹1.3L" (short chip text; the full amount is in the tooltip). */
function rupeesShort(n: number): string {
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1).replace(/\.0$/, "")}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return `₹${n}`;
}

export function AttentionStrip({ data }: AttentionStripProps) {
  const navigate = useNavigate();

  const chips = [
    {
      id: "escalations",
      count: data.openEscalations,
      label: plural(data.openEscalations, "escalation"),
      title: `${plural(data.openEscalations, "escalation")} waiting for a person`,
      icon: <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" aria-hidden />,
      color: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20",
      href: "/escalations",
    },
    {
      id: "windows",
      count: data.windowsClosingSoon,
      label: `${data.windowsClosingSoon} closing < 2h`,
      title: `${plural(data.windowsClosingSoon, "chat")} where the 24-hour reply window closes in under 2 hours`,
      icon: <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-hidden />,
      color: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20",
      href: "/inbox?state=escalated",
    },
    {
      id: "orders",
      count: data.pendingOrders,
      label: `${data.pendingOrders} pending`,
      title: `${plural(data.pendingOrders, "order")} pending`,
      icon: <Package className="w-3.5 h-3.5 text-blue-500 shrink-0" aria-hidden />,
      color: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300 hover:bg-blue-500/20",
      href: "/orders?status=pending",
    },
    {
      id: "balance",
      count: data.unpaidBalance > 0 ? 1 : 0,
      label: `${rupeesShort(data.unpaidBalance)} unpaid`,
      title: `₹${data.unpaidBalance.toLocaleString("en-IN")} balance unpaid`,
      icon: <CreditCard className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden />,
      color: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20",
      href: "/orders",
    },
  ];

  const activeChips = chips.filter((c) => c.count > 0);

  return (
    <div
      role="region"
      aria-label="Attention required strip"
      className="inline-flex items-center gap-1.5 sm:gap-2 flex-wrap"
    >
      {activeChips.length === 0 ? (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-11 sm:text-12 font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" aria-hidden />
          <span>All clear ✓</span>
        </span>
      ) : (
        activeChips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => navigate(chip.href)}
            title={chip.title}
            aria-label={chip.title}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-11 sm:text-12 font-semibold transition-all shadow-2xs hover:shadow-xs active:scale-[0.98] cursor-pointer whitespace-nowrap ${chip.color}`}
          >
            {chip.icon}
            <span>{chip.label}</span>
          </button>
        ))
      )}
    </div>
  );
}
