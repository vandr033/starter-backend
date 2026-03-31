-- Migration: free_event_reservation_code
-- Adds reservation/check-in code support for free_event_registration.
-- Idempotent and safe to re-run.

-- 1) Add reservation_code column (6 chars)
SET @has_reservation_code := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'free_event_registration'
    AND COLUMN_NAME = 'reservation_code'
);
SET @sql := IF(@has_reservation_code = 0,
  'ALTER TABLE `free_event_registration` ADD COLUMN `reservation_code` VARCHAR(6) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) Add checked_in_at column
SET @has_checked_in_at := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'free_event_registration'
    AND COLUMN_NAME = 'checked_in_at'
);
SET @sql := IF(@has_checked_in_at = 0,
  'ALTER TABLE `free_event_registration` ADD COLUMN `checked_in_at` DATETIME(3) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) Add checked_in_method column
SET @has_checked_in_method := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'free_event_registration'
    AND COLUMN_NAME = 'checked_in_method'
);
SET @sql := IF(@has_checked_in_method = 0,
  'ALTER TABLE `free_event_registration` ADD COLUMN `checked_in_method` ENUM(''QR_SCAN'',''MANUAL'') NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4) Unique index for reservation_code
SET @has_unique_reservation_code := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'free_event_registration'
    AND INDEX_NAME = 'free_event_registration_reservation_code_key'
);
SET @sql := IF(@has_unique_reservation_code = 0,
  'ALTER TABLE `free_event_registration` ADD UNIQUE KEY `free_event_registration_reservation_code_key` (`reservation_code`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5) Composite lookup index for check-in flows
SET @has_event_reservation_lookup_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'free_event_registration'
    AND INDEX_NAME = 'free_event_registration_event_reservation_idx'
);
SET @sql := IF(@has_event_reservation_lookup_idx = 0,
  'ALTER TABLE `free_event_registration` ADD INDEX `free_event_registration_event_reservation_idx` (`group_event_id`, `reservation_code`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
