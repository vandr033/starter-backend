ALTER TABLE `group_event`
    ADD COLUMN `registration_question_text` VARCHAR(500) NULL,
    ADD COLUMN `registration_question_required` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `group_event_booking`
    ADD COLUMN `registration_question_answer` TEXT NULL;

ALTER TABLE `free_event_registration`
    ADD COLUMN `registration_question_answer` TEXT NULL;
