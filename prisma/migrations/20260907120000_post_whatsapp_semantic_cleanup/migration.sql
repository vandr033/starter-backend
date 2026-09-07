-- Keep legacy notification records aligned with the durable WhatsApp outbox.
-- Existing notification rows remain historical SENT rows; only new linked jobs
-- receive worker-owned lifecycle updates.

ALTER TABLE `restaurant_notification_log`
    MODIFY COLUMN `status` ENUM(
        'PENDING',
        'PROCESSING',
        'SENT',
        'FAILED',
        'SKIPPED',
        'EXPIRED',
        'CANCELLED'
    ) NOT NULL,
    ADD COLUMN `reservation_guest_id` INTEGER NULL,
    ADD COLUMN `outbound_message_job_id` INTEGER NULL,
    ADD INDEX `restaurant_notification_log_reservation_guest_idx` (`reservation_guest_id`),
    ADD INDEX `restaurant_notification_log_outbound_job_idx` (`outbound_message_job_id`);

ALTER TABLE `booking_notification_attempt`
    ADD COLUMN `outbound_message_job_id` INTEGER NULL,
    ADD INDEX `booking_notification_outbound_job_idx` (`outbound_message_job_id`);

ALTER TABLE `installment_reminder_log`
    ADD COLUMN `status` VARCHAR(32) NOT NULL DEFAULT 'SENT' AFTER `message_body`,
    MODIFY COLUMN `sent_at` DATETIME(3) NULL,
    ADD COLUMN `outbound_message_job_id` INTEGER NULL AFTER `sent_at`,
    ADD COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `updated_at` DATETIME(3) NOT NULL,
    ADD INDEX `installment_reminder_log_company_created_idx` (`company_id`, `created_at`),
    ADD INDEX `installment_reminder_log_enrollment_created_idx` (`enrollment_id`, `created_at`),
    ADD INDEX `installment_reminder_log_installment_created_idx` (`installment_id`, `created_at`),
    ADD INDEX `installment_reminder_log_channel_created_idx` (`channel`, `created_at`),
    ADD INDEX `installment_reminder_outbound_job_idx` (`outbound_message_job_id`);

ALTER TABLE `outbound_message_job`
    ADD COLUMN `group_ticket_id` INTEGER NULL,
    ADD INDEX `outbound_job_group_ticket_idx` (`group_ticket_id`);

ALTER TABLE `paid_event_guest_checkout_session`
    ADD COLUMN `phone_delivery_status` VARCHAR(32) NOT NULL DEFAULT 'PENDING' AFTER `phone_delivery_succeeded`,
    ADD COLUMN `phone_delivery_job_id` INTEGER NULL AFTER `phone_delivery_status`,
    ADD INDEX `pegcs_phone_delivery_job_idx` (`phone_delivery_job_id`);

ALTER TABLE `group_class_guest_enrollment_session`
    ADD COLUMN `phone_delivery_status` VARCHAR(32) NOT NULL DEFAULT 'PENDING' AFTER `phone_delivery_succeeded`,
    ADD COLUMN `phone_delivery_job_id` INTEGER NULL AFTER `phone_delivery_status`,
    ADD INDEX `gcges_phone_delivery_job_idx` (`phone_delivery_job_id`);

ALTER TABLE `commerce_guest_checkout_session`
    ADD COLUMN `phone_delivery_status` VARCHAR(32) NOT NULL DEFAULT 'PENDING' AFTER `phone_delivery_succeeded`,
    ADD COLUMN `phone_delivery_job_id` INTEGER NULL AFTER `phone_delivery_status`,
    ADD INDEX `cgcs_phone_delivery_job_idx` (`phone_delivery_job_id`);

ALTER TABLE `restaurant_notification_log`
    ADD CONSTRAINT `restaurant_notification_log_reservation_guest_id_fkey`
        FOREIGN KEY (`reservation_guest_id`) REFERENCES `restaurant_reservation_guest`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT `restaurant_notification_log_outbound_message_job_id_fkey`
        FOREIGN KEY (`outbound_message_job_id`) REFERENCES `outbound_message_job`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `booking_notification_attempt`
    ADD CONSTRAINT `booking_notification_attempt_outbound_message_job_id_fkey`
        FOREIGN KEY (`outbound_message_job_id`) REFERENCES `outbound_message_job`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `installment_reminder_log`
    ADD CONSTRAINT `installment_reminder_log_outbound_message_job_id_fkey`
        FOREIGN KEY (`outbound_message_job_id`) REFERENCES `outbound_message_job`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `outbound_message_job`
    ADD CONSTRAINT `outbound_message_job_group_ticket_id_fkey`
        FOREIGN KEY (`group_ticket_id`) REFERENCES `group_ticket`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `paid_event_guest_checkout_session`
    ADD CONSTRAINT `paid_event_guest_checkout_session_phone_delivery_job_id_fkey`
        FOREIGN KEY (`phone_delivery_job_id`) REFERENCES `outbound_message_job`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `group_class_guest_enrollment_session`
    ADD CONSTRAINT `group_class_guest_enrollment_session_phone_delivery_job_id_fkey`
        FOREIGN KEY (`phone_delivery_job_id`) REFERENCES `outbound_message_job`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `commerce_guest_checkout_session`
    ADD CONSTRAINT `commerce_guest_checkout_session_phone_delivery_job_id_fkey`
        FOREIGN KEY (`phone_delivery_job_id`) REFERENCES `outbound_message_job`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE;
