-- Add booking-level extra attendee capture for multi-spot event bookings
ALTER TABLE `group_event_booking`
    ADD COLUMN `extra_attendees_json` JSON NULL;

-- Add per-ticket holder metadata and seat ordering for event multi-ticket issuance
ALTER TABLE `group_ticket`
    ADD COLUMN `seat_number` INTEGER NULL,
    ADD COLUMN `holder_name` VARCHAR(255) NULL,
    ADD COLUMN `holder_email` VARCHAR(191) NULL,
    ADD COLUMN `holder_phone` VARCHAR(64) NULL;

-- Optional helper index for event-seat lookups
CREATE INDEX `group_ticket_group_event_booking_id_seat_number_idx`
    ON `group_ticket`(`group_event_booking_id`, `seat_number`);
