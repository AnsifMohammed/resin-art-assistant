export interface Customer {
  id: string;
  name: string;
  channel: "whatsapp" | "instagram";
  handleOrPhone: string;
  city: string;
  avatarColor: string;
  isFavourite: boolean;
  isPriority: boolean;
  isRecentOrder: boolean;
  isNew: boolean;
  totalSpend: number;
  ordersCount: number;
  lastActive: string;
  notes?: string;
}

export interface Message {
  id: string;
  sender: "customer" | "ai" | "owner" | "staff" | "system";
  senderName?: string;
  text: string;
  timestamp: string;
  status?: "sending" | "sent" | "delivered" | "read";
  aiReasoning?: {
    intent: string;
    facts: string[];
  };
}

export interface Conversation {
  id: string;
  customerId: string;
  customerName: string;
  customerHandle: string;
  channel: "whatsapp" | "instagram";
  state: "ai_active" | "escalated" | "owner_handling" | "paused";
  tag?: "new_lead" | "custom_order" | "payment_pending" | "order_confirmed" | "follow_up";
  escalationReason?: string;
  assignedTo?: string; // staff name or unassigned
  lastMessage: string;
  lastMessageTime: string;
  unread: boolean;
  isPriority: boolean;
  isFavourite: boolean;
  windowClosesAt: string; // ISO string for 24h window
  messages: Message[];
}

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
  customization?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  channel: "whatsapp" | "instagram";
  items: OrderItem[];
  total: number;
  status: "pending" | "confirmed" | "in_production" | "ready" | "dispatched" | "delivered" | "cancelled";
  createdAt: string;
  dueDate: string;
  trackingId?: string;
  courier?: string;
  shippingAddress: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  leadTimeDays: number;
  isCustomizable: boolean;
  options: string[];
  image: string;
  sizes?: string[];
}

export interface Template {
  id: string;
  name: string;
  category: "delivery" | "festive" | "custom_order" | "general";
  channel: "whatsapp" | "instagram" | "both";
  body: string;
  variables: string[];
  lastUpdated: string;
}

export interface Broadcast {
  id: string;
  name: string;
  date: string;
  template: string;
  audience: string;
  sentCount: number;
  deliveredPercent: number;
  readPercent: number;
  status: "sent" | "scheduled" | "draft";
}

export interface IGComment {
  id: string;
  postThumbnail: string;
  postTitle: string;
  handle: string;
  comment: string;
  matchedRule: string;
  action: "replied_publicly" | "dm_sent" | "skipped";
  time: string;
}

export interface IGRule {
  id: string;
  name: string;
  keywords: string[];
  replyType: "public_reply" | "send_dm";
  replyText: string;
  isActive: boolean;
}

export interface AuditLogItem {
  id: string;
  actor: {
    name: string;
    role: "admin" | "staff" | "ai" | "system";
  };
  action: "reply_sent" | "escalation_assigned" | "staff_added" | "settings_changed" | "auto_reply_sent";
  actionLabel: string;
  target: string;
  details: string;
  timestamp: string;
}

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "staff";
  isActive: boolean;
  lastLogin: string;
}

export const mockProducts: Product[] = [
  {
    id: "prod-1",
    name: "Ocean Coaster Set of 4",
    price: 1200,
    leadTimeDays: 5,
    isCustomizable: true,
    sizes: ["10cm round", "12cm square"],
    options: ["Deep Blue", "Teal Waves", "Gold Leaf Edge", "Custom Monogram"],
    image: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=500&auto=format&fit=crop&q=80",
  },
  {
    id: "prod-2",
    name: "12 inch Resin Wall Clock",
    price: 2800,
    leadTimeDays: 7,
    isCustomizable: true,
    sizes: ["12 inch standard", "16 inch large"],
    options: ["White Marble Style", "Geode Agate", "Roman Numerals", "Silent Sweep"],
    image: "https://images.unsplash.com/photo-1563861826100-9cb868fdbe1c?w=500&auto=format&fit=crop&q=80",
  },
  {
    id: "prod-3",
    name: "Large Resin Serving Tray",
    price: 1800,
    leadTimeDays: 6,
    isCustomizable: true,
    sizes: ["30cm x 20cm", "35cm x 25cm"],
    options: ["Brushed Brass Handles", "Black & Gold Veins", "Floral Embedded"],
    image: "https://images.unsplash.com/photo-1615529182904-14819c35db37?w=500&auto=format&fit=crop&q=80",
  },
  {
    id: "prod-4",
    name: "Resin Keychain Set of 3",
    price: 450,
    leadTimeDays: 3,
    isCustomizable: true,
    sizes: ["5cm letter", "Circle tag"],
    options: ["Initial Letters", "Pressed Daisy", "Silver Foil"],
    image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=80",
  },
  {
    id: "prod-5",
    name: "Resin Photo Frame 5x7",
    price: 950,
    leadTimeDays: 5,
    isCustomizable: true,
    sizes: ["5x7 inch", "4x6 inch"],
    options: ["Rose Petal Resin", "Glitter Border", "Table Stand Included"],
    image: "https://images.unsplash.com/photo-1544717305-2782549b5136?w=500&auto=format&fit=crop&q=80",
  },
  {
    id: "prod-6",
    name: "Resin Bookmark Set of 4",
    price: 380,
    leadTimeDays: 3,
    isCustomizable: false,
    sizes: ["14cm x 3cm"],
    options: ["Silky Tassel", "Ocean Aqua", "Autumn Leaves"],
    image: "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=500&auto=format&fit=crop&q=80",
  },
];

export const mockCustomers: Customer[] = [
  {
    id: "cust-1",
    name: "Kavya Ramesh",
    channel: "whatsapp",
    handleOrPhone: "+91 98401 23456",
    city: "Coimbatore",
    avatarColor: "#F59E0B",
    isFavourite: true,
    isPriority: true,
    isRecentOrder: true,
    isNew: false,
    totalSpend: 4800,
    ordersCount: 3,
    lastActive: "12m ago",
    notes: "Ordered wedding return gifts last month. Loves ocean teal waves.",
  },
  {
    id: "cust-2",
    name: "Arun Kumar",
    channel: "instagram",
    handleOrPhone: "@arun_k_resin",
    city: "Chennai",
    avatarColor: "#0D9488",
    isFavourite: false,
    isPriority: false,
    isRecentOrder: true,
    isNew: false,
    totalSpend: 2800,
    ordersCount: 1,
    lastActive: "25m ago",
    notes: "Gift order for anniversary clock.",
  },
  {
    id: "cust-3",
    name: "Divya Subramanian",
    channel: "whatsapp",
    handleOrPhone: "+91 97890 12345",
    city: "Coimbatore",
    avatarColor: "#8B5CF6",
    isFavourite: true,
    isPriority: true,
    isRecentOrder: true,
    isNew: false,
    totalSpend: 5400,
    ordersCount: 4,
    lastActive: "1h ago",
    notes: "Repeat interior decorator buyer.",
  },
  {
    id: "cust-4",
    name: "Karthik Raja",
    channel: "whatsapp",
    handleOrPhone: "+91 98940 54321",
    city: "Madurai",
    avatarColor: "#3B82F6",
    isFavourite: false,
    isPriority: false,
    isRecentOrder: false,
    isNew: true,
    totalSpend: 1200,
    ordersCount: 1,
    lastActive: "3h ago",
    notes: "First time customer enquiring on coaster care.",
  },
  {
    id: "cust-5",
    name: "Priya Senthil",
    channel: "instagram",
    handleOrPhone: "@priya_lifestyle",
    city: "Coimbatore",
    avatarColor: "#EC4899",
    isFavourite: true,
    isPriority: false,
    isRecentOrder: false,
    isNew: false,
    totalSpend: 3750,
    ordersCount: 2,
    lastActive: "4h ago",
  },
  {
    id: "cust-6",
    name: "Meena Krishnan",
    channel: "whatsapp",
    handleOrPhone: "+91 99420 11223",
    city: "Tiruppur",
    avatarColor: "#10B981",
    isFavourite: false,
    isPriority: false,
    isRecentOrder: true,
    isNew: false,
    totalSpend: 1800,
    ordersCount: 1,
    lastActive: "5h ago",
  },
];

// Helper to calculate upcoming window closes (now + hours)
const inHours = (hours: number) => new Date(Date.now() + hours * 3600 * 1000).toISOString();

export const mockConversations: Conversation[] = [
  {
    id: "conv-1",
    customerId: "cust-1",
    customerName: "Kavya Ramesh",
    customerHandle: "+91 98401 23456",
    channel: "whatsapp",
    state: "escalated",
    tag: "custom_order",
    escalationReason: "Refund request",
    assignedTo: "Asha",
    lastMessage: "Could you please check my return request for the cracked coaster?",
    lastMessageTime: "12m ago",
    unread: true,
    isPriority: true,
    isFavourite: true,
    windowClosesAt: inHours(1.5), // < 2h -> Warning state!
    messages: [
      {
        id: "msg-1",
        sender: "customer",
        text: "Hi Asha! I received the 4-piece ocean coaster set today in Peelamedu.",
        timestamp: "10:14 am",
      },
      {
        id: "msg-2",
        sender: "ai",
        text: "Hello Kavya! 💕 Thank you for letting us know! We hope you love the ocean waves design. How is everything?",
        timestamp: "10:15 am",
        aiReasoning: {
          intent: "delivery_check_in",
          facts: ["Order SA-1042 delivered today via Shiprocket", "Customer Kavya Ramesh, Coimbatore city"],
        },
      },
      {
        id: "msg-3",
        sender: "customer",
        text: "Unfortunately one of the coasters has a hairline crack on the resin edge during transit. Could you please check my return request for the cracked coaster?",
        timestamp: "10:22 am",
      },
      {
        id: "msg-4",
        sender: "system",
        text: "Escalated: Refund request · Transferred to human support",
        timestamp: "10:22 am",
      },
    ],
  },
  {
    id: "conv-2",
    customerId: "cust-2",
    customerName: "Arun Kumar",
    customerHandle: "@arun_k_resin",
    channel: "instagram",
    state: "ai_active",
    tag: "order_confirmed",
    lastMessage: "Your order for the 12 inch Resin Wall Clock is in production! 🌸",
    lastMessageTime: "25m ago",
    unread: false,
    isPriority: false,
    isFavourite: false,
    windowClosesAt: inHours(14),
    messages: [
      {
        id: "msg-5",
        sender: "customer",
        text: "Hi, can you confirm if the gold leaf numbers on the wall clock are included?",
        timestamp: "9:40 am",
      },
      {
        id: "msg-6",
        sender: "ai",
        text: "Yes Arun! The 12 inch Resin Wall Clock includes your choice of Roman numerals in reflective gold foil or metallic numbers at no extra charge. ✨",
        timestamp: "9:41 am",
        aiReasoning: {
          intent: "product_customization_inquiry",
          facts: ["Catalogue item: 12 inch Resin Wall Clock", "Gold roman numerals included by default"],
        },
      },
      {
        id: "msg-7",
        sender: "customer",
        text: "Perfect, please go ahead with Roman numerals!",
        timestamp: "9:45 am",
      },
      {
        id: "msg-8",
        sender: "ai",
        text: "Your order for the 12 inch Resin Wall Clock is in production! 🌸 Production takes 7 days and we will update you as soon as curing finishes.",
        timestamp: "9:46 am",
      },
    ],
  },
  {
    id: "conv-3",
    customerId: "cust-3",
    customerName: "Divya Subramanian",
    customerHandle: "+91 97890 12345",
    channel: "whatsapp",
    state: "owner_handling",
    tag: "payment_pending",
    lastMessage: "I've shared the UPI QR code for the custom resin tray.",
    lastMessageTime: "1h ago",
    unread: false,
    isPriority: true,
    isFavourite: true,
    windowClosesAt: inHours(6),
    messages: [
      {
        id: "msg-9",
        sender: "customer",
        text: "Asha, can you make a 16x10 resin serving tray with black & gold veins?",
        timestamp: "8:30 am",
      },
      {
        id: "msg-10",
        sender: "owner",
        text: "Hi Divya! Yes absolutely, that size is ₹1,800 with brass handles. Curing will take 6 days.",
        timestamp: "8:35 am",
      },
      {
        id: "msg-11",
        sender: "owner",
        text: "I've shared the UPI QR code for the custom resin tray.",
        timestamp: "8:36 am",
      },
    ],
  },
  {
    id: "conv-4",
    customerId: "cust-4",
    customerName: "Karthik Raja",
    customerHandle: "+91 98940 54321",
    channel: "whatsapp",
    state: "ai_active",
    tag: "new_lead",
    lastMessage: "Clean with a soft microfiber cloth and mild soap water. Avoid direct extreme heat.",
    lastMessageTime: "3h ago",
    unread: false,
    isPriority: false,
    isFavourite: false,
    windowClosesAt: inHours(20),
    messages: [
      {
        id: "msg-12",
        sender: "customer",
        text: "How do I clean and maintain resin coasters?",
        timestamp: "7:12 am",
      },
      {
        id: "msg-13",
        sender: "ai",
        text: "Clean with a soft microfiber cloth and mild soap water. Avoid direct extreme heat or dishwasher to maintain the crystal glossy finish! 🌊",
        timestamp: "7:13 am",
        aiReasoning: {
          intent: "care_instructions",
          facts: ["Policy: Care instructions for epoxy resin products", "Dishwasher unsafe, micro-fiber clean"],
        },
      },
    ],
  },
  {
    id: "conv-5",
    customerId: "cust-5",
    customerName: "Priya Senthil",
    customerHandle: "@priya_lifestyle",
    channel: "instagram",
    state: "paused",
    tag: "follow_up",
    lastMessage: "Asha took over this conversation.",
    lastMessageTime: "4h ago",
    unread: false,
    isPriority: false,
    isFavourite: true,
    windowClosesAt: inHours(18),
    messages: [
      {
        id: "msg-14",
        sender: "customer",
        text: "Sent you photos of my living room wall for color matching!",
        timestamp: "Yesterday",
      },
      {
        id: "msg-15",
        sender: "system",
        text: "Asha paused AI for this chat.",
        timestamp: "Yesterday",
      },
    ],
  },
];

export const mockOrders: Order[] = [];


export const mockTemplates: Template[] = [
  {
    id: "tpl-1",
    name: "Order Confirmed (WhatsApp)",
    category: "delivery",
    channel: "whatsapp",
    body: "Hi {customerName}! 🎉 Your order for {product} is confirmed. Amount: ₹{amount}. Production starts now! 💕",
    variables: ["customerName", "product", "amount"],
    lastUpdated: "2 Oct, 4:15 pm",
  },
  {
    id: "tpl-2",
    name: "Dispatched (WhatsApp)",
    category: "delivery",
    channel: "whatsapp",
    body: "Great news {customerName}! 🚚 Your {product} is on the way! Tracking: {trackingId}. Expected: {deliveryDate}.",
    variables: ["customerName", "product", "trackingId", "deliveryDate"],
    lastUpdated: "2 Oct, 4:15 pm",
  },
  {
    id: "tpl-3",
    name: "Ready to Dispatch (WhatsApp)",
    category: "delivery",
    channel: "whatsapp",
    body: "Hi {customerName}, your {product} is ready! 🌸 We'll dispatch it shortly and share the tracking details.",
    variables: ["customerName", "product"],
    lastUpdated: "1 Oct, 11:20 am",
  },
  {
    id: "tpl-4",
    name: "Pongal Wishes + Offer (WhatsApp)",
    category: "festive",
    channel: "whatsapp",
    body: "Happy Pongal {customerName}! 🌾🎉 Special 15% off on all coaster sets this Pongal. Order now!",
    variables: ["customerName"],
    lastUpdated: "15 Jan, 09:00 am",
  },
  {
    id: "tpl-5",
    name: "Christmas Collection (WhatsApp)",
    category: "festive",
    channel: "whatsapp",
    body: "Merry Christmas {customerName}! 🎄 Our limited Christmas resin collection is live. Reply to order!",
    variables: ["customerName"],
    lastUpdated: "20 Dec, 10:00 am",
  },
  {
    id: "tpl-6",
    name: "Instagram Update (Instagram)",
    category: "general",
    channel: "instagram",
    body: "Hi {customerName}! Your order is on the way 🚚 Tracking: {trackingId}. DM us for anything!",
    variables: ["customerName", "trackingId"],
    lastUpdated: "3 Oct, 02:40 pm",
  },
];

export const mockBroadcasts: Broadcast[] = [
  {
    id: "bc-1",
    name: "Diwali Special Offer",
    date: "28 Sep, 10:30 am",
    template: "Festive Coasters 20% Off",
    audience: "Previous buyers · 89 recipients",
    sentCount: 89,
    deliveredPercent: 94,
    readPercent: 82,
    status: "sent",
  },
  {
    id: "bc-2",
    name: "New Collection Launch",
    date: "Tomorrow, 10:00 am",
    template: "Ocean Agate Clocks",
    audience: "Priority & Favourites · 42 recipients",
    sentCount: 42,
    deliveredPercent: 0,
    readPercent: 0,
    status: "scheduled",
  },
];

export const mockIGRules: IGRule[] = [
  {
    id: "rule-1",
    name: "Price enquiry",
    keywords: ["price", "cost", "rate", "how much"],
    replyType: "public_reply",
    replyText: "Hi! DM us for pricing 💕 @saba_art",
    isActive: true,
  },
  {
    id: "rule-2",
    name: "Customization ask",
    keywords: ["custom", "customize", "name", "customized"],
    replyType: "send_dm",
    replyText: "Yes we do custom orders! DM us 🌸",
    isActive: true,
  },
  {
    id: "rule-3",
    name: "Availability",
    keywords: ["available", "stock", "buy", "order"],
    replyType: "public_reply",
    replyText: "DM us to order! We ship all over India 🚚",
    isActive: true,
  },
];

export const mockIGComments: IGComment[] = [
  {
    id: "com-1",
    postThumbnail: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=100&auto=format&fit=crop&q=80",
    postTitle: "Deep Sea Ocean Coasters (Set of 4)",
    handle: "@sneha_crafts",
    comment: "Price please?? Love the gold leaf touches!",
    matchedRule: "Price enquiry",
    action: "replied_publicly",
    time: "18m ago",
  },
  {
    id: "com-2",
    postThumbnail: "https://images.unsplash.com/photo-1563861826100-9cb868fdbe1c?w=100&auto=format&fit=crop&q=80",
    postTitle: "12 inch Marble Resin Wall Clock",
    handle: "@vignesh_home",
    comment: "Can we get names embedded for our house warming?",
    matchedRule: "Customization ask",
    action: "dm_sent",
    time: "42m ago",
  },
  {
    id: "com-3",
    postThumbnail: "https://images.unsplash.com/photo-1615529182904-14819c35db37?w=100&auto=format&fit=crop&q=80",
    postTitle: "Large Resin Serving Tray with Gold Handles",
    handle: "@priya_interiors",
    comment: "Is this ready in stock right now?",
    matchedRule: "Availability",
    action: "replied_publicly",
    time: "1h ago",
  },
];

export const mockAuditLogs: AuditLogItem[] = [
  {
    id: "log-1",
    actor: { name: "Asha", role: "admin" },
    action: "settings_changed",
    actionLabel: "Settings changed",
    target: "Business hours updated",
    details: "Changed operating hours to 09:00–21:00 (Mon–Sun)",
    timestamp: "10m ago",
  },
  {
    id: "log-2",
    actor: { name: "Saba AI", role: "ai" },
    action: "auto_reply_sent",
    actionLabel: "Auto-reply sent",
    target: "Karthik Raja (+91 98940 54321)",
    details: "Answered care instruction question with factual policy facts",
    timestamp: "3h ago",
  },
  {
    id: "log-3",
    actor: { name: "System", role: "system" },
    action: "escalation_assigned",
    actionLabel: "Escalation assigned",
    target: "Kavya Ramesh (Refund request)",
    details: "Assigned to Asha due to customer priority badge",
    timestamp: "10:22 am",
  },
  {
    id: "log-4",
    actor: { name: "Priya", role: "staff" },
    action: "reply_sent",
    actionLabel: "Reply sent",
    target: "Divya Subramanian",
    details: "Confirmed UPI receipt and sent production start acknowledgement",
    timestamp: "Yesterday",
  },
];

export const mockUsers: StaffUser[] = [
  {
    id: "usr-1",
    name: "Asha",
    email: "asha@asharesins.com",
    role: "admin",
    isActive: true,
    lastLogin: "Just now",
  },
  {
    id: "usr-2",
    name: "Priya",
    email: "priya@asharesins.com",
    role: "staff",
    isActive: true,
    lastLogin: "2h ago",
  },
  {
    id: "usr-3",
    name: "Deepa",
    email: "deepa@asharesins.com",
    role: "staff",
    isActive: true,
    lastLogin: "Yesterday",
  },
  {
    id: "usr-4",
    name: "Rajesh",
    email: "rajesh@asharesins.com",
    role: "staff",
    isActive: false,
    lastLogin: "5 days ago",
  },
];

export interface DailyRevenuePoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface MessageVolumePoint {
  date: string;
  inbound: number;
  outbound: number;
}

export interface TopProductMetric {
  name: string;
  revenue: number;
  units: number;
  leadTime: string;
  image: string;
  sharePercent: number;
}

export interface ActivityEvent {
  id: string;
  title: string;
  description: string;
  time: string;
  type: "ai_reply" | "takeover" | "order" | "escalation" | "status_change";
}

export interface AnalyticsData {
  kpis: {
    revenue: { value: number; trend: string; isPositive: boolean; sparkline: number[] };
    orders: { value: number; trend: string; isPositive: boolean; sparkline: number[] };
    messages: { value: number; trend: string; isPositive: boolean; sparkline: number[] };
    autoReplyRate: { value: number; trend: string; isPositive: boolean; radial: number };
    escalations: { value: number; trend: string; isPositive: boolean; pulsing: boolean };
    avgResponse: { value: string; trend: string; isPositive: boolean; sparkline: number[] };
  };
  dailyRevenue: DailyRevenuePoint[];
  messageVolume: MessageVolumePoint[];
  channelSplit: {
    whatsapp: { revenue: number; percentage: number; count: number; orders: number };
    instagram: { revenue: number; percentage: number; count: number; orders: number };
  };
  topProducts: TopProductMetric[];
  aiPerformance: {
    autoRepliedPercent: number;
    escalatedPercent: number;
    escalationReasons: { reason: string; percentage: number; color: string }[];
  };
  recentActivity: ActivityEvent[];
}

export const mockAnalyticsData: Record<"all" | "whatsapp" | "instagram", Record<"7d" | "30d" | "custom", AnalyticsData>> = {
  all: {
    "7d": {
      kpis: {
        revenue: { value: 48500, trend: "↑12%", isPositive: true, sparkline: [4200, 3800, 5100, 4800, 6200, 7200, 8100] },
        orders: { value: 23, trend: "↑8%", isPositive: true, sparkline: [2, 3, 2, 4, 3, 4, 5] },
        messages: { value: 142, trend: "↑18%", isPositive: true, sparkline: [110, 125, 115, 138, 145, 150, 142] },
        autoReplyRate: { value: 78, trend: "↑5%", isPositive: true, radial: 78 },
        escalations: { value: 4, trend: "↓2", isPositive: true, pulsing: true },
        avgResponse: { value: "1m 24s", trend: "↓15s", isPositive: true, sparkline: [115, 105, 95, 90, 84] },
      },
      dailyRevenue: [
        { date: "27 Sep", revenue: 2800, orders: 1 },
        { date: "28 Sep", revenue: 4200, orders: 2 },
        { date: "29 Sep", revenue: 3500, orders: 2 },
        { date: "30 Sep", revenue: 5100, orders: 3 },
        { date: "1 Oct", revenue: 4800, orders: 2 },
        { date: "2 Oct", revenue: 6200, orders: 3 },
        { date: "3 Oct", revenue: 3900, orders: 2 },
        { date: "4 Oct", revenue: 4500, orders: 2 },
        { date: "5 Oct", revenue: 5800, orders: 3 },
        { date: "6 Oct", revenue: 4100, orders: 2 },
        { date: "7 Oct", revenue: 7200, orders: 4 },
        { date: "8 Oct", revenue: 5400, orders: 2 },
        { date: "9 Oct", revenue: 6800, orders: 3 },
        { date: "10 Oct", revenue: 7600, orders: 3 },
      ],
      messageVolume: [
        { date: "27 Sep", inbound: 85, outbound: 72 },
        { date: "28 Sep", inbound: 92, outbound: 80 },
        { date: "29 Sep", inbound: 104, outbound: 90 },
        { date: "30 Sep", inbound: 115, outbound: 102 },
        { date: "1 Oct", inbound: 128, outbound: 116 },
        { date: "2 Oct", inbound: 110, outbound: 98 },
        { date: "3 Oct", inbound: 135, outbound: 120 },
        { date: "4 Oct", inbound: 142, outbound: 128 },
        { date: "5 Oct", inbound: 130, outbound: 115 },
        { date: "6 Oct", inbound: 148, outbound: 134 },
        { date: "7 Oct", inbound: 155, outbound: 140 },
        { date: "8 Oct", inbound: 160, outbound: 145 },
        { date: "9 Oct", inbound: 148, outbound: 135 },
        { date: "10 Oct", inbound: 142, outbound: 126 },
      ],
      channelSplit: {
        whatsapp: { revenue: 38000, percentage: 78, count: 320, orders: 18 },
        instagram: { revenue: 10500, percentage: 22, count: 90, orders: 5 },
      },
      topProducts: [
        {
          name: "Ocean Coaster Set of 4",
          revenue: 14400,
          units: 12,
          leadTime: "5 days",
          image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=120&q=80",
          sharePercent: 30,
        },
        {
          name: "12 inch Resin Wall Clock",
          revenue: 11200,
          units: 4,
          leadTime: "7 days",
          image: "https://images.unsplash.com/photo-1563861826100-9cb868fdbe1c?auto=format&fit=crop&w=120&q=80",
          sharePercent: 23,
        },
        {
          name: "Large Resin Serving Tray",
          revenue: 9000,
          units: 5,
          leadTime: "6 days",
          image: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=120&q=80",
          sharePercent: 19,
        },
        {
          name: "Resin Photo Frame 5x7",
          revenue: 5700,
          units: 6,
          leadTime: "5 days",
          image: "https://images.unsplash.com/photo-1582562124811-c09040d0a901?auto=format&fit=crop&w=120&q=80",
          sharePercent: 12,
        },
        {
          name: "Resin Keychain Set of 3",
          revenue: 3600,
          units: 8,
          leadTime: "3 days",
          image: "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=120&q=80",
          sharePercent: 8,
        },
        {
          name: "Resin Bookmark Set of 4",
          revenue: 3040,
          units: 8,
          leadTime: "3 days",
          image: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=120&q=80",
          sharePercent: 7,
        },
        {
          name: "Geode Agate Coaster Set",
          revenue: 2400,
          units: 2,
          leadTime: "5 days",
          image: "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=120&q=80",
          sharePercent: 5,
        },
        {
          name: "Custom Floral Ring Dish",
          revenue: 1800,
          units: 3,
          leadTime: "4 days",
          image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=120&q=80",
          sharePercent: 4,
        },
      ],
      aiPerformance: {
        autoRepliedPercent: 78,
        escalatedPercent: 22,
        escalationReasons: [
          { reason: "Refund request", percentage: 28, color: "#EF4444" },
          { reason: "Complaint", percentage: 24, color: "#DC2626" },
          { reason: "Payment claim", percentage: 20, color: "#F59E0B" },
          { reason: "Unknown product", percentage: 16, color: "#D97706" },
          { reason: "Flagged phrase", percentage: 12, color: "#14B8A6" },
        ],
      },
      recentActivity: [
        {
          id: "act-1",
          title: "Asha took over chat with Kavya Ramesh",
          description: "Customer requested expedited hand-delivery in RS Puram",
          time: "3m ago",
          type: "takeover",
        },
        {
          id: "act-2",
          title: "Auto-reply answered delivery query",
          description: "Sent Coimbatore free delivery guidelines to Divya Subramanian",
          time: "12m ago",
          type: "ai_reply",
        },
        {
          id: "act-3",
          title: "Order #SA-1048 confirmed",
          description: "Arun Kumar placed order for 12\" Resin Wall Clock (₹2,800)",
          time: "28m ago",
          type: "order",
        },
        {
          id: "act-4",
          title: "Escalation: Payment claim",
          description: "Karthik Raja sent UPI screenshot requiring manual verification",
          time: "45m ago",
          type: "escalation",
        },
        {
          id: "act-5",
          title: "Auto-reply shared pricing & catalogue",
          description: "Answered Instagram comment query from Meena Krishnan",
          time: "1h ago",
          type: "ai_reply",
        },
        {
          id: "act-6",
          title: "Order #SA-1045 moved to 'In production'",
          description: "Priya started resin casting for Ocean Coaster Set",
          time: "2h ago",
          type: "status_change",
        },
      ],
    },
    "30d": {
      kpis: {
        revenue: { value: 184200, trend: "↑24%", isPositive: true, sparkline: [12000, 14000, 16500, 18400, 21000, 24500] },
        orders: { value: 92, trend: "↑18%", isPositive: true, sparkline: [14, 18, 22, 20, 26, 30] },
        messages: { value: 640, trend: "↑32%", isPositive: true, sparkline: [90, 110, 140, 180, 220, 260] },
        autoReplyRate: { value: 81, trend: "↑7%", isPositive: true, radial: 81 },
        escalations: { value: 14, trend: "↓4", isPositive: true, pulsing: true },
        avgResponse: { value: "1m 18s", trend: "↓22s", isPositive: true, sparkline: [130, 110, 95, 88, 78] },
      },
      dailyRevenue: [
        { date: "11 Sep", revenue: 5800, orders: 3 },
        { date: "15 Sep", revenue: 6400, orders: 4 },
        { date: "19 Sep", revenue: 7100, orders: 4 },
        { date: "23 Sep", revenue: 8900, orders: 5 },
        { date: "27 Sep", revenue: 6200, orders: 3 },
        { date: "1 Oct", revenue: 7900, orders: 4 },
        { date: "5 Oct", revenue: 9400, orders: 5 },
        { date: "10 Oct", revenue: 7600, orders: 3 },
      ],
      messageVolume: [
        { date: "11 Sep", inbound: 80, outbound: 68 },
        { date: "18 Sep", inbound: 110, outbound: 96 },
        { date: "25 Sep", inbound: 130, outbound: 118 },
        { date: "2 Oct", inbound: 145, outbound: 130 },
        { date: "10 Oct", inbound: 142, outbound: 126 },
      ],
      channelSplit: {
        whatsapp: { revenue: 142000, percentage: 77, count: 1250, orders: 71 },
        instagram: { revenue: 42200, percentage: 23, count: 370, orders: 21 },
      },
      topProducts: [
        {
          name: "Ocean Coaster Set of 4",
          revenue: 52800,
          units: 44,
          leadTime: "5 days",
          image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=120&q=80",
          sharePercent: 29,
        },
        {
          name: "12 inch Resin Wall Clock",
          revenue: 44800,
          units: 16,
          leadTime: "7 days",
          image: "https://images.unsplash.com/photo-1563861826100-9cb868fdbe1c?auto=format&fit=crop&w=120&q=80",
          sharePercent: 24,
        },
        {
          name: "Large Resin Serving Tray",
          revenue: 34200,
          units: 19,
          leadTime: "6 days",
          image: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=120&q=80",
          sharePercent: 19,
        },
        {
          name: "Resin Photo Frame 5x7",
          revenue: 22800,
          units: 24,
          leadTime: "5 days",
          image: "https://images.unsplash.com/photo-1582562124811-c09040d0a901?auto=format&fit=crop&w=120&q=80",
          sharePercent: 12,
        },
        {
          name: "Resin Keychain Set of 3",
          revenue: 15300,
          units: 34,
          leadTime: "3 days",
          image: "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=120&q=80",
          sharePercent: 8,
        },
      ],
      aiPerformance: {
        autoRepliedPercent: 81,
        escalatedPercent: 19,
        escalationReasons: [
          { reason: "Refund request", percentage: 30, color: "#EF4444" },
          { reason: "Complaint", percentage: 25, color: "#DC2626" },
          { reason: "Payment claim", percentage: 18, color: "#F59E0B" },
          { reason: "Unknown product", percentage: 15, color: "#D97706" },
          { reason: "Flagged phrase", percentage: 12, color: "#14B8A6" },
        ],
      },
      recentActivity: [
        {
          id: "act-1",
          title: "Asha took over chat with Kavya Ramesh",
          description: "Customer requested expedited hand-delivery in RS Puram",
          time: "3m ago",
          type: "takeover",
        },
        {
          id: "act-2",
          title: "Auto-reply answered delivery query",
          description: "Sent Coimbatore free delivery guidelines to Divya Subramanian",
          time: "12m ago",
          type: "ai_reply",
        },
        {
          id: "act-3",
          title: "Order #SA-1048 confirmed",
          description: "Arun Kumar placed order for 12\" Resin Wall Clock (₹2,800)",
          time: "28m ago",
          type: "order",
        },
        {
          id: "act-4",
          title: "Escalation: Payment claim",
          description: "Karthik Raja sent UPI screenshot requiring manual verification",
          time: "45m ago",
          type: "escalation",
        },
        {
          id: "act-5",
          title: "Auto-reply shared pricing & catalogue",
          description: "Answered Instagram comment query from Meena Krishnan",
          time: "1h ago",
          type: "ai_reply",
        },
        {
          id: "act-6",
          title: "Order #SA-1045 moved to 'In production'",
          description: "Priya started resin casting for Ocean Coaster Set",
          time: "2h ago",
          type: "status_change",
        },
      ],
    },
    custom: {
      kpis: {
        revenue: { value: 68900, trend: "↑16%", isPositive: true, sparkline: [4000, 5200, 6800, 7100, 8400] },
        orders: { value: 34, trend: "↑11%", isPositive: true, sparkline: [3, 4, 3, 5, 4] },
        messages: { value: 210, trend: "↑14%", isPositive: true, sparkline: [120, 140, 135, 160, 150] },
        autoReplyRate: { value: 79, trend: "↑4%", isPositive: true, radial: 79 },
        escalations: { value: 6, trend: "↓1", isPositive: true, pulsing: true },
        avgResponse: { value: "1m 20s", trend: "↓10s", isPositive: true, sparkline: [110, 100, 92, 85, 80] },
      },
      dailyRevenue: [
        { date: "1 Oct", revenue: 4800, orders: 2 },
        { date: "3 Oct", revenue: 3900, orders: 2 },
        { date: "5 Oct", revenue: 5800, orders: 3 },
        { date: "7 Oct", revenue: 7200, orders: 4 },
        { date: "9 Oct", revenue: 6800, orders: 3 },
        { date: "10 Oct", revenue: 7600, orders: 3 },
      ],
      messageVolume: [
        { date: "1 Oct", inbound: 128, outbound: 116 },
        { date: "3 Oct", inbound: 135, outbound: 120 },
        { date: "5 Oct", inbound: 130, outbound: 115 },
        { date: "7 Oct", inbound: 155, outbound: 140 },
        { date: "9 Oct", inbound: 148, outbound: 135 },
        { date: "10 Oct", inbound: 142, outbound: 126 },
      ],
      channelSplit: {
        whatsapp: { revenue: 54000, percentage: 78, count: 480, orders: 26 },
        instagram: { revenue: 14900, percentage: 22, count: 135, orders: 8 },
      },
      topProducts: [
        {
          name: "Ocean Coaster Set of 4",
          revenue: 20400,
          units: 17,
          leadTime: "5 days",
          image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=120&q=80",
          sharePercent: 30,
        },
        {
          name: "12 inch Resin Wall Clock",
          revenue: 16800,
          units: 6,
          leadTime: "7 days",
          image: "https://images.unsplash.com/photo-1563861826100-9cb868fdbe1c?auto=format&fit=crop&w=120&q=80",
          sharePercent: 24,
        },
      ],
      aiPerformance: {
        autoRepliedPercent: 79,
        escalatedPercent: 21,
        escalationReasons: [
          { reason: "Refund request", percentage: 28, color: "#EF4444" },
          { reason: "Complaint", percentage: 24, color: "#DC2626" },
          { reason: "Payment claim", percentage: 20, color: "#F59E0B" },
          { reason: "Unknown product", percentage: 16, color: "#D97706" },
          { reason: "Flagged phrase", percentage: 12, color: "#14B8A6" },
        ],
      },
      recentActivity: [
        {
          id: "act-1",
          title: "Asha took over chat with Kavya Ramesh",
          description: "Customer requested expedited hand-delivery in RS Puram",
          time: "3m ago",
          type: "takeover",
        },
        {
          id: "act-2",
          title: "Auto-reply answered delivery query",
          description: "Sent Coimbatore free delivery guidelines to Divya Subramanian",
          time: "12m ago",
          type: "ai_reply",
        },
      ],
    },
  },
  whatsapp: {
    "7d": {
      kpis: {
        revenue: { value: 38000, trend: "↑14%", isPositive: true, sparkline: [3200, 3100, 4200, 3900, 5100, 5800, 6200] },
        orders: { value: 18, trend: "↑10%", isPositive: true, sparkline: [2, 2, 2, 3, 3, 3, 4] },
        messages: { value: 110, trend: "↑20%", isPositive: true, sparkline: [85, 95, 90, 105, 112, 118, 110] },
        autoReplyRate: { value: 81, trend: "↑6%", isPositive: true, radial: 81 },
        escalations: { value: 3, trend: "↓2", isPositive: true, pulsing: true },
        avgResponse: { value: "1m 15s", trend: "↓18s", isPositive: true, sparkline: [100, 92, 85, 80, 75] },
      },
      dailyRevenue: [
        { date: "27 Sep", revenue: 2200, orders: 1 },
        { date: "28 Sep", revenue: 3400, orders: 2 },
        { date: "29 Sep", revenue: 2800, orders: 1 },
        { date: "30 Sep", revenue: 4100, orders: 2 },
        { date: "1 Oct", revenue: 3800, orders: 2 },
        { date: "2 Oct", revenue: 4900, orders: 2 },
        { date: "3 Oct", revenue: 3100, orders: 2 },
        { date: "4 Oct", revenue: 3600, orders: 2 },
        { date: "5 Oct", revenue: 4600, orders: 2 },
        { date: "6 Oct", revenue: 3200, orders: 1 },
        { date: "7 Oct", revenue: 5600, orders: 3 },
        { date: "8 Oct", revenue: 4200, orders: 2 },
        { date: "9 Oct", revenue: 5400, orders: 2 },
        { date: "10 Oct", revenue: 6000, orders: 2 },
      ],
      messageVolume: [
        { date: "27 Sep", inbound: 68, outbound: 58 },
        { date: "28 Sep", inbound: 74, outbound: 65 },
        { date: "29 Sep", inbound: 82, outbound: 72 },
        { date: "30 Sep", inbound: 91, outbound: 82 },
        { date: "1 Oct", inbound: 102, outbound: 94 },
        { date: "2 Oct", inbound: 88, outbound: 78 },
        { date: "3 Oct", inbound: 108, outbound: 96 },
        { date: "4 Oct", inbound: 112, outbound: 102 },
        { date: "5 Oct", inbound: 104, outbound: 92 },
        { date: "6 Oct", inbound: 118, outbound: 108 },
        { date: "7 Oct", inbound: 124, outbound: 112 },
        { date: "8 Oct", inbound: 128, outbound: 116 },
        { date: "9 Oct", inbound: 118, outbound: 108 },
        { date: "10 Oct", inbound: 110, outbound: 98 },
      ],
      channelSplit: {
        whatsapp: { revenue: 38000, percentage: 100, count: 320, orders: 18 },
        instagram: { revenue: 0, percentage: 0, count: 0, orders: 0 },
      },
      topProducts: [
        {
          name: "Ocean Coaster Set of 4",
          revenue: 12000,
          units: 10,
          leadTime: "5 days",
          image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=120&q=80",
          sharePercent: 32,
        },
        {
          name: "12 inch Resin Wall Clock",
          revenue: 11200,
          units: 4,
          leadTime: "7 days",
          image: "https://images.unsplash.com/photo-1563861826100-9cb868fdbe1c?auto=format&fit=crop&w=120&q=80",
          sharePercent: 29,
        },
        {
          name: "Large Resin Serving Tray",
          revenue: 7200,
          units: 4,
          leadTime: "6 days",
          image: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=120&q=80",
          sharePercent: 19,
        },
      ],
      aiPerformance: {
        autoRepliedPercent: 81,
        escalatedPercent: 19,
        escalationReasons: [
          { reason: "Refund request", percentage: 32, color: "#EF4444" },
          { reason: "Complaint", percentage: 24, color: "#DC2626" },
          { reason: "Payment claim", percentage: 22, color: "#F59E0B" },
          { reason: "Unknown product", percentage: 14, color: "#D97706" },
          { reason: "Flagged phrase", percentage: 8, color: "#14B8A6" },
        ],
      },
      recentActivity: [
        {
          id: "act-1",
          title: "Asha took over chat with Kavya Ramesh",
          description: "WhatsApp customer requested hand-delivery",
          time: "3m ago",
          type: "takeover",
        },
        {
          id: "act-2",
          title: "Auto-reply answered delivery query",
          description: "Sent Coimbatore free delivery guidelines to Divya Subramanian",
          time: "12m ago",
          type: "ai_reply",
        },
      ],
    },
    "30d": {
      kpis: {
        revenue: { value: 142000, trend: "↑26%", isPositive: true, sparkline: [9500, 11000, 13000, 14500, 16800, 19200] },
        orders: { value: 71, trend: "↑20%", isPositive: true, sparkline: [11, 14, 18, 16, 21, 24] },
        messages: { value: 495, trend: "↑34%", isPositive: true, sparkline: [70, 85, 110, 140, 170, 200] },
        autoReplyRate: { value: 83, trend: "↑8%", isPositive: true, radial: 83 },
        escalations: { value: 10, trend: "↓3", isPositive: true, pulsing: true },
        avgResponse: { value: "1m 12s", trend: "↓24s", isPositive: true, sparkline: [120, 100, 88, 80, 72] },
      },
      dailyRevenue: [
        { date: "11 Sep", revenue: 4500, orders: 2 },
        { date: "18 Sep", revenue: 6800, orders: 3 },
        { date: "25 Sep", revenue: 8200, orders: 4 },
        { date: "2 Oct", revenue: 7100, orders: 3 },
        { date: "10 Oct", revenue: 6000, orders: 2 },
      ],
      messageVolume: [
        { date: "11 Sep", inbound: 65, outbound: 55 },
        { date: "18 Sep", inbound: 85, outbound: 75 },
        { date: "25 Sep", inbound: 100, outbound: 90 },
        { date: "2 Oct", inbound: 115, outbound: 105 },
        { date: "10 Oct", inbound: 110, outbound: 98 },
      ],
      channelSplit: {
        whatsapp: { revenue: 142000, percentage: 100, count: 1250, orders: 71 },
        instagram: { revenue: 0, percentage: 0, count: 0, orders: 0 },
      },
      topProducts: [
        {
          name: "Ocean Coaster Set of 4",
          revenue: 42000,
          units: 35,
          leadTime: "5 days",
          image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=120&q=80",
          sharePercent: 30,
        },
      ],
      aiPerformance: {
        autoRepliedPercent: 83,
        escalatedPercent: 17,
        escalationReasons: [
          { reason: "Refund request", percentage: 34, color: "#EF4444" },
          { reason: "Complaint", percentage: 26, color: "#DC2626" },
          { reason: "Payment claim", percentage: 22, color: "#F59E0B" },
          { reason: "Unknown product", percentage: 12, color: "#D97706" },
          { reason: "Flagged phrase", percentage: 6, color: "#14B8A6" },
        ],
      },
      recentActivity: [
        {
          id: "act-1",
          title: "Asha took over chat with Kavya Ramesh",
          description: "WhatsApp customer requested hand-delivery",
          time: "3m ago",
          type: "takeover",
        },
      ],
    },
    custom: {
      kpis: {
        revenue: { value: 54000, trend: "↑18%", isPositive: true, sparkline: [3100, 4200, 5400, 5800, 6500] },
        orders: { value: 26, trend: "↑12%", isPositive: true, sparkline: [2, 3, 2, 4, 3] },
        messages: { value: 165, trend: "↑16%", isPositive: true, sparkline: [95, 110, 105, 125, 120] },
        autoReplyRate: { value: 82, trend: "↑5%", isPositive: true, radial: 82 },
        escalations: { value: 4, trend: "↓1", isPositive: true, pulsing: true },
        avgResponse: { value: "1m 14s", trend: "↓12s", isPositive: true, sparkline: [90, 82, 78, 74, 74] },
      },
      dailyRevenue: [
        { date: "1 Oct", revenue: 3800, orders: 2 },
        { date: "5 Oct", revenue: 4600, orders: 2 },
        { date: "10 Oct", revenue: 6000, orders: 2 },
      ],
      messageVolume: [
        { date: "1 Oct", inbound: 102, outbound: 94 },
        { date: "5 Oct", inbound: 104, outbound: 92 },
        { date: "10 Oct", inbound: 110, outbound: 98 },
      ],
      channelSplit: {
        whatsapp: { revenue: 54000, percentage: 100, count: 480, orders: 26 },
        instagram: { revenue: 0, percentage: 0, count: 0, orders: 0 },
      },
      topProducts: [
        {
          name: "Ocean Coaster Set of 4",
          revenue: 16800,
          units: 14,
          leadTime: "5 days",
          image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=120&q=80",
          sharePercent: 31,
        },
      ],
      aiPerformance: {
        autoRepliedPercent: 82,
        escalatedPercent: 18,
        escalationReasons: [
          { reason: "Refund request", percentage: 32, color: "#EF4444" },
          { reason: "Complaint", percentage: 24, color: "#DC2626" },
        ],
      },
      recentActivity: [],
    },
  },
  instagram: {
    "7d": {
      kpis: {
        revenue: { value: 10500, trend: "↑8%", isPositive: true, sparkline: [1000, 700, 900, 900, 1100, 1400, 1600] },
        orders: { value: 5, trend: "↑3%", isPositive: true, sparkline: [0, 1, 0, 1, 0, 1, 1] },
        messages: { value: 32, trend: "↑12%", isPositive: true, sparkline: [25, 30, 25, 33, 33, 32, 32] },
        autoReplyRate: { value: 69, trend: "↑2%", isPositive: true, radial: 69 },
        escalations: { value: 1, trend: "0", isPositive: true, pulsing: false },
        avgResponse: { value: "1m 45s", trend: "↓8s", isPositive: true, sparkline: [130, 120, 115, 110, 105] },
      },
      dailyRevenue: [
        { date: "27 Sep", revenue: 600, orders: 0 },
        { date: "28 Sep", revenue: 800, orders: 0 },
        { date: "29 Sep", revenue: 700, orders: 1 },
        { date: "30 Sep", revenue: 1000, orders: 1 },
        { date: "1 Oct", revenue: 1000, orders: 0 },
        { date: "2 Oct", revenue: 1300, orders: 1 },
        { date: "3 Oct", revenue: 800, orders: 0 },
        { date: "4 Oct", revenue: 900, orders: 0 },
        { date: "5 Oct", revenue: 1200, orders: 1 },
        { date: "6 Oct", revenue: 900, orders: 1 },
        { date: "7 Oct", revenue: 1600, orders: 1 },
        { date: "8 Oct", revenue: 1200, orders: 0 },
        { date: "9 Oct", revenue: 1400, orders: 1 },
        { date: "10 Oct", revenue: 1600, orders: 1 },
      ],
      messageVolume: [
        { date: "27 Sep", inbound: 17, outbound: 14 },
        { date: "28 Sep", inbound: 18, outbound: 15 },
        { date: "29 Sep", inbound: 22, outbound: 18 },
        { date: "30 Sep", inbound: 24, outbound: 20 },
        { date: "1 Oct", inbound: 26, outbound: 22 },
        { date: "2 Oct", inbound: 22, outbound: 20 },
        { date: "3 Oct", inbound: 27, outbound: 24 },
        { date: "4 Oct", inbound: 30, outbound: 26 },
        { date: "5 Oct", inbound: 26, outbound: 23 },
        { date: "6 Oct", inbound: 30, outbound: 26 },
        { date: "7 Oct", inbound: 31, outbound: 28 },
        { date: "8 Oct", inbound: 32, outbound: 29 },
        { date: "9 Oct", inbound: 30, outbound: 27 },
        { date: "10 Oct", inbound: 32, outbound: 28 },
      ],
      channelSplit: {
        whatsapp: { revenue: 0, percentage: 0, count: 0, orders: 0 },
        instagram: { revenue: 10500, percentage: 100, count: 90, orders: 5 },
      },
      topProducts: [
        {
          name: "Ocean Coaster Set of 4",
          revenue: 2400,
          units: 2,
          leadTime: "5 days",
          image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=120&q=80",
          sharePercent: 23,
        },
        {
          name: "Large Resin Serving Tray",
          revenue: 1800,
          units: 1,
          leadTime: "6 days",
          image: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=120&q=80",
          sharePercent: 17,
        },
      ],
      aiPerformance: {
        autoRepliedPercent: 69,
        escalatedPercent: 31,
        escalationReasons: [
          { reason: "Complaint", percentage: 38, color: "#DC2626" },
          { reason: "Refund request", percentage: 28, color: "#EF4444" },
          { reason: "Unknown product", percentage: 24, color: "#D97706" },
          { reason: "Flagged phrase", percentage: 10, color: "#14B8A6" },
        ],
      },
      recentActivity: [
        {
          id: "act-5",
          title: "Auto-reply shared pricing & catalogue",
          description: "Answered Instagram comment query from Meena Krishnan",
          time: "1h ago",
          type: "ai_reply",
        },
      ],
    },
    "30d": {
      kpis: {
        revenue: { value: 42200, trend: "↑16%", isPositive: true, sparkline: [2500, 3000, 3500, 3900, 4200, 5300] },
        orders: { value: 21, trend: "↑12%", isPositive: true, sparkline: [3, 4, 4, 4, 5, 6] },
        messages: { value: 145, trend: "↑22%", isPositive: true, sparkline: [20, 25, 30, 40, 50, 60] },
        autoReplyRate: { value: 72, trend: "↑3%", isPositive: true, radial: 72 },
        escalations: { value: 4, trend: "↓1", isPositive: true, pulsing: true },
        avgResponse: { value: "1m 38s", trend: "↓14s", isPositive: true, sparkline: [125, 115, 108, 102, 98] },
      },
      dailyRevenue: [
        { date: "11 Sep", revenue: 1300, orders: 1 },
        { date: "18 Sep", revenue: 1500, orders: 1 },
        { date: "25 Sep", revenue: 1900, orders: 1 },
        { date: "2 Oct", revenue: 1800, orders: 1 },
        { date: "10 Oct", revenue: 1600, orders: 1 },
      ],
      messageVolume: [
        { date: "11 Sep", inbound: 15, outbound: 13 },
        { date: "18 Sep", inbound: 25, outbound: 21 },
        { date: "25 Sep", inbound: 30, outbound: 28 },
        { date: "2 Oct", inbound: 30, outbound: 25 },
        { date: "10 Oct", inbound: 32, outbound: 28 },
      ],
      channelSplit: {
        whatsapp: { revenue: 0, percentage: 0, count: 0, orders: 0 },
        instagram: { revenue: 42200, percentage: 100, count: 370, orders: 21 },
      },
      topProducts: [
        {
          name: "Ocean Coaster Set of 4",
          revenue: 10800,
          units: 9,
          leadTime: "5 days",
          image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=120&q=80",
          sharePercent: 26,
        },
      ],
      aiPerformance: {
        autoRepliedPercent: 72,
        escalatedPercent: 28,
        escalationReasons: [
          { reason: "Complaint", percentage: 35, color: "#DC2626" },
          { reason: "Refund request", percentage: 25, color: "#EF4444" },
          { reason: "Unknown product", percentage: 25, color: "#D97706" },
          { reason: "Flagged phrase", percentage: 15, color: "#14B8A6" },
        ],
      },
      recentActivity: [],
    },
    custom: {
      kpis: {
        revenue: { value: 14900, trend: "↑10%", isPositive: true, sparkline: [900, 1000, 1400, 1300, 1900] },
        orders: { value: 8, trend: "↑5%", isPositive: true, sparkline: [1, 1, 1, 1, 1] },
        messages: { value: 45, trend: "↑8%", isPositive: true, sparkline: [25, 30, 30, 35, 30] },
        autoReplyRate: { value: 70, trend: "↑2%", isPositive: true, radial: 70 },
        escalations: { value: 2, trend: "0", isPositive: true, pulsing: false },
        avgResponse: { value: "1m 40s", trend: "↓6s", isPositive: true, sparkline: [115, 110, 105, 102, 100] },
      },
      dailyRevenue: [
        { date: "1 Oct", revenue: 1000, orders: 0 },
        { date: "5 Oct", revenue: 1200, orders: 1 },
        { date: "10 Oct", revenue: 1600, orders: 1 },
      ],
      messageVolume: [
        { date: "1 Oct", inbound: 26, outbound: 22 },
        { date: "5 Oct", inbound: 26, outbound: 23 },
        { date: "10 Oct", inbound: 32, outbound: 28 },
      ],
      channelSplit: {
        whatsapp: { revenue: 0, percentage: 0, count: 0, orders: 0 },
        instagram: { revenue: 14900, percentage: 100, count: 135, orders: 8 },
      },
      topProducts: [
        {
          name: "Ocean Coaster Set of 4",
          revenue: 3600,
          units: 3,
          leadTime: "5 days",
          image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=120&q=80",
          sharePercent: 24,
        },
      ],
      aiPerformance: {
        autoRepliedPercent: 70,
        escalatedPercent: 30,
        escalationReasons: [
          { reason: "Complaint", percentage: 40, color: "#DC2626" },
          { reason: "Refund request", percentage: 30, color: "#EF4444" },
        ],
      },
      recentActivity: [],
    },
  },
};

