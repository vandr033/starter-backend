ALTER TABLE `restaurant_settings`
  ADD COLUMN `deposit_enabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `deposit_amount_cents` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `deposit_mode` ENUM('PER_PERSON', 'PER_TABLE') NOT NULL DEFAULT 'PER_TABLE',
  ADD COLUMN `deposit_qr_image_url` VARCHAR(512) NULL;

ALTER TABLE `restaurant_reservation`
  ADD COLUMN `deposit_amount_cents` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `deposit_mode` ENUM('PER_PERSON', 'PER_TABLE') NULL;
