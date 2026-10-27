import { fileURLToPath } from "node:url";
import { writeFileSync, readFileSync } from "node:fs";
import { config } from "../config.ts";
import { sql as dsql } from "drizzle-orm";
import { db, sql } from "./index.ts";
import { knowledgeBase, products } from "./schema.ts";
import { invalidateKBCache } from "../ai/prompt.ts";

interface ProductSeed {
  slug: string;
  name: string;
  description: string;
  price: number;
  sizes: Array<{ name: string; price: number }>;
  leadTimeDays: number;
  customizable: boolean;
  customOptions: string[];
}

export function generate300Products(): ProductSeed[] {
  const items: ProductSeed[] = [];
  const slugs = new Set<string>();

  function add(p: ProductSeed) {
    let slug = p.slug;
    let counter = 1;
    while (slugs.has(slug)) {
      slug = `${p.slug}-${counter++}`;
    }
    slugs.add(slug);
    items.push({ ...p, slug });
  }

  // 1. Clocks (35 items)
  const clockThemes = [
    { name: "Ocean Wave Shoreline", tag: "ocean", desc: "Realistic 3D turquoise shoreline ocean wave lacing with natural beach sand and gold accents." },
    { name: "Royal Amethyst Geode", tag: "amethyst", desc: "Raw authentic amethyst crystals, metallic purple pigments, and high-shine gold foil veining." },
    { name: "Emerald & Gold Marble", tag: "emerald", desc: "Deep emerald green with white marble flows and liquid gold leaf edging." },
    { name: "Rose Quartz Romance", tag: "rose-quartz", desc: "Gentle blush pink quartz crystals, pearl mica, and rose gold metallic trim." },
    { name: "Midnight Black & Gold", tag: "black-gold", desc: "Intense gloss black obsidian effect with shimmering 24k gold leaf rivers." },
    { name: "White Carrara Marble", tag: "carrara", desc: "Classic Italian Carrara marble look with subtle charcoal veining and brushed gold accents." },
    { name: "Sapphire Blue Agate", tag: "sapphire", desc: "Deep sapphire blue hues layered with sparkling crushed glass and silver leaf veins." },
  ];
  const clockStyles = ["Classic Roman", "Modern Arabic Numerals", "Minimalist Dot Markers", "Abstract Wave Flow", "Luxury Gilded Ring"];

  for (const theme of clockThemes) {
    for (const style of clockStyles) {
      if (items.length >= 35) break;
      add({
        slug: `clock-${theme.tag}-${style.toLowerCase().replace(/\s+/g, "-")}`,
        name: `${theme.name} Wall Clock (${style})`,
        description: `${theme.desc} Powered by a premium silent sweep quartz movement with ${style.toLowerCase()} dial.`,
        price: 2800,
        sizes: [
          { name: '12 inch Round', price: 2800 },
          { name: '16 inch Round', price: 4200 },
          { name: '18 inch Statement Round', price: 5600 },
          { name: '24 inch Luxury Grand Round', price: 8900 },
        ],
        leadTimeDays: 7,
        customizable: true,
        customOptions: ["dial_numerals_style", "needle_colour_gold_or_silver_or_black", "name_or_date_engraving", "custom_colour_palette"],
      });
    }
  }

  // 2. Varmala & Floral Preservations (35 items)
  const preservationShapes = [
    { name: "Hexagon Arch Block", slug: "hexagon", desc: "Geometric multi-dimensional hexagon block displaying dried flowers in full depth." },
    { name: "Classic Arched Milestone Block", slug: "arch", desc: "Graceful cathedral arched block for wedding florals and couple portraits." },
    { name: "Square Keepsake Cube", slug: "cube", desc: "Ultra-deep 3D cube encapsulating roses, baby's breath, and wedding cards." },
    { name: "Heart Keepsake Block", slug: "heart", desc: "Romantic heart-shaped preservation block with embedded gold leaf and wedding date." },
    { name: "Ring Holder Hexagon Cone Set", slug: "ring-holder", desc: "Hexagonal flower tray with a matching ring cone holder for nightstands." },
    { name: "Cathedral Dome Preservation", slug: "dome", desc: "Curved crystal dome protecting bridal garlands and varmalas forever." },
    { name: "Wedding Monogram Initial Block", slug: "monogram", desc: "Couple's combined alphabet letter cast with preserved bridal petals." },
  ];
  const floralStyles = ["Warm LED Wooden Base", "Gold Leaf & Couple Names", "Vintage Raw Edge", "Ring Slot & Wedding Card", "Minimalist Clear Cast"];

  for (const shape of preservationShapes) {
    for (const style of floralStyles) {
      if (items.length >= 70) break;
      add({
        slug: `varmala-${shape.slug}-${style.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        name: `Wedding Preservation ${shape.name} with ${style}`,
        description: `${shape.desc} Professionally dried through silica dehydration and bubble-free UV epoxy casting. Styled with ${style.toLowerCase()}.`,
        price: 2499,
        sizes: [
          { name: '6 inch Tabletop', price: 2499 },
          { name: '9 inch Statement Display', price: 4499 },
          { name: '12 inch Heirloom with Warm LED Wooden Base', price: 6999 },
        ],
        leadTimeDays: 18,
        customizable: true,
        customOptions: ["couple_names_and_wedding_date", "warm_led_wooden_base", "wedding_card_snippet", "gold_leaf_accents"],
      });
    }
  }

  // 3. Serving Trays & Platters (35 items)
  const trayBases = [
    { name: "Ocean Shoreline Serving Tray", tag: "ocean", desc: "Hand-poured 3D ocean wave foam, real beach sand, and mini seashells." },
    { name: "Raw Edge Agate Geode Platter", tag: "geode", desc: "Gilded metallic edge with crystal geode center and liquid marble." },
    { name: "Acacia Wood & Resin Charcuterie Board", tag: "acacia", desc: "Solid sustainable acacia wood combined with crystal ocean resin river." },
    { name: "Pressed Wildflower & Gold Foil Tray", tag: "floral", desc: "Naturally pressed seasonal botanicals with hand-laid 24k gold leaf." },
    { name: "Black Marble & Brass Vanity Tray", tag: "vanity", desc: "Gloss black marble resin with brushed brass metal handles for perfumes or snacks." },
  ];
  const trayVariants = ["Medium with Brushed Brass Handles", "Large with Matte Black Handles", "Round Lazy Susan Style", "Breakfast in Bed Rectangular", "Hexagon Geometric Platter", "Two-Tone Split Design", "Serving Platter with Dipping Bowl Cavity"];

  for (const base of trayBases) {
    for (const v of trayVariants) {
      if (items.length >= 105) break;
      add({
        slug: `tray-${base.tag}-${v.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        name: `${base.name} - ${v}`,
        description: `${base.desc} Finished in ${v.toLowerCase()}. Heat-safe up to 55°C and food-contact certified.`,
        price: 1450,
        sizes: [
          { name: 'Medium (25cm x 15cm)', price: 1450 },
          { name: 'Large (35cm x 22cm)', price: 2200 },
          { name: 'XL Grazing Board (45cm x 25cm)', price: 3100 },
        ],
        leadTimeDays: 6,
        customizable: true,
        customOptions: ["handle_finish_gold_brass_or_black", "custom_colour_tones", "name_engraving", "real_shells_or_foil"],
      });
    }
  }

  // 4. Coaster Sets (35 items)
  const coasterThemes = [
    { name: "Ocean Wave Lacing", tag: "ocean", desc: "Multi-layered translucent turquoise wave foam with sand textures." },
    { name: "Raw Geode Crystal Slice", tag: "geode", desc: "Natural geode contours with crushed glass and metallic gilded rims." },
    { name: "Pressed Wild Botanical", tag: "botanical", desc: "Real pressed daisies, ferns, and baby's breath flowers in clear resin." },
    { name: "Alcohol Ink Nebula", tag: "nebula", desc: "Vibrant alcohol ink blooms with shimmering brass shimmer rings." },
    { name: "White Marble & Gold Vein", tag: "marble", desc: "Timeless white marble look with liquid gold veins and hand-painted edges." },
  ];
  const coasterShapes = ["Round 10cm", "Hexagon 10cm", "Square 10cm", "Natural Organic Slice", "Scalloped Rim", "Octagon Facet", "Flower Bloom Shape"];

  for (const theme of coasterThemes) {
    for (const shape of coasterShapes) {
      if (items.length >= 140) break;
      add({
        slug: `coaster-${theme.tag}-${shape.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        name: `${theme.name} Coasters (${shape})`,
        description: `${theme.desc} Shaped in ${shape.toLowerCase()}. Includes rubber bumper feet to prevent surface scratching. Heat-resistant.`,
        price: 650,
        sizes: [
          { name: 'Set of 2 (10cm)', price: 650 },
          { name: 'Set of 4 (10cm)', price: 1200 },
          { name: 'Set of 6 with Matching Holder', price: 1750 },
        ],
        leadTimeDays: 5,
        customizable: true,
        customOptions: ["edge_colour_gold_or_silver_or_rose_gold", "initials_foil_engraving", "colour_palette"],
      });
    }
  }

  // 5. Nameplates & Signages (30 items)
  const nameplateStyles = [
    { name: "Teak Wood & Ocean Wave Nameplate", tag: "teak-ocean", desc: "Natural seasoned teak wood plank seamlessly fused with deep ocean resin." },
    { name: "White Carrara Marble & 3D Acrylic Nameplate", tag: "marble-acrylic", desc: "White marble resin with laser-cut mirror acrylic 3D raised letters." },
    { name: "Black Obsidian & Gold Backlit LED Nameplate", tag: "black-led", desc: "Luxurious black background with warm LED halo backlight and golden typography." },
    { name: "Emerald & Brass Apartment Nameplate", tag: "emerald-brass", desc: "Deep green marble texture with brass house numbers and family names." },
    { name: "Geode Crystal Villa Entrance Plaque", tag: "geode-villa", desc: "Statement geode crystals framing weatherproof outdoor UV resin." },
  ];
  const nameplateConfigs = ["Standard Apartment Door (12x8in)", "Villa Entrance (16x10in)", "Bungalow Statement (18x12in)", "Desk Executive Plaque (10x4in)", "Vertical Door Column (14x6in)", "Double Family Oval (15x10in)"];

  for (const st of nameplateStyles) {
    for (const cfg of nameplateConfigs) {
      if (items.length >= 170) break;
      add({
        slug: `nameplate-${st.tag}-${cfg.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        name: `${st.name} - ${cfg}`,
        description: `${st.desc} Size: ${cfg}. Weatherproof, UV-treated, and includes pre-drilled brass mounting studs.`,
        price: 2200,
        sizes: [
          { name: 'Standard (12 x 8 inch)', price: 2200 },
          { name: 'Premium (16 x 10 inch)', price: 3400 },
          { name: 'Luxury Backlit LED (18 x 12 inch)', price: 4800 },
        ],
        leadTimeDays: 10,
        customizable: true,
        customOptions: ["family_names", "house_number", "font_style", "led_backlight_warm_or_white", "mounting_hardware"],
      });
    }
  }

  // 6. Pooja & Festive Decor (30 items)
  const poojaBases = [
    { name: "Royal Haldi Yellow Pooja Thali Set", tag: "haldi-thali", desc: "Festive haldi yellow with real marigold petals, gold foil, and matching diya holder." },
    { name: "Maroon & Gold Auspicious Aarti Plate", tag: "maroon-aarti", desc: "Traditional auspicious maroon resin with sacred Om/Swastik motif and 2 katoris." },
    { name: "Emerald Green & Pearl Pooja Thali", tag: "emerald-pearl", desc: "Rich emerald green with real pearl border and agarbatti incense stand." },
    { name: "Clear Floral Diwali Hamper Plate", tag: "clear-diwali", desc: "Real preserved red rose petals and gold flakes in crystal clear food-safe resin." },
    { name: "White Marble Lotus Pooja Platter", tag: "lotus-marble", desc: "Lotus petals sculptured with Carrara white marble effect and brass diya cavity." },
  ];
  const poojaAddons = ["Standard 8 inch with 2 Katoris", "Royal 11 inch with Diya & Incense Stand", "Grand 13 inch Festive Aarti Set with Bell Cavity", "Pooja Kumkum Box Set of 3", "Diya Platter with 4 Embedded Diyas", "Shubh Labh Door Hanging Pair"];

  for (const b of poojaBases) {
    for (const a of poojaAddons) {
      if (items.length >= 200) break;
      add({
        slug: `pooja-${b.tag}-${a.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        name: `${b.name} (${a})`,
        description: `${b.desc} Includes ${a.toLowerCase()}. Wipe-clean smooth surface, resistant to oil and kumkum stains.`,
        price: 1350,
        sizes: [
          { name: '8 inch Festive Thali with 2 Katoris', price: 1350 },
          { name: '11 inch Royal Set with Diya & Incense Stand', price: 2400 },
          { name: '13 inch Grand Ceremonial Set', price: 3400 },
        ],
        leadTimeDays: 6,
        customizable: true,
        customOptions: ["motif_om_or_swastik_or_lotus", "colour_palette", "katori_count", "pearl_border"],
      });
    }
  }

  // 7. Tables & Furniture (25 items)
  const tableStyles = [
    { name: "Ocean Shoreline Round Coffee Table", tag: "ocean-table", desc: "Realistic 3D coastal ocean wave shoreline with genuine sand on sturdy hairpin legs." },
    { name: "Amethyst Geode Crystal Accent Table", tag: "amethyst-table", desc: "Luxurious purple amethyst crystals and gold leaf embedded in high-gloss resin." },
    { name: "Teak Wood River Side Table", tag: "river-table", desc: "Natural live-edge teak slabs connected by an emerald green translucent resin river." },
    { name: "Emerald & Gold Balcony End Table", tag: "emerald-table", desc: "Rich marble flows with metallic leafing, perfect for morning coffee on balconies." },
    { name: "Black Obsidian Statement Cocktail Table", tag: "obsidian-table", desc: "Deep dark mirror resin top with gold hairpin legs for contemporary lounges." },
  ];
  const tableSizes = ["16 inch Round (18in Hairpin Legs)", "20 inch Round (18in Hairpin Legs)", "24 inch Statement (20in Hairpin Legs)", "Square 18x18in End Table", "Nesting Table Pair (16in + 20in)"];

  for (const st of tableStyles) {
    for (const sz of tableSizes) {
      if (items.length >= 225) break;
      add({
        slug: `table-${st.tag}-${sz.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        name: `${st.name} - ${sz}`,
        description: `${st.desc} Size specification: ${sz}. Scratch-resistant high-durability epoxy top coat.`,
        price: 4800,
        sizes: [
          { name: '16 inch Round with Hairpin Legs', price: 4800 },
          { name: '20 inch Round with Hairpin Legs', price: 6500 },
          { name: '24 inch Statement Table', price: 8900 },
        ],
        leadTimeDays: 14,
        customizable: true,
        customOptions: ["hairpin_legs_matte_black_or_gold", "wave_shades", "tabletop_edge_finish"],
      });
    }
  }

  // 8. Photo Frames & Memory Keepsakes (25 items)
  const frameThemes = [
    { name: "Preserved Floral Tabletop Photo Frame", tag: "floral-frame", desc: "Encapsulates your printed photograph with real dried blossoms and gold foil." },
    { name: "Baby Milestone Keepsake Block", tag: "baby-block", desc: "Preserves baby's hospital ID tag, first curl, birth date and statistics." },
    { name: "Pet Memorial Photo & Fur Keepsake", tag: "pet-memorial", desc: "Treasured tribute block holding pet's photo, fur lock, and paw impression." },
    { name: "Ocean Shoreline Double Photo Frame", tag: "ocean-frame", desc: "Coastal beach sand and turquoise waves framing two complementary photos." },
    { name: "Gold Leaf Wedding Vow Display Frame", tag: "vow-frame", desc: "Displays wedding vows or song lyrics embedded in crystal-clear archival resin." },
  ];
  const frameConfigs = ["4x6 inch Tabletop with Stand", "5x7 inch Tabletop with Stand", "8x10 inch Wall Hanging", "6x6 inch 3D Depth Block", "Heart Shaped Easel Frame"];

  for (const ft of frameThemes) {
    for (const fc of frameConfigs) {
      if (items.length >= 250) break;
      add({
        slug: `frame-${ft.tag}-${fc.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        name: `${ft.name} (${fc})`,
        description: `${ft.desc} Styled in ${fc.toLowerCase()}. Built with non-yellowing crystal clear UV resin.`,
        price: 750,
        sizes: [
          { name: '4 x 6 inch Tabletop', price: 750 },
          { name: '5 x 7 inch Tabletop with Stand', price: 1050 },
          { name: '8 x 10 inch Wall / Desk Display', price: 1650 },
        ],
        leadTimeDays: 5,
        customizable: true,
        customOptions: ["photo_print_service_included", "floral_colours", "gold_leaf_accents", "dedication_text"],
      });
    }
  }

  // 9. Bookmarks & Stationery (25 items)
  const bookmarkStyles = [
    { name: "Wild Pressed Fern & Daisy Bookmarks", tag: "fern-bookmark", desc: "Natural pressed forest ferns, baby daisies, and metallic leaf." },
    { name: "Gold Vein Marble Resin Bookmarks", tag: "marble-bookmark", desc: "White and pastel alcohol ink marble with hand-painted gold edges." },
    { name: "Ocean Wave Foam Bookmarks", tag: "ocean-bookmark", desc: "Translucent ocean blue lacing with real sand and mini shell." },
    { name: "Celestial Star & Gold Flake Bookmarks", tag: "celestial-bookmark", desc: "Deep midnight blue resin with holographic star glitter and gold foil." },
    { name: "Custom Name Calligraphy Bookmarks", tag: "name-bookmark", desc: "Personalized metallic calligraphy vinyl with matching silk tassel." },
  ];
  const bookmarkBundles = ["Set of 2 with Silk Tassels", "Set of 4 with Silk Tassels", "Set of 6 Party Favor Pack", "Bookmark & Pen Stand Duo", "Bookmark with Matching Notebook Cover"];

  for (const bs of bookmarkStyles) {
    for (const bb of bookmarkBundles) {
      if (items.length >= 275) break;
      add({
        slug: `bookmark-${bs.tag}-${bb.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        name: `${bs.name} - ${bb}`,
        description: `${bs.desc} Package: ${bb.toLowerCase()}. Durable, slim, flexible and will not crease book pages.`,
        price: 220,
        sizes: [
          { name: 'Set of 2 Bookmarks', price: 220 },
          { name: 'Set of 4 Bookmarks', price: 380 },
          { name: 'Set of 6 Bookmarks Pack', price: 540 },
        ],
        leadTimeDays: 3,
        customizable: true,
        customOptions: ["tassel_colour", "name_calligraphy", "floral_selection"],
      });
    }
  }

  // 10. Accessories & Keychains (25 items)
  const accStyles = [
    { name: "Single Initial Alphabet Keychain", tag: "initial-keychain", desc: "Hand-poured alphabet letter with dried petals, gold flakes, and silk tassel." },
    { name: "Scannable Spotify Song Code Keychain", tag: "spotify-keychain", desc: "Laser engraved Spotify scannable song barcode over your choice of resin colours." },
    { name: "Resin Phone Grip / PopSocket", tag: "popsocket", desc: "3D ocean wave or geode crystal pop grip with 3M adhesive backing." },
    { name: "Shell Trinket & Jewelry Dish", tag: "trinket-dish", desc: "Ocean wave sea-shell shaped dish for rings, earrings, and nightstand jewelry." },
    { name: "Floral Compact Pocket Mirror", tag: "pocket-mirror", desc: "Dual magnifying and regular pocket mirror with pressed floral resin lid." },
  ];
  const accVariants = ["Rose Gold Glitter Accents", "Pressed Botanical & Gold Leaf", "Deep Ocean Wave", "White Marble & Initial", "Galaxy Nebula Pigment"];

  for (const as of accStyles) {
    for (const av of accVariants) {
      if (items.length >= 300) break;
      add({
        slug: `accessory-${as.tag}-${av.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        name: `${as.name} (${av})`,
        description: `${as.desc} Featuring ${av.toLowerCase()}. High-gloss scratch-resistant finish.`,
        price: 180,
        sizes: [
          { name: 'Single Piece', price: 180 },
          { name: 'Pair Set', price: 320 },
          { name: 'Set of 3 with Gift Box', price: 450 },
        ],
        leadTimeDays: 3,
        customizable: true,
        customOptions: ["alphabet_letter", "song_link_for_spotify", "tassel_colour", "foil_finish"],
      });
    }
  }

  return items;
}

async function run() {
  const businessId = config.BUSINESS_ID;
  console.log(`Generating 300 realistic resin art products for business: ${businessId}...`);

  const productList = generate300Products();
  console.log(`Generated ${productList.length} unique products.`);

  // Update docs/knowledge-base.json with all 300 products
  const KB_PATH = fileURLToPath(new URL("../../../docs/knowledge-base.json", import.meta.url));
  const currentKb = JSON.parse(readFileSync(KB_PATH, "utf-8"));
  currentKb.products = productList.map((p) => ({
    id: p.slug,
    name: p.name,
    description: p.description,
    price: p.price,
    sizes: p.sizes,
    lead_time_days: p.leadTimeDays,
    customizable: p.customizable,
    custom_options: p.customOptions,
  }));
  writeFileSync(KB_PATH, JSON.stringify(currentKb, null, 2), "utf-8");
  console.log(`Updated ${KB_PATH} with ${productList.length} products.`);

  // Update knowledgeBase table
  const { products: _unused, ...kbWithoutProducts } = currentKb;
  await db
    .insert(knowledgeBase)
    .values({ businessId, data: kbWithoutProducts })
    .onConflictDoUpdate({
      target: [knowledgeBase.businessId],
      set: {
        data: kbWithoutProducts,
        updatedAt: new Date(),
      },
    });

  // Upsert all 300 products into products table in batches
  console.log("Upserting into database `products` table in batches...");
  const batchSize = 25;
  for (let i = 0; i < productList.length; i += batchSize) {
    const chunk = productList.slice(i, i + batchSize);
    await db
      .insert(products)
      .values(
        chunk.map((p, idx) => ({
          businessId,
          slug: p.slug,
          name: p.name,
          description: p.description,
          sizes: p.sizes,
          leadTimeDays: p.leadTimeDays,
          customizable: p.customizable,
          customOptions: p.customOptions,
          images: [],
          isActive: true,
          sortOrder: i + idx,
        })),
      )
      .onConflictDoUpdate({
        target: [products.businessId, products.slug],
        set: {
          name: dsql`excluded.name`,
          description: dsql`excluded.description`,
          sizes: dsql`excluded.sizes`,
          leadTimeDays: dsql`excluded.lead_time_days`,
          customizable: dsql`excluded.customizable`,
          customOptions: dsql`excluded.custom_options`,
          isActive: true,
          sortOrder: dsql`excluded.sort_order`,
          updatedAt: new Date(),
        },
      });
    console.log(`Upserted ${Math.min(i + batchSize, productList.length)} / ${productList.length} products`);
  }

  try {
    await invalidateKBCache(businessId);
    console.log("Redis cache invalidated.");
  } catch {
    // Redis might be unreachable
  }

  console.log("Done! 300 knowledge base items seeded successfully.");
}

try {
  await run();
} catch (err) {
  console.error("Failed to seed 300 products:", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
