-- Add per-shop plan/billing/expiry fields and subscription history table.
-- This migration is written to be idempotent and safe on existing datasets.

-- company.plan
SET @company_plan_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company'
    AND COLUMN_NAME = 'plan'
);
SET @sql_company_plan := IF(
  @company_plan_exists = 0,
  'ALTER TABLE `company` ADD COLUMN `plan` ENUM(''STARTER'',''BUSINESS'',''PRO'') NULL DEFAULT ''BUSINESS''',
  'ALTER TABLE `company` MODIFY `plan` ENUM(''STARTER'',''BUSINESS'',''PRO'') NULL DEFAULT ''BUSINESS'''
);
PREPARE stmt_company_plan FROM @sql_company_plan;
EXECUTE stmt_company_plan;
DEALLOCATE PREPARE stmt_company_plan;

-- company.billing_cycle
SET @company_billing_cycle_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company'
    AND COLUMN_NAME = 'billing_cycle'
);
SET @sql_company_billing_cycle := IF(
  @company_billing_cycle_exists = 0,
  'ALTER TABLE `company` ADD COLUMN `billing_cycle` ENUM(''MONTHLY'',''YEARLY'') NULL DEFAULT ''MONTHLY''',
  'ALTER TABLE `company` MODIFY `billing_cycle` ENUM(''MONTHLY'',''YEARLY'') NULL DEFAULT ''MONTHLY'''
);
PREPARE stmt_company_billing_cycle FROM @sql_company_billing_cycle;
EXECUTE stmt_company_billing_cycle;
DEALLOCATE PREPARE stmt_company_billing_cycle;

-- company.price_paid
SET @company_price_paid_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company'
    AND COLUMN_NAME = 'price_paid'
);
SET @sql_company_price_paid := IF(
  @company_price_paid_exists = 0,
  'ALTER TABLE `company` ADD COLUMN `price_paid` DECIMAL(10,2) NULL',
  'ALTER TABLE `company` MODIFY `price_paid` DECIMAL(10,2) NULL'
);
PREPARE stmt_company_price_paid FROM @sql_company_price_paid;
EXECUTE stmt_company_price_paid;
DEALLOCATE PREPARE stmt_company_price_paid;

-- company.available_until
SET @company_available_until_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company'
    AND COLUMN_NAME = 'available_until'
);
SET @sql_company_available_until := IF(
  @company_available_until_exists = 0,
  'ALTER TABLE `company` ADD COLUMN `available_until` DATETIME(3) NULL DEFAULT ''2027-03-12 23:59:59.000''',
  'ALTER TABLE `company` MODIFY `available_until` DATETIME(3) NULL DEFAULT ''2027-03-12 23:59:59.000'''
);
PREPARE stmt_company_available_until FROM @sql_company_available_until;
EXECUTE stmt_company_available_until;
DEALLOCATE PREPARE stmt_company_available_until;

-- company.is_marketplace_visible
SET @company_is_marketplace_visible_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company'
    AND COLUMN_NAME = 'is_marketplace_visible'
);
SET @sql_company_is_marketplace_visible := IF(
  @company_is_marketplace_visible_exists = 0,
  'ALTER TABLE `company` ADD COLUMN `is_marketplace_visible` TINYINT(1) NULL DEFAULT 1',
  'ALTER TABLE `company` MODIFY `is_marketplace_visible` TINYINT(1) NULL DEFAULT 1'
);
PREPARE stmt_company_is_marketplace_visible FROM @sql_company_is_marketplace_visible;
EXECUTE stmt_company_is_marketplace_visible;
DEALLOCATE PREPARE stmt_company_is_marketplace_visible;

-- Backfill existing companies with requested defaults.
UPDATE `company`
SET
  `plan` = COALESCE(`plan`, 'BUSINESS'),
  `billing_cycle` = COALESCE(`billing_cycle`, 'MONTHLY'),
  `available_until` = COALESCE(`available_until`, '2027-03-12 23:59:59.000'),
  `is_marketplace_visible` = COALESCE(`is_marketplace_visible`, 1);

-- Enforce required columns after backfill.
ALTER TABLE `company`
  MODIFY `plan` ENUM('STARTER','BUSINESS','PRO') NOT NULL DEFAULT 'BUSINESS',
  MODIFY `billing_cycle` ENUM('MONTHLY','YEARLY') NOT NULL DEFAULT 'MONTHLY',
  MODIFY `price_paid` DECIMAL(10,2) NULL,
  MODIFY `available_until` DATETIME(3) NOT NULL DEFAULT '2027-03-12 23:59:59.000',
  MODIFY `is_marketplace_visible` TINYINT(1) NOT NULL DEFAULT 1;

-- company indexes used for expiry and marketplace filtering.
SET @company_available_until_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company'
    AND INDEX_NAME = 'company_available_until_idx'
);
SET @sql_company_available_until_idx := IF(
  @company_available_until_idx_exists = 0,
  'CREATE INDEX `company_available_until_idx` ON `company`(`available_until`)',
  'SELECT 1'
);
PREPARE stmt_company_available_until_idx FROM @sql_company_available_until_idx;
EXECUTE stmt_company_available_until_idx;
DEALLOCATE PREPARE stmt_company_available_until_idx;

SET @company_plan_billing_cycle_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company'
    AND INDEX_NAME = 'company_plan_billing_cycle_idx'
);
SET @sql_company_plan_billing_cycle_idx := IF(
  @company_plan_billing_cycle_idx_exists = 0,
  'CREATE INDEX `company_plan_billing_cycle_idx` ON `company`(`plan`, `billing_cycle`)',
  'SELECT 1'
);
PREPARE stmt_company_plan_billing_cycle_idx FROM @sql_company_plan_billing_cycle_idx;
EXECUTE stmt_company_plan_billing_cycle_idx;
DEALLOCATE PREPARE stmt_company_plan_billing_cycle_idx;

SET @company_marketplace_visible_active_city_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company'
    AND INDEX_NAME = 'company_marketplace_visible_active_city_idx'
);
SET @sql_company_marketplace_visible_active_city_idx := IF(
  @company_marketplace_visible_active_city_idx_exists = 0,
  'CREATE INDEX `company_marketplace_visible_active_city_idx` ON `company`(`is_marketplace_visible`, `is_active`, `city`)',
  'SELECT 1'
);
PREPARE stmt_company_marketplace_visible_active_city_idx FROM @sql_company_marketplace_visible_active_city_idx;
EXECUTE stmt_company_marketplace_visible_active_city_idx;
DEALLOCATE PREPARE stmt_company_marketplace_visible_active_city_idx;

-- History table for auditable subscription changes.
CREATE TABLE IF NOT EXISTS `company_subscription_history` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `previous_plan` ENUM('STARTER','BUSINESS','PRO') NULL,
  `new_plan` ENUM('STARTER','BUSINESS','PRO') NOT NULL,
  `previous_billing_cycle` ENUM('MONTHLY','YEARLY') NULL,
  `new_billing_cycle` ENUM('MONTHLY','YEARLY') NOT NULL,
  `previous_price_paid` DECIMAL(10,2) NULL,
  `new_price_paid` DECIMAL(10,2) NULL,
  `previous_available_until` DATETIME(3) NULL,
  `new_available_until` DATETIME(3) NOT NULL,
  `previous_marketplace_visible` TINYINT(1) NULL,
  `new_marketplace_visible` TINYINT(1) NOT NULL,
  `changed_by_user_id` VARCHAR(191) NULL,
  `changed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `note` VARCHAR(500) NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `company_subscription_history_company_id_fkey`
    FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `company_subscription_history_changed_by_user_id_fkey`
    FOREIGN KEY (`changed_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- History table indexes.
SET @history_company_changed_at_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company_subscription_history'
    AND INDEX_NAME = 'company_subscription_history_company_changed_at_idx'
);
SET @sql_history_company_changed_at_idx := IF(
  @history_company_changed_at_idx_exists = 0,
  'CREATE INDEX `company_subscription_history_company_changed_at_idx` ON `company_subscription_history`(`company_id`, `changed_at`)',
  'SELECT 1'
);
PREPARE stmt_history_company_changed_at_idx FROM @sql_history_company_changed_at_idx;
EXECUTE stmt_history_company_changed_at_idx;
DEALLOCATE PREPARE stmt_history_company_changed_at_idx;

SET @history_changed_by_user_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company_subscription_history'
    AND INDEX_NAME = 'company_subscription_history_changed_by_user_id_idx'
);
SET @sql_history_changed_by_user_idx := IF(
  @history_changed_by_user_idx_exists = 0,
  'CREATE INDEX `company_subscription_history_changed_by_user_id_idx` ON `company_subscription_history`(`changed_by_user_id`)',
  'SELECT 1'
);
PREPARE stmt_history_changed_by_user_idx FROM @sql_history_changed_by_user_idx;
EXECUTE stmt_history_changed_by_user_idx;
DEALLOCATE PREPARE stmt_history_changed_by_user_idx;

SET @history_new_plan_changed_at_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company_subscription_history'
    AND INDEX_NAME = 'company_subscription_history_new_plan_changed_at_idx'
);
SET @sql_history_new_plan_changed_at_idx := IF(
  @history_new_plan_changed_at_idx_exists = 0,
  'CREATE INDEX `company_subscription_history_new_plan_changed_at_idx` ON `company_subscription_history`(`new_plan`, `changed_at`)',
  'SELECT 1'
);
PREPARE stmt_history_new_plan_changed_at_idx FROM @sql_history_new_plan_changed_at_idx;
EXECUTE stmt_history_new_plan_changed_at_idx;
DEALLOCATE PREPARE stmt_history_new_plan_changed_at_idx;

-- Create an initial history snapshot per company if one does not exist.
INSERT INTO `company_subscription_history` (
  `company_id`,
  `previous_plan`,
  `new_plan`,
  `previous_billing_cycle`,
  `new_billing_cycle`,
  `previous_price_paid`,
  `new_price_paid`,
  `previous_available_until`,
  `new_available_until`,
  `previous_marketplace_visible`,
  `new_marketplace_visible`,
  `changed_by_user_id`,
  `changed_at`,
  `note`
)
SELECT
  c.`id`,
  NULL,
  c.`plan`,
  NULL,
  c.`billing_cycle`,
  NULL,
  c.`price_paid`,
  NULL,
  c.`available_until`,
  NULL,
  c.`is_marketplace_visible`,
  NULL,
  CURRENT_TIMESTAMP(3),
  'Initial subscription baseline backfill'
FROM `company` c
WHERE NOT EXISTS (
  SELECT 1
  FROM `company_subscription_history` h
  WHERE h.`company_id` = c.`id`
);
