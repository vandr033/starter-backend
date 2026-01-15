-- CreateTable
CREATE TABLE `company` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(64) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `address` VARCHAR(255) NULL,
    `phone_prefix` VARCHAR(8) NULL,
    `phone` VARCHAR(32) NULL,
    `email` VARCHAR(191) NULL,
    `google_maps_url` VARCHAR(512) NULL,
    `timezone` VARCHAR(64) NOT NULL,
    `logo_url` VARCHAR(512) NULL,
    `home_hero_image_url` VARCHAR(512) NULL,
    `about_hero_image_url` VARCHAR(512) NULL,
    `about_image_1_url` VARCHAR(512) NULL,
    `about_image_2_url` VARCHAR(512) NULL,
    `about_image_3_url` VARCHAR(512) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `company_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `theme_config` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `company_id` BIGINT NOT NULL,
    `brand_color` VARCHAR(16) NOT NULL,
    `page_background_color` VARCHAR(16) NOT NULL,
    `page_background_preset` ENUM('light', 'soft', 'dark', 'auto') NOT NULL DEFAULT 'light',
    `cards_elevated` BOOLEAN NOT NULL DEFAULT true,
    `corner_radius` ENUM('sm', 'md', 'lg') NOT NULL DEFAULT 'md',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `theme_config_company_id_key`(`company_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `company_settings` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `company_id` BIGINT NOT NULL,
    `booking_buffer_minutes` INTEGER NOT NULL DEFAULT 10,
    `booking_time_granularity_minutes` INTEGER NOT NULL DEFAULT 5,
    `cancel_limit_minutes` INTEGER NOT NULL DEFAULT 120,
    `reschedule_limit_minutes` INTEGER NOT NULL DEFAULT 120,
    `allow_qr_payment` BOOLEAN NOT NULL DEFAULT true,
    `qr_image_url` VARCHAR(512) NULL,
    `allow_cash_payment` BOOLEAN NOT NULL DEFAULT true,
    `send_email_notifications` BOOLEAN NOT NULL DEFAULT true,
    `send_whatsapp_notifications` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `company_settings_company_id_key`(`company_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `first_name` VARCHAR(100) NOT NULL,
    `last_name` VARCHAR(100) NULL,
    `phone` VARCHAR(32) NULL,
    `avatar_url` VARCHAR(512) NULL,
    `is_super_admin` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `user_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `company_user` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `company_id` BIGINT NOT NULL,
    `user_id` BIGINT NOT NULL,
    `role` ENUM('OWNER', 'ADMIN', 'STAFF', 'CUSTOMER') NOT NULL,
    `is_primary_contact` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `company_user_user_id_idx`(`user_id`),
    INDEX `company_user_company_id_role_idx`(`company_id`, `role`),
    UNIQUE INDEX `company_user_company_id_user_id_role_key`(`company_id`, `user_id`, `role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `staff_profile` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `company_id` BIGINT NOT NULL,
    `user_id` BIGINT NOT NULL,
    `display_name` VARCHAR(191) NOT NULL,
    `bio` TEXT NULL,
    `image_url` VARCHAR(512) NULL,
    `is_bookable` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `staff_profile_company_id_is_bookable_idx`(`company_id`, `is_bookable`),
    UNIQUE INDEX `staff_profile_company_id_user_id_key`(`company_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_profile` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `company_id` BIGINT NOT NULL,
    `user_id` BIGINT NOT NULL,
    `notes` TEXT NULL,
    `preferred_staff_id` BIGINT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `customer_profile_preferred_staff_id_idx`(`preferred_staff_id`),
    UNIQUE INDEX `customer_profile_company_id_user_id_key`(`company_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `category` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `company_id` BIGINT NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `description` VARCHAR(255) NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `category_company_id_is_active_position_idx`(`company_id`, `is_active`, `position`),
    UNIQUE INDEX `category_company_id_slug_key`(`company_id`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subcategory` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `category_id` BIGINT NOT NULL,
    `company_id` BIGINT NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `description` VARCHAR(255) NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `subcategory_category_id_is_active_position_idx`(`category_id`, `is_active`, `position`),
    INDEX `subcategory_company_id_is_active_idx`(`company_id`, `is_active`),
    UNIQUE INDEX `subcategory_company_id_slug_key`(`company_id`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `company_id` BIGINT NOT NULL,
    `subcategory_id` BIGINT NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `price_cents` INTEGER NOT NULL,
    `duration_minutes` INTEGER NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `service_company_id_is_active_idx`(`company_id`, `is_active`),
    INDEX `service_subcategory_id_is_active_position_idx`(`subcategory_id`, `is_active`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hours` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `company_id` BIGINT NOT NULL,
    `day_of_week` INTEGER NOT NULL,
    `open_time` TIME(0) NULL,
    `close_time` TIME(0) NULL,
    `is_closed` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `hours_company_id_day_of_week_key`(`company_id`, `day_of_week`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `booking` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `company_id` BIGINT NOT NULL,
    `staff_id` BIGINT NOT NULL,
    `customer_id` BIGINT NULL,
    `client_name` VARCHAR(191) NULL,
    `client_email` VARCHAR(191) NULL,
    `client_phone_prefix` VARCHAR(8) NULL,
    `client_phone_number` VARCHAR(32) NULL,
    `booking_type` ENUM('CUSTOMER', 'BLOCK') NOT NULL DEFAULT 'CUSTOMER',
    `start_at` DATETIME(3) NOT NULL,
    `end_at` DATETIME(3) NOT NULL,
    `status` ENUM('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED') NOT NULL DEFAULT 'CONFIRMED',
    `payment_method` ENUM('NONE', 'CASH', 'QR') NOT NULL DEFAULT 'NONE',
    `payment_status` ENUM('UNPAID', 'PENDING_CONFIRMATION', 'PAID') NOT NULL DEFAULT 'UNPAID',
    `qr_proof_image_url` VARCHAR(512) NULL,
    `total_price_cents` INTEGER NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `created_by_user_id` BIGINT NULL,
    `updated_by_user_id` BIGINT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `booking_company_id_staff_id_start_at_status_idx`(`company_id`, `staff_id`, `start_at`, `status`),
    INDEX `booking_company_id_customer_id_start_at_idx`(`company_id`, `customer_id`, `start_at`),
    INDEX `booking_staff_id_start_at_end_at_status_idx`(`staff_id`, `start_at`, `end_at`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `booking_service` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `booking_id` BIGINT NOT NULL,
    `company_id` BIGINT NOT NULL,
    `service_id` BIGINT NOT NULL,
    `service_name_snapshot` VARCHAR(191) NOT NULL,
    `price_cents_snapshot` INTEGER NOT NULL,
    `duration_minutes_snapshot` INTEGER NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `booking_service_booking_id_idx`(`booking_id`),
    INDEX `booking_service_company_id_service_id_idx`(`company_id`, `service_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `discount_code` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `company_id` BIGINT NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `description` VARCHAR(255) NULL,
    `type` ENUM('PERCENT', 'FIXED') NOT NULL,
    `value` DECIMAL(10, 2) NOT NULL,
    `active_from` DATETIME(3) NULL,
    `active_until` DATETIME(3) NULL,
    `max_uses` INTEGER NULL,
    `used_count` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `discount_code_company_id_is_active_active_from_active_until_idx`(`company_id`, `is_active`, `active_from`, `active_until`),
    UNIQUE INDEX `discount_code_company_id_code_key`(`company_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `booking_discount` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `booking_id` BIGINT NOT NULL,
    `discount_code_id` BIGINT NOT NULL,
    `company_id` BIGINT NOT NULL,
    `discount_amount_cents` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `booking_discount_company_id_idx`(`company_id`),
    UNIQUE INDEX `booking_discount_booking_id_discount_code_id_key`(`booking_id`, `discount_code_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `config_message` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `company_id` BIGINT NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `description` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `config_message_company_id_key_key`(`company_id`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auth_session` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `company_id` BIGINT NULL,
    `refresh_token_hash` VARCHAR(255) NOT NULL,
    `issued_at` DATETIME(3) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `ip_address` VARCHAR(45) NULL,
    `user_agent` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `auth_session_refresh_token_hash_key`(`refresh_token_hash`),
    INDEX `auth_session_user_id_expires_at_idx`(`user_id`, `expires_at`),
    INDEX `auth_session_company_id_idx`(`company_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `theme_config` ADD CONSTRAINT `theme_config_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `company_settings` ADD CONSTRAINT `company_settings_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `company_user` ADD CONSTRAINT `company_user_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `company_user` ADD CONSTRAINT `company_user_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff_profile` ADD CONSTRAINT `staff_profile_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff_profile` ADD CONSTRAINT `staff_profile_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_profile` ADD CONSTRAINT `customer_profile_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_profile` ADD CONSTRAINT `customer_profile_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_profile` ADD CONSTRAINT `customer_profile_preferred_staff_id_fkey` FOREIGN KEY (`preferred_staff_id`) REFERENCES `staff_profile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `category` ADD CONSTRAINT `category_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subcategory` ADD CONSTRAINT `subcategory_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subcategory` ADD CONSTRAINT `subcategory_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service` ADD CONSTRAINT `service_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service` ADD CONSTRAINT `service_subcategory_id_fkey` FOREIGN KEY (`subcategory_id`) REFERENCES `subcategory`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hours` ADD CONSTRAINT `hours_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking` ADD CONSTRAINT `booking_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking` ADD CONSTRAINT `booking_staff_id_fkey` FOREIGN KEY (`staff_id`) REFERENCES `staff_profile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking` ADD CONSTRAINT `booking_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customer_profile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking` ADD CONSTRAINT `booking_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking` ADD CONSTRAINT `booking_updated_by_user_id_fkey` FOREIGN KEY (`updated_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_service` ADD CONSTRAINT `booking_service_booking_id_fkey` FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_service` ADD CONSTRAINT `booking_service_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_service` ADD CONSTRAINT `booking_service_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `service`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `discount_code` ADD CONSTRAINT `discount_code_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_discount` ADD CONSTRAINT `booking_discount_booking_id_fkey` FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_discount` ADD CONSTRAINT `booking_discount_discount_code_id_fkey` FOREIGN KEY (`discount_code_id`) REFERENCES `discount_code`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_discount` ADD CONSTRAINT `booking_discount_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `config_message` ADD CONSTRAINT `config_message_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auth_session` ADD CONSTRAINT `auth_session_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auth_session` ADD CONSTRAINT `auth_session_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
