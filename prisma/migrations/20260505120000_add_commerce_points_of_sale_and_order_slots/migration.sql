ALTER TABLE `commerce_store`
  ADD COLUMN `order_slots_enabled` BOOLEAN NOT NULL DEFAULT FALSE AFTER `max_schedule_days_ahead`;

CREATE TABLE `commerce_point_of_sale` (
  `id` VARCHAR(191) NOT NULL,
  `company_id` INTEGER NOT NULL,
  `store_id` VARCHAR(191) NULL,
  `name` VARCHAR(120) NOT NULL,
  `address` VARCHAR(255) NOT NULL,
  `latitude` DOUBLE NOT NULL,
  `longitude` DOUBLE NOT NULL,
  `google_maps_url` VARCHAR(512) NOT NULL,
  `notes` TEXT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  INDEX `commerce_pos_company_idx`(`company_id`),
  INDEX `commerce_pos_company_active_idx`(`company_id`, `is_active`),
  INDEX `commerce_pos_store_idx`(`store_id`),
  CONSTRAINT `commerce_point_of_sale_company_id_fkey`
    FOREIGN KEY (`company_id`) REFERENCES `company`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `commerce_point_of_sale_store_id_fkey`
    FOREIGN KEY (`store_id`) REFERENCES `commerce_store`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_order_schedule_slot` (
  `id` VARCHAR(191) NOT NULL,
  `company_id` INTEGER NOT NULL,
  `store_id` VARCHAR(191) NOT NULL,
  `day_of_week` INTEGER NOT NULL,
  `start_time` VARCHAR(8) NOT NULL,
  `end_time` VARCHAR(8) NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  INDEX `commerce_order_slot_company_idx`(`company_id`),
  INDEX `commerce_order_slot_company_active_idx`(`company_id`, `is_active`),
  INDEX `commerce_order_slot_store_idx`(`store_id`),
  INDEX `commerce_order_slot_store_day_active_idx`(`store_id`, `day_of_week`, `is_active`),
  CONSTRAINT `commerce_order_schedule_slot_company_id_fkey`
    FOREIGN KEY (`company_id`) REFERENCES `company`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `commerce_order_schedule_slot_store_id_fkey`
    FOREIGN KEY (`store_id`) REFERENCES `commerce_store`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
