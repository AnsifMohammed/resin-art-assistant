import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BookOpen,
  Braces,
  ChevronDown,
  CreditCard,
  FileText,
  MessageSquareQuote,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  ShieldAlert,
  Sparkles,
  Store,
  Trash2,
  Truck,
} from "lucide-react";
import { isApiError } from "../api/client.ts";
import { ChipsInput } from "../components/ui/ChipsInput.tsx";
import { ConfirmDialog } from "../components/ui/ConfirmDialog.tsx";
import { KbProductModal, productErrors } from "../components/admin/KbProductModal.tsx";
import { NumberInput } from "../components/ui/NumberInput.tsx";
import { Switch } from "../components/ui/Switch.tsx";
import { usePageTitle } from "../components/layout/PageTitle.tsx";
import { Badge } from "../components/ui/Badge.tsx";
import { Button } from "../components/ui/Button.tsx";
import { EmptyState } from "../components/ui/EmptyState.tsx";
import { Input } from "../components/ui/Input.tsx";
import { PageSpinner } from "../components/ui/Spinner.tsx";
import { Textarea } from "../components/ui/Textarea.tsx";
import { useToast } from "../components/ui/Toast.tsx";
import { useKnowledgeBase, usePutKnowledgeBase } from "../hooks/useKnowledgeBase.ts";
import { cn } from "../lib/cn.ts";
import { formatRelative, humanize } from "../lib/format.ts";
import type { KbDeliveryZone, KbProduct, KbToneExample, KnowledgeBaseData } from "../types/index.ts";

// ─── Data helpers ────────────────────────────────────────────────────────────

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const numOr = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);

/**
 * Fill in missing sections so the form can render, while keeping every key we don't know about
 * (spread first, then known keys), at the top level and inside each section / list item.
 */
function normalize(raw: unknown): KnowledgeBaseData {
  const r = isObj(raw) ? raw : {};
  const co = isObj(r.custom_orders) ? r.custom_orders : {};
  const del = isObj(r.delivery) ? r.delivery : {};
  const pay = isObj(r.payment) ? r.payment : {};
  const pol = isObj(r.policies) ? r.policies : {};
  return {
    ...r,
    business_name: str(r.business_name),
    products: arr<Obj>(r.products).map((p) => ({
      ...p,
      id: str(p.id),
      name: str(p.name),
      price: numOr(p.price, 0),
      lead_time_days: numOr(p.lead_time_days, 0),
      customizable: Boolean(p.customizable),
    })) as KbProduct[],
    custom_orders: {
      ...co,
      note: str(co.note),
      lead_time_extra_days: numOr(co.lead_time_extra_days, 0),
      items_not_in_catalogue: str(co.items_not_in_catalogue) || "escalate_to_owner",
    },
    delivery: { ...del, zones: arr<KbDeliveryZone>(del.zones).map((z) => ({ ...z, area: str(z.area) })), courier: str(del.courier) },
    payment: {
      ...pay,
      methods: arr<string>(pay.methods).filter((m) => typeof m === "string"),
      advance_percent: numOr(pay.advance_percent, 0),
      balance: str(pay.balance),
      upi_id: str(pay.upi_id),
    },
    policies: {
      ...(pol as Record<string, string>),
      returns: str(pol.returns),
      cancellation: str(pol.cancellation),
      care: str(pol.care),
      warranty: str(pol.warranty),
    },
    tone_examples: arr<Obj>(r.tone_examples).map((t) => ({ ...t, customer: str(t.customer), reply: str(t.reply) })),
    escalate_always: arr<string>(r.escalate_always).filter((s) => typeof s === "string"),
  } as KnowledgeBaseData;
}

/** Stable comparison independent of key order. */
function canonical(v: unknown): string {
  return JSON.stringify(v, (_k, val: unknown) =>
    isObj(val) ? Object.fromEntries(Object.keys(val).sort().map((k) => [k, val[k]])) : val,
  );
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 48) || "product"
  );
}

function uniqueId(base: string, taken: Set<string>): string {
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  return id;
}

interface ValidationIssue {
  message: string;
  productIndex?: number;
}

function validateKb(d: KnowledgeBaseData): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  d.products.forEach((p, i) => {
    const e = productErrors(p);
    const name = p.name.trim() || `Product ${i + 1}`;
    if (e.name) issues.push({ message: `Product ${i + 1}: name is required.`, productIndex: i });
    if (e.price) issues.push({ message: `${name}: price must be more than ₹0.`, productIndex: i });
  });
  if (d.payment.advance_percent < 0 || d.payment.advance_percent > 100)
    issues.push({ message: "Payment: advance must be between 0 and 100%." });
  return issues;
}

/** Raw-JSON escape hatch: must be an object with the list fields as arrays. */
function parseRawKb(text: string): { ok: true; value: Obj } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
  }
  if (!isObj(parsed)) return { ok: false, error: "The knowledge base must be a JSON object ({ … })." };
  for (const key of ["products", "tone_examples", "escalate_always"]) {
    if (key in parsed && !Array.isArray(parsed[key])) return { ok: false, error: `"${key}" must be an array.` };
  }
  for (const key of ["custom_orders", "delivery", "payment", "policies"]) {
    if (key in parsed && !isObj(parsed[key])) return { ok: false, error: `"${key}" must be an object.` };
  }
  return { ok: true, value: parsed };
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

// ─── UI bits ─────────────────────────────────────────────────────────────────

function Card({
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  icon: typeof Package;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-xl border border-gray-200 bg-white shadow-sm">
      <header className="flex items-start gap-3 border-b border-gray-100 px-4 py-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          {description && <p className="text-xs text-gray-500">{description}</p>}
        </div>
        {action}
      </header>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}

function IconButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
        danger ? "text-gray-400 hover:bg-red-50 hover:text-red-600" : "text-gray-500 hover:bg-gray-100 hover:text-gray-800",
      )}
    >
      {children}
    </button>
  );
}

function Chips({ values }: { values: string[] | undefined }) {
  if (!values || values.length === 0) return <span className="text-gray-400">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {values.map((v, i) => (
        <Badge key={`${v}-${i}`} className="bg-emerald-50 text-emerald-800">
          {humanize(v)}
        </Badge>
      ))}
    </span>
  );
}

// ─── Unsaved-changes guard ───────────────────────────────────────────────────

const LEAVE_MESSAGE = "You have unsaved knowledge base changes. Leave without saving?";

/**
 * The app uses <BrowserRouter> (no data router → no useBlocker), so: beforeunload for reload/close,
 * and a capture-phase click listener that asks before in-app link navigation.
 */
function useUnsavedChangesGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement) || a.target === "_blank" || a.origin !== window.location.origin) return;
      if (a.pathname === window.location.pathname) return;
      if (!window.confirm(LEAVE_MESSAGE)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function KnowledgeBase() {
  usePageTitle("Knowledge base");
  const kb = useKnowledgeBase();
  const put = usePutKnowledgeBase();
  const { toast } = useToast();

  const notFound = kb.isError && isApiError(kb.error) && kb.error.status === 404;
  const serverData = kb.data?.data;
  const base = useMemo(() => (serverData ? normalize(serverData) : null), [serverData]);

  const [draft, setDraft] = useState<KnowledgeBaseData | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [editing, setEditing] = useState<{ index: number | null; product: KbProduct } | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const [rawText, setRawText] = useState<string | null>(null); // null = mirror the draft
  const [rawError, setRawError] = useState<string | null>(null);

  const dirty = draft !== null && (base === null || canonical(draft) !== canonical(base));

  // Load (or reload after save/refetch) the server copy unless there are local edits.
  useEffect(() => {
    if (base && (draft === null || !dirty)) setDraft(base);
  }, [base]);

  useUnsavedChangesGuard(dirty);

  const update = useCallback((fn: (d: KnowledgeBaseData) => KnowledgeBaseData) => {
    setDraft((d) => (d ? fn(d) : d));
    setIssues([]);
  }, []);

  const flaggedProducts = useMemo(
    () => new Set(issues.map((i) => i.productIndex).filter((i): i is number => i !== undefined)),
    [issues],
  );

  if (kb.isPending) return <PageSpinner label="Loading knowledge base" />;

  if (kb.isError && !notFound && !draft) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Couldn't load the knowledge base"
        description={kb.error.message}
        action={
          <Button variant="outline" onClick={() => void kb.refetch()} loading={kb.isFetching}>
            Try again
          </Button>
        }
        className="py-24"
      />
    );
  }

  if (!draft) {
    return (
      <EmptyState
        icon={BookOpen}
        title="No knowledge base yet"
        description="The AI can't auto-reply until it knows your products, prices and policies."
        action={<Button onClick={() => setDraft(normalize({}))}>Start from scratch</Button>}
        className="py-24"
      />
    );
  }

  const d = draft;

  const save = () => {
    const found = validateKb(d);
    setIssues(found);
    if (found.length > 0) {
      toast({ variant: "error", title: "Fix the highlighted fields", description: found[0]?.message ?? "" });
      return;
    }
    put.mutate(d, {
      onSuccess: (res) => {
        setDraft(normalize(res.data));
        setRawText(null);
        toast({ variant: "success", title: "Knowledge base saved", description: "The AI uses the new details right away." });
      },
      onError: (err) => toast({ variant: "error", title: "Couldn't save", description: err.message }),
    });
  };

  const discard = () => {
    setDraft(base ?? normalize({}));
    setIssues([]);
    setRawText(null);
    setRawError(null);
    setConfirmDiscard(false);
  };

  const saveProduct = (p: KbProduct) => {
    if (!editing) return;
    update((cur) => {
      const products = [...cur.products];
      if (editing.index === null) {
        const taken = new Set(products.map((x) => x.id));
        products.push({ ...p, id: p.id || uniqueId(slugify(p.name), taken) });
      } else {
        products[editing.index] = p;
      }
      return { ...cur, products };
    });
    setEditing(null);
  };

  const setZone = (i: number, zone: KbDeliveryZone) =>
    update((cur) => ({ ...cur, delivery: { ...cur.delivery, zones: cur.delivery.zones.map((z, j) => (j === i ? zone : z)) } }));
  const setTone = (i: number, patch: Partial<KbToneExample>) =>
    update((cur) => ({ ...cur, tone_examples: cur.tone_examples.map((t, j) => (j === i ? { ...t, ...patch } : t)) }));

  const knownPolicies = ["returns", "cancellation", "care", "warranty"];
  const policyKeys = [...knownPolicies, ...Object.keys(d.policies).filter((k) => !knownPolicies.includes(k) && typeof d.policies[k] === "string")];

  const rawValue = rawText ?? JSON.stringify(d, null, 2);

  return (
    <div className="min-w-0">
      {/* Sticky save bar (sticks under the TopBar; <main> is the scroll container) */}
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 md:px-6">
          <p className="min-w-0 text-sm" aria-live="polite">
            {dirty ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-amber-700">
                <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />
                Unsaved changes
              </span>
            ) : (
              <span className="text-gray-500">
                All changes saved{kb.data?.updatedAt ? ` · updated ${formatRelative(kb.data.updatedAt)}` : ""}
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setConfirmDiscard(true)} disabled={!dirty || put.isPending}>
              <RotateCcw className="h-4 w-4" aria-hidden />
              Discard
            </Button>
            <Button onClick={save} disabled={!dirty} loading={put.isPending}>
              <Save className="h-4 w-4" aria-hidden />
              Save changes
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-4 px-4 py-6 md:px-6">
        {issues.length > 0 && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <p className="font-medium">Please fix before saving:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {issues.map((i, n) => (
                <li key={n}>{i.message}</li>
              ))}
            </ul>
          </div>
        )}

        <Card icon={Store} title="Business">
          <Input
            label="Business name"
            value={d.business_name}
            onChange={(e) => update((cur) => ({ ...cur, business_name: e.target.value }))}
          />
        </Card>

        {/* Products */}
        <Card
          icon={Package}
          title="Products"
          description="The AI only quotes prices for products listed here."
          action={
            <Button
              size="sm"
              variant="outline"
              className="h-10"
              onClick={() =>
                setEditing({ index: null, product: { id: "", name: "", price: 0, lead_time_days: 3, customizable: true, sizes: [], custom_options: [] } })
              }
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add
            </Button>
          }
        >
          {d.products.length === 0 ? (
            <p className="text-sm text-gray-500">No products yet. Add one so the AI can answer price questions.</p>
          ) : (
            <>
              {/* Phone: cards */}
              <ul className="-mx-1 space-y-2 md:hidden">
                {d.products.map((p, i) => (
                  <li
                    key={`${p.id}-${i}`}
                    className={cn("rounded-lg border p-3", flaggedProducts.has(i) ? "border-red-300 bg-red-50" : "border-gray-200")}
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900">{p.name || <span className="text-red-600">Unnamed product</span>}</p>
                        <p className="text-sm text-gray-600">
                          {p.price > 0 ? inr.format(p.price) : <span className="text-red-600">No price</span>} · {p.lead_time_days} days
                          {p.sizes && p.sizes.length > 0 ? ` · ${p.sizes.join(", ")}` : ""}
                        </p>
                      </div>
                      <IconButton label={`Edit ${p.name || "product"}`} onClick={() => setEditing({ index: i, product: p })}>
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        danger
                        label={`Remove ${p.name || "product"}`}
                        onClick={() => update((cur) => ({ ...cur, products: cur.products.filter((_, j) => j !== i) }))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </div>
                    {p.customizable && (
                      <div className="mt-2 text-sm">
                        <Chips values={p.custom_options} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              {/* md+: table */}
              <div className="-mx-4 hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-gray-500">
                    <tr className="border-b border-gray-100">
                      <th scope="col" className="px-4 py-2 font-medium">Name</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">Price</th>
                      <th scope="col" className="px-2 py-2 font-medium">Sizes</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">Lead time</th>
                      <th scope="col" className="px-2 py-2 font-medium">Custom options</th>
                      <th scope="col" className="px-4 py-2"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {d.products.map((p, i) => (
                      <tr key={`${p.id}-${i}`} className={cn("align-top", flaggedProducts.has(i) && "bg-red-50")}>
                        <td className="px-4 py-2.5 font-medium text-gray-900">
                          {p.name || <span className="text-red-600">Unnamed product</span>}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums">
                          {p.price > 0 ? inr.format(p.price) : <span className="text-red-600">—</span>}
                        </td>
                        <td className="px-2 py-2.5 text-gray-600">{p.sizes?.length ? p.sizes.join(", ") : "—"}</td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums text-gray-600">{p.lead_time_days} d</td>
                        <td className="px-2 py-2.5">
                          {p.customizable ? <Chips values={p.custom_options} /> : <span className="text-gray-400">Not customizable</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-1.5 text-right">
                          <IconButton label={`Edit ${p.name || "product"}`} onClick={() => setEditing({ index: i, product: p })}>
                            <Pencil className="h-4 w-4" />
                          </IconButton>
                          <IconButton
                            danger
                            label={`Remove ${p.name || "product"}`}
                            onClick={() => update((cur) => ({ ...cur, products: cur.products.filter((_, j) => j !== i) }))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </IconButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>

        {/* Custom orders */}
        <Card icon={Sparkles} title="Custom orders">
          <Textarea
            label="Note"
            value={d.custom_orders.note}
            onChange={(e) => update((cur) => ({ ...cur, custom_orders: { ...cur.custom_orders, note: e.target.value } }))}
            hint="e.g. bulk discounts. Items not in the catalogue are always escalated to you."
          />
          <div className="max-w-xs">
            <NumberInput
              label="Extra lead time for custom work (days)"
              value={d.custom_orders.lead_time_extra_days}
              onValueChange={(v) =>
                update((cur) => ({ ...cur, custom_orders: { ...cur.custom_orders, lead_time_extra_days: v === null ? 0 : Math.round(v) } }))
              }
            />
          </div>
        </Card>

        {/* Delivery */}
        <Card
          icon={Truck}
          title="Delivery"
          action={
            <Button
              size="sm"
              variant="outline"
              className="h-10"
              onClick={() => update((cur) => ({ ...cur, delivery: { ...cur.delivery, zones: [...cur.delivery.zones, { area: "", days: "", charge: 0 }] } }))}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Zone
            </Button>
          }
        >
          {d.delivery.zones.length === 0 && <p className="text-sm text-gray-500">No delivery zones yet.</p>}
          <ul className="space-y-3">
            {d.delivery.zones.map((z, i) => {
              const available = z.available !== false;
              return (
                <li key={i} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <Input label="Area" value={z.area} onChange={(e) => setZone(i, { ...z, area: e.target.value })} placeholder="e.g. Rest of India" />
                    </div>
                    <IconButton
                      danger
                      label={`Remove zone ${z.area || i + 1}`}
                      onClick={() => update((cur) => ({ ...cur, delivery: { ...cur.delivery, zones: cur.delivery.zones.filter((_, j) => j !== i) } }))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                  <div className="mt-3 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                    <Input
                      label="Days"
                      value={z.days ?? ""}
                      disabled={!available}
                      placeholder="3-5"
                      onChange={(e) => setZone(i, { ...z, days: e.target.value })}
                    />
                    <NumberInput
                      label="Charge (₹)"
                      value={z.charge ?? null}
                      disabled={!available}
                      onValueChange={(v) => setZone(i, { ...z, charge: v ?? 0 })}
                    />
                    <div className="space-y-1.5">
                      <span className="block text-sm font-medium text-gray-700">Available</span>
                      <Switch
                        checked={available}
                        label={`Delivery available to ${z.area || "this zone"}`}
                        onChange={(next) => {
                          if (next) {
                            const { available: _drop, ...rest } = z;
                            setZone(i, rest);
                          } else setZone(i, { ...z, available: false });
                        }}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <Input
            label="Courier"
            value={d.delivery.courier}
            onChange={(e) => update((cur) => ({ ...cur, delivery: { ...cur.delivery, courier: e.target.value } }))}
          />
        </Card>

        {/* Payment */}
        <Card icon={CreditCard} title="Payment">
          <ChipsInput
            label="Payment methods"
            values={d.payment.methods}
            onChange={(methods) => update((cur) => ({ ...cur, payment: { ...cur.payment, methods } }))}
            placeholder="e.g. Google Pay"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberInput
              label="Advance (%)"
              value={d.payment.advance_percent}
              onValueChange={(v) => update((cur) => ({ ...cur, payment: { ...cur.payment, advance_percent: v ?? 0 } }))}
              error={d.payment.advance_percent > 100 ? "Must be 100 or less." : null}
            />
            <Input
              label="Balance due"
              value={d.payment.balance}
              placeholder="before dispatch"
              onChange={(e) => update((cur) => ({ ...cur, payment: { ...cur.payment, balance: e.target.value } }))}
            />
          </div>
          <Input
            label="UPI ID"
            value={d.payment.upi_id}
            autoCapitalize="none"
            onChange={(e) => update((cur) => ({ ...cur, payment: { ...cur.payment, upi_id: e.target.value } }))}
            hint="Shared with customers when they ask how to pay. Payment claims are always escalated."
          />
        </Card>

        {/* Policies */}
        <Card icon={FileText} title="Policies" description="The AI quotes these, but refund and complaint requests always go to a human.">
          {policyKeys.map((k) => (
            <Textarea
              key={k}
              label={humanize(k)}
              value={d.policies[k] ?? ""}
              onChange={(e) => update((cur) => ({ ...cur, policies: { ...cur.policies, [k]: e.target.value } }))}
            />
          ))}
        </Card>

        {/* Tone examples */}
        <Card
          icon={MessageSquareQuote}
          title="Tone examples"
          description="Sample replies in your voice. Include a Malayalam one so the AI answers in kind."
          action={
            <Button
              size="sm"
              variant="outline"
              className="h-10"
              onClick={() => update((cur) => ({ ...cur, tone_examples: [...cur.tone_examples, { customer: "", reply: "" }] }))}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add
            </Button>
          }
        >
          {d.tone_examples.length === 0 && <p className="text-sm text-gray-500">No examples yet.</p>}
          <ul className="space-y-3">
            {d.tone_examples.map((t, i) => (
              <li key={i} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1 space-y-3">
                    <Textarea label={`Customer says (${i + 1})`} rows={2} value={t.customer} onChange={(e) => setTone(i, { customer: e.target.value })} />
                    <Textarea label="You reply" rows={3} value={t.reply} onChange={(e) => setTone(i, { reply: e.target.value })} />
                  </div>
                  <IconButton
                    danger
                    label={`Remove example ${i + 1}`}
                    onClick={() => update((cur) => ({ ...cur, tone_examples: cur.tone_examples.filter((_, j) => j !== i) }))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        {/* Escalate always */}
        <Card icon={ShieldAlert} title="Always escalate" description="Messages mentioning any of these always go to a human.">
          <ChipsInput
            label="Phrases"
            values={d.escalate_always}
            onChange={(escalate_always) => update((cur) => ({ ...cur, escalate_always }))}
            placeholder="e.g. refund"
          />
        </Card>

        {/* Advanced raw JSON */}
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setRawOpen((o) => !o)}
            aria-expanded={rawOpen}
            aria-controls="kb-raw-json"
            className="flex min-h-12 w-full items-center gap-3 rounded-xl px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <Braces className="h-5 w-5 shrink-0 text-gray-500" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-gray-900">Advanced: edit raw JSON</span>
              <span className="block text-xs text-gray-500">For fields the form doesn't show. Applying replaces the form contents.</span>
            </span>
            <ChevronDown className={cn("h-5 w-5 text-gray-400 transition-transform", rawOpen && "rotate-180")} aria-hidden />
          </button>
          {rawOpen && (
            <div id="kb-raw-json" className="space-y-3 border-t border-gray-100 p-4">
              <Textarea
                label="Knowledge base JSON"
                value={rawValue}
                rows={16}
                spellCheck={false}
                className="font-mono text-xs sm:text-xs"
                error={rawError}
                onChange={(e) => {
                  setRawText(e.target.value);
                  setRawError(null);
                }}
              />
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  variant="ghost"
                  disabled={rawText === null}
                  onClick={() => {
                    setRawText(null);
                    setRawError(null);
                  }}
                >
                  Reset to form
                </Button>
                <Button
                  variant="outline"
                  disabled={rawText === null}
                  onClick={() => {
                    const res = parseRawKb(rawValue);
                    if (!res.ok) {
                      setRawError(res.error);
                      return;
                    }
                    update(() => normalize(res.value));
                    setRawText(null);
                    toast({ variant: "info", title: "JSON applied", description: "Review the form, then Save changes." });
                  }}
                >
                  Apply JSON
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>

      <KbProductModal
        open={editing !== null}
        initial={editing?.product ?? null}
        isNew={editing?.index === null}
        onClose={() => setEditing(null)}
        onSave={saveProduct}
      />

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard changes?"
        description="Your edits since the last save will be lost."
        confirmLabel="Discard"
        variant="danger"
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={discard}
      />
    </div>
  );
}
