import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

async function assertMember(db: PrismaClient, userId: string, workspaceId: string) {
  const membership = await db.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
}

export const notificationRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string(), limit: z.number().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      await assertMember(ctx.db, ctx.userId, input.workspaceId);
      return ctx.db.notification.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),

  unreadCount: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertMember(ctx.db, ctx.userId, input.workspaceId);
      return ctx.db.notification.count({
        where: { workspaceId: input.workspaceId, read: false },
      });
    }),

  markAllRead: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertMember(ctx.db, ctx.userId, input.workspaceId);
      await ctx.db.notification.updateMany({
        where: { workspaceId: input.workspaceId, read: false },
        data: { read: true },
      });
      return { success: true };
    }),
});
