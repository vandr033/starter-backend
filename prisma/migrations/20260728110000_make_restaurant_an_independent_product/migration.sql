ALTER TABLE `product_catalog`
  MODIFY `code` ENUM(
    'RESERVAS', 'EVENTOS', 'CLASES', 'STORES', 'RESTAURANTE', 'PERSONALIZACION',
    'CRM', 'MENSAJERIA', 'METRICAS', 'MARKETPLACE'
  ) NOT NULL;

ALTER TABLE `product_tier`
  MODIFY `code` ENUM(
    'RESERVAS_BASE', 'RESERVAS_PRO', 'EVENTOS_BASE', 'EVENTOS_PRO',
    'CLASES_BASE', 'CLASES_PRO', 'STORES_BASE', 'STORES_PRO', 'RESTAURANTE_PRO',
    'PERSONALIZACION_BASE', 'PERSONALIZACION_PLUS', 'CRM_BASE', 'CRM_PRO',
    'MENSAJERIA_BASE', 'MENSAJERIA_PRO', 'METRICAS_BASE', 'METRICAS_PRO',
    'MARKETPLACE_PLUS'
  ) NOT NULL;

ALTER TABLE `product_tier_capability`
  MODIFY `capability` ENUM(
    'RESERVAS_BASE', 'RESERVAS_PRO', 'RESERVAS_SERVICE_PROMOTIONS',
    'EVENTOS_BASE', 'EVENTOS_PRO', 'CLASES_BASE', 'CLASES_PRO', 'RESTAURANT_MODULE',
    'COMMERCE_ACCESS', 'COMMERCE_PRODUCTS', 'COMMERCE_CATEGORIES', 'COMMERCE_STOCK',
    'COMMERCE_ORDERS', 'COMMERCE_PICKUP', 'COMMERCE_DELIVERY', 'COMMERCE_SCHEDULED_ORDERS',
    'COMMERCE_COMBOS', 'COMMERCE_PROMOTIONS', 'COMMERCE_STAFF_ASSIGNMENT', 'COMMERCE_METRICS',
    'CRM_BASE', 'CRM_PRO', 'CRM_IMPORT_EXPORT', 'CRM_SEGMENTATION', 'CRM_REACTIVATION',
    'MENSAJERIA_BASE', 'MENSAJERIA_PRO', 'MENSAJERIA_REMINDERS', 'MENSAJERIA_BULK_WHATSAPP',
    'MENSAJERIA_REVIEW_REQUESTS', 'MENSAJERIA_CAMPAIGNS', 'PERSONALIZACION_BASE',
    'PERSONALIZACION_PLUS', 'STOREFRONT_ADVANCED_CTA', 'STOREFRONT_SECTION_ORDER',
    'STOREFRONT_FOOTER_CUSTOMIZATION', 'STOREFRONT_ANNOUNCEMENT_BANNERS', 'METRICAS_BASE',
    'METRICAS_PRO', 'METRICAS_OPERATIONAL_DASHBOARD', 'METRICAS_GROUP_ANALYTICS',
    'METRICAS_REVIEW_ANALYTICS', 'MARKETPLACE_LISTING', 'MARKETPLACE_PLUS'
  ) NOT NULL;

ALTER TABLE `company_capability_override`
  MODIFY `capability` ENUM(
    'RESERVAS_BASE', 'RESERVAS_PRO', 'RESERVAS_SERVICE_PROMOTIONS',
    'EVENTOS_BASE', 'EVENTOS_PRO', 'CLASES_BASE', 'CLASES_PRO', 'RESTAURANT_MODULE',
    'COMMERCE_ACCESS', 'COMMERCE_PRODUCTS', 'COMMERCE_CATEGORIES', 'COMMERCE_STOCK',
    'COMMERCE_ORDERS', 'COMMERCE_PICKUP', 'COMMERCE_DELIVERY', 'COMMERCE_SCHEDULED_ORDERS',
    'COMMERCE_COMBOS', 'COMMERCE_PROMOTIONS', 'COMMERCE_STAFF_ASSIGNMENT', 'COMMERCE_METRICS',
    'CRM_BASE', 'CRM_PRO', 'CRM_IMPORT_EXPORT', 'CRM_SEGMENTATION', 'CRM_REACTIVATION',
    'MENSAJERIA_BASE', 'MENSAJERIA_PRO', 'MENSAJERIA_REMINDERS', 'MENSAJERIA_BULK_WHATSAPP',
    'MENSAJERIA_REVIEW_REQUESTS', 'MENSAJERIA_CAMPAIGNS', 'PERSONALIZACION_BASE',
    'PERSONALIZACION_PLUS', 'STOREFRONT_ADVANCED_CTA', 'STOREFRONT_SECTION_ORDER',
    'STOREFRONT_FOOTER_CUSTOMIZATION', 'STOREFRONT_ANNOUNCEMENT_BANNERS', 'METRICAS_BASE',
    'METRICAS_PRO', 'METRICAS_OPERATIONAL_DASHBOARD', 'METRICAS_GROUP_ANALYTICS',
    'METRICAS_REVIEW_ANALYTICS', 'MARKETPLACE_LISTING', 'MARKETPLACE_PLUS'
  ) NOT NULL;

ALTER TABLE `product_access_request`
  MODIFY `product_code` ENUM(
    'RESERVAS', 'EVENTOS', 'CLASES', 'STORES', 'RESTAURANTE', 'PERSONALIZACION',
    'CRM', 'MENSAJERIA', 'METRICAS', 'MARKETPLACE'
  ) NOT NULL,
  MODIFY `tier_code` ENUM(
    'RESERVAS_BASE', 'RESERVAS_PRO', 'EVENTOS_BASE', 'EVENTOS_PRO',
    'CLASES_BASE', 'CLASES_PRO', 'STORES_BASE', 'STORES_PRO', 'RESTAURANTE_PRO',
    'PERSONALIZACION_BASE', 'PERSONALIZACION_PLUS', 'CRM_BASE', 'CRM_PRO',
    'MENSAJERIA_BASE', 'MENSAJERIA_PRO', 'METRICAS_BASE', 'METRICAS_PRO',
    'MARKETPLACE_PLUS'
  ) NOT NULL,
  MODIFY `capability` ENUM(
    'RESERVAS_BASE', 'RESERVAS_PRO', 'RESERVAS_SERVICE_PROMOTIONS',
    'EVENTOS_BASE', 'EVENTOS_PRO', 'CLASES_BASE', 'CLASES_PRO', 'RESTAURANT_MODULE',
    'COMMERCE_ACCESS', 'COMMERCE_PRODUCTS', 'COMMERCE_CATEGORIES', 'COMMERCE_STOCK',
    'COMMERCE_ORDERS', 'COMMERCE_PICKUP', 'COMMERCE_DELIVERY', 'COMMERCE_SCHEDULED_ORDERS',
    'COMMERCE_COMBOS', 'COMMERCE_PROMOTIONS', 'COMMERCE_STAFF_ASSIGNMENT', 'COMMERCE_METRICS',
    'CRM_BASE', 'CRM_PRO', 'CRM_IMPORT_EXPORT', 'CRM_SEGMENTATION', 'CRM_REACTIVATION',
    'MENSAJERIA_BASE', 'MENSAJERIA_PRO', 'MENSAJERIA_REMINDERS', 'MENSAJERIA_BULK_WHATSAPP',
    'MENSAJERIA_REVIEW_REQUESTS', 'MENSAJERIA_CAMPAIGNS', 'PERSONALIZACION_BASE',
    'PERSONALIZACION_PLUS', 'STOREFRONT_ADVANCED_CTA', 'STOREFRONT_SECTION_ORDER',
    'STOREFRONT_FOOTER_CUSTOMIZATION', 'STOREFRONT_ANNOUNCEMENT_BANNERS', 'METRICAS_BASE',
    'METRICAS_PRO', 'METRICAS_OPERATIONAL_DASHBOARD', 'METRICAS_GROUP_ANALYTICS',
    'METRICAS_REVIEW_ANALYTICS', 'MARKETPLACE_LISTING', 'MARKETPLACE_PLUS'
  ) NOT NULL;

INSERT INTO `product_catalog`
  (`code`, `name`, `description`, `category`, `is_core_product`, `is_addon`, `is_active`, `sort_order`)
VALUES
  ('RESTAURANTE', 'Restaurante', 'Table reservations, dining areas, service periods, and digital menus.', 'CORE_PRODUCT', TRUE, FALSE, TRUE, 37)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`), `description` = VALUES(`description`), `category` = VALUES(`category`),
  `is_core_product` = VALUES(`is_core_product`), `is_addon` = VALUES(`is_addon`),
  `is_active` = VALUES(`is_active`), `sort_order` = VALUES(`sort_order`);

INSERT INTO `product_tier`
  (`product_id`, `code`, `name`, `description`, `tier_level`, `is_base`, `is_pro`, `is_active`, `sort_order`)
SELECT `id`, 'RESTAURANTE_PRO', 'Restaurante Pro',
  'Table reservations, dining areas, service periods, daily operations, and digital menus.',
  2, FALSE, TRUE, TRUE, 69
FROM `product_catalog` WHERE `code` = 'RESTAURANTE'
ON DUPLICATE KEY UPDATE
  `product_id` = VALUES(`product_id`), `name` = VALUES(`name`), `description` = VALUES(`description`),
  `tier_level` = VALUES(`tier_level`), `is_base` = VALUES(`is_base`), `is_pro` = VALUES(`is_pro`),
  `is_active` = VALUES(`is_active`), `sort_order` = VALUES(`sort_order`);

INSERT IGNORE INTO `product_tier_capability` (`product_tier_id`, `capability`)
SELECT `id`, 'RESTAURANT_MODULE' FROM `product_tier` WHERE `code` = 'RESTAURANTE_PRO';

-- Preserve access for already-enabled modular restaurants while moving future
-- subscriptions to the independent Restaurante product.
INSERT IGNORE INTO `company_product_subscription`
  (`company_id`, `product_id`, `product_tier_id`, `status`, `billing_cycle`, `price_paid`, `currency`, `starts_at`, `available_until`)
SELECT
  c.`id`, restaurant_product.`id`, restaurant_tier.`id`, reservas_subscription.`status`,
  reservas_subscription.`billing_cycle`, reservas_subscription.`price_paid`, reservas_subscription.`currency`,
  reservas_subscription.`starts_at`, reservas_subscription.`available_until`
FROM `company` c
JOIN `company_product_subscription` reservas_subscription ON reservas_subscription.`company_id` = c.`id`
JOIN `product_tier` reservas_tier ON reservas_tier.`id` = reservas_subscription.`product_tier_id` AND reservas_tier.`code` = 'RESERVAS_PRO'
JOIN `product_catalog` restaurant_product ON restaurant_product.`code` = 'RESTAURANTE'
JOIN `product_tier` restaurant_tier ON restaurant_tier.`code` = 'RESTAURANTE_PRO'
WHERE c.`restaurant_enabled` = TRUE;
