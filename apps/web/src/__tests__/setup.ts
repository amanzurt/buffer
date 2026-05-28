import path from "path";

// Load env vars needed by Prisma before any test module initialises the client
// __dirname = apps/web/src/__tests__, db is at apps/web/prisma/dev.db
process.env.DATABASE_URL ??= `file:${path.resolve(__dirname, "../../prisma/dev.db")}`;
process.env.AUTH_SECRET ??= "test-secret-32-chars-placeholder!!";
process.env.META_APP_SECRET ??= "test_meta_secret";
process.env.INSTAGRAM_TOKEN_ENC_KEY ??= "a".repeat(64);
process.env.SKIP_ENV_VALIDATION ??= "true";
