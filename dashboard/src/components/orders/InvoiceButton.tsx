import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "../../lib/cn.ts";
import { ConfirmDialog } from "../shared/ConfirmDialog.tsx";
import type { DbOrder } from "../../types/index.ts";

interface InvoiceButtonProps {
  order: DbOrder;
  businessName?: string;
  upiId?: string;
  className?: string;
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function InvoiceButton({ order, businessName, upiId, className }: InvoiceButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Mirrors the derivation in InvoiceDocument so the dialog and the PDF agree.
  const totalAmount = Number(order.totalAmount ?? 0);
  const totalPaid = order.paymentSummary?.totalPaid ?? 0;
  const balanceDue = order.paymentSummary?.balanceDue ?? Math.max(0, totalAmount - totalPaid);
  const fullyPaid = balanceDue === 0 && totalPaid > 0;

  const confirmDescription = fullyPaid
    ? `Order ${order.orderNo} is fully paid. The invoice will be stamped "PAID IN FULL" for ${inr(totalAmount)} and opened in a new tab.`
    : `Order ${order.orderNo} has ${inr(balanceDue)} still outstanding of ${inr(totalAmount)}. The invoice will be stamped "BALANCE DUE ${inr(balanceDue)}" and opened in a new tab.`;

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const [{ pdf }, { InvoiceDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./InvoiceDocument.tsx"),
      ]);

      const blob = await pdf(
        <InvoiceDocument
          order={order}
          businessName={businessName ?? "Saba Art"}
          upiId={upiId ?? "sabaart@upi"}
        />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      console.error("Invoice generation failed", err);
      toast.error("Could not generate the invoice. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={isGenerating}
        className={cn(
          "px-2.5 py-1 rounded-lg bg-surface-muted border border-border text-text text-11 font-semibold inline-flex items-center gap-1 shadow-xs hover:bg-surface transition-colors cursor-pointer disabled:opacity-50",
          className,
        )}
      >
        {isGenerating ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Generating…
          </>
        ) : (
          <>
            <FileText className="w-3.5 h-3.5" />
            Invoice
          </>
        )}
      </button>

      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void handleGenerate()}
        title="Generate invoice?"
        description={confirmDescription}
        confirmLabel="Generate invoice"
        cancelLabel="Cancel"
        tone={fullyPaid ? "primary" : "warning"}
      />
    </>
  );
}
