# Plan C – Media Upload + Post Editor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Subir media a Cloudflare R2 vía presigned PUT directo desde el browser, y construir el editor de posts (caption TipTap + selector de fecha/hora + selector de cuenta IG).

**Architecture:** Browser → presigned PUT → R2. Next.js solo genera la URL firmada y registra el MediaAsset en SQLite. No pasa el archivo por el servidor. TipTap para caption con highlight de hashtags y contador de caracteres. Validación Zod tanto en cliente como en servidor.

**Tech Stack:** @aws-sdk/s3-request-presigner, @aws-sdk/client-s3, react-dropzone, @tiptap/react, @tiptap/starter-kit, zod, tRPC

---

## File Map

```
apps/web/src/
  lib/
    r2.ts                              ← S3Client apuntando a R2 + helpers
  server/api/routers/
    media.ts                           ← tRPC: getUploadUrl, finalizeUpload, list, delete
  app/
    api/
      media/
        upload-url/route.ts           ← Route Handler para presigned PUT (server-side)
    (app)/[workspace]/
      calendar/
        page.tsx                      ← Calendario placeholder + botón "Nuevo post"
        _components/
          post-editor.tsx             ← Drawer/modal completo (client)
          media-dropzone.tsx          ← Dropzone con preview
          caption-editor.tsx          ← TipTap editor
          account-selector.tsx        ← Selector de cuenta IG conectada
  lib/
    validations/
      media.ts                        ← Zod schemas: imagen, video, carousel
```

---

## Task 1: R2 client + lib

**Files:**
- Create: `apps/web/src/lib/r2.ts`

- [ ] Instalar deps (ya hecho: @aws-sdk/client-s3, @aws-sdk/s3-request-presigner)
- [ ] Crear S3Client configurado para R2 endpoint
- [ ] Función `getPresignedPutUrl(key, contentType, maxBytes)` → URL firmada (TTL 5 min)
- [ ] Función `getPublicUrl(key)` → `${R2_PUBLIC_URL}/${key}`
- [ ] Función `deleteObject(key)` → borrar del bucket
- [ ] Commit

## Task 2: Validaciones de media

**Files:**
- Create: `apps/web/src/lib/validations/media.ts`
- Create: `apps/web/src/__tests__/lib/media-validation.test.ts`

- [ ] Test falla: schemas no existen
- [ ] Schema `feedImageSchema`: JPEG/PNG/WEBP, ≤ 8 MB, ratio entre 4:5 y 1.91:1
- [ ] Schema `reelSchema`: MP4/MOV, ≤ 100 MB, ≤ 90s, ratio 9:16 (tolerancia ±0.05)
- [ ] Schema `carouselItemSchema`: imagen ≤ 8 MB, mismo ratio que el primero
- [ ] Helper `getMimeCategory(mimeType)` → "image" | "video" | "unknown"
- [ ] Helper `checkImageRatio(width, height)` → valid | error string
- [ ] Tests pasan (pure unit, sin archivos reales)
- [ ] Commit

## Task 3: tRPC media router

**Files:**
- Create: `apps/web/src/server/api/routers/media.ts`
- Modify: `apps/web/src/server/api/root.ts`
- Create: `apps/web/src/__tests__/routers/media.test.ts`

- [ ] Test falla: router no existe
- [ ] `getUploadUrl`: genera presigned PUT URL + key único (uuid), devuelve `{ uploadUrl, key, publicUrl }`
- [ ] `finalizeUpload`: crea `MediaAsset` en DB con metadata (filename, mimeType, sizeBytes, r2Key, publicUrl)
- [ ] `list`: lista MediaAssets del workspace, ordenado por createdAt desc, con paginación (take: 20, cursor)
- [ ] `delete`: elimina MediaAsset de DB + R2, solo si pertenece al workspace
- [ ] Tests pasan
- [ ] Commit

## Task 4: MediaDropzone component

**Files:**
- Create: `apps/web/src/components/media-dropzone.tsx`

- [ ] `"use client"` — react-dropzone con `accept` filtrado por tipo
- [ ] Mientras arrastra: zona resaltada con borde azul
- [ ] Al soltar: validar tamaño/tipo antes del upload (Zod schema del Task 2)
- [ ] Si válido: llamar `trpc.media.getUploadUrl.mutate` → PUT a la URL firmada con `fetch`
- [ ] Mostrar progress bar (XMLHttpRequest para progreso real)
- [ ] Al completar: llamar `trpc.media.finalizeUpload.mutate` → devolver MediaAsset al padre via `onUpload(asset)`
- [ ] Si error: mostrar mensaje inline (no toast)
- [ ] Props: `workspaceId`, `accept: "image" | "video" | "any"`, `onUpload: (asset) => void`, `disabled?`
- [ ] Commit

## Task 5: TipTap caption editor

**Files:**
- Create: `apps/web/src/components/caption-editor.tsx`

- [ ] `"use client"` — TipTap con StarterKit (sin heading, sin bulletList, sin codeBlock)
- [ ] Extension CharacterCount con limit=2200
- [ ] Placeholder "Escribe un caption..."
- [ ] Contador `caracteres / 2200` en el footer del editor, rojo si > 2000
- [ ] Regex para resaltar #hashtags y @menciones con color indigo (mark custom o CSS `data-type`)
- [ ] Props: `value: string`, `onChange: (val: string) => void`, `disabled?`
- [ ] Al cambiar contenido: extraer hashtags únicos (regex `/#\w+/g`), pasarlos via `onHashtagsChange?(tags: string[])`
- [ ] Commit

## Task 6: Post editor drawer

**Files:**
- Create: `apps/web/src/app/(app)/[workspace]/calendar/_components/post-editor.tsx`
- Create: `apps/web/src/app/(app)/[workspace]/calendar/_components/account-selector.tsx`

- [ ] `"use client"` — drawer/sheet que se abre sobre el calendario
- [ ] AccountSelector: `<select>` con cuentas IG activas del workspace (prop `accounts`)
- [ ] MediaDropzone integrado (Task 4)
- [ ] CaptionEditor integrado (Task 5)
- [ ] DateTimePicker: `<input type="datetime-local">` con min = ahora + 10 min
- [ ] Primer comentario: `<textarea>` opcional, máximo 2200 chars
- [ ] Validación al submit: cuenta seleccionada + media + caption no vacío + fecha futura
- [ ] Al submit: `trpc.post.create.mutate(...)` — router `post` se implementa en Plan D
- [ ] Mientras Plan D no existe: mostrar `console.log` del payload y `alert("Plan D pendiente")`
- [ ] Props: `open`, `onClose`, `workspaceId`, `accounts`, `defaultDate?`
- [ ] Commit

## Task 7: Calendar page

**Files:**
- Modify: `apps/web/src/app/(app)/[workspace]/calendar/page.tsx`

- [ ] RSC que carga cuentas IG activas del workspace via Prisma directo
- [ ] Si no hay cuentas activas: banner "Conecta una cuenta de Instagram primero" con link a /accounts
- [ ] Botón "Nuevo post" en header → abre PostEditor (estado local)
- [ ] Placeholder visual del calendario: grid mensual simple con días del mes actual
- [ ] En cada celda: mostrar el número del día, hover con fondo gris
- [ ] Al hacer click en una celda: abrir PostEditor con `defaultDate` pre-llenado
- [ ] Nota: FullCalendar real se integra en Plan D; este grid es suficiente para probar el editor
- [ ] Commit
