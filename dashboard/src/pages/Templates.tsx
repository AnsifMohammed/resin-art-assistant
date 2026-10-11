import { useState, useMemo } from "react";
import {
  Plus,
  Search,
  Copy,
  Trash2,
  Edit,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ChannelIcon } from "../components/shared/ChannelIcon.tsx";
import { SampleDataBadge } from "../components/shared/SampleDataBadge.tsx";
import {
  mockTemplates,
  type Template,
} from "../data/mockData.ts";

const AUTOCOMPLETE_VARS = [
  "{customerName}",
  "{product}",
  "{trackingId}",
  "{deliveryDate}",
  "{amount}",
  "{eventName}",
];

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>(mockTemplates);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // SlideOver state
  const [isSlideOverOpen, setIsSlideOverOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  // Form states
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState<Template["category"]>("general");
  const [formChannel, setFormChannel] = useState<Template["channel"]>("whatsapp");
  const [formBody, setFormBody] = useState("");
  const [previewChannel, setPreviewChannel] = useState<"whatsapp" | "instagram">("whatsapp");

  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      if (activeCategory !== "all" && t.category !== activeCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          t.name.toLowerCase().includes(q) ||
          t.body.toLowerCase().includes(q) ||
          t.variables.some((v) => v.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [templates, activeCategory, searchQuery]);

  const handleOpenNew = () => {
    setEditingTemplate(null);
    setFormName("");
    setFormCategory("general");
    setFormChannel("whatsapp");
    setFormBody("Hi {customerName}! ");
    setPreviewChannel("whatsapp");
    setIsSlideOverOpen(true);
  };

  const handleEdit = (t: Template) => {
    setEditingTemplate(t);
    setFormName(t.name);
    setFormCategory(t.category);
    setFormChannel(t.channel);
    setFormBody(t.body);
    setPreviewChannel(t.channel === "both" ? "whatsapp" : t.channel);
    setIsSlideOverOpen(true);
  };

  const handleDuplicate = (t: Template) => {
    const dup: Template = {
      ...t,
      id: `tmpl-${Date.now()}`,
      name: `${t.name} (Copy)`,
      lastUpdated: "Just now",
    };
    setTemplates((prev) => [dup, ...prev]);
    toast.success("Template duplicated", { description: dup.name });
  };

  const handleDelete = (id: string, name: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    toast.success("Template deleted", { description: name });
  };

  const handleSave = () => {
    if (!formName.trim() || !formBody.trim()) {
      toast.error("Please provide both a template name and body text");
      return;
    }

    // Extract variables used
    const varsMatched = formBody.match(/{[a-zA-Z0-9_]+}/g) || [];
    const uniqueVars = Array.from(new Set(varsMatched));

    if (editingTemplate) {
      setTemplates((prev) =>
        prev.map((t) =>
          t.id === editingTemplate.id
            ? {
                ...t,
                name: formName.trim(),
                category: formCategory,
                channel: formChannel,
                body: formBody.trim(),
                variables: uniqueVars,
                lastUpdated: "Just now",
              }
            : t
        )
      );
      toast.success("Template updated", { description: formName });
    } else {
      const newT: Template = {
        id: `tmpl-${Date.now()}`,
        name: formName.trim(),
        category: formCategory,
        channel: formChannel,
        body: formBody.trim(),
        variables: uniqueVars,
        lastUpdated: "Just now",
      };
      setTemplates((prev) => [newT, ...prev]);
      toast.success("Template created", { description: formName });
    }

    setIsSlideOverOpen(false);
  };

  // Helper to render body with amber chips for {variables}
  const renderBodyWithChips = (body: string) => {
    const parts = body.split(/({[a-zA-Z0-9_]+})/g);
    return parts.map((part, i) => {
      if (part.startsWith("{") && part.endsWith("}")) {
        return (
          <span
            key={i}
            className="inline-block px-1.5 py-0.2 mx-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 font-mono text-11 font-semibold"
          >
            {part}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="space-y-6 pb-12 w-full">
      {/* ─── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-24 md:text-28 font-bold font-outfit text-text tracking-tight flex items-center gap-2">
            <span>Response Templates</span>
            <span className="px-2 py-0.5 rounded-full text-12 font-bold bg-primary/10 text-primary-text">
              {templates.length} templates
            </span>
            <SampleDataBadge title="Templates using local pre-loaded sample snippets" />
          </h1>
          <p className="text-13 text-text-muted mt-0.5">
            Pre-approved messaging snippets with auto-fill variables for WhatsApp and Instagram
          </p>
        </div>

        <button
          onClick={handleOpenNew}
          className="px-4 py-2 rounded-xl bg-primary hover:bg-amber-600 text-primary-foreground text-13 font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Template</span>
        </button>
      </div>

      {/* ─── Category Tabs & Search ───────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-xl border border-border bg-surface">
        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 text-12 font-medium">
          {[
            { key: "all", label: "All" },
            { key: "delivery", label: "Delivery" },
            { key: "festive", label: "Festive" },
            { key: "custom_order", label: "Custom Order" },
            { key: "general", label: "General" },
          ].map((cat) => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`px-3 py-1.5 rounded-lg transition-colors shrink-0 cursor-pointer ${
                activeCategory === cat.key
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-surface-muted text-text-muted hover:text-text"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[240px]">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search templates & variables..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3.5 py-1.5 rounded-lg border border-border bg-surface-muted text-12 text-text focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* ─── Template Cards Grid ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTemplates.map((t) => (
          <div
            key={t.id}
            className="p-5 rounded-xl border border-border bg-surface hover:border-border/80 hover:shadow-md transition-all flex flex-col justify-between space-y-4"
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="text-15 font-bold font-outfit text-text">{t.name}</h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-11 font-medium bg-surface-muted text-text-muted border border-border/60 capitalize">
                  {t.channel !== "both" ? (
                    <ChannelIcon channel={t.channel as any} size={11} />
                  ) : null}
                  <span>{t.channel}</span>
                </span>
              </div>

              {/* Body Text with Amber Chips */}
              <div className="p-3 rounded-lg border border-border/50 bg-surface-muted/60 text-12 text-text leading-relaxed">
                {renderBodyWithChips(t.body)}
              </div>

              {/* Variables Used */}
              {t.variables.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1 items-center">
                  <span className="text-[11px] text-text-muted mr-1">Variables:</span>
                  {t.variables.map((v, i) => (
                    <span
                      key={i}
                      className="px-1.5 py-0.2 rounded text-[10px] font-mono font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    >
                      {v}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="pt-3 border-t border-border/40 flex items-center justify-between text-12 text-text-muted">
              <span className="text-11">Updated: {t.lastUpdated}</span>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleDuplicate(t)}
                  className="p-1.5 rounded-lg hover:bg-surface-muted hover:text-text cursor-pointer transition-colors"
                  title="Duplicate template"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleEdit(t)}
                  className="p-1.5 rounded-lg hover:bg-surface-muted hover:text-text cursor-pointer transition-colors"
                  title="Edit template"
                >
                  <Edit className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(t.id, t.name)}
                  className="p-1.5 rounded-lg hover:bg-red-500/10 hover:text-danger cursor-pointer transition-colors"
                  title="Delete template"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── SlideOver Editor (New / Edit) ─────────────────────────────────────── */}
      {isSlideOverOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg bg-surface border-l border-border h-full shadow-2xl p-6 overflow-y-auto space-y-6 custom-scrollbar animate-in slide-in-from-right">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-18 font-bold font-outfit text-text">
                {editingTemplate ? "Edit Template" : "New Response Template"}
              </h3>
              <button
                onClick={() => setIsSlideOverOpen(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Name */}
            <div>
              <label className="block text-12 font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                Template Name
              </label>
              <input
                type="text"
                placeholder="e.g. Order Confirmed, Festive Pongal"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-border bg-surface-muted text-13 text-text focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Category & Channel */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-12 font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                  Category
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value as any)}
                  className="w-full p-2.5 rounded-xl border border-border bg-surface-muted text-12 text-text font-medium cursor-pointer"
                >
                  <option value="delivery">Delivery</option>
                  <option value="festive">Festive</option>
                  <option value="custom_order">Custom order</option>
                  <option value="general">General</option>
                </select>
              </div>

              <div>
                <label className="block text-12 font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                  Channel
                </label>
                <select
                  value={formChannel}
                  onChange={(e) => {
                    const ch = e.target.value as any;
                    setFormChannel(ch);
                    setPreviewChannel(ch === "both" ? "whatsapp" : ch);
                  }}
                  className="w-full p-2.5 rounded-xl border border-border bg-surface-muted text-12 text-text font-medium cursor-pointer"
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="instagram">Instagram</option>
                  <option value="both">Both Channels</option>
                </select>
              </div>
            </div>

            {/* Body Editor with Autocomplete helper */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-12 font-semibold uppercase tracking-wider text-text-muted">
                  Message Body
                </label>
                <span className="text-11 text-text-muted tabular-nums">
                  {formBody.length} characters
                </span>
              </div>

              <textarea
                rows={5}
                value={formBody}
                onChange={(e) => setFormBody(e.target.value)}
                placeholder="Type message text... (e.g. Hi {customerName}! Your order is on the way.)"
                className="w-full p-3 rounded-xl border border-border bg-surface-muted text-13 text-text font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary"
              />

              {/* Variable Quick-insert Pills */}
              <div className="space-y-1">
                <span className="text-[11px] text-text-muted block">Click to insert variable:</span>
                <div className="flex flex-wrap gap-1.5">
                  {AUTOCOMPLETE_VARS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setFormBody((prev) => `${prev}${v} `)}
                      className="px-2 py-0.5 rounded text-11 font-mono font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors cursor-pointer"
                    >
                      +{v}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Live WhatsApp vs Instagram Preview */}
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-12 font-semibold uppercase tracking-wider text-text-muted">
                  Live Style Preview
                </span>
                <div className="flex items-center rounded-lg border border-border bg-surface p-0.5 text-11 font-medium">
                  <button
                    type="button"
                    onClick={() => setPreviewChannel("whatsapp")}
                    className={`px-2 py-0.5 rounded-md cursor-pointer ${
                      previewChannel === "whatsapp" ? "bg-emerald-500/15 text-emerald-600 font-bold" : "text-text-muted"
                    }`}
                  >
                    WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewChannel("instagram")}
                    className={`px-2 py-0.5 rounded-md cursor-pointer ${
                      previewChannel === "instagram" ? "bg-pink-500/15 text-pink-600 font-bold" : "text-text-muted"
                    }`}
                  >
                    Instagram
                  </button>
                </div>
              </div>

              <div
                className={`p-4 rounded-xl border ${
                  previewChannel === "whatsapp"
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-pink-500/30 bg-pink-500/5"
                }`}
              >
                <div className="p-3 rounded-xl bg-surface border border-border text-13 text-text leading-relaxed shadow-xs">
                  {renderBodyWithChips(formBody || "Hi {customerName}...")}
                </div>
              </div>
            </div>

            {/* Save Buttons */}
            <div className="pt-4 border-t border-border flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsSlideOverOpen(false)}
                className="px-4 py-2 rounded-xl border border-border bg-surface hover:bg-surface-muted text-13 font-medium text-text cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-5 py-2 rounded-xl bg-primary hover:bg-amber-600 text-primary-foreground font-semibold text-13 cursor-pointer shadow-xs"
              >
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
