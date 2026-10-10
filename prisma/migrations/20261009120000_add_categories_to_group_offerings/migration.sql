ALTER TABLE `group_event` ADD COLUMN `category_id` INTEGER NULL;
ALTER TABLE `group_class` ADD COLUMN `category_id` INTEGER NULL;

INSERT INTO `category` (`company_id`, `name`, `slug`, `description`, `position`, `is_active`, `created_at`, `updated_at`)
SELECT companies.`company_id`, 'Uncategorized', CONCAT('auto-uncategorized-', companies.`company_id`), 'Assigned to existing events and classes', 2147483647, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM (
  SELECT `company_id` FROM `group_event`
  UNION
  SELECT `company_id` FROM `group_class`
) AS companies
WHERE NOT EXISTS (
  SELECT 1 FROM `category` c
  WHERE c.`company_id` = companies.`company_id`
    AND c.`slug` = CONCAT('auto-uncategorized-', companies.`company_id`)
);

UPDATE `group_event` event
JOIN `category` category
  ON category.`company_id` = event.`company_id`
  AND category.`slug` = CONCAT('auto-uncategorized-', event.`company_id`)
SET event.`category_id` = category.`id`;

UPDATE `group_class` group_class
JOIN `category` category
  ON category.`company_id` = group_class.`company_id`
  AND category.`slug` = CONCAT('auto-uncategorized-', group_class.`company_id`)
SET group_class.`category_id` = category.`id`;

ALTER TABLE `group_event`
  MODIFY `category_id` INTEGER NOT NULL,
  ADD INDEX `group_event_category_id_idx` (`category_id`),
  ADD CONSTRAINT `group_event_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `group_class`
  MODIFY `category_id` INTEGER NOT NULL,
  ADD INDEX `group_class_category_id_idx` (`category_id`),
  ADD CONSTRAINT `group_class_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
