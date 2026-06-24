CREATE TABLE `booking_audit_log` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `booking_id` INTEGER NOT NULL,
    `action` VARCHAR(64) NOT NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `old_start_at` DATETIME(3) NULL,
    `old_end_at` DATETIME(3) NULL,
    `new_start_at` DATETIME(3) NULL,
    `new_end_at` DATETIME(3) NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `booking_audit_company_booking_created_idx`(`company_id`, `booking_id`, `created_at`),
    INDEX `booking_audit_actor_user_id_idx`(`actor_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `booking_notification_attempt` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `booking_id` INTEGER NOT NULL,
    `audit_log_id` INTEGER NULL,
    `event` VARCHAR(64) NOT NULL,
    `recipient_type` VARCHAR(32) NOT NULL,
    `recipient_user_id` VARCHAR(191) NULL,
    `channel` VARCHAR(16) NOT NULL,
    `target` VARCHAR(255) NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    `reason` VARCHAR(255) NULL,
    `attempt_count` INTEGER NOT NULL DEFAULT 0,
    `next_retry_at` DATETIME(3) NULL,
    `last_attempted_at` DATETIME(3) NULL,
    `sent_at` DATETIME(3) NULL,
    `payload` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `booking_notification_company_booking_idx`(`company_id`, `booking_id`, `created_at`),
    INDEX `booking_notification_status_retry_idx`(`status`, `next_retry_at`),
    INDEX `booking_notification_audit_log_idx`(`audit_log_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `booking_audit_log`
    ADD CONSTRAINT `booking_audit_log_company_id_fkey`
    FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `booking_audit_log`
    ADD CONSTRAINT `booking_audit_log_booking_id_fkey`
    FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `booking_notification_attempt`
    ADD CONSTRAINT `booking_notification_attempt_company_id_fkey`
    FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `booking_notification_attempt`
    ADD CONSTRAINT `booking_notification_attempt_booking_id_fkey`
    FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `booking_notification_attempt`
    ADD CONSTRAINT `booking_notification_attempt_audit_log_id_fkey`
    FOREIGN KEY (`audit_log_id`) REFERENCES `booking_audit_log`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
