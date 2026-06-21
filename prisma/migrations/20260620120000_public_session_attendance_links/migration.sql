ALTER TABLE `group_session_attendance`
  MODIFY COLUMN `checked_in_method` ENUM('QR_SCAN', 'MANUAL', 'PUBLIC_LINK') NULL;

ALTER TABLE `free_event_registration`
  MODIFY COLUMN `checked_in_method` ENUM('QR_SCAN', 'MANUAL', 'PUBLIC_LINK') NULL;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_class_session'
    AND COLUMN_NAME = 'public_attendance_enabled'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `group_class_session` ADD COLUMN `public_attendance_enabled` BOOLEAN NOT NULL DEFAULT false',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_class_session'
    AND COLUMN_NAME = 'attendance_public_token'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `group_class_session` ADD COLUMN `attendance_public_token` VARCHAR(191) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_class_session'
    AND COLUMN_NAME = 'attendance_public_token_created_at'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `group_class_session` ADD COLUMN `attendance_public_token_created_at` DATETIME(3) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_class_session'
    AND COLUMN_NAME = 'attendance_public_token_rotated_at'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `group_class_session` ADD COLUMN `attendance_public_token_rotated_at` DATETIME(3) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_class_session'
    AND COLUMN_NAME = 'attendance_access_code_enabled'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `group_class_session` ADD COLUMN `attendance_access_code_enabled` BOOLEAN NOT NULL DEFAULT false',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_class_session'
    AND COLUMN_NAME = 'attendance_access_code_hash'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `group_class_session` ADD COLUMN `attendance_access_code_hash` VARCHAR(255) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_class_session'
    AND COLUMN_NAME = 'attendance_access_code_updated_at'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `group_class_session` ADD COLUMN `attendance_access_code_updated_at` DATETIME(3) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_class_session'
    AND INDEX_NAME = 'group_class_session_attendance_public_token_key'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE UNIQUE INDEX `group_class_session_attendance_public_token_key` ON `group_class_session`(`attendance_public_token`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_class_session'
    AND INDEX_NAME = 'gcs_company_token_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX `gcs_company_token_idx` ON `group_class_session`(`company_id`, `attendance_public_token`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_class_enrollment'
    AND COLUMN_NAME = 'source'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `group_class_enrollment` ADD COLUMN `source` ENUM(''PUBLIC_CHECKOUT'', ''ADMIN_CREATE'', ''PUBLIC_ATTENDANCE_LINK'') NOT NULL DEFAULT ''PUBLIC_CHECKOUT''',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_class_enrollment'
    AND COLUMN_NAME = 'is_admin_sponsored'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `group_class_enrollment` ADD COLUMN `is_admin_sponsored` BOOLEAN NOT NULL DEFAULT false',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_class_enrollment'
    AND COLUMN_NAME = 'sponsorship_reason'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `group_class_enrollment` ADD COLUMN `sponsorship_reason` VARCHAR(255) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_class_enrollment'
    AND COLUMN_NAME = 'sponsored_by_group_class_session_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `group_class_enrollment` ADD COLUMN `sponsored_by_group_class_session_id` INTEGER NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_class_enrollment'
    AND COLUMN_NAME = 'sponsored_by_admin_user_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `group_class_enrollment` ADD COLUMN `sponsored_by_admin_user_id` VARCHAR(191) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_class_enrollment'
    AND INDEX_NAME = 'gce_sponsored_status_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX `gce_sponsored_status_idx` ON `group_class_enrollment`(`is_admin_sponsored`, `status`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_class_enrollment'
    AND INDEX_NAME = 'gce_source_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX `gce_source_idx` ON `group_class_enrollment`(`source`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_class_enrollment'
    AND INDEX_NAME = 'gce_sponsored_session_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX `gce_sponsored_session_idx` ON `group_class_enrollment`(`sponsored_by_group_class_session_id`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_class_enrollment'
    AND INDEX_NAME = 'gce_sponsored_admin_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX `gce_sponsored_admin_idx` ON `group_class_enrollment`(`sponsored_by_admin_user_id`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_class_enrollment'
    AND CONSTRAINT_NAME = 'gce_sponsored_session_fk'
);
SET @sql := IF(
  @fk_exists = 0,
  'ALTER TABLE `group_class_enrollment` ADD CONSTRAINT `gce_sponsored_session_fk` FOREIGN KEY (`sponsored_by_group_class_session_id`) REFERENCES `group_class_session`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_class_enrollment'
    AND CONSTRAINT_NAME = 'gce_sponsored_admin_fk'
);
SET @sql := IF(
  @fk_exists = 0,
  'ALTER TABLE `group_class_enrollment` ADD CONSTRAINT `gce_sponsored_admin_fk` FOREIGN KEY (`sponsored_by_admin_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_class_guest_enrollment_session'
    AND COLUMN_NAME = 'group_class_session_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `group_class_guest_enrollment_session` ADD COLUMN `group_class_session_id` INTEGER NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_class_guest_enrollment_session'
    AND INDEX_NAME = 'gcges_company_session_consumed_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX `gcges_company_session_consumed_idx` ON `group_class_guest_enrollment_session`(`company_id`, `group_class_session_id`, `consumed_at`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_class_guest_enrollment_session'
    AND CONSTRAINT_NAME = 'gcges_session_fk'
);
SET @sql := IF(
  @fk_exists = 0,
  'ALTER TABLE `group_class_guest_enrollment_session` ADD CONSTRAINT `gcges_session_fk` FOREIGN KEY (`group_class_session_id`) REFERENCES `group_class_session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `group_session_public_attendance_attempt` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `group_class_session_id` INTEGER NOT NULL,
  `resolved_user_id` VARCHAR(191) NULL,
  `attempt_type` ENUM('TOKEN_LOOKUP', 'OTP_START', 'OTP_RESEND', 'OTP_VERIFY', 'ACCESS_CODE_SUBMIT', 'SUBMIT') NOT NULL,
  `token_fingerprint` VARCHAR(128) NOT NULL,
  `ip_fingerprint` VARCHAR(128) NOT NULL,
  `success` BOOLEAN NOT NULL DEFAULT false,
  `detail_code` VARCHAR(64) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_session_public_attendance_attempt'
    AND INDEX_NAME = 'gspaa_company_session_created_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX `gspaa_company_session_created_idx` ON `group_session_public_attendance_attempt`(`company_id`, `group_class_session_id`, `created_at`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_session_public_attendance_attempt'
    AND INDEX_NAME = 'gspaa_session_type_created_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX `gspaa_session_type_created_idx` ON `group_session_public_attendance_attempt`(`group_class_session_id`, `attempt_type`, `created_at`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_session_public_attendance_attempt'
    AND INDEX_NAME = 'gspaa_token_ip_type_created_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX `gspaa_token_ip_type_created_idx` ON `group_session_public_attendance_attempt`(`token_fingerprint`, `ip_fingerprint`, `attempt_type`, `created_at`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_session_public_attendance_attempt'
    AND INDEX_NAME = 'gspaa_user_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX `gspaa_user_idx` ON `group_session_public_attendance_attempt`(`resolved_user_id`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_session_public_attendance_attempt'
    AND CONSTRAINT_NAME = 'gspaa_company_fk'
);
SET @sql := IF(
  @fk_exists = 0,
  'ALTER TABLE `group_session_public_attendance_attempt` ADD CONSTRAINT `gspaa_company_fk` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_session_public_attendance_attempt'
    AND CONSTRAINT_NAME = 'gspaa_session_fk'
);
SET @sql := IF(
  @fk_exists = 0,
  'ALTER TABLE `group_session_public_attendance_attempt` ADD CONSTRAINT `gspaa_session_fk` FOREIGN KEY (`group_class_session_id`) REFERENCES `group_class_session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_session_public_attendance_attempt'
    AND CONSTRAINT_NAME = 'gspaa_user_fk'
);
SET @sql := IF(
  @fk_exists = 0,
  'ALTER TABLE `group_session_public_attendance_attempt` ADD CONSTRAINT `gspaa_user_fk` FOREIGN KEY (`resolved_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
