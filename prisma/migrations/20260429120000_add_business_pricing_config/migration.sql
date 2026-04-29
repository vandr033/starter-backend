CREATE TABLE `business_pricing_product` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `product_key` ENUM(
    'RESERVAS',
    'EVENTOS',
    'CLASES',
    'TIENDA',
    'PERSONALIZACION_PRO',
    'METRICAS',
    'MENSAJERIA_PRO',
    'CRM_PRO'
  ) NOT NULL,
  `type` ENUM('CORE', 'ADDON') NOT NULL,
  `display_name` VARCHAR(120) NOT NULL,
  `description` TEXT NULL,
  `monthly_price_bs` DECIMAL(10, 2) NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `is_coming_soon` BOOLEAN NOT NULL DEFAULT false,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `metadata` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `business_pricing_product_product_key_key`(`product_key`),
  INDEX `business_pricing_product_type_sort_order_idx`(`type`, `sort_order`),
  INDEX `business_pricing_product_active_coming_soon_idx`(`is_active`, `is_coming_soon`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `business_pricing_bundle_discount_tier` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `min_selected_items` INTEGER NOT NULL,
  `discount_percent` DECIMAL(5, 2) NOT NULL,
  `label` VARCHAR(120) NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `business_pricing_bundle_discount_active_min_items_idx`(`is_active`, `min_selected_items`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `business_pricing_settings` (
  `id` INTEGER NOT NULL,
  `annual_discount_percent` DECIMAL(5, 2) NOT NULL,
  `trial_length_days` INTEGER NOT NULL,
  `first_month_free` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
