# Plan D – Post Scheduling + FullCalendar

**Goal:** `post` tRPC router completo, BullMQ enqueue desde Next.js, worker `publish-post` stub (Graph API real en Plan E), y FullCalendar mensual con drag-and-drop que muestra posts reales.

**Architecture:** Next.js → tRPC `post.create` → inserta ScheduledPost (SCHEDULED) → encola BullMQ delayed job. Worker consume el job, llama Graph API (Plan E stub por ahora), actualiza status a PUBLISHED/FAILED. FullCalendar lee posts via tRPC `post.list` y renderiza eventos color-coded por status.

---

## Task 1: Queue client en web

- Create: `apps/web/src/lib/queue.ts`

- [ ] BullMQ `Queue` singleton apuntando a `REDIS_URL`
- [ ] Función `enqueuePublishPost(postId, scheduledAt)` → add con `delay`
- [ ] Función `cancelPublishPost(bullJobId)` → obliterate job si existe
- [ ] Commit

## Task 2: tRPC post router

- Create: `apps/web/src/server/api/routers/post.ts`
- Modify: `apps/web/src/server/api/root.ts`
- Create: `apps/web/src/__tests__/routers/post.test.ts`

- [ ] Test falla
- [ ] `list`: posts del workspace en rango `[from, to]` con status + media
- [ ] `get`: post por id (verifica workspaceId)
- [ ] `create`: valida input (Zod), inserta ScheduledPost, encola BullMQ, devuelve post
- [ ] `update`: cancela job viejo, re-encola, actualiza DB
- [ ] `delete`: cancela job, borra post (solo DRAFT/SCHEDULED)
- [ ] `cancelScheduled`: cambia status a CANCELED, cancela job
- [ ] Tests pasan (mock queue)
- [ ] Commit

## Task 3: Worker publish-post stub

- Create: `apps/worker/src/jobs/publish-post.ts`
- Modify: `apps/worker/src/index.ts`

- [ ] Job lee ScheduledPost + media desde DB
- [ ] Valida que cuenta IG esté active y token no expirado
- [ ] Status → PUBLISHING, luego stub: log "publicaría a Instagram" + sleep 500ms
- [ ] Status → PUBLISHED, publishedAt = now(), auditLog
- [ ] On error: status → FAILED, errorMessage, re-throw para retry BullMQ
- [ ] Registrar worker en index.ts con concurrency 10
- [ ] Commit

## Task 4: FullCalendar + drag-and-drop

- Modify: `apps/web/src/app/(app)/[workspace]/calendar/_components/calendar-client.tsx`

- [ ] Reemplazar grid manual por `<FullCalendar>` (dayGridMonth + interaction)
- [ ] `events` → `trpc.post.list.useQuery({ workspaceId, from, to })`
- [ ] Color por status: SCHEDULED=indigo, PUBLISHED=green, FAILED=red, CANCELED=gray
- [ ] `dateClick` → abre PostEditor con defaultDate
- [ ] `eventClick` → abre PostEditor en modo edición (pre-llenado)
- [ ] `eventDrop` → llama `post.update` con nueva scheduledAt
- [ ] Commit

## Task 5: PostEditor conectado a post.create/update

- Modify: `apps/web/src/app/(app)/[workspace]/calendar/_components/post-editor.tsx`

- [ ] Reemplazar `alert("Plan D pendiente")` por `trpc.post.create.useMutation()`
- [ ] En modo edición (prop `postId`): cargar datos con `post.get`, llamar `post.update`
- [ ] Invalidar `post.list` query tras create/update exitoso
- [ ] Mostrar error inline si falla la mutation
- [ ] Commit
