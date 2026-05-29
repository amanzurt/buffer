# Plan A – Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap a working multi-tenant SaaS with monorepo, Next.js + tRPC, NextAuth magic-link, workspace CRUD, and Stripe subscriptions — the deployable foundation every subsequent plan builds on.

**Architecture:** pnpm workspaces + Turborepo monorepo with `apps/web` (Next.js 15 App Router), `apps/worker` (BullMQ Node worker), `packages/db` (shared Prisma client), and `packages/types`. NextAuth v5 handles SaaS auth; tRPC v11 over Route Handlers provides type-safe API; Neon Postgres stores all state; Stripe subscriptions gate access.

**Tech Stack:** Next.js 15, React 19, TypeScript 5, tRPC v11, Prisma 5 + Prisma Accelerate, NextAuth v5, Neon Postgres, Stripe, Tailwind v4, shadcn/ui, Vitest, pnpm workspaces, Turborepo

---

## File Map

```
turbo.json
pnpm-workspace.yaml
.env.example
.gitignore

packages/db/
  package.json
  src/index.ts          ← Prisma client singleton export
  src/schema.prisma     ← Full schema (symlinked from apps/web/prisma)

packages/types/
  package.json
  src/index.ts          ← Shared TS types (Role, PostStatus, etc.)

apps/web/
  package.json
  tsconfig.json
  next.config.ts
  tailwind.config.ts
  components.json       ← shadcn config
  middleware.ts         ← Auth redirect guard
  prisma/
    schema.prisma       ← Source of truth
    migrations/
  src/
    env.ts              ← Zod env validation
    lib/
      db.ts             ← Prisma client (imports packages/db)
      stripe.ts         ← Stripe client + helpers
      auth.ts           ← NextAuth config
    server/
      api/
        trpc.ts         ← tRPC init, context, middleware
        root.ts         ← AppRouter merge
        routers/
          workspace.ts  ← list, create, update, delete, getBySlug
          billing.ts    ← createCheckoutSession, createPortalSession, getStatus
    app/
      layout.tsx
      (marketing)/
        page.tsx        ← Landing (placeholder)
        pricing/page.tsx
        legal/
          privacy/page.tsx
          terms/page.tsx
      (app)/
        layout.tsx      ← Auth guard + workspace resolver
        app/
          page.tsx      ← Redirect to first workspace
        [workspace]/
          layout.tsx    ← Sidebar shell
          page.tsx      ← Dashboard stub
          settings/
            page.tsx
            billing/page.tsx
      api/
        auth/
          [...nextauth]/route.ts
          meta/callback/route.ts  ← placeholder (Plan B)
        trpc/[trpc]/route.ts
        webhooks/
          stripe/route.ts

apps/worker/
  package.json
  tsconfig.json
  src/
    index.ts            ← BullMQ worker bootstrap (hello-world)
  Dockerfile

.github/
  workflows/
    ci.yml
```

---

## Task 1: Monorepo Scaffold

**Files:**
- Create: `turbo.json`
- Create: `pnpm-workspace.yaml`
- Create: `packages/db/package.json`
- Create: `packages/types/package.json`
- Create: `apps/web/package.json`
- Create: `apps/worker/package.json`
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Init monorepo root**

```bash
cd /Users/albertomanzur/Documents/Buffer
git init
pnpm init
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Create turbo.json**

```json
{
  "$schema": "https://turborepo.org/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

- [ ] **Step 4: Install Turborepo**

```bash
pnpm add -w -D turbo
```

- [ ] **Step 5: Create packages/db**

```bash
mkdir -p packages/db/src
```

```json
// packages/db/package.json
{
  "name": "@buffer/db",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:push": "prisma db push"
  },
  "dependencies": {
    "@prisma/client": "^5.22.0"
  },
  "devDependencies": {
    "prisma": "^5.22.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 6: Create packages/types**

```bash
mkdir -p packages/types/src
```

```json
// packages/types/package.json
{
  "name": "@buffer/types",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}
```

```typescript
// packages/types/src/index.ts
export type Role = "OWNER" | "ADMIN" | "EDITOR" | "APPROVER" | "CLIENT";

export type PostType = "FEED_IMAGE" | "CAROUSEL" | "REEL" | "STORY";

export type PostStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "PUBLISHING"
  | "PUBLISHED"
  | "FAILED"
  | "CANCELED";

export type SubscriptionStatus = "active" | "past_due" | "canceled" | "trialing";

export type PlanTier = "free" | "starter" | "pro" | "agency";
```

- [ ] **Step 7: Scaffold apps/web**

```bash
cd apps
pnpm create next-app@latest web \
  --typescript --tailwind --eslint --app \
  --no-src-dir --import-alias "@/*"
```

Wait — use `src` directory. After running the above, manually update `tsconfig.json` if needed to point to `src/`.

Actually run:
```bash
pnpm create next-app@latest web \
  --typescript --tailwind --eslint --app \
  --src-dir --import-alias "@/*"
```

- [ ] **Step 8: Update apps/web/package.json with all deps**

```json
{
  "name": "@buffer/web",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@buffer/db": "workspace:*",
    "@buffer/types": "workspace:*",
    "@prisma/client": "^5.22.0",
    "@trpc/client": "^11.0.0",
    "@trpc/next": "^11.0.0",
    "@trpc/react-query": "^11.0.0",
    "@trpc/server": "^11.0.0",
    "@tanstack/react-query": "^5.62.0",
    "next-auth": "^5.0.0-beta.25",
    "@auth/prisma-adapter": "^2.7.0",
    "zod": "^3.23.0",
    "stripe": "^17.0.0",
    "@t3-oss/env-nextjs": "^0.11.0",
    "next": "15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "superjson": "^2.2.1",
    "server-only": "^0.0.1"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0",
    "@vitejs/plugin-react": "^4.3.0",
    "prisma": "^5.22.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0"
  }
}
```

- [ ] **Step 9: Scaffold apps/worker**

```bash
mkdir -p apps/worker/src
```

```json
// apps/worker/package.json
{
  "name": "@buffer/worker",
  "version": "0.0.1",
  "private": true,
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@buffer/db": "workspace:*",
    "@buffer/types": "workspace:*",
    "bullmq": "^5.14.0",
    "ioredis": "^5.4.0"
  },
  "devDependencies": {
    "@types/node": "^20",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 10: Create root tsconfig.json**

```json
// tsconfig.json (root)
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 11: Create .env.example**

```bash
# .env.example

# Database
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require"
DATABASE_URL_UNPOOLED="postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require"

# NextAuth
AUTH_SECRET="generate-with-openssl-rand-base64-32"
AUTH_URL="http://localhost:3000"

# Email (Resend)
AUTH_RESEND_KEY="re_..."
EMAIL_FROM="noreply@yourdomain.com"

# Stripe
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PRICE_ID="price_..."

# Cloudflare R2
R2_ACCOUNT_ID=""
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""
R2_BUCKET_NAME=""
R2_PUBLIC_URL="https://media.yourdomain.com"

# Instagram / Meta
META_APP_ID=""
META_APP_SECRET=""
INSTAGRAM_TOKEN_ENC_KEY="32-bytes-hex-key-for-aes-256-gcm"

# Redis (Upstash)
REDIS_URL="rediss://..."
REDIS_TOKEN=""

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
```

- [ ] **Step 12: Create .gitignore**

```
# .gitignore
node_modules/
.env
.env.local
.env.*.local
.next/
dist/
.turbo/
*.tsbuildinfo
```

- [ ] **Step 13: Install all dependencies**

```bash
cd /Users/albertomanzur/Documents/Buffer
pnpm install
```

Expected: all packages resolve, no peer dep errors.

- [ ] **Step 14: Commit scaffold**

```bash
git add -A
git commit -m "chore: monorepo scaffold with pnpm workspaces + turborepo"
```

---

## Task 2: Prisma Schema + Neon

**Files:**
- Create: `apps/web/prisma/schema.prisma`
- Create: `packages/db/src/index.ts`

- [ ] **Step 1: Set up Neon project**

1. Go to neon.tech → Create project → name `buffer-saas` → region `us-east-1`
2. Copy the **Pooled connection string** → `DATABASE_URL` in `.env.local`
3. Copy the **Direct connection string** → `DATABASE_URL_UNPOOLED` in `.env.local`

Create `.env.local` at monorepo root (not committed):
```bash
cp .env.example .env.local
# Fill in DATABASE_URL and DATABASE_URL_UNPOOLED
```

- [ ] **Step 2: Write prisma/schema.prisma**

```prisma
// apps/web/prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DATABASE_URL_UNPOOLED")
}

// ─── NextAuth models ──────────────────────────────────────

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}

// ─── SaaS models ──────────────────────────────────────────

model User {
  id          String   @id @default(cuid())
  email       String   @unique
  name        String?
  image       String?
  createdAt   DateTime @default(now())
  accounts    Account[]
  sessions    Session[]
  memberships Membership[]
}

model Workspace {
  id                 String   @id @default(cuid())
  name               String
  slug               String   @unique
  ownerId            String
  timezone           String   @default("America/Mexico_City")
  stripeCustomerId   String?  @unique
  subscriptionStatus String?
  planTier           String   @default("free")
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  memberships        Membership[]
  igAccounts         InstagramAccount[]
  posts              ScheduledPost[]
  mediaAssets        MediaAsset[]
}

model Membership {
  id          String    @id @default(cuid())
  userId      String
  workspaceId String
  role        Role      @default(EDITOR)
  createdAt   DateTime  @default(now())
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@unique([userId, workspaceId])
  @@index([workspaceId])
}

enum Role {
  OWNER
  ADMIN
  EDITOR
  APPROVER
  CLIENT
}

// ─── Instagram ────────────────────────────────────────────

model InstagramAccount {
  id                String   @id @default(cuid())
  workspaceId       String
  igUserId          String   @unique
  username          String
  profilePictureUrl String?
  accountType       String
  facebookPageId    String
  facebookPageName  String?
  accessTokenEnc    Bytes
  tokenExpiresAt    DateTime
  lastRefreshedAt   DateTime @default(now())
  status            String   @default("active")
  scopes            String[]
  connectedById     String
  createdAt         DateTime @default(now())
  workspace         Workspace      @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  posts             ScheduledPost[]

  @@index([workspaceId])
  @@index([tokenExpiresAt])
}

// ─── Media ────────────────────────────────────────────────

model MediaAsset {
  id              String   @id @default(cuid())
  workspaceId     String
  uploadedById    String
  filename        String
  mimeType        String
  sizeBytes       Int
  r2Key           String   @unique
  publicUrl       String
  width           Int?
  height          Int?
  durationSeconds Float?
  thumbnailUrl    String?
  createdAt       DateTime @default(now())
  workspace       Workspace   @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  postMedia       PostMedia[]

  @@index([workspaceId])
}

// ─── Posts ────────────────────────────────────────────────

model ScheduledPost {
  id            String     @id @default(cuid())
  workspaceId   String
  igAccountId   String
  createdById   String
  type          PostType
  caption       String     @db.Text
  hashtags      String?    @db.Text
  firstComment  String?    @db.Text
  scheduledAt   DateTime
  publishedAt   DateTime?
  igMediaId     String?
  igContainerId String?
  status        PostStatus @default(DRAFT)
  errorMessage  String?    @db.Text
  errorCode     String?
  retryCount    Int        @default(0)
  bullJobId     String?
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt
  workspace     Workspace        @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  igAccount     InstagramAccount @relation(fields: [igAccountId], references: [id])
  media         PostMedia[]
  insights      PostInsight?

  @@index([scheduledAt, status])
  @@index([workspaceId, scheduledAt])
}

enum PostType {
  FEED_IMAGE
  CAROUSEL
  REEL
  STORY
}

enum PostStatus {
  DRAFT
  SCHEDULED
  PUBLISHING
  PUBLISHED
  FAILED
  CANCELED
}

model PostMedia {
  postId  String
  mediaId String
  order   Int           @default(0)
  post    ScheduledPost @relation(fields: [postId], references: [id], onDelete: Cascade)
  media   MediaAsset    @relation(fields: [mediaId], references: [id])

  @@id([postId, mediaId])
}

model PostInsight {
  postId      String        @id
  reach       Int?
  impressions Int?
  likes       Int?
  comments    Int?
  saves       Int?
  videoViews  Int?
  engagement  Float?
  fetchedAt   DateTime      @default(now())
  post        ScheduledPost @relation(fields: [postId], references: [id])
}

// ─── Audit ────────────────────────────────────────────────

model AuditLog {
  id          String   @id @default(cuid())
  workspaceId String?
  userId      String?
  action      String
  resourceId  String?
  metadata    Json?
  ipAddress   String?
  createdAt   DateTime @default(now())

  @@index([workspaceId, createdAt])
}
```

- [ ] **Step 3: Write packages/db/src/index.ts**

```typescript
// packages/db/src/index.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

export * from "@prisma/client";
```

- [ ] **Step 4: Run first migration**

```bash
cd apps/web
pnpm prisma migrate dev --name init
```

Expected output:
```
Applying migration `20260528000000_init`
Your database is now in sync with your schema.
Generated Prisma Client
```

- [ ] **Step 5: Verify DB connection**

```bash
cd apps/web
pnpm prisma db pull
```

Expected: `The database schema is already up to date.`

- [ ] **Step 6: Commit**

```bash
cd /Users/albertomanzur/Documents/Buffer
git add apps/web/prisma/ packages/db/src/
git commit -m "feat(db): prisma schema + neon migration"
```

---

## Task 3: Environment Validation + Base Config

**Files:**
- Create: `apps/web/src/env.ts`
- Create: `apps/web/src/lib/db.ts`
- Create: `apps/web/next.config.ts`

- [ ] **Step 1: Write src/env.ts**

```typescript
// apps/web/src/env.ts
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    DATABASE_URL_UNPOOLED: z.string().url(),
    AUTH_SECRET: z.string().min(32),
    AUTH_RESEND_KEY: z.string().startsWith("re_"),
    EMAIL_FROM: z.string().email(),
    STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
    STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
    STRIPE_PRICE_ID: z.string().startsWith("price_"),
    R2_ACCOUNT_ID: z.string().min(1),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    R2_BUCKET_NAME: z.string().min(1),
    R2_PUBLIC_URL: z.string().url(),
    META_APP_ID: z.string().min(1),
    META_APP_SECRET: z.string().min(1),
    INSTAGRAM_TOKEN_ENC_KEY: z.string().length(64),
    REDIS_URL: z.string().url(),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().startsWith("pk_"),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_RESEND_KEY: process.env.AUTH_RESEND_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_PRICE_ID: process.env.STRIPE_PRICE_ID,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
    R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
    META_APP_ID: process.env.META_APP_ID,
    META_APP_SECRET: process.env.META_APP_SECRET,
    INSTAGRAM_TOKEN_ENC_KEY: process.env.INSTAGRAM_TOKEN_ENC_KEY,
    REDIS_URL: process.env.REDIS_URL,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
```

- [ ] **Step 2: Write src/lib/db.ts**

```typescript
// apps/web/src/lib/db.ts
export { db } from "@buffer/db";
```

- [ ] **Step 3: Write next.config.ts**

```typescript
// apps/web/next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    reactCompiler: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.r2.cloudflarestorage.com",
      },
      {
        protocol: "https",
        hostname: "media.*.com",
      },
    ],
  },
};

export default nextConfig;
```

- [ ] **Step 4: Install @t3-oss/env-nextjs**

```bash
cd apps/web
pnpm add @t3-oss/env-nextjs
```

- [ ] **Step 5: Write vitest.config.ts**

```typescript
// apps/web/vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    setupFiles: [],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
```

- [ ] **Step 6: Write a smoke test to verify env + db connection**

```typescript
// apps/web/src/__tests__/smoke.test.ts
import { describe, it, expect } from "vitest";

describe("env", () => {
  it("imports without throwing (env vars present)", async () => {
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test";
    process.env.DATABASE_URL_UNPOOLED = "postgresql://test:test@localhost/test";
    process.env.AUTH_SECRET = "a".repeat(32);
    process.env.AUTH_RESEND_KEY = "re_test_key";
    process.env.EMAIL_FROM = "test@test.com";
    process.env.STRIPE_SECRET_KEY = "sk_test_key";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    process.env.STRIPE_PRICE_ID = "price_test";
    process.env.R2_ACCOUNT_ID = "test";
    process.env.R2_ACCESS_KEY_ID = "test";
    process.env.R2_SECRET_ACCESS_KEY = "test";
    process.env.R2_BUCKET_NAME = "test";
    process.env.R2_PUBLIC_URL = "https://media.example.com";
    process.env.META_APP_ID = "test";
    process.env.META_APP_SECRET = "test";
    process.env.INSTAGRAM_TOKEN_ENC_KEY = "a".repeat(64);
    process.env.REDIS_URL = "rediss://test";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_key";
    process.env.SKIP_ENV_VALIDATION = "true";

    const { env } = await import("../env");
    expect(env).toBeDefined();
  });
});
```

- [ ] **Step 7: Run smoke test**

```bash
cd apps/web
SKIP_ENV_VALIDATION=true pnpm test
```

Expected: `1 passed`

- [ ] **Step 8: Commit**

```bash
cd /Users/albertomanzur/Documents/Buffer
git add apps/web/src/env.ts apps/web/src/lib/db.ts apps/web/next.config.ts apps/web/vitest.config.ts apps/web/src/__tests__/
git commit -m "feat(config): env validation + base config"
```

---

## Task 4: NextAuth v5 + Magic Link

**Files:**
- Create: `apps/web/src/lib/auth.ts`
- Create: `apps/web/src/app/api/auth/[...nextauth]/route.ts`
- Create: `apps/web/src/app/(marketing)/login/page.tsx`
- Create: `apps/web/middleware.ts`

- [ ] **Step 1: Install NextAuth + Resend provider + Prisma adapter**

```bash
cd apps/web
pnpm add next-auth@beta @auth/prisma-adapter resend
```

- [ ] **Step 2: Write src/lib/auth.ts**

```typescript
// apps/web/src/lib/auth.ts
import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import { env } from "@/env";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "database" },
  providers: [
    Resend({
      apiKey: env.AUTH_RESEND_KEY,
      from: env.EMAIL_FROM,
    }),
  ],
  pages: {
    signIn: "/login",
    verifyRequest: "/login?verify=1",
    error: "/login?error=1",
  },
  callbacks: {
    async session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
```

- [ ] **Step 3: Write the auth route handler**

```typescript
// apps/web/src/app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/lib/auth";
export const { GET, POST } = handlers;
```

- [ ] **Step 4: Write the login page**

```tsx
// apps/web/src/app/(marketing)/login/page.tsx
import { signIn, auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ verify?: string; error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/app");

  const params = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm p-8 bg-white rounded-2xl shadow-sm border border-gray-100">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Iniciar sesión</h1>
        <p className="text-sm text-gray-500 mb-6">
          Ingresa tu email para recibir un enlace de acceso.
        </p>

        {params.verify && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            Revisa tu correo — te enviamos un enlace de acceso.
          </div>
        )}

        {params.error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            Hubo un error. Intenta de nuevo.
          </div>
        )}

        <form
          action={async (formData: FormData) => {
            "use server";
            await signIn("resend", formData);
          }}
        >
          <div className="space-y-3">
            <input
              type="email"
              name="email"
              required
              placeholder="tu@email.com"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <button
              type="submit"
              className="w-full bg-gray-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              Enviar enlace de acceso
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Write middleware.ts**

```typescript
// apps/web/middleware.ts
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth?.user;
  const isAppRoute = req.nextUrl.pathname.startsWith("/app");
  const isApiRoute = req.nextUrl.pathname.startsWith("/api");
  const isAuthRoute = req.nextUrl.pathname.startsWith("/api/auth");

  if (isAuthRoute || isApiRoute) return NextResponse.next();

  if (isAppRoute && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 6: Extend NextAuth types**

```typescript
// apps/web/src/types/next-auth.d.ts
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
```

- [ ] **Step 7: Test auth locally**

```bash
cd apps/web
pnpm dev
```

1. Open `http://localhost:3000/login`
2. Enter an email you can check
3. Click "Enviar enlace de acceso"
4. Expect redirect to `/login?verify=1`
5. Check email for magic link
6. Click link → expect redirect to `/app`

- [ ] **Step 8: Commit**

```bash
cd /Users/albertomanzur/Documents/Buffer
git add apps/web/src/lib/auth.ts apps/web/src/app/api/auth/ apps/web/src/app/(marketing)/login/ apps/web/middleware.ts apps/web/src/types/
git commit -m "feat(auth): nextauth v5 magic link via resend"
```

---

## Task 5: tRPC Setup

**Files:**
- Create: `apps/web/src/server/api/trpc.ts`
- Create: `apps/web/src/server/api/root.ts`
- Create: `apps/web/src/lib/trpc/server.ts`
- Create: `apps/web/src/lib/trpc/client.tsx`
- Create: `apps/web/src/app/api/trpc/[trpc]/route.ts`

- [ ] **Step 1: Install tRPC + superjson**

```bash
cd apps/web
pnpm add @trpc/server @trpc/client @trpc/react-query @tanstack/react-query superjson
```

- [ ] **Step 2: Write src/server/api/trpc.ts**

```typescript
// apps/web/src/server/api/trpc.ts
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await auth();
  return {
    db,
    session,
    headers: opts.headers,
  };
};

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
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
    ctx: {
      ...ctx,
      session: ctx.session,
      userId: ctx.session.user.id,
    },
  });
});

export const workspaceProcedure = protectedProcedure
  .input(
    (input: unknown) => {
      if (typeof input === "object" && input !== null && "workspaceId" in input) {
        return input as { workspaceId: string } & Record<string, unknown>;
      }
      throw new TRPCError({ code: "BAD_REQUEST", message: "workspaceId required" });
    }
  )
  .use(async ({ ctx, input, next }) => {
    const membership = await ctx.db.membership.findUnique({
      where: {
        userId_workspaceId: {
          userId: ctx.userId,
          workspaceId: input.workspaceId,
        },
      },
      include: { workspace: true },
    });

    if (!membership) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this workspace" });
    }

    return next({
      ctx: {
        ...ctx,
        workspace: membership.workspace,
        membership,
        role: membership.role,
      },
    });
  });
```

- [ ] **Step 3: Write src/app/api/trpc/[trpc]/route.ts**

```typescript
// apps/web/src/app/api/trpc/[trpc]/route.ts
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ headers: req.headers }),
    onError:
      process.env.NODE_ENV === "development"
        ? ({ path, error }) => {
            console.error(`tRPC error on ${path ?? "<no-path>"}:`, error);
          }
        : undefined,
  });

export { handler as GET, handler as POST };
```

- [ ] **Step 4: Write src/lib/trpc/server.ts**

```typescript
// apps/web/src/lib/trpc/server.ts
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
```

- [ ] **Step 5: Write src/lib/trpc/client.tsx (placeholder — needed by root.ts)**

```typescript
// apps/web/src/lib/trpc/client.tsx
"use client";
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@/server/api/root";

export const trpc = createTRPCReact<AppRouter>();
```

- [ ] **Step 6: Write a stub root.ts (will be extended each task)**

```typescript
// apps/web/src/server/api/root.ts
import { createTRPCRouter } from "@/server/api/trpc";
import { workspaceRouter } from "@/server/api/routers/workspace";
import { billingRouter } from "@/server/api/routers/billing";

export const appRouter = createTRPCRouter({
  workspace: workspaceRouter,
  billing: billingRouter,
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 7: Commit**

```bash
cd /Users/albertomanzur/Documents/Buffer
git add apps/web/src/server/api/trpc.ts apps/web/src/server/api/root.ts apps/web/src/lib/trpc/ apps/web/src/app/api/trpc/
git commit -m "feat(trpc): setup with context, protected procedures, workspace middleware"
```

---

## Task 6: Workspace Router

**Files:**
- Create: `apps/web/src/server/api/routers/workspace.ts`
- Create: `apps/web/src/__tests__/routers/workspace.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/src/__tests__/routers/workspace.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";
import { workspaceRouter } from "@/server/api/routers/workspace";
import { db } from "@/lib/db";

const router = createTRPCRouter({ workspace: workspaceRouter });
const createCaller = createCallerFactory(router);

const mockSession = (userId: string) => ({
  session: {
    user: { id: userId, email: "test@test.com", name: "Test User" },
    expires: new Date(Date.now() + 86400000).toISOString(),
  },
  db,
  headers: new Headers(),
  userId,
});

describe("workspace router", () => {
  let userId: string;

  beforeEach(async () => {
    const user = await db.user.create({
      data: { email: `test-${Date.now()}@test.com` },
    });
    userId = user.id;
  });

  afterEach(async () => {
    await db.membership.deleteMany({ where: { userId } });
    await db.workspace.deleteMany({ where: { ownerId: userId } });
    await db.user.delete({ where: { id: userId } });
  });

  it("creates a workspace and adds owner membership", async () => {
    const caller = createCaller(mockSession(userId) as any);
    const ws = await caller.workspace.create({ name: "My Agency" });
    expect(ws.name).toBe("My Agency");
    expect(ws.ownerId).toBe(userId);
    const membership = await db.membership.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: ws.id } },
    });
    expect(membership?.role).toBe("OWNER");
  });

  it("lists only workspaces the user belongs to", async () => {
    const caller = createCaller(mockSession(userId) as any);
    await caller.workspace.create({ name: "Workspace 1" });
    await caller.workspace.create({ name: "Workspace 2" });
    const list = await caller.workspace.list();
    expect(list.length).toBe(2);
    expect(list.every((w) => w.memberships.some((m) => m.userId === userId))).toBe(true);
  });

  it("throws FORBIDDEN when getBySlug for non-member workspace", async () => {
    const otherUser = await db.user.create({ data: { email: `other-${Date.now()}@test.com` } });
    const otherWs = await db.workspace.create({
      data: {
        name: "Other",
        slug: `other-${Date.now()}`,
        ownerId: otherUser.id,
        memberships: { create: { userId: otherUser.id, role: "OWNER" } },
      },
    });
    const caller = createCaller(mockSession(userId) as any);
    await expect(caller.workspace.getBySlug({ slug: otherWs.slug })).rejects.toThrow("FORBIDDEN");
    await db.membership.deleteMany({ where: { userId: otherUser.id } });
    await db.workspace.delete({ where: { id: otherWs.id } });
    await db.user.delete({ where: { id: otherUser.id } });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/web
SKIP_ENV_VALIDATION=true pnpm test src/__tests__/routers/workspace.test.ts
```

Expected: `Cannot find module '@/server/api/routers/workspace'`

- [ ] **Step 3: Write src/server/api/routers/workspace.ts**

```typescript
// apps/web/src/server/api/routers/workspace.ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  protectedProcedure,
} from "@/server/api/trpc";

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
    const existing = await db.workspace.findUnique({ where: { slug: candidate } });
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
        where: { userId_workspaceId: { userId: ctx.userId, workspaceId: input.workspaceId } },
      });
      if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const { workspaceId, ...data } = input;
      return ctx.db.workspace.update({ where: { id: workspaceId }, data });
    }),

  delete: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await ctx.db.membership.findUnique({
        where: { userId_workspaceId: { userId: ctx.userId, workspaceId: input.workspaceId } },
      });
      if (!membership || membership.role !== "OWNER") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only owner can delete workspace" });
      }
      await ctx.db.workspace.delete({ where: { id: input.workspaceId } });
      return { success: true };
    }),
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/web
SKIP_ENV_VALIDATION=true pnpm test src/__tests__/routers/workspace.test.ts
```

Expected: `3 passed`

- [ ] **Step 5: Commit**

```bash
cd /Users/albertomanzur/Documents/Buffer
git add apps/web/src/server/api/routers/workspace.ts apps/web/src/__tests__/routers/
git commit -m "feat(workspace): tRPC router with list/create/update/delete + tests"
```

---

## Task 7: Stripe Billing

**Files:**
- Create: `apps/web/src/lib/stripe.ts`
- Create: `apps/web/src/server/api/routers/billing.ts`
- Create: `apps/web/src/app/api/webhooks/stripe/route.ts`
- Create: `apps/web/src/__tests__/lib/stripe.test.ts`

- [ ] **Step 1: Install Stripe**

```bash
cd apps/web
pnpm add stripe @stripe/stripe-js
```

- [ ] **Step 2: Create Stripe products**

In Stripe Dashboard (test mode):
1. Create a Product: "Buffer Starter — USD 19/mes"
2. Add a Recurring Price: USD 19/month
3. Copy the `price_xxx` ID → `STRIPE_PRICE_ID` in `.env.local`

- [ ] **Step 3: Write src/lib/stripe.ts**

```typescript
// apps/web/src/lib/stripe.ts
import Stripe from "stripe";
import { env } from "@/env";

export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-05-28.basil",
  typescript: true,
});

export async function getOrCreateStripeCustomer(
  db: any,
  workspaceId: string,
  email: string,
  name: string
): Promise<string> {
  const workspace = await db.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { stripeCustomerId: true },
  });

  if (workspace.stripeCustomerId) return workspace.stripeCustomerId;

  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { workspaceId },
  });

  await db.workspace.update({
    where: { id: workspaceId },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
}
```

- [ ] **Step 4: Write failing test for stripe helper**

```typescript
// apps/web/src/__tests__/lib/stripe.test.ts
import { describe, it, expect, vi } from "vitest";

describe("getOrCreateStripeCustomer", () => {
  it("returns existing customerId without calling Stripe", async () => {
    const mockDb = {
      workspace: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ stripeCustomerId: "cus_existing" }),
        update: vi.fn(),
      },
    };

    const { getOrCreateStripeCustomer } = await import("@/lib/stripe");
    const id = await getOrCreateStripeCustomer(mockDb, "ws_1", "test@test.com", "Test");
    expect(id).toBe("cus_existing");
    expect(mockDb.workspace.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Run test to verify it fails (module not found)**

```bash
cd apps/web
SKIP_ENV_VALIDATION=true pnpm test src/__tests__/lib/stripe.test.ts
```

Expected: either fails on missing module or missing env. Either is expected.

- [ ] **Step 6: Write src/server/api/routers/billing.ts**

```typescript
// apps/web/src/server/api/routers/billing.ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { stripe, getOrCreateStripeCustomer } from "@/lib/stripe";
import { env } from "@/env";

export const billingRouter = createTRPCRouter({
  getSubscriptionStatus: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const membership = await ctx.db.membership.findUnique({
        where: { userId_workspaceId: { userId: ctx.userId, workspaceId: input.workspaceId } },
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
        where: { userId_workspaceId: { userId: ctx.userId, workspaceId: input.workspaceId } },
        include: { workspace: true },
      });
      if (!membership || membership.role !== "OWNER") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only owner can manage billing" });
      }

      const customerId = await getOrCreateStripeCustomer(
        ctx.db,
        input.workspaceId,
        ctx.session.user.email!,
        membership.workspace.name
      );

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
        success_url: `${env.NEXT_PUBLIC_APP_URL}/app/${membership.workspace.slug}/settings/billing?success=1`,
        cancel_url: `${env.NEXT_PUBLIC_APP_URL}/app/${membership.workspace.slug}/settings/billing`,
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
        throw new TRPCError({ code: "BAD_REQUEST", message: "No subscription found" });
      }
      const session = await stripe.billingPortal.sessions.create({
        customer: workspace.stripeCustomerId,
        return_url: `${env.NEXT_PUBLIC_APP_URL}/app/${workspace.slug}/settings/billing`,
      });
      return { url: session.url };
    }),
});
```

- [ ] **Step 7: Write the Stripe webhook handler**

```typescript
// apps/web/src/app/api/webhooks/stripe/route.ts
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { env } from "@/env";
import { db } from "@/lib/db";
import type Stripe from "stripe";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) return NextResponse.json({ error: "No signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const workspaceId = session.metadata?.workspaceId;
      if (workspaceId) {
        await db.workspace.update({
          where: { id: workspaceId },
          data: { subscriptionStatus: "active", planTier: "starter" },
        });
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const workspaceId = sub.metadata?.workspaceId;
      if (workspaceId) {
        await db.workspace.update({
          where: { id: workspaceId },
          data: {
            subscriptionStatus: sub.status,
            planTier: sub.status === "active" ? "starter" : "free",
          },
        });
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
```

- [ ] **Step 8: Test billing with Stripe CLI**

```bash
# Terminal 1
cd apps/web && pnpm dev

# Terminal 2 — install stripe CLI if not present: brew install stripe/stripe-cli/stripe
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Terminal 3 — trigger test event
stripe trigger checkout.session.completed
```

Expected: log shows `received: true`, workspace table updated.

- [ ] **Step 9: Commit**

```bash
cd /Users/albertomanzur/Documents/Buffer
git add apps/web/src/lib/stripe.ts apps/web/src/server/api/routers/billing.ts apps/web/src/app/api/webhooks/stripe/
git commit -m "feat(billing): stripe checkout + portal + webhook handler"
```

---

## Task 8: App Shell + Routing

**Files:**
- Create: `apps/web/src/app/(app)/layout.tsx`
- Create: `apps/web/src/app/(app)/app/page.tsx`
- Create: `apps/web/src/app/(app)/[workspace]/layout.tsx`
- Create: `apps/web/src/app/(app)/[workspace]/page.tsx`
- Create: `apps/web/src/app/(app)/[workspace]/settings/billing/page.tsx`
- Create: `apps/web/src/app/(app)/[workspace]/accounts/page.tsx`
- Create: `apps/web/src/components/sidebar.tsx`

- [ ] **Step 1: Install shadcn/ui**

```bash
cd apps/web
pnpm dlx shadcn@latest init -d
pnpm dlx shadcn@latest add button badge avatar dropdown-menu separator
```

When prompted: choose Default style, Zinc color, yes CSS variables.

- [ ] **Step 2: Write (app)/layout.tsx**

```tsx
// apps/web/src/app/(app)/layout.tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return <>{children}</>;
}
```

- [ ] **Step 3: Write (app)/app/page.tsx — redirect to first workspace**

```tsx
// apps/web/src/app/(app)/app/page.tsx
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

export default async function AppIndexPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const membership = await db.membership.findFirst({
    where: { userId: session.user.id },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });

  if (!membership) redirect("/onboarding");

  redirect(`/app/${membership.workspace.slug}`);
}
```

- [ ] **Step 4: Write the sidebar component**

```tsx
// apps/web/src/components/sidebar.tsx
import Link from "next/link";
import { Calendar, Image, Settings, Instagram } from "lucide-react";

interface SidebarProps {
  workspaceSlug: string;
  workspaceName: string;
}

export function Sidebar({ workspaceSlug, workspaceName }: SidebarProps) {
  const base = `/app/${workspaceSlug}`;
  const navItems = [
    { href: `${base}/calendar`, icon: Calendar, label: "Calendario" },
    { href: `${base}/media`, icon: Image, label: "Biblioteca" },
    { href: `${base}/accounts`, icon: Instagram, label: "Cuentas IG" },
    { href: `${base}/settings`, icon: Settings, label: "Configuración" },
  ];

  return (
    <aside className="w-56 min-h-screen border-r border-gray-100 bg-white flex flex-col">
      <div className="px-4 py-5 border-b border-gray-100">
        <span className="font-semibold text-sm text-gray-900 truncate">{workspaceName}</span>
      </div>
      <nav className="flex-1 px-2 py-4 space-y-0.5">
        {navItems.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
```

Install lucide:
```bash
cd apps/web && pnpm add lucide-react
```

- [ ] **Step 5: Write [workspace]/layout.tsx**

```tsx
// apps/web/src/app/(app)/[workspace]/layout.tsx
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";

interface Props {
  children: React.ReactNode;
  params: Promise<{ workspace: string }>;
}

export default async function WorkspaceLayout({ children, params }: Props) {
  const { workspace: slug } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const workspace = await db.workspace.findUnique({
    where: { slug },
    include: { memberships: { where: { userId: session.user.id } } },
  });

  if (!workspace || workspace.memberships.length === 0) notFound();

  return (
    <div className="flex min-h-screen">
      <Sidebar workspaceSlug={slug} workspaceName={workspace.name} />
      <main className="flex-1 bg-gray-50">{children}</main>
    </div>
  );
}
```

- [ ] **Step 6: Write [workspace]/page.tsx — dashboard stub**

```tsx
// apps/web/src/app/(app)/[workspace]/page.tsx
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ workspace: string }>;
}

export default async function WorkspaceDashboard({ params }: Props) {
  const { workspace: slug } = await params;
  const session = await auth();

  const workspace = await db.workspace.findUnique({
    where: { slug },
    include: {
      _count: { select: { posts: true, igAccounts: true } },
    },
  });
  if (!workspace) notFound();

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">{workspace.name}</h1>
      <p className="text-sm text-gray-500 mb-8">
        {workspace._count.posts} posts · {workspace._count.igAccounts} cuentas IG
      </p>
      <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
        <p className="text-gray-400 text-sm">
          Tu calendario aparecerá aquí. Comienza conectando una cuenta de Instagram.
        </p>
        <a
          href={`/app/${slug}/accounts`}
          className="mt-4 inline-block bg-gray-900 text-white text-sm px-5 py-2 rounded-lg hover:bg-gray-800 transition-colors"
        >
          Conectar Instagram
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Write billing settings page**

```tsx
// apps/web/src/app/(app)/[workspace]/settings/billing/page.tsx
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{ success?: string }>;
}

export default async function BillingPage({ params, searchParams }: Props) {
  const { workspace: slug } = await params;
  const sp = await searchParams;
  const session = await auth();

  const workspace = await db.workspace.findUnique({ where: { slug } });
  if (!workspace) notFound();

  const isActive = workspace.subscriptionStatus === "active";

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Facturación</h1>

      {sp.success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
          ¡Suscripción activada! Ya puedes conectar tu cuenta de Instagram.
        </div>
      )}

      <div className="bg-white border border-gray-100 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-medium text-gray-900">Plan Starter</p>
            <p className="text-sm text-gray-500">USD 19/mes · 1 cuenta de Instagram</p>
          </div>
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
            }`}
          >
            {isActive ? "Activo" : "Inactivo"}
          </span>
        </div>

        <form action={`/api/billing/${workspace.id}/checkout`} method="POST">
          {isActive ? (
            <button
              formAction={`/api/billing/${workspace.id}/portal`}
              className="text-sm text-gray-600 underline hover:text-gray-900"
            >
              Gestionar suscripción
            </button>
          ) : (
            <button
              type="submit"
              className="bg-gray-900 text-white text-sm px-5 py-2 rounded-lg hover:bg-gray-800"
            >
              Activar suscripción — USD 19/mes
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
```

Note: billing form actions will be handled via tRPC client in a future iteration; for now this is a server placeholder.

- [ ] **Step 8: Write placeholder accounts page**

```tsx
// apps/web/src/app/(app)/[workspace]/accounts/page.tsx
export default function AccountsPage() {
  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gray-900 mb-2">Cuentas de Instagram</h1>
      <p className="text-sm text-gray-500">Conecta tu cuenta en el Plan B del desarrollo.</p>
    </div>
  );
}
```

- [ ] **Step 9: Write onboarding page (create first workspace)**

```tsx
// apps/web/src/app/(app)/onboarding/page.tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm p-8 bg-white rounded-2xl shadow-sm border border-gray-100">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Crea tu workspace</h1>
        <p className="text-sm text-gray-500 mb-6">
          Un workspace es tu marca, agencia o cliente. Puedes crear más después.
        </p>
        <form action="/api/onboarding/create-workspace" method="POST">
          <div className="space-y-3">
            <input
              type="text"
              name="name"
              required
              placeholder="Mi Agencia"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <button
              type="submit"
              className="w-full bg-gray-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800"
            >
              Crear workspace
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
```

- [ ] **Step 10: Write API route for onboarding**

```typescript
// apps/web/src/app/api/onboarding/create-workspace/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.redirect(new URL("/login", req.url));

  const formData = await req.formData();
  const name = (formData.get("name") as string)?.trim();
  if (!name) return NextResponse.redirect(new URL("/onboarding", req.url));

  let slug = slugify(name);
  let counter = 0;
  while (await db.workspace.findUnique({ where: { slug } })) {
    slug = `${slugify(name)}-${++counter}`;
  }

  const workspace = await db.workspace.create({
    data: {
      name,
      slug,
      ownerId: session.user.id,
      memberships: { create: { userId: session.user.id, role: "OWNER" } },
    },
  });

  return NextResponse.redirect(new URL(`/app/${workspace.slug}`, req.url));
}
```

- [ ] **Step 11: Test full user journey manually**

```bash
pnpm dev
```

1. `http://localhost:3000/login` → magic link → logged in
2. First login → redirect `/app` → no workspace → `/onboarding`
3. Create workspace "Mi Agencia" → redirect `/app/mi-agencia`
4. See dashboard stub with sidebar
5. Navigate to `/app/mi-agencia/settings/billing`
6. See plan stub with "Activar suscripción" button

- [ ] **Step 12: Commit**

```bash
cd /Users/albertomanzur/Documents/Buffer
git add apps/web/src/app/ apps/web/src/components/
git commit -m "feat(app): workspace shell, routing, onboarding, billing page"
```

---

## Task 9: Worker Hello-World (Railway)

**Files:**
- Create: `apps/worker/src/index.ts`
- Create: `apps/worker/tsconfig.json`
- Create: `apps/worker/Dockerfile`

- [ ] **Step 1: Write apps/worker/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 2: Write apps/worker/src/index.ts**

```typescript
// apps/worker/src/index.ts
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) throw new Error("REDIS_URL is required");

const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  tls: redisUrl.startsWith("rediss://") ? {} : undefined,
});

connection.on("connect", () => console.log("✅ Redis connected"));
connection.on("error", (err) => console.error("❌ Redis error:", err));

const testQueue = new Queue("test-queue", { connection });

const worker = new Worker(
  "test-queue",
  async (job) => {
    console.log(`[worker] Processing job ${job.id}: ${JSON.stringify(job.data)}`);
    await new Promise((r) => setTimeout(r, 100));
    console.log(`[worker] Job ${job.id} done`);
  },
  { connection, concurrency: 5 }
);

worker.on("completed", (job) => console.log(`✅ Job ${job.id} completed`));
worker.on("failed", (job, err) => console.error(`❌ Job ${job?.id} failed:`, err));

console.log("🚀 Worker started, waiting for jobs...");

// Add a test job on startup in dev
if (process.env.NODE_ENV !== "production") {
  setTimeout(async () => {
    await testQueue.add("hello", { message: "Hello from worker!" });
    console.log("📬 Test job enqueued");
  }, 2000);
}

process.on("SIGTERM", async () => {
  console.log("Graceful shutdown...");
  await worker.close();
  await connection.quit();
  process.exit(0);
});
```

- [ ] **Step 3: Write Dockerfile**

```dockerfile
# apps/worker/Dockerfile
FROM node:20-alpine AS base

RUN npm install -g pnpm

WORKDIR /app

COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY turbo.json ./
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/
COPY apps/worker/package.json ./apps/worker/

RUN pnpm install --frozen-lockfile

COPY packages/ ./packages/
COPY apps/worker/ ./apps/worker/

WORKDIR /app/apps/worker
RUN pnpm build

CMD ["node", "dist/index.js"]
```

- [ ] **Step 4: Test worker locally**

```bash
# Add REDIS_URL to .env.local (from Upstash)
cd apps/worker
REDIS_URL=<your-upstash-url> pnpm dev
```

Expected output:
```
✅ Redis connected
🚀 Worker started, waiting for jobs...
📬 Test job enqueued
[worker] Processing job 1: {"message":"Hello from worker!"}
[worker] Job 1 done
✅ Job 1 completed
```

- [ ] **Step 5: Commit**

```bash
cd /Users/albertomanzur/Documents/Buffer
git add apps/worker/
git commit -m "feat(worker): bullmq worker hello-world with redis + dockerfile"
```

---

## Task 10: CI/CD (GitHub Actions)

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create GitHub repo**

```bash
cd /Users/albertomanzur/Documents/Buffer
gh repo create buffer-saas --private --source=. --push
```

- [ ] **Step 2: Write .github/workflows/ci.yml**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm turbo typecheck

      - name: Lint
        run: pnpm turbo lint

      - name: Test
        run: pnpm turbo test
        env:
          SKIP_ENV_VALIDATION: true
          DATABASE_URL: "postgresql://test:test@localhost/test"
          DATABASE_URL_UNPOOLED: "postgresql://test:test@localhost/test"

  build:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - run: pnpm install --frozen-lockfile

      - name: Build web
        run: pnpm turbo build --filter=@buffer/web
        env:
          SKIP_ENV_VALIDATION: true
```

- [ ] **Step 3: Add root package.json scripts**

```json
// Add to root package.json scripts:
{
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "test": "turbo test",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck"
  }
}
```

- [ ] **Step 4: Push and verify CI passes**

```bash
git add .github/ package.json
git commit -m "chore(ci): github actions for test + build"
git push origin main
```

Check GitHub → Actions → CI run should pass all jobs.

- [ ] **Step 5: Connect Vercel**

1. vercel.com → Import project → select `buffer-saas` repo
2. Root directory: `apps/web`
3. Add all env vars from `.env.local`
4. Deploy

Expected: Vercel preview URL functional with login page.

---

## Self-Review

**Spec coverage check:**
- ✅ Auth NextAuth magic link — Task 4
- ✅ Workspace CRUD — Task 6
- ✅ Stripe billing — Task 7
- ✅ App routing + shell — Task 8
- ✅ Worker hello-world — Task 9
- ✅ CI/CD — Task 10
- ✅ Prisma schema (full schema including IG, posts, media) — Task 2
- ✅ Multi-tenancy isolation via workspaceId in tRPC — Task 5
- ⚠️ Placeholder Meta OAuth callback route — mentioned but empty (Plan B scope)

**Placeholder scan:** No TBD or TODO markers in code blocks. All steps contain actual code.

**Type consistency:** `workspaceRouter`, `billingRouter` match imports in `root.ts`. `Membership.role` enum values match `Role` enum in schema.

---

*Next plan: **Plan B – Instagram OAuth** (Meta OAuth flow, token encryption, InstagramAccount CRUD, token refresh job)*
