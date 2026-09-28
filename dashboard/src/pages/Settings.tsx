import type { ReactNode } from "react";
import { AlertTriangle, Camera, MessageCircle, MessageSquareText, PlugZap, RefreshCw } from "lucide-react";
import { PauseButton } from "../components/admin/PauseButton.tsx";
import { usePageTitle } from "../components/layout/PageTitle.tsx";
import { Badge } from "../components/ui/Badge.tsx";
import { Button } from "../components/ui/Button.tsx";
import { EmptyState } from "../components/ui/EmptyState.tsx";
import { PageSpinner } from "../components/ui/Spinner.tsx";
import { useToast } from "../components/ui/Toast.tsx";
import { usePause, useSettings } from "../hooks/useSettings.ts";
import { cn } from "../lib/cn.ts";
import { formatDateTime, formatRelative, humanize } from "../lib/format.ts";
import type { ChannelStatus } from "../types/index.ts";

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}

const channelMeta = {
  whatsapp: { label: "WhatsApp", icon: MessageCircle, className: "bg-emerald-100 text-emerald-700" },
  instagram: { label: "Instagram", icon: Camera, className: "bg-pink-100 text-pink-700" },
} as const;

function statusClass(status: string): string {
  if (status === "active") return "bg-emerald-100 text-emerald-800";
  if (status === "expired" || status === "error" || status === "disconnected") return "bg-red-100 text-red-800";
  return "bg-gray-100 text-gray-700";
}

function ChannelItem({ channel }: { channel: ChannelStatus }) {
  const meta = channelMeta[channel.type] ?? { label: humanize(channel.type), icon: PlugZap, className: "bg-gray-100 text-gray-700" };
  const Icon = meta.icon;
  const expires = channel.tokenExpiresAt;
  const expiringSoon = expires ? new Date(expires).getTime() - Date.now() < 7 * 24 * 3600 * 1000 : false;
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", meta.className)} aria-hidden>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900">{meta.label}</p>
        <p className="truncate text-sm text-gray-500" title={channel.identifier}>
          {channel.identifier}
        </p>
        {expires && (
          <p className={cn("text-xs", expiringSoon ? "text-red-600" : "text-gray-400")} title={formatDateTime(expires)}>
            Token expires {formatRelative(expires)}
          </p>
        )}
      </div>
      <Badge className={statusClass(channel.status)}>{humanize(channel.status)}</Badge>
    </li>
  );
}

export default function Settings() {
  usePageTitle("Settings");
  const settings = useSettings();
  const pause = usePause();
  const { toast } = useToast();

  if (settings.isPending) return <PageSpinner label="Loading settings" />;

  if (settings.isError) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Couldn't load settings"
        description={settings.error.message}
        action={
          <Button variant="outline" onClick={() => void settings.refetch()} loading={settings.isFetching}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Try again
          </Button>
        }
        className="py-24"
      />
    );
  }

  const { paused, channels } = settings.data;

  const changePaused = (next: boolean) =>
    pause.mutate(next, {
      onSuccess: (res) =>
        toast({
          variant: res.paused ? "warning" : "success",
          title: res.paused ? "Automation paused" : "Automation resumed",
          description: res.paused ? "Messages are stored but the AI won't reply." : "The AI is replying again.",
        }),
      onError: (err) => toast({ variant: "error", title: "Couldn't change automation", description: err.message }),
    });

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6 md:px-6">
      <Section title="Automation" description="Controls AI auto-replies for every conversation on every channel.">
        <PauseButton paused={paused} onChange={changePaused} pending={pause.isPending} />
      </Section>

      <Section title="Meta channels" description="WhatsApp numbers and Instagram accounts connected to this business.">
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {channels.length === 0 ? (
            <EmptyState
              icon={PlugZap}
              title="Demo mode: not connected"
              description="No WhatsApp or Instagram account is connected yet. Replies are logged instead of sent. Channels appear here after the Meta integration."
              className="py-10"
            />
          ) : (
            <ul className="divide-y divide-gray-100">
              {channels.map((c) => (
                <ChannelItem key={c.id} channel={c} />
              ))}
            </ul>
          )}
        </div>
      </Section>

      <Section title="WhatsApp templates" description="Pre-approved messages for replying after the 24-hour window closes.">
        <div className="flex items-start gap-3 rounded-xl border border-dashed border-gray-300 bg-white p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400" aria-hidden>
            <MessageSquareText className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900">Coming with the Meta integration</p>
            <p className="mt-0.5 text-sm text-gray-500">
              Creating and managing WhatsApp message templates arrives once a real WhatsApp Business account is
              connected. Nothing to set up in demo mode.
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
}
