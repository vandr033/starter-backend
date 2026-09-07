-- Durable WhatsApp outbox batches and jobs.
-- Jobs are retained across backend/worker restarts and claimed with a lease.

CREATE TABLE `outbound_message_batch` (
    `id` VARCHAR(30) NOT NULL,
    `company_id` INTEGER NULL,
    `channel` ENUM('WHATSAPP') NOT NULL,
    `source_type` VARCHAR(64) NOT NULL,
    `source_id` VARCHAR(191) NULL,
    `idempotency_key` VARCHAR(191) NOT NULL,
    `created_by_user_id` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`),
    INDEX `outbound_batch_company_created_idx` (`company_id`, `created_at`),
    INDEX `outbound_batch_source_idx` (`source_type`, `source_id`),
    UNIQUE INDEX `outbound_message_batch_idempotency_key_key` (`idempotency_key`),
    CONSTRAINT `outbound_message_batch_company_id_fkey`
        FOREIGN KEY (`company_id`) REFERENCES `company`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `outbound_message_job` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NULL,
    `channel` ENUM('WHATSAPP') NOT NULL,
    `message_type` ENUM('TEXT', 'IMAGE') NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'EXPIRED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `recipient` VARCHAR(255) NOT NULL,
    `payload` JSON NOT NULL,
    `source_type` VARCHAR(64) NOT NULL,
    `source_id` VARCHAR(191) NULL,
    `batch_id` VARCHAR(30) NULL,
    `dedupe_key` VARCHAR(128) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `max_attempts` INTEGER NOT NULL DEFAULT 8,
    `next_attempt_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `locked_at` DATETIME(3) NULL,
    `lock_owner` VARCHAR(191) NULL,
    `last_error_code` VARCHAR(64) NULL,
    `last_error_message` VARCHAR(500) NULL,
    `provider_message_id` VARCHAR(255) NULL,
    `expires_at` DATETIME(3) NULL,
    `sent_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`),
    UNIQUE INDEX `outbound_message_job_dedupe_key_key` (`dedupe_key`),
    INDEX `outbound_job_status_retry_idx` (`status`, `next_attempt_at`),
    INDEX `outbound_job_company_status_idx` (`company_id`, `status`),
    INDEX `outbound_job_source_idx` (`source_type`, `source_id`),
    INDEX `outbound_job_batch_idx` (`batch_id`),
    CONSTRAINT `outbound_message_job_company_id_fkey`
        FOREIGN KEY (`company_id`) REFERENCES `company`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `outbound_message_job_batch_id_fkey`
        FOREIGN KEY (`batch_id`) REFERENCES `outbound_message_batch`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
