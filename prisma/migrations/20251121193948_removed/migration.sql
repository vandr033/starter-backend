/*
  Warnings:

  - The primary key for the `auth_session` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `auth_session` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `user_id` on the `auth_session` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `company_id` on the `auth_session` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - The primary key for the `booking` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `booking` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `company_id` on the `booking` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `staff_id` on the `booking` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `customer_id` on the `booking` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `created_by_user_id` on the `booking` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `updated_by_user_id` on the `booking` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - The primary key for the `booking_discount` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `booking_discount` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `booking_id` on the `booking_discount` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `discount_code_id` on the `booking_discount` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `company_id` on the `booking_discount` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - The primary key for the `booking_service` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `booking_service` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `booking_id` on the `booking_service` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `company_id` on the `booking_service` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `service_id` on the `booking_service` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - The primary key for the `category` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `category` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `company_id` on the `category` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - The primary key for the `company` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `company` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `company_type_id` on the `company` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - The primary key for the `company_settings` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `company_settings` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `company_id` on the `company_settings` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - The primary key for the `company_type` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `company_type` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - The primary key for the `company_user` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `company_user` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `company_id` on the `company_user` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `user_id` on the `company_user` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - The primary key for the `config_message` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `config_message` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `company_id` on the `config_message` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - The primary key for the `customer_profile` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `customer_profile` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `company_id` on the `customer_profile` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `user_id` on the `customer_profile` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `preferred_staff_id` on the `customer_profile` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - The primary key for the `discount_code` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `discount_code` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `company_id` on the `discount_code` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - The primary key for the `frequently_asked_question` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `frequently_asked_question` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - The primary key for the `global_service_type` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `global_service_type` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - The primary key for the `hours` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `hours` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `company_id` on the `hours` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - The primary key for the `service` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `service` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `company_id` on the `service` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `subcategory_id` on the `service` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `global_type_id` on the `service` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - The primary key for the `staff_profile` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `staff_profile` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `company_id` on the `staff_profile` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `user_id` on the `staff_profile` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - The primary key for the `subcategory` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `subcategory` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `category_id` on the `subcategory` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `company_id` on the `subcategory` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - The primary key for the `theme_config` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `theme_config` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `company_id` on the `theme_config` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - The primary key for the `types` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `types` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - The primary key for the `user` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `user` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.

*/
-- DropForeignKey
ALTER TABLE `auth_session` DROP FOREIGN KEY `auth_session_company_id_fkey`;

-- DropForeignKey
ALTER TABLE `auth_session` DROP FOREIGN KEY `auth_session_user_id_fkey`;

-- DropForeignKey
ALTER TABLE `booking` DROP FOREIGN KEY `booking_company_id_fkey`;

-- DropForeignKey
ALTER TABLE `booking` DROP FOREIGN KEY `booking_created_by_user_id_fkey`;

-- DropForeignKey
ALTER TABLE `booking` DROP FOREIGN KEY `booking_customer_id_fkey`;

-- DropForeignKey
ALTER TABLE `booking` DROP FOREIGN KEY `booking_staff_id_fkey`;

-- DropForeignKey
ALTER TABLE `booking` DROP FOREIGN KEY `booking_updated_by_user_id_fkey`;

-- DropForeignKey
ALTER TABLE `booking_discount` DROP FOREIGN KEY `booking_discount_booking_id_fkey`;

-- DropForeignKey
ALTER TABLE `booking_discount` DROP FOREIGN KEY `booking_discount_company_id_fkey`;

-- DropForeignKey
ALTER TABLE `booking_discount` DROP FOREIGN KEY `booking_discount_discount_code_id_fkey`;

-- DropForeignKey
ALTER TABLE `booking_service` DROP FOREIGN KEY `booking_service_booking_id_fkey`;

-- DropForeignKey
ALTER TABLE `booking_service` DROP FOREIGN KEY `booking_service_company_id_fkey`;

-- DropForeignKey
ALTER TABLE `booking_service` DROP FOREIGN KEY `booking_service_service_id_fkey`;

-- DropForeignKey
ALTER TABLE `category` DROP FOREIGN KEY `category_company_id_fkey`;

-- DropForeignKey
ALTER TABLE `company` DROP FOREIGN KEY `company_company_type_id_fkey`;

-- DropForeignKey
ALTER TABLE `company_settings` DROP FOREIGN KEY `company_settings_company_id_fkey`;

-- DropForeignKey
ALTER TABLE `company_user` DROP FOREIGN KEY `company_user_company_id_fkey`;

-- DropForeignKey
ALTER TABLE `company_user` DROP FOREIGN KEY `company_user_user_id_fkey`;

-- DropForeignKey
ALTER TABLE `config_message` DROP FOREIGN KEY `config_message_company_id_fkey`;

-- DropForeignKey
ALTER TABLE `customer_profile` DROP FOREIGN KEY `customer_profile_company_id_fkey`;

-- DropForeignKey
ALTER TABLE `customer_profile` DROP FOREIGN KEY `customer_profile_preferred_staff_id_fkey`;

-- DropForeignKey
ALTER TABLE `customer_profile` DROP FOREIGN KEY `customer_profile_user_id_fkey`;

-- DropForeignKey
ALTER TABLE `discount_code` DROP FOREIGN KEY `discount_code_company_id_fkey`;

-- DropForeignKey
ALTER TABLE `hours` DROP FOREIGN KEY `hours_company_id_fkey`;

-- DropForeignKey
ALTER TABLE `service` DROP FOREIGN KEY `service_company_id_fkey`;

-- DropForeignKey
ALTER TABLE `service` DROP FOREIGN KEY `service_global_type_id_fkey`;

-- DropForeignKey
ALTER TABLE `service` DROP FOREIGN KEY `service_subcategory_id_fkey`;

-- DropForeignKey
ALTER TABLE `staff_profile` DROP FOREIGN KEY `staff_profile_company_id_fkey`;

-- DropForeignKey
ALTER TABLE `staff_profile` DROP FOREIGN KEY `staff_profile_user_id_fkey`;

-- DropForeignKey
ALTER TABLE `subcategory` DROP FOREIGN KEY `subcategory_category_id_fkey`;

-- DropForeignKey
ALTER TABLE `subcategory` DROP FOREIGN KEY `subcategory_company_id_fkey`;

-- DropForeignKey
ALTER TABLE `theme_config` DROP FOREIGN KEY `theme_config_company_id_fkey`;

-- DropIndex
DROP INDEX `booking_created_by_user_id_fkey` ON `booking`;

-- DropIndex
DROP INDEX `booking_customer_id_fkey` ON `booking`;

-- DropIndex
DROP INDEX `booking_updated_by_user_id_fkey` ON `booking`;

-- DropIndex
DROP INDEX `booking_discount_discount_code_id_fkey` ON `booking_discount`;

-- DropIndex
DROP INDEX `booking_service_service_id_fkey` ON `booking_service`;

-- DropIndex
DROP INDEX `company_company_type_id_fkey` ON `company`;

-- DropIndex
DROP INDEX `customer_profile_user_id_fkey` ON `customer_profile`;

-- DropIndex
DROP INDEX `service_global_type_id_fkey` ON `service`;

-- DropIndex
DROP INDEX `staff_profile_user_id_fkey` ON `staff_profile`;

-- AlterTable
ALTER TABLE `auth_session` DROP PRIMARY KEY,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    MODIFY `user_id` INTEGER NOT NULL,
    MODIFY `company_id` INTEGER NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `booking` DROP PRIMARY KEY,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    MODIFY `company_id` INTEGER NOT NULL,
    MODIFY `staff_id` INTEGER NOT NULL,
    MODIFY `customer_id` INTEGER NULL,
    MODIFY `created_by_user_id` INTEGER NULL,
    MODIFY `updated_by_user_id` INTEGER NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `booking_discount` DROP PRIMARY KEY,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    MODIFY `booking_id` INTEGER NOT NULL,
    MODIFY `discount_code_id` INTEGER NOT NULL,
    MODIFY `company_id` INTEGER NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `booking_service` DROP PRIMARY KEY,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    MODIFY `booking_id` INTEGER NOT NULL,
    MODIFY `company_id` INTEGER NOT NULL,
    MODIFY `service_id` INTEGER NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `category` DROP PRIMARY KEY,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    MODIFY `company_id` INTEGER NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `company` DROP PRIMARY KEY,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    MODIFY `company_type_id` INTEGER NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `company_settings` DROP PRIMARY KEY,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    MODIFY `company_id` INTEGER NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `company_type` DROP PRIMARY KEY,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `company_user` DROP PRIMARY KEY,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    MODIFY `company_id` INTEGER NOT NULL,
    MODIFY `user_id` INTEGER NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `config_message` DROP PRIMARY KEY,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    MODIFY `company_id` INTEGER NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `customer_profile` DROP PRIMARY KEY,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    MODIFY `company_id` INTEGER NOT NULL,
    MODIFY `user_id` INTEGER NOT NULL,
    MODIFY `preferred_staff_id` INTEGER NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `discount_code` DROP PRIMARY KEY,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    MODIFY `company_id` INTEGER NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `frequently_asked_question` DROP PRIMARY KEY,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `global_service_type` DROP PRIMARY KEY,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `hours` DROP PRIMARY KEY,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    MODIFY `company_id` INTEGER NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `service` DROP PRIMARY KEY,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    MODIFY `company_id` INTEGER NOT NULL,
    MODIFY `subcategory_id` INTEGER NOT NULL,
    MODIFY `global_type_id` INTEGER NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `staff_profile` DROP PRIMARY KEY,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    MODIFY `company_id` INTEGER NOT NULL,
    MODIFY `user_id` INTEGER NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `subcategory` DROP PRIMARY KEY,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    MODIFY `category_id` INTEGER NOT NULL,
    MODIFY `company_id` INTEGER NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `theme_config` DROP PRIMARY KEY,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    MODIFY `company_id` INTEGER NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `types` DROP PRIMARY KEY,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `user` DROP PRIMARY KEY,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    ADD PRIMARY KEY (`id`);

-- AddForeignKey
ALTER TABLE `company` ADD CONSTRAINT `company_company_type_id_fkey` FOREIGN KEY (`company_type_id`) REFERENCES `company_type`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `theme_config` ADD CONSTRAINT `theme_config_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `company_settings` ADD CONSTRAINT `company_settings_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `company_user` ADD CONSTRAINT `company_user_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `company_user` ADD CONSTRAINT `company_user_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff_profile` ADD CONSTRAINT `staff_profile_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff_profile` ADD CONSTRAINT `staff_profile_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_profile` ADD CONSTRAINT `customer_profile_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_profile` ADD CONSTRAINT `customer_profile_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_profile` ADD CONSTRAINT `customer_profile_preferred_staff_id_fkey` FOREIGN KEY (`preferred_staff_id`) REFERENCES `staff_profile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `category` ADD CONSTRAINT `category_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subcategory` ADD CONSTRAINT `subcategory_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subcategory` ADD CONSTRAINT `subcategory_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service` ADD CONSTRAINT `service_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service` ADD CONSTRAINT `service_subcategory_id_fkey` FOREIGN KEY (`subcategory_id`) REFERENCES `subcategory`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service` ADD CONSTRAINT `service_global_type_id_fkey` FOREIGN KEY (`global_type_id`) REFERENCES `global_service_type`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hours` ADD CONSTRAINT `hours_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking` ADD CONSTRAINT `booking_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking` ADD CONSTRAINT `booking_staff_id_fkey` FOREIGN KEY (`staff_id`) REFERENCES `staff_profile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking` ADD CONSTRAINT `booking_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customer_profile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking` ADD CONSTRAINT `booking_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking` ADD CONSTRAINT `booking_updated_by_user_id_fkey` FOREIGN KEY (`updated_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_service` ADD CONSTRAINT `booking_service_booking_id_fkey` FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_service` ADD CONSTRAINT `booking_service_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_service` ADD CONSTRAINT `booking_service_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `service`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `discount_code` ADD CONSTRAINT `discount_code_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_discount` ADD CONSTRAINT `booking_discount_booking_id_fkey` FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_discount` ADD CONSTRAINT `booking_discount_discount_code_id_fkey` FOREIGN KEY (`discount_code_id`) REFERENCES `discount_code`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_discount` ADD CONSTRAINT `booking_discount_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `config_message` ADD CONSTRAINT `config_message_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auth_session` ADD CONSTRAINT `auth_session_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auth_session` ADD CONSTRAINT `auth_session_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
