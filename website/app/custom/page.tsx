import { Suspense } from "react";
import type { Metadata } from "next";
import { CustomBuilder } from "@/components/configurator/CustomBuilder";

export const metadata: Metadata = {
  title: "Bespoke Custom Configurator — Saba Art Studio",
  description:
    "Design your own handcrafted resin clock, serving tray or keepsake block. Real-time visual preview and dynamic quote calculation.",
};

export default function CustomPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
        </div>
      }
    >
      <CustomBuilder />
    </Suspense>
  );
}
