import "server-only";
import { createTRPCContext, createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { cache } from "react";
import { headers } from "next/headers";

const createContext = cache(async () => {
  const h = await headers();
  return createTRPCContext({ headers: h });
});

export const api = createCallerFactory(appRouter)(createContext);
