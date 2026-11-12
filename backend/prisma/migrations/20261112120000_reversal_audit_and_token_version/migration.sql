-- Audit trail for REVERSAL entries (USER | COMPENSATION) and who ran them.
ALTER TABLE "transactions" ADD COLUMN "reversalSource" TEXT;
ALTER TABLE "transactions" ADD COLUMN "reversalActor" TEXT;

-- Session version embedded in the JWT: logout bumps it, invalidating every token issued before.
-- Additive with a default, so existing users keep working (no table rebuild).
ALTER TABLE "users" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
