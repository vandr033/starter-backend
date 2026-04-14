CREATE TABLE `commerce_settings` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `store_enabled` BOOLEAN NOT NULL DEFAULT false,
  `supports_pickup` BOOLEAN NOT NULL DEFAULT true,
  `supports_delivery` BOOLEAN NOT NULL DEFAULT false,
  `qr_payment_enabled` BOOLEAN NOT NULL DEFAULT true,
  `qr_image_url` VARCHAR(512) NULL,
  `support_phone` VARCHAR(32) NULL,
  `asap_orders_enabled` BOOLEAN NOT NULL DEFAULT true,
  `scheduled_orders_enabled` BOOLEAN NOT NULL DEFAULT false,
  `hero_title` VARCHAR(191) NULL,
  `hero_subtitle` VARCHAR(500) NULL,
  `banner_image_url` VARCHAR(512) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `commerce_settings_company_id_key`(`company_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_category` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `commerce_category_company_id_slug_key`(`company_id`, `slug`),
  INDEX `commerce_category_company_active_sort_idx`(`company_id`, `is_active`, `sort_order`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_product` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `category_id` INTEGER NULL,
  `name` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `regular_price_cents` INTEGER NOT NULL,
  `promotional_price_cents` INTEGER NULL,
  `stock_quantity` INTEGER NOT NULL DEFAULT 0,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `is_featured` BOOLEAN NOT NULL DEFAULT false,
  `is_combo` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `commerce_product_company_id_slug_key`(`company_id`, `slug`),
  INDEX `commerce_product_company_active_featured_idx`(`company_id`, `is_active`, `is_featured`),
  INDEX `commerce_product_company_category_active_idx`(`company_id`, `category_id`, `is_active`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_product_image` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `product_id` INTEGER NOT NULL,
  `image_url` VARCHAR(512) NOT NULL,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `commerce_product_image_product_sort_idx`(`product_id`, `sort_order`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_point_of_sale` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `city` VARCHAR(128) NOT NULL,
  `google_maps_link` VARCHAR(512) NULL,
  `opening_hours_text` TEXT NULL,
  `support_phone` VARCHAR(32) NULL,
  `pickup_enabled` BOOLEAN NOT NULL DEFAULT true,
  `delivery_enabled` BOOLEAN NOT NULL DEFAULT false,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `commerce_pos_company_active_idx`(`company_id`, `is_active`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_order` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `customer_profile_id` INTEGER NULL,
  `guest_name` VARCHAR(191) NOT NULL,
  `guest_phone_prefix` VARCHAR(8) NULL,
  `guest_phone` VARCHAR(32) NULL,
  `guest_email` VARCHAR(191) NULL,
  `delivery_address` VARCHAR(512) NULL,
  `delivery_instructions` TEXT NULL,
  `point_of_sale_id` INTEGER NULL,
  `fulfillment_type` ENUM('PICKUP', 'DELIVERY') NOT NULL,
  `order_type` ENUM('ASAP', 'SCHEDULED') NOT NULL,
  `scheduled_date` DATETIME(3) NULL,
  `scheduled_timeframe` VARCHAR(100) NULL,
  `status` ENUM('NEW', 'SCHEDULED', 'ASSIGNED', 'IN_PROCESS', 'READY', 'SENT', 'DELIVERED', 'CANCELLED') NOT NULL DEFAULT 'NEW',
  `payment_method` ENUM('NONE', 'CASH', 'QR') NOT NULL DEFAULT 'QR',
  `payment_status` ENUM('UNPAID', 'PENDING_CONFIRMATION', 'PAID', 'REJECTED') NOT NULL DEFAULT 'PENDING_CONFIRMATION',
  `subtotal_cents` INTEGER NOT NULL,
  `discount_total_cents` INTEGER NOT NULL DEFAULT 0,
  `total_cents` INTEGER NOT NULL,
  `assigned_staff_id` INTEGER NULL,
  `tracking_link` VARCHAR(1024) NULL,
  `support_phone_snapshot` VARCHAR(32) NULL,
  `notes` TEXT NULL,
  `internal_notes` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `cancelled_at` DATETIME(3) NULL,
  INDEX `commerce_order_company_status_created_idx`(`company_id`, `status`, `created_at`),
  INDEX `commerce_order_company_staff_status_idx`(`company_id`, `assigned_staff_id`, `status`),
  INDEX `commerce_order_company_pos_created_idx`(`company_id`, `point_of_sale_id`, `created_at`),
  INDEX `commerce_order_customer_profile_idx`(`customer_profile_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_order_item` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `order_id` INTEGER NOT NULL,
  `product_id` INTEGER NULL,
  `product_name_snapshot` VARCHAR(191) NOT NULL,
  `unit_price_cents_snapshot` INTEGER NOT NULL,
  `promotional_unit_price_cents_snapshot` INTEGER NULL,
  `quantity` INTEGER NOT NULL,
  `subtotal_cents` INTEGER NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `commerce_order_item_order_idx`(`order_id`),
  INDEX `commerce_order_item_product_idx`(`product_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_stock_movement` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `product_id` INTEGER NOT NULL,
  `order_id` INTEGER NULL,
  `movement_type` ENUM('IN', 'OUT', 'ADJUSTMENT', 'RESTORE') NOT NULL,
  `quantity` INTEGER NOT NULL,
  `reason` VARCHAR(255) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_by_id` VARCHAR(191) NULL,
  INDEX `commerce_stock_movement_company_product_created_idx`(`company_id`, `product_id`, `created_at`),
  INDEX `commerce_stock_movement_order_idx`(`order_id`),
  INDEX `commerce_stock_movement_created_by_idx`(`created_by_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_delivery_availability_rule` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `weekday` INTEGER NOT NULL,
  `delivery_enabled` BOOLEAN NOT NULL DEFAULT false,
  `asap_enabled` BOOLEAN NOT NULL DEFAULT false,
  `scheduled_enabled` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `commerce_delivery_availability_rule_company_id_weekday_key`(`company_id`, `weekday`),
  INDEX `commerce_delivery_rule_company_idx`(`company_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_schedule_window` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `rule_id` INTEGER NOT NULL,
  `label` VARCHAR(100) NOT NULL,
  `start_time` VARCHAR(8) NULL,
  `end_time` VARCHAR(8) NULL,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `commerce_schedule_window_rule_sort_idx`(`rule_id`, `sort_order`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `commerce_settings`
  ADD CONSTRAINT `commerce_settings_company_id_fkey`
  FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `commerce_category`
  ADD CONSTRAINT `commerce_category_company_id_fkey`
  FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `commerce_product`
  ADD CONSTRAINT `commerce_product_company_id_fkey`
  FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `commerce_product_category_id_fkey`
  FOREIGN KEY (`category_id`) REFERENCES `commerce_category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `commerce_product_image`
  ADD CONSTRAINT `commerce_product_image_product_id_fkey`
  FOREIGN KEY (`product_id`) REFERENCES `commerce_product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `commerce_point_of_sale`
  ADD CONSTRAINT `commerce_point_of_sale_company_id_fkey`
  FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `commerce_order`
  ADD CONSTRAINT `commerce_order_company_id_fkey`
  FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `commerce_order_customer_profile_id_fkey`
  FOREIGN KEY (`customer_profile_id`) REFERENCES `customer_profile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `commerce_order_point_of_sale_id_fkey`
  FOREIGN KEY (`point_of_sale_id`) REFERENCES `commerce_point_of_sale`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `commerce_order_assigned_staff_id_fkey`
  FOREIGN KEY (`assigned_staff_id`) REFERENCES `staff_profile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `commerce_order_item`
  ADD CONSTRAINT `commerce_order_item_order_id_fkey`
  FOREIGN KEY (`order_id`) REFERENCES `commerce_order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `commerce_order_item_product_id_fkey`
  FOREIGN KEY (`product_id`) REFERENCES `commerce_product`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `commerce_stock_movement`
  ADD CONSTRAINT `commerce_stock_movement_company_id_fkey`
  FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `commerce_stock_movement_product_id_fkey`
  FOREIGN KEY (`product_id`) REFERENCES `commerce_product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `commerce_stock_movement_order_id_fkey`
  FOREIGN KEY (`order_id`) REFERENCES `commerce_order`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `commerce_stock_movement_created_by_id_fkey`
  FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `commerce_delivery_availability_rule`
  ADD CONSTRAINT `commerce_delivery_availability_rule_company_id_fkey`
  FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `commerce_schedule_window`
  ADD CONSTRAINT `commerce_schedule_window_rule_id_fkey`
  FOREIGN KEY (`rule_id`) REFERENCES `commerce_delivery_availability_rule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
