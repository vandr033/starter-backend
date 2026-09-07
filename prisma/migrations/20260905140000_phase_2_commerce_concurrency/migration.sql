-- Phase 2: transactional commerce order-number allocation.
-- The counter is company-scoped and is initialized above every historical
-- numeric TDA order number without changing any existing order number.
CREATE TABLE `commerce_order_sequence` (
    `company_id` INTEGER NOT NULL,
    `next_order_number` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`company_id`),
    CONSTRAINT `commerce_order_sequence_company_id_fkey`
        FOREIGN KEY (`company_id`) REFERENCES `company`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `commerce_order_sequence` (
    `company_id`,
    `next_order_number`,
    `created_at`,
    `updated_at`
)
SELECT
    `company_id`,
    MAX(CAST(SUBSTRING(`order_number`, 5) AS UNSIGNED)) + 1,
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
FROM `commerce_order`
WHERE `order_number` REGEXP '^TDA-[0-9]+$'
GROUP BY `company_id`;
