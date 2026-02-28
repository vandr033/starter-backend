-- Allow multiple opening windows per day by removing the single-row-per-day constraint.
SET @idx_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'hours'
    AND index_name = 'hours_company_id_day_of_week_key'
);

SET @drop_stmt := IF(
  @idx_exists > 0,
  'DROP INDEX `hours_company_id_day_of_week_key` ON `hours`',
  'SELECT 1'
);

PREPARE stmt FROM @drop_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
