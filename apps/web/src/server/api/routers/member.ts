import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

// Roles a manager can assign (OWNER is reserved for the workspace creator).
const ASSIGNABLE_ROLES = ["ADMIN", "EDITOR", "APPROVER", "CLIENT"] as const;

async function getMembership(db: PrismaClient, userId: string, workspaceId: string) {
  const m = await db.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  if (!m) throw new TRPCError({ code: "FORBIDDEN" });
  return m;
}

async function assertManager(db: PrismaClient, userId: string, workspaceId: string) {
  const m = await getMembership(db, userId, workspaceId);
  if (!["OWNER", "ADMIN"].includes(m.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Solo OWNER/ADMIN pueden gestionar miembros" });
  }
  return m;
}

export const memberRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await getMembership(ctx.db, ctx.userId, input.workspaceId);
      const members = await ctx.db.membership.findMany({
        where: { workspaceId: input.workspaceId },
        include: { user: { select: { id: true, email: true, name: true } } },
        orderBy: { createdAt: "asc" },
      });
      return members.map((m) => ({
        membershipId: m.id,
        userId: m.userId,
        email: m.user.email,
        name: m.user.name,
        role: m.role,
      }));
    }),

  add: protectedProcedure
    .input(z.object({
      workspaceId: z.string(),
      email: z.string().email(),
      role: z.enum(ASSIGNABLE_ROLES),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertManager(ctx.db, ctx.userId, input.workspaceId);

      const email = input.email.trim().toLowerCase();
      // Upsert the invited user (no session is created; they sign in via magic
      // link with this email to gain access). We never set a password.
      const user = await ctx.db.user.upsert({
        where: { email },
        update: {},
        create: { email },
      });

      const existing = await ctx.db.membership.findUnique({
        where: { userId_workspaceId: { userId: user.id, workspaceId: input.workspaceId } },
      });
      if (existing) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ese usuario ya es miembro del workspace" });
      }

      await ctx.db.membership.create({
        data: { userId: user.id, workspaceId: input.workspaceId, role: input.role },
      });
      return { success: true };
    }),

  updateRole: protectedProcedure
    .input(z.object({
      workspaceId: z.string(),
      membershipId: z.string(),
      role: z.enum(ASSIGNABLE_ROLES),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertManager(ctx.db, ctx.userId, input.workspaceId);
      const target = await ctx.db.membership.findFirst({
        where: { id: input.membershipId, workspaceId: input.workspaceId },
      });
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      if (target.role === "OWNER") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No se puede cambiar el rol del propietario" });
      }
      return ctx.db.membership.update({ where: { id: target.id }, data: { role: input.role } });
    }),

  remove: protectedProcedure
    .input(z.object({ workspaceId: z.string(), membershipId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertManager(ctx.db, ctx.userId, input.workspaceId);
      const target = await ctx.db.membership.findFirst({
        where: { id: input.membershipId, workspaceId: input.workspaceId },
      });
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      if (target.role === "OWNER") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No se puede quitar al propietario" });
      }
      await ctx.db.membership.delete({ where: { id: target.id } });
      return { success: true };
    }),
});
