-- Add ResourceType enum
ALTER TABLE `staff_profile`
  ADD COLUMN `resource_type` ENUM('PERSON', 'ROOM', 'EQUIPMENT') NOT NULL DEFAULT 'PERSON';

-- Add staff_label to company_settings
ALTER TABLE `company_settings`
  ADD COLUMN `staff_label` VARCHAR(50) NOT NULL DEFAULT 'Staff';
