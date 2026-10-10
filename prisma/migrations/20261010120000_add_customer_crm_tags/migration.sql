CREATE TABLE `customer_crm_record` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `customer_key` VARCHAR(512) NOT NULL,
  `internal_notes` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `customer_crm_record_company_id_customer_key_key` (`company_id`, `customer_key`),
  PRIMARY KEY (`id`),
  CONSTRAINT `customer_crm_record_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `customer_tag` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `name` VARCHAR(64) NOT NULL,
  `color` VARCHAR(7) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `customer_tag_company_id_name_key` (`company_id`, `name`),
  PRIMARY KEY (`id`),
  CONSTRAINT `customer_tag_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `customer_crm_tag_assignment` (
  `customer_record_id` INTEGER NOT NULL,
  `tag_id` INTEGER NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `customer_crm_tag_assignment_tag_id_idx` (`tag_id`),
  PRIMARY KEY (`customer_record_id`, `tag_id`),
  CONSTRAINT `customer_crm_tag_assignment_customer_record_id_fkey` FOREIGN KEY (`customer_record_id`) REFERENCES `customer_crm_record` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `customer_crm_tag_assignment_tag_id_fkey` FOREIGN KEY (`tag_id`) REFERENCES `customer_tag` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
