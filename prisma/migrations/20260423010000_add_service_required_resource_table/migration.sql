CREATE TABLE IF NOT EXISTS `service_required_resource` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `service_id` INTEGER NOT NULL,
  `staff_profile_id` INTEGER NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `service_required_resource_company_id_fkey`
    FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `service_required_resource_service_id_fkey`
    FOREIGN KEY (`service_id`) REFERENCES `service`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `service_required_resource_staff_profile_id_fkey`
    FOREIGN KEY (`staff_profile_id`) REFERENCES `staff_profile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @service_required_resource_unique_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'service_required_resource'
    AND INDEX_NAME = 'service_required_resource_service_id_staff_profile_id_key'
);
SET @sql_service_required_resource_unique := IF(
  @service_required_resource_unique_exists = 0,
  'CREATE UNIQUE INDEX `service_required_resource_service_id_staff_profile_id_key` ON `service_required_resource`(`service_id`, `staff_profile_id`)',
  'SELECT 1'
);
PREPARE stmt_service_required_resource_unique FROM @sql_service_required_resource_unique;
EXECUTE stmt_service_required_resource_unique;
DEALLOCATE PREPARE stmt_service_required_resource_unique;

SET @service_required_resource_company_service_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'service_required_resource'
    AND INDEX_NAME = 'service_required_resource_company_id_service_id_idx'
);
SET @sql_service_required_resource_company_service_idx := IF(
  @service_required_resource_company_service_idx_exists = 0,
  'CREATE INDEX `service_required_resource_company_id_service_id_idx` ON `service_required_resource`(`company_id`, `service_id`)',
  'SELECT 1'
);
PREPARE stmt_service_required_resource_company_service_idx FROM @sql_service_required_resource_company_service_idx;
EXECUTE stmt_service_required_resource_company_service_idx;
DEALLOCATE PREPARE stmt_service_required_resource_company_service_idx;

SET @service_required_resource_staff_profile_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'service_required_resource'
    AND INDEX_NAME = 'service_required_resource_staff_profile_id_idx'
);
SET @sql_service_required_resource_staff_profile_idx := IF(
  @service_required_resource_staff_profile_idx_exists = 0,
  'CREATE INDEX `service_required_resource_staff_profile_id_idx` ON `service_required_resource`(`staff_profile_id`)',
  'SELECT 1'
);
PREPARE stmt_service_required_resource_staff_profile_idx FROM @sql_service_required_resource_staff_profile_idx;
EXECUTE stmt_service_required_resource_staff_profile_idx;
DEALLOCATE PREPARE stmt_service_required_resource_staff_profile_idx;
