CREATE TABLE IF NOT EXISTS `enrollment_installment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `enrollment_id` INTEGER NOT NULL,
    `installment_number` INTEGER NOT NULL,
    `due_date` DATE NOT NULL,
    `amount_cents` INTEGER NOT NULL,
    `payment_status` ENUM('UNPAID', 'PENDING_CONFIRMATION', 'PAID', 'REJECTED') NOT NULL DEFAULT 'UNPAID',
    `payment_method` ENUM('NONE', 'CASH', 'QR') NOT NULL DEFAULT 'NONE',
    `qr_proof_image_url` VARCHAR(512) NULL,
    `paid_at` DATETIME(3) NULL,
    `marked_paid_by_admin_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `enrollment_installment_enrollment_id_installment_number_key`(`enrollment_id`, `installment_number`),
    INDEX `enrollment_installment_enrollment_id_idx`(`enrollment_id`),
    INDEX `enrollment_installment_payment_status_due_date_idx`(`payment_status`, `due_date`),
    INDEX `enrollment_installment_marked_paid_by_admin_id_idx`(`marked_paid_by_admin_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `installment_reminder_log` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `enrollment_id` INTEGER NOT NULL,
    `installment_id` INTEGER NOT NULL,
    `sent_by_admin_id` VARCHAR(191) NULL,
    `channel` VARCHAR(16) NOT NULL,
    `recipient_email` VARCHAR(191) NULL,
    `recipient_phone` VARCHAR(32) NULL,
    `message_subject` VARCHAR(255) NULL,
    `message_body` TEXT NULL,
    `sent_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `installment_reminder_log_company_id_sent_at_idx`(`company_id`, `sent_at`),
    INDEX `installment_reminder_log_enrollment_id_sent_at_idx`(`enrollment_id`, `sent_at`),
    INDEX `installment_reminder_log_installment_id_sent_at_idx`(`installment_id`, `sent_at`),
    INDEX `installment_reminder_log_sent_by_admin_id_idx`(`sent_by_admin_id`),
    INDEX `installment_reminder_log_channel_sent_at_idx`(`channel`, `sent_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @idx := (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'enrollment_installment'
      AND INDEX_NAME = 'enrollment_installment_enrollment_id_installment_number_key'
);
SET @sql := IF(
    @idx = 0,
    'CREATE UNIQUE INDEX `enrollment_installment_enrollment_id_installment_number_key` ON `enrollment_installment`(`enrollment_id`, `installment_number`)',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'enrollment_installment'
      AND INDEX_NAME = 'enrollment_installment_enrollment_id_idx'
);
SET @sql := IF(
    @idx = 0,
    'CREATE INDEX `enrollment_installment_enrollment_id_idx` ON `enrollment_installment`(`enrollment_id`)',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'enrollment_installment'
      AND INDEX_NAME = 'enrollment_installment_payment_status_due_date_idx'
);
SET @sql := IF(
    @idx = 0,
    'CREATE INDEX `enrollment_installment_payment_status_due_date_idx` ON `enrollment_installment`(`payment_status`, `due_date`)',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (
    SELECT COUNT(*)
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'enrollment_installment'
      AND CONSTRAINT_NAME = 'enrollment_installment_enrollment_id_fkey'
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql := IF(
    @fk = 0,
    'ALTER TABLE `enrollment_installment` ADD CONSTRAINT `enrollment_installment_enrollment_id_fkey` FOREIGN KEY (`enrollment_id`) REFERENCES `group_class_enrollment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (
    SELECT COUNT(*)
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'enrollment_installment'
      AND CONSTRAINT_NAME = 'enrollment_installment_marked_paid_by_admin_id_fkey'
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql := IF(
    @fk = 0,
    'ALTER TABLE `enrollment_installment` ADD CONSTRAINT `enrollment_installment_marked_paid_by_admin_id_fkey` FOREIGN KEY (`marked_paid_by_admin_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'enrollment_installment'
      AND INDEX_NAME = 'enrollment_installment_marked_paid_by_admin_id_idx'
);
SET @sql := IF(
    @idx = 0,
    'CREATE INDEX `enrollment_installment_marked_paid_by_admin_id_idx` ON `enrollment_installment`(`marked_paid_by_admin_id`)',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (
    SELECT COUNT(*)
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'installment_reminder_log'
      AND CONSTRAINT_NAME = 'installment_reminder_log_company_id_fkey'
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql := IF(
    @fk = 0,
    'ALTER TABLE `installment_reminder_log` ADD CONSTRAINT `installment_reminder_log_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (
    SELECT COUNT(*)
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'installment_reminder_log'
      AND CONSTRAINT_NAME = 'installment_reminder_log_enrollment_id_fkey'
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql := IF(
    @fk = 0,
    'ALTER TABLE `installment_reminder_log` ADD CONSTRAINT `installment_reminder_log_enrollment_id_fkey` FOREIGN KEY (`enrollment_id`) REFERENCES `group_class_enrollment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (
    SELECT COUNT(*)
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'installment_reminder_log'
      AND CONSTRAINT_NAME = 'installment_reminder_log_installment_id_fkey'
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql := IF(
    @fk = 0,
    'ALTER TABLE `installment_reminder_log` ADD CONSTRAINT `installment_reminder_log_installment_id_fkey` FOREIGN KEY (`installment_id`) REFERENCES `enrollment_installment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (
    SELECT COUNT(*)
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'installment_reminder_log'
      AND CONSTRAINT_NAME = 'installment_reminder_log_sent_by_admin_id_fkey'
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql := IF(
    @fk = 0,
    'ALTER TABLE `installment_reminder_log` ADD CONSTRAINT `installment_reminder_log_sent_by_admin_id_fkey` FOREIGN KEY (`sent_by_admin_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
