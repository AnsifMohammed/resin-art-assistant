import { useState } from "react";
import {
  Bot,
  MessageCircle,
  Clock,
  Bell,
  BarChart3,
  Palette,
  CheckCircle2,
  AlertTriangle,
  Download,
  Moon,
  Sun,
  Monitor,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "../context/ThemeContext.tsx";
import { InstagramIcon } from "../components/shared/InstagramIcon.tsx";

type SettingsSection =
  | "automation"
  | "whatsapp"
  | "instagram"
  | "hours"
  | "window"
  | "stats"
  | "appearance";

export default function Settings() {
  const { theme, setTheme } = useTheme();

  const [activeSection, setActiveSection] = useState<SettingsSection>("automation");

  // Section 1: Automation
  const [aiActive, setAiActive] = useState(true);

  // Section 4: Business Hours
  const [businessHoursEnabled, setBusinessHoursEnabled] = useState(true);
  const [openTime, setOpenTime] = useState("09:00");
  const [closeTime, setCloseTime] = useState("21:00");
  const [activeDays, setActiveDays] = useState<string[]>([
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
  ]);
  const [awayMessage, setAwayMessage] = useState(
    "Hi! We're closed right now 🌙 We'll reply by 9am tomorrow. — Saba Art, Coimbatore"
  );

  // Section 5: 24h Window Alerts
  const [windowAlertsEnabled, setWindowAlertsEnabled] = useState(true);
  const [windowThreshold, setWindowThreshold] = useState("2h");
  const [alertTarget, setAlertTarget] = useState("Admin WhatsApp");

  // Section 7: Appearance
  const [compactDensity, setCompactDensity] = useState(false);

  const toggleDay = (day: string) => {
    if (activeDays.includes(day)) {
      if (activeDays.length > 1) {
        setActiveDays(activeDays.filter((d) => d !== day));
      }
    } else {
      setActiveDays([...activeDays, day]);
    }
  };

  const handleSaveSettings = () => {
    toast.success("Settings saved successfully", {
      description: "Preferences updated across Saba Art dashboard",
    });
  };

  const exportStatsCsv = () => {
    const csvContent =
      "data:text/csv;charset=utf-8," +
      "Metric,Today,This Week,This Month\n" +
      "Inbound Messages,42,284,1120\n" +
      "AI Replies,33,220,874\n" +
      "Staff Replies,6,42,168\n" +
      "Admin Replies,3,22,78\n" +
      "Failed / Skipped,0,0,0\n" +
      "Read Receipts,41,279,1098\n";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "saba_art_message_stats.csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast.success("Message statistics exported to CSV");
  };

  return (
    <div className="space-y-6 pb-12 w-full">
      {/* ─── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-24 md:text-28 font-bold font-outfit text-text tracking-tight flex items-center gap-2">
            <span>Studio Settings</span>
          </h1>
          <p className="text-13 text-text-muted mt-0.5">
            Automation master switch, messaging channels, business hours, and alerts
          </p>
        </div>

        <button
          onClick={handleSaveSettings}
          className="px-4 py-2 rounded-xl bg-primary hover:bg-amber-600 text-primary-foreground font-semibold text-13 shadow-xs cursor-pointer"
        >
          Save Changes
        </button>
      </div>

      {/* ─── Global AI Paused Banner if Paused ─────────────────────────────────── */}
      {!aiActive && (
        <div className="p-4 rounded-xl border border-red-500/40 bg-red-500/10 flex items-center justify-between gap-3 text-red-600 dark:text-red-400 animate-in fade-in">
          <div className="flex items-center gap-2 text-13 font-medium">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>
              <strong>AI is paused:</strong> New messages from customers are stored in the inbox but will not be answered automatically.
            </span>
          </div>
          <button
            onClick={() => {
              setAiActive(true);
              toast.success("AI automation resumed");
            }}
            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-12 font-bold cursor-pointer shrink-0"
          >
            Resume AI
          </button>
        </div>
      )}

      {/* ─── Sub-Navigation & Content Layout ──────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Sticky Left Navigation (4 cols) */}
        <div className="md:col-span-4 lg:col-span-3 rounded-2xl border border-border bg-surface p-2.5 space-y-1 sticky top-20">
          {[
            { id: "automation", label: "AI Automation", icon: Bot },
            { id: "whatsapp", label: "WhatsApp API", icon: MessageCircle },
            { id: "instagram", label: "Instagram Direct", icon: InstagramIcon },
            { id: "hours", label: "Business Hours", icon: Clock },
            { id: "window", label: "24h Window Alerts", icon: Bell },
            { id: "stats", label: "Message Statistics", icon: BarChart3 },
            { id: "appearance", label: "Appearance & Theme", icon: Palette },
          ].map((item) => {
            const Icon = item.icon;
            const isSelected = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id as SettingsSection)}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl text-13 font-semibold flex items-center gap-2.5 transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-text-muted hover:text-text hover:bg-surface-muted"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right Content Panels (8 cols) */}
        <div className="md:col-span-8 lg:col-span-9 space-y-6">
          {/* Section 1: AI Automation */}
          {activeSection === "automation" && (
            <div className="p-6 rounded-2xl border border-border bg-surface space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-18 font-bold font-outfit text-text">AI Automation Engine</h2>
                  <p className="text-13 text-text-muted mt-1">
                    Master toggle for autonomous replies to price, delivery, and care inquiries.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={aiActive}
                    onChange={(e) => {
                      setAiActive(e.target.checked);
                      toast.info(e.target.checked ? "AI Automation Enabled" : "AI Automation Paused");
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              <div className="p-4 rounded-xl border border-border bg-surface-muted space-y-2 text-13 text-text">
                <p className="font-semibold text-text">How Saba Art AI behaves when active:</p>
                <ul className="list-disc list-inside space-y-1 text-12 text-text-muted">
                  <li>Answers routine questions regarding coaster sets, trays, pricing, and care.</li>
                  <li>Escalates custom orders, urgent shipping, and refunds to Asha or staff.</li>
                  <li>Detects customer language (Tamil / English) and formats currency in INR (₹).</li>
                </ul>
              </div>
            </div>
          )}

          {/* Section 2: WhatsApp */}
          {activeSection === "whatsapp" && (
            <div className="p-6 rounded-2xl border border-border bg-surface space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <MessageCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-18 font-bold font-outfit text-text">WhatsApp Business Cloud</h2>
                    <p className="text-12 text-text-muted">+91 98765 43210 · Official Registered Number</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-11 font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Connected
                </span>
              </div>

              <div className="space-y-3 text-13">
                <div className="flex justify-between py-2 border-b border-border/40">
                  <span className="text-text-muted">Account Tier:</span>
                  <span className="font-semibold text-text">Meta Business Verified</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border/40">
                  <span className="text-text-muted">API Token Expiry:</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    Valid until 12 Jan 2027
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-text-muted">Webhook Health:</span>
                  <span className="font-semibold text-text">99.98% uptime (latency 120ms)</span>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => toast.error("Disconnecting requires Meta Business Admin access")}
                  className="px-4 py-2 rounded-xl border border-red-500/40 text-red-600 hover:bg-red-500/10 text-12 font-semibold cursor-pointer"
                >
                  Disconnect Number
                </button>
              </div>
            </div>
          )}

          {/* Section 3: Instagram */}
          {activeSection === "instagram" && (
            <div className="p-6 rounded-2xl border border-border bg-surface space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-pink-500/10 text-pink-600 dark:text-pink-400">
                    <InstagramIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-18 font-bold font-outfit text-text">Instagram Messaging</h2>
                    <p className="text-12 text-text-muted">@saba_art · Coimbatore Resin Studio</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-11 font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  Token expires in 5 days
                </span>
              </div>

              <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-13 text-text space-y-2">
                <p className="font-semibold text-amber-600 dark:text-amber-400">
                  Instagram Access Token Refresh Required
                </p>
                <p className="text-12 text-text-muted">
                  Meta requires rotating Instagram Graph API permissions every 60 days to continue receiving incoming DMs and comment webhooks.
                </p>
                <button
                  onClick={() => toast.success("Instagram token renewed for 60 days")}
                  className="px-4 py-2 rounded-lg bg-primary hover:bg-amber-600 text-primary-foreground font-semibold text-12 cursor-pointer shadow-xs"
                >
                  Refresh Token Now
                </button>
              </div>
            </div>
          )}

          {/* Section 4: Business Hours */}
          {activeSection === "hours" && (
            <div className="p-6 rounded-2xl border border-border bg-surface space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <div>
                  <h2 className="text-18 font-bold font-outfit text-text">Studio Business Hours</h2>
                  <p className="text-13 text-text-muted mt-0.5">
                    Configure operational hours for human staff and after-hours auto-responses.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={businessHoursEnabled}
                    onChange={(e) => setBusinessHoursEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              {/* Open / Close Pickers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-12 font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                    Studio Opens
                  </label>
                  <input
                    type="time"
                    value={openTime}
                    onChange={(e) => setOpenTime(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-border bg-surface-muted text-13 text-text font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-12 font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                    Studio Closes
                  </label>
                  <input
                    type="time"
                    value={closeTime}
                    onChange={(e) => setCloseTime(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-border bg-surface-muted text-13 text-text font-semibold"
                  />
                </div>
              </div>

              {/* Day Chips */}
              <div className="space-y-1.5">
                <label className="block text-12 font-semibold uppercase tracking-wider text-text-muted">
                  Active Working Days
                </label>
                <div className="flex flex-wrap gap-2">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => {
                    const isSelected = activeDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        className={`px-3 py-1.5 rounded-lg text-12 font-semibold transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "bg-surface-muted text-text-muted hover:text-text"
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Away Message */}
              <div className="space-y-2">
                <label className="block text-12 font-semibold uppercase tracking-wider text-text-muted">
                  After-Hours Away Auto-Reply
                </label>
                <textarea
                  rows={3}
                  value={awayMessage}
                  onChange={(e) => setAwayMessage(e.target.value)}
                  className="w-full p-3 rounded-xl border border-border bg-surface-muted text-13 text-text leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* Section 5: 24h Window Alerts */}
          {activeSection === "window" && (
            <div className="p-6 rounded-2xl border border-border bg-surface space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <div>
                  <h2 className="text-18 font-bold font-outfit text-text">24-Hour WhatsApp Window Alerts</h2>
                  <p className="text-13 text-text-muted mt-0.5">
                    Prevent customer chat expiration under Meta's 24-hour customer service window rule.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={windowAlertsEnabled}
                    onChange={(e) => setWindowAlertsEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-12 font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                    Expiry Alert Threshold
                  </label>
                  <div className="relative">
                    <select
                      value={windowThreshold}
                      onChange={(e) => setWindowThreshold(e.target.value)}
                      className="w-full pl-3 pr-8 py-2.5 appearance-none rounded-xl border border-border bg-surface-muted text-13 text-text font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="1h">1 hour remaining (Urgent)</option>
                      <option value="2h">2 hours remaining (Standard)</option>
                      <option value="4h">4 hours remaining (Early warning)</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" aria-hidden />
                  </div>
                </div>

                <div>
                  <label className="block text-12 font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                    Alert Destination
                  </label>
                  <div className="relative">
                    <select
                      value={alertTarget}
                      onChange={(e) => setAlertTarget(e.target.value)}
                      className="w-full pl-3 pr-8 py-2.5 appearance-none rounded-xl border border-border bg-surface-muted text-13 text-text font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="Admin WhatsApp">Asha WhatsApp (+91 94421 00192)</option>
                      <option value="Push">Browser & Device Push Notification</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" aria-hidden />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Section 6: Message Statistics */}
          {activeSection === "stats" && (
            <div className="p-6 rounded-2xl border border-border bg-surface space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <div>
                  <h2 className="text-18 font-bold font-outfit text-text">Message Traffic Breakdown</h2>
                  <p className="text-13 text-text-muted mt-0.5">
                    Summary of automated vs human conversations across reporting periods.
                  </p>
                </div>
                <button
                  onClick={exportStatsCsv}
                  className="px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-muted text-12 font-semibold text-text inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-primary" />
                  <span>Export CSV</span>
                </button>
              </div>

              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-left text-13">
                  <thead className="bg-surface-muted border-b border-border text-11 uppercase font-semibold text-text-muted">
                    <tr>
                      <th className="p-3.5">Metric Type</th>
                      <th className="p-3.5">Today</th>
                      <th className="p-3.5">This Week</th>
                      <th className="p-3.5">This Month</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {[
                      { type: "Inbound Inquiries", today: 42, week: 284, month: 1120 },
                      { type: "AI Auto-Replies", today: 33, week: 220, month: 874 },
                      { type: "Staff Replies", today: 6, week: 42, month: 168 },
                      { type: "Admin Replies", today: 3, week: 22, month: 78 },
                      { type: "Failed or Skipped", today: 0, week: 0, month: 0 },
                      { type: "Read Receipts", today: 41, week: 279, month: 1098 },
                    ].map((row, i) => (
                      <tr key={i} className="hover:bg-surface-muted/50">
                        <td className="p-3.5 font-semibold text-text">{row.type}</td>
                        <td className="p-3.5 tabular-nums text-text font-medium">{row.today}</td>
                        <td className="p-3.5 tabular-nums text-text font-medium">{row.week}</td>
                        <td className="p-3.5 tabular-nums text-primary font-bold">{row.month}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section 7: Appearance */}
          {activeSection === "appearance" && (
            <div className="p-6 rounded-2xl border border-border bg-surface space-y-6">
              <div>
                <h2 className="text-18 font-bold font-outfit text-text">Dashboard Theme & Appearance</h2>
                <p className="text-13 text-text-muted mt-0.5">
                  Choose visual contrast preference for Saba Art dashboard.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Light */}
                <div
                  onClick={() => {
                    setTheme("light");
                    toast.success("Switched to Light theme");
                  }}
                  className={`p-4 rounded-xl border-2 transition-all cursor-pointer space-y-2 ${
                    theme === "light"
                      ? "border-primary bg-primary/5 shadow-md"
                      : "border-border bg-surface hover:border-border/80"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Sun className="w-5 h-5 text-amber-500" />
                    {theme === "light" && <CheckCircle2 className="w-4 h-4 text-primary" />}
                  </div>
                  <h4 className="font-bold text-14 text-text">Light Theme</h4>
                  <p className="text-11 text-text-muted">Clean stone #FAFAF9 with warm amber accents</p>
                </div>

                {/* Dark */}
                <div
                  onClick={() => {
                    setTheme("dark");
                    toast.success("Switched to Dark theme");
                  }}
                  className={`p-4 rounded-xl border-2 transition-all cursor-pointer space-y-2 ${
                    theme === "dark"
                      ? "border-primary bg-primary/5 shadow-md"
                      : "border-border bg-surface hover:border-border/80"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Moon className="w-5 h-5 text-indigo-400" />
                    {theme === "dark" && <CheckCircle2 className="w-4 h-4 text-primary" />}
                  </div>
                  <h4 className="font-bold text-14 text-text">Dark Theme</h4>
                  <p className="text-11 text-text-muted">Deep navy #0B1120 with high contrast readability</p>
                </div>

                {/* Compact Density */}
                <div
                  onClick={() => {
                    setCompactDensity(!compactDensity);
                    toast.info(compactDensity ? "Comfortable density enabled" : "Compact density enabled");
                  }}
                  className={`p-4 rounded-xl border-2 transition-all cursor-pointer space-y-2 ${
                    compactDensity
                      ? "border-primary bg-primary/5 shadow-md"
                      : "border-border bg-surface hover:border-border/80"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Monitor className="w-5 h-5 text-teal" />
                    {compactDensity && <CheckCircle2 className="w-4 h-4 text-primary" />}
                  </div>
                  <h4 className="font-bold text-14 text-text">Compact Density</h4>
                  <p className="text-11 text-text-muted">Tighter padding for small laptop screens</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
