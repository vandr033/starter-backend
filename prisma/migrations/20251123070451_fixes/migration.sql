/*
  Warnings:

  - You are about to drop the column `subcategory_id` on the `service` table. All the data in the column will be lost.
  - You are about to drop the `subcategory` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `category_id` to the `service` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `service` DROP FOREIGN KEY `service_subcategory_id_fkey`;

-- DropForeignKey
ALTER TABLE `subcategory` DROP FOREIGN KEY `subcategory_category_id_fkey`;

-- DropForeignKey
ALTER TABLE `subcategory` DROP FOREIGN KEY `subcategory_company_id_fkey`;

-- DropIndex
DROP INDEX `service_subcategory_id_is_active_position_idx` ON `service`;

-- AlterTable
ALTER TABLE `service` DROP COLUMN `subcategory_id`,
    ADD COLUMN `category_id` INTEGER NOT NULL;

-- DropTable
DROP TABLE `subcategory`;

-- CreateIndex
CREATE INDEX `service_category_id_is_active_position_idx` ON `service`(`category_id`, `is_active`, `position`);

-- AddForeignKey
ALTER TABLE `service` ADD CONSTRAINT `service_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
