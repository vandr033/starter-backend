ALTER TABLE `group_event`
  ADD COLUMN `confirmations_enabled` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `group_event_booking`
  ADD COLUMN `declined_spots` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `waitlist_offer_expires_at` DATETIME(3) NULL;

ALTER TABLE `free_event_registration`
  ADD COLUMN `confirmation_token` VARCHAR(64) NULL,
  ADD COLUMN `confirmation_status` ENUM('NOT_REQUESTED', 'PENDING', 'ATTENDING', 'NOT_ATTENDING') NOT NULL DEFAULT 'NOT_REQUESTED',
  ADD COLUMN `confirmation_reason` VARCHAR(500) NULL,
  ADD COLUMN `confirmation_responded_at` DATETIME(3) NULL,
  ADD UNIQUE INDEX `free_event_registration_confirmation_token_key` (`confirmation_token`);

CREATE TABLE `group_event_attendee` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `group_event_id` INTEGER NOT NULL,
  `group_event_booking_id` INTEGER NOT NULL,
  `seat_number` INTEGER NOT NULL,
  `full_name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(254) NULL,
  `phone` VARCHAR(64) NULL,
  `confirmation_token` VARCHAR(64) NOT NULL,
  `confirmation_status` ENUM('NOT_REQUESTED', 'PENDING', 'ATTENDING', 'NOT_ATTENDING') NOT NULL DEFAULT 'PENDING',
  `confirmation_reason` VARCHAR(500) NULL,
  `confirmation_responded_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `group_event_attendee_confirmation_token_key` (`confirmation_token`),
  UNIQUE INDEX `group_event_attendee_group_event_booking_id_seat_number_key` (`group_event_booking_id`, `seat_number`),
  INDEX `group_event_attendee_company_id_group_event_id_confirmation_status_idx` (`company_id`, `group_event_id`, `confirmation_status`),
  INDEX `group_event_attendee_group_event_booking_id_idx` (`group_event_booking_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `group_event_attendee_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `group_event_attendee_group_event_id_fkey` FOREIGN KEY (`group_event_id`) REFERENCES `group_event` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `group_event_attendee_group_event_booking_id_fkey` FOREIGN KEY (`group_event_booking_id`) REFERENCES `group_event_booking` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
