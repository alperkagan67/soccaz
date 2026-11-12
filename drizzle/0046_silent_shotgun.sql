ALTER TYPE "public"."ledger_account" ADD VALUE 'venue_payable';--> statement-breakpoint
ALTER TYPE "public"."ledger_account" ADD VALUE 'commission';--> statement-breakpoint
ALTER TYPE "public"."ledger_kind" ADD VALUE 'commission';--> statement-breakpoint
ALTER TYPE "public"."ledger_kind" ADD VALUE 'commission_bonus';--> statement-breakpoint
CREATE TABLE "invoice_deliveries" (
	"invoice_id" uuid PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_try_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_deliveries_status_check" CHECK ("invoice_deliveries"."status" in ('pending', 'sent', 'skipped', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"ledger_entry_id" uuid NOT NULL,
	"match_id" uuid,
	"game_starts_at" timestamp with time zone,
	"game_number" integer,
	"amount_cents" integer NOT NULL,
	CONSTRAINT "invoice_lines_ledger_entry_id_unique" UNIQUE("ledger_entry_id"),
	CONSTRAINT "invoice_lines_amount_positive" CHECK ("invoice_lines"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "invoice_number_counters" (
	"year" integer PRIMARY KEY NOT NULL,
	"last" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"venue_id" uuid NOT NULL,
	"period" text NOT NULL,
	"vat_mode" text NOT NULL,
	"vat_percent" integer NOT NULL,
	"net_cents" integer NOT NULL,
	"vat_cents" integer NOT NULL,
	"gross_cents" integer NOT NULL,
	"note" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_number_unique" UNIQUE("number"),
	CONSTRAINT "invoices_amounts_check" CHECK ("invoices"."net_cents" > 0 and "invoices"."vat_cents" >= 0 and "invoices"."gross_cents" = "invoices"."net_cents" + "invoices"."vat_cents")
);
--> statement-breakpoint
CREATE TABLE "match_commissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"rate_percent" numeric(5, 2) NOT NULL,
	"base_cents" integer NOT NULL,
	"commission_cents" integer NOT NULL,
	"ledger_entry_id" uuid,
	"booked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_commissions_match_id_unique" UNIQUE("match_id"),
	CONSTRAINT "match_commissions_amounts_check" CHECK ("match_commissions"."base_cents" >= 0 and "match_commissions"."commission_cents" >= 0 and "match_commissions"."commission_cents" <= "match_commissions"."base_cents")
);
--> statement-breakpoint
-- Vertrag 009 M2 (Entscheid t9 P4): bestehende Spiele behalten das alte Buchungsmodell ('legacy'), Spiele ab Einfuehrung bekommen 'commission'
ALTER TABLE "matches" ADD COLUMN "ledger_model" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ALTER COLUMN "ledger_model" SET DEFAULT 'commission';--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "commission_percent" numeric(5, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "commission_bonus_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "invoice_email" text;--> statement-breakpoint
ALTER TABLE "invoice_deliveries" ADD CONSTRAINT "invoice_deliveries_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_commissions" ADD CONSTRAINT "match_commissions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_commissions" ADD CONSTRAINT "match_commissions_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_deliveries_due_idx" ON "invoice_deliveries" USING btree ("status","next_try_at");--> statement-breakpoint
CREATE INDEX "invoice_lines_invoice_idx" ON "invoice_lines" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_venue_period_idx" ON "invoices" USING btree ("venue_id","period");--> statement-breakpoint
CREATE INDEX "match_commissions_venue_idx" ON "match_commissions" USING btree ("venue_id","booked_at");--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_commission_percent_range" CHECK ("venues"."commission_percent" >= 0 and "venues"."commission_percent" <= 100);
--> statement-breakpoint
-- match_commissions ist nur anhaengend (wie das Hauptbuch); Ausnahme fuer Wartung und Tests: set local socaz.ledger_maintenance = 'on'
CREATE OR REPLACE FUNCTION forbid_append_only_mutation() RETURNS trigger AS $$
BEGIN
  IF current_setting('socaz.ledger_maintenance', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% ist nur anhaengend (Operation %).', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS match_commissions_append_only ON match_commissions;
--> statement-breakpoint
CREATE TRIGGER match_commissions_append_only
  BEFORE UPDATE OR DELETE ON match_commissions
  FOR EACH ROW EXECUTE FUNCTION forbid_append_only_mutation();
--> statement-breakpoint
-- Rechnungen und Rechnungszeilen sind nur anhaengend: Korrektur = Gutschrift als eigene Rechnung (Vertrag 009 M2)
DROP TRIGGER IF EXISTS invoices_append_only ON invoices;
--> statement-breakpoint
CREATE TRIGGER invoices_append_only
  BEFORE UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION forbid_append_only_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS invoice_lines_append_only ON invoice_lines;
--> statement-breakpoint
CREATE TRIGGER invoice_lines_append_only
  BEFORE UPDATE OR DELETE ON invoice_lines
  FOR EACH ROW EXECUTE FUNCTION forbid_append_only_mutation();
--> statement-breakpoint
-- matches.ledger_model ist unveraenderlich (ein Spiel wechselt das Buchungsmodell nie, sonst stimmen Abbuchung und Erstattung nicht); Ausnahme nur Wartung: set local socaz.ledger_maintenance = 'on'
CREATE OR REPLACE FUNCTION forbid_ledger_model_change() RETURNS trigger AS $$
BEGIN
  IF NEW.ledger_model IS DISTINCT FROM OLD.ledger_model AND coalesce(current_setting('socaz.ledger_maintenance', true), '') <> 'on' THEN
    RAISE EXCEPTION 'matches.ledger_model ist unveraenderlich.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS matches_ledger_model_immutable ON matches;
--> statement-breakpoint
CREATE TRIGGER matches_ledger_model_immutable
  BEFORE UPDATE OF ledger_model ON matches
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_model_change();
