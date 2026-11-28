import { Metadata } from "next";
import { Suspense } from "react";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";

export const metadata: Metadata = {
  title: "Checkout — Saba Art Coimbatore",
  description: "Complete your bespoke handmade resin art commission or order. Direct from Coimbatore.",
};

export default function CheckoutPage() {
  return (
    <main className="min-h-screen bg-[var(--background)]">
      <Suspense
        fallback={
          <div className="min-h-[50vh] flex items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
          </div>
        }
      >
        <CheckoutForm />
      </Suspense>
    </main>
  );
}
