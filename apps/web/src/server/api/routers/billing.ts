import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { stripe, getOrCreateStripeCustomer } from "@/lib/stripe";

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

  createCheckoutSession: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await ctx.db.membership.findUnique({
        where: {
          userId_workspaceId: {
            userId: ctx.userId,
            workspaceId: input.workspaceId,
          },
        },
        include: { workspace: true },
      });
      if (!membership || membership.role !== "OWNER") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only owner can manage billing",
        });
      }

      const customerId = await getOrCreateStripeCustomer(
        ctx.db,
        input.workspaceId,
        ctx.session.user.email!,
        membership.workspace.name
      );

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const slug = membership.workspace.slug;

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        line_items: [
          { price: process.env.STRIPE_PRICE_ID ?? "", quantity: 1 },
        ],
        success_url: `${appUrl}/app/${slug}/settings/billing?success=1`,
        cancel_url: `${appUrl}/app/${slug}/settings/billing`,
        metadata: { workspaceId: input.workspaceId },
        subscription_data: { metadata: { workspaceId: input.workspaceId } },
      });

      return { url: session.url };
    }),

  createPortalSession: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const workspace = await ctx.db.workspace.findUnique({
        where: { id: input.workspaceId },
      });
      if (!workspace?.stripeCustomerId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No subscription found",
        });
      }
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const session = await stripe.billingPortal.sessions.create({
        customer: workspace.stripeCustomerId,
        return_url: `${appUrl}/app/${workspace.slug}/settings/billing`,
      });
      return { url: session.url };
    }),
});
