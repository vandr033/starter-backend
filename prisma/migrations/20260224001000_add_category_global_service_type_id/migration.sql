-- Add category.global_service_type_id only if it does not exist
SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'category'
    AND COLUMN_NAME = 'global_service_type_id'
);
SET @sql_col := IF(
  @col_exists = 0,
  'ALTER TABLE `category` ADD COLUMN `global_service_type_id` INTEGER NULL',
  'SELECT 1'
);
PREPARE stmt_col FROM @sql_col;
EXECUTE stmt_col;
DEALLOCATE PREPARE stmt_col;

-- Add index only if missing
SET @idx_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'category'
    AND INDEX_NAME = 'category_global_service_type_id_idx'
);
SET @sql_idx := IF(
  @idx_exists = 0,
  'CREATE INDEX `category_global_service_type_id_idx` ON `category`(`global_service_type_id`)',
  'SELECT 1'
);
PREPARE stmt_idx FROM @sql_idx;
EXECUTE stmt_idx;
DEALLOCATE PREPARE stmt_idx;

-- Add FK only if missing
SET @fk_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'category'
    AND CONSTRAINT_NAME = 'category_global_service_type_id_fkey'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql_fk := IF(
  @fk_exists = 0,
  'ALTER TABLE `category` ADD CONSTRAINT `category_global_service_type_id_fkey` FOREIGN KEY (`global_service_type_id`) REFERENCES `global_service_type`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt_fk FROM @sql_fk;
EXECUTE stmt_fk;
DEALLOCATE PREPARE stmt_fk;
