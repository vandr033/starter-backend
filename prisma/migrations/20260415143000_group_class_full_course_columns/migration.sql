SET @col_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'group_class'
      AND COLUMN_NAME = 'monthly_price_cents'
);
SET @sql := IF(
    @col_exists = 0,
    'ALTER TABLE `group_class` ADD COLUMN `monthly_price_cents` INTEGER NULL AFTER `price_cents`',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'group_class'
      AND COLUMN_NAME = 'billing_day'
);
SET @sql := IF(
    @col_exists = 0,
    'ALTER TABLE `group_class` ADD COLUMN `billing_day` INTEGER NULL AFTER `monthly_price_cents`',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE `group_class`
    MODIFY COLUMN `pricing_mode` ENUM('PER_SESSION', 'WEEKLY_PASS', 'MONTHLY_PASS', 'FULL_COURSE') NOT NULL DEFAULT 'PER_SESSION';
