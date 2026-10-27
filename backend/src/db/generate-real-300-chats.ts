import { fileURLToPath } from "node:url";
import { writeFileSync, readFileSync } from "node:fs";
import { config } from "../config.ts";
import { db, sql } from "./index.ts";
import { knowledgeBase } from "./schema.ts";
import { invalidateKBCache } from "../ai/prompt.ts";

export interface ChatExample {
  customer: string;
  reply: string;
}

export function build300ResinArtChats(): ChatExample[] {
  const chats: ChatExample[] = [];

  // =========================================================================
  // CATEGORY 1: WEDDING VARMALA & FLORAL PRESERVATION (Chats 1 - 30)
  // =========================================================================
  const varmalaChats: [string, string][] = [
    [
      "We just got married yesterday in Kochi! How should we pack and courier our wedding varmala flowers to your Thrissur studio so they don't rot?",
      "Congratulations on your wedding! 💕 Please gently wrap each garland in dry newspaper or paper towels (never use plastic bags or ziplocks, as trapped moisture causes mold). Place them in a sturdy cardboard box and courier via DTDC or Speed Post. As soon as they reach our Thrissur studio, we begin our 7-10 day silica dehydration process to lock in their natural colors!"
    ],
    [
      "What are the sizes and prices for wedding varmala flower preservation blocks?",
      "Hello! 🌸 We offer 3 popular preservation sizes: a 6-inch Hexagon or Arch block at ₹2,499, a 9-inch Hexagon or Arch block at ₹4,499, and our luxury 12-inch Statement Block with an integrated warm LED wooden display base at ₹6,999. All include flower dehydration, bubble-free deep casting, and edge polishing!"
    ],
    [
      "Can you embed our wedding invitation card along with the garland flowers in the preservation block?",
      "Yes, absolutely! ✨ We frequently embed wedding invitation cards, marriage dates, and couple portraits alongside the preserved flowers. We coat the card with an archival sealant first so the epoxy resin doesn't make the paper translucent. A 9-inch or 12-inch block works best for this."
    ],
    [
      "Do red roses and white jasmine flowers change color when preserved in resin?",
      "Great question! Fresh flowers lose moisture during dehydration: deep red roses become a rich royal burgundy, while pure white jasmine or lilies take on a warm vintage ivory tone. We use premium UV-stabilized resin to ensure they maintain that vibrant preserved look for years without fading."
    ],
    [
      "How long does the entire varmala preservation process take from start to dispatch?",
      "It takes approximately 18 to 21 days in total. The flowers require 7 to 10 days of gentle moisture extraction in silica crystals. Once fully dry, we cast them in 3 to 4 distinct slow-curing resin layers to avoid overheating and bubbling, followed by sanding and high-gloss buffing."
    ],
    [
      "Can you make a matching ring holder cone using leftover petals from our garland?",
      "Yes! 💕 We love creating matching sets. If you order a 9-inch or 12-inch varmala block, we can use the remaining petals to craft a matching ring cone or a pair of floral coasters for ₹450 to ₹650. It makes a beautiful keepsake for your nightstand."
    ],
    [
      "Our wedding was 2 weeks ago and the flowers are already partially dried at home. Can they still be preserved?",
      "Yes, they can! As long as the flowers are free of fungal mold or dark mildew, partially air-dried flowers preserve wonderfully. You can share a clear photo of the flowers on this chat, and our artist will inspect them before you courier them over."
    ],
    [
      "Can we add a warm LED light wooden base to the 9-inch hexagon block?",
      "Yes, definitely! 🌟 We have handcrafted solid wood LED bases with a built-in USB cable and switch. You can add the warm LED base to a 9-inch block for an additional ₹800 (it is already included complimentary with our 12-inch statement block)."
    ],
    [
      "Can we preserve bridal chooda bangles or kaleeras inside resin along with the flowers?",
      "Yes, we can! For bridal kaleeras, chooda bangles, or mangalsutras, we recommend our deep 10x10-inch or 12x12-inch deep-cast square blocks (₹5,800 - ₹7,500) which have a 3-inch depth to comfortably encapsulate metallic jewelry without touching the mold edges."
    ],
    [
      "Do you provide a preview or video before dispatching the varmala block?",
      "Always! Once your flowers are dried, we share a dry layout mockup photo showing flower placement for your approval. After final curing and edge polishing, we send a high-definition 360-degree video of your finished piece before you clear the balance payment and we dispatch it."
    ],
    [
      "Can you preserve lotus flowers from a temple wedding?",
      "Yes! Sacred lotus flowers preserve beautifully. Because lotus petals are thick, we dehydrate them petal by petal and reassemble them inside the mold before pouring crystal clear resin. A 9-inch arch block (₹4,499) showcases a full blooming lotus perfectly."
    ],
    [
      "What happens if some flowers fall apart during transit to your studio?",
      "Don't worry! Garlands often shed a few loose petals during shipping. We carefully preserve individual petals and use them to create elegant floating petal borders or aesthetic background cascades around the main flower blooms."
    ],
    [
      "Can you engrave our couple names and wedding date in gold calligraphy on the block?",
      "Yes, we include complimentary gold, silver, or rose gold metallic vinyl calligraphy for couple names and the wedding date on all our preservation blocks! We apply it between resin layers so it never peels off."
    ],
    [
      "Is the preservation block fragile? How do you package it for courier to Bangalore?",
      "Our cured epoxy resin has the clarity of glass but is shatter-resistant like dense acrylic. For courier shipping, each block is wrapped in bubble wrap, encased in 1-inch thick custom-cut thermocol sheets, and packed inside a rigid corrugated box marked fragile."
    ],
    [
      "Do you offer urgent rush dispatch for flower preservation blocks?",
      "Because flower dehydration alone takes 7 to 10 days to prevent rotting, the fastest safe turnaround is 14 days with an express curing slot (₹450 rush fee). We never cut corners on drying, as improper dehydration leads to cloudiness inside the resin."
    ],
    [
      "Can we preserve our baby's hospital birth tag and first floral garland together?",
      "Yes, that's such a precious idea! 👶 We can combine your baby's hospital ID band, birth date plaque, and baby shower floral petals inside a 6x6-inch arched keepsake block for ₹2,900."
    ],
    [
      "What shape is more popular: Hexagon or Cathedral Arch?",
      "Both are gorgeous! The Hexagon block is our modern geometric bestseller and looks stunning on desks and shelves. The Cathedral Arch has a graceful, timeless silhouette that feels like an art piece. Both are priced identically at ₹2,499 for 6-inch and ₹4,499 for 9-inch."
    ],
    [
      "Can you cast gold flakes around the flowers?",
      "Yes, 24k liquid gold leaf flakes or rose gold flakes can be scattered around the flower petals at no extra charge. It gives a luxurious floating stardust appearance when light hits the resin!"
    ],
    [
      "Can we ship flowers from outside Kerala, like Mumbai or Delhi?",
      "Yes! We receive bridal flowers from across India via DTDC Express Air or Blue Dart. Just ensure you ship them within 24 to 48 hours of your wedding ceremony so they reach us in fresh condition."
    ],
    [
      "Can you preserve dried petals from a loved one's memorial service?",
      "Yes, we craft memorial preservation blocks with deep care and reverence. We can preserve memorial petals, a small photograph, and a heartfelt quote inside a 6-inch block (₹2,499) or keepsake cube (₹1,800)."
    ],
    [
      "How heavy is a 12-inch varmala preservation block?",
      "A 12-inch statement resin block weighs approximately 3.2 to 3.8 kilograms of solid high-density clear resin. It has substantial weight and sits very stably on any mantelpiece or coffee table."
    ],
    [
      "Do you use epoxy resin or polyester resin for flower casting?",
      "We strictly use premium, museum-grade casting epoxy resin imported for artists. It has low exothermic heat (so petals don't burn), maximum UV resistance against yellowing, and zero toxic VOC odors once fully cured."
    ],
    [
      "Can you include a photo inside the varmala block?",
      "Yes! We can place your favorite wedding portrait right in the center, framed by your garland flowers. We laminate the photo with UV protective film so the resin pigments never bleed into the photograph."
    ],
    [
      "Can you preserve orchid flowers from a bridal hair bun?",
      "Yes! Bridal orchids and baby's breath hairpins preserve exceptionally well and retain rich purple, white, and magenta colors. We can craft a tabletop 5x7-inch floral frame for ₹1,050."
    ],
    [
      "What is the booking advance for wedding flower preservation?",
      "We collect a 50% advance to confirm your booking and reserve drying chamber space. The remaining 50% plus shipping is payable only after you inspect and approve the HD video of your completed piece!"
    ],
    [
      "Can I preserve my bridal bouquet if it has succulents in it?",
      "Roses, lilies, carnations, and foliage preserve wonderfully, but fleshy succulents have very high water content and cannot be resin-cast. We can substitute the succulent with surrounding bouquet florals and eucalyptus leaves!"
    ],
    [
      "Can you make 4 mini keepsake cubes for both sets of parents from our wedding flowers?",
      "Yes! That is one of our most popular family gift requests. We can create 4 mini 3x3-inch keepsake floral cubes from your garland petals for ₹850 each."
    ],
    [
      "Will air bubbles appear inside the varmala block over time?",
      "No. We use a vacuum degassing chamber before pouring and apply gentle heat torches on each slow-cured layer to release all microscopic air bubbles. Once cured, resin is solid and permanently stable."
    ],
    [
      "Can you preserve flowers from an engagement ring platter?",
      "Yes! Engagement platter roses and carnations preserve beautifully. A 6-inch hexagon block (₹2,499) or a custom floral vanity dish (₹1,250) is the perfect size for engagement platter florals."
    ],
    [
      "What if I cannot courier the flowers immediately after the wedding?",
      "If there is a 2-day delay, keep the flower stems in fresh cold water in an air-conditioned room or refrigerator (do not freeze). Then pat them dry with tissue and box them for courier dispatch."
    ]
  ];

  for (const [customer, reply] of varmalaChats) {
    chats.push({ customer, reply });
  }

  // =========================================================================
  // CATEGORY 2: LUXURY RESIN WALL CLOCKS (Chats 31 - 60)
  // =========================================================================
  const clockChats: [string, string][] = [
    [
      "How much is your 12-inch ocean wave wall clock, and does it make a ticking sound?",
      "Hello! 🌸 Our 12-inch Ocean Wave Wall Clock is ₹2,800. It is fitted with an imported high-torque silent sweep quartz movement, meaning it is 100% silent with no annoying ticking sound at all—perfect for bedrooms and study rooms!"
    ],
    [
      "What sizes do your geode crystal wall clocks come in?",
      "Hi! 😊 Our Geode Wall Clocks are available in 4 standard sizes: 12 inch Round (₹2,800), 16 inch Round (₹4,200), 18 inch Statement Round (₹5,600), and a grand 24 inch Luxury Round (₹8,900) for large double-height living room walls."
    ],
    [
      "Can I choose Roman numerals instead of standard numbers on the clock?",
      "Yes, absolutely! You can choose between Classical Roman numerals, Modern Arabic digits, Minimalist dot markers, or a clean abstract dial with no numbers. We offer laser-cut acrylic numerals in mirror gold, silver, rose gold, and matte black."
    ],
    [
      "What kind of battery does the resin wall clock need?",
      "Our silent sweep quartz clock movements run on a single standard AA 1.5V battery. We recommend using standard carbon-zinc batteries (like Eveready or Panasonic) rather than heavy-duty alkaline batteries for longer movement life."
    ],
    [
      "Can you add our family name on the 16-inch clock for a housewarming gift?",
      "Yes, we can! ✨ We can elegantly customize your family name (e.g. 'The Menons' or 'Subramaniam Residence') along with an established year or anniversary date in 3D metallic lettering for no extra charge on 16-inch and 18-inch clocks."
    ],
    [
      "Are real crystals used in the geode wall clocks?",
      "Yes! We embed authentic raw quartz crystals, genuine amethyst chunks, and fire-polished crushed glass along the geode veins, highlighted with liquid 24k gold leaf. It sparkles brilliantly under indoor ambient lighting."
    ],
    [
      "How do we hang the resin wall clock on the wall? Is mounting hardware included?",
      "Every clock comes fitted with a heavy-duty metal wall-hanging bracket securely bolted onto the reinforced wooden backing. We also provide a wall screw and plastic anchor in the package, so it is ready to hang right out of the box!"
    ],
    [
      "Can you match the colors of an emerald green and gold clock to our living room sofa fabric?",
      "Yes, we can customize colors! You can share photos of your living room wall and upholstery with us here. Our artist will mix custom metallic mica pigments to match your emerald, teal, navy, or beige palette."
    ],
    [
      "How heavy is the 18-inch statement wall clock?",
      "The 18-inch clock weighs approximately 2.6 to 3.0 kilograms. It is built on a 10mm moisture-resistant engineered wood base coated in multiple resin layers, ensuring durability without excessive weight on your wall hook."
    ],
    [
      "Can we get black needles instead of gold on the white marble clock?",
      "Yes, certainly! We stock clock needles in metallic gold, mirror silver, and matte black in both minimalist baton and vintage spade styles. You can pick your favorite style during order confirmation."
    ],
    [
      "What size clock do you recommend for a 12x15 foot living room wall?",
      "For a typical 12x15 foot living room wall above a sofa or console table, our 16-inch (₹4,200) or 18-inch (₹5,600) clock is the ideal focal size. A 12-inch clock looks best in bedrooms, dining nooks, or home offices."
    ],
    [
      "Do your resin wall clocks come with any warranty?",
      "Yes! We provide a 1-year replacement warranty on the silent quartz clock movement. In the rare event that the machine stops working under normal battery use, we courier a brand-new replacement mechanism free of charge."
    ],
    [
      "Can you make an ocean clock with real sand and mini seashells?",
      "Yes! 🌊 Our Ocean Wave Shoreline clock features real natural beach sand, mini white cowrie shells, and realistic 3-layer wave foam that gives an authentic aerial beach view. It is one of our all-time bestsellers!"
    ],
    [
      "How long does it take to make and deliver a custom 16-inch geode clock?",
      "Handcrafting takes 7 days (layering crystals, pouring resin art, curing, installing dial numerals and machine testing for 24 hours). Delivery takes 2-4 days within Kerala (₹60) and 3-5 days across South India (₹90)."
    ],
    [
      "Can I order a clock with a marble and rose gold theme for my daughter's room?",
      "Yes, that's a lovely combination! 💕 We blend pearl white, soft blush pink mica, rose gold leafing, and clear rose quartz crystals. A 12-inch size is ₹2,800 and takes 7 days to create."
    ],
    [
      "Can you make a square-shaped resin clock instead of round?",
      "Yes! We can handcraft square resin clocks in 12x12 inch (₹3,000) and 16x16 inch (₹4,500) with rounded safety corners and polished bevelled edges."
    ],
    [
      "Will the clock hands bend during courier shipping?",
      "To prevent bent hands during transit, we pack the delicate clock hands in a rigid protective casing within the box. We include a simple 1-minute push-fit installation guide with numbered photos!"
    ],
    [
      "Can you make a black and gold marble clock with a glossy mirror shine?",
      "Yes! We use a high-gloss artist topcoat that cures to a glass-like 95% mirror reflection. The obsidian black with liquid gold veins looks extraordinarily premium under warm spotlighting."
    ],
    [
      "Can we incorporate dried flowers into a 12-inch wall clock?",
      "Yes! We can cast real pressed hydrangeas, baby's breath, and daisies inside the clock face around the dial numerals. A 12-inch floral clock is ₹2,800."
    ],
    [
      "Do you offer ready-to-dispatch wall clocks for last-minute anniversary gifts?",
      "Yes! We usually keep 2 to 3 ready-made 12-inch and 16-inch ocean and geode clocks at our studio for emergency gifting. We can dispatch them via local express courier within 24 hours. Message us to see today's ready stock!"
    ],
    [
      "Can you create an Islamic Ayatul Kursi calligraphy clock?",
      "Yes! We craft 16-inch and 18-inch luxury spiritual clocks featuring 3D mirror gold acrylic Ayatul Kursi calligraphy surrounding the central clock dial (₹4,800 - ₹6,200)."
    ],
    [
      "Can we wipe the clock face with Colin spray to clean dust?",
      "Please avoid chemical glass sprays like Colin or acetone, as harsh solvents can cloud the glossy resin finish. Simply wipe gently with a soft dry microfiber cloth or a cloth dampened with plain water!"
    ],
    [
      "Can you do a 24-inch luxury clock for our hotel reception area?",
      "Yes, we specialize in 24-inch grand statement clocks (₹8,900) on reinforced 12mm marine-grade wood with commercial high-torque silent movements. Lead time is 10 days."
    ],
    [
      "Can I customize the clock with both our wedding photo and geode crystals?",
      "Yes, we can seamlessly merge a high-resolution laminated couple photo on one half of the clock and crystal geode art on the other half! An 16-inch photo clock is ₹4,500."
    ],
    [
      "Can the clock face be made without any shiny glitter for a minimalist office?",
      "Yes, certainly! We can create a sophisticated matte or satin minimalist stone-finish clock using neutral greys, charcoal, and warm wood tones with zero glitter or crystals."
    ],
    [
      "Can you write a personal anniversary message on the back of the clock?",
      "Yes, we can hand-letter or engrave a personalized heartfelt message on the wooden backplate of the clock at no extra cost—it adds a very touching intimate feel for anniversary gifts!"
    ],
    [
      "Do you ship resin clocks to Delhi and Mumbai safely?",
      "Yes, weekly! We ship across India via Shiprocket air courier. Clocks are bolted to a wooden support template inside double-walled thermocol boxes so the hands and crystal rims never suffer transit stress."
    ],
    [
      "Can you make a turquoise beach clock with Roman numerals in 18 inches?",
      "Yes! Our 18-inch Turquoise Shoreline Clock with gold Roman numerals is ₹5,600. It features 3-layer wave lacing, beach sand, and silent gold sweep needles. Lead time is 7 days."
    ],
    [
      "Can you add floating hour markers instead of full numbers?",
      "Yes, 12 minimalist metallic bar studs or faceted crystal stones can serve as hour markers. It creates a sleek contemporary designer look!"
    ],
    [
      "Can I see videos of the clocks running before ordering?",
      "Of course! We have high-definition video reels of our 12-inch, 16-inch, and 18-inch clocks showcasing their silent motion and crystal sparkle. We'll share the links right on this chat!"
    ]
  ];

  for (const [customer, reply] of clockChats) {
    chats.push({ customer, reply });
  }

  // =========================================================================
  // CATEGORY 3: SERVING TRAYS, PLATTERS & BOARDS (Chats 61 - 95)
  // =========================================================================
  const trayChats: [string, string][] = [
    [
      "Can we serve hot snacks and samosas directly on the resin serving tray?",
      "Our trays are heat-safe up to 55°C, making them perfect for serving warm snacks, cookies, breads, and appetizers on plates or napkins! For boiling-hot dishes or sizzling pans straight from the stove, use a trivet to protect the glossy resin finish."
    ],
    [
      "Is the resin on your charcuterie boards food safe?",
      "Yes! We use fully cured, FDA-compliant food-contact safe epoxy resin. It is completely non-toxic and food-safe for dry food items like cheeses, crackers, dry fruits, and breads. On our wood boards, we recommend slicing cheese on the natural acacia wood section."
    ],
    [
      "What are the sizes and prices for your ocean wave serving trays?",
      "Hello! 🌊 We handcraft 3 tray sizes: Medium (25cm x 15cm) with metal handles at ₹1,450; Large (35cm x 22cm) at ₹2,200; and our Extra-Large Acacia Wood Grazing Board (45cm x 25cm) with ocean wave river at ₹3,100."
    ],
    [
      "What handle finishes do you offer on the trays?",
      "We provide two premium metal handle styles: Elegant Brushed Brass Gold and Contemporary Matte Black. Both are rust-resistant and securely bolted through the base with countersunk screws so they never wobble."
    ],
    [
      "How do we wash and clean the resin serving tray after a party?",
      "Cleaning is very easy! Simply wash gently with lukewarm water and a drop of mild dishwashing liquid using a soft sponge. Wipe dry immediately with a microfiber cloth. Never put resin trays in a dishwasher or submerge them in standing water."
    ],
    [
      "Can you customize a vanity perfume tray in black marble and gold for my dressing table?",
      "Yes! Our 30x20cm Black Obsidian & Gold Leaf vanity tray is ₹1,800. It looks gorgeous holding perfumes, watches, and skincare bottles, and features scratch-resistant silicone pads underneath to protect your dresser."
    ],
    [
      "Can we engrave a couple's names on the wooden part of the acacia charcuterie board?",
      "Yes! We offer laser engraving for couple names, family crests, or housewarming dates on the acacia wood section of our charcuterie boards (₹3,100) for a ₹200 personalization add-on."
    ],
    [
      "Will the handles become loose over time with heavy use?",
      "No. We use heavy-duty solid metal hardware with lock-washers bolted securely from underneath the tray, not surface glue. They easily support full sets of coffee mugs, teapots, and dessert bowls."
    ],
    [
      "Can you make a set of 4 matching coasters along with the large ocean tray?",
      "Yes! Our Ocean Hostess Combo includes the Large 35x22cm Ocean Wave Tray plus a matching Set of 4 Coasters for ₹3,100 (a ₹300 combo discount). It's our most popular housewarming gift bundle!"
    ],
    [
      "Can you embed real dried flowers inside a clear breakfast tray?",
      "Yes! We arrange real pressed hydrangeas, yellow daisies, and gold leaf flakes inside a crystal-clear resin tray. Our Large 35x22cm Pressed Floral Tray is ₹2,400."
    ],
    [
      "Can we use the resin tray outdoors on our garden patio table?",
      "Yes, for outdoor dining and entertaining, our trays are fantastic! Just store them indoors after your event, as prolonged direct tropical noon sun exposure over many months can gradually soften resin."
    ],
    [
      "Can you do a circular lazy susan turntable tray with ocean waves?",
      "Yes! We craft 14-inch rotating Round Lazy Susan platters with heavy-duty ball-bearing turntables underneath for dining table centers at ₹3,400. Lead time is 8 days."
    ],
    [
      "Is acacia wood better than mango wood for resin boards?",
      "We prefer seasoned sustainable Acacia wood because of its tight grain, natural water resistance, and rich dark amber tones. It pairs exceptionally well with resin ocean wave art without warping."
    ],
    [
      "Can you make an emerald green geode tray with real crystals?",
      "Yes! Our Emerald Geode Platter features raw crystal clusters in the center, metallic green marble flows, and hand-painted gold leaf edges with brushed brass handles for ₹2,400."
    ],
    [
      "Can we place wine glasses on the resin tray without them slipping?",
      "Yes. Cured resin has a smooth, high-gloss surface with natural surface grip. Wine glasses and stemware sit flat and steady on the level surface."
    ],
    [
      "What if someone accidentally cuts with a kitchen knife on the resin?",
      "Resin has a hard surface similar to dense hardwood, but sharp chef knives can leave cut marks. We always recommend slicing on the wooden side of the board and using the resin river side for serving and presentation."
    ],
    [
      "Can you make 3 identical ocean trays for corporate Diwali client gifts?",
      "Yes! We can handcraft matching ocean trays with customized company metal tags. Bulk orders of 3 or more trays receive an automatic 10% discount with customized corporate gift packaging."
    ],
    [
      "How heavy is the large 35x22cm resin tray?",
      "The large tray weighs approximately 1.4 kilograms empty. It is sturdy enough to feel luxurious and solid while being comfortable to carry with a full tea set."
    ],
    [
      "Can you add real sea glass and seashells to the tray?",
      "Yes! We hand-collect miniature white sea shells, natural beach sand, and smooth sea glass to create genuine 3D shoreline depth along the edges of our ocean trays."
    ],
    [
      "Can you do a rectangular breakfast tray with higher wooden raised borders?",
      "Yes! We craft Deep-Border Breakfast in Bed Trays (40x28cm with 2-inch solid pine side rails) and an ocean resin base for ₹2,800. Lead time is 7 days."
    ],
    [
      "What is the lead time for making a custom large tray?",
      "Handcrafting takes 6 days to pour multi-stage waves, cure, level, mount hardware, and buff. Courier delivery takes 2-4 days within Kerala and 3-5 days across South India."
    ],
    [
      "Can I get a hexagon-shaped serving platter?",
      "Yes! We offer 12-inch Hexagonal Geode Platters with metallic gold edge trim and mini gold ball feet for ₹1,850."
    ],
    [
      "Can you oil the wooden portion of the board before shipping?",
      "Yes, every wood & resin board is treated with two coats of food-grade mineral oil and organic beeswax conditioner before dispatch, leaving the wood with a rich, silky, water-repellent finish."
    ],
    [
      "How do we maintain the acacia wood over the years?",
      "Very simple! Whenever the wood looks slightly dry after multiple washes, apply a few drops of coconut oil or food-grade mineral oil with a cloth. It restores the wood's deep luster instantly."
    ],
    [
      "Can we order a tray in white and royal blue without sand?",
      "Yes! We can create abstract oceanic swirls using royal blue, turquoise, pearl white, and gold leaf with no sand at all for a clean contemporary aesthetic."
    ],
    [
      "Can you do a long 2-foot baguette grazing board?",
      "Yes! Our Long Acacia Grazing Platter measures 60cm x 18cm with an ocean wave handle end for ₹3,400. It's stunning for party appetizers and bread loaves."
    ],
    [
      "Do the handles rust if water splashes on them?",
      "No. Our handles are coated with anti-oxidation electroplating and lacquer to resist rust and tarnishing from kitchen moisture."
    ],
    [
      "Can you write 'The Bakers' in gold on the tray?",
      "Yes, personalized gold calligraphy text can be cast into the resin layer for ₹150. It stays permanently protected under the top clear coat!"
    ],
    [
      "Can we pick up the tray directly from your studio in Thrissur?",
      "Yes! Studio pickup is completely free. We will message you as soon as your tray completes final quality checks and packaging so you can pick it up at your convenience."
    ],
    [
      "Do you provide gift wrapping for wedding presents?",
      "Yes! We offer complimentary premium gift wrapping with satin ribbon and an artisan wax-sealed gift tag. Just mention your personalized gift note at checkout!"
    ],
    [
      "Can you do a two-tier afternoon tea cake stand in resin?",
      "Yes! We make Two-Tier Resin Cupcake & Dessert Stands with gold center hardware rods (10-inch base + 8-inch top tier) in geode or ocean theme for ₹2,600."
    ],
    [
      "Can we put ice buckets or chilled wine bottles on the tray?",
      "Yes! Cured resin is 100% waterproof and impervious to condensation cold or melting ice droplets. Just wipe with a dry cloth after use."
    ],
    [
      "Can you make a jewellery tray with ring compartments?",
      "Yes, we create luxury Vanity Dressing Trays with a built-in resin ring holder cone and trinket divider for ₹1,650."
    ],
    [
      "What if the tray gets minor surface scratches from keys after years of use?",
      "Because resin is solid, minor superficial scratches can be polished out at home in 2 minutes using a drop of car clear-coat polish or PlastX on a microfiber cloth!"
    ],
    [
      "Can you ship the large tray safely to Chennai?",
      "Yes! We ship to Chennai weekly via DTDC (₹90 shipping, 3-4 days transit). Trays are packed with corner protectors, double bubble wrap, and rigid cardboard."
    ]
  ];

  for (const [customer, reply] of trayChats) {
    chats.push({ customer, reply });
  }

  // =========================================================================
  // CATEGORY 4: RESIN COASTERS & DRINKWARE ACCESSORIES (Chats 96 - 125)
  // =========================================================================
  const coasterChats: [string, string][] = [
    [
      "Can I place a hot mug of filter coffee on your resin coasters?",
      "Yes, absolutely! ☕ Our coasters are heat-safe up to 55°C (130°F), which easily handles hot cups of coffee, tea, and warm mugs without leaving white heat rings or marks. Just avoid setting boiling-hot cookware directly from the flame onto them!"
    ],
    [
      "What sizes and set options do you offer for coasters?",
      "We offer 10cm coasters in three pack sizes: Set of 2 at ₹650, Set of 4 at ₹1,200, and our complete Set of 6 with a matching custom coaster holder at ₹1,750. Shapes include Round, Hexagon, Square, and Organic Geode Slices."
    ],
    [
      "Do the coasters slide around or scratch glass coffee tables?",
      "Not at all! Every coaster is fitted with 4 discreet clear silicone anti-slip bumper feet on the bottom. These raise the coaster slightly, prevent sliding, and guarantee zero scratches on glass or polished wood tables."
    ],
    [
      "Can you do ocean wave coasters with real gold leaf on the outer rims?",
      "Yes! ✨ Hand-painted gilded gold, silver, or rose gold edges are our signature finish. We seal the metallic edging with a protective clear coat so it never rubs off on your hands."
    ],
    [
      "Can you make 50 sets of coasters as return gifts for my daughter's wedding?",
      "Yes, we specialize in bulk wedding return gifts! For orders of 25+ sets, we offer a 15% bulk discount along with customized individual gift boxes and couple name tags. Lead time for 50 sets is 12 days."
    ],
    [
      "Can we get matching initials on each coaster?",
      "Yes! We can embed custom family initials or monograms in metallic gold or white vinyl between the resin layers for ₹25 per coaster."
    ],
    [
      "Are real dried botanicals used in the flower coasters?",
      "Yes! We hand-press real Kerala wildflowers, ferns, baby's breath, and bougainvillea petals in silica books before casting them into crystal clear transparent resin."
    ],
    [
      "Can I wash the coasters if sweet juice or coffee spills on them?",
      "Yes, resin is 100% non-porous and waterproof. Just rinse with mild soap and water under the tap and wipe dry with a soft cloth. Stains wipe off instantly!"
    ],
    [
      "Can you make coasters in alcohol ink with smoky white swirls?",
      "Yes! Our Alcohol Ink Nebula coasters feature vivid ink drops layered with metallic brass piñata ink and white cloud textures. Sets of 4 are ₹1,200."
    ],
    [
      "What is the thickness of each coaster?",
      "Each coaster has a substantial 8mm to 10mm thickness. They have a solid, weighted feel and do not stick to the bottom of sweaty chilled glasses when lifted."
    ],
    [
      "Can you make hexagonal coasters in dark emerald green and gold?",
      "Yes! Emerald Green & Liquid Gold Hexagons are one of our top-rated designs for modern dining rooms. A Set of 4 is ₹1,200."
    ],
    [
      "Do you provide a holder or stand for the coasters?",
      "Yes! Our Set of 6 includes a custom-crafted matching resin holder (₹1,750 total). For sets of 4, you can add a matching holder for ₹350."
    ],
    [
      "Can you do black obsidian coasters for a men's office desk?",
      "Yes! High-gloss black obsidian coasters with liquid gold or silver veins look exceptionally sharp in executive office spaces. Set of 4 is ₹1,200."
    ],
    [
      "Can we mix and match designs in a set of 4?",
      "Yes, you can choose 2 ocean wave coasters and 2 geode crystal coasters in one set at no extra charge! Just let us know your preferences during checkout."
    ],
    [
      "Will condensation from iced drinks damage the resin?",
      "Not at all. Epoxy resin is completely impervious to water, cold ice sweat, and moisture. Your furniture stays 100% protected."
    ],
    [
      "How soon can a set of 4 coasters be delivered to Bangalore?",
      "If you order today, handcrafting takes 5 days (or immediate dispatch if in our ready stock), and delivery to Bangalore takes 3-4 days via DTDC (₹90 shipping)."
    ],
    [
      "Can you print our corporate logo inside the coasters for corporate Diwali gifts?",
      "Yes! We embed high-resolution transparent corporate logos inside clear resin coasters for corporate gifting. We provide sample mockups within 24 hours."
    ],
    [
      "Can you do pastel baby pink and white coasters for a baby shower?",
      "Yes! We mix soft pastel pink and pearl white mica pigments with gold leaf flakes. Perfect as baby shower keepsakes!"
    ],
    [
      "Do you make terrazzo-style resin coasters?",
      "Yes! We hand-pour colorful resin stone chips into white or cream resin bases and diamond-sand them smooth for an authentic Italian terrazzo look (Set of 4: ₹1,350)."
    ],
    [
      "Can I get square coasters with rounded corners?",
      "Yes! We offer 10x10cm square coasters with gently rounded safety corners and hand-gilded metallic borders."
    ],
    [
      "What if one coaster arrives cracked in the courier?",
      "In the rare event of transit damage, simply share an unboxing video within 24 hours of delivery and we will recast and ship a replacement coaster immediately at zero cost!"
    ],
    [
      "Can we order just a pair of 2 coasters as a couple's gift?",
      "Yes! Our Set of 2 coasters is ₹650, packed in an elegant craft gift pouch. Ideal for intimate anniversary or Valentine's gifts."
    ],
    [
      "Can you do celestial midnight blue coasters with silver glitter stars?",
      "Yes! Deep midnight navy blue with holographic silver flakes and constellations looks magical on glass desks. Set of 4 is ₹1,200."
    ],
    [
      "Can we put hot brass tea kettles on the coasters?",
      "For small teacups and mugs up to 55°C, coasters work wonderfully. For boiling brass kettles or hot stovetop teapots, we recommend our larger Acacia Wood Trivets (₹850)."
    ],
    [
      "Can you make natural agate slice shape coasters with raw geode edges?",
      "Yes! We use organic agate silicone molds with realistic rough quartz edge silhouettes and gilded gold leaf rims for ₹1,200 per set of 4."
    ],
    [
      "Are these coasters handmade or machine molded?",
      "Every single coaster is hand-poured, pigmented, layered, and edge-finished individually by our artisans in Kerala. No two pieces are ever identical!"
    ],
    [
      "Can you include personalized names like 'Aarav' and 'Ananya' on a pair of coasters?",
      "Yes! Personalized couple name coasters are ₹750 for the pair, including gold calligraphy lettering and gift wrapping."
    ],
    [
      "Can we order replacement coasters if one gets lost later?",
      "Yes! We keep your color recipe and design records on file so we can recreate a matching single coaster for you at any time in the future."
    ],
    [
      "Do the coasters stick together when stacked?",
      "No. The silicone anti-slip feet on the bottom of each coaster keep them naturally spaced when stacked in their holder, preventing any vacuum sticking."
    ],
    [
      "Can you do ready-to-ship coasters for pickup today in Thrissur?",
      "Yes! We keep popular ocean wave and geode sets in ready stock at our Thrissur studio. Message us to see today's available designs for instant pickup!"
    ]
  ];

  for (const [customer, reply] of coasterChats) {
    chats.push({ customer, reply });
  }

  // =========================================================================
  // CATEGORY 5: ENTRANCE NAMEPLATES & HOUSE PLAQUES (Chats 126 - 160)
  // =========================================================================
  const nameplateChats: [string, string][] = [
    [
      "Can your resin house nameplates withstand heavy Kerala monsoon rain and outdoor sun?",
      "Yes, absolutely! 🌧️ We use weather-resistant, UV-stabilized exterior-grade epoxy resin and marine-grade teak wood. The 3D raised acrylic letters are laser-cut and waterproof, ensuring the nameplate will not rot, swell, peel, or fade in outdoor conditions."
    ],
    [
      "What are the sizes and prices for custom home entrance nameplates?",
      "Hello! 🏡 We handcraft 3 primary entrance sizes: Standard Apartment Door (12x8 inch acrylic & resin) at ₹2,200; Villa & Independent House (16x10 inch teak wood & resin) at ₹3,400; and our Luxury Backlit LED Nameplate (18x12 inch) at ₹4,800."
    ],
    [
      "How are the 3D letters made on the nameplate?",
      "We precision laser-cut 3mm thick cast acrylic letters in your choice of Mirror Gold, Mirror Silver, Gloss White, or Matte Black. These are securely bonded onto the resin base, giving an impressive 3D embossed look with crisp shadows."
    ],
    [
      "How do we mount the nameplate onto an exterior wall or wooden door?",
      "Every nameplate comes with pre-drilled corner holes and premium solid brass mirror screw studs (with matching gold or silver caps). For flat apartment doors, we can also provide industrial 3M VHB mounting tape upon request!"
    ],
    [
      "How does the electrical connection work for the backlit LED nameplate?",
      "Our 18x12-inch Backlit LED Nameplates come with an integrated waterproof warm-white LED strip behind an acrylic diffuser, plus a 1.5-meter cable and 12V 2A power adapter that plugs into any standard household socket."
    ],
    [
      "Can we include our house number and family names together?",
      "Yes! We can fit your house number, family surname, first names, and even a small welcome quote or apartment flat number. We share a digital font layout mockup for your approval before cutting."
    ],
    [
      "Can you make a nameplate with solid teak wood and an ocean resin river?",
      "Yes! 🌊 That is our signature 16x10-inch Teak & Ocean Nameplate (₹3,400). We hand-select live-edge seasoned teak planks and pour 3D turquoise wave foam through the center. It looks stunning at modern home entrances!"
    ],
    [
      "How long does it take to make and deliver a custom nameplate?",
      "Because nameplates involve custom typography design, laser cutting, multi-layer resin pouring, and weatherproofing, handcrafting takes 10 days. Courier shipping takes 2-4 days within Kerala and 3-5 days across India."
    ],
    [
      "Can you include regional language scripts or only English?",
      "We design and laser-cut clean, beautiful scripts in English, Malayalam, Hindi, Tamil, and Devanagari! Many clients prefer English for the address and regional script for the family name."
    ],
    [
      "Can we see a font mockup before you start making it?",
      "Always! Within 24 hours of your booking advance, our graphic designer sends you 3 font layout options showing letter placement, sizing, and colors on your chosen background so you can pick your favorite."
    ],
    [
      "Can you do a white Carrara marble resin nameplate with gold letters?",
      "Yes! White marble resin with liquid gold veining and mirror gold acrylic letters is ₹2,200 for 12x8 inch. It looks exceptionally elegant on dark wooden doors!"
    ],
    [
      "Can you make a vertical narrow nameplate for apartment pillar columns?",
      "Yes! We craft 14x6-inch and 16x6-inch vertical column nameplates specifically tailored for narrow wall pillars next to apartment calling bells (₹2,400)."
    ],
    [
      "Do the acrylic letters fade or peel off after a few years?",
      "No. We use industrial exterior acrylic bonding cement that chemically fuses the letters onto the resin substrate. They cannot be peeled off by hand or rain."
    ],
    [
      "Can you add a Ganesha, Om, or Cross icon on the nameplate?",
      "Yes, we can laser-cut and embed spiritual symbols like Lord Ganesha, Om, Swastik, Islamic Crescent, or Christian Cross at the top of the nameplate at no extra charge!"
    ],
    [
      "Can we get a double-family nameplate for two brothers sharing a house?",
      "Yes! We craft 16x10-inch and 18x12-inch double nameplates with dual family names and house numbers clearly structured (₹3,400 - ₹4,800)."
    ],
    [
      "What if our door has direct afternoon sun exposure?",
      "We apply an extra automotive-grade UV-filtering clear ceramic topcoat on all outdoor nameplates to prevent yellowing or heat distortion from harsh direct afternoon sunlight."
    ],
    [
      "Can you do a doctor or lawyer office desk nameplate?",
      "Yes! We make 10x4-inch executive desk triangular name wedges with doctor/advocate designations in marble resin and brass letters for ₹1,450."
    ],
    [
      "How heavy is the 16x10-inch teak wood nameplate?",
      "It weighs approximately 2.2 kilograms. The solid brass screw anchors supplied easily support this weight securely into brick, concrete, or wood walls."
    ],
    [
      "Can we clean dust off the nameplate with a wet cloth?",
      "Yes! Simply wipe with a damp microfiber cloth. The waterproof resin and acrylic letters wipe clean in seconds without catching dust."
    ],
    [
      "Can you make a rustic live-edge tree bark nameplate?",
      "Yes! We source raw live-edge wood slices with intact tree bark and fill natural knots with glowing turquoise resin. Size 16x8-inch is ₹3,200."
    ],
    [
      "What is the booking advance for a custom nameplate?",
      "We take a 50% advance to initiate the graphic layout and laser cutting. You pay the remaining 50% plus shipping only after approving the final video of your completed nameplate!"
    ],
    [
      "Can you ship the nameplate to Hyderabad or Bangalore?",
      "Yes! We ship all over India. Shipping to South India (Bangalore, Chennai, Hyderabad) takes 3-5 days for ₹90 via DTDC / Delhivery."
    ],
    [
      "Can you do a circular 12-inch round nameplate?",
      "Yes! Our 12-inch Round Geode or Ocean Nameplate with 3D acrylic letters is ₹2,600. It creates a very unique, modern look on entryway walls."
    ],
    [
      "Can we get matching key holder hooks attached to the bottom?",
      "Yes! We can mount 4 solid brass key hanging hooks along the bottom edge of a 12x8-inch or 16x10-inch nameplate for an additional ₹350."
    ],
    [
      "Can you match our villa's charcoal grey exterior color theme?",
      "Yes! We can customize the resin base in charcoal slate, midnight black, or concrete grey with brushed brass lettering to complement your villa's modern facade."
    ],
    [
      "Can you do a housewarming gift nameplate with quick delivery?",
      "Standard handcrafted nameplates take 10 days. If you have an urgent housewarming within 6 days, message us to check our express rush production availability (₹350 rush slot fee)."
    ],
    [
      "Can we change the font style after seeing the first mockup?",
      "Yes! We provide up to 2 rounds of font and layout revisions free of charge to ensure you are 100% delighted with your typography before we cut the letters."
    ],
    [
      "Does the LED light consume a lot of electricity?",
      "Not at all. The 12V LED strip uses less than 8 watts of power—similar to a tiny night bulb. It can be kept on all night for just a few rupees a month!"
    ],
    [
      "Can we get a backlit nameplate without a visible wire?",
      "If you have an internal electrical conduit behind the nameplate location on your wall, our wiring exits directly from the back center so no wires are visible from the front!"
    ],
    [
      "Can you write our apartment flat number like 'Flat 402, Tower B'?",
      "Yes! We can format your flat number boldly at the top with your family name underneath in elegant flowing cursive lettering."
    ]
  ];

  for (const [customer, reply] of nameplateChats) {
    chats.push({ customer, reply });
  }

  // =========================================================================
  // CATEGORY 6: POOJA DECOR, FESTIVE PLATTERS & SPIRITUAL ART (Chats 161 - 190)
  // =========================================================================
  const poojaChats: [string, string][] = [
    [
      "Can we place lighted oil diyas on your resin pooja thali without damaging it?",
      "Our pooja thalis are heat-resistant up to 55°C, and every set includes a raised solid brass diya holder with protective silicone feet that keeps direct flame heat away from the resin surface, allowing you to perform daily aartis safely!"
    ],
    [
      "Will turmeric, kumkum, or chandan powder stain the resin thali?",
      "No! The cured resin surface is non-porous and oil-resistant. Simply wipe off kumkum, turmeric, or oil drips with a soft damp cloth after your pooja, and it looks spotless and sparkling new."
    ],
    [
      "What items are included in your 11-inch Royal Pooja Thali Set?",
      "Hello! 🪔 Our 11-inch Royal Set (₹2,400) includes the handcrafted 11-inch resin plate with embedded marigold petals and gold foil, a matching brass diya stand, an agarbatti incense stick holder, and 2 katoris for kumkum and chandan."
    ],
    [
      "Can you customize a pooja thali in haldi yellow for an upcoming wedding ceremony?",
      "Yes! Our Haldi Yellow Festive Thali features real marigold petals, 24k gold leaf flakes, and auspicious Om or Swastik motifs. The 8-inch set with 2 katoris is ₹1,350 and takes 6 days to craft."
    ],
    [
      "Do you make 3D acrylic Gayatri Mantra wall frames?",
      "Yes! We create 12x12 inch round (₹2,600) and 18x12 inch rectangular (₹3,800) spiritual frames featuring sacred Gayatri Mantra in laser-cut mirror gold acrylic over Carrara marble resin. It looks breathtaking in pooja rooms."
    ],
    [
      "Can we get a customized Ayatul Kursi Islamic calligraphy resin frame?",
      "Yes! We handcraft stunning Ayatul Kursi frames in mirror gold acrylic over black obsidian or emerald marble resin (12x12 inch: ₹2,600, 18x12 inch: ₹3,800). It is a cherished gift for housewarmings and weddings."
    ],
    [
      "Can we wash the pooja thali with soap water after festivals like Diwali?",
      "Yes! Wash gently with lukewarm water and mild dish soap using a soft sponge, then pat dry immediately with a clean cloth. Never use steel wool, abrasive scotch-brite, or wash in a dishwasher."
    ],
    [
      "Can you make 15 small aarti plates as Diwali return gifts for our family gathering?",
      "Yes! We offer 8-inch festive aarti plates with 2 matching katoris for return gifting. For 10+ pieces, you receive a 10% bulk discount (₹1,215 per set) with individual festive gift packaging. Lead time is 10 days."
    ],
    [
      "Can you embed real red rose petals and pearls along the thali border?",
      "Yes! Our Royal Maroon & Pearl Thali features real dehydrated red rose petals, gold leafing, and an elegant hand-laid pearl bead border for ₹2,400."
    ],
    [
      "Can we do a Lotus-shaped pooja platter?",
      "Yes! We craft 10-inch sculpted Lotus Petal Pooja Platters with white and pink marble resin and brass diya sockets for ₹1,850."
    ],
    [
      "Can you make a Shubh Labh door hanging pair in resin?",
      "Yes! We handcraft 5-inch circular Shubh Labh door hangings with gold acrylic typography, marigold florals, and hanging brass bells for ₹850 per pair."
    ],
    [
      "How heavy is the 11-inch royal pooja thali?",
      "It weighs approximately 900 grams to 1.1 kilograms. It has a reassuring solid weight in hand while carrying during ceremonial aartis."
    ],
    [
      "Can we put prasad and dry fruits directly on the plate?",
      "Yes! Our resin is food-contact safe and non-toxic for dry sweets, pedas, dry fruits, and mishri prasad."
    ],
    [
      "Can you add our family name 'Gupta Family' on the pooja thali rim?",
      "Yes! We can personalize your family name in fine gold calligraphy along the outer rim of the thali for ₹150."
    ],
    [
      "Can you do a Lord Buddha meditation wall hanging?",
      "Yes! We craft 14-inch circular Buddha silhouette art panels with glowing metallic gold resin rivers and real crystal chips for ₹3,200."
    ],
    [
      "How are the katoris attached to the thali?",
      "The 2 katoris are detachable with small non-scratch silicone pads on their bases so you can easily carry them, wash them, and arrange them wherever you prefer on the thali."
    ],
    [
      "Can you make an Ek Onkar spiritual frame for a Sikh friend's housewarming?",
      "Yes! We craft Ek Onkar 3D mirror gold acrylic frames over royal blue or white marble resin (12x12 inch: ₹2,600). It makes an auspicious, cherished gift."
    ],
    [
      "What if camphor drops on the resin plate?",
      "Avoid lighting camphor directly on the resin surface. Always place camphor cubes inside the supplied brass aarti holder cavity to protect the resin from direct flame."
    ],
    [
      "Do you ship pooja thali sets safely to Delhi for Diwali?",
      "Yes! We ship across India. Sets are packed in individual shock-absorbing thermocol compartments inside gift boxes so the katoris and thali reach in perfect pristine condition."
    ],
    [
      "Can you make a Raksha Bandhan special platter with a rakhi slot?",
      "Yes! We craft Rakhi Platters with custom compartments for the rakhi thread, sweets, roli, and chawal for ₹1,150."
    ],
    [
      "Can you do an emerald green Maha Mrityunjaya Mantra frame?",
      "Yes! Rich emerald green marble resin with mirror gold acrylic Sanskrit calligraphy is one of our most magnificent pooja room statement pieces (18x12 inch: ₹3,800)."
    ],
    [
      "Is the gold foil real or printed?",
      "We hand-lay genuine 24k liquid metallic leaf flakes inside the resin matrix, creating authentic multi-dimensional shimmer that never tarnishes or oxidizes."
    ],
    [
      "Can we order an extra set of matching katoris?",
      "Yes! An extra pair of matching resin-detailed katoris is ₹350."
    ],
    [
      "What is the lead time for an 11-inch royal pooja thali set?",
      "Crafting takes 6 days to pour, set, embed motifs, and cure. Delivery takes 2-4 days within Kerala and 3-5 days across India."
    ],
    [
      "Can you do a pooja thali in deep navy blue with silver foil?",
      "Yes! Royal Navy Blue with silver leaf flakes and Om motif is ₹1,350 for 8-inch and ₹2,400 for 11-inch."
    ],
    [
      "Can you do a customized wedding Karwa Chauth thali set?",
      "Yes! We craft Karwa Chauth Thali sets including the decorated thali, chalni (sieve), and matching lota pot for ₹2,800."
    ],
    [
      "Will the incense smoke leave dark soot on the agarbatti holder?",
      "Any mild surface soot from agarbatti smoke wipes off effortlessly with a damp cloth and warm water without affecting the resin."
    ],
    [
      "Can you do a Ganpati Bappa stuti frame for Ganesh Chaturthi?",
      "Yes! 12x12-inch circular Vakratunda Mahakaya Sanskrit shloka frames in gold acrylic over yellow-maroon marble resin are ₹2,600."
    ],
    [
      "Do you provide a gift box with the pooja thali?",
      "Yes! Every 8-inch and 11-inch pooja thali set arrives packaged inside an elegant red-and-gold rigid festive gift box ready for presentation."
    ],
    [
      "Can we order a ready stock thali for quick dispatch?",
      "Yes! We usually hold 1 or 2 festive thali sets in our Thrissur studio ready for same-day dispatch. Message us to check today's ready designs!"
    ]
  ];

  for (const [customer, reply] of poojaChats) {
    chats.push({ customer, reply });
  }

  // =========================================================================
  // CATEGORY 7: RESIN TABLES & ACCENT FURNITURE (Chats 191 - 215)
  // =========================================================================
  const tableChats: [string, string][] = [
    [
      "What are the sizes and prices for your round ocean wave coffee tables?",
      "Hello! 🌊 We craft round ocean coffee tables in three standard sizes: 16-inch Round with hairpin legs at ₹4,800; 20-inch Round Statement Table at ₹6,500; and 24-inch Luxury Accent Table at ₹8,900. All include 3-layer wave lacing, beach sand, and heavy-duty metal legs."
    ],
    [
      "How are the table legs attached? Is assembly easy at home?",
      "Assembly takes under 5 minutes! The solid wooden tabletop base comes with pre-installed threaded metal inserts. We include the heavy-duty metal hairpin legs, screws, and an Allen key in the crate. You simply tighten 3 screws per leg."
    ],
    [
      "How much weight can the 20-inch round ocean coffee table support?",
      "Our tables are built on 18mm high-density moisture-resistant wood and supported by 10mm solid steel hairpin legs. A 20-inch table easily supports over 45 kilograms—more than enough for heavy books, teapots, and laptop setups!"
    ],
    [
      "Can we choose matte black or gold legs for the table?",
      "Yes! You can choose between powder-coated Matte Black hairpin legs (industrial modern) or electroplated Brushed Gold legs (luxury contemporary) at no extra charge."
    ],
    [
      "Can you make a live-edge teak wood river coffee table?",
      "Yes! We hand-select seasoned live-edge teak or acacia planks and pour a translucent emerald green or turquoise blue resin river down the center. A 30x20-inch coffee table is ₹12,500."
    ],
    [
      "Is the tabletop scratch-resistant for daily living room use?",
      "We coat every tabletop with an automotive-grade scratch-resistant clear polyurethane topcoat. While you should avoid dragging rough ceramic planters without pads, it handles laptops, coffee mugs, and TV remotes with ease!"
    ],
    [
      "How do you pack and courier a table safely to Mumbai or Bangalore?",
      "Tables are disassembled (top and legs packed flat) and encased in 2-inch custom thermocol cushioning inside a reinforced wooden shipping crate. We ship via express ground logistics with transit insurance included."
    ],
    [
      "Can we put hot coffee mugs directly on the table?",
      "Yes! The tabletop surface is heat-safe up to 55°C (130°F), perfect for hot coffee cups and mugs. For boiling hot pots or sizzling skillets, always use a trivet."
    ],
    [
      "What is the lead time to handcraft a custom 20-inch ocean table?",
      "Because table casting requires multiple deep pours and 7 days of full cross-link curing for maximum rock-solid hardness, lead time is 14 days before dispatch."
    ],
    [
      "Can you make a pair of nesting coffee tables (one 16-inch and one 20-inch)?",
      "Yes! Our Nesting Ocean Duo includes a 20-inch table (18-inch height) and a 16-inch table (15-inch height) that slides gracefully underneath for ₹10,500 for the pair."
    ],
    [
      "Can you customize a table with purple amethyst geode crystals?",
      "Yes! Our 16-inch Amethyst Geode Accent Table features authentic raw amethyst crystals, metallic plum pigments, and gold foil rivers on gold hairpin legs for ₹5,400."
    ],
    [
      "What height are the table legs?",
      "Our standard hairpin legs are 18 inches (45 cm) high, which aligns flush with standard living room sofa seat heights. We also have 15-inch and 22-inch leg heights available upon request."
    ],
    [
      "Can we wipe the table with a wet mop or disinfectant?",
      "Clean with a soft microfiber cloth dampened with mild soap water. Avoid harsh acetone, alcohol, bleach, or acidic toilet cleaners, as strong chemical solvents can haze resin."
    ],
    [
      "Can you make a balcony cafe table with a 24-inch round top?",
      "Yes! Our 24-inch Round Balcony Table with weather-resistant outdoor sealant and a heavy pedestal or hairpin base is ₹8,900."
    ],
    [
      "Can we customize the ocean waves to look like sunset colors (orange and turquoise)?",
      "Yes! We can create sunset shoreline gradients with coral pink, golden amber, and deep turquoise waters. Share your inspiration photos and our artist will formulate a custom palette!"
    ],
    [
      "What is the booking advance for a custom resin table?",
      "We collect a 50% advance to start woodworking and resin pouring. The remaining 50% plus crate freight is payable after you inspect and approve the final 360-degree video of your table."
    ],
    [
      "Can you make a bedside nightstand table with a drawer?",
      "Currently we specialize in solid resin-top accent tables and coffee tables with metal or wooden legs, rather than multi-drawer cabinetry."
    ],
    [
      "Can real sand from our favorite beach be used in the table?",
      "Yes! If you have collected clean sand or seashells from a memorable holiday, you can courier them to our Thrissur studio and we will embed them right into your custom shoreline table!"
    ],
    [
      "Do the hairpin legs scratch hardwood or tile floors?",
      "Every leg set includes snap-on rubber floor protector feet that prevent scratching on marble, vitrified tiles, and wooden laminate flooring."
    ],
    [
      "Can you do a square 20x20 inch table instead of round?",
      "Yes! We handcraft square 20x20 inch tables with rounded safety corners for ₹6,900."
    ],
    [
      "Can you add wireless mobile charging embedded under the resin top?",
      "Yes! We can conceal a 15W Qi wireless charging pad flush underneath the wood base so you simply place your phone on the marked resin spot to charge (₹1,500 add-on)."
    ],
    [
      "Will the table resin turn yellow if kept in a sunny living room?",
      "We formulate our table topcoats with high-performance UV inhibitors (HALS) that resist yellowing from indoor ambient sunlight for years."
    ],
    [
      "How heavy is the 20-inch round table with legs?",
      "The 20-inch table weighs approximately 7.5 kilograms total. It feels firmly grounded and sturdy without being too heavy to reposition."
    ],
    [
      "Can you ship the table to Kochi or Trivandrum?",
      "Yes! Kerala delivery takes 2-3 days via courier (₹250 crate delivery). We also offer direct studio pickup in Thrissur."
    ],
    [
      "Can you do a dining table for 6 people?",
      "For large 6-seater dining tables (6x3 feet), pricing starts at ₹42,000 depending on wood slab selection. These are handled as bespoke custom projects—message us to discuss your space requirements!"
    ],
    [
      "Can you make an epoxy resin console table for our hallway foyer?",
      "Yes! Our 36x12-inch Hallway Foyer Console Table features a natural live-edge teak slab with an ocean wave or emerald river on 30-inch tall black hairpin legs for ₹14,500. Lead time is 16 days."
    ],
    [
      "Can we put an outdoor resin table under direct rain on a balcony?",
      "While fully cured resin is 100% waterproof and unaffected by rain, we recommend placing it under a balcony roof overhang to protect the metal legs and avoid standing water pooling for weeks."
    ],
    [
      "Can you level the table legs if our floor is slightly uneven?",
      "Yes! Every hairpin leg set we provide comes with height-adjustable threaded rubber leveling feet so you can easily adjust each leg up to 10mm to sit completely rock-solid on uneven floors."
    ],
    [
      "Can you do an ocean wave bar counter top for a home bar?",
      "Yes! We custom-cast resin bar tops up to 5 feet in length with shoreline waves, authentic sand, and alcohol-resistant high-gloss topcoats. Pricing starts at ₹18,000 based on exact dimensions."
    ],
    [
      "Can you create a matching set of a coffee table and 4 coasters in the exact same wave pattern?",
      "Yes! We often pour the coasters alongside the tabletop using the exact same resin batch so the turquoise gradients and wave foam match seamlessly (₹6,900 combo with 20-inch table)."
    ]
  ];

  for (const [customer, reply] of tableChats) {
    chats.push({ customer, reply });
  }

  // =========================================================================
  // CATEGORY 8: PHOTO FRAMES, KEEPSAKES & MEMORY BLOCKS (Chats 216 - 240)
  // =========================================================================
  const frameChats: [string, string][] = [
    [
      "Can you embed our printed photo along with dried flowers in a tabletop frame?",
      "Yes! 🌸 Our Preserved Floral Photo Frames cast your photo alongside real dried baby's breath, roses, and gold leaf. Sizes: 4x6 inch (₹750), 5x7 inch with stand (₹1,050), and 8x10 inch (₹1,650). Photo printing and UV lamination are included complimentary!"
    ],
    [
      "How do we send our photograph for the custom resin frame?",
      "You can simply send a high-resolution photo file on this chat or email it to us. We print it on archival non-fade photo paper and seal it before casting so colors stay bright forever."
    ],
    [
      "What is included in the Baby Keepsake Milestone Block?",
      "Hello! 👶 Our Baby Keepsake Block embeds your baby's hospital ID bracelet, first haircut lock, umbilical cord clamp, birth stats (weight, length, date), and mini photo inside crystal clear resin. A 4x4-inch cube is ₹1,800, and a 6x6-inch arched block is ₹2,900."
    ],
    [
      "Can you make a memorial keepsake frame with our dog's fur lock and picture?",
      "Yes, we create pet memorial keepsakes with deep love and care. 🐾 We can encapsulate a lock of fur, paw print impression, collar tag, and photograph inside a 5x7-inch clear block with gold accents for ₹1,450."
    ],
    [
      "Does the 5x7-inch tabletop frame stand on its own?",
      "Yes! We include a solid wooden tabletop easel stand, or we can cast the frame as a self-standing 25mm thick solid resin block that stands securely on any shelf without a stand."
    ],
    [
      "Can you write our anniversary date and names on the frame?",
      "Yes! We add metallic gold or white vinyl calligraphy for names and dates between the resin layers at no extra charge."
    ],
    [
      "Can you make a double photo frame with ocean waves on the sides?",
      "Yes! Our Double Shoreline Frame holds two 4x6 photos flanked by realistic ocean wave foam for ₹1,850."
    ],
    [
      "How long does it take to make a custom photo frame?",
      "Handcrafting takes 5 days (photo prep, floral arrangement, resin pour, and curing). Delivery is 2-4 days in Kerala and 3-5 days across India."
    ],
    [
      "Can we preserve our wedding vows inside a resin block?",
      "Yes! We print your wedding vows in elegant calligraphy on handmade parchment paper and cast it in clear resin with gold leaf flakes (8x10 inch: ₹1,800)."
    ],
    [
      "Will the photo fade or turn yellow inside the resin over time?",
      "No. We laminate each photograph with a UV-barrier protective film that prevents resin chemical interaction and safeguards the ink from fading."
    ],
    [
      "Can you preserve my baby's first pair of hospital booties?",
      "Yes! For knitted booties, we use a deep 6x6x3-inch clear casting block (₹3,200) so the fabric retains its 3D shape."
    ],
    [
      "Can you do a heart-shaped photo frame for an anniversary gift?",
      "Yes! Our 6-inch Heart Tabletop Frame with real dried red roses and gold foil is ₹1,350."
    ],
    [
      "Can you embed a metallic wedding coin inside the frame?",
      "Yes! We can suspend silver or gold commemorative wedding coins inside the resin matrix alongside flowers."
    ],
    [
      "Can we choose a pastel blue or blush pink background tint for the baby frame?",
      "Yes! We can create a soft translucent pastel pink, baby blue, or pearl white backdrop behind the keepsake items."
    ],
    [
      "Can you make an 8x10 wall-hanging photo frame?",
      "Yes! Our 8x10-inch frame comes fitted with rear brass wall hooks or can be displayed on a wooden table easel for ₹1,650."
    ],
    [
      "Can you frame our couple portrait with wedding garland petals around it?",
      "Yes! That is our 8x10-inch Garland Memory Frame (₹1,950). Courier a few fresh or dried petals to our studio and we arrange them around your photo."
    ],
    [
      "What happens if our photo resolution is low?",
      "Our designer checks every photo first. If your photo is low resolution, we will let you know immediately and can digitally enhance the image before printing."
    ],
    [
      "Can you make matching keychains with the leftover baby photo prints?",
      "Yes! We can add matching mini photo keychains for ₹180 each as gifts for grandparents."
    ],
    [
      "Can you do a graduation milestone keepsake with a degree snippet?",
      "Yes! We can encapsulate a miniature degree copy, graduation cap tassel, and graduation portrait in an arched block for ₹2,400."
    ],
    [
      "Can we include baby's foot ink impression inside the frame?",
      "Yes! You can take an ink foot or hand stamp on paper and courier or scan it to us; we seal and embed it beautifully."
    ],
    [
      "Can you make a memorial frame for my grandparents?",
      "Yes. We craft vintage memorial frames with dried roses, soft gold flakes, and a memorial quote with reverence (5x7-inch: ₹1,050)."
    ],
    [
      "Do you provide a gift box with the photo frames?",
      "Yes! Every frame arrives packed in a branded protective gift box tied with satin ribbon and includes a handwritten note card."
    ],
    [
      "Can you add warm LED lighting to a photo block?",
      "Yes! We offer a solid wood USB warm LED base that illuminates the clear photo block from underneath for an additional ₹650."
    ],
    [
      "Can you do ready-to-ship empty photo frames where we can slide our photo in?",
      "Our resin frames are permanently cast around the photograph for crystal archival protection, so we print and cast your photo directly into the piece!"
    ],
    [
      "How much advance is needed for custom photo frames?",
      "We collect a 50% advance via GPay/PhonePe to begin design and printing, and the balance upon video approval before dispatch."
    ]
  ];

  for (const [customer, reply] of frameChats) {
    chats.push({ customer, reply });
  }

  // =========================================================================
  // CATEGORY 9: ACCESSORIES, BOOKMARKS & GIFTING ITEMS (Chats 241 - 270)
  // =========================================================================
  const accChats: [string, string][] = [
    [
      "How much are personalized alphabet initial keychains, and what customizations can we choose?",
      "Hello! 😊 Single Alphabet Initial Keychains are ₹180, a custom Spotify song code keychain is ₹250, and a gift box set of 3 keychains is ₹450. You can customize the initial letter, color theme, dried flower petals, gold or silver flakes, and matching silk tassel!"
    ],
    [
      "How does the Spotify code keychain work? Does it actually scan?",
      "Yes, 100%! 🎵 We laser-cut or precision-cast the official Spotify scannable soundwave barcode. When you open the Spotify app camera and scan the keychain, your favorite song or playlist starts playing instantly!"
    ],
    [
      "What are the prices for pressed flower resin bookmarks?",
      "Hi! 📚 Our transparent pressed wildflower bookmarks are ₹220 for a Set of 2, and ₹380 for a Set of 4. Each bookmark features natural pressed flowers, ferns, gold leafing, and a silky tassel."
    ],
    [
      "Can you write custom names in calligraphy on the bookmarks?",
      "Yes! We add metallic gold, white, or rose gold calligraphy names (e.g., 'Ananya' or 'Book Lover') along the spine of the bookmark for ₹25 each."
    ],
    [
      "Do you make 3D resin phone PopSockets or grips?",
      "Yes! We make phone grips in Ocean Wave, Amethyst Geode, and Pressed Flower designs for ₹220. They come with strong 3M adhesive tape compatible with all phone cases."
    ],
    [
      "Can you make 50 alphabet keychains as birthday return gifts?",
      "Yes! We do bulk return gifts regularly. For 50 pieces, the price is ₹140 each (22% bulk discount) including personalized initials, individual packaging, and custom thank-you tags. Lead time is 7 days."
    ],
    [
      "Will the bookmark bend or break if kept inside a thick novel?",
      "Our bookmarks are ultra-slim (only 1.5mm) and cast with flexible-grade epoxy, so they flex comfortably with book pages without snapping or creasing your paperbacks!"
    ],
    [
      "Can you do a shell-shaped trinket dish for rings and earrings?",
      "Yes! Our Scallop Shell Trinket Dish with ocean wave lacing and pearl borders is ₹320. Perfect for keeping wedding rings by the sink or nightstand."
    ],
    [
      "Can you make compact pocket mirrors with dried flowers?",
      "Yes! We handcraft dual-sided compact pocket mirrors (1x regular, 2x magnifying) with pressed floral resin tops in rose gold or silver metal cases for ₹280."
    ],
    [
      "Can we get couple initial keychains with a heart charm?",
      "Yes! A Couple Keychain Pair (2 initial letters + mini heart charm) in a velvet gift pouch is ₹350."
    ],
    [
      "Do the keychains scratch easily when kept in pockets with keys?",
      "We use high-durability scratch-resistant hard-cure resin and stainless steel keyrings to withstand daily pocket and purse use."
    ],
    [
      "Can you do bookmarks with real four-leaf clovers?",
      "Yes! We source genuine pressed four-leaf clovers for lucky charm bookmarks (Set of 2: ₹260)."
    ],
    [
      "Can you make resin fountain pen rests or desk pen stands?",
      "Yes! We make single and double fountain pen rests in geode crystal and marble resin for ₹350 each."
    ],
    [
      "Can you do corporate branded bookmarks with employee names?",
      "Yes! We make branded bookmarks with employee names and company values for corporate onboarding kits (bulk pricing available)."
    ],
    [
      "What tassel colors do you offer?",
      "We stock silky tassels in over 12 shades: Gold, Dusty Rose, Emerald Green, Navy Blue, Maroon, Lavender, Teal, Champagne, Black, and White."
    ],
    [
      "Can we order 1 single keychain to test the quality?",
      "Yes, absolutely! You can order a single alphabet keychain for ₹180 plus shipping (₹60 within Kerala, ₹90 across South India)."
    ],
    [
      "Can you make a car rear-view mirror hanging charm in resin?",
      "Yes! We make circular floral and evil-eye car mirror hanging medallions with hanging beads and tassels for ₹380."
    ],
    [
      "Can you put a miniature photo inside the keychain?",
      "Yes! Our Double-Sided Photo Keychain holds a laminated mini photo on one side and your initial letter with gold foil on the other for ₹240."
    ],
    [
      "Can you make resin wine bottle stoppers?",
      "Yes! We make solid stainless steel wine bottle stoppers topped with handmade geode resin crystals for ₹420."
    ],
    [
      "Can you make custom badge reels or ID card holders for doctors and nurses?",
      "Yes! We make retractable ID badge reels with resin stethoscope, floral, or initial toppers for ₹260."
    ],
    [
      "Do you offer gift boxes for individual keychains?",
      "Yes! Individual kraft pillow gift boxes with ribbon are available for ₹30 per piece."
    ],
    [
      "How long does it take to make 10 custom keychains?",
      "Small batches take 3 to 4 days to cast, cure, assemble hardware, and pack."
    ],
    [
      "Can you do a resin guitar pick with dried flowers?",
      "Yes! We make playable and collectible resin guitar plectrums with pressed petals for ₹150 each."
    ],
    [
      "Can you make a set of bookmark and matching keychain as a gift combo?",
      "Yes! Our Reader's Gift Duo (1 matching pressed flower bookmark + 1 initial keychain) in a gift box is ₹360."
    ],
    [
      "Can we get a Spotify code keychain for an anniversary song?",
      "Yes! Just send us the Spotify song link or title, and we generate and test the scannable code before casting."
    ],
    [
      "Can you make resin alphabet fridge magnets?",
      "Yes! Heavy-duty neodymium magnet letters with dried flowers and gold leaf are ₹160 each."
    ],
    [
      "What is the turnaround time for a single keychain?",
      "A single keychain takes 2 to 3 days to make and dispatch."
    ],
    [
      "Can you make keychains with real coffee beans embedded?",
      "Yes! We make roasted coffee bean keychains in amber translucent resin—ideal for coffee lovers! (₹200)."
    ],
    [
      "Can you make resin jewelry like pendant necklaces?",
      "Yes! We craft 18k gold-plated hypoallergenic pendant necklaces with real pressed miniature flowers for ₹420."
    ],
    [
      "Do you have ready stock bookmarks in Thrissur for pickup today?",
      "Yes! We always keep a selection of floral and ocean bookmarks in stock for immediate pickup at our Thrissur studio."
    ]
  ];

  for (const [customer, reply] of accChats) {
    chats.push({ customer, reply });
  }

  // =========================================================================
  // CATEGORY 10: ORDERS, LOGISTICS, POLICIES & CARE (Chats 271 - 300)
  // =========================================================================
  const logisticsChats: [string, string][] = [
    [
      "What is your order and payment process for custom resin pieces?",
      "It's very transparent and simple! 🌸 1. We confirm your design details, sizing, and pricing. 2. You pay a 50% advance via GPay, PhonePe, or UPI to book your slot and start crafting. 3. When finished, we share an HD 360-degree video of your piece. 4. You pay the remaining 50% plus shipping and we dispatch with tracking details!"
    ],
    [
      "What are your delivery charges and transit times across India?",
      "🚚 Our shipping rates via Shiprocket (DTDC / Delhivery): Thrissur studio pickup is ₹0 (free); Kerala districts: 2-4 days (₹60); South India (TN, Karnataka, AP, Telangana): 3-5 days (₹90); Rest of India (Mumbai, Delhi, Kolkata, etc.): 6-8 days (₹130). Express 2-3 day air shipping is also available!"
    ],
    [
      "What should I do if my package arrives damaged by the courier?",
      "Every order is insured. In the rare event of transit damage, please record an uncut 360-degree unboxing video while opening the parcel and share it with us within 24 hours of delivery. We will immediately repair or replace your piece 100% free of charge!"
    ],
    [
      "Can I cancel my custom order and get a refund?",
      "Cancellations are accepted within 12 hours of order confirmation for a full 100% refund. After 12 hours, raw materials, mold preparation, or flower dehydration have already begun, so the 50% advance deposit becomes non-refundable."
    ],
    [
      "How do I clean and care for resin art items long-term?",
      "Easy care rules: 1. Keep away from prolonged harsh outdoor noon sun. 2. Wipe gently with a soft dry or damp microfiber cloth. 3. Heat safe up to 55°C (fine for warm mugs, avoid boiling stovetop pots). 4. Never use acetone, alcohol, or dishwash scrubbers. 5. Do not soak in water or microwave."
    ],
    [
      "What payment methods do you accept?",
      "We accept Google Pay, PhonePe, Paytm, all UPI apps (our official ID is asharesins@okaxis), and direct Bank Transfer (NEFT/IMPS). We share our official payment QR code upon order confirmation."
    ],
    [
      "Do you provide a tracking number when my order is shipped?",
      "Yes! As soon as your order is picked up by DTDC or Delhivery, we automatically send your consignment tracking number and live tracking link right here on this chat so you can monitor delivery progress."
    ],
    [
      "Can I change the colors or details after paying the advance?",
      "You can make color or text adjustments within 24 hours of placing your order before the initial resin pouring phase begins. Just message us as early as possible!"
    ],
    [
      "Can you deliver urgently by this weekend for a birthday in Ernakulam?",
      "Yes! For urgent gifting within Kerala, we can arrange same-day or next-day direct courier or bus parcel pickup. Message us your required delivery date and we will coordinate expedited delivery!"
    ],
    [
      "Do you offer discounts for bulk orders?",
      "Yes! For bulk corporate, wedding, or event orders: 10 to 24 pieces receive a 10% discount; 25+ pieces receive a 15% discount. Customized gift packaging and branding tags are included."
    ],
    [
      "Where is your physical studio located in Kerala?",
      "Our artisan studio is located in Thrissur, Kerala. Local clients are welcome to drop off wedding garland flowers or pick up completed orders in person by prior appointment!"
    ],
    [
      "Are your resin products heavy?",
      "Resin has a luxurious, weighted feel comparable to high-density polished stone or dense acrylic. Coasters weigh about 80-100g each, clocks weigh 1.5 to 3kg, and trays weigh 1.2 to 2kg."
    ],
    [
      "What if there are tiny micro-bubbles in my resin art?",
      "Handmade resin art often features microscopic organic micro-bubbles naturally trapped during casting. These are hallmarks of authentic handmade craftsmanship and do not affect the strength or structural integrity of your piece!"
    ],
    [
      "Can I send a custom photo from Pinterest and ask you to replicate it?",
      "Yes! You can share any reference photo or Pinterest inspiration with us on this chat. Our artist will review the design, explain the resin technique, and quote an exact price."
    ],
    [
      "Do you ship internationally to the US, UK, or Dubai?",
      "Currently we ship within India only to ensure optimal packaging safety and timely delivery. International shipping is currently unavailable."
    ],
    [
      "How do I remove coffee or curry stains from a resin tray?",
      "Resin is non-porous. Simply wipe the spill with a soft cloth and warm soapy water as soon as possible. Avoid abrasive scouring pads to keep the mirror gloss intact."
    ],
    [
      "Is resin art toxic once cured?",
      "No! Fully cured epoxy resin is completely inert, solid, non-toxic, and zero-VOC. It is completely safe for home use, bedrooms, and tabletop dining."
    ],
    [
      "What if I need an item not in your standard price list?",
      "If you have a unique custom project (e.g., custom sizes, large furniture, unusual memorabilia), describe it to us here! We escalate special custom requests directly to our founder and head artist for a custom quote."
    ],
    [
      "Can I pay the full amount via Cash on Delivery (COD)?",
      "Because every piece is personalized and custom-made by hand specifically for your order, we do not offer Cash on Delivery. All orders require a 50% advance booking deposit with the balance cleared upon video approval before dispatch."
    ],
    [
      "Can you write a handwritten birthday message card with my gift?",
      "Yes, gladly! We provide complimentary handwritten gift message cards with all gift orders. Just send us your message and we will write it out neatly on an artisan card!"
    ],
    [
      "What if the courier delivery is delayed past the expected date?",
      "While courier delivery times are managed by Shiprocket (DTDC / Delhivery), we actively track every parcel daily. If there is any courier transit delay, our team follows up directly with the regional hub to expedite delivery."
    ],
    [
      "Can I get a tax invoice with GST for my business expense?",
      "Yes! We provide official digital invoices with your business details and GST breakdown upon request for corporate accounting."
    ],
    [
      "What should I do if my clock hands arrive slightly bent from transit?",
      "Clock hands are made of lightweight aluminum and can be gently straightened with your fingers in 5 seconds. If any hand is damaged, we courier a brand-new set of hands immediately at zero cost."
    ],
    [
      "Can you repair an old resin piece that I dropped and chipped at home?",
      "Yes! In many cases, chipped resin corners or scuffed surfaces can be sanded and re-cast with a fresh gloss topcoat at our studio for a nominal restoration fee."
    ],
    [
      "How do we book a slot for next month's wedding?",
      "You can pre-book your flower preservation slot ahead of time with a ₹500 token advance. This reserves your drying chamber space during peak wedding season!"
    ],
    [
      "Can I request a video call to discuss custom colors?",
      "Yes! For statement pieces like 18-inch clocks or dining tables, our artist is happy to schedule a short WhatsApp video call to show you mica pigments, crystals, and live wood slabs."
    ],
    [
      "Can you do express 2-day delivery to Chennai for an anniversary?",
      "Yes! We can ship via DTDC Air Express to Chennai, which delivers in 1-2 days for ₹180 courier charge."
    ],
    [
      "Can I buy a gift voucher for my friend to design their own resin piece?",
      "Yes! We offer digital Gift Cards (from ₹1,000 to ₹10,000) that can be sent via WhatsApp with a personalized code for the recipient to redeem on any custom piece."
    ],
    [
      "What are your studio working and response hours?",
      "We reply to messages Monday through Saturday from 9:30 AM to 7:30 PM IST. Messages received outside these hours are answered first thing the next morning!"
    ],
    [
      "How do I confirm my order right now?",
      "Simply reply with your selected product, size, and customization details right here! We will confirm your order summary and share our UPI QR code to book your slot right away 💕"
    ]
  ];

  for (const [customer, reply] of logisticsChats) {
    chats.push({ customer, reply });
  }

  return chats;
}

async function run() {
  const businessId = config.BUSINESS_ID;
  const KB_PATH = fileURLToPath(new URL("../../../docs/knowledge-base.json", import.meta.url));
  const currentKb = JSON.parse(readFileSync(KB_PATH, "utf-8"));

  const chats = build300ResinArtChats();
  console.log(`Generated ${chats.length} real-time authentic resin art chat examples.`);

  currentKb.tone_examples = chats;
  writeFileSync(KB_PATH, JSON.stringify(currentKb, null, 2), "utf-8");
  console.log(`Updated ${KB_PATH} with ${chats.length} real-world resin art chat tone examples!`);

  // Update knowledgeBase table in database
  const { products: _unused, ...kbWithoutProducts } = currentKb;
  try {
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
    console.log("Database knowledge_base table updated successfully with 300 real chats.");
  } catch (err: any) {
    console.log("Database update note (network pooler):", err.message || err);
  }

  try {
    await invalidateKBCache(businessId);
    console.log("Redis cache invalidated.");
  } catch {
    // Redis might be offline
  }

  console.log("Done! Knowledge base now features 300 real-world, natural English resin art conversations.");
}

try {
  await run();
} catch (err) {
  console.error("Execution failed:", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
