/**
 * Pure Pricing & Delivery Engine for Saba Art Storefront.
 * Strictly tested with Vitest.
 */

export interface CartLineItem {
  slug: string;
  name: string;
  sizeName: string;
  unitPrice: number;
  quantity: number;
  isCustomized?: boolean;
  leadTimeDays: number;
}

export type DeliveryZone = "coimbatore" | "tamil_nadu" | "rest_of_india" | "international";

export interface DeliveryDetails {
  zone: DeliveryZone;
  charge: number;
  transitDaysMin: number;
  transitDaysMax: number;
  label: string;
  isFree: boolean;
  isBlocked: boolean;
}

export interface PricingBreakdown {
  subtotal: number;
  discountTotal: number;
  deliveryCharge: number;
  total: number;
  leadTimeDays: number;
  dispatchByDate: string; // ISO string (YYYY-MM-DD)
  deliveryDetails: DeliveryDetails;
  lineDiscounts: Record<string, { percent: number; amount: number; nudge?: string }>;
}

/**
 * Resolve delivery zone by Indian 6-digit Pincode & State.
 */
export function resolveDeliveryZone(pincode: string, state?: string): DeliveryDetails {
  const cleanPin = pincode.replace(/\D/g, "").slice(0, 6);

  // If pincode is not standard 6 digits or country is international
  if (!cleanPin || cleanPin.length !== 6) {
    return {
      zone: "rest_of_india",
      charge: 120,
      transitDaysMin: 7,
      transitDaysMax: 10,
      label: "Rest of India (DTDC / Delhivery)",
      isFree: false,
      isBlocked: false,
    };
  }

  // Coimbatore pincodes start with 641
  if (cleanPin.startsWith("641")) {
    return {
      zone: "coimbatore",
      charge: 0,
      transitDaysMin: 1,
      transitDaysMax: 2,
      label: "Coimbatore City (Studio Hand Delivery)",
      isFree: true,
      isBlocked: false,
    };
  }

  // Tamil Nadu pincodes start with 600 - 643
  const pinPrefix3 = parseInt(cleanPin.slice(0, 3), 10);
  const isTN =
    (pinPrefix3 >= 600 && pinPrefix3 <= 643) ||
    state?.toLowerCase().includes("tamil nadu") ||
    state?.toLowerCase() === "tn";

  if (isTN) {
    return {
      zone: "tamil_nadu",
      charge: 60,
      transitDaysMin: 3,
      transitDaysMax: 5,
      label: "Tamil Nadu (DTDC / Delhivery)",
      isFree: false,
      isBlocked: false,
    };
  }

  // Rest of India
  return {
    zone: "rest_of_india",
    charge: 120,
    transitDaysMin: 7,
    transitDaysMax: 10,
    label: "Rest of India (DTDC / Delhivery)",
    isFree: false,
    isBlocked: false,
  };
}

/**
 * Calculates dispatch-by date, skipping Sundays.
 * Formula: today + max(leadTimeDays in cart) + (2 if any item is customised)
 */
export function calculateDispatchDate(
  maxLeadDays: number,
  hasCustomization: boolean,
  startDate: Date = new Date()
): Date {
  const effectiveLeadDays = maxLeadDays + (hasCustomization ? 2 : 0);
  const result = new Date(startDate);

  let daysAdded = 0;
  while (daysAdded < effectiveLeadDays) {
    result.setDate(result.getDate() + 1);
    // Sunday is 0
    if (result.getDay() !== 0) {
      daysAdded++;
    }
  }

  return result;
}

/**
 * Formats a Date object to readable Indian English format: "Mon, 1 Dec"
 */
export function formatDispatchDate(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/**
 * Pure calculation of the entire cart total, discounts, lead times, and dispatch date.
 */
export function calculateCartPricing(
  items: CartLineItem[],
  pincode: string = "",
  state?: string,
  referenceDate: Date = new Date()
): PricingBreakdown {
  let subtotal = 0;
  let discountTotal = 0;
  let maxLeadTime = 0;
  let anyCustomized = false;
  const lineDiscounts: PricingBreakdown["lineDiscounts"] = {};

  for (const item of items) {
    const lineTotal = item.unitPrice * item.quantity;
    subtotal += lineTotal;

    if (item.leadTimeDays > maxLeadTime) {
      maxLeadTime = item.leadTimeDays;
    }

    if (item.isCustomized) {
      anyCustomized = true;
    }

    // Bulk discount rule: 10+ of the same product gets 10% off
    const key = `${item.slug}-${item.sizeName}`;
    if (item.quantity >= 10) {
      const lineDisc = Math.round(lineTotal * 0.1);
      discountTotal += lineDisc;
      lineDiscounts[key] = {
        percent: 10,
        amount: lineDisc,
      };
    } else if (item.quantity >= 8) {
      const needed = 10 - item.quantity;
      lineDiscounts[key] = {
        percent: 0,
        amount: 0,
        nudge: `Add ${needed} more for 10% bulk discount`,
      };
    }
  }

  const delivery = resolveDeliveryZone(pincode, state);
  const deliveryCharge = items.length > 0 ? delivery.charge : 0;
  const finalTotal = Math.max(0, subtotal - discountTotal + deliveryCharge);

  const dispatchDateObj =
    items.length > 0
      ? calculateDispatchDate(maxLeadTime, anyCustomized, referenceDate)
      : new Date(referenceDate);

  return {
    subtotal,
    discountTotal,
    deliveryCharge,
    total: finalTotal,
    leadTimeDays: maxLeadTime + (anyCustomized ? 2 : 0),
    dispatchByDate: dispatchDateObj.toISOString().split("T")[0]!,
    deliveryDetails: delivery,
    lineDiscounts,
  };
}

/**
 * Format Indian Rupee currency with standard digit grouping (e.g. ₹1,200, ₹48,500)
 */
export function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}
