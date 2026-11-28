export interface ProductSize {
  name: string;
  price: number;
}

export interface CustomOption {
  id: string;
  label: string;
  type: "select" | "text" | "toggle" | "slider";
  options?: string[];
  surcharge?: number;
}

export interface Product {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  collection: "For the Home" | "Everyday Pieces" | "Keepsakes" | "Wedding & Gifting";
  sizes: ProductSize[];
  leadTimeDays: number;
  customizable: boolean;
  customOptions: CustomOption[];
  materials: string[];
  placeholderBg: string; // Gallery placeholder styling
  accentColor: string;
  isActive: boolean;
  sortOrder: number;
  images: string[];
}

export const PRODUCTS: Product[] = [
  // 1. Featured Tea Table (User Screenshot Item)
  {
    slug: "resin-art-tea-tables",
    name: "Resin Art Tea Table",
    tagline: "Preserved botanical blooms and teak river centerpiece",
    description:
      "An exquisite living room centerpiece cast with seasoned Indian teak and botanical roses preserved under glass-clear epoxy resin. Features handcrafted brushed gold hairpin legs and heat-resistant glass finish.",
    collection: "For the Home",
    sizes: [
      { name: "Standard (16*16 inch)", price: 1200 },
      { name: "20*20 inch", price: 5000 },
      { name: "24*24 inch", price: 7500 },
    ],
    leadTimeDays: 30,
    customizable: true,
    customOptions: [
      {
        id: "theme",
        label: "Visual Theme",
        type: "select",
        options: ["Floral Garden River", "Deep Ocean Tide", "Amethyst Crystal Geode"],
      },
      {
        id: "flowers",
        label: "Floral Selection",
        type: "select",
        options: ["Garden Red & Blush Roses", "White Jasmine & Lavender", "Custom Keepsake Blooms"],
      },
      {
        id: "name-engraving",
        label: "Personalised Inscription / Monogram",
        type: "text",
        surcharge: 250,
      },
      {
        id: "leg-finish",
        label: "Hairpin Leg Finish",
        type: "select",
        options: ["Brushed Metallic Gold", "Matte Noir Black", "Natural Polished Teak"],
      },
    ],
    materials: ["Preserved natural roses", "Aged Indian teak wood", "Optical crystal epoxy resin", "Steel hairpin legs"],
    placeholderBg: "linear-gradient(135deg, #7C2D12 0%, #FAF8F5 100%)",
    accentColor: "#E8912B",
    isActive: true,
    sortOrder: 1,
    images: [
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1794621769/products/w7hqwjmubg4q4uri5xtv.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1794621652/products/s7hcj5qvba7appttujwt.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1794621663/products/yhka1ufwimrfvxah23gs.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1794621700/products/h4nmmlko1anja6bjclb6.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1794621765/products/bpret0derk5isetygjzx.jpg",
    ],
  },

  // 2. Featured Ocean Table (User Screenshot Item)
  {
    slug: "resin-art-table",
    name: "Live-Edge Ocean Resin Art Table",
    tagline: "Deep oceanic coastline on wild-grain teak slab",
    description:
      "A statement furniture piece capturing aerial sea coasts. Multi-depth ocean blues transition into pure lacing waves crashing against the raw natural live edge of aged Indian teak.",
    collection: "For the Home",
    sizes: [
      { name: "Accent Table (18*18 inch)", price: 2200 },
      { name: "Coffee Table (30*20 inch)", price: 6800 },
      { name: "Dining Console (48*24 inch)", price: 14500 },
    ],
    leadTimeDays: 30,
    customizable: true,
    customOptions: [
      {
        id: "ocean-gradient",
        label: "Sea Shade Palette",
        type: "select",
        options: ["Deep Pacific Cobalt", "Caribbean Turquoise Shore", "Midnight Emerald Wave"],
      },
      {
        id: "wave-density",
        label: "Sea Froth Lacing",
        type: "select",
        options: ["Triple Layered Swell", "Gentle Rolling Shoreline"],
      },
      {
        id: "name-engraving",
        label: "Corner Name or Date",
        type: "text",
        surcharge: 300,
      },
    ],
    materials: ["Solid Indian teak root slab", "Multi-layered tinted resin", "White pigment froth", "Cast iron base"],
    placeholderBg: "linear-gradient(135deg, #0E7C7B 0%, #1A1620 100%)",
    accentColor: "#0E7C7B",
    isActive: true,
    sortOrder: 2,
    images: [
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1794933534/products/syf9jblrfoluux51mn0n.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1794933510/products/kdy5grdhidyuxeptdvrr.png",
    ],
  },

  // 3. Ocean Coasters (Studio Classic)
  {
    slug: "ocean-coaster-set-4",
    name: "Ocean Coaster Set of 4",
    tagline: "Cellular seafoam waves on natural wood",
    description:
      "A set of four handcrafted circular coasters capturing rolling ocean foam over deep sea teal and turquoise. Finished with a heat-resistant top coat and raw cork base to protect your tabletop.",
    collection: "Everyday Pieces",
    sizes: [
      { name: "10cm round", price: 1200 },
      { name: "12cm round", price: 1500 },
    ],
    leadTimeDays: 5,
    customizable: true,
    customOptions: [
      {
        id: "color-theme",
        label: "Ocean Shade",
        type: "select",
        options: ["Deep Ocean Blue", "Turquoise Aqua", "Emerald Shore", "Midnight Black"],
      },
      {
        id: "name-engraving",
        label: "Initials or Family Name",
        type: "text",
        surcharge: 100,
      },
      {
        id: "gold-trim",
        label: "Gold Leafing Edge",
        type: "toggle",
        surcharge: 150,
      },
    ],
    materials: ["Artist-grade epoxy resin", "Natural sand", "Real sea shells", "Cork backing"],
    placeholderBg: "linear-gradient(135deg, #0E7C7B 0%, #1A1620 100%)",
    accentColor: "#0E7C7B",
    isActive: true,
    sortOrder: 3,
    images: [
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821799/knowvya/products/ocean-coaster-set-4/zkp0fxojb7dovk1jm664.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821798/knowvya/products/ocean-coaster-set-4/f9eyeybpqir54fipbjqd.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821481/knowvya/products/ocean-coaster-set-4/xfngfnitrugiznysqes1.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821480/knowvya/products/ocean-coaster-set-4/xxmvgjjxtb7soocnrntn.jpg",
    ],
  },

  // 4. 12in Wall Clock (Studio Signature)
  {
    slug: "resin-clock-12in",
    name: "12 inch Resin Wall Clock",
    tagline: "Our studio signature ocean timepiece",
    description:
      "Hand-poured across seven days on seasoned circular teak wood. Featuring 3D layered wave depth, silent sweeping quartz movement, and optional gilded Roman numerals.",
    collection: "For the Home",
    sizes: [
      { name: "12 inch", price: 2800 },
      { name: "16 inch", price: 4200 },
    ],
    leadTimeDays: 7,
    customizable: true,
    customOptions: [
      {
        id: "theme",
        label: "Visual Theme",
        type: "select",
        options: ["Ocean Waves & Sand", "Amethyst Crystal Geode", "Emerald Forest & Gold", "Monochrome Marble"],
      },
      {
        id: "dried-flowers",
        label: "Include Preserved Flowers",
        type: "toggle",
        surcharge: 200,
      },
      {
        id: "name-engraving",
        label: "Personalized Family Name or Date",
        type: "text",
        surcharge: 150,
      },
    ],
    materials: ["Seasoned Indian teak slab", "High-clarity UV resin", "Silent sweep quartz movement", "Brass hands"],
    placeholderBg: "linear-gradient(135deg, #1A1620 0%, #C47B2B 100%)",
    accentColor: "#E8912B",
    isActive: true,
    sortOrder: 4,
    images: [
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821802/knowvya/products/resin-clock-12in/tc5lmkkf7ooxtdg2atna.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821801/knowvya/products/resin-clock-12in/fqalkabgpa05kquvneyt.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821483/knowvya/products/resin-clock-12in/u7qdvxnqjdulkvr4ardg.jpg",
    ],
  },

  // 5. 10in Minimalist Clock
  {
    slug: "resin-wall-clock-10in",
    name: "10 inch Minimalist Resin Clock",
    tagline: "Compact wall timepiece with metallic geode veins",
    description:
      "Crafted for bedrooms and study corners. A seamless blend of resin pigment swirls, gold leaf veining, and whisper-quiet sweep hands.",
    collection: "For the Home",
    sizes: [
      { name: "10 inch", price: 1800 },
      { name: "12 inch", price: 2400 },
    ],
    leadTimeDays: 5,
    customizable: true,
    customOptions: [
      {
        id: "theme",
        label: "Geode Vein Color",
        type: "select",
        options: ["Gold Leaf & White Marble", "Rose Gold & Blush", "Silver & Charcoal"],
      },
      {
        id: "numbers",
        label: "Hour Markers",
        type: "select",
        options: ["Minimalist Dash Markers", "Roman Numerals", "Clean Markerless"],
      },
    ],
    materials: ["MDF circular base", "Pigmented UV resin", "Gold mica powder", "Quartz mechanism"],
    placeholderBg: "linear-gradient(135deg, #374151 0%, #111827 100%)",
    accentColor: "#C47B2B",
    isActive: true,
    sortOrder: 5,
    images: [
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821841/knowvya/products/resin-wall-clock-10in/mkcyvfw0sdqqawela5x0.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821517/knowvya/products/resin-wall-clock-10in/dkfftvlnefqdqbseyutr.jpg",
    ],
  },

  // 6. Large Serving Tray
  {
    slug: "resin-tray-large",
    name: "Large Resin Serving Tray",
    tagline: "Entertaining platter with brushed brass handles",
    description:
      "Built for slow mornings and evening hosting. Layered with food-safe resin over solid wood, framed by brass hardware that ages gracefully.",
    collection: "For the Home",
    sizes: [
      { name: "30cm x 20cm", price: 1800 },
      { name: "40cm x 25cm", price: 2400 },
    ],
    leadTimeDays: 6,
    customizable: true,
    customOptions: [
      {
        id: "color",
        label: "Resin Palette",
        type: "select",
        options: ["Smoky Emerald & Gold", "Ocean Surf Teal", "Rose Quartz & Dried Flora"],
      },
      {
        id: "handles",
        label: "Handle Finish",
        type: "select",
        options: ["Brushed Brass", "Matte Black Metal", "Rose Gold"],
      },
    ],
    materials: ["Solid Indian hardwood", "Food-safe certified epoxy", "Brushed brass hardware"],
    placeholderBg: "linear-gradient(135deg, #15803D 0%, #0E7C7B 100%)",
    accentColor: "#15803D",
    isActive: true,
    sortOrder: 6,
    images: [
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821805/knowvya/products/resin-tray-large/hj6o03hmggd5jiwsj5yl.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821803/knowvya/products/resin-tray-large/xmjcyaz0jdygaaypw5ja.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821486/knowvya/products/resin-tray-large/qlwovrdg9ndlz7livcpj.jpg",
    ],
  },

  // 7. Small Vanity Trinket Tray
  {
    slug: "resin-tray-small",
    name: "Botanical Vanity Trinket Tray",
    tagline: "Petite gold-rimmed resin platter for vanity and dresser",
    description:
      "Hand-poured trinket tray with delicate dried blossoms and 24k gold leaf edging. Sized perfectly for rings, perfumes, and everyday essentials.",
    collection: "For the Home",
    sizes: [
      { name: "Small (18cm x 12cm)", price: 850 },
      { name: "Medium (22cm x 14cm)", price: 1100 },
    ],
    leadTimeDays: 4,
    customizable: true,
    customOptions: [
      {
        id: "flower-theme",
        label: "Floral Blend",
        type: "select",
        options: ["Pressed Bougainvillea & Gold", "White Jasmine & Greenery", "Deep Purple Hydrangea"],
      },
    ],
    materials: ["Casting resin", "Real pressed Coimbatore garden flowers", "Gold leaf edging"],
    placeholderBg: "linear-gradient(135deg, #BE185D 0%, #FDF2F8 100%)",
    accentColor: "#BE185D",
    isActive: true,
    sortOrder: 7,
    images: [
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821845/knowvya/products/resin-tray-small/jk3faslq3kf4pddgj7lx.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821845/knowvya/products/resin-tray-small/yuw8hp1wtimyoswotesn.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821521/knowvya/products/resin-tray-small/pvwmng9fqqay54cckkdv.jpg",
    ],
  },

  // 8. Custom Floral Resin Nameplate
  {
    slug: "resin-nameplate",
    name: "Custom Floral Resin Nameplate",
    tagline: "Elegantly welcome guests to your home",
    description:
      "Durable entrance nameplate crafted with real preserved florals, golden lettering, and weatherproof UV-shielded resin on polished teak board.",
    collection: "For the Home",
    sizes: [
      { name: "Standard (12*6 inch)", price: 1400 },
      { name: "Large Villa (16*8 inch)", price: 2200 },
    ],
    leadTimeDays: 6,
    customizable: true,
    customOptions: [
      {
        id: "family-name",
        label: "Family Name / House Name",
        type: "text",
      },
      {
        id: "house-no",
        label: "Flat / House Number",
        type: "text",
      },
      {
        id: "font-style",
        label: "Lettering Typography",
        type: "select",
        options: ["Elegant Script Calligraphy", "Clean Architectural Serif", "Modern Minimalist"],
      },
    ],
    materials: ["Seasoned teak wood", "UV-resistant outdoor resin", "Brushed acrylic lettering", "Mounting studs"],
    placeholderBg: "linear-gradient(135deg, #1E293B 0%, #C47B2B 100%)",
    accentColor: "#E8912B",
    isActive: true,
    sortOrder: 8,
    images: [
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821823/knowvya/products/resin-nameplate/uoofowosoiez0aeke5tv.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821503/knowvya/products/resin-nameplate/msas79jy8fxagwlbncpy.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821501/knowvya/products/resin-nameplate/xqrlo9qtizb4rovgllz0.jpg",
    ],
  },

  // 9. Warm Glow Resin Night Lamp
  {
    slug: "resin-night-lamp",
    name: "Warm Glow Resin Night Lamp",
    tagline: "Subtle wood & resin ambient nightstand lamp",
    description:
      "Solid pine wood base embedded with USB warm LED illumination casting gentle light through underwater corals or frozen wild flowers.",
    collection: "For the Home",
    sizes: [
      { name: "Standard Cylinder", price: 1450 },
      { name: "Grand Cube (5x5 inch)", price: 1950 },
    ],
    leadTimeDays: 6,
    customizable: true,
    customOptions: [
      {
        id: "scene",
        label: "Internal Scene",
        type: "select",
        options: ["Deep Ocean Diver & Whale", "Enchanted Wildflower Meadow", "Golden Amber Quartz"],
      },
    ],
    materials: ["Natural pine wood base", "Crystal casting resin", "Warm 3000K LED module", "Braided USB cable"],
    placeholderBg: "linear-gradient(135deg, #1E1B4B 0%, #EAB308 100%)",
    accentColor: "#EAB308",
    isActive: true,
    sortOrder: 9,
    images: [
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821830/knowvya/products/resin-night-lamp/vcgelfouctdm6e4j9wm3.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821510/knowvya/products/resin-night-lamp/vj4h9vjeb6h6b5a3z9r0.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821509/knowvya/products/resin-night-lamp/gvhbv4i4x9j6v2n9r0a1.jpg",
    ],
  },

  // 10. Lotus Diya & Tea-light Candle Holder
  {
    slug: "resin-diya-candle-holder",
    name: "Lotus Diya & Tea-light Candle Holder",
    tagline: "Festive light holder for Diwali and pooja mandirs",
    description:
      "Cast in translucent jewel tones with embedded marigold petals and golden shimmer. Accommodates standard tea-light wax and brass diyas.",
    collection: "For the Home",
    sizes: [
      { name: "Single Diya", price: 650 },
      { name: "Pair of 2", price: 1150 },
    ],
    leadTimeDays: 3,
    customizable: true,
    customOptions: [
      {
        id: "color",
        label: "Jewel Tone",
        type: "select",
        options: ["Festive Marigold Orange", "Ruby Red & Gold", "Royal Emerald Green"],
      },
    ],
    materials: ["Heat-resistant resin", "Real dried marigold petals", "Metallic gold leaf"],
    placeholderBg: "linear-gradient(135deg, #B45309 0%, #FEF3C7 100%)",
    accentColor: "#B45309",
    isActive: true,
    sortOrder: 10,
    images: [
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821849/knowvya/products/resin-diya-candle-holder/daplhbr6abbyjeuo8p4w.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821849/knowvya/products/resin-diya-candle-holder/sksur1lakh0m7oc2lpke.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821525/knowvya/products/resin-diya-candle-holder/lambnqj94gycasnoakqp.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821524/knowvya/products/resin-diya-candle-holder/qimuwq645vgrgkcrgg1h.jpg",
    ],
  },

  // 11. Single Signature Wave Coaster
  {
    slug: "resin-coaster-single",
    name: "Single Signature Wave Coaster",
    tagline: "Individual ocean art coaster for workspace desks",
    description:
      "A single circular coaster featuring intricate resin wave froth. Perfect desktop companion for tea and coffee mugs.",
    collection: "Everyday Pieces",
    sizes: [
      { name: "Standard (10cm)", price: 350 },
      { name: "Grand Mug Size (12cm)", price: 450 },
    ],
    leadTimeDays: 3,
    customizable: true,
    customOptions: [
      {
        id: "shade",
        label: "Sea Shade",
        type: "select",
        options: ["Deep Ocean Blue", "Turquoise Aqua", "Emerald Shore"],
      },
    ],
    materials: ["UV resin", "Natural sand", "Cork base"],
    placeholderBg: "linear-gradient(135deg, #0284C7 0%, #E0F2FE 100%)",
    accentColor: "#0284C7",
    isActive: true,
    sortOrder: 11,
    images: [
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821844/knowvya/products/resin-coaster-single/j6msj8ukkkok8pzvpj9x.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821843/knowvya/products/resin-coaster-single/ykzxdzdbxiwzykge1hkz.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821519/knowvya/products/resin-coaster-single/gwq0csmohcuh3wftdg08.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821518/knowvya/products/resin-coaster-single/tqwz9mnywmnfke0gotud.jpg",
    ],
  },

  // 12. Desktop Resin Phone Dock
  {
    slug: "resin-mobile-stand",
    name: "Desktop Resin Phone Dock",
    tagline: "Dual-angle phone and tablet holder with real florals",
    description:
      "Sturdy two-piece interlocking resin dock providing optimal viewing angles for video calls and recipe reading in kitchens.",
    collection: "Everyday Pieces",
    sizes: [
      { name: "Phone Dock", price: 550 },
      { name: "Tablet Stand", price: 750 },
    ],
    leadTimeDays: 3,
    customizable: true,
    customOptions: [
      {
        id: "floral-theme",
        label: "Pressed Flora",
        type: "select",
        options: ["Pastel Wildflowers & Gold", "Ocean Wave Froth", "Smoky Geode Charcoal"],
      },
    ],
    materials: ["Cured hard epoxy resin", "Pressed garden flowers", "Gold leaf"],
    placeholderBg: "linear-gradient(135deg, #475569 0%, #F1F5F9 100%)",
    accentColor: "#475569",
    isActive: true,
    sortOrder: 12,
    images: [
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821839/knowvya/products/resin-mobile-stand/zxyrsg3kqqlad8g4lzuu.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821838/knowvya/products/resin-mobile-stand/gssrjmka59sxuflasokt.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821515/knowvya/products/resin-mobile-stand/tdtg3ouz6zkul5m7vrnt.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821514/knowvya/products/resin-mobile-stand/civqqxlbhg1rh3xaqjc6.jpg",
    ],
  },

  // 13. Resin Keychain Set of 3
  {
    slug: "keychain-set-3",
    name: "Resin Keychain Set of 3",
    tagline: "Pocket-sized resin keepsakes",
    description:
      "Three handcrafted keychains featuring dried baby's breath, gold foil, and glass-clear resin with stainless steel keyrings.",
    collection: "Everyday Pieces",
    sizes: [
      { name: "Set of 3 (Mixed Shapes)", price: 450 },
      { name: "Set of 6 (Gifting Pack)", price: 850 },
    ],
    leadTimeDays: 3,
    customizable: true,
    customOptions: [
      {
        id: "letters",
        label: "Enter 3 Initials / Letters",
        type: "text",
      },
      {
        id: "color",
        label: "Color Theme",
        type: "select",
        options: ["Blush Pink & Gold", "Teal Ocean & Sand", "Purple Amethyst", "Emerald Green"],
      },
    ],
    materials: ["Casting resin", "Real pressed flowers", "Gold foil", "Alloy swivel snap hook"],
    placeholderBg: "linear-gradient(135deg, #1E1A2B 0%, #7C5BD9 100%)",
    accentColor: "#7C5BD9",
    isActive: true,
    sortOrder: 13,
    images: [
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821807/knowvya/products/keychain-set-3/ixlqk9rmgjqm8grxazgx.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821806/knowvya/products/keychain-set-3/ron4nkq5rgjcsk4rug4y.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821487/knowvya/products/keychain-set-3/toefobcqmjnblvsyurm0.jpg",
    ],
  },

  // 14. Resin Bookmark Set of 4
  {
    slug: "bookmarks-set-4",
    name: "Resin Bookmark Set of 4",
    tagline: "For readers who cherish handmade things",
    description:
      "Ultra-slim 2mm cured resin bookmarks embedding real dried ferns, petals, and gold foil. Finished with a hand-tied silk tassel. Smooth and featherweight between pages.",
    collection: "Everyday Pieces",
    sizes: [
      { name: "Set of 4 Bookmarks", price: 380 },
      { name: "Set of 8 (Literary Gift Box)", price: 720 },
    ],
    leadTimeDays: 3,
    customizable: true,
    customOptions: [
      {
        id: "tassel-color",
        label: "Silk Tassel Shade",
        type: "select",
        options: ["Gold Silk", "Dusty Rose", "Sage Green", "Midnight Blue"],
      },
      {
        id: "name",
        label: "Name on Primary Bookmark",
        type: "text",
        surcharge: 50,
      },
    ],
    materials: ["Flexible resin formula", "Pressed botanicals", "Metallic foil", "Silk floss tassels"],
    placeholderBg: "linear-gradient(135deg, #0F766E 0%, #FAF8F5 100%)",
    accentColor: "#0E7C7B",
    isActive: true,
    sortOrder: 14,
    images: [
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821811/knowvya/products/bookmarks-set-4/pnwwt7e0hjertfmsyiec.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821491/knowvya/products/bookmarks-set-4/zf6hfqwt6b2fvbnnpmjb.jpg",
    ],
  },

  // 15. Botanical Photo Frame 5x7
  {
    slug: "photo-frame-5x7",
    name: "Resin Botanical Photo Frame 5x7",
    tagline: "Preserve your memories in crystal resin",
    description:
      "Handmade freestanding photo frame embedded with dried petals and metallic foil. Holds a standard 5x7 inch photograph with back easel.",
    collection: "Keepsakes",
    sizes: [
      { name: "5x7 inch", price: 950 },
      { name: "6x8 inch", price: 1350 },
    ],
    leadTimeDays: 5,
    customizable: true,
    customOptions: [
      {
        id: "frame-theme",
        label: "Border Theme",
        type: "select",
        options: ["Dried Rose Petals & Gold", "Pressed Ferns & White Baby Breath", "Ocean Beach Sand"],
      },
      {
        id: "custom-text",
        label: "Inscribed Date or Initials",
        type: "text",
        surcharge: 100,
      },
    ],
    materials: ["Epoxy resin", "Preserved floral petals", "24k gold leafing", "Easel back stand"],
    placeholderBg: "linear-gradient(135deg, #B45309 0%, #FEF3C7 100%)",
    accentColor: "#B45309",
    isActive: true,
    sortOrder: 15,
    images: [
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821809/knowvya/products/photo-frame-5x7/nauzskg3hbspgmutl0em.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821489/knowvya/products/photo-frame-5x7/cjirc04kfq6elknczfrx.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821488/knowvya/products/photo-frame-5x7/epfzvn3atteleuxam1fj.jpg",
    ],
  },

  // 16. Cone Crystal Ring Holder
  {
    slug: "resin-ring-holder",
    name: "Cone Crystal Ring Holder",
    tagline: "Hand-poured pyramid cone for wedding and engagement bands",
    description:
      "A crystal-clear faceted cone embedded with gold leaf flakes and baby's breath. Keeps rings safely displayed on nightstands or sinks.",
    collection: "Keepsakes",
    sizes: [
      { name: "Single Cone", price: 420 },
      { name: "Duo Set", price: 750 },
    ],
    leadTimeDays: 3,
    customizable: true,
    customOptions: [
      {
        id: "flake-color",
        label: "Foil Accents",
        type: "select",
        options: ["Pure Gold Leaf", "Rose Gold Shimmer", "Silver Leaf"],
      },
    ],
    materials: ["Crystal casting resin", "Dried baby breath", "Gold foil flakes"],
    placeholderBg: "linear-gradient(135deg, #F59E0B 0%, #FFFBEB 100%)",
    accentColor: "#F59E0B",
    isActive: true,
    sortOrder: 16,
    images: [
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821821/knowvya/products/resin-ring-holder/hs4e9yztenyj61rxiid8.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821820/knowvya/products/resin-ring-holder/snsssnfhl1jebuficgpm.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821500/knowvya/products/resin-ring-holder/fbhi7ypr8dty7odvfcbl.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821499/knowvya/products/resin-ring-holder/ghwe3od3bdsknulo0bgd.jpg",
    ],
  },

  // 17. Hexagonal Resin Keepsake Box
  {
    slug: "resin-jewellery-box",
    name: "Hexagonal Resin Keepsake Box",
    tagline: "Lidded jewelry sanctuary with gold foil flakes",
    description:
      "A handcrafted hexagonal lidded container for earrings, rings, and tiny treasures. Finished with polished bevels and gilded edges.",
    collection: "Keepsakes",
    sizes: [
      { name: "Medium (8cm wide)", price: 1150 },
      { name: "Large (12cm wide)", price: 1650 },
    ],
    leadTimeDays: 6,
    customizable: true,
    customOptions: [
      {
        id: "lid-design",
        label: "Lid Style",
        type: "select",
        options: ["Floral Geode Rim", "Ocean Wave Froth", "Golden Marble Swirl"],
      },
    ],
    materials: ["Resin casting", "Dried florals", "Gold leaf edging"],
    placeholderBg: "linear-gradient(135deg, #7E22CE 0%, #FAF5FF 100%)",
    accentColor: "#7E22CE",
    isActive: true,
    sortOrder: 17,
    images: [
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821825/knowvya/products/resin-jewellery-box/vqppp5r5sdc7g3besibh.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821505/knowvya/products/resin-jewellery-box/vh6s9vjeb6h6b5a3z9r0.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821504/knowvya/products/resin-jewellery-box/ghvbv4i4x9j6v2n9r0a1.jpg",
    ],
  },

  // 18. Free-Standing Monogram Letter
  {
    slug: "resin-monogram-letters",
    name: "Free-Standing Monogram Resin Letter",
    tagline: "Custom illuminated initial for nursery and bookshelves",
    description:
      "6-inch resin alphabet initials custom cast with your choice of floral petals, glitter, or ocean waves. Self-standing decorative piece.",
    collection: "Keepsakes",
    sizes: [
      { name: "Single Letter (6 inch)", price: 650 },
      { name: "Couple Set (2 Letters + &)", price: 1450 },
    ],
    leadTimeDays: 4,
    customizable: true,
    customOptions: [
      {
        id: "letter",
        label: "Desired Alphabet Letter(s)",
        type: "text",
      },
      {
        id: "color-scheme",
        label: "Color Scheme",
        type: "select",
        options: ["Rose Garden & Gold Leaf", "Ocean Turquoise & Shells", "Emerald Green Forest"],
      },
    ],
    materials: ["Epoxy resin", "Real dried flowers", "Gold foil flakes"],
    placeholderBg: "linear-gradient(135deg, #DB2777 0%, #FDF2F8 100%)",
    accentColor: "#DB2777",
    isActive: true,
    sortOrder: 18,
    images: [
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821856/knowvya/products/resin-monogram-letters/ecnbubo2vm0mckatqt9m.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821855/knowvya/products/resin-monogram-letters/dowhf2m5qb9eho2d0ckj.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821533/knowvya/products/resin-monogram-letters/yofarb7yli0qpydogw3l.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821532/knowvya/products/resin-monogram-letters/koleouuxaix9qnfqswbd.jpg",
    ],
  },

  // 19. Bridal Bouquet Preservation Block
  {
    slug: "wedding-bouquet-preservation",
    name: "Bridal Bouquet Resin Preservation Block",
    tagline: "Immortalise your wedding flowers forever",
    description:
      "We carefully dry and encapsulate your actual wedding bouquet blooms in optically crystal resin cubes or arches. A lifetime heirloom from your sacred day.",
    collection: "Wedding & Gifting",
    sizes: [
      { name: "Cube (6x6 inch)", price: 3500 },
      { name: "Arch Pillar (8x8 inch)", price: 5200 },
      { name: "Grand Monolith (10x10 inch)", price: 6800 },
    ],
    leadTimeDays: 14,
    customizable: true,
    customOptions: [
      {
        id: "shape",
        label: "Block Geometry",
        type: "select",
        options: ["Classic Square Cube", "Roman Archway", "Hexagon Pillar"],
      },
      {
        id: "couple-names",
        label: "Couple Names & Wedding Date",
        type: "text",
        surcharge: 200,
      },
    ],
    materials: ["Archival non-yellowing epoxy", "Client preserved wedding bouquet flowers", "Micro-polish finish"],
    placeholderBg: "linear-gradient(135deg, #BE185D 0%, #FFF1F2 100%)",
    accentColor: "#BE185D",
    isActive: true,
    sortOrder: 19,
    images: [
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821828/knowvya/products/wedding-bouquet-preservation/nxazlyehkwdsshiv6b6r.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821827/knowvya/products/wedding-bouquet-preservation/hruwweo1rwmhmteonguq.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821508/knowvya/products/wedding-bouquet-preservation/k4wcf553xir1l6x7b11d.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821507/knowvya/products/wedding-bouquet-preservation/bypw3h6yqllq4u28n674.jpg",
    ],
  },

  // 20. Varmala & Wedding Keepsake Block
  {
    slug: "saree-flower-preservation",
    name: "Varmala & Wedding Keepsake Block",
    tagline: "Preserve garland roses and wedding sacred petals",
    description:
      "Cast with dried Varmala roses, pearl accents, and wedding date engraving. Sealed in heirloom-grade archival resin.",
    collection: "Wedding & Gifting",
    sizes: [
      { name: "Heart Plaque (6 inch)", price: 2800 },
      { name: "Deep Square Block (8 inch)", price: 4400 },
    ],
    leadTimeDays: 10,
    customizable: true,
    customOptions: [
      {
        id: "inscription",
        label: "Wedding Date & Initials",
        type: "text",
      },
      {
        id: "foil-trim",
        label: "Gold Leaf Flakes Border",
        type: "toggle",
        surcharge: 150,
      },
    ],
    materials: ["Archival grade resin", "Preserved Varmala wedding flowers", "Gold foil flakes"],
    placeholderBg: "linear-gradient(135deg, #991B1B 0%, #FEF2F2 100%)",
    accentColor: "#991B1B",
    isActive: true,
    sortOrder: 20,
    images: [
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821850/knowvya/products/saree-flower-preservation/lzolc6a1apptauinpjfk.jpg",
      "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821526/knowvya/products/saree-flower-preservation/ec3u7tfddusezaarnfge.jpg",
    ],
  },
];

export const COLLECTIONS = [
  {
    slug: "for-the-home",
    name: "For the Home",
    description: "Functional art pieces for dining, bedside tables, and living spaces.",
    get count() {
      return PRODUCTS.filter((p) => p.collection === "For the Home").length;
    },
  },
  {
    slug: "everyday-pieces",
    name: "Everyday Pieces",
    description: "Handcrafted accessories that bring art into your daily routine.",
    get count() {
      return PRODUCTS.filter((p) => p.collection === "Everyday Pieces").length;
    },
  },
  {
    slug: "keepsakes",
    name: "Keepsakes",
    description: "Meaningful bespoke pieces designed to preserve life's golden moments.",
    get count() {
      return PRODUCTS.filter((p) => p.collection === "Keepsakes").length;
    },
  },
  {
    slug: "wedding-gifting",
    name: "Wedding & Gifting",
    description: "Bridal bouquet preservation, anniversary gifts, and wedding return favours.",
    get count() {
      return PRODUCTS.filter((p) => p.collection === "Wedding & Gifting").length;
    },
  },
] as const;

export function getProductBySlug(slug: string): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug);
}

export function getProductsByCollection(collectionName: string): Product[] {
  return PRODUCTS.filter(
    (p) =>
      p.collection.toLowerCase() === collectionName.toLowerCase() ||
      p.collection.toLowerCase().replace(/ & /g, "-").replace(/\s+/g, "-") === collectionName.toLowerCase()
  );
}
