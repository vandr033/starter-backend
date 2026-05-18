ALTER TABLE `service`
  ADD COLUMN `is_invite_only` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `invite_token` VARCHAR(255) NULL;

CREATE UNIQUE INDEX `service_invite_token_key` ON `service`(`invite_token`);
CREATE INDEX `service_company_invite_active_idx` ON `service`(`company_id`, `is_invite_only`, `is_active`);
