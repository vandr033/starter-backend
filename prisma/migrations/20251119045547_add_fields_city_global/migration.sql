-- AlterTable
ALTER TABLE `company` ADD COLUMN `city` VARCHAR(128) NULL,
    ADD COLUMN `country_code` VARCHAR(2) NULL,
    ADD COLUMN `state` VARCHAR(128) NULL;

-- AlterTable
ALTER TABLE `service` ADD COLUMN `global_type_id` BIGINT NULL;

-- CreateTable
CREATE TABLE `global_service_type` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(64) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(255) NULL,

    UNIQUE INDEX `global_service_type_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `company_city_country_code_is_active_idx` ON `company`(`city`, `country_code`, `is_active`);

-- AddForeignKey
ALTER TABLE `service` ADD CONSTRAINT `service_global_type_id_fkey` FOREIGN KEY (`global_type_id`) REFERENCES `global_service_type`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
