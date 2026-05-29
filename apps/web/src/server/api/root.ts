import { createTRPCRouter } from "@/server/api/trpc";
import { workspaceRouter } from "@/server/api/routers/workspace";
import { billingRouter } from "@/server/api/routers/billing";
import { instagramRouter } from "@/server/api/routers/instagram";
import { mediaRouter } from "@/server/api/routers/media";
import { postRouter } from "@/server/api/routers/post";
import { notificationRouter } from "@/server/api/routers/notification";
import { templateRouter } from "@/server/api/routers/template";
import { memberRouter } from "@/server/api/routers/member";

export const appRouter = createTRPCRouter({
  workspace: workspaceRouter,
  billing: billingRouter,
  instagram: instagramRouter,
  media: mediaRouter,
  post: postRouter,
  notification: notificationRouter,
  template: templateRouter,
  member: memberRouter,
});

export type AppRouter = typeof appRouter;
