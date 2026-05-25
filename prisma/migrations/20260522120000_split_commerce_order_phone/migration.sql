ALTER TABLE `commerce_order`
  ADD COLUMN `customer_phone_prefix` VARCHAR(8) NULL AFTER `customer_name`;

UPDATE `commerce_order`
SET
  `customer_phone_prefix` = CASE
    WHEN `customer_phone` REGEXP '^[0-9]+$' AND `customer_phone` LIKE '591%' AND CHAR_LENGTH(`customer_phone`) > 8
      THEN '591'
    WHEN `customer_phone` REGEXP '^[0-9]+$' AND `customer_phone` LIKE '1%' AND CHAR_LENGTH(`customer_phone`) = 11
      THEN '1'
    ELSE `customer_phone_prefix`
  END,
  `customer_phone` = CASE
    WHEN `customer_phone` REGEXP '^[0-9]+$' AND `customer_phone` LIKE '591%' AND CHAR_LENGTH(`customer_phone`) > 8
      THEN SUBSTRING(`customer_phone`, 4)
    WHEN `customer_phone` REGEXP '^[0-9]+$' AND `customer_phone` LIKE '1%' AND CHAR_LENGTH(`customer_phone`) = 11
      THEN SUBSTRING(`customer_phone`, 2)
    ELSE `customer_phone`
  END;
