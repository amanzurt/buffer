# Plan B – Instagram OAuth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Conectar cuentas de Instagram Business/Creator vía Meta OAuth, cifrar y persistir tokens en SQLite, y mantenerlos frescos con un job de BullMQ.

**Architecture:** Facebook Login → exchange code por long-lived token (60 días) → listar Pages → obtener IG Business accounts → cifrar token AES-256-GCM base64 → guardar en SQLite. Worker BullMQ refresca tokens 7 días antes de expirar.

**Tech Stack:** Node.js crypto (AES-256-GCM), Meta Graph API v22, BullMQ delayed jobs, tRPC, Prisma/SQLite

---

## File Map

```
apps/web/src/
  lib/
    crypto.ts                        ← AES-256-GCM encrypt/decrypt
    meta/
      oauth.ts                       ← state CSRF, exchange code, refresh token
      accounts.ts                    ← listar Pages + IG accounts via Graph API
      errors.ts                      ← mapear errores de Meta
      types.ts                       ← tipos de Meta Graph API
  server/api/routers/
    instagram.ts                     ← tRPC: listAccounts, getOAuthUrl, disconnect, refreshToken
  app/
    api/
      auth/meta/callback/route.ts    ← OAuth callback (reemplaza placeholder)
      webhooks/meta/
        deauthorize/route.ts
        data-deletion/route.ts
    (app)/[workspace]/
      accounts/page.tsx              ← UI: listar cuentas + botón conectar

apps/worker/src/
  jobs/
    token-refresh.ts                 ← job que renueva long-lived tokens
  index.ts                           ← registrar worker token-refresh
```

---

## Task 1: Crypto — AES-256-GCM

**Files:**
- Create: `apps/web/src/lib/crypto.ts`
- Create: `apps/web/src/__tests__/lib/crypto.test.ts`

- [ ] Test falla: `encrypt` / `decrypt` no existen
- [ ] Implementar `encrypt(plaintext, key)` → `iv:authTag:ciphertext` (base64)
- [ ] Implementar `decrypt(encoded, key)` → plaintext
- [ ] Test pasa: roundtrip + datos distintos generan ciphertext diferente
- [ ] Commit

## Task 2: Meta OAuth helpers

**Files:**
- Create: `apps/web/src/lib/meta/types.ts`
- Create: `apps/web/src/lib/meta/errors.ts`
- Create: `apps/web/src/lib/meta/oauth.ts`
- Create: `apps/web/src/lib/meta/accounts.ts`

- [ ] Escribir tipos Graph API
- [ ] Escribir `buildOAuthUrl(state)` — genera URL de Facebook Login
- [ ] Escribir `exchangeCodeForToken(code)` → short-lived token
- [ ] Escribir `exchangeForLongLived(shortToken)` → long-lived token (60d)
- [ ] Escribir `refreshLongLivedToken(token)` → token renovado
- [ ] Escribir `getPagesWithIgAccounts(token)` → lista cuentas IG del usuario
- [ ] Escribir `getIgAccountDetails(igUserId, token)` → username, accountType, etc
- [ ] Commit

## Task 3: tRPC instagram router

**Files:**
- Create: `apps/web/src/server/api/routers/instagram.ts`
- Modify: `apps/web/src/server/api/root.ts`
- Create: `apps/web/src/__tests__/routers/instagram.test.ts`

- [ ] Test falla: router no existe
- [ ] `listAccounts` — lista InstagramAccount del workspace
- [ ] `getOAuthUrl` — genera state CSRF firmado + URL Meta
- [ ] `disconnect` — marca status=revoked, cancela jobs
- [ ] Tests pasan
- [ ] Commit

## Task 4: OAuth callback

**Files:**
- Modify: `apps/web/src/app/api/auth/meta/callback/route.ts`

- [ ] Verificar state CSRF (HMAC-SHA256)
- [ ] Exchange code → short → long-lived token
- [ ] Listar Pages → IG accounts disponibles
- [ ] Guardar en sesión y redirigir a `/app/[workspace]/accounts/select`
- [ ] Crear página de selección de cuenta IG
- [ ] Al seleccionar: cifrar token, crear `InstagramAccount`, encolar job refresh
- [ ] Commit

## Task 5: Token refresh job

**Files:**
- Create: `apps/worker/src/jobs/token-refresh.ts`
- Modify: `apps/worker/src/index.ts`

- [ ] Job lee `InstagramAccount` por id
- [ ] Llama `refreshLongLivedToken`
- [ ] Actualiza `accessTokenEnc` y `tokenExpiresAt`
- [ ] Re-encola próximo refresh a `expiresAt - 7 días`
- [ ] Si falla: marca `status=error`, registra error
- [ ] Commit

## Task 6: Meta webhooks

**Files:**
- Create: `apps/web/src/app/api/webhooks/meta/deauthorize/route.ts`
- Create: `apps/web/src/app/api/webhooks/meta/data-deletion/route.ts`

- [ ] `deauthorize`: verifica firma HMAC, marca cuenta `status=revoked`
- [ ] `data-deletion`: verifica firma, registra solicitud, responde con confirmation_code
- [ ] Commit

## Task 7: Accounts UI

**Files:**
- Modify: `apps/web/src/app/(app)/[workspace]/accounts/page.tsx`

- [ ] Listar cuentas conectadas con status badge
- [ ] Botón "Conectar Instagram" → llama `instagram.getOAuthUrl` → redirect
- [ ] Badge de estado: activo / expirando / revocado
- [ ] Commit
