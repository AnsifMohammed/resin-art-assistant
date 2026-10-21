import { eq } from "drizzle-orm";
import { invalidateKBCache } from "../ai/prompt.ts";
import { db, sql } from "./index.ts";
import { auditLog, knowledgeBase, products } from "./schema.ts";

export interface OldKbProduct {
  id: string;
  name: string;
  description?: string;
  price: number;
  sizes?: string[];
  lead_time_days?: number;
  customizable?: boolean;
  custom_options?: string[];
}

export async function migrateKbProducts(): Promise<void> {
  const kbRows = await db.select().from(knowledgeBase);

  for (const row of kbRows) {
    const data = row.data as Record<string, unknown>;
    const rawProducts = data.products;

    if (!Array.isArray(rawProducts) || rawProducts.length === 0) {
      console.log(`No products to migrate in knowledge base for business ${row.businessId}`);
      continue;
    }

    const oldProducts = rawProducts as OldKbProduct[];
    const productRows = oldProducts.map((old, idx) => {
      const sizes =
        Array.isArray(old.sizes) && old.sizes.length > 0
          ? old.sizes.map((sizeName) => ({
              name: String(sizeName),
              price: Math.round(Number(old.price) || 0),
            }))
          : [{ name: "Standard", price: Math.round(Number(old.price) || 0) }];

      return {
        businessId: row.businessId,
        slug: old.id,
        name: old.name,
        description: old.description ?? null,
        sizes,
        leadTimeDays: Number(old.lead_time_days ?? 3),
        customizable: Boolean(old.customizable),
        customOptions: Array.isArray(old.custom_options) ? old.custom_options : [],
        images: [],
        isActive: true,
        sortOrder: idx,
      };
    });

    if (productRows.length > 0) {
      await db.insert(products).values(productRows).onConflictDoNothing();
    }

    // Remove products from knowledge_base row data
    const { products: _removed, ...restData } = data;
    await db
      .update(knowledgeBase)
      .set({ data: restData })
      .where(eq(knowledgeBase.id, row.id));

    // Audit log backup
    await db.insert(auditLog).values({
      businessId: row.businessId,
      actorType: "system",
      action: "products_migrated",
      details: { products: oldProducts },
    });

    // Invalidate Redis KB cache
    await invalidateKBCache(row.businessId);

    console.log(`Migrated ${oldProducts.length} products for business ${row.businessId}`);
  }
}

// Run as standalone script if executed directly
const isDirectRun =
  import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` ||
  process.argv[1]?.endsWith("migrate-kb-products.ts");

if (isDirectRun) {
  try {
    await migrateKbProducts();
    console.log("Product migration finished successfully.");
  } catch (err) {
    console.error("Product migration failed:", err);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}
