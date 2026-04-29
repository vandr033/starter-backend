ALTER TABLE `business_pricing_bundle_discount_tier`
  ADD COLUMN `sort_order` INTEGER NOT NULL DEFAULT 0;

CREATE INDEX `business_pricing_bundle_discount_active_sort_order_idx`
  ON `business_pricing_bundle_discount_tier`(`is_active`, `sort_order`);

ALTER TABLE `service`
  ADD COLUMN `is_multi_session` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `session_count` INTEGER NULL,
  ADD COLUMN `session_duration_minutes` INTEGER NULL;

CREATE TABLE `booking_group` (
  `id` VARCHAR(191) NOT NULL,
  `company_id` INTEGER NOT NULL,
  `customer_id` INTEGER NULL,
  `group_type` VARCHAR(64) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  `metadata` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `booking_group_company_type_idx`(`company_id`, `group_type`),
  INDEX `booking_group_customer_id_idx`(`customer_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `booking`
  ADD COLUMN `booking_group_id` VARCHAR(191) NULL,
  ADD COLUMN `session_index` INTEGER NULL,
  ADD COLUMN `session_count` INTEGER NULL;

CREATE INDEX `booking_booking_group_id_idx` ON `booking`(`booking_group_id`);

ALTER TABLE `booking_group`
  ADD CONSTRAINT `booking_group_company_id_fkey`
    FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `booking_group_customer_id_fkey`
    FOREIGN KEY (`customer_id`) REFERENCES `customer_profile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `booking`
  ADD CONSTRAINT `booking_booking_group_id_fkey`
    FOREIGN KEY (`booking_group_id`) REFERENCES `booking_group`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
