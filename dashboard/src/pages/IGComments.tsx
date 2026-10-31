import { useState, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  Plus,
  Trash2,
  Edit2,
  X,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  MessageCircle,
  Send,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Play,
  Film,
  Image as ImageIcon,
  Layers,
  CornerDownRight,
} from "lucide-react";
import { toast } from "sonner";

import { InstagramIcon } from "../components/shared/InstagramIcon.tsx";
import { EmptyState } from "../components/shared/EmptyState.tsx";
import { SlideOver } from "../components/shared/SlideOver.tsx";
import { ConfirmDialog } from "../components/shared/ConfirmDialog.tsx";
import { Skeleton, SkeletonTableRow } from "../components/shared/Skeleton.tsx";
import { Switch } from "../components/ui/Switch.tsx";
import { ChipsInput } from "../components/ui/ChipsInput.tsx";
import { formatRelative, formatDateTime } from "../lib/format.ts";
import { useDebounced } from "../hooks/useDebounced.ts";

import {
  useIgComments,
  useIgCommentStats,
  useIgComment,
  useIgRules,
  useCreateIgRule,
  useUpdateIgRule,
  useDeleteIgRule,
  useReorderIgRules,
  useTestIgRule,
  useIgMedia,
  useIgMediaSummary,
  useIgSettings,
  useUpdateIgSettings,
  useManualReplyIgComment,
  useDismissIgComment,
  useSimulateIgComment,
} from "../hooks/useIgComments.ts";

import type {
  IgRule,
  IgCommentCategory,
  IgReplyMode,
} from "../types/index.ts";

const CATEGORIES: { value: IgCommentCategory; label: string }[] = [
  { value: "price", label: "Price" },
  { value: "custom_order", label: "Custom Order" },
  { value: "availability", label: "Availability" },
  { value: "compliment", label: "Compliment" },
  { value: "question", label: "Question" },
  { value: "complaint", label: "Complaint" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Other" },
];

const CATEGORY_COLORS: Record<IgCommentCategory, string> = {
  price: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  custom_order: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  availability: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
  compliment: "bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20",
  question: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  complaint: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  spam: "bg-gray-500/10 text-gray-500 border-gray-500/20",
  other: "bg-surface-muted text-text-muted border-border",
};

export default function IGCommentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Active top tab (3 tabs: comments, by-media, rules)
  type IgTab = "comments" | "by-media" | "rules";
  const rawTab = searchParams.get("tab");
  const IG_TABS = ["rules", "by-media", "comments"] as const;
  const activeTab: IgTab = IG_TABS.includes(rawTab as IgTab) ? (rawTab as IgTab) : "comments";

  const setActiveTab = (tab: IgTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab);
      return next;
    });
  };

  // Comments Log Filters
  const actionFilter = (searchParams.get("action") as string) || "all";
  const categoryFilter = (searchParams.get("category") as IgCommentCategory) || "";
  const mediaFilter = (searchParams.get("mediaId") as string) || "";
  const mediaTypeFilter = searchParams.get("mediaType") || "";
  const [searchTerm, setSearchTerm] = useState(searchParams.get("search") || "");
  const debouncedSearch = useDebounced(searchTerm, 300);
  const [page, setPage] = useState(1);

  // Queries
  const { data: stats, isLoading: statsLoading } = useIgCommentStats();
  const { data: settings, isLoading: settingsLoading } = useIgSettings();
  const updateSettingsMutation = useUpdateIgSettings();

  const {
    data: commentsData,
    isLoading: commentsLoading,
    isPlaceholderData,
  } = useIgComments({
    action: actionFilter === "all" ? undefined : actionFilter,
    category: categoryFilter || undefined,
    mediaId: mediaFilter || undefined,
    mediaType: mediaTypeFilter === "post" || mediaTypeFilter === "reel" ? mediaTypeFilter : undefined,
    search: debouncedSearch || undefined,
    page,
    limit: 25,
  });

  const { data: rules = [], isLoading: rulesLoading } = useIgRules();
  const { data: mediaList = [] } = useIgMedia();
  const activeMedia = mediaList.find((m) => m.id === mediaFilter);
  const activeMediaLabel = activeMedia
    ? (activeMedia.caption ? activeMedia.caption.slice(0, 50) : activeMedia.id)
    : mediaFilter;
  const { data: mediaSummary = [], isLoading: summaryLoading } = useIgMediaSummary();

  const posts = useMemo(
    () => mediaSummary.filter((m) => m.mediaType === "post"),
    [mediaSummary],
  );
  const reels = useMemo(
    () => mediaSummary.filter((m) => m.mediaType === "reel"),
    [mediaSummary],
  );

  // Mutations
  const createRuleMutation = useCreateIgRule();
  const updateRuleMutation = useUpdateIgRule();
  const deleteRuleMutation = useDeleteIgRule();
  const reorderRulesMutation = useReorderIgRules();
  const manualReplyMutation = useManualReplyIgComment();
  const dismissMutation = useDismissIgComment();
  const simulateMutation = useSimulateIgComment();

  // Selected Comment for Detail SlideOver
  const selectedCommentId = searchParams.get("commentId");
  const { data: selectedComment, isLoading: selectedCommentLoading } = useIgComment(
    selectedCommentId,
  );

  // Manual reply form states inside Comment Detail
  const [manualMode, setManualMode] = useState<"public" | "dm" | "both">("public");
  const [manualPublicText, setManualPublicText] = useState("");
  const [manualDmText, setManualDmText] = useState("");

  // Rule SlideOver (Add / Edit)
  const [isRuleSlideOverOpen, setIsRuleSlideOverOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<IgRule | null>(null);

  // Rule Form States
  const [formName, setFormName] = useState("");
  const [formKeywords, setFormKeywords] = useState<string[]>([]);
  const [formCategories, setFormCategories] = useState<IgCommentCategory[]>([]);
  const [formReplyMode, setFormReplyMode] = useState<IgReplyMode>("both");
  const [formPublicText, setFormPublicText] = useState("");
  const [formDmText, setFormDmText] = useState("");
  const [formMediaScope, setFormMediaScope] = useState<"all" | "specific">("all");
  const [formMediaIds, setFormMediaIds] = useState<string[]>([]);
  const [formActive, setFormActive] = useState(true);

  // Interactive Live Rule Tester
  const [testCommentText, setTestCommentText] = useState("");
  const [testCommentMediaId, setTestCommentMediaId] = useState("");
  const { data: testResult, isFetching: testFetching } = useTestIgRule(
    testCommentText,
    testCommentMediaId || undefined,
  );

  // Delete Confirm Dialog
  const [ruleToDelete, setRuleToDelete] = useState<IgRule | null>(null);

  // Simulation Modal
  const [isSimulateModalOpen, setIsSimulateModalOpen] = useState(false);
  const [simUsername, setSimUsername] = useState("priya_resin_fan");
  const [simText, setSimText] = useState("How much is this ocean resin tray?");
  const [simMediaId, setSimMediaId] = useState("");


  // Master switch toggling
  const handleToggleMaster = (checked: boolean) => {
    updateSettingsMutation.mutate(
      { enabled: checked },
      {
        onSuccess: () => {
          if (!checked) {
            toast.warning("Auto-replies paused", {
              description: "Incoming Instagram comments will be logged as skipped.",
            });
          } else {
            toast.success("Auto-replies active", {
              description: "Incoming comments will be automatically processed.",
            });
          }
        },
        onError: (err) => {
          toast.error("Couldn't update settings", {
            description: err instanceof Error ? err.message : "Something went wrong",
          });
        },
      },
    );
  };

  const handleToggleAiClassification = (checked: boolean) => {
    updateSettingsMutation.mutate(
      { aiClassification: checked },
      {
        onSuccess: () => {
          toast.info(checked ? "AI Intent Matching enabled" : "AI Intent Matching disabled");
        },
      },
    );
  };

  // Filter setters
  const setFilterParam = (key: string, value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value && value !== "all") {
        next.set(key, value);
      } else {
        next.delete(key);
      }
      return next;
    });
    setPage(1);
  };

  // Rule Open Handlers
  const handleOpenAddRule = () => {
    setEditingRule(null);
    setFormName("");
    setFormKeywords(["price", "cost", "how much", "rate"]);
    setFormCategories(["price"]);
    setFormReplyMode("both");
    setFormPublicText("Hi {customerHandle}! We sent you a DM with the pricing details 💕");
    setFormDmText(
      "Hi {customerHandle}! Thanks for asking about {postTitle}. It is ₹1,250 handcrafted with premium epoxy resin. Would you like to place an order?",
    );
    setFormMediaScope("all");
    setFormMediaIds([]);
    setFormActive(true);
    setTestCommentText("How much does this cost?");
    setTestCommentMediaId("");
    setIsRuleSlideOverOpen(true);
  };

  const handleEditRule = (r: IgRule) => {
    setEditingRule(r);
    setFormName(r.name);
    setFormKeywords(r.keywords || []);
    setFormCategories(r.categories || []);
    setFormReplyMode(r.replyMode);
    setFormPublicText(r.publicReplyText || "");
    setFormDmText(r.dmText || "");
    setFormMediaScope(r.mediaIds && r.mediaIds.length > 0 ? "specific" : "all");
    setFormMediaIds(r.mediaIds || []);
    setFormActive(r.isActive);
    setTestCommentText("Can I customize this piece?");
    setTestCommentMediaId(r.mediaIds && r.mediaIds[0] ? r.mediaIds[0] : "");
    setIsRuleSlideOverOpen(true);
  };

  const handleSaveRule = () => {
    if (!formName.trim()) {
      toast.error("Rule name is required");
      return;
    }
    if (formKeywords.length === 0 && formCategories.length === 0) {
      toast.error("Add at least one keyword or category trigger");
      return;
    }
    if (
      (formReplyMode === "public" || formReplyMode === "both") &&
      !formPublicText.trim()
    ) {
      toast.error("Public reply text is required for public reply mode");
      return;
    }
    if ((formReplyMode === "dm" || formReplyMode === "both") && !formDmText.trim()) {
      toast.error("DM text is required for DM reply mode");
      return;
    }

    const payload: Partial<IgRule> = {
      name: formName.trim(),
      keywords: formKeywords,
      categories: formCategories,
      mediaIds: formMediaScope === "specific" ? formMediaIds : [],
      replyMode: formReplyMode,
      publicReplyText: formPublicText.trim() || null,
      dmText: formDmText.trim() || null,
      isActive: formActive,
    };

    if (editingRule) {
      updateRuleMutation.mutate(
        { id: editingRule.id, body: payload },
        {
          onSuccess: () => {
            toast.success("Rule updated", { description: formName });
            setIsRuleSlideOverOpen(false);
          },
          onError: (err) => {
            toast.error("Failed to update rule", { description: err.message });
          },
        },
      );
    } else {
      createRuleMutation.mutate(payload, {
        onSuccess: () => {
          toast.success("Rule created", { description: formName });
          setIsRuleSlideOverOpen(false);
        },
        onError: (err) => {
          toast.error("Failed to create rule", { description: err.message });
        },
      });
    }
  };

  const handleDeleteRuleConfirm = () => {
    if (!ruleToDelete) return;
    deleteRuleMutation.mutate(ruleToDelete.id, {
      onSuccess: () => {
        toast.success("Rule deleted", { description: ruleToDelete.name });
        setRuleToDelete(null);
      },
      onError: (err) => {
        toast.error("Failed to delete rule", { description: err.message });
      },
    });
  };

  const handleMoveRule = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= rules.length) return;

    const newRules = [...rules];
    const temp = newRules[index];
    newRules[index] = newRules[targetIndex]!;
    newRules[targetIndex] = temp!;

    const ids = newRules.map((r) => r.id);
    reorderRulesMutation.mutate(ids, {
      onSuccess: () => toast.success("Rules reordered"),
      onError: (err) => toast.error("Failed to reorder", { description: err.message }),
    });
  };

  // Manual Reply
  const handleSendManualReply = () => {
    if (!selectedCommentId) return;
    if (
      (manualMode === "public" || manualMode === "both") &&
      !manualPublicText.trim()
    ) {
      toast.error("Please enter public reply text");
      return;
    }
    if ((manualMode === "dm" || manualMode === "both") && !manualDmText.trim()) {
      toast.error("Please enter DM text");
      return;
    }

    manualReplyMutation.mutate(
      {
        id: selectedCommentId,
        mode: manualMode,
        publicText: manualPublicText.trim() || undefined,
        dmText: manualDmText.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Reply sent successfully");
          setManualPublicText("");
          setManualDmText("");
        },
        onError: (err) => {
          toast.error("Failed to send reply", { description: err.message });
        },
      },
    );
  };

  // Dismiss comment
  const handleDismissComment = () => {
    if (!selectedCommentId) return;
    dismissMutation.mutate(selectedCommentId, {
      onSuccess: () => {
        toast.info("Comment dismissed");
      },
      onError: (err) => {
        toast.error("Failed to dismiss comment", { description: err.message });
      },
    });
  };

  // Run Demo Simulation
  const handleRunSimulation = () => {
    if (!simText.trim()) {
      toast.error("Enter a comment text");
      return;
    }
    simulateMutation.mutate(
      {
        username: simUsername.trim() || "demo_fan",
        text: simText.trim(),
        mediaId: simMediaId || undefined,
      },
      {
        onSuccess: (data) => {
          toast.success("Simulated comment processed!", {
            description: `Action: ${data.comment.action} (matched by ${data.comment.matchedBy || "none"})`,
          });
          setIsSimulateModalOpen(false);
          setActiveTab("comments");
        },
        onError: (err) => {
          toast.error("Simulation failed", { description: err.message });
        },
      },
    );
  };

  // Insert variable into template textarea
  const insertVariable = (
    field: "public" | "dm",
    varName: "{customerHandle}" | "{postTitle}",
  ) => {
    if (field === "public") {
      setFormPublicText((prev) => `${prev} ${varName}`.trim());
    } else {
      setFormDmText((prev) => `${prev} ${varName}`.trim());
    }
  };

  // Counts from backend
  const counts = commentsData?.counts || {
    all: 0,
    pending: 0,
    needs_attention: 0,
    replied: 0,
    skipped: 0,
    dismissed: 0,
    failed: 0,
  };

  const totalCount = commentsData?.pagination.total || 0;
  const limitCount = commentsData?.pagination.limit || 25;
  const totalPages = Math.ceil(totalCount / limitCount) || 1;

  return (
    <div className="space-y-6 pb-16 w-full">
      {/* ─── Page Header & Master Controls ─────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h1 className="text-24 md:text-28 font-bold font-outfit text-text tracking-tight flex items-center gap-2.5">
            <InstagramIcon className="w-7 h-7 text-pink-500 shrink-0" />
            <span>Instagram Comments & AI Rules</span>
          </h1>
          <p className="text-13 text-text-muted mt-1">
            Auto-reply to posts and reels, AI intent classification, instant DM lead capture, and escalation inboxing.
          </p>
        </div>

        {/* Master Toggles & Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setIsSimulateModalOpen(true)}
            className="px-3 py-2 rounded-xl border border-border bg-surface-muted hover:bg-surface text-12 font-semibold text-text inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Simulate incoming comment (DEMO_MODE)"
          >
            <Play className="w-3.5 h-3.5 text-pink-500" />
            <span>Simulate Comment</span>
          </button>

          {activeTab === "rules" && (
            <button
              type="button"
              onClick={handleOpenAddRule}
              className="px-3.5 py-2 rounded-xl bg-primary hover:bg-amber-600 text-primary-foreground text-12 font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Rule</span>
            </button>
          )}

          {/* Master Enabled Switch */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border bg-surface shadow-2xs">
            <span className="text-12 font-medium text-text">
              Auto-Replies:
            </span>
            <span
              className={`text-11 font-bold ${
                settings?.enabled ? "text-emerald-500" : "text-amber-500"
              }`}
            >
              {settings?.enabled ? "ACTIVE" : "PAUSED"}
            </span>
            <Switch
              label="Toggle Instagram auto-replies"
              checked={Boolean(settings?.enabled)}
              disabled={settingsLoading || updateSettingsMutation.isPending}
              onChange={handleToggleMaster}
            />
          </div>
        </div>
      </div>

      {/* ─── Top Stats Row ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Today Comments */}
        <div className="p-4 rounded-xl border border-border bg-surface shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-11 uppercase font-semibold tracking-wider text-text-muted">
              Today's Comments
            </p>
            <div className="text-24 font-bold font-outfit text-text mt-0.5">
              {statsLoading ? "..." : stats?.today.comments ?? 0}
            </div>
            <p className="text-11 text-text-muted mt-1">
              {stats?.last7d.comments ?? 0} comments past 7 days
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-pink-500/10 text-pink-500 flex items-center justify-center">
            <MessageCircle className="w-5 h-5" />
          </div>
        </div>

        {/* Auto-Replied % */}
        <div className="p-4 rounded-xl border border-border bg-surface shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-11 uppercase font-semibold tracking-wider text-text-muted">
              Auto-Replied Rate
            </p>
            <div className="text-24 font-bold font-outfit text-emerald-600 dark:text-emerald-400 mt-0.5">
              {statsLoading
                ? "..."
                : stats && stats.today.comments > 0
                  ? `${Math.round((stats.today.autoReplied / stats.today.comments) * 100)}%`
                  : "—"}
            </div>
            <p className="text-11 text-text-muted mt-1">
              {stats?.today.autoReplied ?? 0} auto-replied today
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        {/* Needs Attention */}
        <div className="p-4 rounded-xl border border-border bg-surface shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-11 uppercase font-semibold tracking-wider text-text-muted">
              Needs Attention
            </p>
            <div
              className={`text-24 font-bold font-outfit mt-0.5 ${
                (stats?.today.needsAttention ?? 0) > 0
                  ? "text-rose-500"
                  : "text-text"
              }`}
            >
              {statsLoading ? "..." : stats?.today.needsAttention ?? 0}
            </div>
            <p className="text-11 text-text-muted mt-1">
              Complaints & escalated queries
            </p>
          </div>
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              (stats?.today.needsAttention ?? 0) > 0
                ? "bg-rose-500/10 text-rose-500"
                : "bg-surface-muted text-text-muted"
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* ─── Navigation Tabs ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("comments")}
            className={`px-4 py-2.5 font-semibold text-13 border-b-2 transition-colors cursor-pointer ${
              activeTab === "comments"
                ? "border-primary text-primary-text"
                : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            Comments Log ({counts.all})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("by-media")}
            className={`px-4 py-2.5 font-semibold text-13 border-b-2 transition-colors cursor-pointer ${
              activeTab === "by-media"
                ? "border-primary text-primary-text"
                : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            By Media ({mediaSummary.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("rules")}
            className={`px-4 py-2.5 font-semibold text-13 border-b-2 transition-colors cursor-pointer ${
              activeTab === "rules"
                ? "border-primary text-primary-text"
                : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            Auto-Reply Rules ({rules.length})
          </button>
        </div>

        {activeTab === "rules" && (
          <div className="hidden sm:flex items-center gap-2 text-12 text-text-muted">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>AI Intent Classification:</span>
            <Switch
              label="Toggle AI Classification"
              checked={Boolean(settings?.aiClassification)}
              onChange={handleToggleAiClassification}
            />
          </div>
        )}
      </div>

      {/* ─── TAB 1: COMMENTS LOG ───────────────────────────────────────────── */}
      {activeTab === "comments" && (
        <div className="space-y-4">
          {/* Action & Media Type Filter Pills (Merged single row) */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Left side: Action pills */}
            <div className="flex flex-wrap items-center gap-1.5 text-12">
              <button
                type="button"
                onClick={() => setFilterParam("action", "all")}
                className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  actionFilter === "all"
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "bg-surface-muted text-text-muted hover:text-text"
                }`}
              >
                All ({counts.all})
              </button>
              <button
                type="button"
                onClick={() => setFilterParam("action", "needs_attention")}
                className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  actionFilter === "needs_attention"
                    ? "bg-rose-500 text-white font-semibold"
                    : counts.needs_attention > 0
                      ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 font-semibold"
                      : "bg-surface-muted text-text-muted hover:text-text"
                }`}
              >
                Needs Attention ({counts.needs_attention})
              </button>
              <button
                type="button"
                onClick={() => setFilterParam("action", "replied")}
                className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  actionFilter === "replied"
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "bg-surface-muted text-text-muted hover:text-text"
                }`}
              >
                Replied ({counts.replied})
              </button>
              <button
                type="button"
                onClick={() => setFilterParam("action", "skipped")}
                className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  actionFilter === "skipped"
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "bg-surface-muted text-text-muted hover:text-text"
                }`}
              >
                Skipped ({counts.skipped})
              </button>
              <button
                type="button"
                onClick={() => setFilterParam("action", "dismissed")}
                className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  actionFilter === "dismissed"
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "bg-surface-muted text-text-muted hover:text-text"
                }`}
              >
                Dismissed ({counts.dismissed})
              </button>
              <button
                type="button"
                onClick={() => setFilterParam("action", "pending")}
                className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  actionFilter === "pending"
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "bg-surface-muted text-text-muted hover:text-text"
                }`}
              >
                Pending ({counts.pending})
              </button>
              <button
                type="button"
                onClick={() => setFilterParam("action", "failed")}
                className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  actionFilter === "failed"
                    ? "bg-danger text-white font-semibold"
                    : counts.failed > 0
                      ? "bg-red-500/10 text-danger font-semibold"
                      : "bg-surface-muted text-text-muted hover:text-text"
                }`}
              >
                Failed ({counts.failed})
              </button>
            </div>

            {/* Right side: Media Type Pills + Reset filters */}
            <div className="flex flex-wrap items-center gap-1.5 text-12">
              <button
                type="button"
                onClick={() => setFilterParam("mediaType", "all")}
                className={`px-3 py-1 rounded-lg text-12 font-medium transition-colors cursor-pointer ${
                  !mediaTypeFilter || mediaTypeFilter === "all"
                    ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                    : "bg-surface-muted text-text-muted hover:text-text"
                }`}
              >
                All Types
              </button>
              <button
                type="button"
                onClick={() => setFilterParam("mediaType", "post")}
                className={`px-3 py-1 rounded-lg text-12 font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                  mediaTypeFilter === "post"
                    ? "bg-blue-600 text-white font-semibold shadow-xs"
                    : "bg-surface-muted text-text-muted hover:text-text"
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Posts only</span>
              </button>
              <button
                type="button"
                onClick={() => setFilterParam("mediaType", "reel")}
                className={`px-3 py-1 rounded-lg text-12 font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                  mediaTypeFilter === "reel"
                    ? "bg-purple-600 text-white font-semibold shadow-xs"
                    : "bg-surface-muted text-text-muted hover:text-text"
                }`}
              >
                <Film className="w-3.5 h-3.5" />
                <span>Reels only</span>
              </button>

              {/* Clear filters shortcut */}
              {(categoryFilter || mediaFilter || (mediaTypeFilter && mediaTypeFilter !== "all") || searchTerm) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    setPage(1);
                    setSearchParams((prev) => {
                      const next = new URLSearchParams(prev);
                      next.delete("category");
                      next.delete("mediaId");
                      next.delete("mediaType");
                      next.delete("search");
                      return next;
                    });
                  }}
                  className="text-11 text-text-muted hover:text-text underline cursor-pointer ml-1"
                >
                  Reset filters
                </button>
              )}
            </div>
          </div>

          {/* Active media filter pill if filtered to single media */}
          {mediaFilter && (
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-pink-500/10 border border-pink-500/20 text-11 text-pink-600 dark:text-pink-400">
              <span>Filtered to: <strong>{activeMediaLabel}</strong></span>
              <button
                type="button"
                onClick={() => setFilterParam("mediaId", "all")}
                className="font-bold underline hover:opacity-80 cursor-pointer ml-1"
              >
                Clear
              </button>
            </div>
          )}

          {/* Secondary Filters: Search, Category, Media */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-text-muted" />
              <input
                type="text"
                placeholder="Search comment or username..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setFilterParam("search", e.target.value);
                }}
                className="w-full pl-9 pr-8 py-2 rounded-xl border border-border bg-surface text-13 text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    setFilterParam("search", "");
                  }}
                  className="absolute right-2.5 top-2.5 text-text-muted hover:text-text"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category Dropdown */}
            <div className="relative">
              <select
                value={categoryFilter}
                onChange={(e) => setFilterParam("category", e.target.value)}
                className="w-full py-2 pl-3 pr-8 rounded-xl border border-border bg-surface text-13 text-text focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer appearance-none"
              >
                <option value="">All Categories</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" aria-hidden />
            </div>

            {/* Media Dropdown */}
            <div className="relative">
              <select
                value={mediaFilter}
                onChange={(e) => setFilterParam("mediaId", e.target.value)}
                className="w-full py-2 pl-3 pr-8 rounded-xl border border-border bg-surface text-13 text-text focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer truncate appearance-none"
              >
                <option value="">All Posts & Reels</option>
                {mediaList.map((m) => (
                  <option key={m.id} value={m.id}>
                    [{m.mediaType.toUpperCase()}] {m.caption ? m.caption.slice(0, 40) : m.id}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" aria-hidden />
            </div>
          </div>

          {/* Comments Table */}
          <div className="rounded-xl border border-border bg-surface overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-13">
                <thead className="bg-surface-muted border-b border-border text-11 uppercase font-semibold text-text-muted">
                  <tr>
                    <th className="p-3.5">Post</th>
                    <th className="p-3.5">Commenter</th>
                    <th className="p-3.5 min-w-[220px]">Comment</th>
                    <th className="p-3.5">Category & Match</th>
                    <th className="p-3.5">Action Taken</th>
                    <th className="p-3.5 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {commentsLoading && !isPlaceholderData ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={6} className="p-4">
                          <SkeletonTableRow />
                        </td>
                      </tr>
                    ))
                  ) : !commentsData || commentsData.comments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8">
                        <EmptyState
                          title="No comments found"
                          description="No Instagram comments match your active filters or search terms."
                          size="compact"
                        />
                      </td>
                    </tr>
                  ) : (
                    commentsData.comments.map((c) => {
                      const isNeedsAttention = c.action === "needs_attention";
                      const isFailed = c.action === "failed";
                      const isReplied =
                        c.action === "replied_public" ||
                        c.action === "dm_sent" ||
                        c.action === "replied_both";

                      return (
                        <tr
                          key={c.id}
                          onClick={() => {
                            setSearchParams((prev) => {
                              const next = new URLSearchParams(prev);
                              next.set("commentId", c.id);
                              return next;
                            });
                          }}
                          className={`hover:bg-surface-muted/60 transition-colors cursor-pointer ${
                            isNeedsAttention
                              ? "bg-rose-500/5 hover:bg-rose-500/10"
                              : ""
                          }`}
                        >
                          {/* Post thumbnail + caption */}
                          <td className="p-3.5">
                            <div className="flex items-center gap-2.5">
                              {c.mediaThumbnailUrl ? (
                                <img
                                  src={c.mediaThumbnailUrl}
                                  alt="media"
                                  className="w-10 h-10 rounded-lg object-cover border border-border shrink-0 bg-surface-muted"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-lg border border-border bg-surface-muted flex items-center justify-center shrink-0 text-text-muted">
                                  {c.mediaType === "reel" ? (
                                    <Film className="w-4 h-4" />
                                  ) : (
                                    <ImageIcon className="w-4 h-4" />
                                  )}
                                </div>
                              )}
                              <div className="max-w-[150px] truncate">
                                <span className="font-semibold text-text text-12 block truncate">
                                  {c.mediaCaption || "Post"}
                                </span>
                                <span className="text-11 text-text-muted uppercase">
                                  {c.mediaType || "post"}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Commenter handle + profile pic */}
                          <td className="p-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {c.commenterProfilePicUrl ? (
                                <img
                                  src={c.commenterProfilePicUrl}
                                  alt={c.commenterUsername || "user"}
                                  className="w-7 h-7 rounded-full object-cover shrink-0 border border-border"
                                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-[#38C7D8]/20 text-[#0E7D8D] dark:text-[#67E8F9] flex items-center justify-center text-10 font-bold shrink-0">
                                  {(c.commenterUsername || "U")[0]?.toUpperCase()}
                                </div>
                              )}
                              <span className="font-medium text-pink-600 dark:text-pink-400">
                                @{c.commenterUsername || "user"}
                              </span>
                            </div>
                          </td>

                          {/* Comment text */}
                          <td className="p-3.5">
                            <p className="text-text max-w-sm line-clamp-2">
                              "{c.text}"
                            </p>
                            {c.publicReplyText && (
                              <p className="text-11 text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1 line-clamp-1">
                                <CornerDownRight className="w-3 h-3 shrink-0" />
                                <span>{c.publicReplyText}</span>
                              </p>
                            )}
                          </td>

                          {/* Category & Match method */}
                          <td className="p-3.5">
                            <div className="flex flex-col gap-1 items-start">
                              {c.category && (
                                <span
                                  className={`px-2 py-0.5 rounded text-11 font-medium border ${
                                    CATEGORY_COLORS[c.category] ||
                                    CATEGORY_COLORS.other
                                  }`}
                                >
                                  {c.category.replace("_", " ")}
                                </span>
                              )}
                              {c.matchedBy && (
                                <span className="text-[10px] text-text-muted flex items-center gap-1">
                                  {c.matchedBy === "ai" ? (
                                    <Sparkles className="w-3 h-3 text-amber-500" />
                                  ) : (
                                    <span>#</span>
                                  )}
                                  <span>via {c.matchedBy}</span>
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Action Badge */}
                          <td className="p-3.5 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-11 font-semibold ${
                                isNeedsAttention
                                  ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                                  : isFailed
                                    ? "bg-red-500/10 text-danger border border-red-500/30"
                                    : c.action === "replied_both"
                                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                                      : c.action === "replied_public"
                                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30"
                                        : c.action === "dm_sent"
                                          ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30"
                                          : c.action === "skipped"
                                            ? "bg-surface-muted text-text-muted border border-border"
                                            : c.action === "dismissed"
                                              ? "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border border-zinc-500/30"
                                              : "bg-amber-500/10 text-amber-600 border border-amber-500/30"
                              }`}
                            >
                              {isNeedsAttention && <AlertTriangle className="w-3 h-3 shrink-0" />}
                              {isFailed && <AlertCircle className="w-3 h-3 shrink-0" />}
                              {isReplied && <CheckCircle2 className="w-3 h-3 shrink-0" />}
                              <span>
                                {c.action === "replied_public" && "Public replied"}
                                {c.action === "dm_sent" && "DM sent"}
                                {c.action === "replied_both" && "Public + DM"}
                                {c.action === "needs_attention" && "Needs attention"}
                                {c.action === "skipped" && `Skipped (${c.skipReason || "paused"})`}
                                {c.action === "dismissed" && "Dismissed"}
                                {c.action === "failed" && "Send failed"}
                                {c.action === "pending" && "Pending"}
                              </span>
                            </span>
                          </td>

                          {/* Relative Time */}
                          <td
                            className="p-3.5 text-right text-text-muted whitespace-nowrap text-12"
                            title={formatDateTime(c.commentedAt)}
                          >
                            {formatRelative(c.commentedAt)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            {totalPages > 1 && (
              <div className="p-3 border-t border-border flex items-center justify-between text-12 text-text-muted bg-surface">
                <div>
                  Page {page} of {totalPages}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg border border-border hover:bg-surface-muted disabled:opacity-40 disabled:cursor-not-allowed text-text"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="p-1.5 rounded-lg border border-border hover:bg-surface-muted disabled:opacity-40 disabled:cursor-not-allowed text-text"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB 2: BY MEDIA (POSTS & REELS GROUPED) ───────────────────────── */}
      {activeTab === "by-media" && (
        <div className="space-y-6">
          {summaryLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-4 rounded-xl border border-border bg-surface flex items-center gap-4">
                  <Skeleton className="w-[60px] h-[60px] rounded-lg shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="w-3/4 h-4" />
                    <Skeleton className="w-1/2 h-3" />
                  </div>
                </div>
              ))}
            </div>
          ) : mediaSummary.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface p-8">
              <EmptyState
                title="No media comments recorded"
                description="When customers leave comments on your Instagram posts or reels, they will be categorized and summarized here."
                size="compact"
              />
            </div>
          ) : (
            <div className="space-y-8">
              {/* Posts Section */}
              {posts.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-1.5 border-b border-border">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-blue-500/10 text-blue-500 flex items-center justify-center">
                        <ImageIcon className="w-3.5 h-3.5" />
                      </div>
                      <h2 className="text-15 font-bold font-outfit text-text">
                        Posts ({posts.length})
                      </h2>
                    </div>
                    <span className="text-12 text-text-muted">
                      {posts.reduce((acc, p) => acc + p.counts.total, 0)} total comments
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {posts.map((item) => (
                      <div
                        key={item.mediaId}
                        onClick={() => {
                          setSearchParams((prev) => {
                            const next = new URLSearchParams(prev);
                            next.set("tab", "comments");
                            next.set("mediaId", item.mediaId);
                            next.delete("mediaType");
                            return next;
                          });
                        }}
                        className="p-3.5 rounded-xl border border-border bg-surface hover:border-primary/50 hover:shadow-xs transition-all cursor-pointer flex items-start gap-3.5 group"
                      >
                        {/* Thumbnail 60x60 */}
                        <div className="relative shrink-0">
                          {item.mediaThumbnailUrl ? (
                            <img
                              src={item.mediaThumbnailUrl}
                              alt=""
                              className="w-[60px] h-[60px] rounded-lg object-cover border border-border bg-surface-muted shrink-0"
                            />
                          ) : (
                            <div className="w-[60px] h-[60px] rounded-lg border border-border bg-surface-muted flex items-center justify-center shrink-0 text-text-muted">
                              <ImageIcon className="w-6 h-6" />
                            </div>
                          )}
                          <span className="absolute -top-1.5 -left-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold font-outfit uppercase tracking-wider bg-blue-500 text-white shadow-2xs">
                            POST
                          </span>
                        </div>

                        {/* Caption & Counts */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-1">
                            <p className="text-12 font-semibold text-text line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                              {item.mediaCaption || "Untitled Post"}
                            </p>
                            {item.mediaPermalink && (
                              <a
                                href={item.mediaPermalink}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-text-muted hover:text-pink-500 transition-colors p-1 shrink-0"
                                title="Open on Instagram"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>

                          {/* Count Chips */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-2.5 text-11">
                            <span className="px-2 py-0.5 rounded-md font-bold font-outfit bg-surface-muted border border-border text-text">
                              {item.counts.total} comments
                            </span>
                            {item.counts.needs_attention > 0 && (
                              <span className="px-2 py-0.5 rounded-md font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                                {item.counts.needs_attention} needs attention
                              </span>
                            )}
                            {item.counts.replied > 0 && (
                              <span className="px-2 py-0.5 rounded-md font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                {item.counts.replied} replied
                              </span>
                            )}
                            {item.counts.skipped > 0 && (
                              <span className="px-2 py-0.5 rounded-md text-text-muted bg-surface-muted border border-border">
                                {item.counts.skipped} skipped
                              </span>
                            )}
                            {item.counts.dismissed && item.counts.dismissed > 0 ? (
                              <span className="px-2 py-0.5 rounded-md text-zinc-600 dark:text-zinc-400 bg-zinc-500/10 border border-zinc-500/30">
                                {item.counts.dismissed} dismissed
                              </span>
                            ) : null}
                            {item.counts.failed > 0 && (
                              <span className="px-2 py-0.5 rounded-md font-semibold bg-red-500/10 text-danger border border-red-500/30">
                                {item.counts.failed} failed
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Reels Section */}
              {reels.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between pb-1.5 border-b border-border">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-purple-500/10 text-purple-500 flex items-center justify-center">
                        <Film className="w-3.5 h-3.5" />
                      </div>
                      <h2 className="text-15 font-bold font-outfit text-text">
                        Reels ({reels.length})
                      </h2>
                    </div>
                    <span className="text-12 text-text-muted">
                      {reels.reduce((acc, r) => acc + r.counts.total, 0)} total comments
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {reels.map((item) => (
                      <div
                        key={item.mediaId}
                        onClick={() => {
                          setSearchParams((prev) => {
                            const next = new URLSearchParams(prev);
                            next.set("tab", "comments");
                            next.set("mediaId", item.mediaId);
                            next.delete("mediaType");
                            return next;
                          });
                        }}
                        className="p-3.5 rounded-xl border border-border bg-surface hover:border-primary/50 hover:shadow-xs transition-all cursor-pointer flex items-start gap-3.5 group"
                      >
                        {/* Thumbnail 60x60 */}
                        <div className="relative shrink-0">
                          {item.mediaThumbnailUrl ? (
                            <img
                              src={item.mediaThumbnailUrl}
                              alt=""
                              className="w-[60px] h-[60px] rounded-lg object-cover border border-border bg-surface-muted shrink-0"
                            />
                          ) : (
                            <div className="w-[60px] h-[60px] rounded-lg border border-border bg-surface-muted flex items-center justify-center shrink-0 text-text-muted">
                              <Film className="w-6 h-6" />
                            </div>
                          )}
                          <span className="absolute -top-1.5 -left-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold font-outfit uppercase tracking-wider bg-purple-600 text-white shadow-2xs">
                            REEL
                          </span>
                        </div>

                        {/* Caption & Counts */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-1">
                            <p className="text-12 font-semibold text-text line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                              {item.mediaCaption || "Untitled Reel"}
                            </p>
                            {item.mediaPermalink && (
                              <a
                                href={item.mediaPermalink}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-text-muted hover:text-pink-500 transition-colors p-1 shrink-0"
                                title="Open on Instagram"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>

                          {/* Count Chips */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-2.5 text-11">
                            <span className="px-2 py-0.5 rounded-md font-bold font-outfit bg-surface-muted border border-border text-text">
                              {item.counts.total} comments
                            </span>
                            {item.counts.needs_attention > 0 && (
                              <span className="px-2 py-0.5 rounded-md font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                                {item.counts.needs_attention} needs attention
                              </span>
                            )}
                            {item.counts.replied > 0 && (
                              <span className="px-2 py-0.5 rounded-md font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                {item.counts.replied} replied
                              </span>
                            )}
                            {item.counts.skipped > 0 && (
                              <span className="px-2 py-0.5 rounded-md text-text-muted bg-surface-muted border border-border">
                                {item.counts.skipped} skipped
                              </span>
                            )}
                            {item.counts.dismissed && item.counts.dismissed > 0 ? (
                              <span className="px-2 py-0.5 rounded-md text-zinc-600 dark:text-zinc-400 bg-zinc-500/10 border border-zinc-500/30">
                                {item.counts.dismissed} dismissed
                              </span>
                            ) : null}
                            {item.counts.failed > 0 && (
                              <span className="px-2 py-0.5 rounded-md font-semibold bg-red-500/10 text-danger border border-red-500/30">
                                {item.counts.failed} failed
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 3: AUTO-REPLY RULES ───────────────────────────────────────── */}
      {activeTab === "rules" && (
        <div className="space-y-4">
          {rulesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-5 rounded-xl border border-border bg-surface space-y-4">
                  <Skeleton className="w-1/2 h-5" />
                  <Skeleton className="w-full h-12" />
                  <Skeleton className="w-3/4 h-8" />
                </div>
              ))}
            </div>
          ) : rules.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface p-8">
              <EmptyState
                title="No auto-reply rules created"
                description="Create rules to automatically reply to price inquiries, availability questions, and compliments on your Instagram posts."
                action={{
                  label: "Create First Rule",
                  onClick: handleOpenAddRule,
                }}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rules.map((rule, idx) => (
                <div
                  key={rule.id}
                  className={`p-5 rounded-xl border bg-surface transition-all flex flex-col justify-between space-y-4 shadow-2xs ${
                    rule.isActive
                      ? "border-border hover:border-border/90"
                      : "border-border/60 opacity-70 bg-surface-muted/30"
                  }`}
                >
                  <div>
                    {/* Priority & Master Switch */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-10 font-bold font-outfit uppercase tracking-wider bg-surface-muted border border-border text-text-muted">
                          #{idx + 1}
                        </span>
                        <h3 className="text-15 font-bold font-outfit text-text leading-tight">
                          {rule.name}
                        </h3>
                      </div>
                      <Switch
                        label={`Toggle rule ${rule.name}`}
                        checked={rule.isActive}
                        onChange={(checked) =>
                          updateRuleMutation.mutate({
                            id: rule.id,
                            body: { isActive: checked },
                          })
                        }
                      />
                    </div>

                    {/* Trigger Keywords */}
                    <div className="space-y-1 mb-2.5">
                      <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider block">
                        Keywords ({rule.keywords?.length || 0}):
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {rule.keywords && rule.keywords.length > 0 ? (
                          rule.keywords.map((k, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 rounded text-11 font-mono font-medium bg-surface-muted text-text border border-border/70"
                            >
                              {k}
                            </span>
                          ))
                        ) : (
                          <span className="text-11 text-text-muted italic">None (AI category match only)</span>
                        )}
                      </div>
                    </div>

                    {/* Trigger Categories */}
                    {rule.categories && rule.categories.length > 0 && (
                      <div className="space-y-1 mb-3">
                        <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider block">
                          AI Categories:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {rule.categories.map((c, i) => (
                            <span
                              key={i}
                              className={`px-2 py-0.5 rounded text-11 font-medium border ${
                                CATEGORY_COLORS[c] || CATEGORY_COLORS.other
                              }`}
                            >
                              {c.replace("_", " ")}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Media Scope Pill */}
                    <div className="mb-3 text-11 text-text-muted flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-text-muted" />
                      <span>
                        Scope:{" "}
                        <strong className="text-text font-medium">
                          {rule.mediaIds && rule.mediaIds.length > 0
                            ? `${rule.mediaIds.length} specific post(s)`
                            : "All posts & reels"}
                        </strong>
                      </span>
                    </div>

                    {/* Reply Texts Preview */}
                    <div className="p-3 rounded-xl border border-border/60 bg-surface-muted/60 space-y-2 text-12">
                      <div className="flex items-center justify-between text-11 text-text-muted">
                        <span className="font-semibold text-text uppercase tracking-wider text-[10px]">
                          Action:{" "}
                          <span className="text-primary font-bold">
                            {rule.replyMode === "both" && "Public Reply + DM"}
                            {rule.replyMode === "public" && "Public Reply Only"}
                            {rule.replyMode === "dm" && "Direct Message (DM) Only"}
                            {rule.replyMode === "none" && "No Reply"}
                          </span>
                        </span>
                      </div>

                      {rule.publicReplyText && (
                        <div>
                          <span className="text-[10px] uppercase font-bold text-text-muted block">
                            Public Reply:
                          </span>
                          <p className="text-text italic line-clamp-2">
                            "{rule.publicReplyText}"
                          </p>
                        </div>
                      )}

                      {rule.dmText && (
                        <div>
                          <span className="text-[10px] uppercase font-bold text-text-muted block">
                            Direct Message:
                          </span>
                          <p className="text-text italic line-clamp-2">
                            "{rule.dmText}"
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Bottom Controls (Order & Edit/Delete) */}
                  <div className="pt-3 border-t border-border/50 flex items-center justify-between text-12">
                    {/* Reorder Buttons */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={idx === 0 || reorderRulesMutation.isPending}
                        onClick={() => handleMoveRule(idx, "up")}
                        aria-label="Move rule up"
                        className="p-1 rounded hover:bg-surface-muted text-text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === rules.length - 1 || reorderRulesMutation.isPending}
                        onClick={() => handleMoveRule(idx, "down")}
                        aria-label="Move rule down"
                        className="p-1 rounded hover:bg-surface-muted text-text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleEditRule(rule)}
                        className="p-1.5 rounded-lg hover:bg-surface-muted text-text-muted hover:text-text cursor-pointer transition-colors"
                        title="Edit rule"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRuleToDelete(rule)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-text-muted hover:text-danger cursor-pointer transition-colors"
                        title="Delete rule"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── SLIDEOVER 1: COMMENT DETAIL & MANUAL REPLY ──────────────────────── */}
      <SlideOver
        open={Boolean(selectedCommentId)}
        onClose={() => {
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.delete("commentId");
            return next;
          });
        }}
        title="Comment Details"
        subtitle={selectedComment ? `@${selectedComment.commenterUsername || "user"} on Instagram` : ""}
      >
        {selectedCommentLoading || !selectedComment ? (
          <div className="p-6 space-y-4">
            <Skeleton className="w-full h-8" />
            <Skeleton className="w-full h-24" />
            <Skeleton className="w-3/4 h-12" />
          </div>
        ) : (
          <div className="p-6 space-y-6 text-13">
            {/* Post Information Card */}
            <div className="p-3.5 rounded-xl border border-border bg-surface-muted/50 flex items-start gap-3">
              {selectedComment.mediaThumbnailUrl ? (
                <img
                  src={selectedComment.mediaThumbnailUrl}
                  alt="post preview"
                  className="w-14 h-14 rounded-lg object-cover border border-border shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-lg border border-border bg-surface flex items-center justify-center shrink-0 text-text-muted">
                  <Film className="w-6 h-6" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-11 font-semibold uppercase tracking-wider text-text-muted">
                    {selectedComment.mediaType || "Instagram Post"}
                  </span>
                  {selectedComment.mediaPermalink && (
                    <a
                      href={selectedComment.mediaPermalink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-11 text-pink-600 dark:text-pink-400 hover:underline inline-flex items-center gap-1"
                    >
                      <span>View on IG</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <p className="text-12 text-text font-medium line-clamp-2 mt-0.5">
                  {selectedComment.mediaCaption || "No caption available"}
                </p>
              </div>
            </div>

            {/* Comment Thread Card */}
            <div className="space-y-3">
              <span className="text-11 font-semibold uppercase tracking-wider text-text-muted block">
                Comment Thread
              </span>
              <div className="p-4 rounded-xl border border-border bg-surface space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {selectedComment.commenterProfilePicUrl ? (
                      <img
                        src={selectedComment.commenterProfilePicUrl}
                        alt={selectedComment.commenterUsername || "user"}
                        className="w-8 h-8 rounded-full object-cover border border-border"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[#38C7D8]/20 text-[#0E7D8D] dark:text-[#67E8F9] flex items-center justify-center text-12 font-bold">
                        {(selectedComment.commenterUsername || "U")[0]?.toUpperCase()}
                      </div>
                    )}
                    <span className="font-bold text-pink-600 dark:text-pink-400">
                      @{selectedComment.commenterUsername || "user"}
                    </span>
                  </div>
                  <span className="text-11 text-text-muted">
                    {formatDateTime(selectedComment.commentedAt)}
                  </span>
                </div>
                <p className="text-14 text-text leading-relaxed">
                  "{selectedComment.text}"
                </p>

                {/* Metadata badges */}
                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/50 text-11">
                  {selectedComment.category && (
                    <span
                      className={`px-2 py-0.5 rounded font-medium border ${
                        CATEGORY_COLORS[selectedComment.category] ||
                        CATEGORY_COLORS.other
                      }`}
                    >
                      Category: {selectedComment.category}
                    </span>
                  )}
                  {selectedComment.matchedBy && (
                    <span className="px-2 py-0.5 rounded bg-surface-muted border border-border text-text-muted">
                      Matched by {selectedComment.matchedBy}
                    </span>
                  )}
                  <span
                    className={`px-2 py-0.5 rounded font-semibold ${
                      selectedComment.action === "needs_attention"
                        ? "bg-rose-500/10 text-rose-600 border border-rose-500/20"
                        : selectedComment.action === "failed"
                          ? "bg-red-500/10 text-danger border border-red-500/20"
                          : selectedComment.action === "dismissed"
                            ? "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border border-zinc-500/20"
                            : "bg-surface-muted text-text-muted border border-border"
                    }`}
                  >
                    Action: {selectedComment.action}
                  </span>
                </div>
              </div>
            </div>

            {/* Sent Replies / Error status */}
            <div className="space-y-3">
              <span className="text-11 font-semibold uppercase tracking-wider text-text-muted block">
                Execution Status
              </span>

              {selectedComment.publicReplyText && (
                <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-1">
                  <div className="flex items-center justify-between text-11 text-emerald-600 dark:text-emerald-400 font-semibold">
                    <span>Public Reply Sent</span>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                  <p className="text-12 text-text">"{selectedComment.publicReplyText}"</p>
                </div>
              )}

              {selectedComment.dmText && (
                <div className="p-3.5 rounded-xl border border-purple-500/20 bg-purple-500/5 space-y-1">
                  <div className="flex items-center justify-between text-11 text-purple-600 dark:text-purple-400 font-semibold">
                    <span>Direct Message (DM) Sent</span>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                  <p className="text-12 text-text">"{selectedComment.dmText}"</p>
                </div>
              )}

              {selectedComment.skipReason && (
                <div className="p-3.5 rounded-xl border border-border bg-surface-muted/60 text-12 text-text-muted">
                  <strong>Skipped:</strong> Reason was <em>{selectedComment.skipReason}</em>.
                </div>
              )}

              {selectedComment.error && (
                <div className="p-3.5 rounded-xl border border-red-500/20 bg-red-500/5 space-y-1">
                  <div className="flex items-center gap-1.5 text-11 font-bold text-danger">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>Error Logged</span>
                  </div>
                  <p className="text-12 text-danger font-mono break-words">
                    {selectedComment.error}
                  </p>
                </div>
              )}
            </div>

            {/* Customer & Inbox Link */}
            {selectedComment.conversationId && (
              <div className="p-4 rounded-xl border border-border bg-surface flex items-center justify-between">
                <div>
                  <span className="text-12 font-bold text-text block">
                    Inbox Conversation
                  </span>
                  <span className="text-11 text-text-muted">
                    This lead was routed to the customer inbox.
                  </span>
                </div>
                <Link
                  to={`/inbox?conversationId=${selectedComment.conversationId}`}
                  className="px-3 py-1.5 rounded-lg bg-primary hover:bg-amber-600 text-primary-foreground text-12 font-semibold inline-flex items-center gap-1 shadow-xs"
                >
                  <span>Open in Inbox</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}

            {/* Manual Reply Form (When Needs Attention or Failed or anytime) */}
            <div className="space-y-3 pt-3 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-12 font-bold text-text">
                  Manual Response
                </span>
                {selectedComment.action === "needs_attention" && (
                  <span className="px-2 py-0.5 rounded text-10 font-bold bg-rose-500/10 text-rose-600">
                    ESCALATED
                  </span>
                )}
              </div>

              {/* Mode Selector */}
              <div className="grid grid-cols-3 gap-2 text-12 font-medium">
                <button
                  type="button"
                  onClick={() => setManualMode("public")}
                  className={`py-1.5 rounded-lg border text-center transition-colors cursor-pointer ${
                    manualMode === "public"
                      ? "border-primary bg-primary/10 text-primary-text font-semibold"
                      : "border-border bg-surface-muted text-text-muted"
                  }`}
                >
                  Public Reply
                </button>
                <button
                  type="button"
                  onClick={() => setManualMode("dm")}
                  className={`py-1.5 rounded-lg border text-center transition-colors cursor-pointer ${
                    manualMode === "dm"
                      ? "border-primary bg-primary/10 text-primary-text font-semibold"
                      : "border-border bg-surface-muted text-text-muted"
                  }`}
                >
                  Send DM
                </button>
                <button
                  type="button"
                  onClick={() => setManualMode("both")}
                  className={`py-1.5 rounded-lg border text-center transition-colors cursor-pointer ${
                    manualMode === "both"
                      ? "border-primary bg-primary/10 text-primary-text font-semibold"
                      : "border-border bg-surface-muted text-text-muted"
                  }`}
                >
                  Both
                </button>
              </div>

              {/* Public text */}
              {(manualMode === "public" || manualMode === "both") && (
                <div className="space-y-1">
                  <label className="text-11 font-semibold text-text-muted uppercase">
                    Public Reply Message
                  </label>
                  <textarea
                    rows={2}
                    value={manualPublicText}
                    onChange={(e) => setManualPublicText(e.target.value)}
                    placeholder="Type public comment reply..."
                    className="w-full p-2.5 rounded-xl border border-border bg-surface-muted text-13 text-text focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              )}

              {/* DM text */}
              {(manualMode === "dm" || manualMode === "both") && (
                <div className="space-y-1">
                  <label className="text-11 font-semibold text-text-muted uppercase">
                    Direct Message (DM)
                  </label>
                  <textarea
                    rows={3}
                    value={manualDmText}
                    onChange={(e) => setManualDmText(e.target.value)}
                    placeholder="Type private message to user..."
                    className="w-full p-2.5 rounded-xl border border-border bg-surface-muted text-13 text-text focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              )}

              {/* Reply / Dismiss Action Buttons */}
              <div className="flex items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleDismissComment}
                  disabled={dismissMutation.isPending}
                  className="px-3 py-2 rounded-xl border border-border hover:bg-surface-muted text-12 font-medium text-text-muted hover:text-text cursor-pointer transition-colors"
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  onClick={handleSendManualReply}
                  disabled={manualReplyMutation.isPending}
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-amber-600 text-primary-foreground font-semibold text-12 cursor-pointer shadow-xs inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Response</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </SlideOver>

      {/* ─── SLIDEOVER 2: ADD / EDIT RULE ────────────────────────────────────── */}
      <SlideOver
        open={isRuleSlideOverOpen}
        onClose={() => setIsRuleSlideOverOpen(false)}
        title={editingRule ? "Edit Rule" : "Add Auto-Reply Rule"}
        subtitle="Configure triggers, reply modes, and scoped posts"
        widthClass="max-w-[560px]"
      >
        <div className="p-6 space-y-6 text-13 overflow-y-auto custom-scrollbar">
          {/* Rule Name */}
          <div className="space-y-1.5">
            <label className="block text-11 font-semibold uppercase tracking-wider text-text-muted">
              Rule Name *
            </label>
            <input
              type="text"
              placeholder="e.g. Ocean Tray Price Inquiries"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-border bg-surface text-13 text-text focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Trigger Keywords */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-11 font-semibold uppercase tracking-wider text-text-muted">
                Trigger Keywords
              </label>
              <span className="text-11 text-text-muted">Press Enter or comma</span>
            </div>
            <ChipsInput
              values={formKeywords}
              onChange={setFormKeywords}
              placeholder="e.g. price, cost, how much..."
            />
          </div>

          {/* Trigger Categories */}
          <div className="space-y-2">
            <label className="block text-11 font-semibold uppercase tracking-wider text-text-muted">
              AI Intent Categories
            </label>
            <p className="text-11 text-text-muted">
              Rule triggers if the AI classifies the comment into any of these categories:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => {
                const isSelected = formCategories.includes(cat.value);
                return (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setFormCategories(formCategories.filter((c) => c !== cat.value));
                      } else {
                        setFormCategories([...formCategories, cat.value]);
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg text-12 font-medium border transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary font-semibold"
                        : "bg-surface-muted text-text-muted border-border hover:text-text"
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Media Scope */}
          <div className="space-y-2">
            <label className="block text-11 font-semibold uppercase tracking-wider text-text-muted">
              Post Scope
            </label>
            <div className="grid grid-cols-2 gap-2 text-12 font-medium">
              <button
                type="button"
                onClick={() => setFormMediaScope("all")}
                className={`p-2.5 rounded-xl border text-center transition-colors cursor-pointer ${
                  formMediaScope === "all"
                    ? "border-primary bg-primary/10 text-primary-text font-semibold"
                    : "border-border bg-surface-muted text-text-muted"
                }`}
              >
                All Posts & Reels
              </button>
              <button
                type="button"
                onClick={() => setFormMediaScope("specific")}
                className={`p-2.5 rounded-xl border text-center transition-colors cursor-pointer ${
                  formMediaScope === "specific"
                    ? "border-primary bg-primary/10 text-primary-text font-semibold"
                    : "border-border bg-surface-muted text-text-muted"
                }`}
              >
                Specific Posts ({formMediaIds.length})
              </button>
            </div>

            {formMediaScope === "specific" && (
              <div className="max-h-48 overflow-y-auto space-y-1.5 p-2 rounded-xl border border-border bg-surface-muted/40 custom-scrollbar">
                {mediaList.length === 0 ? (
                  <p className="text-11 text-text-muted p-2">No media loaded.</p>
                ) : (
                  mediaList.map((m) => {
                    const isChecked = formMediaIds.includes(m.id);
                    return (
                      <label
                        key={m.id}
                        className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-surface transition-colors cursor-pointer text-12"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setFormMediaIds(formMediaIds.filter((id) => id !== m.id));
                            } else {
                              setFormMediaIds([...formMediaIds, m.id]);
                            }
                          }}
                          className="rounded text-primary focus:ring-primary"
                        />
                        {m.thumbnailUrl && (
                          <img
                            src={m.thumbnailUrl}
                            alt=""
                            className="w-7 h-7 rounded object-cover border border-border shrink-0"
                          />
                        )}
                        <span className="truncate flex-1 font-medium text-text">
                          [{m.mediaType.toUpperCase()}]{" "}
                          {m.caption ? m.caption.slice(0, 45) : m.id}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Action Reply Mode */}
          <div className="space-y-1.5">
            <label className="block text-11 font-semibold uppercase tracking-wider text-text-muted">
              Reply Mode
            </label>
            <div className="grid grid-cols-4 gap-1.5 text-11 font-medium">
              {(["both", "public", "dm", "none"] as IgReplyMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setFormReplyMode(mode)}
                  className={`py-2 rounded-xl border text-center transition-colors cursor-pointer ${
                    formReplyMode === mode
                      ? "border-primary bg-primary/10 text-primary-text font-bold"
                      : "border-border bg-surface-muted text-text-muted"
                  }`}
                >
                  {mode === "both" && "Public + DM"}
                  {mode === "public" && "Public Only"}
                  {mode === "dm" && "DM Only"}
                  {mode === "none" && "None"}
                </button>
              ))}
            </div>
          </div>

          {/* Public Reply Text */}
          {(formReplyMode === "public" || formReplyMode === "both") && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-11 font-semibold uppercase tracking-wider text-text-muted">
                  Public Comment Reply (Max 300 chars) *
                </label>
                <span
                  className={`text-11 ${
                    formPublicText.length > 300 ? "text-danger font-bold" : "text-text-muted"
                  }`}
                >
                  {formPublicText.length}/300
                </span>
              </div>
              <textarea
                rows={2}
                maxLength={300}
                value={formPublicText}
                onChange={(e) => setFormPublicText(e.target.value)}
                placeholder="Hi {customerHandle}! We sent you a DM with details 💕"
                className="w-full p-2.5 rounded-xl border border-border bg-surface text-13 text-text focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex items-center gap-1.5 text-11">
                <span className="text-text-muted">Insert variables:</span>
                <button
                  type="button"
                  onClick={() => insertVariable("public", "{customerHandle}")}
                  className="px-2 py-0.5 rounded bg-surface-muted border border-border text-primary hover:bg-surface font-mono"
                >
                  {"{customerHandle}"}
                </button>
                <button
                  type="button"
                  onClick={() => insertVariable("public", "{postTitle}")}
                  className="px-2 py-0.5 rounded bg-surface-muted border border-border text-primary hover:bg-surface font-mono"
                >
                  {"{postTitle}"}
                </button>
              </div>
            </div>
          )}

          {/* DM Text */}
          {(formReplyMode === "dm" || formReplyMode === "both") && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-11 font-semibold uppercase tracking-wider text-text-muted">
                  Direct Message Text (Max 1000 chars) *
                </label>
                <span
                  className={`text-11 ${
                    formDmText.length > 1000 ? "text-danger font-bold" : "text-text-muted"
                  }`}
                >
                  {formDmText.length}/1000
                </span>
              </div>
              <textarea
                rows={3}
                maxLength={1000}
                value={formDmText}
                onChange={(e) => setFormDmText(e.target.value)}
                placeholder="Hi {customerHandle}! Thanks for inquiring about {postTitle}..."
                className="w-full p-2.5 rounded-xl border border-border bg-surface text-13 text-text focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex items-center gap-1.5 text-11">
                <span className="text-text-muted">Insert variables:</span>
                <button
                  type="button"
                  onClick={() => insertVariable("dm", "{customerHandle}")}
                  className="px-2 py-0.5 rounded bg-surface-muted border border-border text-primary hover:bg-surface font-mono"
                >
                  {"{customerHandle}"}
                </button>
                <button
                  type="button"
                  onClick={() => insertVariable("dm", "{postTitle}")}
                  className="px-2 py-0.5 rounded bg-surface-muted border border-border text-primary hover:bg-surface font-mono"
                >
                  {"{postTitle}"}
                </button>
              </div>
            </div>
          )}

          {/* Live Interactive Rule Tester */}
          <div className="p-4 rounded-xl border border-border bg-surface-muted space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-11 font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Live Rule Tester (AI & Keyword Preview)</span>
              </span>
              {testFetching && (
                <span className="text-10 text-primary animate-pulse font-medium">
                  Testing...
                </span>
              )}
            </div>

            <input
              type="text"
              placeholder="Type sample comment (e.g. how much is this?)"
              value={testCommentText}
              onChange={(e) => setTestCommentText(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-border bg-surface text-12 text-text focus:outline-none focus:ring-1 focus:ring-primary"
            />

            {testCommentText.trim() && testResult && (
              <div className="p-3 rounded-lg border border-border bg-surface text-12 space-y-1.5">
                <div className="flex items-center justify-between text-11">
                  <span className="font-semibold text-text">
                    {testResult.matchedRule ? (
                      <span className="text-emerald-500 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Rule Matched: {testResult.matchedRule.name}</span>
                      </span>
                    ) : (
                      <span className="text-text-muted">✕ No rule matched (will be skipped)</span>
                    )}
                  </span>
                  {testResult.category && (
                    <span className="px-2 py-0.5 rounded text-[10px] bg-surface-muted border border-border font-medium">
                      Category: {testResult.category}
                    </span>
                  )}
                </div>

                {testResult.matchedRule && (
                  <div className="text-11 space-y-1 pt-1 border-t border-border/50">
                    <p className="text-text-muted">
                      Matched by: <strong>{testResult.matchedBy}</strong>
                    </p>
                    {testResult.publicPreview && (
                      <p className="text-text">
                        <strong>Public Preview:</strong> "{testResult.publicPreview}"
                      </p>
                    )}
                    {testResult.dmPreview && (
                      <p className="text-text">
                        <strong>DM Preview:</strong> "{testResult.dmPreview}"
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Save / Cancel */}
          <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsRuleSlideOverOpen(false)}
              className="px-4 py-2 rounded-xl border border-border bg-surface hover:bg-surface-muted text-13 font-medium text-text cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveRule}
              disabled={createRuleMutation.isPending || updateRuleMutation.isPending}
              className="px-5 py-2 rounded-xl bg-primary hover:bg-amber-600 text-primary-foreground font-semibold text-13 cursor-pointer shadow-xs disabled:opacity-50"
            >
              {editingRule ? "Save Changes" : "Create Rule"}
            </button>
          </div>
        </div>
      </SlideOver>

      {/* ─── MODAL: SIMULATE INCOMING COMMENT (DEMO_MODE) ────────────────────── */}
      {isSimulateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-surface border border-border p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div className="flex items-center gap-2">
                <Play className="w-5 h-5 text-pink-500" />
                <h3 className="text-16 font-bold font-outfit text-text">
                  Simulate Instagram Comment
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSimulateModalOpen(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-12 text-text-muted">
              Sends an event through the webhook processor, matches against your rules, creates DMs in your Inbox, and sends real-time updates.
            </p>

            <div className="space-y-3 text-12">
              <div>
                <label className="block font-semibold text-text mb-1">
                  Commenter Username
                </label>
                <input
                  type="text"
                  value={simUsername}
                  onChange={(e) => setSimUsername(e.target.value)}
                  placeholder="e.g. art_lover_99"
                  className="w-full p-2.5 rounded-xl border border-border bg-surface-muted text-13 text-text"
                />
              </div>

              <div>
                <label className="block font-semibold text-text mb-1">
                  Comment Text
                </label>
                <textarea
                  rows={2}
                  value={simText}
                  onChange={(e) => setSimText(e.target.value)}
                  placeholder="e.g. How much is this tray?"
                  className="w-full p-2.5 rounded-xl border border-border bg-surface-muted text-13 text-text"
                />
              </div>

              <div>
                <label className="block font-semibold text-text mb-1">
                  Attach to Post / Reel (optional)
                </label>
                <div className="relative">
                  <select
                    value={simMediaId}
                    onChange={(e) => setSimMediaId(e.target.value)}
                    className="w-full p-2 pl-3 pr-8 rounded-xl border border-border bg-surface-muted text-12 text-text appearance-none cursor-pointer"
                  >
                    <option value="">Default demo post</option>
                    {mediaList.map((m) => (
                      <option key={m.id} value={m.id}>
                        [{m.mediaType.toUpperCase()}] {m.caption ? m.caption.slice(0, 40) : m.id}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" aria-hidden />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsSimulateModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-border text-12 font-medium text-text hover:bg-surface-muted cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRunSimulation}
                disabled={simulateMutation.isPending}
                className="px-5 py-2 rounded-xl bg-primary hover:bg-[#2BAFC0] text-primary-foreground font-semibold text-12 cursor-pointer shadow-xs disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Simulate</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── CONFIRM DIALOG: DELETE RULE ─────────────────────────────────────── */}
      <ConfirmDialog
        isOpen={Boolean(ruleToDelete)}
        onClose={() => setRuleToDelete(null)}
        onConfirm={handleDeleteRuleConfirm}
        title="Delete Auto-Reply Rule"
        description={`Are you sure you want to delete the rule "${ruleToDelete?.name}"? Comments will no longer match this rule.`}
        confirmLabel="Delete Rule"
        tone="danger"
      />
    </div>
  );
}