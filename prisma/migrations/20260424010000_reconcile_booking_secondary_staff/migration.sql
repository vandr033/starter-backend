-- Reconcile booking.secondary_staff_id for databases that missed the
-- schema update required by resource bookings.

SET @booking_secondary_staff_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'booking'
    AND COLUMN_NAME = 'secondary_staff_id'
);
SET @sql_booking_secondary_staff := IF(
  @booking_secondary_staff_exists = 0,
  'ALTER TABLE `booking` ADD COLUMN `secondary_staff_id` INTEGER NULL AFTER `staff_id`',
  'SELECT 1'
);
PREPARE stmt_booking_secondary_staff FROM @sql_booking_secondary_staff;
EXECUTE stmt_booking_secondary_staff;
DEALLOCATE PREPARE stmt_booking_secondary_staff;

SET @booking_secondary_staff_idx_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'booking'
    AND INDEX_NAME = 'booking_secondary_staff_id_start_at_end_at_status_idx'
);
SET @sql_booking_secondary_staff_idx := IF(
  @booking_secondary_staff_idx_exists = 0,
  'CREATE INDEX `booking_secondary_staff_id_start_at_end_at_status_idx` ON `booking`(`secondary_staff_id`, `start_at`, `end_at`, `status`)',
  'SELECT 1'
);
PREPARE stmt_booking_secondary_staff_idx FROM @sql_booking_secondary_staff_idx;
EXECUTE stmt_booking_secondary_staff_idx;
DEALLOCATE PREPARE stmt_booking_secondary_staff_idx;

SET @booking_secondary_staff_fk_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'booking'
    AND CONSTRAINT_NAME = 'booking_secondary_staff_id_fkey'
);
SET @sql_booking_secondary_staff_fk := IF(
  @booking_secondary_staff_fk_exists = 0,
  'ALTER TABLE `booking` ADD CONSTRAINT `booking_secondary_staff_id_fkey` FOREIGN KEY (`secondary_staff_id`) REFERENCES `staff_profile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt_booking_secondary_staff_fk FROM @sql_booking_secondary_staff_fk;
EXECUTE stmt_booking_secondary_staff_fk;
DEALLOCATE PREPARE stmt_booking_secondary_staff_fk;
