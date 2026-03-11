-- Add booking_source to booking if it does not exist
SET @booking_source_col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'booking'
    AND COLUMN_NAME = 'booking_source'
);

SET @booking_source_sql := IF(
  @booking_source_col_exists = 0,
  'ALTER TABLE `booking` ADD COLUMN `booking_source` ENUM(''MARKETPLACE'', ''SALON_SITE'', ''ADMIN'', ''MANUAL'') NOT NULL DEFAULT ''SALON_SITE''',
  'SELECT 1'
);

PREPARE booking_source_stmt FROM @booking_source_sql;
EXECUTE booking_source_stmt;
DEALLOCATE PREPARE booking_source_stmt;

-- Create marketplace_event table
CREATE TABLE IF NOT EXISTS `marketplace_event` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `event_name` VARCHAR(64) NOT NULL,
  `payload` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- booking_source + created_at index
SET @booking_source_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'booking'
    AND INDEX_NAME = 'booking_source_created_at_idx'
);

SET @booking_source_idx_sql := IF(
  @booking_source_idx_exists = 0,
  'CREATE INDEX `booking_source_created_at_idx` ON `booking`(`booking_source`, `created_at`)',
  'SELECT 1'
);

PREPARE booking_source_idx_stmt FROM @booking_source_idx_sql;
EXECUTE booking_source_idx_stmt;
DEALLOCATE PREPARE booking_source_idx_stmt;

-- company active/city/state index
SET @company_active_city_state_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company'
    AND INDEX_NAME = 'company_active_city_state_idx'
);

SET @company_active_city_state_idx_sql := IF(
  @company_active_city_state_idx_exists = 0,
  'CREATE INDEX `company_active_city_state_idx` ON `company`(`is_active`, `city`, `state`)',
  'SELECT 1'
);

PREPARE company_active_city_state_idx_stmt FROM @company_active_city_state_idx_sql;
EXECUTE company_active_city_state_idx_stmt;
DEALLOCATE PREPARE company_active_city_state_idx_stmt;

-- service company/global/active index
SET @service_company_global_active_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'service'
    AND INDEX_NAME = 'service_company_global_active_idx'
);

SET @service_company_global_active_idx_sql := IF(
  @service_company_global_active_idx_exists = 0,
  'CREATE INDEX `service_company_global_active_idx` ON `service`(`company_id`, `global_type_id`, `is_active`)',
  'SELECT 1'
);

PREPARE service_company_global_active_idx_stmt FROM @service_company_global_active_idx_sql;
EXECUTE service_company_global_active_idx_stmt;
DEALLOCATE PREPARE service_company_global_active_idx_stmt;

-- marketplace_event event_name + created_at index
SET @marketplace_event_name_created_at_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'marketplace_event'
    AND INDEX_NAME = 'marketplace_event_name_created_at_idx'
);

SET @marketplace_event_name_created_at_idx_sql := IF(
  @marketplace_event_name_created_at_idx_exists = 0,
  'CREATE INDEX `marketplace_event_name_created_at_idx` ON `marketplace_event`(`event_name`, `created_at`)',
  'SELECT 1'
);

PREPARE marketplace_event_name_created_at_idx_stmt FROM @marketplace_event_name_created_at_idx_sql;
EXECUTE marketplace_event_name_created_at_idx_stmt;
DEALLOCATE PREPARE marketplace_event_name_created_at_idx_stmt;
