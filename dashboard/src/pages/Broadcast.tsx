import { useState, useMemo } from "react";
import {
  Send,
  Users,
  Lock,
  Info,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { SampleDataBadge } from "../components/shared/SampleDataBadge.tsx";
import {
  mockTemplates,
  mockBroadcasts,
  type Broadcast,
} from "../data/mockData.ts";

export default function BroadcastPage() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>(mockBroadcasts);

  // Audience segment selection
  const [segments, setSegments] = useState<{
    all: boolean;
    previousBuyers: boolean;
    priority: boolean;
    favourites: boolean;
  }>({
    all: false,
    previousBuyers: true,
    priority: true,
    favourites: false,
  });

  // Template selection & variables
  const [selectedTemplateId, setSelectedTemplateId] = useState(mockTemplates[3]?.id || "");
  const [variableValues, setVariableValues] = useState<Record<string, string>>({
    product: "Ocean Coaster Set",
    discount: "15%",
    deliveryDate: "14 Oct",
    amount: "1,450",
  });

  // Schedule mode
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("2026-10-15T10:00");
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Selected template
  const activeTemplate = useMemo(() => {
    return mockTemplates.find((t) => t.id === selectedTemplateId) || mockTemplates[0];
  }, [selectedTemplateId]);

  // Live estimated reach calculation
  const estimatedReach = useMemo(() => {
    if (segments.all) return 142;
    let reach = 0;
    if (segments.previousBuyers) reach += 68;
    if (segments.priority) reach += 24;
    if (segments.favourites) reach += 19;
    return Math.min(142, reach || 12);
  }, [segments]);

  // Preview text with variables filled
  const previewBody = useMemo(() => {
    if (!activeTemplate) return "";
    let text = activeTemplate.body;
    text = text.replace(/{customerName}/g, "Priya");
    for (const [key, val] of Object.entries(variableValues)) {
      text = text.replace(new RegExp(`{${key}}`, "g"), val || `{${key}}`);
    }
    return text;
  }, [activeTemplate, variableValues]);

  const handleSendOrSchedule = () => {
    const newBroadcast: Broadcast = {
      id: `bc-${Date.now()}`,
      name: activeTemplate?.name || "Festive Offer",
      date: isScheduled ? "Tomorrow, 10:00 AM" : "Just now",
      template: activeTemplate?.name || "Custom",
      audience: segments.all
        ? "All WhatsApp contacts"
        : `${estimatedReach} targeted buyers`,
      sentCount: isScheduled ? 0 : estimatedReach,
      deliveredPercent: isScheduled ? 0 : 96,
      readPercent: isScheduled ? 0 : 82,
      status: isScheduled ? "scheduled" : "sent",
    };

    setBroadcasts((prev) => [newBroadcast, ...prev]);
    setShowConfirmModal(false);

    if (isScheduled) {
      toast.success("Broadcast scheduled successfully", {
        description: `Will be sent to ${estimatedReach} recipients on ${scheduleDate.replace("T", " at ")}`,
      });
    } else {
      toast.success("Broadcast sent successfully!", {
        description: `Delivered to ${estimatedReach} customers on WhatsApp`,
      });
    }
  };

  return (
    <div className="space-y-8 pb-12 w-full">
      {/* ─── Page Header ──────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-24 md:text-28 font-bold font-outfit text-text tracking-tight flex items-center gap-2">
          <span>Broadcast Campaigns</span>
          <span className="px-2 py-0.5 rounded-full text-11 font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            WhatsApp Business API
          </span>
          <SampleDataBadge title="Broadcast campaign history using sample records" />
        </h1>
        <p className="text-13 text-text-muted mt-0.5">
          Send pre-approved festival promotions, collection launches, and updates to customer segments
        </p>
      </div>

      {/* ─── Two-Column Composer ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Audience (5 cols) */}
        <div className="lg:col-span-5 p-5 rounded-2xl border border-border bg-surface space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <h2 className="text-16 font-bold font-outfit text-text flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" /> Audience Selection
            </h2>
            <div
              className="flex items-center gap-1 text-11 text-text-muted px-2 py-0.5 rounded bg-surface-muted border border-border"
              title="Broadcasts use approved WhatsApp templates"
            >
              <Lock className="w-3 h-3 text-emerald-500" /> WhatsApp Locked
            </div>
          </div>

          {/* Segment Checkboxes */}
          <div className="space-y-2.5">
            <p className="text-12 font-semibold uppercase tracking-wider text-text-muted">
              Target Segments
            </p>

            <label className="flex items-center gap-3 p-3 rounded-xl border border-border/70 bg-surface-muted hover:bg-surface transition-colors cursor-pointer select-none">
              <input
                type="checkbox"
                checked={segments.all}
                onChange={(e) =>
                  setSegments({
                    all: e.target.checked,
                    previousBuyers: e.target.checked,
                    priority: e.target.checked,
                    favourites: e.target.checked,
                  })
                }
                className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
              />
              <div className="flex-1">
                <p className="text-13 font-semibold text-text">All WhatsApp Contacts</p>
                <p className="text-11 text-text-muted">Broadcast to all 142 opted-in customers</p>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 rounded-xl border border-border/70 bg-surface-muted hover:bg-surface transition-colors cursor-pointer select-none">
              <input
                type="checkbox"
                checked={segments.previousBuyers}
                onChange={(e) =>
                  setSegments((prev) => ({ ...prev, previousBuyers: e.target.checked, all: false }))
                }
                className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
              />
              <div className="flex-1">
                <p className="text-13 font-semibold text-text">Previous Buyers (68)</p>
                <p className="text-11 text-text-muted">Customers with at least 1 completed purchase</p>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 rounded-xl border border-border/70 bg-surface-muted hover:bg-surface transition-colors cursor-pointer select-none">
              <input
                type="checkbox"
                checked={segments.priority}
                onChange={(e) =>
                  setSegments((prev) => ({ ...prev, priority: e.target.checked, all: false }))
                }
                className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
              />
              <div className="flex-1">
                <p className="text-13 font-semibold text-text">Priority Clients (24)</p>
                <p className="text-11 text-text-muted">High-spend collectors & wedding bulk clients</p>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 rounded-xl border border-border/70 bg-surface-muted hover:bg-surface transition-colors cursor-pointer select-none">
              <input
                type="checkbox"
                checked={segments.favourites}
                onChange={(e) =>
                  setSegments((prev) => ({ ...prev, favourites: e.target.checked, all: false }))
                }
                className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
              />
              <div className="flex-1">
                <p className="text-13 font-semibold text-text">Starred Favourites (19)</p>
                <p className="text-11 text-text-muted">VIP studio supporters & frequent repeat buyers</p>
              </div>
            </label>
          </div>

          {/* Animated Estimated Reach Box */}
          <div className="p-4 rounded-xl border border-primary/30 bg-primary/10 flex items-center justify-between">
            <div>
              <p className="text-12 font-medium text-text-muted">Estimated Audience Reach</p>
              <p className="text-28 font-bold font-outfit text-text tabular-nums tracking-tight">
                {estimatedReach} recipients
              </p>
            </div>
            <span className="p-3 rounded-xl bg-primary text-primary-foreground font-bold text-14">
              98% rate
            </span>
          </div>

          {/* Opt-out Note */}
          <div className="p-3 rounded-lg border border-border/50 bg-surface-muted/50 flex items-start gap-2 text-11 text-text-muted">
            <Info className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />
            <span>
              Opt-outs are automatically honored. Customers who replied STOP or unsubscribed are excluded.
            </span>
          </div>
        </div>

        {/* Right Column: Message & PhonePreview (7 cols) */}
        <div className="lg:col-span-7 p-5 rounded-2xl border border-border bg-surface space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <h2 className="text-16 font-bold font-outfit text-text flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> Message & Template
            </h2>
            <span className="text-11 text-text-muted">Meta Approved Template</span>
          </div>

          {/* Template Selector */}
          <div>
            <label className="block text-12 font-semibold uppercase tracking-wider text-text-muted mb-1.5">
              Approved WhatsApp Template
            </label>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-border bg-surface-muted text-13 font-medium text-text focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            >
              {mockTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.category})
                </option>
              ))}
            </select>
          </div>

          {/* Live Variable Inputs */}
          <div className="space-y-2">
            <p className="text-12 font-semibold uppercase tracking-wider text-text-muted">
              Template Variables
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-12">
              <div>
                <span className="text-11 text-text-muted block mb-0.5">
                  {"{customerName}"} (Auto-filled)
                </span>
                <input
                  type="text"
                  disabled
                  value="Priya (Recipient Name)"
                  className="w-full p-2 rounded-lg border border-border bg-surface-muted/60 text-text-muted cursor-not-allowed"
                />
              </div>

              <div>
                <span className="text-11 text-text-muted block mb-0.5">{"{product}"}</span>
                <input
                  type="text"
                  value={variableValues.product || ""}
                  onChange={(e) =>
                    setVariableValues((prev) => ({ ...prev, product: e.target.value }))
                  }
                  className="w-full p-2 rounded-lg border border-border bg-surface-muted text-text focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </div>

          {/* PhonePreview WhatsApp Bubble */}
          <div className="space-y-1.5">
            <p className="text-12 font-semibold uppercase tracking-wider text-text-muted">
              Live WhatsApp Preview
            </p>
            <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
              <div className="max-w-md mx-auto p-3.5 rounded-2xl bg-surface border border-border shadow-md space-y-2 text-13 text-text leading-relaxed">
                <div className="flex items-center justify-between text-11 text-text-muted pb-1 border-b border-border/40">
                  <span className="font-semibold text-text">Saba Art · Official WhatsApp</span>
                  <span>10:30 AM</span>
                </div>
                <p className="whitespace-pre-wrap">{previewBody}</p>
                <div className="flex justify-end text-[10px] text-text-muted">
                  <span>Delivered via WhatsApp API</span>
                </div>
              </div>
            </div>
          </div>

          {/* Schedule vs Send Now Toggle & Actions */}
          <div className="pt-2 border-t border-border flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-12 font-medium text-text cursor-pointer">
                <input
                  type="radio"
                  name="scheduleMode"
                  checked={!isScheduled}
                  onChange={() => setIsScheduled(false)}
                  className="text-primary"
                />
                <span>Send immediately</span>
              </label>

              <label className="flex items-center gap-2 text-12 font-medium text-text cursor-pointer">
                <input
                  type="radio"
                  name="scheduleMode"
                  checked={isScheduled}
                  onChange={() => setIsScheduled(true)}
                  className="text-primary"
                />
                <span>Schedule for later</span>
              </label>
            </div>

            {isScheduled && (
              <input
                type="datetime-local"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-border bg-surface-muted text-12 text-text"
              />
            )}

            <button
              onClick={() => setShowConfirmModal(true)}
              className="px-5 py-2.5 rounded-xl bg-primary hover:bg-amber-600 text-primary-foreground font-semibold text-13 inline-flex items-center gap-2 shadow-xs cursor-pointer ml-auto"
            >
              <Send className="w-4 h-4" />
              <span>{isScheduled ? "Schedule Broadcast" : "Send Broadcast Now"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── Recent Broadcasts History Table ──────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-16 font-bold font-outfit text-text">Recent Broadcast Campaigns</h2>

        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <table className="w-full text-left text-13">
            <thead className="bg-surface-muted border-b border-border text-11 uppercase font-semibold text-text-muted">
              <tr>
                <th className="p-3.5">Campaign Name</th>
                <th className="p-3.5">Date</th>
                <th className="p-3.5">Target Audience</th>
                <th className="p-3.5">Sent</th>
                <th className="p-3.5">Delivered</th>
                <th className="p-3.5">Read</th>
                <th className="p-3.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {broadcasts.map((b) => (
                <tr key={b.id} className="hover:bg-surface-muted/60 transition-colors">
                  <td className="p-3.5 font-bold font-outfit text-text">{b.name}</td>
                  <td className="p-3.5 text-text-muted">{b.date}</td>
                  <td className="p-3.5 text-text font-medium">{b.audience}</td>
                  <td className="p-3.5 tabular-nums font-semibold text-text">{b.sentCount}</td>
                  <td className="p-3.5 tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">
                    {b.status === "scheduled" ? "—" : `${b.deliveredPercent}%`}
                  </td>
                  <td className="p-3.5 tabular-nums text-text-muted">
                    {b.status === "scheduled" ? "—" : `${b.readPercent}%`}
                  </td>
                  <td className="p-3.5 text-right">
                    <span
                      className={`px-2 py-0.5 rounded text-11 font-semibold uppercase tracking-wider ${
                        b.status === "sent"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                      }`}
                    >
                      {b.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Confirmation Modal ───────────────────────────────────────────────── */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-primary/20 text-primary-text mx-auto flex items-center justify-center">
              <Send className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-16 font-bold font-outfit text-text">
                {isScheduled ? "Confirm Schedule" : "Confirm Broadcast"}
              </h3>
              <p className="text-12 text-text-muted mt-1">
                This campaign will be sent to <strong>{estimatedReach}</strong> verified customer numbers on WhatsApp.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-2 rounded-lg border border-border bg-surface hover:bg-surface-muted text-13 font-medium text-text cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSendOrSchedule}
                className="flex-1 py-2 rounded-lg bg-primary hover:bg-amber-600 text-primary-foreground text-13 font-semibold cursor-pointer shadow-xs"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
