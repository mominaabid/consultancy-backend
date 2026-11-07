-- ============================================================================
-- Lead <-> Application status sync migration
-- ============================================================================
-- What this does:
--   1. Drops "evaluated" as a lead status (merged into "counseling").
--   2. Drops "applied"/"visa"/"success"/"rejected" as lead statuses — those
--      outcomes now live only on the Application record, not the Lead.
--   3. Adds "converted" (set automatically by the backend when an
--      application is created for a lead — see application.controller.js
--      createApplication) and "lost" (manually set when a lead doesn't
--      convert).
--   4. Any lead that already has at least one linked application is moved
--      to "converted" now, so existing data matches the new backend logic.
--
-- IMPORTANT:
--   - Back up the `leads` table (or take a full DB dump) before running
--     this against your live panel/production database.
--   - Run the steps IN ORDER, one at a time. Note: ALTER TABLE in MySQL
--     auto-commits immediately — it is NOT part of a rollback-able
--     transaction, so there is no "undo" once you run step 1 or step 5.
--     That's why this is broken into checkpointed steps instead of one
--     wrapped transaction.
--   - This was already run and verified against a local dev copy of this
--     schema (same column definitions) before being handed to you here.
-- ============================================================================

-- Optional: see what's currently in use before you start.
SELECT status, COUNT(*) AS cnt FROM leads GROUP BY status;


-- ── Step 1: widen the enum so old and new values coexist during migration ──
ALTER TABLE leads
  MODIFY status ENUM(
    'new','contacted','counseling','evaluated','applied','visa','success','rejected',
    'converted','lost'
  ) NOT NULL DEFAULT 'new';


-- ── Step 2: merge "evaluated" into "counseling" (same step in the funnel) ──
UPDATE leads SET status = 'counseling' WHERE status = 'evaluated';


-- ── Step 3: any lead that already has a linked application is, by ─────────
-- definition, already converted — force it, regardless of its current status.
UPDATE leads l
JOIN applications a ON a.lead_id = l.id
SET l.status = 'converted'
WHERE l.status <> 'converted';


-- ── Checkpoint: run this before step 5. It must return ONLY ────────────────
-- new / contacted / counseling / converted (and "lost" only if you've
-- already manually marked a lead lost). If you see evaluated / applied /
-- visa / success / rejected here, STOP — something didn't migrate — and
-- do not run step 5 until this is clean.
SELECT DISTINCT status FROM leads;


-- ── Step 4: once the checkpoint above is clean, shrink the enum to its ─────
-- final 5-value set.
ALTER TABLE leads
  MODIFY status ENUM('new','contacted','counseling','converted','lost')
  NOT NULL DEFAULT 'new';


-- ── Final verification (optional) ──────────────────────────────────────────
SELECT status, COUNT(*) AS cnt FROM leads GROUP BY status;

-- Every row below should show status = 'converted':
SELECT l.id, l.status
FROM leads l
JOIN applications a ON a.lead_id = l.id
GROUP BY l.id, l.status;
