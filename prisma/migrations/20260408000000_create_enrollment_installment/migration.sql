-- Repair the migration chain before 20260409120000_group_installment_payments.
-- The reminder-log migration references this table, so fresh MySQL deploys
-- must create it first. IF NOT EXISTS also keeps databases that already have
-- the table (from an out-of-band repair) compatible.
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
    INDEX `enrollment_installment_marked_paid_by_admin_id_idx`(`marked_paid_by_admin_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @constraint_exists := (
    SELECT COUNT(*)
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'enrollment_installment'
      AND CONSTRAINT_NAME = 'enrollment_installment_enrollment_id_fkey'
);
SET @sql := IF(
    @constraint_exists = 0,
    'ALTER TABLE `enrollment_installment` ADD CONSTRAINT `enrollment_installment_enrollment_id_fkey` FOREIGN KEY (`enrollment_id`) REFERENCES `group_class_enrollment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @constraint_exists := (
    SELECT COUNT(*)
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'enrollment_installment'
      AND CONSTRAINT_NAME = 'enrollment_installment_marked_paid_by_admin_id_fkey'
);
SET @sql := IF(
    @constraint_exists = 0,
    'ALTER TABLE `enrollment_installment` ADD CONSTRAINT `enrollment_installment_marked_paid_by_admin_id_fkey` FOREIGN KEY (`marked_paid_by_admin_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
