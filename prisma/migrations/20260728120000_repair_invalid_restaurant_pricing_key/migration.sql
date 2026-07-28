-- A server started with a Prisma client generated before RESTAURANTE existed
-- could insert an empty MySQL enum value while bootstrapping pricing defaults.
-- Keep an already-valid Restaurant record and otherwise promote the invalid
-- record so Prisma can deserialize the pricing table again.
DELETE invalid_product
FROM `business_pricing_product` AS invalid_product
INNER JOIN `business_pricing_product` AS restaurant_product
  ON restaurant_product.`product_key` = 'RESTAURANTE'
WHERE invalid_product.`product_key` = '';

UPDATE `business_pricing_product`
SET `product_key` = 'RESTAURANTE'
WHERE `product_key` = '';
