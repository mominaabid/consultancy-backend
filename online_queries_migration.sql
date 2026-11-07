-- ============================================================================
-- ONLINE QUERIES — migration
-- ============================================================================
-- Website ("Apply Now") submissions ab seedha `leads` me nahi jatin. Pehle
-- `online_queries` me aati hain, admin portal par review karta hai, aur phir
-- "Convert to Lead" par `leads` me row banti hai.
--
-- Ye migration purely ADDITIVE hai:
--   • ek naya table banta hai
--   • `leads` me sirf ek nullable column add hota hai (trace ke liye)
-- Koi existing row chhui nahi jati, koi column drop/modify nahi hota.
-- Safe to re-run (IF NOT EXISTS / defensive checks).
--
-- Run order: ye file PHASE 0 hai — backend deploy (Phase 1) se pehle chalayein.
-- ============================================================================


-- ============================================================================
-- PART 1 — `online_queries` table
-- ============================================================================
CREATE TABLE IF NOT EXISTS `online_queries` (
  `id`                  int NOT NULL AUTO_INCREMENT,

  -- ── Visitor ne jo bhara (LeadChatForm ke fields ka mirror) ──
  `name`                varchar(100) NOT NULL,
  `email`               varchar(150) NOT NULL,
  `phone`               varchar(30)  NOT NULL,
  `city`                varchar(100) DEFAULT NULL,
  `preferred_country`   varchar(100) DEFAULT NULL,
  `course`              varchar(150) DEFAULT NULL,
  `message`             text         DEFAULT NULL,

  `english_test`        varchar(50)  DEFAULT NULL,   -- IELTS / PTE / TOEFL / Duolingo
  `english_test_score`  decimal(5,2) DEFAULT NULL,

  `last_degree`         varchar(100) DEFAULT NULL,
  `degree_year`         int          DEFAULT NULL,
  `degree_grades`       varchar(50)  DEFAULT NULL,
  `degree_university`   varchar(150) DEFAULT NULL,

  -- ── Meta ──
  `source`              varchar(50)  NOT NULL DEFAULT 'Website',  -- Website | ApplyNow | Popup
  `page_url`            varchar(255) DEFAULT NULL,
  `ip_address`          varchar(45)  DEFAULT NULL,

  -- ── Triage ──
  `status`              enum('new','reviewed','converted','spam') NOT NULL DEFAULT 'new',
  `admin_note`          text         DEFAULT NULL,
  `reviewed_by`         int          DEFAULT NULL,   -- users.id
  `reviewed_at`         datetime     DEFAULT NULL,

  -- ── Conversion trace ──
  `converted_lead_id`   int          DEFAULT NULL,   -- leads.id
  `converted_by`        int          DEFAULT NULL,   -- users.id
  `converted_at`        datetime     DEFAULT NULL,

  `is_deleted`          tinyint(1)   NOT NULL DEFAULT 0,
  `created_at`          timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          timestamp    NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  KEY `idx_oq_status`  (`status`),
  KEY `idx_oq_email`   (`email`),
  KEY `idx_oq_phone`   (`phone`),
  KEY `idx_oq_created` (`created_at`),
  KEY `idx_oq_lead`    (`converted_lead_id`),
  KEY `idx_oq_deleted` (`is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- PART 2 — `leads`.`online_query_id`
-- ============================================================================
-- Kis online query se ye lead bani — Lead Detail page par "From Online Query
-- #N" chip dikhane ke liye, aur double-conversion rokne ke liye.
--
-- MySQL me "ADD COLUMN IF NOT EXISTS" nahi hota, is liye pehle check karte
-- hain taake file dobara chalane par error na aaye.
-- ----------------------------------------------------------------------------
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'leads'
    AND COLUMN_NAME  = 'online_query_id'
);

SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `leads`
     ADD COLUMN `online_query_id` int DEFAULT NULL AFTER `source_id`,
     ADD KEY `idx_leads_online_query` (`online_query_id`)',
  'SELECT "leads.online_query_id already exists — skipped" AS note'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- ============================================================================
-- PART 3 — Access control
-- ============================================================================
-- Online Queries ADMIN-ONLY hai. Admin role `role_module_permissions` se gate
-- nahi hota (ROLE_MODULES me sirf counsellor aur processing_officer hain),
-- is liye yahan koi row insert NAHI karni. Access route-level guard
-- `role('admin')` se control hota hai.
--
-- Jaan boojh kar khali chhora gaya hai — koi SQL nahi.


-- ============================================================================
-- VERIFICATION (optional — chala kar confirm kar lein)
-- ============================================================================
-- SHOW CREATE TABLE `online_queries`;
-- SHOW COLUMNS FROM `leads` LIKE 'online_query_id';
-- SELECT COUNT(*) AS total_queries FROM `online_queries`;
