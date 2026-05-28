import { createTRPCRouter } from "@/server/api/trpc";
import { workspaceRouter } from "@/server/api/routers/workspace";
import { billingRouter } from "@/server/api/routers/billing";
import { instagramRouter } from "@/server/api/routers/instagram";

export const appRouter = createTRPCRouter({
  workspace: workspaceRouter,
  billing: billingRouter,
  instagram: instagramRouter,
});

export type AppRouter = typeof appRouter;
