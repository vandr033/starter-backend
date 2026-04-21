ALTER TABLE `group_event`
  ADD COLUMN `capacity_visible` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `group_class`
  ADD COLUMN `capacity_visible` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `group_class_interest` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `group_class_id` INTEGER NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `customer_profile_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `group_class_interest_group_class_id_user_id_key`(`group_class_id`, `user_id`),
  INDEX `group_class_interest_company_id_group_class_id_idx`(`company_id`, `group_class_id`),
  INDEX `group_class_interest_customer_profile_id_idx`(`customer_profile_id`),
  INDEX `group_class_interest_user_id_idx`(`user_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `group_class_guest_enrollment_session` (
  `id` VARCHAR(191) NOT NULL,
  `company_id` INTEGER NOT NULL,
  `group_class_id` INTEGER NOT NULL,
  `resolved_user_id` VARCHAR(191) NULL,
  `full_name` VARCHAR(191) NOT NULL,
  `first_name` VARCHAR(100) NULL,
  `last_name` VARCHAR(100) NULL,
  `email` VARCHAR(254) NOT NULL,
  `phone_prefix` VARCHAR(8) NOT NULL,
  `phone_number` VARCHAR(32) NOT NULL,
  `account_outcome` VARCHAR(64) NOT NULL,
  `otp_hash` VARCHAR(255) NOT NULL,
  `otp_attempts` INTEGER NOT NULL DEFAULT 0,
  `otp_max_attempts` INTEGER NOT NULL DEFAULT 5,
  `otp_expires_at` DATETIME(3) NOT NULL,
  `resend_available_at` DATETIME(3) NOT NULL,
  `email_delivery_succeeded` BOOLEAN NOT NULL DEFAULT false,
  `phone_delivery_succeeded` BOOLEAN NOT NULL DEFAULT false,
  `delivery_attempted_at` DATETIME(3) NULL,
  `consumed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `gcges_company_class_consumed_idx`(`company_id`, `group_class_id`, `consumed_at`),
  INDEX `gcges_email_phone_idx`(`email`, `phone_number`),
  INDEX `gcges_user_idx`(`resolved_user_id`),
  INDEX `gcges_otp_expires_idx`(`otp_expires_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `group_class_interest`
  ADD CONSTRAINT `group_class_interest_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `group_class_interest_group_class_id_fkey` FOREIGN KEY (`group_class_id`) REFERENCES `group_class`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `group_class_interest_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `group_class_interest_customer_profile_id_fkey` FOREIGN KEY (`customer_profile_id`) REFERENCES `customer_profile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `group_class_guest_enrollment_session`
  ADD CONSTRAINT `group_class_guest_enrollment_session_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `group_class_guest_enrollment_session_group_class_id_fkey` FOREIGN KEY (`group_class_id`) REFERENCES `group_class`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `group_class_guest_enrollment_session_resolved_user_id_fkey` FOREIGN KEY (`resolved_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
