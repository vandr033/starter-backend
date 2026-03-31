-- Add optional custom message shown when a free event has no remaining capacity.
ALTER TABLE `group_event`
ADD COLUMN `no_availability_message` TEXT NULL;
