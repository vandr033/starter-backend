CREATE TABLE `installment_reminder_log` (
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

CREATE INDEX `enrollment_installment_payment_status_due_date_idx`
    ON `enrollment_installment`(`payment_status`, `due_date`);

ALTER TABLE `installment_reminder_log`
    ADD CONSTRAINT `installment_reminder_log_company_id_fkey`
        FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `installment_reminder_log_enrollment_id_fkey`
        FOREIGN KEY (`enrollment_id`) REFERENCES `group_class_enrollment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `installment_reminder_log_installment_id_fkey`
        FOREIGN KEY (`installment_id`) REFERENCES `enrollment_installment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `installment_reminder_log_sent_by_admin_id_fkey`
        FOREIGN KEY (`sent_by_admin_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
