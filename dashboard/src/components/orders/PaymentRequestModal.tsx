import { useState, useEffect } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Link as LinkIcon,
  QrCode,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { usePaymentLink, useSendPaymentRequest } from "../../hooks/usePayments.ts";
import { ChannelIcon } from "../shared/ChannelIcon.tsx";
import type { Payment } from "../../types/index.ts";

export interface PaymentRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  payment: Payment | null;
  order?: {
    orderNo?: string | number | undefined;
    customerName?: string | undefined;
    channel?: string | undefined;
    customerPhone?: string | null | undefined;
  } | null | undefined;
}

export function PaymentRequestModal({
  isOpen,
  onClose,
  orderId,
  payment,
  order,
}: PaymentRequestModalProps) {
  const { data: linkDetails, isLoading } = usePaymentLink(payment?.id);
  const sendRequest = useSendPaymentRequest(orderId);

  const [activeTab, setActiveTab] = useState<"links" | "message">("links");
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [customMessage, setCustomMessage] = useState<string>("");

  useEffect(() => {
    if (linkDetails?.formattedMessage) {
      setCustomMessage(linkDetails.formattedMessage);
    }
  }, [linkDetails?.formattedMessage]);

  if (!isOpen || !payment) return null;

  const copyToClipboard = async (text: string, field: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success(`${label} copied to clipboard`);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const effectivePaymentUrl =
    linkDetails?.paymentUrl ||
    payment.paymentLink ||
    `${window.location.origin}/pay/${payment.id}`;

  const effectiveUpiLink =
    linkDetails?.upiLink ||
    payment.upiLink ||
    `upi://pay?pa=sabaart@upi&pn=Saba%20Art&am=${payment.amount}&cu=INR`;

  const targetChannel =
    linkDetails?.channel || order?.channel || "whatsapp";
  const channelDisplay =
    targetChannel === "instagram" ? "Instagram DM" : "WhatsApp";

  const handleSendPaymentMessage = async () => {
    try {
      const res = await sendRequest.mutateAsync({
        paymentId: payment.id,
        customMessage: customMessage.trim() || undefined,
      });

      if (res.sent) {
        toast.success(`Payment request sent to customer via ${channelDisplay}!`);
        onClose();
      } else {
        toast.error(res.error || `Failed to send payment request via ${channelDisplay}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send payment request";
      toast.error(msg);
    }
  };

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(
    effectiveUpiLink,
  )}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden space-y-0 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 border-b border-border bg-surface-muted/40 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <LinkIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-14 font-bold font-outfit text-text leading-tight">
                Payment Request & Link
              </h3>
              <p className="text-11 text-text-muted">
                Order #{order?.orderNo || linkDetails?.orderNo || ""} ·{" "}
                {order?.customerName || linkDetails?.customerName || "Customer"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-text-muted hover:text-text cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Amount & Kind Hero Banner */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-primary/5 via-surface to-primary/5 border-b border-border flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
              Requested Amount
            </span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-22 font-extrabold font-outfit text-text tabular-nums">
                ₹{payment.amount.toLocaleString("en-IN")}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  payment.kind === "advance"
                    ? "bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20"
                    : payment.kind === "balance"
                      ? "bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20"
                      : "bg-surface-muted text-text-muted border border-border"
                }`}
              >
                {payment.kind}
              </span>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-semibold text-text-muted block">UPI ID</span>
            <span className="text-12 font-mono font-medium text-text mt-0.5 inline-block">
              {linkDetails?.upiId || "sabaart@okaxis"}
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-border px-5 pt-2 gap-4">
          <button
            type="button"
            onClick={() => setActiveTab("links")}
            className={`pb-2 text-12 font-semibold transition-colors relative cursor-pointer ${
              activeTab === "links"
                ? "text-primary border-b-2 border-primary"
                : "text-text-muted hover:text-text"
            }`}
          >
            Links & QR Code
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("message")}
            className={`pb-2 text-12 font-semibold transition-colors relative cursor-pointer inline-flex items-center gap-1.5 ${
              activeTab === "message"
                ? "text-primary border-b-2 border-primary"
                : "text-text-muted hover:text-text"
            }`}
          >
            <span>Send to Customer</span>
            <ChannelIcon
              channel={targetChannel as "whatsapp" | "instagram"}
              className="w-3.5 h-3.5"
            />
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="py-8 text-center text-12 text-text-muted animate-pulse">
              Generating payment request links...
            </div>
          ) : activeTab === "links" ? (
            <>
              {/* Web Payment Link */}
              <div className="space-y-1.5">
                <label className="text-11 font-semibold text-text flex items-center justify-between">
                  <span>Customer Payment Page Link</span>
                  <a
                    href={effectivePaymentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline text-[11px] inline-flex items-center gap-1 font-normal"
                  >
                    <span>Preview page</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={effectivePaymentUrl}
                    className="flex-1 text-12 px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono truncate select-all focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      copyToClipboard(effectivePaymentUrl, "webLink", "Payment link")
                    }
                    className="px-3 py-2 rounded-xl text-12 font-semibold bg-surface-muted hover:bg-surface border border-border text-text inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-xs"
                  >
                    {copiedField === "webLink" ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedField === "webLink" ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              </div>

              {/* UPI Deep Link */}
              <div className="space-y-1.5">
                <label className="text-11 font-semibold text-text">
                  Direct UPI Deep Link (Instant GPay / PhonePe / Paytm)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={effectiveUpiLink}
                    className="flex-1 text-12 px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono truncate select-all focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      copyToClipboard(effectiveUpiLink, "upiLink", "UPI link")
                    }
                    className="px-3 py-2 rounded-xl text-12 font-semibold bg-surface-muted hover:bg-surface border border-border text-text inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-xs"
                  >
                    {copiedField === "upiLink" ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedField === "upiLink" ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              </div>

              {/* QR Code Card */}
              <div className="p-4 rounded-xl border border-border bg-surface-muted/30 flex flex-col sm:flex-row items-center gap-4">
                <div className="w-36 h-36 bg-white p-2 rounded-xl border border-border shrink-0 flex items-center justify-center shadow-xs">
                  <img
                    src={qrImageUrl}
                    alt="UPI Payment QR Code"
                    className="w-full h-full object-contain"
                    loading="lazy"
                  />
                </div>
                <div className="space-y-2 text-center sm:text-left flex-1">
                  <div className="flex items-center justify-center sm:justify-start gap-1.5 text-text font-bold text-13">
                    <QrCode className="w-4 h-4 text-primary" />
                    <span>Scan & Pay QR Code</span>
                  </div>
                  <p className="text-11 text-text-muted leading-relaxed">
                    Customer can scan this QR code using Google Pay, PhonePe, Paytm, CRED or any
                    UPI app to pay ₹{payment.amount.toLocaleString("en-IN")}.
                  </p>
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                    <a
                      href={qrImageUrl}
                      download={`Payment-Order-${order?.orderNo || payment.id}.png`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-lg text-11 font-semibold bg-primary text-primary-foreground hover:brightness-105 inline-flex items-center gap-1.5 shadow-xs transition"
                    >
                      <span>Download QR</span>
                    </a>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Message Composer & Send Direct to DM */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-11 font-semibold text-text flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    <span>Payment Request Message</span>
                  </label>
                  <span className="text-[11px] text-text-muted">
                    Channel: <span className="font-semibold text-text capitalize">{channelDisplay}</span>
                  </span>
                </div>

                <textarea
                  rows={6}
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  className="w-full text-12 p-3 rounded-xl bg-surface-muted border border-border text-text focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed resize-none"
                  placeholder="Enter message to send to customer..."
                />
              </div>

              <div className="p-3 rounded-xl border border-border bg-surface-muted/40 text-11 text-text-muted flex items-start gap-2">
                <ChannelIcon
                  channel={targetChannel as "whatsapp" | "instagram"}
                  className="w-4 h-4 text-primary shrink-0 mt-0.5"
                />
                <p>
                  Sending will deliver this payment request directly to the customer's{" "}
                  <strong className="text-text">{channelDisplay}</strong> thread and log it into
                  the order communication history.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-border bg-surface-muted/40 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl text-12 font-medium text-text-muted hover:text-text bg-surface-muted cursor-pointer transition"
          >
            Close
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => copyToClipboard(customMessage, "fullMsg", "Message")}
              className="px-3 py-1.5 rounded-xl text-12 font-semibold bg-surface-muted hover:bg-surface border border-border text-text inline-flex items-center gap-1.5 transition cursor-pointer shadow-xs"
            >
              {copiedField === "fullMsg" ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedField === "fullMsg" ? "Copied Message" : "Copy Message"}</span>
            </button>

            <button
              type="button"
              disabled={sendRequest.isPending || !customMessage.trim()}
              onClick={handleSendPaymentMessage}
              className="px-4 py-1.5 rounded-xl text-12 font-semibold bg-primary text-primary-foreground hover:brightness-105 transition shadow-xs cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {sendRequest.isPending
                  ? "Sending..."
                  : `Send via ${channelDisplay}`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
