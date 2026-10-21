import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sparkles,
  Truck,
  FileText,
  MessageSquareQuote,
  ShieldAlert,
  Save,
  Plus,
  Trash2,
  Lock,
  CheckCircle2,
  AlertCircle,
  Pencil,
  Bot,
  Send,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { useKnowledgeBase, usePutKnowledgeBase } from "../hooks/useKnowledgeBase.ts";
import { SlideOver } from "../components/shared/SlideOver.tsx";
import { ConfirmDialog } from "../components/shared/ConfirmDialog.tsx";
import { SampleDataBadge } from "../components/shared/SampleDataBadge.tsx";
import type {
  KbDeliveryZone,
  KbProduct,
  KnowledgeBaseData,
} from "../types/index.ts";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const numOr = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);

function normalizeKb(raw: unknown): KnowledgeBaseData {
  const r = isObj(raw) ? raw : {};
  const co = isObj(r.custom_orders) ? r.custom_orders : {};
  const del = isObj(r.delivery) ? r.delivery : {};
  const pay = isObj(r.payment) ? r.payment : {};
  const pol = isObj(r.policies) ? r.policies : {};
  return {
    ...r,
    business_name: str(r.business_name) || "Saba Art",
    products: arr<Obj>(r.products).map((p) => ({
      ...p,
      id: str(p.id),
      name: str(p.name),
      price: numOr(p.price, 0),
      lead_time_days: numOr(p.lead_time_days, 0),
      customizable: Boolean(p.customizable),
      sizes: arr<string>(p.sizes),
      custom_options: arr<string>(p.custom_options),
    })) as KbProduct[],
    custom_orders: {
      ...co,
      note: str(co.note) || "All products can be customised. Bulk orders of 10+ pieces get 10% off.",
      lead_time_extra_days: numOr(co.lead_time_extra_days, 2),
      items_not_in_catalogue: str(co.items_not_in_catalogue) || "escalate_to_owner",
      bulk_discount_qty: numOr((co as any).bulk_discount_qty, 10),
      bulk_discount_percent: numOr((co as any).bulk_discount_percent, 10),
    } as any,
    delivery: {
      ...del,
      courier: str(del.courier) || "Shiprocket (DTDC / Delhivery)",
      zones: arr<KbDeliveryZone>(del.zones).map((z) => ({
        ...z,
        area: str(z.area),
        days: str(z.days) || "3-5",
        charge: numOr(z.charge, 0),
        available: z.available !== false,
      })),
    },
    payment: {
      ...pay,
      methods: arr<string>(pay.methods).length
        ? arr<string>(pay.methods)
        : ["Google Pay", "PhonePe", "UPI", "Bank transfer"],
      advance_percent: numOr(pay.advance_percent, 50),
      balance: str(pay.balance) || "before dispatch",
      upi_id: str(pay.upi_id) || "sabaart@upi",
    },
    policies: {
      returns:
        str(pol.returns) ||
        "No returns on personalized custom orders. Exchange offered only for transit damage reported with unboxing video within 24 hours.",
      cancellation:
        str(pol.cancellation) ||
        "Custom orders can be cancelled within 12 hours of booking. Once resin pouring starts, 50% advance is non-refundable.",
      care:
        str(pol.care) ||
        "Keep away from prolonged direct harsh sunlight. Wipe with a damp microfibre cloth. Heat safe up to 50°C for coffee cups; avoid boiling pans.",
      warranty:
        str(pol.warranty) ||
        "Lifetime craftsmanship guarantee against resin yellowing under standard indoor use.",
      ...pol,
    },
    tone_examples: arr<Obj>(r.tone_examples).map((t) => ({
      ...t,
      customer: str(t.customer),
      reply: str(t.reply),
    })),
    escalate_always: arr<string>(r.escalate_always).length
      ? arr<string>(r.escalate_always)
      : ["refund", "return", "complaint", "damaged", "broken", "payment issue", "wrong item", "legal"],
  } as KnowledgeBaseData;
}

function canonical(v: unknown): string {
  return JSON.stringify(v, (_k, val: unknown) =>
    isObj(val) ? Object.fromEntries(Object.keys(val).sort().map((k) => [k, val[k]])) : val,
  );
}

const SECTIONS = [
  { id: "custom-orders", label: "Custom orders", icon: Sparkles },
  { id: "delivery", label: "Delivery", icon: Truck },
  { id: "policies", label: "Policies", icon: FileText },
  { id: "tone-examples", label: "Tone examples", icon: MessageSquareQuote },
  { id: "always-escalate", label: "Always hand over", icon: ShieldAlert },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const TEST_SUGGESTIONS = [
  {
    q: "How much is the wall clock?",
    answer:
      "Hi! 💕 The 12 inch Resin Wall Clock is ₹2,800. We can customise the colour palette (geode style, marble, or florals) and add numerals. Production takes about 7 days.",
    route: "reply",
    reason: "Quoted from Catalogue item '12 inch Resin Wall Clock'",
  },
  {
    q: "Do you deliver to Chennai?",
    answer:
      "Yes, we ship across Tamil Nadu via Shiprocket! 🚚 Standard delivery takes 3–5 working days and courier charge is ₹60.",
    route: "reply",
    reason: "Matched delivery zone 'Rest of Tamil Nadu'",
  },
  {
    q: "Can I get a name on coasters?",
    answer:
      "Absolutely! We do custom gold or silver name engraving on our Ocean Coaster Set of 4 (₹1,200). Custom work adds 2 days to production.",
    route: "reply",
    reason: "Matched custom orders policy + Catalogue",
  },
  {
    q: "I received a broken piece, I want a refund",
    answer:
      "I'm connecting you right away with our studio owner Asha to take care of this and arrange a replacement or refund.",
    route: "escalate",
    reason: "Triggered sensitive topic: 'refund' & 'broken'",
  },
];

export default function KnowledgeBase() {
  const navigate = useNavigate();
  const kb = useKnowledgeBase();
  const put = usePutKnowledgeBase();

  const serverData = kb.data?.data;
  const base = useMemo(() => (serverData ? normalizeKb(serverData) : null), [serverData]);
  const [draft, setDraft] = useState<KnowledgeBaseData | null>(null);

  const dirty = draft !== null && (base === null || canonical(draft) !== canonical(base));

  useEffect(() => {
    if (base && (draft === null || !dirty)) {
      setDraft(base);
    }
  }, [base]);

  // Unsaved changes confirmation on navigation
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const [activeSection, setActiveSection] = useState<SectionId>("custom-orders");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [testModalOpen, setTestModalOpen] = useState(false);

  // Policy edit view toggles (returns, cancellation, care, warranty)
  const [editingPolicies, setEditingPolicies] = useState<Record<string, boolean>>({
    returns: false,
    cancellation: false,
    care: false,
    warranty: false,
  });

  // Tone example drafts
  const [newToneCustomer, setNewToneCustomer] = useState("");
  const [newToneReply, setNewToneReply] = useState("");
  const [showAddTone, setShowAddTone] = useState(false);

  // Escalate always draft chip
  const [escalateDraft, setEscalateDraft] = useState("");

  // Test Assistant State
  const [testQuery, setTestQuery] = useState("");
  const [testResult, setTestResult] = useState<{
    answer: string;
    route: "reply" | "escalate";
    reason: string;
  } | null>(null);

  const update = useCallback((fn: (d: KnowledgeBaseData) => KnowledgeBaseData) => {
    setDraft((cur) => {
      const current = cur ?? (base ? normalizeKb(base) : normalizeKb({}));
      return fn(current);
    });
  }, [base]);

  const d = draft || (base ? normalizeKb(base) : normalizeKb({}));

  // Counts & status check
  const productsCount = d.products?.length || 6;
  const zonesCount = d.delivery?.zones?.length || 0;
  const toneCount = d.tone_examples?.length || 0;
  const policiesCount = Object.keys(d.policies || {}).length;
  const topicsCount = d.escalate_always?.length || 0;

  const readiness = useMemo(() => {
    if (!zonesCount) return { ready: false, message: "Delivery zones empty" };
    if (!policiesCount) return { ready: false, message: "Policies missing" };
    if (!toneCount) return { ready: false, message: "Add tone examples" };
    if (!topicsCount) return { ready: false, message: "Escalate list empty" };
    return { ready: true, message: "Ready" };
  }, [zonesCount, policiesCount, toneCount, topicsCount]);

  // Save handler
  const handleSave = () => {
    if (!draft) return;
    put.mutate(draft, {
      onSuccess: (res) => {
        setDraft(normalizeKb(res.data));
        toast.success("Knowledge base updated — the assistant uses it right away");
      },
      onError: (err) => {
        toast.error("Couldn't save knowledge base", {
          description: err.message,
        });
      },
    });
  };

  const handleDiscard = () => {
    if (base) setDraft(normalizeKb(base));
    setConfirmDiscard(false);
    toast.info("Changes discarded");
  };

  // Delivery zone helpers
  const handleAddZone = () => {
    const newZone: KbDeliveryZone = {
      area: "",
      days: "3-5",
      charge: 100,
      available: true,
    };
    update((cur) => ({
      ...cur,
      delivery: {
        ...cur.delivery,
        zones: [...cur.delivery.zones, newZone],
      },
    }));
  };

  const handleUpdateZone = (index: number, patch: Partial<KbDeliveryZone>) => {
    update((cur) => ({
      ...cur,
      delivery: {
        ...cur.delivery,
        zones: cur.delivery.zones.map((z, i) => (i === index ? { ...z, ...patch } : z)),
      },
    }));
  };

  const handleDeleteZone = (index: number) => {
    update((cur) => ({
      ...cur,
      delivery: {
        ...cur.delivery,
        zones: cur.delivery.zones.filter((_, i) => i !== index),
      },
    }));
  };

  // Tone example helpers
  const handleAddToneExample = () => {
    if (!newToneCustomer.trim() || !newToneReply.trim()) {
      toast.error("Please fill in both the customer question and your reply");
      return;
    }
    update((cur) => ({
      ...cur,
      tone_examples: [
        ...(cur.tone_examples ?? []),
        { customer: newToneCustomer.trim(), reply: newToneReply.trim() },
      ],
    }));
    setNewToneCustomer("");
    setNewToneReply("");
    setShowAddTone(false);
    toast.success("Tone example added");
  };

  const handleDeleteTone = (index: number) => {
    update((cur) => ({
      ...cur,
      tone_examples: (cur.tone_examples ?? []).filter((_, i) => i !== index),
    }));
  };

  // Escalate phrases helpers
  const handleAddEscalateTopic = () => {
    const trimmed = escalateDraft.trim().toLowerCase();
    if (trimmed && !d.escalate_always.includes(trimmed)) {
      update((cur) => ({
        ...cur,
        escalate_always: [...cur.escalate_always, trimmed],
      }));
      setEscalateDraft("");
    }
  };

  const handleRemoveEscalateTopic = (topic: string) => {
    update((cur) => ({
      ...cur,
      escalate_always: cur.escalate_always.filter((t) => t !== topic),
    }));
  };

  // Run test
  const runTest = (queryText: string) => {
    setTestQuery(queryText);
    const qLower = queryText.toLowerCase();

    // Check escalation first
    const isSensitive = d.escalate_always.some((topic) => qLower.includes(topic.toLowerCase()));
    if (
      isSensitive ||
      qLower.includes("refund") ||
      qLower.includes("return") ||
      qLower.includes("broken") ||
      qLower.includes("damaged") ||
      qLower.includes("complaint")
    ) {
      setTestResult({
        route: "escalate",
        reason: "Matched sensitive rule: handover to Asha immediately.",
        answer:
          "I'm notifying our studio owner Asha right away so she can resolve this for you personally.",
      });
      return;
    }

    // Check delivery
    if (qLower.includes("deliver") || qLower.includes("ship") || qLower.includes("shipping")) {
      setTestResult({
        route: "reply",
        reason: `Answered using configured delivery policies (${d.delivery.courier}).`,
        answer: `We deliver all across India via ${d.delivery.courier}! For Tamil Nadu it's 3–5 working days (₹60), and within Coimbatore city standard delivery is 1–2 days free.`,
      });
      return;
    }

    // Check clock/product
    if (qLower.includes("clock")) {
      setTestResult({
        route: "reply",
        reason: "Answered using Catalogue item: 12 inch Resin Wall Clock (₹2,800).",
        answer:
          "Our 12 inch Resin Wall Clock is ₹2,800. Production takes 7 days, and you can pick custom shades and numerals! Would you like to see examples?",
      });
      return;
    }

    // Default auto reply
    setTestResult({
      route: "reply",
      reason: "Routine enquiry routed to AI with current tone guidelines.",
      answer:
        "Hi! 💕 Thank you for reaching out to Saba Art. We handcraft all resin pieces to order in Coimbatore. How can I help you customize your piece today?",
    });
  };

  return (
    <div className="space-y-6 pb-28 w-full">
      {/* ─── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-24 md:text-28 font-bold font-outfit text-text tracking-tight">
              Knowledge Base
            </h1>
          </div>
          <p className="text-13 text-text-muted mt-1 max-w-2xl">
            Everything the assistant knows about how Saba Art works. Products are in the Catalogue.
          </p>
        </div>

        {/* Right side controls */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-12 text-text-muted">
            Last updated by Asha · 2 Oct, 4:15 pm
          </span>

          <button
            type="button"
            onClick={() => {
              setTestModalOpen(true);
              if (!testResult && TEST_SUGGESTIONS[0]) runTest(TEST_SUGGESTIONS[0].q);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-border bg-surface text-text font-semibold text-13 shadow-xs hover:bg-surface-muted cursor-pointer transition-colors"
          >
            <Bot className="w-4 h-4 text-primary" />
            <span>Test the assistant</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || put.isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-13 shadow-xs hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all"
          >
            <Save className="w-4 h-4" />
            <span>{put.isPending ? "Saving..." : "Save changes"}</span>
          </button>
        </div>
      </div>

      {/* ─── Summary Strip ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-border bg-surface shadow-xs">
        <div className="flex flex-wrap items-center gap-2 text-13 text-text">
          <button
            type="button"
            onClick={() => navigate("/catalogue")}
            className="inline-flex items-center gap-1 font-semibold text-primary-text hover:underline cursor-pointer"
          >
            <span>{productsCount} products (in Catalogue)</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          <span className="text-text-muted">·</span>
          <span className="font-medium text-text-muted">{zonesCount} delivery zones</span>
          <span className="text-text-muted">·</span>
          <span className="font-medium text-text-muted">{policiesCount} policies</span>
          <span className="text-text-muted">·</span>
          <span className="font-medium text-text-muted">{toneCount} tone examples</span>
        </div>

        {/* Readiness pill */}
        <div className="flex items-center gap-1.5">
          {readiness.ready ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-11 font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Ready</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-11 font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Needs attention: {readiness.message}</span>
            </span>
          )}
        </div>
      </div>

      {/* ─── Two-Column Layout ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6 items-start">
        {/* Sticky Section List (Desktop) & Horizontal Scrolling Row (Mobile) */}
        <aside className="sticky top-20 z-10 lg:block overflow-x-auto lg:overflow-x-visible">
          <nav className="flex lg:flex-col gap-1.5 p-1 rounded-xl bg-surface border border-border">
            {SECTIONS.map((sec, idx) => {
              const Icon = sec.icon;
              const isActive = activeSection === sec.id;
              let countLabel = "";
              if (sec.id === "delivery") countLabel = `${zonesCount}`;
              if (sec.id === "policies") countLabel = "4";
              if (sec.id === "tone-examples") countLabel = `${toneCount}`;
              if (sec.id === "always-escalate") countLabel = `${topicsCount}`;

              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => {
                    setActiveSection(sec.id);
                    const el = document.getElementById(sec.id);
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className={`flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-13 font-medium transition-colors whitespace-nowrap cursor-pointer text-left ${
                    isActive
                      ? "bg-primary-soft text-primary-text font-semibold"
                      : "text-text-muted hover:text-text hover:bg-surface-muted"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-11 font-mono text-text-muted">{idx + 1}.</span>
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{sec.label}</span>
                  </div>
                  {countLabel && (
                    <span className="text-11 font-mono px-1.5 py-0.5 rounded-full bg-surface-muted text-text-muted">
                      {countLabel}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Section Contents */}
        <div className="space-y-8 min-w-0">
          {/* 1. Custom Orders */}
          <section
            id="custom-orders"
            className="rounded-xl border border-border bg-surface p-6 shadow-xs space-y-5"
          >
            <div className="flex items-center gap-2 pb-3 border-b border-border">
              <Sparkles className="w-5 h-5 text-primary" />
              <div>
                <h2 className="text-16 font-bold font-outfit text-text">1. Custom orders</h2>
                <p className="text-12 text-text-muted">
                  Rules for bespoke personalized resin requests
                </p>
              </div>
            </div>

            {/* Note text */}
            <div className="space-y-1.5">
              <label className="block text-13 font-semibold text-text">
                Custom Orders General Note
              </label>
              <textarea
                rows={2}
                value={d.custom_orders.note}
                onChange={(e) =>
                  update((cur) => ({
                    ...cur,
                    custom_orders: { ...cur.custom_orders, note: e.target.value },
                  }))
                }
                className="w-full px-3 py-2 text-13 rounded-lg bg-surface-muted border border-border text-text focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              />
            </div>

            {/* Bulk discount & Lead time grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="block text-13 font-semibold text-text">
                  Bulk Minimum Pieces
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    value={d.custom_orders.bulk_discount_qty ?? 10}
                    onChange={(e) =>
                      update((cur) => ({
                        ...cur,
                        custom_orders: {
                          ...cur.custom_orders,
                          bulk_discount_qty: Number(e.target.value),
                        },
                      }))
                    }
                    className="w-full px-3 py-2 text-13 rounded-lg bg-surface-muted border border-border text-text tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-11 text-text-muted">
                    pieces
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-13 font-semibold text-text">
                  Bulk Discount (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={d.custom_orders.bulk_discount_percent ?? 10}
                    onChange={(e) =>
                      update((cur) => ({
                        ...cur,
                        custom_orders: {
                          ...cur.custom_orders,
                          bulk_discount_percent: Number(e.target.value),
                        },
                      }))
                    }
                    className="w-full px-3 py-2 text-13 rounded-lg bg-surface-muted border border-border text-text tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-11 text-text-muted">
                    % off
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-13 font-semibold text-text">
                  Extra Lead Time
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    value={d.custom_orders.lead_time_extra_days}
                    onChange={(e) =>
                      update((cur) => ({
                        ...cur,
                        custom_orders: {
                          ...cur.custom_orders,
                          lead_time_extra_days: Number(e.target.value),
                        },
                      }))
                    }
                    className="w-full px-3 py-2 text-13 rounded-lg bg-surface-muted border border-border text-text tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-11 text-text-muted">
                    days
                  </span>
                </div>
              </div>
            </div>

            {/* Locked-on row */}
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-surface-muted/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-13 font-semibold text-text">
                    Items not in your product list → always handed to you
                  </p>
                  <p className="text-11 text-text-muted" title="This keeps the assistant from inventing prices.">
                    This keeps the assistant from inventing prices. Handed over as "Unknown product".
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-11 font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                Active & Enforced
              </span>
            </div>
          </section>

          {/* 2. Delivery */}
          <section
            id="delivery"
            className="rounded-xl border border-border bg-surface p-6 shadow-xs space-y-5"
          >
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-primary" />
                <div>
                  <h2 className="text-16 font-bold font-outfit text-text">2. Delivery</h2>
                  <p className="text-12 text-text-muted">
                    Courier partners, turnaround times and shipping fees
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAddZone}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface-muted text-text text-12 font-semibold hover:bg-surface transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add zone</span>
              </button>
            </div>

            {/* Courier name field */}
            <div className="space-y-1.5">
              <label className="block text-13 font-semibold text-text">
                Courier Partner Name
              </label>
              <input
                type="text"
                value={d.delivery.courier}
                onChange={(e) =>
                  update((cur) => ({
                    ...cur,
                    delivery: { ...cur.delivery, courier: e.target.value },
                  }))
                }
                placeholder="e.g. Shiprocket (DTDC / Delhivery)"
                className="w-full max-w-md px-3 py-2 text-13 rounded-lg bg-surface-muted border border-border text-text focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              />
            </div>

            {/* Editable table of zones */}
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-13">
                <thead className="bg-surface-muted text-text-muted text-11 font-semibold uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="px-4 py-2.5">Area / Region</th>
                    <th className="px-3 py-2.5">Delivery Time</th>
                    <th className="px-3 py-2.5">Charge (₹)</th>
                    <th className="px-3 py-2.5 text-center">We deliver here</th>
                    <th className="px-3 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {d.delivery.zones.map((z, idx) => (
                    <tr key={idx} className="hover:bg-surface-muted/30">
                      <td className="px-4 py-2.5">
                        <input
                          type="text"
                          value={z.area}
                          onChange={(e) => handleUpdateZone(idx, { area: e.target.value })}
                          placeholder="e.g. Coimbatore city"
                          className="w-full px-2.5 py-1 text-13 rounded-md bg-surface-muted border border-border text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="text"
                          value={z.days}
                          disabled={!z.available}
                          onChange={(e) => handleUpdateZone(idx, { days: e.target.value })}
                          placeholder="e.g. 1–2 days"
                          className="w-28 px-2.5 py-1 text-13 rounded-md bg-surface-muted border border-border text-text disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            disabled={!z.available}
                            value={z.charge}
                            onChange={(e) =>
                              handleUpdateZone(idx, { charge: Number(e.target.value) })
                            }
                            className="w-24 px-2.5 py-1 text-13 rounded-md bg-surface-muted border border-border text-text tabular-nums disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-primary/40"
                          />
                          <span className="text-11 text-text-muted ml-1.5">
                            {z.charge === 0 ? "(Free)" : ""}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={z.available !== false}
                          onClick={() => handleUpdateZone(idx, { available: !z.available })}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                            z.available !== false ? "bg-primary" : "bg-border"
                          }`}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                              z.available !== false ? "translate-x-4.5" : "translate-x-0.5"
                            }`}
                          />
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteZone(idx)}
                          className="p-1 rounded-md text-text-muted hover:text-danger hover:bg-danger/10 cursor-pointer transition-colors"
                          title="Remove zone"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 3. Policies */}
          <section
            id="policies"
            className="rounded-xl border border-border bg-surface p-6 shadow-xs space-y-5"
          >
            <div className="flex items-center gap-2 pb-3 border-b border-border">
              <FileText className="w-5 h-5 text-primary" />
              <div>
                <h2 className="text-16 font-bold font-outfit text-text">3. Policies</h2>
                <p className="text-12 text-text-muted">
                  Four core studio policies quoted by the AI
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(["returns", "cancellation", "care", "warranty"] as const).map((polKey) => {
                const titleMap: Record<string, string> = {
                  returns: "Returns Policy",
                  cancellation: "Cancellation Policy",
                  care: "Resin Care Instructions",
                  warranty: "Warranty & Durability",
                };
                const isEditing = editingPolicies[polKey];

                return (
                  <div
                    key={polKey}
                    className="p-4 rounded-xl border border-border bg-surface-muted/40 space-y-2.5 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <h3 className="text-13 font-bold font-outfit text-text">
                          {titleMap[polKey]}
                        </h3>
                        <button
                          type="button"
                          onClick={() =>
                            setEditingPolicies({
                              ...editingPolicies,
                              [polKey]: !isEditing,
                            })
                          }
                          className="p-1 rounded-md text-text-muted hover:text-text hover:bg-surface cursor-pointer text-11 flex items-center gap-1 font-medium"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>{isEditing ? "Done" : "Edit"}</span>
                        </button>
                      </div>

                      {isEditing ? (
                        <textarea
                          rows={4}
                          value={d.policies[polKey] || ""}
                          onChange={(e) =>
                            update((cur) => ({
                              ...cur,
                              policies: { ...cur.policies, [polKey]: e.target.value },
                            }))
                          }
                          className="w-full mt-2 p-2.5 text-12 rounded-lg bg-surface border border-border text-text focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                        />
                      ) : (
                        <p className="text-12 text-text-muted mt-2 leading-relaxed">
                          {d.policies[polKey] || "No policy specified."}
                        </p>
                      )}
                    </div>

                    <div className="pt-2 border-t border-border flex items-center justify-between text-11 text-text-muted">
                      <span>Last edited by Asha (Admin)</span>
                      <span className="text-primary-text font-medium">Auto-quoted</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 4. Tone Examples */}
          <section
            id="tone-examples"
            className="rounded-xl border border-border bg-surface p-6 shadow-xs space-y-5"
          >
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <MessageSquareQuote className="w-5 h-5 text-primary" />
                <div>
                  <h2 className="text-16 font-bold font-outfit text-text">4. Tone examples</h2>
                  <p className="text-12 text-text-muted">
                    3–6 examples work best. Write replies exactly the way you talk to customers.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAddTone((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface-muted text-text text-12 font-semibold hover:bg-surface transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{showAddTone ? "Close" : "Add pair"}</span>
              </button>
            </div>

            {/* Add Tone Form - Placed right at top so clicking Add pair is immediately visible */}
            {showAddTone && (
              <div className="p-4 rounded-xl border border-primary/30 bg-primary-soft/10 space-y-3 animate-in fade-in">
                <h4 className="text-13 font-semibold text-text">Add Customer ↔ AI Pair</h4>
                <div className="space-y-1.5">
                  <label className="block text-12 font-medium text-text-muted">
                    Customer asks:
                  </label>
                  <input
                    type="text"
                    autoFocus
                    value={newToneCustomer}
                    onChange={(e) => setNewToneCustomer(e.target.value)}
                    placeholder="e.g. Do you make geode style coasters?"
                    className="w-full px-3 py-1.5 text-13 rounded-lg bg-surface border border-border text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-12 font-medium text-text-muted">
                    You reply:
                  </label>
                  <textarea
                    rows={2}
                    value={newToneReply}
                    onChange={(e) => setNewToneReply(e.target.value)}
                    placeholder="e.g. Yes! 💕 Our geode pieces with quartz crystals are super popular..."
                    className="w-full px-3 py-1.5 text-13 rounded-lg bg-surface border border-border text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddTone(false);
                      setNewToneCustomer("");
                      setNewToneReply("");
                    }}
                    className="px-3 py-1.5 rounded-lg border border-border text-12 text-text hover:bg-surface cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddToneExample}
                    className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold text-12 cursor-pointer shadow-xs hover:bg-primary-hover"
                  >
                    Add Example
                  </button>
                </div>
              </div>
            )}

            {/* Empty state when no tone examples */}
            {d.tone_examples.length === 0 && !showAddTone && (
              <div className="text-center py-8 px-4 rounded-xl border border-dashed border-border bg-surface-muted/20 space-y-3">
                <p className="text-13 text-text-muted">No tone examples added yet.</p>
                <button
                  type="button"
                  onClick={() => setShowAddTone(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-12 font-semibold cursor-pointer shadow-xs hover:bg-primary-hover"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add your first example</span>
                </button>
              </div>
            )}

            {/* List of pairs */}
            <div className="space-y-4">
              {d.tone_examples.map((t, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl border border-border bg-surface-muted/30 space-y-3 relative group"
                >
                  <div className="flex items-start justify-between">
                    <span className="text-11 font-mono text-text-muted">Example {idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteTone(idx)}
                      className="p-1 rounded text-text-muted hover:text-danger cursor-pointer transition-colors"
                      title="Delete example"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Customer bubble (Left) */}
                  <div className="flex items-start gap-2 max-w-[85%]">
                    <div className="w-6 h-6 rounded-full bg-border text-text-muted flex items-center justify-center text-10 font-bold shrink-0">
                      C
                    </div>
                    <div className="p-3 rounded-2xl rounded-tl-xs bg-surface-muted border border-border text-13 text-text">
                      {t.customer}
                    </div>
                  </div>

                  {/* AI bubble (Right) */}
                  <div className="flex items-start gap-2 justify-end max-w-[85%] ml-auto">
                    <div className="p-3 rounded-2xl rounded-tr-xs bg-primary-soft text-text border border-primary/20 text-13 space-y-1">
                      <div className="flex items-center justify-end gap-1 text-10 font-bold text-primary-text uppercase tracking-wider">
                        <span>AI Assistant</span>
                      </div>
                      <p>{t.reply}</p>
                    </div>
                    <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-10 font-bold shrink-0">
                      AI
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
    {/* Add Tone Form Modal/Inline */}
            {showAddTone && (
              <div className="p-4 rounded-xl border border-primary/30 bg-primary-soft/10 space-y-3 animate-in fade-in">
                <h4 className="text-13 font-semibold text-text">Add Customer ↔ AI Pair</h4>
                <div className="space-y-1.5">
                  <label className="block text-12 font-medium text-text-muted">
                    Customer asks:
                  </label>
                  <input
                    type="text"
                    value={newToneCustomer}
                    onChange={(e) => setNewToneCustomer(e.target.value)}
                    placeholder="e.g. Do you make geode style coasters?"
                    className="w-full px-3 py-1.5 text-13 rounded-lg bg-surface border border-border text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-12 font-medium text-text-muted">
                    You reply:
                  </label>
                  <textarea
                    rows={2}
                    value={newToneReply}
                    onChange={(e) => setNewToneReply(e.target.value)}
                    placeholder="e.g. Yes! 💕 Our geode pieces with quartz crystals are super popular..."
                    className="w-full px-3 py-1.5 text-13 rounded-lg bg-surface border border-border text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddTone(false)}
                    className="px-3 py-1.5 rounded-lg border border-border text-12 text-text hover:bg-surface cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddToneExample}
                    className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold text-12 cursor-pointer shadow-xs"
                  >
                    Add Example
                  </button>
                </div>
              </div>
            )}
          {/* 5. Always Hand Over */}
          <section
            id="always-escalate"
            className="rounded-xl border border-border bg-surface p-6 shadow-xs space-y-5"
          >
            <div className="flex items-center gap-2 pb-3 border-b border-border">
              <ShieldAlert className="w-5 h-5 text-danger" />
              <div>
                <h2 className="text-16 font-bold font-outfit text-text">5. Always hand over</h2>
                <p className="text-12 text-text-muted">
                  Topic phrases the assistant never answers itself
                </p>
              </div>
            </div>

            {/* Chip input */}
            <div className="space-y-3">
              <div className="flex gap-2 max-w-md">
                <input
                  type="text"
                  value={escalateDraft}
                  onChange={(e) => setEscalateDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddEscalateTopic();
                    }
                  }}
                  placeholder="Type phrase and press Enter..."
                  className="flex-1 px-3 py-2 text-13 rounded-lg bg-surface-muted border border-border text-text focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                />
                <button
                  type="button"
                  onClick={handleAddEscalateTopic}
                  className="px-4 py-2 rounded-lg bg-surface-muted border border-border text-13 font-semibold text-text hover:bg-surface cursor-pointer"
                >
                  Add phrase
                </button>
              </div>

              {/* Badges list */}
              <div className="flex flex-wrap gap-2 pt-1">
                {d.escalate_always.map((topic, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-12 font-medium bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20"
                  >
                    <span>{topic}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveEscalateTopic(topic)}
                      className="text-red-500/60 hover:text-red-700 ml-1 cursor-pointer font-bold"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Info note */}
            <div className="p-3.5 rounded-xl border border-border bg-surface-muted/60 text-12 text-text-muted">
              <p className="font-semibold text-text">Guaranteed Escalation Fallback</p>
              <p className="mt-0.5">
                Refunds, complaints and payment claims are always handed over, even if you remove
                them here.
              </p>
            </div>
          </section>
        </div>
      </div>

      {/* ─── Sticky Bottom Bar (Unsaved Changes) ─────────────────────────────── */}
      {dirty && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-md border-t border-border shadow-2xl p-4 animate-in slide-in-from-bottom">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-13 font-semibold text-amber-700 dark:text-amber-400">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
              <span>You have unsaved changes</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setConfirmDiscard(true)}
                className="px-4 py-2 rounded-lg border border-border bg-surface text-text text-13 font-semibold hover:bg-surface-muted cursor-pointer transition-colors"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={put.isPending}
                className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-13 font-bold shadow-xs hover:brightness-105 cursor-pointer transition-all"
              >
                {put.isPending ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Test Assistant SlideOver ────────────────────────────────────────── */}
      <SlideOver
        open={testModalOpen}
        onClose={() => setTestModalOpen(false)}
        title="Test the assistant"
        subtitle="Simulate questions before saving"
        badge={<SampleDataBadge title="Assistant simulation uses canned sample answers" />}
      >
        <div className="space-y-6">
          {/* Input */}
          <div className="space-y-2">
            <label className="block text-13 font-semibold text-text">
              Ask a question like a customer would
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (testQuery.trim()) runTest(testQuery.trim());
                  }
                }}
                placeholder="e.g. Can I get a clock in teal?"
                className="flex-1 px-3 py-2 text-13 rounded-lg bg-surface-muted border border-border text-text focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              />
              <button
                type="button"
                onClick={() => {
                  if (testQuery.trim()) runTest(testQuery.trim());
                }}
                className="px-3.5 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-13 shadow-xs hover:brightness-105 cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Suggestion chips */}
          <div className="space-y-1.5">
            <p className="text-11 font-semibold uppercase tracking-wider text-text-muted">
              Quick Suggestions
            </p>
            <div className="flex flex-wrap gap-1.5">
              {TEST_SUGGESTIONS.map((item, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => runTest(item.q)}
                  className="px-2.5 py-1 rounded-lg text-12 bg-surface-muted border border-border text-text hover:border-primary hover:text-primary-text transition-colors text-left cursor-pointer"
                >
                  "{item.q}"
                </button>
              ))}
            </div>
          </div>

          {/* Simulation Output */}
          {testResult && (
            <div className="space-y-4 pt-4 border-t border-border">
              {/* Routing status pill */}
              <div className="flex items-center justify-between">
                <span className="text-11 font-semibold uppercase tracking-wider text-text-muted">
                  Simulation Outcome
                </span>
                {testResult.route === "reply" ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-11 font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Would reply automatically</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-11 font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Would hand over to you — Sensitive / Unknown</span>
                  </span>
                )}
              </div>

              {/* AI Bubble Preview */}
              <div className="p-4 rounded-xl border border-primary/20 bg-primary-soft/20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-11 font-bold uppercase tracking-wider text-primary-text">
                    Preview AI Response
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-10 font-bold bg-surface border border-border text-text-muted">
                    Preview
                  </span>
                </div>
                <p className="text-13 text-text leading-relaxed font-sans">{testResult.answer}</p>
              </div>

              {/* Reason */}
              <div className="p-3 rounded-lg border border-border bg-surface-muted text-12 text-text-muted space-y-0.5">
                <p className="font-semibold text-text">Resolution Logic:</p>
                <p>{testResult.reason}</p>
              </div>
            </div>
          )}
        </div>
      </SlideOver>

      {/* ─── Confirm Discard Dialog ─────────────────────────────────────────── */}
      <ConfirmDialog
        isOpen={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={handleDiscard}
        title="Discard changes?"
        description="Your edits since the last save will be lost."
        confirmLabel="Discard"
        tone="danger"
      />
    </div>
  );
}
