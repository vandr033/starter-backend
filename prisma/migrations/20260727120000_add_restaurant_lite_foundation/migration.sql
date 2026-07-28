ALTER TABLE `company`
  ADD COLUMN `restaurant_enabled` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `restaurant_settings` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `average_dining_minutes` INTEGER NOT NULL DEFAULT 90,
  `slot_interval_minutes` INTEGER NOT NULL DEFAULT 30,
  `minimum_advance_minutes` INTEGER NOT NULL DEFAULT 60,
  `maximum_advance_days` INTEGER NOT NULL DEFAULT 30,
  `auto_confirm_reservations` BOOLEAN NOT NULL DEFAULT true,
  `allow_customer_cancellation` BOOLEAN NOT NULL DEFAULT true,
  `cancellation_limit_minutes` INTEGER NOT NULL DEFAULT 120,
  `minimum_party_size` INTEGER NOT NULL DEFAULT 1,
  `maximum_party_size` INTEGER NOT NULL DEFAULT 12,
  `require_phone` BOOLEAN NOT NULL DEFAULT true,
  `require_email` BOOLEAN NOT NULL DEFAULT false,
  `allow_walk_ins` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `restaurant_settings_company_id_key`(`company_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `restaurant_settings_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE `restaurant_dining_area` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `description` VARCHAR(500) NULL,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `restaurant_dining_area_company_name_key`(`company_id`, `name`),
  INDEX `restaurant_dining_area_company_id_idx`(`company_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `restaurant_dining_area_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE `restaurant_table` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `dining_area_id` INTEGER NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `minimum_seats` INTEGER NOT NULL DEFAULT 1,
  `maximum_seats` INTEGER NOT NULL,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `restaurant_table_area_name_key`(`dining_area_id`, `name`),
  INDEX `restaurant_table_company_id_idx`(`company_id`),
  INDEX `restaurant_table_dining_area_id_idx`(`dining_area_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `restaurant_table_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `restaurant_table_dining_area_id_fkey` FOREIGN KEY (`dining_area_id`) REFERENCES `restaurant_dining_area`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE `restaurant_service_period` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `day_of_week` INTEGER NOT NULL,
  `name` VARCHAR(120) NULL,
  `start_time` VARCHAR(5) NOT NULL,
  `end_time` VARCHAR(5) NOT NULL,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `restaurant_service_period_company_day_idx`(`company_id`, `day_of_week`),
  PRIMARY KEY (`id`),
  CONSTRAINT `restaurant_service_period_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
);
