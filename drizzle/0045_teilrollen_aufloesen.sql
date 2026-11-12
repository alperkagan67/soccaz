-- Vertrag 009 M1 (Entscheid t9, docs/design/009-m1-plan.md 3.1): Die Teilrollen moderator, finance und booking entfallen.
-- Konten mit diesen Rollen werden auf player gesetzt (geringste Rechte); je Konto ein Eintrag im Protokoll (audit_log, actor_id leer = Systemeintrag,
-- Grund in "after"), alles in derselben Transaktion. Die Enum-Werte bleiben bestehen (Werte lassen sich nicht entfernen); es bekommt nur niemand mehr diese Rolle.
-- Rollback: nicht automatisch. Die Protokolleinträge nennen je Konto die frühere Rolle ("before.role"); Wiederherstellen per Hand aus dem Protokoll.
WITH old AS (
  SELECT "id", "role"::text AS old_role FROM "users" WHERE "role" IN ('moderator', 'finance', 'booking') FOR UPDATE
), upd AS (
  UPDATE "users" u SET "role" = 'player' FROM old WHERE u."id" = old."id" RETURNING u."id", old.old_role
)
INSERT INTO "audit_log" ("actor_id", "action", "entity", "entity_id", "before", "after")
SELECT NULL, 'user.role', 'user', upd."id"::text,
  jsonb_build_object('role', upd.old_role),
  jsonb_build_object('role', 'player', 'reason', 'Rolle aufgelöst: war ' || upd.old_role || ' (Vertrag 009 M1)')
FROM upd;
