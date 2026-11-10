import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { cn } from "../../lib/cn.ts";
import type { DbOrder } from "../../types/index.ts";

interface InvoiceButtonProps {
  order: DbOrder;
  businessName?: string;
  upiId?: string;
  className?: string;
}

export function InvoiceButton({ order, businessName, upiId, className }: InvoiceButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleClick = async () => {
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
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
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
  );
}
