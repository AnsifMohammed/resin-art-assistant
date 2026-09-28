import { useEffect, useState } from "react";
import type { KbProduct } from "../../types/index.ts";
import { Button } from "../ui/Button.tsx";
import { Input } from "../ui/Input.tsx";
import { Modal } from "../ui/Modal.tsx";
import { ChipsInput } from "../ui/ChipsInput.tsx";
import { NumberInput } from "../ui/NumberInput.tsx";
import { Switch } from "../ui/Switch.tsx";

export function productErrors(p: KbProduct): { name?: string; price?: string } {
  const e: { name?: string; price?: string } = {};
  if (!p.name?.trim()) e.name = "Product name is required.";
  if (!(typeof p.price === "number" && Number.isFinite(p.price) && p.price > 0)) e.price = "Price must be more than ₹0.";
  return e;
}

/** Add / edit one knowledge-base product. Works on a copy; "Done" hands it back. Unknown keys are kept. */
export function KbProductModal({
  open,
  initial,
  isNew,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: KbProduct | null;
  isNew: boolean;
  onClose: () => void;
  onSave: (product: KbProduct) => void;
}) {
  const [p, setP] = useState<KbProduct | null>(initial);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (open) {
      setP(initial);
      setTried(false);
    }
  }, [open, initial]);

  if (!p) return null;
  const errors = tried ? productErrors(p) : {};
  const set = (patch: Partial<KbProduct>) => setP((prev) => (prev ? { ...prev, ...patch } : prev));

  const done = () => {
    setTried(true);
    if (Object.keys(productErrors(p)).length > 0) return;
    onSave({ ...p, name: p.name.trim() });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isNew ? "Add product" : "Edit product"}
      description="The AI quotes these details to customers exactly."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={done}>{isNew ? "Add product" : "Done"}</Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          done();
        }}
      >
        <Input label="Name" value={p.name} onChange={(e) => set({ name: e.target.value })} error={errors.name ?? null} required />
        <div className="grid grid-cols-2 gap-3">
          <NumberInput
            label="Price (₹)"
            value={p.price}
            onValueChange={(v) => set({ price: v ?? 0 })}
            error={errors.price ?? null}
            required
          />
          <NumberInput
            label="Lead time (days)"
            value={p.lead_time_days}
            onValueChange={(v) => set({ lead_time_days: v === null ? 0 : Math.round(v) })}
          />
        </div>
        <ChipsInput
          label="Sizes"
          values={p.sizes ?? []}
          onChange={(sizes) => set({ sizes })}
          placeholder="e.g. 12 inch, then Enter"
        />
        <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-1">
          <div>
            <p className="text-sm font-medium text-gray-700">Customizable</p>
            <p className="text-xs text-gray-500">Customers can ask for changes like colour or a name.</p>
          </div>
          <Switch checked={p.customizable} onChange={(customizable) => set({ customizable })} label="Customizable" />
        </div>
        {p.customizable && (
          <ChipsInput
            label="Custom options"
            values={p.custom_options ?? []}
            onChange={(custom_options) => set({ custom_options })}
            placeholder="e.g. colour, name_engraving"
          />
        )}
        {/* Enter in a text field submits */}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
