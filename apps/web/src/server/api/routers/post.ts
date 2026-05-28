import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { enqueuePublishPost, cancelPublishPost } from "@/lib/queue";
import { checkRateLimit } from "@/lib/rate-limit";

const postTypes = ["FEED_IMAGE", "CAROUSEL", "REEL", "STORY"] as const;

export const postRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({
      workspaceId: z.string(),
      from: z.string().datetime(),
      to: z.string().datetime(),
    }))
    .query(async ({ ctx, input }) => {
      const membership = await ctx.db.membership.findUnique({
        where: { userId_workspaceId: { userId: ctx.userId, workspaceId: input.workspaceId } },
      });
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

      return ctx.db.scheduledPost.findMany({
        where: {
          workspaceId: input.workspaceId,
          scheduledAt: { gte: new Date(input.from), lte: new Date(input.to) },
        },
        include: {
          media: { include: { media: true }, orderBy: { order: "asc" } },
          igAccount: { select: { username: true, profilePictureUrl: true } },
        },
        orderBy: { scheduledAt: "asc" },
      });
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string(), workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const membership = await ctx.db.membership.findUnique({
        where: { userId_workspaceId: { userId: ctx.userId, workspaceId: input.workspaceId } },
      });
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

      const post = await ctx.db.scheduledPost.findFirst({
        where: { id: input.id, workspaceId: input.workspaceId },
        include: {
          media: { include: { media: true }, orderBy: { order: "asc" } },
          igAccount: { select: { username: true, profilePictureUrl: true } },
        },
      });
      if (!post) throw new TRPCError({ code: "NOT_FOUND" });
      return post;
    }),

  create: protectedProcedure
    .input(z.object({
      workspaceId: z.string(),
      igAccountId: z.string(),
      type: z.enum(postTypes),
      caption: z.string().max(2200),
      hashtags: z.string().optional(),
      firstComment: z.string().max(2200).optional(),
      scheduledAt: z.string().datetime(),
      mediaIds: z.array(z.string()).min(1).max(10),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await ctx.db.membership.findUnique({
        where: { userId_workspaceId: { userId: ctx.userId, workspaceId: input.workspaceId } },
      });
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

      if (!checkRateLimit(`post.create:${input.workspaceId}`, 20, 60_000)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Demasiadas solicitudes. Espera un momento." });
      }

      const scheduledAt = new Date(input.scheduledAt);
      if (scheduledAt.getTime() < Date.now() + 4 * 60 * 1000) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "scheduledAt debe ser al menos 5 minutos en el futuro" });
      }

      const igAccount = await ctx.db.instagramAccount.findFirst({
        where: { id: input.igAccountId, workspaceId: input.workspaceId },
      });
      if (!igAccount) throw new TRPCError({ code: "NOT_FOUND", message: "Cuenta IG no encontrada" });
      if (igAccount.status !== "active") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La cuenta de Instagram no está activa" });
      }

      const post = await ctx.db.scheduledPost.create({
        data: {
          workspaceId: input.workspaceId,
          igAccountId: input.igAccountId,
          createdById: ctx.userId,
          type: input.type,
          caption: input.caption,
          hashtags: input.hashtags,
          firstComment: input.firstComment,
          scheduledAt,
          status: "SCHEDULED",
          media: {
            create: input.mediaIds.map((mediaId, order) => ({ mediaId, order })),
          },
        },
      });

      const bullJobId = await enqueuePublishPost(post.id, scheduledAt);
      const updated = await ctx.db.scheduledPost.update({
        where: { id: post.id },
        data: { bullJobId },
      });

      await ctx.db.auditLog.create({
        data: {
          workspaceId: input.workspaceId,
          userId: ctx.userId,
          action: "post.created",
          resourceId: post.id,
          metadata: JSON.stringify({ scheduledAt, type: input.type }),
        },
      });

      return updated;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      workspaceId: z.string(),
      caption: z.string().max(2200).optional(),
      hashtags: z.string().optional(),
      firstComment: z.string().max(2200).optional(),
      scheduledAt: z.string().datetime().optional(),
      mediaIds: z.array(z.string()).min(1).max(10).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await ctx.db.membership.findUnique({
        where: { userId_workspaceId: { userId: ctx.userId, workspaceId: input.workspaceId } },
      });
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

      const post = await ctx.db.scheduledPost.findFirst({
        where: { id: input.id, workspaceId: input.workspaceId },
      });
      if (!post) throw new TRPCError({ code: "NOT_FOUND" });
      if (!["DRAFT", "SCHEDULED"].includes(post.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Solo se pueden editar posts DRAFT o SCHEDULED" });
      }

      if (post.bullJobId) await cancelPublishPost(post.bullJobId);

      const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : post.scheduledAt;

      const updateData: Record<string, unknown> = {
        ...(input.caption !== undefined && { caption: input.caption }),
        ...(input.hashtags !== undefined && { hashtags: input.hashtags }),
        ...(input.firstComment !== undefined && { firstComment: input.firstComment }),
        scheduledAt,
      };

      if (input.mediaIds) {
        await ctx.db.postMedia.deleteMany({ where: { postId: input.id } });
        await ctx.db.postMedia.createMany({
          data: input.mediaIds.map((mediaId, order) => ({ postId: input.id, mediaId, order })),
        });
      }

      const bullJobId = await enqueuePublishPost(input.id, scheduledAt);
      updateData.bullJobId = bullJobId;

      return ctx.db.scheduledPost.update({ where: { id: input.id }, data: updateData });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string(), workspaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await ctx.db.membership.findUnique({
        where: { userId_workspaceId: { userId: ctx.userId, workspaceId: input.workspaceId } },
      });
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

      const post = await ctx.db.scheduledPost.findFirst({
        where: { id: input.id, workspaceId: input.workspaceId },
      });
      if (!post) throw new TRPCError({ code: "NOT_FOUND" });
      if (!["DRAFT", "SCHEDULED", "CANCELED", "FAILED"].includes(post.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No se puede borrar un post publicado o en curso" });
      }

      if (post.bullJobId) await cancelPublishPost(post.bullJobId).catch(() => {});
      await ctx.db.postMedia.deleteMany({ where: { postId: input.id } });
      await ctx.db.scheduledPost.delete({ where: { id: input.id } });
      return { success: true };
    }),

  cancelScheduled: protectedProcedure
    .input(z.object({ id: z.string(), workspaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await ctx.db.membership.findUnique({
        where: { userId_workspaceId: { userId: ctx.userId, workspaceId: input.workspaceId } },
      });
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

      const post = await ctx.db.scheduledPost.findFirst({
        where: { id: input.id, workspaceId: input.workspaceId, status: "SCHEDULED" },
      });
      if (!post) throw new TRPCError({ code: "NOT_FOUND" });

      if (post.bullJobId) await cancelPublishPost(post.bullJobId).catch(() => {});

      return ctx.db.scheduledPost.update({
        where: { id: input.id },
        data: { status: "CANCELED" },
      });
    }),
});
