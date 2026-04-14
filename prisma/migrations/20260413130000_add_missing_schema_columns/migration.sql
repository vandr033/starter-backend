ALTER TABLE `company_settings` ADD COLUMN `require_comprobante_for_qr` BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE `company_settings` ADD COLUMN `auto_confirm_bookings` BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE `company_settings` ADD COLUMN `max_advance_booking_days` INTEGER NULL;

ALTER TABLE `theme_config` ADD COLUMN `home_section_order` JSON NULL;
ALTER TABLE `theme_config` ADD COLUMN `footer_config` JSON NULL;
ALTER TABLE `theme_config` ADD COLUMN `announcement_banners` JSON NULL;
