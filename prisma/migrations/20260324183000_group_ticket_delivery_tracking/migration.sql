SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'group_ticket' AND COLUMN_NAME = 'delivery_count');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `group_ticket` ADD COLUMN `delivery_count` INTEGER NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'group_ticket' AND COLUMN_NAME = 'resend_count');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `group_ticket` ADD COLUMN `resend_count` INTEGER NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'group_ticket' AND COLUMN_NAME = 'last_sent_at');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `group_ticket` ADD COLUMN `last_sent_at` DATETIME(3) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
