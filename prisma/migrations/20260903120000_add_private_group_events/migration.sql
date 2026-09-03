ALTER TABLE `group_event`
    ADD COLUMN `is_private` BOOLEAN NOT NULL DEFAULT false AFTER `status`;

CREATE INDEX `group_event_company_id_status_is_private_idx`
    ON `group_event`(`company_id`, `status`, `is_private`);
