-- AlterTable: change comment from VARCHAR(255) to TEXT, make nullable (MODIFY is safe to re-run)
ALTER TABLE `review` MODIFY COLUMN `comment` TEXT NULL;

-- AddColumn: staff_id reference
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'review' AND COLUMN_NAME = 'staff_id');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `review` ADD COLUMN `staff_id` INTEGER NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- AddColumn: sub-ratings
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'review' AND COLUMN_NAME = 'rating_service_quality');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `review` ADD COLUMN `rating_service_quality` INTEGER NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'review' AND COLUMN_NAME = 'rating_staff_attention');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `review` ADD COLUMN `rating_staff_attention` INTEGER NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'review' AND COLUMN_NAME = 'rating_punctuality');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `review` ADD COLUMN `rating_punctuality` INTEGER NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'review' AND COLUMN_NAME = 'rating_cleanliness');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `review` ADD COLUMN `rating_cleanliness` INTEGER NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- CreateIndex: staff foreign key index
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'review' AND INDEX_NAME = 'review_staff_id_fkey');
SET @sql := IF(@idx_exists = 0, 'CREATE INDEX `review_staff_id_fkey` ON `review`(`staff_id`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- CreateIndex: company + created_at desc for listing
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'review' AND INDEX_NAME = 'review_company_id_created_at_idx');
SET @sql := IF(@idx_exists = 0, 'CREATE INDEX `review_company_id_created_at_idx` ON `review`(`company_id`, `created_at` DESC)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- AddForeignKey
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'review' AND CONSTRAINT_NAME = 'review_staff_id_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@fk_exists = 0, 'ALTER TABLE `review` ADD CONSTRAINT `review_staff_id_fkey` FOREIGN KEY (`staff_id`) REFERENCES `staff_profile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
