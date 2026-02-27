-- Reconcile columns that were expected by schema.prisma but were never
-- reliably applied due an accidental migration.

-- booking.rejection_reason
SET @booking_rejection_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'booking'
    AND COLUMN_NAME = 'rejection_reason'
);
SET @sql_booking_rejection := IF(
  @booking_rejection_exists = 0,
  'ALTER TABLE `booking` ADD COLUMN `rejection_reason` VARCHAR(500) NULL',
  'SELECT 1'
);
PREPARE stmt_booking_rejection FROM @sql_booking_rejection;
EXECUTE stmt_booking_rejection;
DEALLOCATE PREPARE stmt_booking_rejection;

-- booking.payment_status enum should include REJECTED
SET @sql_booking_payment_status :=
  'ALTER TABLE `booking` MODIFY `payment_status` ENUM(''UNPAID'',''PENDING_CONFIRMATION'',''PAID'',''REJECTED'') NOT NULL DEFAULT ''UNPAID''';
PREPARE stmt_booking_payment_status FROM @sql_booking_payment_status;
EXECUTE stmt_booking_payment_status;
DEALLOCATE PREPARE stmt_booking_payment_status;

-- company_settings.social_links
SET @company_settings_social_links_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company_settings'
    AND COLUMN_NAME = 'social_links'
);
SET @sql_company_settings_social_links := IF(
  @company_settings_social_links_exists = 0,
  'ALTER TABLE `company_settings` ADD COLUMN `social_links` JSON NULL',
  'SELECT 1'
);
PREPARE stmt_company_settings_social_links FROM @sql_company_settings_social_links;
EXECUTE stmt_company_settings_social_links;
DEALLOCATE PREPARE stmt_company_settings_social_links;

UPDATE `company_settings`
SET `social_links` = JSON_OBJECT()
WHERE `social_links` IS NULL;

ALTER TABLE `company_settings`
  MODIFY `social_links` JSON NOT NULL;

-- staff_profile.start_date
SET @staff_profile_start_date_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'staff_profile'
    AND COLUMN_NAME = 'start_date'
);
SET @sql_staff_profile_start_date := IF(
  @staff_profile_start_date_exists = 0,
  'ALTER TABLE `staff_profile` ADD COLUMN `start_date` DATETIME(3) NULL',
  'SELECT 1'
);
PREPARE stmt_staff_profile_start_date FROM @sql_staff_profile_start_date;
EXECUTE stmt_staff_profile_start_date;
DEALLOCATE PREPARE stmt_staff_profile_start_date;

-- staff_profile.end_date
SET @staff_profile_end_date_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'staff_profile'
    AND COLUMN_NAME = 'end_date'
);
SET @sql_staff_profile_end_date := IF(
  @staff_profile_end_date_exists = 0,
  'ALTER TABLE `staff_profile` ADD COLUMN `end_date` DATETIME(3) NULL',
  'SELECT 1'
);
PREPARE stmt_staff_profile_end_date FROM @sql_staff_profile_end_date;
EXECUTE stmt_staff_profile_end_date;
DEALLOCATE PREPARE stmt_staff_profile_end_date;

-- staff_profile.invite_token
SET @staff_profile_invite_token_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'staff_profile'
    AND COLUMN_NAME = 'invite_token'
);
SET @sql_staff_profile_invite_token := IF(
  @staff_profile_invite_token_exists = 0,
  'ALTER TABLE `staff_profile` ADD COLUMN `invite_token` VARCHAR(255) NULL',
  'SELECT 1'
);
PREPARE stmt_staff_profile_invite_token FROM @sql_staff_profile_invite_token;
EXECUTE stmt_staff_profile_invite_token;
DEALLOCATE PREPARE stmt_staff_profile_invite_token;

-- staff_profile.status enum
SET @staff_profile_status_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'staff_profile'
    AND COLUMN_NAME = 'status'
);
SET @sql_staff_profile_status := IF(
  @staff_profile_status_exists = 0,
  'ALTER TABLE `staff_profile` ADD COLUMN `status` ENUM(''PENDING'',''ACTIVE'',''INACTIVE'') NOT NULL DEFAULT ''ACTIVE''',
  'ALTER TABLE `staff_profile` MODIFY `status` ENUM(''PENDING'',''ACTIVE'',''INACTIVE'') NOT NULL DEFAULT ''ACTIVE'''
);
PREPARE stmt_staff_profile_status FROM @sql_staff_profile_status;
EXECUTE stmt_staff_profile_status;
DEALLOCATE PREPARE stmt_staff_profile_status;

-- Unique index on staff_profile.invite_token
SET @staff_profile_invite_token_idx_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'staff_profile'
    AND INDEX_NAME = 'staff_profile_invite_token_key'
);
SET @sql_staff_profile_invite_token_idx := IF(
  @staff_profile_invite_token_idx_exists = 0,
  'CREATE UNIQUE INDEX `staff_profile_invite_token_key` ON `staff_profile`(`invite_token`)',
  'SELECT 1'
);
PREPARE stmt_staff_profile_invite_token_idx FROM @sql_staff_profile_invite_token_idx;
EXECUTE stmt_staff_profile_invite_token_idx;
DEALLOCATE PREPARE stmt_staff_profile_invite_token_idx;

-- theme_config.font_pairing
SET @theme_config_font_pairing_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'theme_config'
    AND COLUMN_NAME = 'font_pairing'
);
SET @sql_theme_config_font_pairing := IF(
  @theme_config_font_pairing_exists = 0,
  'ALTER TABLE `theme_config` ADD COLUMN `font_pairing` VARCHAR(30) NOT NULL DEFAULT ''classic''',
  'SELECT 1'
);
PREPARE stmt_theme_config_font_pairing FROM @sql_theme_config_font_pairing;
EXECUTE stmt_theme_config_font_pairing;
DEALLOCATE PREPARE stmt_theme_config_font_pairing;

-- theme_config.hero_variant
SET @theme_config_hero_variant_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'theme_config'
    AND COLUMN_NAME = 'hero_variant'
);
SET @sql_theme_config_hero_variant := IF(
  @theme_config_hero_variant_exists = 0,
  'ALTER TABLE `theme_config` ADD COLUMN `hero_variant` VARCHAR(30) NOT NULL DEFAULT ''hero-cinematic''',
  'SELECT 1'
);
PREPARE stmt_theme_config_hero_variant FROM @sql_theme_config_hero_variant;
EXECUTE stmt_theme_config_hero_variant;
DEALLOCATE PREPARE stmt_theme_config_hero_variant;

-- theme_config.services_variant
SET @theme_config_services_variant_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'theme_config'
    AND COLUMN_NAME = 'services_variant'
);
SET @sql_theme_config_services_variant := IF(
  @theme_config_services_variant_exists = 0,
  'ALTER TABLE `theme_config` ADD COLUMN `services_variant` VARCHAR(30) NOT NULL DEFAULT ''services-grid''',
  'SELECT 1'
);
PREPARE stmt_theme_config_services_variant FROM @sql_theme_config_services_variant;
EXECUTE stmt_theme_config_services_variant;
DEALLOCATE PREPARE stmt_theme_config_services_variant;

-- theme_config.team_variant
SET @theme_config_team_variant_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'theme_config'
    AND COLUMN_NAME = 'team_variant'
);
SET @sql_theme_config_team_variant := IF(
  @theme_config_team_variant_exists = 0,
  'ALTER TABLE `theme_config` ADD COLUMN `team_variant` VARCHAR(30) NOT NULL DEFAULT ''team-cards''',
  'SELECT 1'
);
PREPARE stmt_theme_config_team_variant FROM @sql_theme_config_team_variant;
EXECUTE stmt_theme_config_team_variant;
DEALLOCATE PREPARE stmt_theme_config_team_variant;

-- verification_code.purpose should include STAFF_INVITE
SET @sql_verification_code_purpose :=
  'ALTER TABLE `verification_code` MODIFY `purpose` ENUM(''CUSTOMER_SIGNUP'',''LOGIN'',''PROFILE_UPDATE'',''STAFF_INVITE'') NOT NULL';
PREPARE stmt_verification_code_purpose FROM @sql_verification_code_purpose;
EXECUTE stmt_verification_code_purpose;
DEALLOCATE PREPARE stmt_verification_code_purpose;
