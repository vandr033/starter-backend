CREATE TABLE `restaurant_notification_log` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `reservation_id` INTEGER NOT NULL,
  `event` ENUM('RESTAURANT_RESERVATION_CREATED', 'RESTAURANT_RESERVATION_CONFIRMED', 'RESTAURANT_RESERVATION_UPDATED', 'RESTAURANT_RESERVATION_CANCELLED', 'RESTAURANT_RESERVATION_REMINDER') NOT NULL,
  `channel` ENUM('EMAIL', 'WHATSAPP') NOT NULL,
  `status` ENUM('PENDING', 'SENT', 'FAILED', 'SKIPPED') NOT NULL,
  `trigger` ENUM('AUTOMATIC', 'MANUAL') NOT NULL DEFAULT 'AUTOMATIC',
  `recipient` VARCHAR(255) NULL,
  `provider_id` VARCHAR(255) NULL,
  `error_code` VARCHAR(100) NULL,
  `error_message` VARCHAR(500) NULL,
  `dedup_key` VARCHAR(255) NULL,
  `sent_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `restaurant_notification_log_company_reservation_idx`(`company_id`, `reservation_id`),
  INDEX `restaurant_notification_log_company_status_idx`(`company_id`, `status`),
  INDEX `restaurant_notification_log_reservation_event_idx`(`reservation_id`, `event`),
  INDEX `restaurant_notification_log_dedup_idx`(`reservation_id`, `event`, `channel`, `dedup_key`),
  PRIMARY KEY (`id`),
  CONSTRAINT `restaurant_notification_log_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `restaurant_notification_log_reservation_id_fkey` FOREIGN KEY (`reservation_id`) REFERENCES `restaurant_reservation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX `restaurant_reservation_company_start_time_idx` ON `restaurant_reservation`(`company_id`, `start_time`);
CREATE INDEX `restaurant_reservation_company_status_start_time_idx` ON `restaurant_reservation`(`company_id`, `status`, `start_time`);
CREATE INDEX `restaurant_reservation_company_source_start_time_idx` ON `restaurant_reservation`(`company_id`, `source`, `start_time`);
