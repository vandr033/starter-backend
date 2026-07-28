CREATE TABLE `restaurant_reservation_guest` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `reservation_id` INTEGER NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `whatsapp_phone` VARCHAR(32) NOT NULL,
  `invited_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `restaurant_reservation_guest_phone_key`(`reservation_id`, `whatsapp_phone`),
  INDEX `restaurant_reservation_guest_reservation_id_idx`(`reservation_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `restaurant_reservation_guest_reservation_id_fkey`
    FOREIGN KEY (`reservation_id`) REFERENCES `restaurant_reservation`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
);
