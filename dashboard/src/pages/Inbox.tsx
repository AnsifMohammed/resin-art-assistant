import { useState, useMemo, useEffect, useRef, type KeyboardEvent } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Search,
  CheckCircle2,
  AlertTriangle,
  Bot,
  UserCheck,
  PauseCircle,
  PlayCircle,
  Paperclip,
  Send,
  Sparkles,
  ChevronDown,
  Star,
  Clock,
  X,
  FileText,
  Check,
  CheckCheck,
  PanelRightClose,
  PanelRightOpen,
  Filter,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext.tsx";
import { ChannelIcon } from "../components/shared/ChannelIcon.tsx";
import {
  mockConversations,
  mockCustomers,
  mockTemplates,
  mockOrders,
  type Conversation,
  type Message,
  type Template,
} from "../data/mockData.ts";

type FilterState = "all" | "unread" | "ai_active" | "escalated" | "owner_handling" | "paused";

export default function Inbox() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const selectedConvId = searchParams.get("c") || mockConversations[0]?.id;
  const channelParam = searchParams.get("channel");

  // Mobile responsive view: either shows conversation list or chat pane
  const [mobileView, setMobileView] = useState<"list" | "chat">(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      return searchParams.has("c") ? "chat" : "list";
    }
    return "list";
  });

  const [conversations, setConversations] = useState<Conversation[]>(mockConversations);
  const [filterState, setFilterState] = useState<FilterState>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [messageText, setMessageText] = useState("");
  const [showWhyId, setShowWhyId] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  // Default customer panel open only on xl+ screens (>= 1280px) to prevent crushing chat on tablet/mobile
  const [showCustomerPanel, setShowCustomerPanel] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth >= 1280;
    }
    return false;
  });
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const [showResolveModal, setShowResolveModal] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeConv = useMemo(() => {
    return conversations.find((c) => c.id === selectedConvId) || conversations[0];
  }, [conversations, selectedConvId]);

  const activeCustomer = useMemo(() => {
    if (!activeConv) return null;
    return (
      mockCustomers.find((c) => c.id === activeConv.customerId) || {
        id: activeConv.customerId,
        name: activeConv.customerName,
        channel: activeConv.channel,
        handleOrPhone: activeConv.customerHandle,
        city: "Coimbatore, Tamil Nadu",
        avatarColor: "#F59E0B",
        isFavourite: activeConv.isFavourite,
        isPriority: activeConv.isPriority,
        isRecentOrder: false,
        isNew: false,
        totalSpend: 4200,
        ordersCount: 2,
        lastActive: "Just now",
        notes: "Likes ocean teal finish with gold leaf accents.",
      }
    );
  }, [activeConv]);

  const customerOrders = useMemo(() => {
    if (!activeCustomer) return [];
    return mockOrders.filter((o) => o.customerId === activeCustomer.id);
  }, [activeCustomer]);

  const filteredConversations = useMemo(() => {
    return conversations
      .filter((c) => {
        if (channelParam && channelParam !== "all" && c.channel !== channelParam) {
          return false;
        }
        if (filterState === "unread" && !c.unread) return false;
        if (filterState === "ai_active" && c.state !== "ai_active") return false;
        if (filterState === "escalated" && c.state !== "escalated") return false;
        if (filterState === "owner_handling" && c.state !== "owner_handling") return false;
        if (filterState === "paused" && c.state !== "paused") return false;

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          return (
            c.customerName.toLowerCase().includes(q) ||
            c.lastMessage.toLowerCase().includes(q) ||
            c.customerHandle.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        if (a.isPriority && !b.isPriority) return -1;
        if (!a.isPriority && b.isPriority) return 1;
        return 0;
      });
  }, [conversations, filterState, channelParam, searchQuery]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConv?.messages.length, activeConv?.id]);

  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const currentIndex = filteredConversations.findIndex((c) => c.id === activeConv?.id);
        if (currentIndex < filteredConversations.length - 1) {
          const next = filteredConversations[currentIndex + 1];
          if (next) selectConversation(next.id);
        }
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const currentIndex = filteredConversations.findIndex((c) => c.id === activeConv?.id);
        if (currentIndex > 0) {
          const prev = filteredConversations[currentIndex - 1];
          if (prev) selectConversation(prev.id);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredConversations, activeConv?.id]);

  const selectConversation = (id: string) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("c", id);
      return p;
    });
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unread: false } : c))
    );
    setMobileView("chat");
  };

  const handleSendMessage = () => {
    if (!messageText.trim() || !activeConv) return;
    const newMsg: Message = {
      id: `msg-${Date.now()}`,
      sender: user?.role === "admin" ? "owner" : "staff",
      senderName: user?.name || "Asha",
      text: messageText.trim(),
      timestamp: "Just now",
      status: "delivered",
    };

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === activeConv.id) {
          return {
            ...c,
            state: "owner_handling",
            lastMessage: messageText.trim(),
            lastMessageTime: "Just now",
            messages: [...c.messages, newMsg],
          };
        }
        return c;
      })
    );

    setMessageText("");
    toast.success("Reply sent", { description: `To ${activeConv.customerName}` });
  };

  const handleKeyDownComposer = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleResolve = () => {
    if (!activeConv) return;
    const systemMsg: Message = {
      id: `msg-${Date.now()}`,
      sender: "system",
      text: `${user?.name || "Asha"} marked this conversation resolved. AI automated assistant resumed.`,
      timestamp: "Just now",
    };

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === activeConv.id) {
          const copy = { ...c };
          delete copy.escalationReason;
          return {
            ...copy,
            state: "ai_active",
            messages: [...copy.messages, systemMsg],
          };
        }
        return c;
      })
    );
    setShowResolveModal(false);
    toast.success("Conversation resolved", { description: "Handed back to Saba Art AI" });
  };

  const togglePauseAI = () => {
    if (!activeConv) return;
    const willPause = activeConv.state !== "paused";
    const systemMsg: Message = {
      id: `msg-${Date.now()}`,
      sender: "system",
      text: willPause
        ? `${user?.name || "Asha"} paused AI automation for this conversation.`
        : `${user?.name || "Asha"} resumed AI automation for this conversation.`,
      timestamp: "Just now",
    };

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === activeConv.id) {
          return {
            ...c,
            state: willPause ? "paused" : "ai_active",
            messages: [...c.messages, systemMsg],
          };
        }
        return c;
      })
    );
    toast.info(willPause ? "AI paused for this chat" : "AI resumed for this chat");
  };

  const insertTemplate = (t: Template) => {
    let body = t.body;
    if (activeCustomer) {
      body = body.replace(/{customerName}/g, activeCustomer.name);
      body = body.replace(/{product}/g, "Ocean Resin Coaster Set");
      body = body.replace(/{trackingId}/g, "DTDC-COIM-9821");
      body = body.replace(/{deliveryDate}/g, "Wednesday, 14 Oct");
      body = body.replace(/{amount}/g, "1,450");
    }
    setMessageText(body);
    setShowTemplatePicker(false);
    textareaRef.current?.focus();
    toast.success("Template inserted", { description: t.name });
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-bg relative">
      {/* ─── Pane 1: Conversation List (Responsive width) ─────────────────────────── */}
      <div
        className={`${mobileView === "list" ? "flex" : "hidden md:flex"
          } w-full md:w-[300px] lg:w-[320px] xl:w-[340px] shrink-0 border-r border-border bg-surface flex-col h-full z-10`}
      >
        <div className="p-3 sm:p-3.5 border-b border-border/70 space-y-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Search conversations... (J/K to move)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-1.5 rounded-lg border border-border bg-surface-muted text-13 text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 text-12 font-medium">
            <button
              onClick={() => setFilterState("all")}
              className={`px-2.5 py-1 rounded-md transition-colors shrink-0 cursor-pointer ${filterState === "all"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-surface-muted text-text-muted hover:text-text"
                }`}
            >
              All ({conversations.length})
            </button>
            <button
              onClick={() => setFilterState("unread")}
              className={`px-2.5 py-1 rounded-md transition-colors shrink-0 cursor-pointer ${filterState === "unread"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-surface-muted text-text-muted hover:text-text"
                }`}
            >
              Unread
            </button>
            <button
              onClick={() => setFilterState("ai_active")}
              className={`px-2.5 py-1 rounded-md transition-colors shrink-0 cursor-pointer ${filterState === "ai_active"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-surface-muted text-text-muted hover:text-text"
                }`}
            >
              AI active
            </button>
            <button
              onClick={() => setFilterState("escalated")}
              className={`px-2.5 py-1 rounded-md transition-colors shrink-0 cursor-pointer ${filterState === "escalated"
                  ? "bg-danger text-white font-semibold"
                  : "bg-surface-muted text-danger hover:bg-danger/10"
                }`}
            >
              Escalated
            </button>
            <button
              onClick={() => setFilterState("owner_handling")}
              className={`px-2.5 py-1 rounded-md transition-colors shrink-0 cursor-pointer ${filterState === "owner_handling"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-surface-muted text-text-muted hover:text-text"
                }`}
            >
              Human handling
            </button>
            <button
              onClick={() => setFilterState("paused")}
              className={`px-2.5 py-1 rounded-md transition-colors shrink-0 cursor-pointer ${filterState === "paused"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-surface-muted text-text-muted hover:text-text"
                }`}
            >
              Paused
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-border/40">
          {filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-text-muted">
              <Filter className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-13 font-medium text-text">No conversations found</p>
              <p className="text-11 mt-1">Try clearing filters or search query</p>
            </div>
          ) : (
            filteredConversations.map((c) => {
              const isSelected = c.id === activeConv?.id;
              return (
                <div
                  key={c.id}
                  onClick={() => selectConversation(c.id)}
                  className={`p-3.5 transition-all cursor-pointer relative ${isSelected
                    ? "bg-primary/10 border-l-4 border-l-primary"
                    : c.isPriority
                      ? "border-l-4 border-l-red-500 bg-surface hover:bg-surface-muted"
                      : "border-l-4 border-l-transparent bg-surface hover:bg-surface-muted"
                    }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="relative">
                        <div className="w-8 h-8 rounded-full bg-surface-muted border border-border flex items-center justify-center font-bold text-12 font-outfit text-text shrink-0">
                          {c.customerName[0]}
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5">
                          <ChannelIcon channel={c.channel} size={12} />
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-13 font-semibold text-text truncate">
                            {c.customerName}
                          </span>
                          {c.isFavourite && (
                            <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
                          )}
                          {c.isPriority && (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-1 py-0.2 rounded bg-red-500/15 text-red-500 shrink-0">
                              Priority
                            </span>
                          )}
                        </div>
                        <p className="text-11 text-text-muted truncate">
                          {c.customerHandle}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-11 text-text-muted">{c.lastMessageTime}</span>
                      {c.unread && (
                        <div className="w-2 h-2 rounded-full bg-primary ml-auto mt-1" />
                      )}
                    </div>
                  </div>

                  <p className="text-12 text-text-muted line-clamp-1 mt-1 pl-10">
                    {c.lastMessage}
                  </p>

                  <div className="flex items-center gap-1.5 mt-2 pl-10 text-[11px]">
                    {c.state === "ai_active" && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-600 dark:text-violet-400 font-medium">
                        <Bot className="w-3 h-3" /> AI active
                      </span>
                    )}
                    {c.state === "escalated" && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400 font-medium">
                        <AlertTriangle className="w-3 h-3" /> Escalated
                      </span>
                    )}
                    {c.state === "owner_handling" && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                        <UserCheck className="w-3 h-3" /> Human
                      </span>
                    )}
                    {c.state === "paused" && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-muted text-text-muted font-medium">
                        <PauseCircle className="w-3 h-3" /> Paused
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ─── Pane 2: Middle Chat Area (Flex-1) ─────────────────────────────────── */}
      <div
        className={`${mobileView === "chat" ? "flex" : "hidden md:flex"
          } flex-1 flex-col h-full bg-surface-muted/30 min-w-0 relative`}
      >
        {activeConv ? (
          <div className="p-3 sm:p-3.5 border-b border-border bg-surface flex items-center justify-between gap-2 sm:gap-3 shrink-0">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              {/* Back to conversations button on mobile */}
              <button
                type="button"
                onClick={() => setMobileView("list")}
                className="md:hidden p-1.5 -ml-1 rounded-lg text-text-muted hover:text-text hover:bg-surface-muted transition shrink-0 cursor-pointer"
                title="Back to conversations"
                aria-label="Back to conversations"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-13 sm:text-14 font-outfit text-primary-text shrink-0">
                {activeConv.customerName[0]}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <h2 className="text-14 sm:text-15 font-semibold text-text truncate">
                    {activeConv.customerName}
                  </h2>
                  <ChannelIcon channel={activeConv.channel} size={14} className="shrink-0" />
                  {activeConv.state === "escalated" && (
                    <span className="px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-11 font-medium bg-red-500/10 text-red-600 dark:text-red-400 shrink-0">
                      <span className="hidden sm:inline">Escalated: {activeConv.escalationReason || "Human requested"}</span>
                      <span className="sm:hidden">Escalated</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-11 text-text-muted mt-0.5 truncate">
                  <span className="truncate">{activeConv.customerHandle}</span>
                  <span className="hidden xs:inline">·</span>
                  <span className="hidden xs:flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium shrink-0">
                    <Clock className="w-3 h-3" /> 24h window: 18h
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={togglePauseAI}
                className="px-2 sm:px-2.5 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-muted text-xs font-medium text-text flex items-center gap-1 sm:gap-1.5 transition-colors cursor-pointer"
                title="Pause or resume AI automation for this customer"
              >
                {activeConv.state === "paused" ? (
                  <>
                    <PlayCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="hidden sm:inline">Resume AI</span>
                  </>
                ) : (
                  <>
                    <PauseCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span className="hidden sm:inline">Pause AI</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowResolveModal(true)}
                className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium flex items-center gap-1 sm:gap-1.5 transition-colors shadow-xs cursor-pointer"
                title="Mark conversation resolved"
              >
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Mark resolved</span>
                <span className="sm:hidden">Resolve</span>
              </button>

              <button
                type="button"
                onClick={() => setShowCustomerPanel(!showCustomerPanel)}
                className={`p-1.5 rounded-lg border border-border transition-colors cursor-pointer ${showCustomerPanel ? "bg-surface-muted text-text ring-1 ring-primary/20" : "bg-surface text-text-muted hover:text-text"
                  }`}
                title="Toggle customer details panel"
                aria-label="Toggle customer details panel"
              >
                {showCustomerPanel ? (
                  <PanelRightClose className="w-4 h-4" />
                ) : (
                  <PanelRightOpen className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 custom-scrollbar">
          <div className="sticky top-0 z-10 flex justify-center mb-4">
            <span className="px-3 py-1 rounded-full bg-surface border border-border text-11 font-medium text-text-muted shadow-xs">
              Today · Coimbatore, TN
            </span>
          </div>

          {activeConv?.messages.map((m) => {
            const isCustomer = m.sender === "customer";
            const isAI = m.sender === "ai";
            const isSystem = m.sender === "system";

            if (isSystem) {
              return (
                <div key={m.id} className="text-center my-3">
                  <span className="inline-block px-3 py-1 rounded-md bg-surface-muted border border-border/40 text-11 text-text-muted">
                    {m.text}
                  </span>
                </div>
              );
            }

            return (
              <div
                key={m.id}
                className={`flex flex-col ${isCustomer ? "items-start" : "items-end"} space-y-1`}
              >
                <div className="flex items-center gap-1.5 text-11 text-text-muted px-1">
                  <span>{m.senderName || (isCustomer ? activeConv.customerName : "Asha")}</span>
                  <span>·</span>
                  <span>{m.timestamp}</span>
                  {isAI && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-violet-500/15 text-violet-500">
                      <Bot className="w-2.5 h-2.5" /> AI
                    </span>
                  )}
                </div>

                <div
                  className={`max-w-[85%] sm:max-w-[78%] md:max-w-[65%] rounded-2xl p-3 sm:p-3.5 shadow-xs text-13 leading-relaxed relative ${isCustomer
                    ? "bg-surface border border-border text-text rounded-tl-sm"
                    : isAI
                      ? "bg-gradient-to-br from-violet-600/90 to-violet-700 text-white rounded-tr-sm"
                      : "bg-primary text-primary-foreground rounded-tr-sm font-medium"
                    }`}
                >
                  <p className="whitespace-pre-wrap">{m.text}</p>

                  {isAI && m.aiReasoning && (
                    <div className="mt-2.5 pt-2 border-t border-white/20 text-11">
                      <button
                        onClick={() => setShowWhyId(showWhyId === m.id ? null : m.id)}
                        className="inline-flex items-center gap-1 font-semibold text-white/90 hover:text-white transition-colors cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>AI reasoning: {m.aiReasoning.intent}</span>
                        <ChevronDown
                          className={`w-3 h-3 transition-transform ${showWhyId === m.id ? "rotate-180" : ""
                            }`}
                        />
                      </button>

                      {showWhyId === m.id && (
                        <div className="mt-2 p-2 rounded-lg bg-black/20 text-white/90 space-y-1.5">
                          <p className="font-semibold text-white text-[10px] uppercase tracking-wider">
                            Knowledge facts used:
                          </p>
                          <ul className="list-disc list-inside space-y-0.5 text-10 text-white/80">
                            {m.aiReasoning.facts.map((f, idx) => (
                              <li key={idx}>{f}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {!isCustomer && (
                    <div className="flex justify-end items-center gap-0.5 mt-1 text-10 text-white/70">
                      {m.status === "read" ? (
                        <CheckCheck className="w-3.5 h-3.5 text-emerald-300" />
                      ) : m.status === "delivered" ? (
                        <CheckCheck className="w-3.5 h-3.5" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {isTyping && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-surface border border-border w-fit text-text-muted text-12">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:0.2s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:0.4s]" />
              </div>
              <span className="text-11">{activeConv?.customerName} is typing...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="p-3.5 border-t border-border bg-surface shrink-0">
          <div className="rounded-xl border border-border bg-surface-muted p-2 focus-within:ring-2 focus-within:ring-primary focus-within:bg-surface transition-all">
            <textarea
              ref={textareaRef}
              rows={2}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={handleKeyDownComposer}
              placeholder={`Reply to ${activeConv?.customerName || "customer"}... (⌘+Enter to send)`}
              className="w-full bg-transparent resize-none border-none text-13 text-text placeholder:text-text-muted focus:outline-none"
            />

            <div className="flex items-center justify-between pt-2 border-t border-border/40 text-12 gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => setShowTemplatePicker(true)}
                  className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg bg-surface border border-border/80 hover:bg-surface-muted text-text font-medium transition-colors cursor-pointer shrink-0 text-11 sm:text-12"
                >
                  <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="hidden sm:inline">Use template</span>
                  <span className="sm:hidden">Template</span>
                </button>

                <button
                  type="button"
                  onClick={() => toast.info("Image attachment dialog simulated")}
                  className="p-1 sm:p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface transition-colors cursor-pointer shrink-0"
                  title="Attach reference image or catalogue item"
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setIsTyping(!isTyping)}
                  className="text-11 text-text-muted hover:underline cursor-pointer hidden md:inline truncate"
                >
                  {isTyping ? "Stop typing" : "Simulate customer typing"}
                </button>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-11 text-text-muted hidden lg:inline">⌘+Enter</span>
                <button
                  type="button"
                  onClick={handleSendMessage}
                  disabled={!messageText.trim()}
                  className="px-3 sm:px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold text-12 inline-flex items-center gap-1.5 hover:bg-amber-600 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs shrink-0"
                >
                  <span>Send</span>
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Pane 3: Collapsible Customer Profile Panel ─────────────────────────── */}
      {showCustomerPanel && activeCustomer && (
        <>
          {/* Backdrop on screens < xl to allow full width for chat */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 xl:hidden animate-in fade-in duration-200"
            onClick={() => setShowCustomerPanel(false)}
            aria-hidden="true"
          />

          <aside
            className="fixed inset-y-0 right-0 z-50 w-full sm:w-[340px] max-w-[88vw] xl:relative xl:inset-auto xl:z-auto xl:w-[300px] 2xl:w-[320px] shrink-0 border-l border-border bg-surface flex flex-col h-full overflow-y-auto custom-scrollbar p-4 space-y-4 shadow-2xl xl:shadow-none animate-in slide-in-from-right duration-200"
            aria-label="Customer Profile"
          >
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <h3 className="text-14 font-semibold font-outfit text-text">Customer Profile</h3>
              <button
                type="button"
                onClick={() => setShowCustomerPanel(false)}
                className="p-1 rounded-md text-text-muted hover:text-text hover:bg-surface-muted cursor-pointer"
                aria-label="Close customer profile"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-center p-3 rounded-xl border border-border/60 bg-surface-muted">
              <div className="w-14 h-14 rounded-full bg-primary/20 border-2 border-primary mx-auto flex items-center justify-center font-bold text-20 font-outfit text-primary-text mb-2">
                {activeCustomer.name[0]}
              </div>
              <h4 className="text-15 font-bold font-outfit text-text">{activeCustomer.name}</h4>
              <div className="flex items-center justify-center gap-1 text-12 text-text-muted mt-0.5">
                <ChannelIcon channel={activeCustomer.channel} size={12} />
                <span>{activeCustomer.handleOrPhone}</span>
              </div>
              <p className="text-11 text-text-muted mt-1">{activeCustomer.city}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="p-2.5 rounded-lg border border-border/60 bg-surface-muted">
                <p className="text-11 text-text-muted font-medium">Total Spend</p>
                <p className="text-16 font-bold font-outfit text-text mt-0.5 tabular-nums">
                  ₹{activeCustomer.totalSpend.toLocaleString("en-IN")}
                </p>
              </div>
              <div className="p-2.5 rounded-lg border border-border/60 bg-surface-muted">
                <p className="text-11 text-text-muted font-medium">Orders</p>
                <p className="text-16 font-bold font-outfit text-text mt-0.5 tabular-nums">
                  {activeCustomer.ordersCount}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-11 font-semibold uppercase tracking-wider text-text-muted">
                Customer Segments
              </p>
              <div className="flex flex-wrap gap-1.5">
                {activeCustomer.isFavourite && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-11 font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400">
                    <Star className="w-3 h-3 fill-amber-500" /> Favourite
                  </span>
                )}
                {activeCustomer.isPriority && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-11 font-medium bg-red-500/15 text-red-600 dark:text-red-400">
                    Priority
                  </span>
                )}
                {activeCustomer.isRecentOrder && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-11 font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    Recent buyer
                  </span>
                )}
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-11 font-medium bg-surface-muted text-text-muted border border-border/60">
                  Tamil & English
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-11 font-semibold uppercase tracking-wider text-text-muted">
                  Studio Notes
                </p>
                <span className="text-[10px] text-text-muted">Auto-saves</span>
              </div>
              <textarea
                rows={3}
                defaultValue={activeCustomer.notes}
                onChange={() => toast.success("Customer notes saved", { duration: 1500 })}
                className="w-full p-2 rounded-lg border border-border bg-surface-muted text-12 text-text focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="space-y-2 pt-2 border-t border-border/60">
              <div className="flex items-center justify-between">
                <p className="text-11 font-semibold uppercase tracking-wider text-text-muted">
                  Order History
                </p>
                <button
                  onClick={() => navigate("/orders")}
                  className="text-11 text-primary-text font-medium hover:underline cursor-pointer"
                >
                  All orders →
                </button>
              </div>

              {customerOrders.length === 0 ? (
                <div className="p-3 rounded-lg border border-border/40 bg-surface-muted text-center text-11 text-text-muted">
                  No confirmed orders yet
                </div>
              ) : (
                customerOrders.map((o) => (
                  <div
                    key={o.id}
                    onClick={() => navigate("/orders")}
                    className="p-2.5 rounded-lg border border-border/60 bg-surface-muted hover:bg-surface transition-colors cursor-pointer space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-12 font-bold font-outfit text-text">{o.orderNumber}</span>
                      <span className="text-11 font-semibold tabular-nums text-text">
                        ₹{o.total.toLocaleString("en-IN")}
                      </span>
                    </div>
                    <p className="text-11 text-text-muted truncate">
                      {o.items.map((i) => i.name).join(", ")}
                    </p>
                    <div className="flex items-center justify-between pt-1 text-[10px]">
                      <span className="px-1.5 py-0.2 rounded font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 capitalize">
                        {o.status.replace("_", " ")}
                      </span>
                      <span className="text-text-muted">{o.createdAt}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        </>
      )}

      {showTemplatePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-16 font-bold font-outfit text-text">Choose Response Template</h3>
                <p className="text-12 text-text-muted">Variables are auto-filled for this customer</p>
              </div>
              <button
                onClick={() => setShowTemplatePicker(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-text-muted" />
              <input
                type="text"
                placeholder="Search templates (e.g. dispatched, pongal)..."
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 rounded-lg border border-border bg-surface-muted text-13 text-text focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="max-h-72 overflow-y-auto space-y-2 custom-scrollbar">
              {mockTemplates
                .filter((t) =>
                  templateSearch ? t.name.toLowerCase().includes(templateSearch.toLowerCase()) : true
                )
                .map((t) => (
                  <div
                    key={t.id}
                    onClick={() => insertTemplate(t)}
                    className="p-3 rounded-xl border border-border bg-surface-muted hover:bg-surface hover:border-primary/50 transition-colors cursor-pointer space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-13 font-semibold text-text">{t.name}</span>
                      <span className="text-10 uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface border border-border text-text-muted font-bold">
                        {t.category}
                      </span>
                    </div>
                    <p className="text-12 text-text-muted line-clamp-2">{t.body}</p>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {showResolveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-16 font-bold font-outfit text-text">Resolve conversation?</h3>
              <p className="text-12 text-text-muted mt-1">
                This will hand the chat back to the AI assistant. Routine inquiries will be answered automatically.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setShowResolveModal(false)}
                className="flex-1 py-2 rounded-lg border border-border bg-surface hover:bg-surface-muted text-13 font-medium text-text cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleResolve}
                className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-13 font-semibold cursor-pointer shadow-xs"
              >
                Confirm & Hand to AI
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
