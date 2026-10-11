import { useState, useMemo } from "react";
import {
  Plus,
  Trash2,
  Edit,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { InstagramIcon } from "../components/shared/InstagramIcon.tsx";
import { SampleDataBadge } from "../components/shared/SampleDataBadge.tsx";
import {
  mockIGRules,
  mockIGComments,
  type IGRule,
  type IGComment,
} from "../data/mockData.ts";

export default function IGCommentsPage() {
  const [activeTab, setActiveTab] = useState<"log" | "rules">("log");
  const [logFilter, setLogFilter] = useState<"all" | "replied" | "pending">("all");

  const [rules, setRules] = useState<IGRule[]>(mockIGRules);
  const [comments] = useState<IGComment[]>(mockIGComments);

  // SlideOver for Add/Edit Rule
  const [isSlideOverOpen, setIsSlideOverOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<IGRule | null>(null);

  // Form states
  const [formName, setFormName] = useState("");
  const [formKeywords, setFormKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [formReplyType, setFormReplyType] = useState<"public_reply" | "send_dm">("public_reply");
  const [formReplyText, setFormReplyText] = useState("");
  const [formActive, setFormActive] = useState(true);

  // Test match box
  const [testComment, setTestComment] = useState("");

  const testMatchResult = useMemo(() => {
    if (!testComment.trim() || formKeywords.length === 0) return null;
    const lower = testComment.toLowerCase();
    const matched = formKeywords.some((k) => lower.includes(k.toLowerCase()));
    return matched;
  }, [testComment, formKeywords]);

  const filteredComments = useMemo(() => {
    return comments.filter((c) => {
      if (logFilter === "replied" && c.action === "skipped") return false;
      if (logFilter === "pending" && c.action !== "skipped") return false;
      return true;
    });
  }, [comments, logFilter]);

  const toggleRuleActive = (ruleId: string, current: boolean) => {
    setRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, isActive: !current } : r))
    );
    toast.info(!current ? "Rule activated" : "Rule paused");
  };

  const handleOpenAddRule = () => {
    setEditingRule(null);
    setFormName("");
    setFormKeywords(["price", "cost", "rate"]);
    setFormReplyType("public_reply");
    setFormReplyText("Hi! DM us for pricing details 💕 @saba_art");
    setFormActive(true);
    setTestComment("How much is this coaster set?");
    setIsSlideOverOpen(true);
  };

  const handleEditRule = (r: IGRule) => {
    setEditingRule(r);
    setFormName(r.name);
    setFormKeywords(r.keywords);
    setFormReplyType(r.replyType);
    setFormReplyText(r.replyText);
    setFormActive(r.isActive);
    setTestComment("Can I customize this with my initials?");
    setIsSlideOverOpen(true);
  };

  const handleDeleteRule = (id: string, name: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
    toast.success("Rule deleted", { description: name });
  };

  const handleAddKeyword = () => {
    if (!keywordInput.trim()) return;
    if (!formKeywords.includes(keywordInput.trim())) {
      setFormKeywords([...formKeywords, keywordInput.trim()]);
    }
    setKeywordInput("");
  };

  const handleRemoveKeyword = (k: string) => {
    setFormKeywords(formKeywords.filter((x) => x !== k));
  };

  const handleSaveRule = () => {
    if (!formName.trim() || !formReplyText.trim() || formKeywords.length === 0) {
      toast.error("Please provide rule name, at least one keyword, and reply text");
      return;
    }

    if (editingRule) {
      setRules((prev) =>
        prev.map((r) =>
          r.id === editingRule.id
            ? {
                ...r,
                name: formName.trim(),
                keywords: formKeywords,
                replyType: formReplyType,
                replyText: formReplyText.trim(),
                isActive: formActive,
              }
            : r
        )
      );
      toast.success("Rule updated", { description: formName });
    } else {
      const newR: IGRule = {
        id: `rule-${Date.now()}`,
        name: formName.trim(),
        keywords: formKeywords,
        replyType: formReplyType,
        replyText: formReplyText.trim(),
        isActive: formActive,
      };
      setRules((prev) => [...prev, newR]);
      toast.success("Rule created", { description: formName });
    }
    setIsSlideOverOpen(false);
  };

  return (
    <div className="space-y-6 pb-12 w-full">
      {/* ─── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-24 md:text-28 font-bold font-outfit text-text tracking-tight flex items-center gap-2">
            <InstagramIcon className="w-7 h-7 text-pink-500" />
            <span>Instagram Comments & AI Rules</span>
            <SampleDataBadge title="Instagram comment logs and rules using static demo data" />
          </h1>
          <p className="text-13 text-text-muted mt-0.5">
            Auto-reply to post inquiries, keyword triggers, and instant lead capture on Instagram
          </p>
        </div>

        {activeTab === "rules" && (
          <button
            onClick={handleOpenAddRule}
            className="px-4 py-2 rounded-xl bg-primary hover:bg-amber-600 text-primary-foreground text-13 font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Rule</span>
          </button>
        )}
      </div>

      {/* ─── Tabs Switcher ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border pb-1">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("log")}
            className={`px-4 py-2 font-semibold text-13 border-b-2 transition-colors cursor-pointer ${
              activeTab === "log"
                ? "border-primary text-primary-text"
                : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            Comments Log ({comments.length})
          </button>
          <button
            onClick={() => setActiveTab("rules")}
            className={`px-4 py-2 font-semibold text-13 border-b-2 transition-colors cursor-pointer ${
              activeTab === "rules"
                ? "border-primary text-primary-text"
                : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            Auto-Reply Rules ({rules.length})
          </button>
        </div>

        {activeTab === "log" && (
          <div className="flex items-center gap-1.5 text-12 font-medium">
            <button
              onClick={() => setLogFilter("all")}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                logFilter === "all" ? "bg-primary text-primary-foreground font-semibold" : "text-text-muted"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setLogFilter("replied")}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                logFilter === "replied" ? "bg-primary text-primary-foreground font-semibold" : "text-text-muted"
              }`}
            >
              Replied
            </button>
            <button
              onClick={() => setLogFilter("pending")}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                logFilter === "pending" ? "bg-primary text-primary-foreground font-semibold" : "text-text-muted"
              }`}
            >
              Pending
            </button>
          </div>
        )}
      </div>

      {/* ─── Tab 1: Comments Log Table ────────────────────────────────────────── */}
      {activeTab === "log" ? (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <table className="w-full text-left text-13">
            <thead className="bg-surface-muted border-b border-border text-11 uppercase font-semibold text-text-muted">
              <tr>
                <th className="p-3.5">Post</th>
                <th className="p-3.5">Commenter</th>
                <th className="p-3.5">Comment</th>
                <th className="p-3.5">Matched Rule</th>
                <th className="p-3.5">Action Taken</th>
                <th className="p-3.5 text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filteredComments.map((c) => (
                <tr key={c.id} className="hover:bg-surface-muted/50 transition-colors">
                  <td className="p-3.5">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={c.postThumbnail}
                        alt={c.postTitle}
                        className="w-9 h-9 rounded-lg object-cover border border-border shrink-0"
                      />
                      <span className="font-semibold text-text truncate max-w-[160px]">
                        {c.postTitle}
                      </span>
                    </div>
                  </td>
                  <td className="p-3.5 font-medium text-pink-600 dark:text-pink-400">
                    {c.handle}
                  </td>
                  <td className="p-3.5 text-text italic max-w-xs truncate">
                    "{c.comment}"
                  </td>
                  <td className="p-3.5">
                    <span className="px-2 py-0.5 rounded text-11 font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      {c.matchedRule}
                    </span>
                  </td>
                  <td className="p-3.5">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-11 font-semibold ${
                        c.action === "replied_publicly"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : c.action === "dm_sent"
                            ? "bg-violet-500/10 text-violet-600 dark:text-violet-400"
                            : "bg-surface-muted text-text-muted"
                      }`}
                    >
                      {c.action === "replied_publicly" && "Replied publicly"}
                      {c.action === "dm_sent" && "DM sent"}
                      {c.action === "skipped" && "Skipped"}
                    </span>
                  </td>
                  <td className="p-3.5 text-right text-text-muted">{c.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* ─── Tab 2: Automation Rules Cards ───────────────────────────────────── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rules.map((r) => (
            <div
              key={r.id}
              className="p-5 rounded-xl border border-border bg-surface hover:border-border/80 hover:shadow-md transition-all flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-15 font-bold font-outfit text-text">{r.name}</h3>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={r.isActive}
                      onChange={() => toggleRuleActive(r.id, r.isActive)}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:border-border after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                {/* Keywords Chips */}
                <div className="space-y-1 mb-3">
                  <span className="text-[11px] text-text-muted block">Trigger Keywords:</span>
                  <div className="flex flex-wrap gap-1">
                    {r.keywords.map((k, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded text-11 font-mono font-medium bg-surface-muted text-text border border-border/60"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Reply Type & Preview */}
                <div className="p-3 rounded-lg border border-border/50 bg-surface-muted/60 space-y-1.5 text-12">
                  <div className="flex items-center justify-between text-11 text-text-muted">
                    <span className="font-semibold text-text uppercase tracking-wider text-[10px]">
                      Action: {r.replyType === "public_reply" ? "Public Comment Reply" : "Direct Message (DM)"}
                    </span>
                  </div>
                  <p className="text-text italic leading-relaxed">"{r.replyText}"</p>
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="pt-3 border-t border-border/40 flex items-center justify-between text-12">
                <span className="text-11 text-text-muted">
                  Status: {r.isActive ? "Active" : "Paused"}
                </span>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleEditRule(r)}
                    className="p-1.5 rounded-lg hover:bg-surface-muted hover:text-text cursor-pointer transition-colors"
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteRule(r.id, r.name)}
                    className="p-1.5 rounded-lg hover:bg-red-500/10 hover:text-danger cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── SlideOver: Add / Edit Rule ────────────────────────────────────────── */}
      {isSlideOverOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg bg-surface border-l border-border h-full shadow-2xl p-6 overflow-y-auto space-y-6 custom-scrollbar animate-in slide-in-from-right">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-18 font-bold font-outfit text-text">
                {editingRule ? "Edit IG Rule" : "Add Auto-Reply Rule"}
              </h3>
              <button
                onClick={() => setIsSlideOverOpen(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Rule Name */}
            <div>
              <label className="block text-12 font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                Rule Name
              </label>
              <input
                type="text"
                placeholder="e.g. Price enquiry, Customization ask"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-border bg-surface-muted text-13 text-text focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Trigger Keywords Chip Input */}
            <div className="space-y-2">
              <label className="block text-12 font-semibold uppercase tracking-wider text-text-muted">
                Trigger Keywords
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Type keyword and press Enter..."
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddKeyword();
                    }
                  }}
                  className="flex-1 p-2 rounded-lg border border-border bg-surface-muted text-12 text-text focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={handleAddKeyword}
                  className="px-3 py-2 rounded-lg bg-surface-muted hover:bg-surface border border-border text-12 font-semibold text-text cursor-pointer"
                >
                  Add
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1">
                {formKeywords.map((k) => (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-11 font-mono font-medium bg-primary/10 text-primary-text border border-primary/20"
                  >
                    <span>{k}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveKeyword(k)}
                      className="hover:text-red-500 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Reply Type Toggle */}
            <div>
              <label className="block text-12 font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                Action Type
              </label>
              <div className="grid grid-cols-2 gap-2 text-12 font-semibold">
                <button
                  type="button"
                  onClick={() => setFormReplyType("public_reply")}
                  className={`p-2.5 rounded-xl border text-center transition-colors cursor-pointer ${
                    formReplyType === "public_reply"
                      ? "border-primary bg-primary/10 text-primary-text"
                      : "border-border bg-surface-muted text-text-muted"
                  }`}
                >
                  Public Reply
                </button>
                <button
                  type="button"
                  onClick={() => setFormReplyType("send_dm")}
                  className={`p-2.5 rounded-xl border text-center transition-colors cursor-pointer ${
                    formReplyType === "send_dm"
                      ? "border-primary bg-primary/10 text-primary-text"
                      : "border-border bg-surface-muted text-text-muted"
                  }`}
                >
                  Send Direct Message (DM)
                </button>
              </div>
            </div>

            {/* Reply Text */}
            <div className="space-y-1.5">
              <label className="block text-12 font-semibold uppercase tracking-wider text-text-muted">
                Reply Text
              </label>
              <textarea
                rows={3}
                value={formReplyText}
                onChange={(e) => setFormReplyText(e.target.value)}
                placeholder="Hi! DM us for pricing details 💕 @saba_art"
                className="w-full p-2.5 rounded-xl border border-border bg-surface-muted text-13 text-text focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Live Match Tester */}
            <div className="p-4 rounded-xl border border-border bg-surface-muted space-y-2">
              <div className="flex items-center justify-between text-11 font-semibold uppercase tracking-wider text-text-muted">
                <span>Interactive Keyword Matcher</span>
                {testMatchResult !== null && (
                  <span
                    className={`font-bold ${
                      testMatchResult ? "text-emerald-500" : "text-text-muted"
                    }`}
                  >
                    {testMatchResult ? "✓ MATCH DETECTED" : "✕ NO MATCH"}
                  </span>
                )}
              </div>
              <input
                type="text"
                placeholder="Test with sample comment (e.g. what is the price?)"
                value={testComment}
                onChange={(e) => setTestComment(e.target.value)}
                className="w-full p-2 rounded-lg border border-border bg-surface text-12 text-text"
              />
              {testMatchResult && (
                <div className="p-2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-11 font-medium">
                  Trigger fired! Would auto-reply: "{formReplyText}"
                </div>
              )}
            </div>

            {/* Save Buttons */}
            <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsSlideOverOpen(false)}
                className="px-4 py-2 rounded-xl border border-border bg-surface hover:bg-surface-muted text-13 font-medium text-text cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveRule}
                className="px-5 py-2 rounded-xl bg-primary hover:bg-amber-600 text-primary-foreground font-semibold text-13 cursor-pointer shadow-xs"
              >
                Save Rule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
