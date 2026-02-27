-- Add user.must_change_password only if it does not exist
SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'user'
    AND COLUMN_NAME = 'must_change_password'
);
SET @sql_col := IF(
  @col_exists = 0,
  'ALTER TABLE `user` ADD COLUMN `must_change_password` BOOLEAN NOT NULL DEFAULT false',
  'SELECT 1'
);
PREPARE stmt_col FROM @sql_col;
EXECUTE stmt_col;
DEALLOCATE PREPARE stmt_col;
