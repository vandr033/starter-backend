-- Allow multiple opening windows per day by removing the single-row-per-day constraint.
SET @company_idx_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'hours'
    AND index_name = 'hours_company_id_idx'
);

SET @create_company_idx_stmt := IF(
  @company_idx_exists = 0,
  'CREATE INDEX `hours_company_id_idx` ON `hours` (`company_id`)',
  'SELECT 1'
);

PREPARE stmt_create_company_idx FROM @create_company_idx_stmt;
EXECUTE stmt_create_company_idx;
DEALLOCATE PREPARE stmt_create_company_idx;

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
