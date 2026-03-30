SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'company' AND COLUMN_NAME = 'currency'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `company` ADD COLUMN `currency` VARCHAR(3) NOT NULL DEFAULT ''Bs.'' AFTER `timezone`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
