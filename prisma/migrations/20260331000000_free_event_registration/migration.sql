-- Migration: free_event_registration
-- Adds gender/age to user and creates free_event_registration table.
-- All statements are idempotent (safe to re-run on production).

-- 1. Add gender to user
SET @user_gender_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user' AND COLUMN_NAME = 'gender'
);
SET @sql := IF(@user_gender_exists = 0,
  'ALTER TABLE `user` ADD COLUMN `gender` VARCHAR(30) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. Add age to user
SET @user_age_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user' AND COLUMN_NAME = 'age'
);
SET @sql := IF(@user_age_exists = 0,
  'ALTER TABLE `user` ADD COLUMN `age` INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Create free_event_registration table
CREATE TABLE IF NOT EXISTS `free_event_registration` (
  `id`                          INTEGER NOT NULL AUTO_INCREMENT,
  `group_event_id`              INTEGER NOT NULL,
  `company_id`                  INTEGER NOT NULL,
  `user_id`                     VARCHAR(191) NULL,
  `first_name`                  VARCHAR(100) NOT NULL,
  `last_name`                   VARCHAR(100) NOT NULL,
  `gender`                      ENUM('MALE','FEMALE','OTHER','PREFER_NOT_TO_SAY') NOT NULL,
  `age`                         INTEGER NOT NULL,
  `email`                       VARCHAR(254) NOT NULL,
  `phone_prefix`                VARCHAR(8) NOT NULL,
  `phone_number`                VARCHAR(32) NOT NULL,
  `tos_accepted`                TINYINT(1) NOT NULL DEFAULT 0,
  `source`                      VARCHAR(50) NOT NULL DEFAULT 'free_event_form',
  `status`                      ENUM('CONFIRMED','PENDING','INTERESTED') NOT NULL DEFAULT 'CONFIRMED',
  `create_account_requested`    TINYINT(1) NOT NULL DEFAULT 0,
  `account_created`             TINYINT(1) NOT NULL DEFAULT 0,
  `account_verification_status` ENUM('NOT_REQUESTED','PENDING_VERIFICATION','VERIFIED') NOT NULL DEFAULT 'NOT_REQUESTED',
  `created_at`                  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`                  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `free_event_registration_event_email_key` (`group_event_id`, `email`),
  INDEX `free_event_registration_event_status_idx` (`group_event_id`, `status`),
  INDEX `free_event_registration_company_event_idx` (`company_id`, `group_event_id`),
  INDEX `free_event_registration_user_id_idx` (`user_id`),
  CONSTRAINT `free_event_registration_group_event_id_fkey`
    FOREIGN KEY (`group_event_id`) REFERENCES `group_event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `free_event_registration_company_id_fkey`
    FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `free_event_registration_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
