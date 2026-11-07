-- ============================================================================
-- EDUCATIA CRM — PRODUCTION DATABASE SYNC MIGRATION
-- ============================================================================
-- Purpose: bring the production database (educ_poRTaLdb1) up to date with
-- the current application schema (verified against the dev database,
-- educatia_2), which has moved ahead with a Processing Officer role, a
-- reworked application pipeline, Staff Hub (chat + todos), lead "lost"
-- reasons, and per-application activity logs.
--
-- NO LEADS ARE DELETED BY THIS SCRIPT. Every one of the 44 leads currently
-- in production is preserved. The only change to existing lead rows is that
-- some get their `status` value remapped (old status names -> new status
-- names — see Part 2, Steps 2.2/2.4/2.5) because the lead pipeline's status
-- list itself changed. No row is removed, and no lead's name/email/phone/
-- other data is touched.
--
-- VALIDATED before being handed off: this exact script was rehearsed
-- end-to-end against a disposable database seeded with production's current
-- schema AND its current status distribution (44 leads matching the counts
-- below), and completed with zero errors, ending in the expected clean
-- state. It is safe to run as written, provided the current production data
-- still matches the snapshot below (re-run the "Optional" count queries in
-- Part 2 first to confirm before proceeding if time has passed).
--
-- RE-VERIFIED LIVE, 2026-09-09: connected directly to production (read-only
-- checks) and re-ran the full table/column diff against the dev database.
-- Live still has exactly 44 leads with the exact status counts below —
-- nothing has changed since this was written — and no schema gap exists
-- beyond what Parts 1-8 already cover. This file did not need any new
-- ALTER/CREATE statements added; it is current as of this date.
--
-- PRODUCTION DATA SNAPSHOT AT TIME OF WRITING (informs the mapping decisions
-- in Part 2 — re-check this hasn't changed before running):
--   leads (44 total):    new=14, contacted=12, counseling=5, evaluated=1,
--                         applied=11, rejected=1
--   applications: 0 rows (empty — the status-enum change here is trivial,
--                         no data to remap)
--   student_accounts: 0 rows
--   users (23 total):    admin=1, counsellor=3, student=19, no
--                         processing_officer users yet
--
-- CHARSET NOTE: Part 1's new tables specify `DEFAULT CHARSET=utf8mb4
-- COLLATE=utf8mb4_unicode_ci` once at the end of each CREATE TABLE, instead
-- of repeating it on every single column like the first draft of this file
-- did. That single trailing clause is all MySQL needs — it applies to every
-- text column automatically (confirmed via SHOW CREATE TABLE after running
-- it). This isn't just cosmetic: production's *database* itself defaults to
-- utf8mb3 (confirmed directly against it), even though every existing table
-- in it — `leads` included — is utf8mb4. Omitting the charset entirely would
-- silently create these 4 new tables as utf8mb3, mismatching the rest of
-- the schema, so it has to be stated at the table level; it just doesn't
-- need to be stated on every column too.
--
-- IMPORTANT — READ BEFORE RUNNING ANYTHING:
--   1. TAKE A FULL DATABASE BACKUP (or at minimum dump `leads` and `users`)
--      before running ANY of this against the production database.
--      `ALTER TABLE` in MySQL auto-commits immediately — it is NOT inside a
--      rollback-able transaction, so there is no "undo" once a step runs.
--   2. Run the steps IN ORDER, checking each "checkpoint" query's output
--      before moving to the next step. Do not run this as one blind paste
--      without reading it.
--   3. Two mapping decisions in Part 2 (marked ⚠️ BUSINESS DECISION below)
--      reclassify real production leads' status values. Read the reasoning
--      there and adjust the UPDATE statements if you disagree, before
--      running Step 2.
--   4. If this repo also has an older `lead_application_status_sync_migration.sql`
--      file lying around, ignore/delete it — it's an earlier, incomplete
--      draft of Part 2 below (it didn't account for the `applied`/`rejected`
--      lead statuses that production actually has data in). This file fully
--      supersedes it.
-- ============================================================================


-- ============================================================================
-- PART 1 — NEW TABLES (safe: CREATE TABLE IF NOT EXISTS, no data impact)
-- ============================================================================

CREATE TABLE IF NOT EXISTS `processing_officers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) DEFAULT NULL,
  `father_name` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `cnic` varchar(20) DEFAULT NULL,
  `address` text,
  `role` varchar(100) DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT 'active',
  `profile_image` varchar(255) DEFAULT NULL,
  `is_deleted` tinyint(1) DEFAULT '0',
  `user_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `role_module_permissions` (
  `role` varchar(32) NOT NULL,
  `module_key` varchar(64) NOT NULL,
  `is_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`role`,`module_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `staff_messages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sender_id` int NOT NULL,
  `recipient_id` int DEFAULT NULL,
  `channel` varchar(64) DEFAULT NULL,
  `message` text NOT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `staff_todos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `description` text,
  `status` enum('open','in_progress','done') NOT NULL DEFAULT 'open',
  `assigned_to` int DEFAULT NULL,
  `created_by` int NOT NULL,
  `due_date` date DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- PART 2 — `leads` TABLE: new columns + status enum migration
-- ============================================================================
-- This is the part that touches real production rows (44 leads). Follow the
-- widen -> migrate -> checkpoint -> shrink sequence exactly.

-- ── Step 2.0: new (additive, non-breaking) columns first ──
ALTER TABLE leads
  ADD COLUMN `lost_reason_id` int DEFAULT NULL AFTER `status`,
  ADD COLUMN `lost_note` text DEFAULT NULL AFTER `lost_reason_id`,
  ADD COLUMN `is_ready_for_application` tinyint(1) NOT NULL DEFAULT 0 AFTER `lost_note`,
  ADD COLUMN `assigned_processing_officer_id` int DEFAULT NULL AFTER `is_ready_for_application`;

-- Optional: see what's currently in use before you start touching `status`.
SELECT status, COUNT(*) AS cnt FROM leads GROUP BY status;

-- ── Step 2.1: widen the enum so old and new values coexist during migration ──
ALTER TABLE leads
  MODIFY status ENUM(
    'new','contacted','counseling','evaluated','applied','visa','success','rejected',
    'converted','lost'
  ) NOT NULL DEFAULT 'new';

-- ── Step 2.2: merge "evaluated" into "counseling" (same point in the funnel) ──
UPDATE leads SET status = 'counseling' WHERE status = 'evaluated';

-- ── Step 2.3: any lead that already has a linked application is, by
-- definition, already converted. (Live `applications` is empty right now,
-- so this is a no-op today, but it's here for correctness / safe to re-run
-- later if data changes before you run this.)
UPDATE leads l
JOIN applications a ON a.lead_id = l.id
SET l.status = 'converted'
WHERE l.status <> 'converted';

-- ── Step 2.4 ⚠️ BUSINESS DECISION — "applied" (11 live leads) ──────────────
-- The old lead-status model used "applied" to mean the lead had an
-- application in progress. In the new model that concept moved entirely to
-- the Application record, and a lead that has reached that point is
-- "converted" (converted = eligible to have an application; it doesn't
-- require the application to literally exist yet in the new flow). Mapping
-- "applied" -> "converted" preserves that these 11 leads are further along
-- the funnel than "counseling", matching the spirit of their old status.
-- If you'd rather review them individually instead of bulk-reclassifying,
-- skip this UPDATE and handle them manually after the migration (they'll
-- need *some* valid value from the final enum before Step 2.6 will succeed).
UPDATE leads SET status = 'converted' WHERE status = 'applied';

-- ── Step 2.5 ⚠️ BUSINESS DECISION — "rejected" (1 live lead) ───────────────
-- The old "rejected" status has no direct equivalent — the closest is the
-- new "lost" status. No `lost_reason_id` is set here (there were 5
-- lost-reason options seeded in Part 4 below — "Other" is id 161 locally,
-- but re-check the id after Part 4 runs on live before using it, since
-- AUTO_INCREMENT will likely assign different ids there). A short
-- `lost_note` documents that this came from the migration rather than a
-- real "marked lost" action, so it's distinguishable in the lead's history
-- if anyone asks.
UPDATE leads
SET status = 'lost', lost_note = 'Migrated from legacy status "rejected" during the 2026-09 schema migration.'
WHERE status = 'rejected';

-- ── Checkpoint: MUST return ONLY new / contacted / counseling / converted /
-- lost. If anything else shows up, STOP — do not run Step 2.6 until this is
-- clean, or MySQL will silently blank out (empty string) any row whose
-- current value isn't in the new 5-value enum.
SELECT DISTINCT status FROM leads;

-- ── Step 2.6: once the checkpoint above is clean, shrink the enum to its
-- final 5-value set. ──
ALTER TABLE leads
  MODIFY status ENUM('new','contacted','counseling','converted','lost')
  NOT NULL DEFAULT 'new';

-- ── Final verification (optional) ──
SELECT status, COUNT(*) AS cnt FROM leads GROUP BY status;


-- ============================================================================
-- PART 3 — `applications` TABLE: new columns + status enum
-- ============================================================================
-- Live `applications` has 0 rows, so the enum change is safe to do directly
-- (no widen/shrink dance needed — nothing to remap). Still checked defensively.

SELECT COUNT(*) AS live_application_rows FROM applications;
-- If this is not 0, STOP and re-derive a mapping the same way Part 2 did
-- before proceeding (check `SELECT status, COUNT(*) FROM applications GROUP
-- BY status` against the old enum: inquiry, evaluation, "application
-- submitted", "offer letter received", "offer letter not received", "visa
-- filed", approved, reject).

ALTER TABLE applications
  ADD COLUMN `application_submitted_date` datetime DEFAULT NULL,
  ADD COLUMN `offer_letter_date` datetime DEFAULT NULL,
  ADD COLUMN `fee_submitted_date` datetime DEFAULT NULL,
  ADD COLUMN `visa_filed_date` datetime DEFAULT NULL,
  ADD COLUMN `approved_date` datetime DEFAULT NULL,
  ADD COLUMN `reject_date` datetime DEFAULT NULL,
  ADD COLUMN `processing_officer_id` int DEFAULT NULL;

ALTER TABLE applications
  MODIFY status ENUM(
    'application submitted','offer letter','fee submitted','visa filed','approved','rejected'
  ) NOT NULL DEFAULT 'application submitted';


-- ============================================================================
-- PART 4 — `application_activity_logs`: missing columns
-- ============================================================================
-- Live already has this table (from an earlier partial deploy), but it's
-- missing 3 columns the current backend code writes to on every insert
-- (see logApplicationActivity in src/services/applicationActivityLog.service.js).
-- Without these, every INSERT against live either errors or silently drops
-- who-performed-it context — this is NOT optional/cosmetic.

ALTER TABLE application_activity_logs
  ADD COLUMN `performed_by_role` varchar(32) DEFAULT NULL,
  ADD COLUMN `performed_by_name` varchar(255) DEFAULT NULL,
  ADD COLUMN `metadata` json DEFAULT NULL;


-- ============================================================================
-- PART 5 — `student_accounts`: new column
-- ============================================================================
-- Supports recording a payment against a Lead directly (before an
-- Application exists) — see the "payments from the counseling phase onward"
-- feature. Live has 0 rows in this table, so this is risk-free.

ALTER TABLE student_accounts
  ADD COLUMN `lead_id` int DEFAULT NULL;


-- ============================================================================
-- PART 6 — `users`: add the processing_officer role
-- ============================================================================
-- Additive enum change (adding a new allowed value never invalidates
-- existing rows), safe to run directly regardless of live data.

ALTER TABLE users
  MODIFY role ENUM('admin','counsellor','student','processing_officer') DEFAULT NULL;


-- ============================================================================
-- PART 7 — `student_documents`: allow processing_officer as an uploader
-- ============================================================================
-- student_documents.uploaded_by is an ENUM('student','counsellor','admin')
-- that predates the processing_officer role. The upload endpoint inserts the
-- acting user's role directly into this column, so a processing officer's
-- own upload currently fails under MySQL strict mode with:
--   "Data truncated for column 'uploaded_by' at row 1"
-- Confirmed against a dev copy of this schema while testing the processing
-- officer document-upload flow — this is a real, reproducible gap, not a
-- frontend-only issue. Already applied to the dev database; run the same
-- ALTER here.

ALTER TABLE student_documents
  MODIFY COLUMN uploaded_by ENUM('student','counsellor','admin','processing_officer') DEFAULT 'student';


-- ============================================================================
-- PART 8 — seed data
-- ============================================================================

-- 8a. Lost-reason dropdown options (used by Part 2 Step 2.5 above, and by
-- the "mark lead lost" UI going forward). Production currently has ZERO
-- rows of type 'lost_reason' — this dropdown would be empty without this.
INSERT INTO config_values (name, type, is_active, is_deleted, sort_order)
VALUES
  ('Budget', 'lost_reason', 1, 0, 0),
  ('Chose another consultancy', 'lost_reason', 1, 0, 1),
  ('Not eligible', 'lost_reason', 1, 0, 2),
  ('Unresponsive', 'lost_reason', 1, 0, 3),
  ('Other', 'lost_reason', 1, 0, 4);

-- 8b. Default module visibility per role (optional — the app's own
-- middleware "fails open" for any role/module pair with no row here, i.e.
-- access is allowed by default, so this step only matters if you want the
-- Access Control admin screen to show explicit toggles from day one instead
-- of implicit defaults).
INSERT INTO role_module_permissions (role, module_key, is_enabled) VALUES
  ('counsellor', 'dashboard', 1),
  ('counsellor', 'leads', 1),
  ('counsellor', 'applications', 1),
  ('counsellor', 'accounts', 0), -- disabled: counsellors have no accounts/payments access
  ('counsellor', 'chats', 1),
  ('processing_officer', 'dashboard', 1),
  ('processing_officer', 'applications', 1)
ON DUPLICATE KEY UPDATE is_enabled = VALUES(is_enabled);


-- ============================================================================
-- DONE — post-migration sanity checks
-- ============================================================================

-- ⚠️ THE MOST IMPORTANT CHECK: this MUST equal 44 (the count from before you
-- started). If it doesn't, STOP and investigate immediately — do not assume
-- everything else is fine.
SELECT COUNT(*) AS total_leads_should_be_44 FROM leads;

SHOW TABLES;
SELECT status, COUNT(*) AS cnt FROM leads GROUP BY status;
SELECT DISTINCT status FROM applications;
SELECT DISTINCT role FROM users;
SELECT COUNT(*) FROM config_values WHERE type = 'lost_reason';
DESCRIBE application_activity_logs;
DESCRIBE student_documents;
