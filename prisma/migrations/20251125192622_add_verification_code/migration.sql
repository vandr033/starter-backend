/*
  Warnings:

  - You are about to drop the `email_verification_code` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `phone_verification` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `email_verification_code` DROP FOREIGN KEY `email_verification_code_userId_fkey`;

-- DropForeignKey
ALTER TABLE `phone_verification` DROP FOREIGN KEY `phone_verification_userId_fkey`;

-- DropTable
DROP TABLE `email_verification_code`;

-- DropTable
DROP TABLE `phone_verification`;

-- CreateTable
CREATE TABLE `verification_code` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `channel` ENUM('EMAIL', 'WHATSAPP') NOT NULL,
    `purpose` ENUM('CUSTOMER_SIGNUP') NOT NULL,
    `identifier` VARCHAR(191) NOT NULL,
    `code_hash` VARCHAR(255) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `max_attempts` INTEGER NOT NULL DEFAULT 5,
    `expires_at` DATETIME(3) NOT NULL,
    `consumed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `verification_code_identifier_channel_purpose_expires_at_idx`(`identifier`, `channel`, `purpose`, `expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
