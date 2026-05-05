ALTER TABLE `commerce_point_of_sale`
  ADD COLUMN `opening_time` VARCHAR(5) NOT NULL DEFAULT '09:00' AFTER `address`,
  ADD COLUMN `closing_time` VARCHAR(5) NOT NULL DEFAULT '18:00' AFTER `opening_time`;
