CREATE TABLE IF NOT EXISTS `product_catalog` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `code` ENUM(
    'RESERVAS',
    'EVENTOS',
    'CLASES',
    'PERSONALIZACION',
    'CRM',
    'MENSAJERIA',
    'METRICAS',
    'MARKETPLACE'
  ) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `description` TEXT NULL,
  `category` VARCHAR(50) NOT NULL,
  `is_core_product` BOOLEAN NOT NULL DEFAULT FALSE,
  `is_addon` BOOLEAN NOT NULL DEFAULT FALSE,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @product_catalog_code_unique_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_catalog'
    AND INDEX_NAME = 'product_catalog_code_key'
);
SET @sql_product_catalog_code_unique := IF(
  @product_catalog_code_unique_exists = 0,
  'CREATE UNIQUE INDEX `product_catalog_code_key` ON `product_catalog`(`code`)',
  'SELECT 1'
);
PREPARE stmt_product_catalog_code_unique FROM @sql_product_catalog_code_unique;
EXECUTE stmt_product_catalog_code_unique;
DEALLOCATE PREPARE stmt_product_catalog_code_unique;

SET @product_catalog_category_is_active_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_catalog'
    AND INDEX_NAME = 'product_catalog_category_is_active_idx'
);
SET @sql_product_catalog_category_is_active_idx := IF(
  @product_catalog_category_is_active_idx_exists = 0,
  'CREATE INDEX `product_catalog_category_is_active_idx` ON `product_catalog`(`category`, `is_active`)',
  'SELECT 1'
);
PREPARE stmt_product_catalog_category_is_active_idx FROM @sql_product_catalog_category_is_active_idx;
EXECUTE stmt_product_catalog_category_is_active_idx;
DEALLOCATE PREPARE stmt_product_catalog_category_is_active_idx;

SET @product_catalog_sort_order_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_catalog'
    AND INDEX_NAME = 'product_catalog_sort_order_idx'
);
SET @sql_product_catalog_sort_order_idx := IF(
  @product_catalog_sort_order_idx_exists = 0,
  'CREATE INDEX `product_catalog_sort_order_idx` ON `product_catalog`(`sort_order`)',
  'SELECT 1'
);
PREPARE stmt_product_catalog_sort_order_idx FROM @sql_product_catalog_sort_order_idx;
EXECUTE stmt_product_catalog_sort_order_idx;
DEALLOCATE PREPARE stmt_product_catalog_sort_order_idx;

INSERT INTO `product_catalog`
  (`code`, `name`, `description`, `category`, `is_core_product`, `is_addon`, `is_active`, `sort_order`)
VALUES
  ('RESERVAS', 'Reservas', '1:1 bookings, services, staff availability, and appointment operations.', 'CORE_PRODUCT', TRUE, FALSE, TRUE, 10),
  ('EVENTOS', 'Eventos', 'One-time group events, paid registrations, and free registrations.', 'CORE_PRODUCT', TRUE, FALSE, TRUE, 20),
  ('CLASES', 'Clases', 'Recurring classes, sessions, enrollments, and attendance management.', 'CORE_PRODUCT', TRUE, FALSE, TRUE, 30),
  ('PERSONALIZACION', 'Personalizacion', 'Storefront branding and layout controls.', 'ADDON', FALSE, TRUE, TRUE, 40),
  ('CRM', 'CRM', 'Customer relationship management, segmentation, and lifecycle tools.', 'ADDON', FALSE, TRUE, TRUE, 50),
  ('MENSAJERIA', 'Mensajeria', 'Transactional notifications, reminders, campaigns, and review requests.', 'ADDON', FALSE, TRUE, TRUE, 60),
  ('METRICAS', 'Metricas', 'Operational dashboards and analytics.', 'ADDON', FALSE, TRUE, TRUE, 70),
  ('MARKETPLACE', 'Marketplace', 'Marketplace visibility, premium discovery, and promotional placement.', 'ADDON', FALSE, TRUE, TRUE, 80)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `category` = VALUES(`category`),
  `is_core_product` = VALUES(`is_core_product`),
  `is_addon` = VALUES(`is_addon`),
  `is_active` = VALUES(`is_active`),
  `sort_order` = VALUES(`sort_order`);

CREATE TABLE IF NOT EXISTS `product_tier` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `product_id` INTEGER NOT NULL,
  `code` ENUM(
    'RESERVAS_BASE',
    'RESERVAS_PRO',
    'EVENTOS_BASE',
    'EVENTOS_PRO',
    'CLASES_BASE',
    'CLASES_PRO',
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
  `name` VARCHAR(120) NOT NULL,
  `description` TEXT NULL,
  `tier_level` INTEGER NOT NULL,
  `is_base` BOOLEAN NOT NULL DEFAULT FALSE,
  `is_pro` BOOLEAN NOT NULL DEFAULT FALSE,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `product_tier_product_id_fkey`
    FOREIGN KEY (`product_id`) REFERENCES `product_catalog`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @product_tier_code_unique_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_tier'
    AND INDEX_NAME = 'product_tier_code_key'
);
SET @sql_product_tier_code_unique := IF(
  @product_tier_code_unique_exists = 0,
  'CREATE UNIQUE INDEX `product_tier_code_key` ON `product_tier`(`code`)',
  'SELECT 1'
);
PREPARE stmt_product_tier_code_unique FROM @sql_product_tier_code_unique;
EXECUTE stmt_product_tier_code_unique;
DEALLOCATE PREPARE stmt_product_tier_code_unique;

SET @product_tier_product_id_tier_level_key_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_tier'
    AND INDEX_NAME = 'product_tier_product_id_tier_level_key'
);
SET @sql_product_tier_product_id_tier_level_key := IF(
  @product_tier_product_id_tier_level_key_exists = 0,
  'CREATE UNIQUE INDEX `product_tier_product_id_tier_level_key` ON `product_tier`(`product_id`, `tier_level`)',
  'SELECT 1'
);
PREPARE stmt_product_tier_product_id_tier_level_key FROM @sql_product_tier_product_id_tier_level_key;
EXECUTE stmt_product_tier_product_id_tier_level_key;
DEALLOCATE PREPARE stmt_product_tier_product_id_tier_level_key;

SET @product_tier_product_id_is_active_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_tier'
    AND INDEX_NAME = 'product_tier_product_id_is_active_idx'
);
SET @sql_product_tier_product_id_is_active_idx := IF(
  @product_tier_product_id_is_active_idx_exists = 0,
  'CREATE INDEX `product_tier_product_id_is_active_idx` ON `product_tier`(`product_id`, `is_active`)',
  'SELECT 1'
);
PREPARE stmt_product_tier_product_id_is_active_idx FROM @sql_product_tier_product_id_is_active_idx;
EXECUTE stmt_product_tier_product_id_is_active_idx;
DEALLOCATE PREPARE stmt_product_tier_product_id_is_active_idx;

SET @product_tier_sort_order_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_tier'
    AND INDEX_NAME = 'product_tier_sort_order_idx'
);
SET @sql_product_tier_sort_order_idx := IF(
  @product_tier_sort_order_idx_exists = 0,
  'CREATE INDEX `product_tier_sort_order_idx` ON `product_tier`(`sort_order`)',
  'SELECT 1'
);
PREPARE stmt_product_tier_sort_order_idx FROM @sql_product_tier_sort_order_idx;
EXECUTE stmt_product_tier_sort_order_idx;
DEALLOCATE PREPARE stmt_product_tier_sort_order_idx;

INSERT INTO `product_tier`
  (`product_id`, `code`, `name`, `description`, `tier_level`, `is_base`, `is_pro`, `is_active`, `sort_order`)
SELECT pc.`id`, seeded.`code`, seeded.`name`, seeded.`description`, seeded.`tier_level`, seeded.`is_base`, seeded.`is_pro`, seeded.`is_active`, seeded.`sort_order`
FROM `product_catalog` pc
JOIN (
  SELECT 'RESERVAS' AS product_code, 'RESERVAS_BASE' AS code, 'Reservas Base' AS name, 'Public booking, services, staff selection, and core appointment management.' AS description, 1 AS tier_level, TRUE AS is_base, FALSE AS is_pro, TRUE AS is_active, 10 AS sort_order
  UNION ALL SELECT 'RESERVAS', 'RESERVAS_PRO', 'Reservas Pro', 'Advanced booking controls, staff availability, reminders, and admin tooling.', 2, FALSE, TRUE, TRUE, 20
  UNION ALL SELECT 'EVENTOS', 'EVENTOS_BASE', 'Eventos Base', 'Paid and free event registration, capacity, and attendee management.', 1, TRUE, FALSE, TRUE, 30
  UNION ALL SELECT 'EVENTOS', 'EVENTOS_PRO', 'Eventos Pro', 'Advanced event operations, ticketing, and higher-touch attendee workflows.', 2, FALSE, TRUE, TRUE, 40
  UNION ALL SELECT 'CLASES', 'CLASES_BASE', 'Clases Base', 'Recurring classes, enrollments, and session scheduling.', 1, TRUE, FALSE, TRUE, 50
  UNION ALL SELECT 'CLASES', 'CLASES_PRO', 'Clases Pro', 'Advanced class lifecycle workflows, attendance, and course operations.', 2, FALSE, TRUE, TRUE, 60
  UNION ALL SELECT 'PERSONALIZACION', 'PERSONALIZACION_BASE', 'Personalizacion Base', 'Baseline storefront customization preserved for legacy bundle compatibility.', 1, TRUE, FALSE, TRUE, 70
  UNION ALL SELECT 'PERSONALIZACION', 'PERSONALIZACION_PLUS', 'Personalizacion Plus', 'Advanced storefront CTA, layout, footer, and banner customization.', 2, FALSE, TRUE, TRUE, 80
  UNION ALL SELECT 'CRM', 'CRM_BASE', 'CRM Base', 'Baseline CRM access preserved for legacy bundle compatibility.', 1, TRUE, FALSE, TRUE, 90
  UNION ALL SELECT 'CRM', 'CRM_PRO', 'CRM Pro', 'Advanced CRM segmentation, import/export, and reactivation tooling.', 2, FALSE, TRUE, TRUE, 100
  UNION ALL SELECT 'MENSAJERIA', 'MENSAJERIA_BASE', 'Mensajeria Base', 'Baseline transactional messaging preserved for legacy bundle compatibility.', 1, TRUE, FALSE, TRUE, 110
  UNION ALL SELECT 'MENSAJERIA', 'MENSAJERIA_PRO', 'Mensajeria Pro', 'Reminders, review requests, bulk WhatsApp, and campaigns.', 2, FALSE, TRUE, TRUE, 120
  UNION ALL SELECT 'METRICAS', 'METRICAS_BASE', 'Metricas Base', 'Baseline analytics preserved for legacy bundle compatibility.', 1, TRUE, FALSE, TRUE, 130
  UNION ALL SELECT 'METRICAS', 'METRICAS_PRO', 'Metricas Pro', 'Operational, review, and group analytics.', 2, FALSE, TRUE, TRUE, 140
  UNION ALL SELECT 'MARKETPLACE', 'MARKETPLACE_PLUS', 'Marketplace Plus', 'Premium marketplace visibility and related promotional benefits.', 2, FALSE, TRUE, TRUE, 150
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

CREATE TABLE IF NOT EXISTS `product_tier_capability` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `product_tier_id` INTEGER NOT NULL,
  `capability` ENUM(
    'RESERVAS_BASE',
    'RESERVAS_PRO',
    'EVENTOS_BASE',
    'EVENTOS_PRO',
    'CLASES_BASE',
    'CLASES_PRO',
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
  ) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `product_tier_capability_product_tier_id_fkey`
    FOREIGN KEY (`product_tier_id`) REFERENCES `product_tier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @product_tier_capability_unique_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_tier_capability'
    AND INDEX_NAME = 'product_tier_capability_product_tier_id_capability_key'
);
SET @sql_product_tier_capability_unique := IF(
  @product_tier_capability_unique_exists = 0,
  'CREATE UNIQUE INDEX `product_tier_capability_product_tier_id_capability_key` ON `product_tier_capability`(`product_tier_id`, `capability`)',
  'SELECT 1'
);
PREPARE stmt_product_tier_capability_unique FROM @sql_product_tier_capability_unique;
EXECUTE stmt_product_tier_capability_unique;
DEALLOCATE PREPARE stmt_product_tier_capability_unique;

SET @product_tier_capability_capability_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_tier_capability'
    AND INDEX_NAME = 'product_tier_capability_capability_idx'
);
SET @sql_product_tier_capability_capability_idx := IF(
  @product_tier_capability_capability_idx_exists = 0,
  'CREATE INDEX `product_tier_capability_capability_idx` ON `product_tier_capability`(`capability`)',
  'SELECT 1'
);
PREPARE stmt_product_tier_capability_capability_idx FROM @sql_product_tier_capability_capability_idx;
EXECUTE stmt_product_tier_capability_capability_idx;
DEALLOCATE PREPARE stmt_product_tier_capability_capability_idx;

DELETE ptc
FROM `product_tier_capability` ptc
JOIN `product_tier` pt ON pt.`id` = ptc.`product_tier_id`
WHERE pt.`code` IN (
  'RESERVAS_BASE',
  'RESERVAS_PRO',
  'EVENTOS_BASE',
  'EVENTOS_PRO',
  'CLASES_BASE',
  'CLASES_PRO',
  'PERSONALIZACION_BASE',
  'PERSONALIZACION_PLUS',
  'CRM_BASE',
  'CRM_PRO',
  'MENSAJERIA_BASE',
  'MENSAJERIA_PRO',
  'METRICAS_BASE',
  'METRICAS_PRO',
  'MARKETPLACE_PLUS'
);

INSERT INTO `product_tier_capability` (`product_tier_id`, `capability`)
SELECT pt.`id`, seeded.`capability`
FROM `product_tier` pt
JOIN (
  SELECT 'RESERVAS_BASE' AS tier_code, 'RESERVAS_BASE' AS capability
  UNION ALL SELECT 'RESERVAS_PRO', 'RESERVAS_BASE'
  UNION ALL SELECT 'RESERVAS_PRO', 'RESERVAS_PRO'
  UNION ALL SELECT 'EVENTOS_BASE', 'EVENTOS_BASE'
  UNION ALL SELECT 'EVENTOS_PRO', 'EVENTOS_BASE'
  UNION ALL SELECT 'EVENTOS_PRO', 'EVENTOS_PRO'
  UNION ALL SELECT 'CLASES_BASE', 'CLASES_BASE'
  UNION ALL SELECT 'CLASES_PRO', 'CLASES_BASE'
  UNION ALL SELECT 'CLASES_PRO', 'CLASES_PRO'
  UNION ALL SELECT 'PERSONALIZACION_BASE', 'PERSONALIZACION_BASE'
  UNION ALL SELECT 'PERSONALIZACION_PLUS', 'PERSONALIZACION_BASE'
  UNION ALL SELECT 'PERSONALIZACION_PLUS', 'PERSONALIZACION_PLUS'
  UNION ALL SELECT 'PERSONALIZACION_PLUS', 'STOREFRONT_ADVANCED_CTA'
  UNION ALL SELECT 'PERSONALIZACION_PLUS', 'STOREFRONT_SECTION_ORDER'
  UNION ALL SELECT 'PERSONALIZACION_PLUS', 'STOREFRONT_FOOTER_CUSTOMIZATION'
  UNION ALL SELECT 'PERSONALIZACION_PLUS', 'STOREFRONT_ANNOUNCEMENT_BANNERS'
  UNION ALL SELECT 'CRM_BASE', 'CRM_BASE'
  UNION ALL SELECT 'CRM_PRO', 'CRM_BASE'
  UNION ALL SELECT 'CRM_PRO', 'CRM_PRO'
  UNION ALL SELECT 'CRM_PRO', 'CRM_IMPORT_EXPORT'
  UNION ALL SELECT 'CRM_PRO', 'CRM_SEGMENTATION'
  UNION ALL SELECT 'CRM_PRO', 'CRM_REACTIVATION'
  UNION ALL SELECT 'MENSAJERIA_BASE', 'MENSAJERIA_BASE'
  UNION ALL SELECT 'MENSAJERIA_PRO', 'MENSAJERIA_BASE'
  UNION ALL SELECT 'MENSAJERIA_PRO', 'MENSAJERIA_PRO'
  UNION ALL SELECT 'MENSAJERIA_PRO', 'MENSAJERIA_REMINDERS'
  UNION ALL SELECT 'MENSAJERIA_PRO', 'MENSAJERIA_BULK_WHATSAPP'
  UNION ALL SELECT 'MENSAJERIA_PRO', 'MENSAJERIA_REVIEW_REQUESTS'
  UNION ALL SELECT 'MENSAJERIA_PRO', 'MENSAJERIA_CAMPAIGNS'
  UNION ALL SELECT 'METRICAS_BASE', 'METRICAS_BASE'
  UNION ALL SELECT 'METRICAS_PRO', 'METRICAS_BASE'
  UNION ALL SELECT 'METRICAS_PRO', 'METRICAS_PRO'
  UNION ALL SELECT 'METRICAS_PRO', 'METRICAS_OPERATIONAL_DASHBOARD'
  UNION ALL SELECT 'METRICAS_PRO', 'METRICAS_GROUP_ANALYTICS'
  UNION ALL SELECT 'METRICAS_PRO', 'METRICAS_REVIEW_ANALYTICS'
  UNION ALL SELECT 'MARKETPLACE_PLUS', 'MARKETPLACE_LISTING'
  UNION ALL SELECT 'MARKETPLACE_PLUS', 'MARKETPLACE_PLUS'
) seeded ON seeded.tier_code = pt.`code`;

SET @company_product_subscription_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company_product_subscription'
);
SET @sql_create_company_product_subscription_if_missing := IF(
  @company_product_subscription_exists = 0,
  'CREATE TABLE `company_product_subscription` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `product_id` INTEGER NOT NULL,
    `product_tier_id` INTEGER NOT NULL,
    `status` ENUM(''ACTIVE'', ''TRIALING'', ''EXPIRED'', ''CANCELLED'', ''SUSPENDED'') NOT NULL DEFAULT ''ACTIVE'',
    `billing_cycle` ENUM(''MONTHLY'', ''YEARLY'') NULL,
    `price_paid` DECIMAL(10, 2) NULL,
    `currency` VARCHAR(3) NULL,
    `starts_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `available_until` DATETIME(3) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    CONSTRAINT `company_product_subscription_company_id_fkey`
      FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `company_product_subscription_product_id_fkey`
      FOREIGN KEY (`product_id`) REFERENCES `product_catalog`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `company_product_subscription_product_tier_id_fkey`
      FOREIGN KEY (`product_tier_id`) REFERENCES `product_tier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
  'SELECT 1'
);
PREPARE stmt_create_company_product_subscription_if_missing FROM @sql_create_company_product_subscription_if_missing;
EXECUTE stmt_create_company_product_subscription_if_missing;
DEALLOCATE PREPARE stmt_create_company_product_subscription_if_missing;

SET @company_product_subscription_has_product_code := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company_product_subscription'
    AND COLUMN_NAME = 'product_code'
);

SET @sql_add_company_product_subscription_product_id := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'company_product_subscription'
      AND COLUMN_NAME = 'product_id'
  ),
  'SELECT 1',
  'ALTER TABLE `company_product_subscription` ADD COLUMN `product_id` INTEGER NULL AFTER `company_id`'
);
PREPARE stmt_add_company_product_subscription_product_id FROM @sql_add_company_product_subscription_product_id;
EXECUTE stmt_add_company_product_subscription_product_id;
DEALLOCATE PREPARE stmt_add_company_product_subscription_product_id;

SET @sql_add_company_product_subscription_product_tier_id := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'company_product_subscription'
      AND COLUMN_NAME = 'product_tier_id'
  ),
  'SELECT 1',
  'ALTER TABLE `company_product_subscription` ADD COLUMN `product_tier_id` INTEGER NULL AFTER `product_id`'
);
PREPARE stmt_add_company_product_subscription_product_tier_id FROM @sql_add_company_product_subscription_product_tier_id;
EXECUTE stmt_add_company_product_subscription_product_tier_id;
DEALLOCATE PREPARE stmt_add_company_product_subscription_product_tier_id;

SET @sql_add_company_product_subscription_billing_cycle := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'company_product_subscription'
      AND COLUMN_NAME = 'billing_cycle'
  ),
  'SELECT 1',
  'ALTER TABLE `company_product_subscription` ADD COLUMN `billing_cycle` ENUM(''MONTHLY'', ''YEARLY'') NULL AFTER `status`'
);
PREPARE stmt_add_company_product_subscription_billing_cycle FROM @sql_add_company_product_subscription_billing_cycle;
EXECUTE stmt_add_company_product_subscription_billing_cycle;
DEALLOCATE PREPARE stmt_add_company_product_subscription_billing_cycle;

SET @sql_add_company_product_subscription_price_paid := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'company_product_subscription'
      AND COLUMN_NAME = 'price_paid'
  ),
  'SELECT 1',
  'ALTER TABLE `company_product_subscription` ADD COLUMN `price_paid` DECIMAL(10, 2) NULL AFTER `billing_cycle`'
);
PREPARE stmt_add_company_product_subscription_price_paid FROM @sql_add_company_product_subscription_price_paid;
EXECUTE stmt_add_company_product_subscription_price_paid;
DEALLOCATE PREPARE stmt_add_company_product_subscription_price_paid;

SET @sql_add_company_product_subscription_currency := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'company_product_subscription'
      AND COLUMN_NAME = 'currency'
  ),
  'SELECT 1',
  'ALTER TABLE `company_product_subscription` ADD COLUMN `currency` VARCHAR(3) NULL AFTER `price_paid`'
);
PREPARE stmt_add_company_product_subscription_currency FROM @sql_add_company_product_subscription_currency;
EXECUTE stmt_add_company_product_subscription_currency;
DEALLOCATE PREPARE stmt_add_company_product_subscription_currency;

SET @sql_add_company_product_subscription_available_until := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'company_product_subscription'
      AND COLUMN_NAME = 'available_until'
  ),
  'SELECT 1',
  'ALTER TABLE `company_product_subscription` ADD COLUMN `available_until` DATETIME(3) NULL AFTER `starts_at`'
);
PREPARE stmt_add_company_product_subscription_available_until FROM @sql_add_company_product_subscription_available_until;
EXECUTE stmt_add_company_product_subscription_available_until;
DEALLOCATE PREPARE stmt_add_company_product_subscription_available_until;

SET @sql_add_company_product_subscription_cancelled_at := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'company_product_subscription'
      AND COLUMN_NAME = 'cancelled_at'
  ),
  'SELECT 1',
  'ALTER TABLE `company_product_subscription` ADD COLUMN `cancelled_at` DATETIME(3) NULL AFTER `available_until`'
);
PREPARE stmt_add_company_product_subscription_cancelled_at FROM @sql_add_company_product_subscription_cancelled_at;
EXECUTE stmt_add_company_product_subscription_cancelled_at;
DEALLOCATE PREPARE stmt_add_company_product_subscription_cancelled_at;

ALTER TABLE `company_product_subscription`
MODIFY COLUMN `status` ENUM('ACTIVE', 'INACTIVE', 'TRIALING', 'EXPIRED', 'CANCELLED', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE';

UPDATE `company_product_subscription`
SET `status` = 'SUSPENDED'
WHERE `status` = 'INACTIVE';

SET @sql_backfill_company_product_subscription_product_id := IF(
  @company_product_subscription_has_product_code > 0,
  'UPDATE `company_product_subscription` cps
   JOIN `product_catalog` pc
     ON pc.`code` = cps.`product_code`
   SET cps.`product_id` = pc.`id`
   WHERE cps.`product_id` IS NULL',
  'SELECT 1'
);
PREPARE stmt_backfill_company_product_subscription_product_id FROM @sql_backfill_company_product_subscription_product_id;
EXECUTE stmt_backfill_company_product_subscription_product_id;
DEALLOCATE PREPARE stmt_backfill_company_product_subscription_product_id;

SET @sql_backfill_company_product_subscription_product_tier_id := IF(
  @company_product_subscription_has_product_code > 0,
  'UPDATE `company_product_subscription` cps
   JOIN `product_tier` pt
     ON pt.`code` = CASE
       WHEN cps.`tier_code` = ''MARKETPLACE_LISTING'' THEN ''MARKETPLACE_PLUS''
       ELSE cps.`tier_code`
     END
   SET cps.`product_tier_id` = pt.`id`
   WHERE cps.`product_tier_id` IS NULL',
  'SELECT 1'
);
PREPARE stmt_backfill_company_product_subscription_product_tier_id FROM @sql_backfill_company_product_subscription_product_tier_id;
EXECUTE stmt_backfill_company_product_subscription_product_tier_id;
DEALLOCATE PREPARE stmt_backfill_company_product_subscription_product_tier_id;

SET @sql_backfill_company_product_subscription_available_until := IF(
  @company_product_subscription_has_product_code > 0,
  'UPDATE `company_product_subscription`
   SET `available_until` = COALESCE(`available_until`, `ends_at`)',
  'SELECT 1'
);
PREPARE stmt_backfill_company_product_subscription_available_until FROM @sql_backfill_company_product_subscription_available_until;
EXECUTE stmt_backfill_company_product_subscription_available_until;
DEALLOCATE PREPARE stmt_backfill_company_product_subscription_available_until;

UPDATE `company_product_subscription`
SET `starts_at` = COALESCE(`starts_at`, `created_at`, CURRENT_TIMESTAMP(3))
WHERE `starts_at` IS NULL;

ALTER TABLE `company_product_subscription`
MODIFY COLUMN `status` ENUM('ACTIVE', 'TRIALING', 'EXPIRED', 'CANCELLED', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
MODIFY COLUMN `product_id` INTEGER NOT NULL,
MODIFY COLUMN `product_tier_id` INTEGER NOT NULL,
MODIFY COLUMN `starts_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
MODIFY COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
MODIFY COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

SET @company_product_subscription_unique_legacy_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company_product_subscription'
    AND INDEX_NAME = 'company_product_subscription_company_id_product_code_key'
);
SET @sql_drop_company_product_subscription_unique_legacy := IF(
  @company_product_subscription_unique_legacy_exists > 0,
  'DROP INDEX `company_product_subscription_company_id_product_code_key` ON `company_product_subscription`',
  'SELECT 1'
);
PREPARE stmt_drop_company_product_subscription_unique_legacy FROM @sql_drop_company_product_subscription_unique_legacy;
EXECUTE stmt_drop_company_product_subscription_unique_legacy;
DEALLOCATE PREPARE stmt_drop_company_product_subscription_unique_legacy;

SET @company_product_subscription_unique_new_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company_product_subscription'
    AND INDEX_NAME = 'company_product_subscription_company_id_product_id_key'
);
SET @sql_create_company_product_subscription_unique_new := IF(
  @company_product_subscription_unique_new_exists = 0,
  'CREATE UNIQUE INDEX `company_product_subscription_company_id_product_id_key` ON `company_product_subscription`(`company_id`, `product_id`)',
  'SELECT 1'
);
PREPARE stmt_create_company_product_subscription_unique_new FROM @sql_create_company_product_subscription_unique_new;
EXECUTE stmt_create_company_product_subscription_unique_new;
DEALLOCATE PREPARE stmt_create_company_product_subscription_unique_new;

SET @company_product_subscription_company_status_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company_product_subscription'
    AND INDEX_NAME = 'company_product_subscription_company_id_status_idx'
);
SET @sql_drop_company_product_subscription_company_status_idx := IF(
  @company_product_subscription_company_status_idx_exists > 0,
  'DROP INDEX `company_product_subscription_company_id_status_idx` ON `company_product_subscription`',
  'SELECT 1'
);
PREPARE stmt_drop_company_product_subscription_company_status_idx FROM @sql_drop_company_product_subscription_company_status_idx;
EXECUTE stmt_drop_company_product_subscription_company_status_idx;
DEALLOCATE PREPARE stmt_drop_company_product_subscription_company_status_idx;

CREATE INDEX `company_product_subscription_company_id_status_idx`
  ON `company_product_subscription`(`company_id`, `status`);

SET @company_product_subscription_product_tier_status_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company_product_subscription'
    AND INDEX_NAME = 'company_product_subscription_product_tier_status_idx'
);
SET @sql_drop_company_product_subscription_product_tier_status_idx := IF(
  @company_product_subscription_product_tier_status_idx_exists > 0,
  'DROP INDEX `company_product_subscription_product_tier_status_idx` ON `company_product_subscription`',
  'SELECT 1'
);
PREPARE stmt_drop_company_product_subscription_product_tier_status_idx FROM @sql_drop_company_product_subscription_product_tier_status_idx;
EXECUTE stmt_drop_company_product_subscription_product_tier_status_idx;
DEALLOCATE PREPARE stmt_drop_company_product_subscription_product_tier_status_idx;

CREATE INDEX `company_product_subscription_product_tier_status_idx`
  ON `company_product_subscription`(`product_id`, `product_tier_id`, `status`);

SET @company_product_subscription_available_until_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company_product_subscription'
    AND INDEX_NAME = 'company_product_subscription_available_until_idx'
);
SET @sql_create_company_product_subscription_available_until_idx := IF(
  @company_product_subscription_available_until_idx_exists = 0,
  'CREATE INDEX `company_product_subscription_available_until_idx` ON `company_product_subscription`(`available_until`)',
  'SELECT 1'
);
PREPARE stmt_create_company_product_subscription_available_until_idx FROM @sql_create_company_product_subscription_available_until_idx;
EXECUTE stmt_create_company_product_subscription_available_until_idx;
DEALLOCATE PREPARE stmt_create_company_product_subscription_available_until_idx;

SET @company_product_subscription_company_fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company_product_subscription'
    AND CONSTRAINT_NAME = 'company_product_subscription_company_id_fkey'
);
SET @sql_add_company_product_subscription_company_fk := IF(
  @company_product_subscription_company_fk_exists = 0,
  'ALTER TABLE `company_product_subscription`
     ADD CONSTRAINT `company_product_subscription_company_id_fkey`
     FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt_add_company_product_subscription_company_fk FROM @sql_add_company_product_subscription_company_fk;
EXECUTE stmt_add_company_product_subscription_company_fk;
DEALLOCATE PREPARE stmt_add_company_product_subscription_company_fk;

SET @company_product_subscription_product_fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company_product_subscription'
    AND CONSTRAINT_NAME = 'company_product_subscription_product_id_fkey'
);
SET @sql_add_company_product_subscription_product_fk := IF(
  @company_product_subscription_product_fk_exists = 0,
  'ALTER TABLE `company_product_subscription`
     ADD CONSTRAINT `company_product_subscription_product_id_fkey`
     FOREIGN KEY (`product_id`) REFERENCES `product_catalog`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt_add_company_product_subscription_product_fk FROM @sql_add_company_product_subscription_product_fk;
EXECUTE stmt_add_company_product_subscription_product_fk;
DEALLOCATE PREPARE stmt_add_company_product_subscription_product_fk;

SET @company_product_subscription_product_tier_fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company_product_subscription'
    AND CONSTRAINT_NAME = 'company_product_subscription_product_tier_id_fkey'
);
SET @sql_add_company_product_subscription_product_tier_fk := IF(
  @company_product_subscription_product_tier_fk_exists = 0,
  'ALTER TABLE `company_product_subscription`
     ADD CONSTRAINT `company_product_subscription_product_tier_id_fkey`
     FOREIGN KEY (`product_tier_id`) REFERENCES `product_tier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt_add_company_product_subscription_product_tier_fk FROM @sql_add_company_product_subscription_product_tier_fk;
EXECUTE stmt_add_company_product_subscription_product_tier_fk;
DEALLOCATE PREPARE stmt_add_company_product_subscription_product_tier_fk;

SET @sql_drop_company_product_subscription_product_code := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'company_product_subscription'
      AND COLUMN_NAME = 'product_code'
  ),
  'ALTER TABLE `company_product_subscription` DROP COLUMN `product_code`',
  'SELECT 1'
);
PREPARE stmt_drop_company_product_subscription_product_code FROM @sql_drop_company_product_subscription_product_code;
EXECUTE stmt_drop_company_product_subscription_product_code;
DEALLOCATE PREPARE stmt_drop_company_product_subscription_product_code;

SET @sql_drop_company_product_subscription_tier_code := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'company_product_subscription'
      AND COLUMN_NAME = 'tier_code'
  ),
  'ALTER TABLE `company_product_subscription` DROP COLUMN `tier_code`',
  'SELECT 1'
);
PREPARE stmt_drop_company_product_subscription_tier_code FROM @sql_drop_company_product_subscription_tier_code;
EXECUTE stmt_drop_company_product_subscription_tier_code;
DEALLOCATE PREPARE stmt_drop_company_product_subscription_tier_code;

SET @sql_drop_company_product_subscription_ends_at := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'company_product_subscription'
      AND COLUMN_NAME = 'ends_at'
  ),
  'ALTER TABLE `company_product_subscription` DROP COLUMN `ends_at`',
  'SELECT 1'
);
PREPARE stmt_drop_company_product_subscription_ends_at FROM @sql_drop_company_product_subscription_ends_at;
EXECUTE stmt_drop_company_product_subscription_ends_at;
DEALLOCATE PREPARE stmt_drop_company_product_subscription_ends_at;

SET @sql_drop_company_product_subscription_metadata := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'company_product_subscription'
      AND COLUMN_NAME = 'metadata'
  ),
  'ALTER TABLE `company_product_subscription` DROP COLUMN `metadata`',
  'SELECT 1'
);
PREPARE stmt_drop_company_product_subscription_metadata FROM @sql_drop_company_product_subscription_metadata;
EXECUTE stmt_drop_company_product_subscription_metadata;
DEALLOCATE PREPARE stmt_drop_company_product_subscription_metadata;

CREATE TABLE IF NOT EXISTS `company_capability_override` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `capability` ENUM(
    'RESERVAS_BASE',
    'RESERVAS_PRO',
    'EVENTOS_BASE',
    'EVENTOS_PRO',
    'CLASES_BASE',
    'CLASES_PRO',
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
  ) NOT NULL,
  `value` BOOLEAN NOT NULL,
  `reason` VARCHAR(255) NULL,
  `created_by_user_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expires_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `company_capability_override_company_id_fkey`
    FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `company_capability_override_created_by_user_id_fkey`
    FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `company_capability_override_company_id_capability_idx`
  ON `company_capability_override`(`company_id`, `capability`);
CREATE INDEX `company_capability_override_created_by_user_id_idx`
  ON `company_capability_override`(`created_by_user_id`);
CREATE INDEX `company_capability_override_expires_at_idx`
  ON `company_capability_override`(`expires_at`);

CREATE TABLE IF NOT EXISTS `company_product_history` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `action` VARCHAR(64) NOT NULL,
  `previous_value` JSON NULL,
  `new_value` JSON NULL,
  `actor_user_id` VARCHAR(191) NULL,
  `note` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `company_product_history_company_id_fkey`
    FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `company_product_history_actor_user_id_fkey`
    FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `company_product_history_company_id_created_at_idx`
  ON `company_product_history`(`company_id`, `created_at`);
CREATE INDEX `company_product_history_actor_user_id_idx`
  ON `company_product_history`(`actor_user_id`);
