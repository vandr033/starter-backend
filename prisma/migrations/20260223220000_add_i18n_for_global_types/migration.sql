-- AlterTable
ALTER TABLE `company_type`
    ADD COLUMN `name_i18n` JSON NOT NULL DEFAULT ('{}'),
    ADD COLUMN `description_i18n` JSON NOT NULL DEFAULT ('{}');

-- AlterTable
ALTER TABLE `global_service_type`
    ADD COLUMN `name_i18n` JSON NOT NULL DEFAULT ('{}'),
    ADD COLUMN `description_i18n` JSON NOT NULL DEFAULT ('{}');
