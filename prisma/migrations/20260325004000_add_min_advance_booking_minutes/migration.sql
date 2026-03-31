SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company_settings'
    AND COLUMN_NAME = 'min_advance_booking_minutes'
);

SET @anchor_col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company_settings'
    AND COLUMN_NAME = 'max_advance_booking_days'
);

SET @sql := IF(
  @col_exists = 0,
  IF(
    @anchor_col_exists = 1,
    'ALTER TABLE `company_settings` ADD COLUMN `min_advance_booking_minutes` INTEGER NULL AFTER `max_advance_booking_days`',
    'ALTER TABLE `company_settings` ADD COLUMN `min_advance_booking_minutes` INTEGER NULL'
  ),
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
