CREATE TABLE `demo_session` (
    `id` VARCHAR(191) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `profile` VARCHAR(32) NOT NULL,
    `company_id` INTEGER NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    UNIQUE INDEX `demo_session_token_hash_key`(`token_hash`),
    INDEX `demo_session_company_expires_idx`(`company_id`, `expires_at`),
    INDEX `demo_session_user_expires_idx`(`user_id`, `expires_at`),
    PRIMARY KEY (`id`),
    CONSTRAINT `demo_session_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `demo_session_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
