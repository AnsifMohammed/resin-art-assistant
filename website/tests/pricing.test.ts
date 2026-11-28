import { describe, expect, it } from "vitest";
import {
  calculateCartPricing,
  calculateDispatchDate,
  formatINR,
  resolveDeliveryZone,
  type CartLineItem,
} from "../lib/pricing";

describe("Pricing & Delivery Rules (Saba Art)", () => {
  it("formats Indian Rupee currency correctly with symbol and commas", () => {
    expect(formatINR(1200)).toBe("₹1,200");
    expect(formatINR(48500)).toBe("₹48,500");
    expect(formatINR(0)).toBe("₹0");
  });

  describe("Delivery Zone Resolution", () => {
    it("identifies Coimbatore city as Free delivery (641xxx)", () => {
      const coimbatore = resolveDeliveryZone("641001");
      expect(coimbatore.zone).toBe("coimbatore");
      expect(coimbatore.charge).toBe(0);
      expect(coimbatore.isFree).toBe(true);
    });

    it("identifies Rest of Tamil Nadu as ₹60 delivery (e.g. Chennai 600001)", () => {
      const tn = resolveDeliveryZone("600001", "Tamil Nadu");
      expect(tn.zone).toBe("tamil_nadu");
      expect(tn.charge).toBe(60);
      expect(tn.isFree).toBe(false);
    });

    it("identifies Rest of India as ₹120 delivery (e.g. Bangalore 560001, Delhi 110001)", () => {
      const bangalore = resolveDeliveryZone("560001");
      expect(bangalore.zone).toBe("rest_of_india");
      expect(bangalore.charge).toBe(120);

      const delhi = resolveDeliveryZone("110001");
      expect(delhi.zone).toBe("rest_of_india");
      expect(delhi.charge).toBe(120);
    });
  });

  describe("Bulk Discounts (10% at quantity 10+)", () => {
    const singleItem: CartLineItem = {
      slug: "ocean-coaster-set-4",
      name: "Ocean Coaster Set of 4",
      sizeName: "10cm round",
      unitPrice: 1200,
      quantity: 1,
      leadTimeDays: 5,
    };

    it("applies zero discount for quantity under 10", () => {
      const pricing = calculateCartPricing([{ ...singleItem, quantity: 5 }], "641001");
      expect(pricing.subtotal).toBe(6000);
      expect(pricing.discountTotal).toBe(0);
      expect(pricing.total).toBe(6000);
    });

    it("provides a discount nudge when quantity is 8 or 9", () => {
      const pricing8 = calculateCartPricing([{ ...singleItem, quantity: 8 }], "641001");
      expect(pricing8.lineDiscounts["ocean-coaster-set-4-10cm round"]?.nudge).toBe(
        "Add 2 more for 10% bulk discount"
      );

      const pricing9 = calculateCartPricing([{ ...singleItem, quantity: 9 }], "641001");
      expect(pricing9.lineDiscounts["ocean-coaster-set-4-10cm round"]?.nudge).toBe(
        "Add 1 more for 10% bulk discount"
      );
    });

    it("applies 10% discount the instant quantity reaches 10", () => {
      const pricing = calculateCartPricing([{ ...singleItem, quantity: 10 }], "641001");
      expect(pricing.subtotal).toBe(12000);
      expect(pricing.discountTotal).toBe(1200); // 10% of 12000
      expect(pricing.total).toBe(10800);
    });
  });

  describe("Dispatch Date & Sunday Skipping", () => {
    it("adds 2 extra days when any item is customised", () => {
      const monday = new Date("2026-11-23T10:00:00Z"); // Monday
      const nonCustom = calculateDispatchDate(5, false, monday);
      const custom = calculateDispatchDate(5, true, monday);

      // 5 working days from Mon Nov 23 -> Sat Nov 28
      // 7 working days from Mon Nov 23 -> skips Sunday Nov 29 -> Tue Dec 1
      expect(nonCustom.getDate()).toBe(28);
      expect(custom.getDate()).toBe(1); // Dec 1
    });

    it("skips Sundays in calendar calculations", () => {
      const friday = new Date("2026-11-27T10:00:00Z"); // Friday
      // 2 working days from Friday: Saturday (+1), Sunday (skipped), Monday (+2)
      const dispatch = calculateDispatchDate(2, false, friday);
      expect(dispatch.getDay()).not.toBe(0); // Not Sunday
      expect(dispatch.getDate()).toBe(30); // Monday Nov 30
    });
  });
});
