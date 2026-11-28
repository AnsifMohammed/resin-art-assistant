import { BRAND } from "@/lib/copy";

const UNSUBSCRIBE_KEY = "saba-cart-wa-unsubscribed";
const LAST_ORDER_KEY = "saba-last-order-timestamp";
const CART_SAVED_KEY = "saba-cart-saved-timestamp";

/**
 * Checks if the user is eligible for an abandoned cart WhatsApp reminder.
 * Rules:
 * - Exactly one reminder after 2 hours (never a sequence)
 * - Permanent one-click unsubscribe
 * - Skipped if any order was completed in the last 24 hours
 */
export function isAbandonedCartEligible(): boolean {
  if (typeof window === "undefined") return false;

  try {
    // 1. Permanent unsubscribe check
    const isUnsubscribed = localStorage.getItem(UNSUBSCRIBE_KEY) === "true";
    if (isUnsubscribed) return false;

    // 2. Order in last 24 hours check
    const lastOrderTime = Number(localStorage.getItem(LAST_ORDER_KEY) || 0);
    const now = Date.now();
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;
    if (now - lastOrderTime < twentyFourHoursMs) return false;

    // 3. Minimum 2 hours elapsed since cart activity
    const cartSavedTime = Number(localStorage.getItem(CART_SAVED_KEY) || 0);
    const twoHoursMs = 2 * 60 * 60 * 1000;
    if (cartSavedTime === 0 || now - cartSavedTime < twoHoursMs) return false;

    return true;
  } catch {
    return false;
  }
}

export function recordOrderCompletion() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAST_ORDER_KEY, String(Date.now()));
  } catch {}
}

export function recordCartActivity() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CART_SAVED_KEY, String(Date.now()));
  } catch {}
}

export function unsubscribeFromCartReminders() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(UNSUBSCRIBE_KEY, "true");
  } catch {}
}

export function getAbandonedCartWhatsAppUrl(itemsSummary: string): string {
  const message = encodeURIComponent(
    `Hello Saba Art studio! I was browsing your collection and left ${itemsSummary} in my cart. Could you tell me more about the current curing schedule?`
  );
  return `https://wa.me/${BRAND.whatsapp.replace(/\D/g, "")}?text=${message}`;
}
