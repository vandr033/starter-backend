-- Phase 1: persisted, single-use public upload intents.
-- The token is signed by the application and this table provides durable replay protection.
CREATE TABLE `upload_intent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `purpose` VARCHAR(64) NOT NULL,
    `context_id` VARCHAR(191) NULL,
    `nonce` VARCHAR(64) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `max_bytes` INTEGER NOT NULL,
    `allowed_mime_types` JSON NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `consumed_at` DATETIME(3) NULL,
    `stored_path` VARCHAR(512) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`),
    UNIQUE INDEX `upload_intent_nonce_key` (`nonce`),
    UNIQUE INDEX `upload_intent_token_hash_key` (`token_hash`),
    UNIQUE INDEX `upload_intent_stored_path_key` (`stored_path`),
    INDEX `upload_intent_company_purpose_context_idx` (`company_id`, `purpose`, `context_id`),
    INDEX `upload_intent_expires_at_idx` (`expires_at`),
    CONSTRAINT `upload_intent_company_id_fkey`
        FOREIGN KEY (`company_id`) REFERENCES `company`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
