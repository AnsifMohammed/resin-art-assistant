import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { AppError } from "../lib/errors.ts";
import { authenticate } from "../middleware/authenticate.ts";
import { requireStaffOrAdmin } from "../middleware/requireStaffOrAdmin.ts";
import { uploadBufferToCloudinary } from "../services/cloudinary.ts";

export const mediaRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // POST /upload/media - Authenticated media upload for inbox attachments
  app.post(
    "/upload/media",
    { preHandler: [authenticate, requireStaffOrAdmin] },
    async (request, reply) => {
      const data = await request.file();
      if (!data) {
        throw new AppError(400, "No file uploaded", "VALIDATION_ERROR");
      }

      const buffer = await data.toBuffer();
      if (buffer.length === 0) {
        throw new AppError(400, "Uploaded file is empty", "VALIDATION_ERROR");
      }

      const businessId = request.user.businessId;
      const folder = `knowvya/conversations/${businessId}`;

      const uploadResult = await uploadBufferToCloudinary({
        buffer,
        filename: data.filename,
        mimetype: data.mimetype,
        folder,
      });

      return reply.status(201).send(uploadResult);
    },
  );
};

