import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { and, asc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { createHash } from "node:crypto";
import { invalidateKBCache } from "../ai/prompt.ts";
import { db } from "../db/index.ts";
import { auditLog, products } from "../db/schema.ts";
import { AppError } from "../lib/errors.ts";
import { authenticate } from "../middleware/authenticate.ts";
import { requireAdmin } from "../middleware/requireAdmin.ts";
import { requireStaffOrAdmin } from "../middleware/requireStaffOrAdmin.ts";

export function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "product";
}

const productSizeSchema = z.object({
  name: z.string().trim().min(1, "Size name is required"),
  price: z.number().int("Price must be whole rupees").positive("Price must be greater than 0"),
});

const createProductSchema = z.object({
  name: z.string().trim().min(1, "Product name is required"),
  slug: z.string().trim().min(1).optional(),
  description: z.string().trim().nullable().optional(),
  sizes: z
    .array(productSizeSchema)
    .min(1, "At least 1 size with price in whole rupees is required"),
  leadTimeDays: z.number().int().min(0).default(3),
  customizable: z.boolean().default(false),
  customOptions: z.array(z.string().trim()).default([]),
  images: z.array(z.string().trim()).max(5, "Maximum 5 images allowed").default([]),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

const updateProductSchema = z.object({
  name: z.string().trim().min(1).optional(),
  slug: z.string().trim().min(1).optional(),
  description: z.string().trim().nullable().optional(),
  sizes: z.array(productSizeSchema).min(1).optional(),
  leadTimeDays: z.number().int().min(0).optional(),
  customizable: z.boolean().optional(),
  customOptions: z.array(z.string().trim()).optional(),
  images: z.array(z.string().trim()).max(5).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const productRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /products - List all products for current business
  app.get(
    "/products",
    { preHandler: [authenticate] },
    async (request) => {
      const businessId = request.user.businessId;
      const query = request.query as { active?: string };

      let filter;
      if (query.active === "false") {
        filter = and(eq(products.businessId, businessId), eq(products.isActive, false));
      } else if (query.active === "all") {
        filter = eq(products.businessId, businessId);
      } else {
        // Default: active only
        filter = and(eq(products.businessId, businessId), eq(products.isActive, true));
      }

      const rows = await db
        .select()
        .from(products)
        .where(filter)
        .orderBy(asc(products.sortOrder), asc(products.name));

      return { products: rows };
    },
  );

  // GET /products/:id - Get single product
  app.get(
    "/products/:id",
    { preHandler: [authenticate] },
    async (request) => {
      const businessId = request.user.businessId;
      const { id } = request.params as { id: string };

      const [row] = await db
        .select()
        .from(products)
        .where(
          and(
            eq(products.businessId, businessId),
            eq(products.id, id),
          ),
        );

      if (!row) {
        throw new AppError(404, "Product not found", "NOT_FOUND");
      }

      return { product: row };
    },
  );

  // POST /products - Create product (admin only)
  app.post(
    "/products",
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const businessId = request.user.businessId;
      const parsed = createProductSchema.safeParse(request.body);

      if (!parsed.success) {
        const first = parsed.error.issues[0];
        const where = first?.path.length ? `${first.path.join(".")}: ` : "";
        throw new AppError(400, `Validation error: ${where}${first?.message ?? "invalid"}`, "VALIDATION_ERROR");
      }

      const data = parsed.data;
      let slug = data.slug ? slugify(data.slug) : slugify(data.name);

      // Ensure slug uniqueness within business
      const existing = await db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.businessId, businessId), eq(products.slug, slug)));

      if (existing.length > 0) {
        slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
      }

      const [newProduct] = await db
        .insert(products)
        .values({
          businessId,
          slug,
          name: data.name,
          description: data.description ?? null,
          sizes: data.sizes,
          leadTimeDays: data.leadTimeDays,
          customizable: data.customizable,
          customOptions: data.customOptions,
          images: data.images,
          isActive: data.isActive,
          sortOrder: data.sortOrder,
        })
        .returning();

      if (!newProduct) {
        throw new AppError(500, "Failed to create product", "INTERNAL_ERROR");
      }

      await invalidateKBCache(businessId);

      await db.insert(auditLog).values({
        businessId,
        actorId: request.user.sub,
        actorType: "admin",
        action: "product_created",
        details: { productId: newProduct.id, name: newProduct.name, slug: newProduct.slug },
      });

      reply.status(201);
      return { product: newProduct };
    },
  );

  // PUT /products/:id - Update product (admin only)
  app.put(
    "/products/:id",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const businessId = request.user.businessId;
      const { id } = request.params as { id: string };

      const [existing] = await db
        .select()
        .from(products)
        .where(and(eq(products.businessId, businessId), eq(products.id, id)));

      if (!existing) {
        throw new AppError(404, "Product not found", "NOT_FOUND");
      }

      const parsed = updateProductSchema.safeParse(request.body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        const where = first?.path.length ? `${first.path.join(".")}: ` : "";
        throw new AppError(400, `Validation error: ${where}${first?.message ?? "invalid"}`, "VALIDATION_ERROR");
      }

      const data = parsed.data;
      let slug = existing.slug;
      if (data.slug && data.slug !== existing.slug) {
        slug = slugify(data.slug);
        const conflict = await db
          .select({ id: products.id })
          .from(products)
          .where(
            and(
              eq(products.businessId, businessId),
              eq(products.slug, slug),
              ne(products.id, id),
            ),
          );
        if (conflict.length > 0) {
          slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
        }
      }

      const [updated] = await db
        .update(products)
        .set({
          slug,
          name: data.name ?? existing.name,
          description: data.description !== undefined ? data.description : existing.description,
          sizes: data.sizes ?? existing.sizes,
          leadTimeDays: data.leadTimeDays ?? existing.leadTimeDays,
          customizable: data.customizable ?? existing.customizable,
          customOptions: data.customOptions ?? existing.customOptions,
          images: data.images ?? existing.images,
          isActive: data.isActive !== undefined ? data.isActive : existing.isActive,
          sortOrder: data.sortOrder ?? existing.sortOrder,
        })
        .where(and(eq(products.businessId, businessId), eq(products.id, id)))
        .returning();

      await invalidateKBCache(businessId);

      await db.insert(auditLog).values({
        businessId,
        actorId: request.user.sub,
        actorType: "admin",
        action: "product_updated",
        details: { productId: id, changes: Object.keys(data) },
      });

      return { product: updated };
    },
  );

  // DELETE /products/:id - Soft delete product (admin only)
  app.delete(
    "/products/:id",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const businessId = request.user.businessId;
      const { id } = request.params as { id: string };

      const [existing] = await db
        .select()
        .from(products)
        .where(and(eq(products.businessId, businessId), eq(products.id, id)));

      if (!existing) {
        throw new AppError(404, "Product not found", "NOT_FOUND");
      }

      const [updated] = await db
        .update(products)
        .set({ isActive: false })
        .where(and(eq(products.businessId, businessId), eq(products.id, id)))
        .returning();

      await invalidateKBCache(businessId);

      await db.insert(auditLog).values({
        businessId,
        actorId: request.user.sub,
        actorType: "admin",
        action: "product_deleted",
        details: { productId: id, name: existing.name },
      });

      return { ok: true, product: updated };
    },
  );

  // POST /products/upload-signature - Get Cloudinary upload credentials/signature (staff or admin)
  app.post(
    "/products/upload-signature",
    { preHandler: [authenticate, requireStaffOrAdmin] },
    async () => {
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
      const apiKey = process.env.CLOUDINARY_API_KEY;
      const apiSecret = process.env.CLOUDINARY_API_SECRET;
      const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;

      if (!cloudName) {
        return {
          configured: false,
          uploadPreset: uploadPreset || null,
        };
      }

      const timestamp = Math.round(Date.now() / 1000);
      const folder = "products";

      if (apiSecret && apiKey) {
        // Sign params: folder, timestamp
        const toSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
        const signature = createHash("sha1").update(toSign).digest("hex");
        return {
          configured: true,
          cloudName,
          apiKey,
          timestamp,
          folder,
          signature,
          uploadPreset: uploadPreset || null,
        };
      }

      return {
        configured: true,
        cloudName,
        apiKey: apiKey || null,
        uploadPreset: uploadPreset || null,
      };
    },
  );
};
