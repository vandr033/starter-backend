ALTER TABLE `commerce_product`
    ADD COLUMN `promo_valid_from` DATETIME(3) NULL,
    ADD COLUMN `promo_valid_until` DATETIME(3) NULL;
