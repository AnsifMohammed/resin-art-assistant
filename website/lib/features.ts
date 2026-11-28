/**
 * Feature Flags for Saba Art Storefront.
 * P1 features default to true. P2 and P3 default to false and can be
 * enabled as content and studio operations become ready.
 */
export const FEATURES = {
  // P1 - Core Enhancements (Active)
  productionProgressGallery: true,
  giftOptions: true,
  wishlist: true,
  search: true,
  recentlyViewed: true,
  abandonedCartWhatsApp: true,

  // P2 - Extended Revenue Lines (Default false, toggleable)
  bulkOrders: false,          // /bulk flow
  bouquetPreservation: false, // /preservation flow
  productReviews: false,      // product page reviews
  occasions: false,           // /occasions/[slug]
  giftCards: false,           // /gift-card

  // P3 - Future Milestones (Disabled by default)
  seeInYourSpace: false,
  certificateOfAuthenticity: false,
  careReminders: false,
  studioVisit: false,
  referrals: false,
  pwa: false,
} as const;

export type FeatureKey = keyof typeof FEATURES;

export function isFeatureEnabled(key: FeatureKey): boolean {
  return FEATURES[key] ?? false;
}
