import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const billingRouter = createTRPCRouter({
  getSubscriptionStatus: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const membership = await ctx.db.membership.findUnique({
        where: {
          userId_workspaceId: {
            userId: ctx.userId,
            workspaceId: input.workspaceId,
          },
        },
        include: { workspace: true },
      });
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      return {
        status: membership.workspace.subscriptionStatus,
        planTier: membership.workspace.planTier,
        isActive: membership.workspace.subscriptionStatus === "active",
      };
    }),
});
