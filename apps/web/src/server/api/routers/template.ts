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

export const templateRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertMember(ctx.db, ctx.userId, input.workspaceId);
      return ctx.db.captionTemplate.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: { updatedAt: "desc" },
      });
    }),

  create: protectedProcedure
    .input(z.object({
      workspaceId: z.string(),
      name: z.string().min(1).max(80),
      body: z.string().min(1).max(2200),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertMember(ctx.db, ctx.userId, input.workspaceId);
      return ctx.db.captionTemplate.create({
        data: {
          workspaceId: input.workspaceId,
          name: input.name.trim(),
          body: input.body,
          createdById: ctx.userId,
        },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string(), workspaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertMember(ctx.db, ctx.userId, input.workspaceId);
      const tpl = await ctx.db.captionTemplate.findFirst({
        where: { id: input.id, workspaceId: input.workspaceId },
      });
      if (!tpl) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db.captionTemplate.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
