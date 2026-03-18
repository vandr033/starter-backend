-- AlterTable: change comment from VARCHAR(255) to TEXT, make nullable
ALTER TABLE `review` MODIFY COLUMN `comment` TEXT NULL;

-- AddColumn: staff_id reference
ALTER TABLE `review` ADD COLUMN `staff_id` INTEGER NULL;

-- AddColumn: sub-ratings (all optional 1-5)
ALTER TABLE `review` ADD COLUMN `rating_service_quality` INTEGER NULL;
ALTER TABLE `review` ADD COLUMN `rating_staff_attention` INTEGER NULL;
ALTER TABLE `review` ADD COLUMN `rating_punctuality` INTEGER NULL;
ALTER TABLE `review` ADD COLUMN `rating_cleanliness` INTEGER NULL;

-- CreateIndex: staff foreign key index
CREATE INDEX `review_staff_id_fkey` ON `review`(`staff_id`);

-- CreateIndex: company + created_at desc for listing
CREATE INDEX `review_company_id_created_at_idx` ON `review`(`company_id`, `created_at` DESC);

-- AddForeignKey
ALTER TABLE `review` ADD CONSTRAINT `review_staff_id_fkey` FOREIGN KEY (`staff_id`) REFERENCES `staff_profile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
