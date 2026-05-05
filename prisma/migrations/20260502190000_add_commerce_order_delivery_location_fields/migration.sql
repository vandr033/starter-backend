ALTER TABLE `commerce_order`
  ADD COLUMN `delivery_latitude` DOUBLE NULL AFTER `delivery_notes`,
  ADD COLUMN `delivery_longitude` DOUBLE NULL AFTER `delivery_latitude`,
  ADD COLUMN `delivery_place_id` VARCHAR(191) NULL AFTER `delivery_longitude`,
  ADD COLUMN `delivery_location_meta` JSON NULL AFTER `delivery_place_id`;
