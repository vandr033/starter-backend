ALTER TABLE `company`
  ADD COLUMN `currency` VARCHAR(3) NOT NULL DEFAULT 'Bs.' AFTER `timezone`;
