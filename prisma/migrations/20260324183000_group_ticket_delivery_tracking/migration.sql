ALTER TABLE `group_ticket`
    ADD COLUMN `delivery_count` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `resend_count` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `last_sent_at` DATETIME(3) NULL;
