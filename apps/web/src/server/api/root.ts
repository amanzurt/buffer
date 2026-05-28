import { createTRPCRouter } from "@/server/api/trpc";
import { workspaceRouter } from "@/server/api/routers/workspace";
import { billingRouter } from "@/server/api/routers/billing";
import { instagramRouter } from "@/server/api/routers/instagram";
import { mediaRouter } from "@/server/api/routers/media";

export const appRouter = createTRPCRouter({
  workspace: workspaceRouter,
  billing: billingRouter,
  instagram: instagramRouter,
  media: mediaRouter,
});

export type AppRouter = typeof appRouter;
