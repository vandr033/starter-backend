ALTER TABLE `commerce_order`
  ADD COLUMN `public_access_token` VARCHAR(128) NULL;

UPDATE `commerce_order`
SET `public_access_token` = REPLACE(UUID(), '-', '')
WHERE `public_access_token` IS NULL;

ALTER TABLE `commerce_order`
  MODIFY `public_access_token` VARCHAR(128) NOT NULL;

CREATE UNIQUE INDEX `commerce_order_public_access_token_key`
  ON `commerce_order`(`public_access_token`);
