import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

async function uniqueSlug(db: any, base: string): Promise<string> {
  let slug = slugify(base);
  let counter = 0;
  while (true) {
    const candidate = counter === 0 ? slug : `${slug}-${counter}`;
    const existing = await db.workspace.findUnique({
      where: { slug: candidate },
    });
    if (!existing) return candidate;
    counter++;
  }
}

export const workspaceRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.workspace.findMany({
      where: { memberships: { some: { userId: ctx.userId } } },
      include: { memberships: { where: { userId: ctx.userId } } },
      orderBy: { createdAt: "asc" },
    });
  }),

  getBySlug: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const workspace = await ctx.db.workspace.findUnique({
        where: { slug: input.slug },
        include: {
          memberships: { where: { userId: ctx.userId } },
          igAccounts: { where: { status: "active" } },
        },
      });
      if (!workspace || workspace.memberships.length === 0) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Workspace not found" });
      }
      return workspace;
    }),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(80) }))
    .mutation(async ({ ctx, input }) => {
      const slug = await uniqueSlug(ctx.db, input.name);
      return ctx.db.workspace.create({
        data: {
          name: input.name,
          slug,
          ownerId: ctx.userId,
          memberships: {
            create: { userId: ctx.userId, role: "OWNER" },
          },
        },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        name: z.string().min(1).max(80).optional(),
        timezone: z.string().optional(),
      })
    )
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
      const { workspaceId, ...data } = input;
      return ctx.db.workspace.update({ where: { id: workspaceId }, data });
    }),

  delete: protectedProcedure
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
      if (!membership || membership.role !== "OWNER") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only owner can delete workspace",
        });
      }
      await ctx.db.workspace.delete({ where: { id: input.workspaceId } });
      return { success: true };
    }),
});
