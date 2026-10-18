-- Das Buchungsjournal ist unveränderlich: Korrekturen sind nur Gegenbuchungen.
-- Ausnahme für Wartung und Tests: set local socaz.ledger_maintenance = 'on' innerhalb einer Transaktion.
CREATE OR REPLACE FUNCTION forbid_ledger_mutation() RETURNS trigger AS $$
BEGIN
  IF current_setting('socaz.ledger_maintenance', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'ledger_entries ist unveränderlich (Operation %). Bitte eine Gegenbuchung erzeugen.', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS ledger_entries_immutable ON ledger_entries;
--> statement-breakpoint
CREATE TRIGGER ledger_entries_immutable
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();
--> statement-breakpoint
-- Ein Konto darf nicht beide Seiten einer Buchung sein, solange es dasselbe Nutzerkonto ist.
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_distinct_sides CHECK (
  NOT (debit_account = credit_account AND debit_user_id IS NOT DISTINCT FROM credit_user_id)
);
--> statement-breakpoint
-- Nutzerkonten (Guthaben) brauchen immer einen Nutzer, Systemkonten nie.
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_wallet_has_user CHECK (
  (debit_account = 'wallet') = (debit_user_id IS NOT NULL) AND (credit_account = 'wallet') = (credit_user_id IS NOT NULL)
);
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS receipt_number_seq START 1;
--> statement-breakpoint
-- Standardpreise (ohne Halle): 60 Minuten 80 EUR, 90 Minuten 110 EUR. Kosten zunächst gleich dem Preis (keine Marge), im Admin änderbar.
INSERT INTO price_rules (venue_id, duration_min, price_cents, cost_cents, valid_from)
VALUES (NULL, 60, 8000, 8000, '2020-01-01'), (NULL, 90, 11000, 11000, '2020-01-01');
--> statement-breakpoint
INSERT INTO settings (key, value) VALUES
  ('payments_enabled', 'false'::jsonb),
  ('min_paid_players', '8'::jsonb)
ON CONFLICT (key) DO NOTHING;
