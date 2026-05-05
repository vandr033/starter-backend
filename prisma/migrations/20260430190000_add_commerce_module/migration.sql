ALTER TABLE `product_catalog`
  MODIFY `code` ENUM(
    'RESERVAS',
    'EVENTOS',
    'CLASES',
    'STORES',
    'PERSONALIZACION',
    'CRM',
    'MENSAJERIA',
    'METRICAS',
    'MARKETPLACE'
  ) NOT NULL;

ALTER TABLE `product_tier`
  MODIFY `code` ENUM(
    'RESERVAS_BASE',
    'RESERVAS_PRO',
    'EVENTOS_BASE',
    'EVENTOS_PRO',
    'CLASES_BASE',
    'CLASES_PRO',
    'STORES_BASE',
    'STORES_PRO',
    'PERSONALIZACION_BASE',
    'PERSONALIZACION_PLUS',
    'CRM_BASE',
    'CRM_PRO',
    'MENSAJERIA_BASE',
    'MENSAJERIA_PRO',
    'METRICAS_BASE',
    'METRICAS_PRO',
    'MARKETPLACE_PLUS'
  ) NOT NULL;

ALTER TABLE `product_tier_capability`
  MODIFY `capability` ENUM(
    'RESERVAS_BASE',
    'RESERVAS_PRO',
    'RESERVAS_SERVICE_PROMOTIONS',
    'EVENTOS_BASE',
    'EVENTOS_PRO',
    'CLASES_BASE',
    'CLASES_PRO',
    'COMMERCE_ACCESS',
    'COMMERCE_PRODUCTS',
    'COMMERCE_CATEGORIES',
    'COMMERCE_STOCK',
    'COMMERCE_ORDERS',
    'COMMERCE_PICKUP',
    'COMMERCE_DELIVERY',
    'COMMERCE_SCHEDULED_ORDERS',
    'COMMERCE_COMBOS',
    'COMMERCE_PROMOTIONS',
    'COMMERCE_STAFF_ASSIGNMENT',
    'COMMERCE_METRICS',
    'CRM_BASE',
    'CRM_PRO',
    'CRM_IMPORT_EXPORT',
    'CRM_SEGMENTATION',
    'CRM_REACTIVATION',
    'MENSAJERIA_BASE',
    'MENSAJERIA_PRO',
    'MENSAJERIA_REMINDERS',
    'MENSAJERIA_BULK_WHATSAPP',
    'MENSAJERIA_REVIEW_REQUESTS',
    'MENSAJERIA_CAMPAIGNS',
    'PERSONALIZACION_BASE',
    'PERSONALIZACION_PLUS',
    'STOREFRONT_ADVANCED_CTA',
    'STOREFRONT_SECTION_ORDER',
    'STOREFRONT_FOOTER_CUSTOMIZATION',
    'STOREFRONT_ANNOUNCEMENT_BANNERS',
    'METRICAS_BASE',
    'METRICAS_PRO',
    'METRICAS_OPERATIONAL_DASHBOARD',
    'METRICAS_GROUP_ANALYTICS',
    'METRICAS_REVIEW_ANALYTICS',
    'MARKETPLACE_LISTING',
    'MARKETPLACE_PLUS'
  ) NOT NULL;

ALTER TABLE `company_capability_override`
  MODIFY `capability` ENUM(
    'RESERVAS_BASE',
    'RESERVAS_PRO',
    'RESERVAS_SERVICE_PROMOTIONS',
    'EVENTOS_BASE',
    'EVENTOS_PRO',
    'CLASES_BASE',
    'CLASES_PRO',
    'COMMERCE_ACCESS',
    'COMMERCE_PRODUCTS',
    'COMMERCE_CATEGORIES',
    'COMMERCE_STOCK',
    'COMMERCE_ORDERS',
    'COMMERCE_PICKUP',
    'COMMERCE_DELIVERY',
    'COMMERCE_SCHEDULED_ORDERS',
    'COMMERCE_COMBOS',
    'COMMERCE_PROMOTIONS',
    'COMMERCE_STAFF_ASSIGNMENT',
    'COMMERCE_METRICS',
    'CRM_BASE',
    'CRM_PRO',
    'CRM_IMPORT_EXPORT',
    'CRM_SEGMENTATION',
    'CRM_REACTIVATION',
    'MENSAJERIA_BASE',
    'MENSAJERIA_PRO',
    'MENSAJERIA_REMINDERS',
    'MENSAJERIA_BULK_WHATSAPP',
    'MENSAJERIA_REVIEW_REQUESTS',
    'MENSAJERIA_CAMPAIGNS',
    'PERSONALIZACION_BASE',
    'PERSONALIZACION_PLUS',
    'STOREFRONT_ADVANCED_CTA',
    'STOREFRONT_SECTION_ORDER',
    'STOREFRONT_FOOTER_CUSTOMIZATION',
    'STOREFRONT_ANNOUNCEMENT_BANNERS',
    'METRICAS_BASE',
    'METRICAS_PRO',
    'METRICAS_OPERATIONAL_DASHBOARD',
    'METRICAS_GROUP_ANALYTICS',
    'METRICAS_REVIEW_ANALYTICS',
    'MARKETPLACE_LISTING',
    'MARKETPLACE_PLUS'
  ) NOT NULL;

ALTER TABLE `product_access_request`
  MODIFY `product_code` ENUM(
    'RESERVAS',
    'EVENTOS',
    'CLASES',
    'STORES',
    'PERSONALIZACION',
    'CRM',
    'MENSAJERIA',
    'METRICAS',
    'MARKETPLACE'
  ) NOT NULL,
  MODIFY `tier_code` ENUM(
    'RESERVAS_BASE',
    'RESERVAS_PRO',
    'EVENTOS_BASE',
    'EVENTOS_PRO',
    'CLASES_BASE',
    'CLASES_PRO',
    'STORES_BASE',
    'STORES_PRO',
    'PERSONALIZACION_BASE',
    'PERSONALIZACION_PLUS',
    'CRM_BASE',
    'CRM_PRO',
    'MENSAJERIA_BASE',
    'MENSAJERIA_PRO',
    'METRICAS_BASE',
    'METRICAS_PRO',
    'MARKETPLACE_PLUS'
  ) NOT NULL,
  MODIFY `capability` ENUM(
    'RESERVAS_BASE',
    'RESERVAS_PRO',
    'RESERVAS_SERVICE_PROMOTIONS',
    'EVENTOS_BASE',
    'EVENTOS_PRO',
    'CLASES_BASE',
    'CLASES_PRO',
    'COMMERCE_ACCESS',
    'COMMERCE_PRODUCTS',
    'COMMERCE_CATEGORIES',
    'COMMERCE_STOCK',
    'COMMERCE_ORDERS',
    'COMMERCE_PICKUP',
    'COMMERCE_DELIVERY',
    'COMMERCE_SCHEDULED_ORDERS',
    'COMMERCE_COMBOS',
    'COMMERCE_PROMOTIONS',
    'COMMERCE_STAFF_ASSIGNMENT',
    'COMMERCE_METRICS',
    'CRM_BASE',
    'CRM_PRO',
    'CRM_IMPORT_EXPORT',
    'CRM_SEGMENTATION',
    'CRM_REACTIVATION',
    'MENSAJERIA_BASE',
    'MENSAJERIA_PRO',
    'MENSAJERIA_REMINDERS',
    'MENSAJERIA_BULK_WHATSAPP',
    'MENSAJERIA_REVIEW_REQUESTS',
    'MENSAJERIA_CAMPAIGNS',
    'PERSONALIZACION_BASE',
    'PERSONALIZACION_PLUS',
    'STOREFRONT_ADVANCED_CTA',
    'STOREFRONT_SECTION_ORDER',
    'STOREFRONT_FOOTER_CUSTOMIZATION',
    'STOREFRONT_ANNOUNCEMENT_BANNERS',
    'METRICAS_BASE',
    'METRICAS_PRO',
    'METRICAS_OPERATIONAL_DASHBOARD',
    'METRICAS_GROUP_ANALYTICS',
    'METRICAS_REVIEW_ANALYTICS',
    'MARKETPLACE_LISTING',
    'MARKETPLACE_PLUS'
  ) NOT NULL;

INSERT INTO `product_catalog`
  (`code`, `name`, `description`, `category`, `is_core_product`, `is_addon`, `is_active`, `sort_order`)
VALUES
  ('STORES', 'Tienda', 'Catalogo, pedidos, stock y checkout QR.', 'CORE_PRODUCT', TRUE, FALSE, TRUE, 35)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `category` = VALUES(`category`),
  `is_core_product` = VALUES(`is_core_product`),
  `is_addon` = VALUES(`is_addon`),
  `is_active` = VALUES(`is_active`),
  `sort_order` = VALUES(`sort_order`);

INSERT INTO `product_tier`
  (`product_id`, `code`, `name`, `description`, `tier_level`, `is_base`, `is_pro`, `is_active`, `sort_order`)
SELECT pc.`id`, seeded.`code`, seeded.`name`, seeded.`description`, seeded.`tier_level`, seeded.`is_base`, seeded.`is_pro`, seeded.`is_active`, seeded.`sort_order`
FROM `product_catalog` pc
JOIN (
  SELECT 'STORES' AS product_code, 'STORES_BASE' AS code, 'Tienda Base' AS name, 'Productos, categorias, stock, pickup, delivery y checkout QR.' AS description, 1 AS tier_level, TRUE AS is_base, FALSE AS is_pro, TRUE AS is_active, 65 AS sort_order
  UNION ALL
  SELECT 'STORES', 'STORES_PRO', 'Tienda Pro', 'Promociones, combos, asignacion y metricas para tienda.' AS description, 2, FALSE, TRUE, TRUE, 66
) seeded ON seeded.product_code = pc.`code`
ON DUPLICATE KEY UPDATE
  `product_id` = VALUES(`product_id`),
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `tier_level` = VALUES(`tier_level`),
  `is_base` = VALUES(`is_base`),
  `is_pro` = VALUES(`is_pro`),
  `is_active` = VALUES(`is_active`),
  `sort_order` = VALUES(`sort_order`);

INSERT INTO `product_tier_capability` (`product_tier_id`, `capability`)
SELECT pt.`id`, caps.`capability`
FROM `product_tier` pt
JOIN (
  SELECT 'STORES_BASE' AS tier_code, 'COMMERCE_ACCESS' AS capability
  UNION ALL SELECT 'STORES_BASE', 'COMMERCE_PRODUCTS'
  UNION ALL SELECT 'STORES_BASE', 'COMMERCE_CATEGORIES'
  UNION ALL SELECT 'STORES_BASE', 'COMMERCE_STOCK'
  UNION ALL SELECT 'STORES_BASE', 'COMMERCE_ORDERS'
  UNION ALL SELECT 'STORES_BASE', 'COMMERCE_PICKUP'
  UNION ALL SELECT 'STORES_BASE', 'COMMERCE_DELIVERY'
  UNION ALL SELECT 'STORES_PRO', 'COMMERCE_ACCESS'
  UNION ALL SELECT 'STORES_PRO', 'COMMERCE_PRODUCTS'
  UNION ALL SELECT 'STORES_PRO', 'COMMERCE_CATEGORIES'
  UNION ALL SELECT 'STORES_PRO', 'COMMERCE_STOCK'
  UNION ALL SELECT 'STORES_PRO', 'COMMERCE_ORDERS'
  UNION ALL SELECT 'STORES_PRO', 'COMMERCE_PICKUP'
  UNION ALL SELECT 'STORES_PRO', 'COMMERCE_DELIVERY'
  UNION ALL SELECT 'STORES_PRO', 'COMMERCE_SCHEDULED_ORDERS'
  UNION ALL SELECT 'STORES_PRO', 'COMMERCE_COMBOS'
  UNION ALL SELECT 'STORES_PRO', 'COMMERCE_PROMOTIONS'
  UNION ALL SELECT 'STORES_PRO', 'COMMERCE_STAFF_ASSIGNMENT'
  UNION ALL SELECT 'STORES_PRO', 'COMMERCE_METRICS'
  UNION ALL SELECT 'RESERVAS_PRO', 'RESERVAS_SERVICE_PROMOTIONS'
) caps ON caps.`tier_code` = pt.`code`
LEFT JOIN `product_tier_capability` existing
  ON existing.`product_tier_id` = pt.`id`
 AND existing.`capability` = caps.`capability`
WHERE existing.`id` IS NULL;

ALTER TABLE `service`
  ADD COLUMN `promo_price_cents` INTEGER NULL,
  ADD COLUMN `promo_starts_at` DATETIME(3) NULL,
  ADD COLUMN `promo_ends_at` DATETIME(3) NULL,
  ADD COLUMN `promo_label` VARCHAR(120) NULL;

ALTER TABLE `booking_service`
  ADD COLUMN `regular_price_cents_snapshot` INTEGER NULL,
  ADD COLUMN `promo_applied_snapshot` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `promo_label_snapshot` VARCHAR(120) NULL;

CREATE TABLE `commerce_store` (
  `id` VARCHAR(191) NOT NULL,
  `company_id` INTEGER NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `fulfillment_mode` ENUM('PICKUP_ONLY', 'DELIVERY_ONLY', 'PICKUP_AND_DELIVERY') NOT NULL DEFAULT 'PICKUP_AND_DELIVERY',
  `scheduled_orders_enabled` BOOLEAN NOT NULL DEFAULT FALSE,
  `min_preparation_minutes` INTEGER NULL,
  `max_schedule_days_ahead` INTEGER NULL,
  `qr_payment_enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `qr_image_url` VARCHAR(512) NULL,
  `payment_instructions` TEXT NULL,
  `payment_proof_required` BOOLEAN NOT NULL DEFAULT TRUE,
  `payment_review_required` BOOLEAN NOT NULL DEFAULT TRUE,
  `delivery_cost_mode` ENUM('MANUAL', 'FIXED', 'FREE') NOT NULL DEFAULT 'MANUAL',
  `fixed_delivery_cost` DECIMAL(10,2) NULL,
  `delivery_instructions` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `commerce_store_company_id_key`(`company_id`),
  INDEX `commerce_store_company_active_idx`(`company_id`, `is_active`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_category` (
  `id` VARCHAR(191) NOT NULL,
  `company_id` INTEGER NOT NULL,
  `store_id` VARCHAR(191) NULL,
  `name` VARCHAR(120) NOT NULL,
  `slug` VARCHAR(160) NOT NULL,
  `description` TEXT NULL,
  `image_url` VARCHAR(512) NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `commerce_category_company_slug_key`(`company_id`, `slug`),
  INDEX `commerce_category_company_idx`(`company_id`),
  INDEX `commerce_category_company_active_idx`(`company_id`, `is_active`),
  INDEX `commerce_category_store_idx`(`store_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_product` (
  `id` VARCHAR(191) NOT NULL,
  `company_id` INTEGER NOT NULL,
  `store_id` VARCHAR(191) NULL,
  `category_id` VARCHAR(191) NULL,
  `name` VARCHAR(160) NOT NULL,
  `slug` VARCHAR(180) NOT NULL,
  `description` TEXT NULL,
  `product_type` ENUM('SIMPLE', 'COMBO') NOT NULL DEFAULT 'SIMPLE',
  `price` DECIMAL(10,2) NOT NULL,
  `regular_price` DECIMAL(10,2) NULL,
  `promo_price` DECIMAL(10,2) NULL,
  `promo_starts_at` DATETIME(3) NULL,
  `promo_ends_at` DATETIME(3) NULL,
  `promo_label` VARCHAR(120) NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `is_featured` BOOLEAN NOT NULL DEFAULT FALSE,
  `track_stock` BOOLEAN NOT NULL DEFAULT TRUE,
  `stock_quantity` INTEGER NOT NULL DEFAULT 0,
  `low_stock_threshold` INTEGER NULL,
  `allow_out_of_stock_orders` BOOLEAN NOT NULL DEFAULT FALSE,
  `available_for_pickup` BOOLEAN NOT NULL DEFAULT TRUE,
  `available_for_delivery` BOOLEAN NOT NULL DEFAULT TRUE,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `commerce_product_company_slug_key`(`company_id`, `slug`),
  INDEX `commerce_product_company_idx`(`company_id`),
  INDEX `commerce_product_company_active_idx`(`company_id`, `is_active`),
  INDEX `commerce_product_company_type_idx`(`company_id`, `product_type`),
  INDEX `commerce_product_category_idx`(`category_id`),
  INDEX `commerce_product_store_idx`(`store_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_product_image` (
  `id` VARCHAR(191) NOT NULL,
  `product_id` VARCHAR(191) NOT NULL,
  `image_url` VARCHAR(512) NOT NULL,
  `alt_text` VARCHAR(255) NULL,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `is_primary` BOOLEAN NOT NULL DEFAULT FALSE,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `commerce_product_image_product_idx`(`product_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_combo_item` (
  `id` VARCHAR(191) NOT NULL,
  `combo_product_id` VARCHAR(191) NOT NULL,
  `component_product_id` VARCHAR(191) NOT NULL,
  `quantity` INTEGER NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `commerce_combo_item_combo_component_key`(`combo_product_id`, `component_product_id`),
  INDEX `commerce_combo_item_combo_idx`(`combo_product_id`),
  INDEX `commerce_combo_item_component_idx`(`component_product_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_pickup_point` (
  `id` VARCHAR(191) NOT NULL,
  `company_id` INTEGER NOT NULL,
  `store_id` VARCHAR(191) NULL,
  `name` VARCHAR(120) NOT NULL,
  `address` VARCHAR(255) NULL,
  `map_url` VARCHAR(512) NULL,
  `instructions` TEXT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `commerce_pickup_point_company_idx`(`company_id`),
  INDEX `commerce_pickup_point_company_active_idx`(`company_id`, `is_active`),
  INDEX `commerce_pickup_point_store_idx`(`store_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_order` (
  `id` VARCHAR(191) NOT NULL,
  `company_id` INTEGER NOT NULL,
  `store_id` VARCHAR(191) NULL,
  `customer_profile_id` INTEGER NULL,
  `order_number` VARCHAR(64) NOT NULL,
  `customer_name` VARCHAR(160) NOT NULL,
  `customer_phone` VARCHAR(32) NOT NULL,
  `customer_email` VARCHAR(191) NULL,
  `fulfillment_type` ENUM('PICKUP', 'DELIVERY') NOT NULL,
  `pickup_point_id` VARCHAR(191) NULL,
  `delivery_address` VARCHAR(255) NULL,
  `delivery_notes` TEXT NULL,
  `scheduled_for` DATETIME(3) NULL,
  `subtotal` DECIMAL(10,2) NOT NULL,
  `delivery_cost` DECIMAL(10,2) NULL,
  `total` DECIMAL(10,2) NULL,
  `payment_status` ENUM('PENDING_REVIEW', 'AWAITING_DELIVERY_COST', 'AWAITING_PAYMENT', 'PAYMENT_SUBMITTED', 'PAYMENT_CONFIRMED', 'PAYMENT_REJECTED', 'REFUNDED', 'CANCELLED') NOT NULL DEFAULT 'PENDING_REVIEW',
  `fulfillment_status` ENUM('NEW', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'COMPLETED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'NEW',
  `payment_proof_url` VARCHAR(512) NULL,
  `assigned_staff_id` INTEGER NULL,
  `internal_notes` TEXT NULL,
  `customer_notes` TEXT NULL,
  `accepted_at` DATETIME(3) NULL,
  `payment_confirmed_at` DATETIME(3) NULL,
  `stock_deducted_at` DATETIME(3) NULL,
  `stock_restored_at` DATETIME(3) NULL,
  `completed_at` DATETIME(3) NULL,
  `cancelled_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `commerce_order_company_order_number_key`(`company_id`, `order_number`),
  INDEX `commerce_order_company_idx`(`company_id`),
  INDEX `commerce_order_company_payment_status_idx`(`company_id`, `payment_status`),
  INDEX `commerce_order_company_fulfillment_status_idx`(`company_id`, `fulfillment_status`),
  INDEX `commerce_order_company_created_idx`(`company_id`, `created_at`),
  INDEX `commerce_order_customer_profile_idx`(`customer_profile_id`),
  INDEX `commerce_order_assigned_staff_idx`(`assigned_staff_id`),
  INDEX `commerce_order_pickup_point_idx`(`pickup_point_id`),
  INDEX `commerce_order_store_idx`(`store_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_order_item` (
  `id` VARCHAR(191) NOT NULL,
  `order_id` VARCHAR(191) NOT NULL,
  `product_id` VARCHAR(191) NULL,
  `product_name_snapshot` VARCHAR(160) NOT NULL,
  `product_type_snapshot` ENUM('SIMPLE', 'COMBO') NOT NULL,
  `unit_price_snapshot` DECIMAL(10,2) NOT NULL,
  `regular_price_snapshot` DECIMAL(10,2) NULL,
  `promo_applied_snapshot` BOOLEAN NOT NULL DEFAULT FALSE,
  `promo_label_snapshot` VARCHAR(120) NULL,
  `quantity` INTEGER NOT NULL,
  `total` DECIMAL(10,2) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `commerce_order_item_order_idx`(`order_id`),
  INDEX `commerce_order_item_product_idx`(`product_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_order_item_component_snapshot` (
  `id` VARCHAR(191) NOT NULL,
  `order_item_id` VARCHAR(191) NOT NULL,
  `component_product_id` VARCHAR(191) NULL,
  `component_name_snapshot` VARCHAR(160) NOT NULL,
  `component_quantity_per_combo` INTEGER NOT NULL,
  `total_component_quantity` INTEGER NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `commerce_order_item_component_snapshot_order_item_idx`(`order_item_id`),
  INDEX `commerce_order_item_component_snapshot_product_idx`(`component_product_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_order_status_history` (
  `id` VARCHAR(191) NOT NULL,
  `order_id` VARCHAR(191) NOT NULL,
  `previous_payment_status` ENUM('PENDING_REVIEW', 'AWAITING_DELIVERY_COST', 'AWAITING_PAYMENT', 'PAYMENT_SUBMITTED', 'PAYMENT_CONFIRMED', 'PAYMENT_REJECTED', 'REFUNDED', 'CANCELLED') NULL,
  `new_payment_status` ENUM('PENDING_REVIEW', 'AWAITING_DELIVERY_COST', 'AWAITING_PAYMENT', 'PAYMENT_SUBMITTED', 'PAYMENT_CONFIRMED', 'PAYMENT_REJECTED', 'REFUNDED', 'CANCELLED') NULL,
  `previous_fulfillment_status` ENUM('NEW', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'COMPLETED', 'REJECTED', 'CANCELLED') NULL,
  `new_fulfillment_status` ENUM('NEW', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'COMPLETED', 'REJECTED', 'CANCELLED') NULL,
  `changed_by_user_id` VARCHAR(191) NULL,
  `note` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `commerce_order_status_history_order_idx`(`order_id`),
  INDEX `commerce_order_status_history_created_idx`(`created_at`),
  INDEX `commerce_order_status_history_changed_by_idx`(`changed_by_user_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `commerce_store`
  ADD CONSTRAINT `commerce_store_company_id_fkey`
    FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `commerce_category`
  ADD CONSTRAINT `commerce_category_company_id_fkey`
    FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `commerce_category_store_id_fkey`
    FOREIGN KEY (`store_id`) REFERENCES `commerce_store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `commerce_product`
  ADD CONSTRAINT `commerce_product_company_id_fkey`
    FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `commerce_product_store_id_fkey`
    FOREIGN KEY (`store_id`) REFERENCES `commerce_store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `commerce_product_category_id_fkey`
    FOREIGN KEY (`category_id`) REFERENCES `commerce_category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `commerce_product_image`
  ADD CONSTRAINT `commerce_product_image_product_id_fkey`
    FOREIGN KEY (`product_id`) REFERENCES `commerce_product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `commerce_combo_item`
  ADD CONSTRAINT `commerce_combo_item_combo_product_id_fkey`
    FOREIGN KEY (`combo_product_id`) REFERENCES `commerce_product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `commerce_combo_item_component_product_id_fkey`
    FOREIGN KEY (`component_product_id`) REFERENCES `commerce_product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `commerce_pickup_point`
  ADD CONSTRAINT `commerce_pickup_point_company_id_fkey`
    FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `commerce_pickup_point_store_id_fkey`
    FOREIGN KEY (`store_id`) REFERENCES `commerce_store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `commerce_order`
  ADD CONSTRAINT `commerce_order_company_id_fkey`
    FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `commerce_order_store_id_fkey`
    FOREIGN KEY (`store_id`) REFERENCES `commerce_store`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `commerce_order_customer_profile_id_fkey`
    FOREIGN KEY (`customer_profile_id`) REFERENCES `customer_profile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `commerce_order_pickup_point_id_fkey`
    FOREIGN KEY (`pickup_point_id`) REFERENCES `commerce_pickup_point`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `commerce_order_assigned_staff_id_fkey`
    FOREIGN KEY (`assigned_staff_id`) REFERENCES `staff_profile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `commerce_order_item`
  ADD CONSTRAINT `commerce_order_item_order_id_fkey`
    FOREIGN KEY (`order_id`) REFERENCES `commerce_order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `commerce_order_item_product_id_fkey`
    FOREIGN KEY (`product_id`) REFERENCES `commerce_product`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `commerce_order_item_component_snapshot`
  ADD CONSTRAINT `commerce_order_item_component_snapshot_order_item_id_fkey`
    FOREIGN KEY (`order_item_id`) REFERENCES `commerce_order_item`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `commerce_order_item_component_snapshot_product_id_fkey`
    FOREIGN KEY (`component_product_id`) REFERENCES `commerce_product`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `commerce_order_status_history`
  ADD CONSTRAINT `commerce_order_status_history_order_id_fkey`
    FOREIGN KEY (`order_id`) REFERENCES `commerce_order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `commerce_order_status_history_changed_by_user_id_fkey`
    FOREIGN KEY (`changed_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
