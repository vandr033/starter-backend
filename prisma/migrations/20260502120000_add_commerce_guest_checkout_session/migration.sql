CREATE TABLE `commerce_guest_checkout_session` (
  `id` VARCHAR(191) NOT NULL,
  `company_id` INTEGER NOT NULL,
  `store_id` VARCHAR(191) NOT NULL,
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
  `email_delivery_succeeded` BOOLEAN NOT NULL DEFAULT FALSE,
  `phone_delivery_succeeded` BOOLEAN NOT NULL DEFAULT FALSE,
  `delivery_attempted_at` DATETIME(3) NULL,
  `consumed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `cgcs_company_store_consumed_idx`(`company_id`, `store_id`, `consumed_at`),
  INDEX `cgcs_email_phone_idx`(`email`, `phone_number`),
  INDEX `cgcs_user_idx`(`resolved_user_id`),
  INDEX `cgcs_otp_expires_idx`(`otp_expires_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `commerce_guest_checkout_session`
  ADD CONSTRAINT `commerce_guest_checkout_session_company_id_fkey`
    FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `commerce_guest_checkout_session_store_id_fkey`
    FOREIGN KEY (`store_id`) REFERENCES `commerce_store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `commerce_guest_checkout_session_resolved_user_id_fkey`
    FOREIGN KEY (`resolved_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
