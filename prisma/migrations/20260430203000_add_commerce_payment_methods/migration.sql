ALTER TABLE `commerce_store`
  CHANGE COLUMN `qr_payment_enabled` `allow_qr_payment` BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE `commerce_store`
  ADD COLUMN `allow_cash_payment` BOOLEAN NOT NULL DEFAULT TRUE AFTER `max_schedule_days_ahead`,
  ADD COLUMN `allow_manual_payment` BOOLEAN NOT NULL DEFAULT FALSE AFTER `allow_qr_payment`;

ALTER TABLE `commerce_order`
  ADD COLUMN `payment_method` ENUM('CASH', 'QR', 'MANUAL') NOT NULL DEFAULT 'QR' AFTER `total`;
