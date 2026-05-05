ALTER TABLE `user`
    ADD COLUMN `country_code` VARCHAR(2) NULL;

ALTER TABLE `free_event_registration`
    ADD COLUMN `country_code` VARCHAR(2) NULL;

ALTER TABLE `paid_event_guest_checkout_session`
    ADD COLUMN `country_code` VARCHAR(2) NULL;

ALTER TABLE `group_class_guest_enrollment_session`
    ADD COLUMN `country_code` VARCHAR(2) NULL;

ALTER TABLE `commerce_guest_checkout_session`
    ADD COLUMN `country_code` VARCHAR(2) NULL;
