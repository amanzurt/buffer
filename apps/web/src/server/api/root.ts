import { createTRPCRouter } from "@/server/api/trpc";
import { workspaceRouter } from "@/server/api/routers/workspace";
import { billingRouter } from "@/server/api/routers/billing";

export const appRouter = createTRPCRouter({
  workspace: workspaceRouter,
  billing: billingRouter,
});

export type AppRouter = typeof appRouter;
