import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { getPresignedPutUrl, getPublicUrl, deleteObject } from "@/lib/r2";
import { randomUUID } from "crypto";

export const mediaRouter = createTRPCRouter({
  getUploadUrl: protectedProcedure
    .input(z.object({
      workspaceId: z.string(),
      filename: z.string().min(1),
      contentType: z.string().min(1),
      sizeBytes: z.number().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await ctx.db.membership.findUnique({
        where: { userId_workspaceId: { userId: ctx.userId, workspaceId: input.workspaceId } },
      });
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

      const ext = input.filename.split(".").pop() ?? "bin";
      const key = `media/${input.workspaceId}/${randomUUID()}.${ext}`;
      const uploadUrl = await getPresignedPutUrl(key, input.contentType, input.sizeBytes);
      const publicUrl = getPublicUrl(key);
      return { uploadUrl, key, publicUrl };
    }),

  finalizeUpload: protectedProcedure
    .input(z.object({
      workspaceId: z.string(),
      filename: z.string(),
      mimeType: z.string(),
      sizeBytes: z.number().positive(),
      r2Key: z.string(),
      publicUrl: z.string(),
      width: z.number().optional(),
      height: z.number().optional(),
      durationSeconds: z.number().optional(),
      thumbnailUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await ctx.db.membership.findUnique({
        where: { userId_workspaceId: { userId: ctx.userId, workspaceId: input.workspaceId } },
      });
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

      return ctx.db.mediaAsset.create({
        data: {
          workspaceId: input.workspaceId,
          uploadedById: ctx.userId,
          filename: input.filename,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          r2Key: input.r2Key,
          publicUrl: input.publicUrl,
          width: input.width,
          height: input.height,
          durationSeconds: input.durationSeconds,
          thumbnailUrl: input.thumbnailUrl,
        },
      });
    }),

  list: protectedProcedure
    .input(z.object({
      workspaceId: z.string(),
      cursor: z.string().optional(),
      take: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const membership = await ctx.db.membership.findUnique({
        where: { userId_workspaceId: { userId: ctx.userId, workspaceId: input.workspaceId } },
      });
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

      const items = await ctx.db.mediaAsset.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: { createdAt: "desc" },
        take: input.take + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
      });
      const hasMore = items.length > input.take;
      return {
        items: items.slice(0, input.take),
        nextCursor: hasMore ? items[input.take - 1]!.id : undefined,
      };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string(), workspaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await ctx.db.membership.findUnique({
        where: { userId_workspaceId: { userId: ctx.userId, workspaceId: input.workspaceId } },
      });
      if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const asset = await ctx.db.mediaAsset.findFirst({
        where: { id: input.id, workspaceId: input.workspaceId },
      });
      if (!asset) throw new TRPCError({ code: "NOT_FOUND" });

      await deleteObject(asset.r2Key);
      await ctx.db.mediaAsset.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
