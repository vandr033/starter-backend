-- Add booking-level extra attendee capture for multi-spot event bookings
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'group_event_booking' AND COLUMN_NAME = 'extra_attendees_json');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `group_event_booking` ADD COLUMN `extra_attendees_json` JSON NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add per-ticket holder metadata and seat ordering for event multi-ticket issuance
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'group_ticket' AND COLUMN_NAME = 'seat_number');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `group_ticket` ADD COLUMN `seat_number` INTEGER NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'group_ticket' AND COLUMN_NAME = 'holder_name');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `group_ticket` ADD COLUMN `holder_name` VARCHAR(255) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'group_ticket' AND COLUMN_NAME = 'holder_email');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `group_ticket` ADD COLUMN `holder_email` VARCHAR(191) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'group_ticket' AND COLUMN_NAME = 'holder_phone');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `group_ticket` ADD COLUMN `holder_phone` VARCHAR(64) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Optional helper index for event-seat lookups
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'group_ticket' AND INDEX_NAME = 'group_ticket_group_event_booking_id_seat_number_idx');
SET @sql := IF(@idx_exists = 0, 'CREATE INDEX `group_ticket_group_event_booking_id_seat_number_idx` ON `group_ticket`(`group_event_booking_id`, `seat_number`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
