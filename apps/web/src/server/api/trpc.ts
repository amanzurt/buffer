import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await auth();
  return { db, session, headers: opts.headers };
};

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    if (
      error.code !== "UNAUTHORIZED" &&
      error.code !== "FORBIDDEN" &&
      error.code !== "NOT_FOUND" &&
      error.code !== "BAD_REQUEST"
    ) {
      Sentry.captureException(error.cause ?? error);
    }
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createCallerFactory = t.createCallerFactory;
export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: { ...ctx, session: ctx.session, userId: ctx.session.user.id },
  });
});
