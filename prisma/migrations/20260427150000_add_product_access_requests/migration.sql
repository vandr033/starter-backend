CREATE TABLE `product_access_request` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `requested_by_user_id` VARCHAR(191) NOT NULL,
  `product_code` ENUM(
    'RESERVAS',
    'EVENTOS',
    'CLASES',
    'PERSONALIZACION',
    'CRM',
    'MENSAJERIA',
    'METRICAS',
    'MARKETPLACE'
  ) NOT NULL,
  `tier_code` ENUM(
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
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `message` VARCHAR(500) NULL,
  `source` ENUM(
    'ADMIN_LOCKED_PAGE',
    'API_403',
    'SETTINGS_LOCKED_CONTROL',
    'SIDEBAR_LOCKED_ITEM',
    'PUBLIC_PRICING',
    'SUPER_ADMIN_MANUAL'
  ) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `resolved_at` DATETIME(3) NULL,
  `resolved_by_user_id` VARCHAR(191) NULL,
  `internal_note` VARCHAR(500) NULL,

  INDEX `product_access_request_company_id_status_idx`(`company_id`, `status`),
  INDEX `product_access_request_product_tier_status_idx`(`product_code`, `tier_code`, `status`),
  INDEX `product_access_request_requested_by_user_id_idx`(`requested_by_user_id`),
  INDEX `product_access_request_resolved_by_user_id_idx`(`resolved_by_user_id`),
  INDEX `product_access_request_source_created_at_idx`(`source`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `product_access_request`
  ADD CONSTRAINT `product_access_request_company_id_fkey`
    FOREIGN KEY (`company_id`) REFERENCES `company`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `product_access_request_requested_by_user_id_fkey`
    FOREIGN KEY (`requested_by_user_id`) REFERENCES `user`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `product_access_request_resolved_by_user_id_fkey`
    FOREIGN KEY (`resolved_by_user_id`) REFERENCES `user`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
