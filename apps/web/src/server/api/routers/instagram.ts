import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { generateOAuthState, buildOAuthUrl } from "@/lib/meta/oauth";
import { decrypt } from "@/lib/crypto";

const ENC_KEY = process.env.INSTAGRAM_TOKEN_ENC_KEY ?? "a".repeat(64);

export const instagramRouter = createTRPCRouter({
  listAccounts: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const membership = await ctx.db.membership.findUnique({
        where: {
          userId_workspaceId: {
            userId: ctx.userId,
            workspaceId: input.workspaceId,
          },
        },
      });
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

      return ctx.db.instagramAccount.findMany({
        where: { workspaceId: input.workspaceId },
        select: {
          id: true,
          igUserId: true,
          username: true,
          profilePictureUrl: true,
          accountType: true,
          status: true,
          tokenExpiresAt: true,
          lastRefreshedAt: true,
          createdAt: true,
          facebookPageName: true,
        },
        orderBy: { createdAt: "asc" },
      });
    }),

  getOAuthUrl: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await ctx.db.membership.findUnique({
        where: {
          userId_workspaceId: {
            userId: ctx.userId,
            workspaceId: input.workspaceId,
          },
        },
      });
      if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Solo el owner puede conectar cuentas de Instagram",
        });
      }

      const state = generateOAuthState(input.workspaceId);
      const url = buildOAuthUrl(state);
      return { url };
    }),

  disconnect: protectedProcedure
    .input(z.object({ accountId: z.string(), workspaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await ctx.db.membership.findUnique({
        where: {
          userId_workspaceId: {
            userId: ctx.userId,
            workspaceId: input.workspaceId,
          },
        },
      });
      if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const account = await ctx.db.instagramAccount.findFirst({
        where: { id: input.accountId, workspaceId: input.workspaceId },
      });
      if (!account) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.db.instagramAccount.update({
        where: { id: input.accountId },
        data: { status: "revoked" },
      });

      // Cancelar posts programados de esta cuenta
      await ctx.db.scheduledPost.updateMany({
        where: {
          igAccountId: input.accountId,
          status: "SCHEDULED",
        },
        data: {
          status: "CANCELED",
          errorMessage: "Cuenta de Instagram desconectada",
        },
      });

      await ctx.db.auditLog.create({
        data: {
          workspaceId: input.workspaceId,
          userId: ctx.userId,
          action: "igaccount.disconnected",
          resourceId: input.accountId,
        },
      });

      return { success: true };
    }),

  refreshTokenManual: protectedProcedure
    .input(z.object({ accountId: z.string(), workspaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await ctx.db.membership.findUnique({
        where: {
          userId_workspaceId: {
            userId: ctx.userId,
            workspaceId: input.workspaceId,
          },
        },
      });
      if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const account = await ctx.db.instagramAccount.findFirst({
        where: { id: input.accountId, workspaceId: input.workspaceId },
      });
      if (!account) throw new TRPCError({ code: "NOT_FOUND" });

      // El refresh real lo hace el worker — aquí solo validamos permisos
      // y devolvemos el estado actual
      return {
        status: account.status,
        tokenExpiresAt: account.tokenExpiresAt,
        lastRefreshedAt: account.lastRefreshedAt,
      };
    }),
});
