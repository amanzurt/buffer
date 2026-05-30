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
      from: z.string().datetime({ offset: true }),
      to: z.string().datetime({ offset: true }),
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
      scheduledAt: z.string().datetime({ offset: true }),
      mediaIds: z.array(z.string()).min(1).max(10),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await ctx.db.membership.findUnique({
        where: { userId_workspaceId: { userId: ctx.userId, workspaceId: input.workspaceId } },
      });
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      if (membership.role === "CLIENT") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Los clientes no pueden crear posts" });
      }
      // EDITORs submit for approval; OWNER/ADMIN/APPROVER schedule directly.
      const needsApproval = membership.role === "EDITOR";

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
          status: needsApproval ? "PENDING_APPROVAL" : "SCHEDULED",
          media: {
            create: input.mediaIds.map((mediaId, order) => ({ mediaId, order })),
          },
        },
      });

      // Only schedule the publish job once it's approved.
      let updated = post;
      if (!needsApproval) {
        const bullJobId = await enqueuePublishPost(post.id, scheduledAt);
        updated = await ctx.db.scheduledPost.update({
          where: { id: post.id },
          data: { bullJobId },
        });
      }

      await ctx.db.auditLog.create({
        data: {
          workspaceId: input.workspaceId,
          userId: ctx.userId,
          action: needsApproval ? "post.submitted_for_approval" : "post.created",
          resourceId: post.id,
          metadata: JSON.stringify({ scheduledAt, type: input.type }),
        },
      });

      return updated;
    }),

  duplicate: protectedProcedure
    .input(z.object({ id: z.string(), workspaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await ctx.db.membership.findUnique({
        where: { userId_workspaceId: { userId: ctx.userId, workspaceId: input.workspaceId } },
      });
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

      const source = await ctx.db.scheduledPost.findFirst({
        where: { id: input.id, workspaceId: input.workspaceId },
        include: { media: { orderBy: { order: "asc" } } },
      });
      if (!source) throw new TRPCError({ code: "NOT_FOUND" });

      // Schedule the copy one day after the original, clamped to the future.
      const minTime = Date.now() + 10 * 60 * 1000;
      let scheduledAt = new Date(source.scheduledAt.getTime() + 24 * 60 * 60 * 1000);
      if (scheduledAt.getTime() < minTime) scheduledAt = new Date(minTime);

      const post = await ctx.db.scheduledPost.create({
        data: {
          workspaceId: input.workspaceId,
          igAccountId: source.igAccountId,
          createdById: ctx.userId,
          type: source.type,
          caption: source.caption,
          hashtags: source.hashtags,
          firstComment: source.firstComment,
          scheduledAt,
          status: "SCHEDULED",
          media: { create: source.media.map((m) => ({ mediaId: m.mediaId, order: m.order })) },
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
          action: "post.duplicated",
          resourceId: post.id,
          metadata: JSON.stringify({ from: source.id }),
        },
      });

      return updated;
    }),

  approve: protectedProcedure
    .input(z.object({ id: z.string(), workspaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await ctx.db.membership.findUnique({
        where: { userId_workspaceId: { userId: ctx.userId, workspaceId: input.workspaceId } },
      });
      if (!membership || !["OWNER", "ADMIN", "APPROVER"].includes(membership.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tienes permiso para aprobar posts" });
      }

      const post = await ctx.db.scheduledPost.findFirst({
        where: { id: input.id, workspaceId: input.workspaceId },
      });
      if (!post) throw new TRPCError({ code: "NOT_FOUND" });
      if (post.status !== "PENDING_APPROVAL") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "El post no está pendiente de aprobación" });
      }

      // Reschedule to the future if the original time already passed while waiting.
      const minTime = Date.now() + 5 * 60 * 1000;
      const scheduledAt = post.scheduledAt.getTime() < minTime ? new Date(minTime + 5 * 60 * 1000) : post.scheduledAt;

      const bullJobId = await enqueuePublishPost(post.id, scheduledAt);
      const updated = await ctx.db.scheduledPost.update({
        where: { id: post.id },
        data: { status: "SCHEDULED", scheduledAt, bullJobId },
      });

      await ctx.db.auditLog.create({
        data: { workspaceId: input.workspaceId, userId: ctx.userId, action: "post.approved", resourceId: post.id },
      });
      return updated;
    }),

  reject: protectedProcedure
    .input(z.object({ id: z.string(), workspaceId: z.string(), reason: z.string().max(280).optional() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await ctx.db.membership.findUnique({
        where: { userId_workspaceId: { userId: ctx.userId, workspaceId: input.workspaceId } },
      });
      if (!membership || !["OWNER", "ADMIN", "APPROVER"].includes(membership.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tienes permiso para rechazar posts" });
      }

      const post = await ctx.db.scheduledPost.findFirst({
        where: { id: input.id, workspaceId: input.workspaceId },
      });
      if (!post) throw new TRPCError({ code: "NOT_FOUND" });
      if (post.status !== "PENDING_APPROVAL") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "El post no está pendiente de aprobación" });
      }

      const updated = await ctx.db.scheduledPost.update({
        where: { id: post.id },
        data: { status: "DRAFT", errorMessage: input.reason?.trim() || null },
      });

      await ctx.db.auditLog.create({
        data: {
          workspaceId: input.workspaceId,
          userId: ctx.userId,
          action: "post.rejected",
          resourceId: post.id,
          metadata: input.reason ? JSON.stringify({ reason: input.reason }) : null,
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
      scheduledAt: z.string().datetime({ offset: true }).optional(),
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
