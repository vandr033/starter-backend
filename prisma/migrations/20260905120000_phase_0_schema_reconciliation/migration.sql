-- Phase 0 schema reconciliation generated from the empty migration-created schema.
-- Keep the existing restaurant_waitlist company FK; it is already canonical.
-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'category'
    AND CONSTRAINT_NAME = 'category_company_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `category` DROP FOREIGN KEY `category_company_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'commerce_order_item_component_snapshot'
    AND CONSTRAINT_NAME = 'commerce_order_item_component_snapshot_product_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `commerce_order_item_component_snapshot` DROP FOREIGN KEY `commerce_order_item_component_snapshot_product_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_class_enrollment'
    AND CONSTRAINT_NAME = 'gce_sponsored_admin_fk'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `group_class_enrollment` DROP FOREIGN KEY `gce_sponsored_admin_fk`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_class_enrollment'
    AND CONSTRAINT_NAME = 'gce_sponsored_session_fk'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `group_class_enrollment` DROP FOREIGN KEY `gce_sponsored_session_fk`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_class_guest_enrollment_session'
    AND CONSTRAINT_NAME = 'gcges_session_fk'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `group_class_guest_enrollment_session` DROP FOREIGN KEY `gcges_session_fk`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_class_interest'
    AND CONSTRAINT_NAME = 'group_class_interest_customer_profile_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `group_class_interest` DROP FOREIGN KEY `group_class_interest_customer_profile_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_session_public_attendance_attempt'
    AND CONSTRAINT_NAME = 'gspaa_company_fk'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `group_session_public_attendance_attempt` DROP FOREIGN KEY `gspaa_company_fk`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_session_public_attendance_attempt'
    AND CONSTRAINT_NAME = 'gspaa_session_fk'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `group_session_public_attendance_attempt` DROP FOREIGN KEY `gspaa_session_fk`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_session_public_attendance_attempt'
    AND CONSTRAINT_NAME = 'gspaa_user_fk'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `group_session_public_attendance_attempt` DROP FOREIGN KEY `gspaa_user_fk`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_ticket'
    AND CONSTRAINT_NAME = 'group_ticket_group_event_booking_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `group_ticket` DROP FOREIGN KEY `group_ticket_group_event_booking_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_audit_log'
    AND CONSTRAINT_NAME = 'restaurant_audit_actor_user_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_audit_log` DROP FOREIGN KEY `restaurant_audit_actor_user_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_audit_log'
    AND CONSTRAINT_NAME = 'restaurant_audit_combination_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_audit_log` DROP FOREIGN KEY `restaurant_audit_combination_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_audit_log'
    AND CONSTRAINT_NAME = 'restaurant_audit_company_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_audit_log` DROP FOREIGN KEY `restaurant_audit_company_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_audit_log'
    AND CONSTRAINT_NAME = 'restaurant_audit_reservation_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_audit_log` DROP FOREIGN KEY `restaurant_audit_reservation_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_audit_log'
    AND CONSTRAINT_NAME = 'restaurant_audit_shift_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_audit_log` DROP FOREIGN KEY `restaurant_audit_shift_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_audit_log'
    AND CONSTRAINT_NAME = 'restaurant_audit_table_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_audit_log` DROP FOREIGN KEY `restaurant_audit_table_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_notification_log'
    AND CONSTRAINT_NAME = 'restaurant_notification_log_reservation_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_notification_log` DROP FOREIGN KEY `restaurant_notification_log_reservation_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_reservation_assignment'
    AND CONSTRAINT_NAME = 'restaurant_reservation_assignment_user_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_reservation_assignment` DROP FOREIGN KEY `restaurant_reservation_assignment_user_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_reservation_deposit'
    AND CONSTRAINT_NAME = 'restaurant_deposit_company_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_reservation_deposit` DROP FOREIGN KEY `restaurant_deposit_company_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_reservation_deposit'
    AND CONSTRAINT_NAME = 'restaurant_deposit_refunded_by_user_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_reservation_deposit` DROP FOREIGN KEY `restaurant_deposit_refunded_by_user_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_reservation_deposit'
    AND CONSTRAINT_NAME = 'restaurant_deposit_reservation_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_reservation_deposit` DROP FOREIGN KEY `restaurant_deposit_reservation_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_reservation_deposit'
    AND CONSTRAINT_NAME = 'restaurant_deposit_reviewed_by_user_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_reservation_deposit` DROP FOREIGN KEY `restaurant_deposit_reviewed_by_user_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_reservation_deposit'
    AND CONSTRAINT_NAME = 'restaurant_deposit_submitted_by_user_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_reservation_deposit` DROP FOREIGN KEY `restaurant_deposit_submitted_by_user_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_shift'
    AND CONSTRAINT_NAME = 'restaurant_shift_manager_user_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_shift` DROP FOREIGN KEY `restaurant_shift_manager_user_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_shift_closeout'
    AND CONSTRAINT_NAME = 'restaurant_closeout_closed_by_user_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_shift_closeout` DROP FOREIGN KEY `restaurant_closeout_closed_by_user_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_shift_closeout'
    AND CONSTRAINT_NAME = 'restaurant_closeout_company_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_shift_closeout` DROP FOREIGN KEY `restaurant_closeout_company_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_shift_closeout'
    AND CONSTRAINT_NAME = 'restaurant_closeout_reopened_by_user_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_shift_closeout` DROP FOREIGN KEY `restaurant_closeout_reopened_by_user_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_shift_closeout'
    AND CONSTRAINT_NAME = 'restaurant_closeout_shift_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_shift_closeout` DROP FOREIGN KEY `restaurant_closeout_shift_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_shift_closeout_adjustment'
    AND CONSTRAINT_NAME = 'restaurant_closeout_adjustment_actor_user_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_shift_closeout_adjustment` DROP FOREIGN KEY `restaurant_closeout_adjustment_actor_user_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_shift_closeout_adjustment'
    AND CONSTRAINT_NAME = 'restaurant_closeout_adjustment_closeout_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_shift_closeout_adjustment` DROP FOREIGN KEY `restaurant_closeout_adjustment_closeout_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_shift_closeout_adjustment'
    AND CONSTRAINT_NAME = 'restaurant_closeout_adjustment_company_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_shift_closeout_adjustment` DROP FOREIGN KEY `restaurant_closeout_adjustment_company_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_shift_dining_area'
    AND CONSTRAINT_NAME = 'restaurant_shift_area_company_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_shift_dining_area` DROP FOREIGN KEY `restaurant_shift_area_company_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_shift_dining_area'
    AND CONSTRAINT_NAME = 'restaurant_shift_area_dining_area_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_shift_dining_area` DROP FOREIGN KEY `restaurant_shift_area_dining_area_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_shift_dining_area'
    AND CONSTRAINT_NAME = 'restaurant_shift_area_shift_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_shift_dining_area` DROP FOREIGN KEY `restaurant_shift_area_shift_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_shift_template_dining_area'
    AND CONSTRAINT_NAME = 'restaurant_shift_template_area_dining_area_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_shift_template_dining_area` DROP FOREIGN KEY `restaurant_shift_template_area_dining_area_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_shift_template_dining_area'
    AND CONSTRAINT_NAME = 'restaurant_shift_template_area_template_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_shift_template_dining_area` DROP FOREIGN KEY `restaurant_shift_template_area_template_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_shift_template_table_assignment'
    AND CONSTRAINT_NAME = 'restaurant_shift_template_table_table_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_shift_template_table_assignment` DROP FOREIGN KEY `restaurant_shift_template_table_table_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_shift_template_table_assignment'
    AND CONSTRAINT_NAME = 'restaurant_shift_template_table_template_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_shift_template_table_assignment` DROP FOREIGN KEY `restaurant_shift_template_table_template_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_shift_template_table_assignment'
    AND CONSTRAINT_NAME = 'restaurant_shift_template_table_user_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_shift_template_table_assignment` DROP FOREIGN KEY `restaurant_shift_template_table_user_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_table_combination_session'
    AND CONSTRAINT_NAME = 'restaurant_combination_session_combination_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_table_combination_session` DROP FOREIGN KEY `restaurant_combination_session_combination_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_table_combination_session'
    AND CONSTRAINT_NAME = 'restaurant_combination_session_company_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_table_combination_session` DROP FOREIGN KEY `restaurant_combination_session_company_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_table_combination_session'
    AND CONSTRAINT_NAME = 'restaurant_combination_session_created_by_user_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_table_combination_session` DROP FOREIGN KEY `restaurant_combination_session_created_by_user_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_table_combination_session'
    AND CONSTRAINT_NAME = 'restaurant_combination_session_released_by_user_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_table_combination_session` DROP FOREIGN KEY `restaurant_combination_session_released_by_user_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_table_combination_session'
    AND CONSTRAINT_NAME = 'restaurant_combination_session_reservation_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_table_combination_session` DROP FOREIGN KEY `restaurant_combination_session_reservation_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_table_operational_state'
    AND CONSTRAINT_NAME = 'restaurant_table_state_company_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_table_operational_state` DROP FOREIGN KEY `restaurant_table_state_company_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_table_operational_state'
    AND CONSTRAINT_NAME = 'restaurant_table_state_table_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_table_operational_state` DROP FOREIGN KEY `restaurant_table_state_table_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropForeignKey
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_table_operational_state'
    AND CONSTRAINT_NAME = 'restaurant_table_state_updated_by_user_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `restaurant_table_operational_state` DROP FOREIGN KEY `restaurant_table_state_updated_by_user_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropIndex
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'category'
    AND INDEX_NAME = 'category_company_id_is_active_position_idx'
);
SET @sql := IF(
  @idx_exists > 0,
  'DROP INDEX `category_company_id_is_active_position_idx` ON `category`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropIndex
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_class_interest'
    AND INDEX_NAME = 'group_class_interest_customer_profile_id_idx'
);
SET @sql := IF(
  @idx_exists > 0,
  'DROP INDEX `group_class_interest_customer_profile_id_idx` ON `group_class_interest`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropIndex
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'group_ticket'
    AND INDEX_NAME = 'group_ticket_group_event_booking_id_seat_number_idx'
);
SET @sql := IF(
  @idx_exists > 0,
  'DROP INDEX `group_ticket_group_event_booking_id_seat_number_idx` ON `group_ticket`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DropIndex
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'restaurant_notification_log'
    AND INDEX_NAME = 'restaurant_notification_log_dedup_idx'
);
SET @sql := IF(
  @idx_exists > 0,
  'DROP INDEX `restaurant_notification_log_dedup_idx` ON `restaurant_notification_log`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- AlterTable
ALTER TABLE `booking_group` ALTER COLUMN `updated_at` DROP DEFAULT;

-- AlterTable
ALTER TABLE `business_pricing_bundle_discount_tier` ALTER COLUMN `updated_at` DROP DEFAULT;

-- AlterTable
ALTER TABLE `business_pricing_product` ALTER COLUMN `updated_at` DROP DEFAULT;

-- AlterTable
ALTER TABLE `business_pricing_settings` ALTER COLUMN `updated_at` DROP DEFAULT;

-- AlterTable
ALTER TABLE `category` MODIFY `description` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `commerce_category` ALTER COLUMN `updated_at` DROP DEFAULT;

-- AlterTable
ALTER TABLE `commerce_combo_item` ALTER COLUMN `updated_at` DROP DEFAULT;

-- AlterTable
ALTER TABLE `commerce_order` ALTER COLUMN `payment_method` DROP DEFAULT,
    ALTER COLUMN `updated_at` DROP DEFAULT;

-- AlterTable
ALTER TABLE `commerce_pickup_point` ALTER COLUMN `updated_at` DROP DEFAULT;

-- AlterTable
ALTER TABLE `commerce_point_of_sale` ALTER COLUMN `opening_time` DROP DEFAULT,
    ALTER COLUMN `closing_time` DROP DEFAULT;

-- AlterTable
ALTER TABLE `commerce_product` ALTER COLUMN `updated_at` DROP DEFAULT;

-- AlterTable
ALTER TABLE `commerce_product_image` ALTER COLUMN `updated_at` DROP DEFAULT;

-- AlterTable
ALTER TABLE `commerce_store` ALTER COLUMN `updated_at` DROP DEFAULT;

-- AlterTable
ALTER TABLE `company_product_subscription` ALTER COLUMN `updated_at` DROP DEFAULT;

-- AlterTable
ALTER TABLE `company_settings` ADD COLUMN `auto_confirm_bookings` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `max_advance_booking_days` INTEGER NULL,
    ADD COLUMN `require_comprobante_for_qr` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `free_event_registration` ALTER COLUMN `updated_at` DROP DEFAULT;

-- AlterTable
ALTER TABLE `group_class_enrollment` MODIFY `pricing_mode` ENUM('PER_SESSION', 'WEEKLY_PASS', 'MONTHLY_PASS', 'FULL_COURSE') NOT NULL;

-- AlterTable
ALTER TABLE `product_access_request` ALTER COLUMN `updated_at` DROP DEFAULT;

-- AlterTable
ALTER TABLE `product_catalog` ALTER COLUMN `updated_at` DROP DEFAULT;

-- AlterTable
ALTER TABLE `product_tier` ALTER COLUMN `updated_at` DROP DEFAULT;

-- AlterTable
ALTER TABLE `theme_config` ADD COLUMN `announcement_banners` JSON NULL,
    ADD COLUMN `footer_config` JSON NULL,
    ADD COLUMN `home_section_order` JSON NULL;

-- CreateIndex
CREATE INDEX `restaurant_notification_log_dedup_idx` ON `restaurant_notification_log`(`company_id`, `reservation_id`, `event`, `channel`, `dedup_key`);

-- CreateIndex
CREATE INDEX `review_company_id_fkey` ON `review`(`company_id`);

-- Re-add the canonical constraints whose historical support indexes are being
-- replaced above. MySQL otherwise removes the relationship with the index
-- reshaping, even though the Prisma relation remains part of the schema.
-- AddForeignKey
ALTER TABLE `category` ADD CONSTRAINT `category_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `group_ticket` ADD CONSTRAINT `group_ticket_group_event_booking_id_fkey` FOREIGN KEY (`group_event_booking_id`) REFERENCES `group_event_booking`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_notification_log` ADD CONSTRAINT `restaurant_notification_log_reservation_id_fkey` FOREIGN KEY (`reservation_id`) REFERENCES `restaurant_reservation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- The historical restaurant_waitlist company FK is already the single canonical constraint.
-- It is intentionally not re-added here; the surrounding reconciliation removes the
-- metadata drift that caused Prisma's schema engine to plan a duplicate operation.

-- AddForeignKey
ALTER TABLE `restaurant_reservation_deposit` ADD CONSTRAINT `restaurant_reservation_deposit_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_reservation_deposit` ADD CONSTRAINT `restaurant_reservation_deposit_reservation_id_fkey` FOREIGN KEY (`reservation_id`) REFERENCES `restaurant_reservation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_reservation_deposit` ADD CONSTRAINT `restaurant_reservation_deposit_submitted_by_user_id_fkey` FOREIGN KEY (`submitted_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_reservation_deposit` ADD CONSTRAINT `restaurant_reservation_deposit_reviewed_by_user_id_fkey` FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_reservation_deposit` ADD CONSTRAINT `restaurant_reservation_deposit_refunded_by_user_id_fkey` FOREIGN KEY (`refunded_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_shift_closeout` ADD CONSTRAINT `restaurant_shift_closeout_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_shift_closeout` ADD CONSTRAINT `restaurant_shift_closeout_shift_id_fkey` FOREIGN KEY (`shift_id`) REFERENCES `restaurant_shift`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_shift_closeout` ADD CONSTRAINT `restaurant_shift_closeout_closed_by_user_id_fkey` FOREIGN KEY (`closed_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_shift_closeout` ADD CONSTRAINT `restaurant_shift_closeout_reopened_by_user_id_fkey` FOREIGN KEY (`reopened_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_shift_closeout_adjustment` ADD CONSTRAINT `restaurant_shift_closeout_adjustment_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_shift_closeout_adjustment` ADD CONSTRAINT `restaurant_shift_closeout_adjustment_closeout_id_fkey` FOREIGN KEY (`closeout_id`) REFERENCES `restaurant_shift_closeout`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_shift_closeout_adjustment` ADD CONSTRAINT `restaurant_shift_closeout_adjustment_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_shift` ADD CONSTRAINT `restaurant_shift_shift_manager_user_id_fkey` FOREIGN KEY (`shift_manager_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_shift_dining_area` ADD CONSTRAINT `restaurant_shift_dining_area_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_shift_dining_area` ADD CONSTRAINT `restaurant_shift_dining_area_shift_id_fkey` FOREIGN KEY (`shift_id`) REFERENCES `restaurant_shift`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_shift_dining_area` ADD CONSTRAINT `restaurant_shift_dining_area_dining_area_id_fkey` FOREIGN KEY (`dining_area_id`) REFERENCES `restaurant_dining_area`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_shift_template_dining_area` ADD CONSTRAINT `restaurant_shift_template_dining_area_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `restaurant_shift_template`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_shift_template_dining_area` ADD CONSTRAINT `restaurant_shift_template_dining_area_dining_area_id_fkey` FOREIGN KEY (`dining_area_id`) REFERENCES `restaurant_dining_area`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_shift_template_table_assignment` ADD CONSTRAINT `restaurant_shift_template_table_assignment_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `restaurant_shift_template`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_shift_template_table_assignment` ADD CONSTRAINT `restaurant_shift_template_table_assignment_table_id_fkey` FOREIGN KEY (`table_id`) REFERENCES `restaurant_table`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_shift_template_table_assignment` ADD CONSTRAINT `restaurant_shift_template_table_assignment_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_table_operational_state` ADD CONSTRAINT `restaurant_table_operational_state_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_table_operational_state` ADD CONSTRAINT `restaurant_table_operational_state_table_id_fkey` FOREIGN KEY (`table_id`) REFERENCES `restaurant_table`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_table_operational_state` ADD CONSTRAINT `restaurant_table_operational_state_updated_by_user_id_fkey` FOREIGN KEY (`updated_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_table_combination_session` ADD CONSTRAINT `restaurant_table_combination_session_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_table_combination_session` ADD CONSTRAINT `restaurant_table_combination_session_combination_id_fkey` FOREIGN KEY (`combination_id`) REFERENCES `restaurant_table_combination`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_table_combination_session` ADD CONSTRAINT `restaurant_table_combination_session_reservation_id_fkey` FOREIGN KEY (`reservation_id`) REFERENCES `restaurant_reservation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_table_combination_session` ADD CONSTRAINT `restaurant_table_combination_session_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_table_combination_session` ADD CONSTRAINT `restaurant_table_combination_session_released_by_user_id_fkey` FOREIGN KEY (`released_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_reservation_assignment` ADD CONSTRAINT `restaurant_reservation_assignment_assigned_by_user_id_fkey` FOREIGN KEY (`assigned_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_audit_log` ADD CONSTRAINT `restaurant_audit_log_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_audit_log` ADD CONSTRAINT `restaurant_audit_log_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_audit_log` ADD CONSTRAINT `restaurant_audit_log_shift_id_fkey` FOREIGN KEY (`shift_id`) REFERENCES `restaurant_shift`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_audit_log` ADD CONSTRAINT `restaurant_audit_log_table_id_fkey` FOREIGN KEY (`table_id`) REFERENCES `restaurant_table`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_audit_log` ADD CONSTRAINT `restaurant_audit_log_reservation_id_fkey` FOREIGN KEY (`reservation_id`) REFERENCES `restaurant_reservation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_audit_log` ADD CONSTRAINT `restaurant_audit_log_combination_id_fkey` FOREIGN KEY (`combination_id`) REFERENCES `restaurant_table_combination`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commerce_order_item_component_snapshot` ADD CONSTRAINT `commerce_order_item_component_snapshot_component_product_id_fkey` FOREIGN KEY (`component_product_id`) REFERENCES `commerce_product`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `group_class_enrollment` ADD CONSTRAINT `group_class_enrollment_sponsored_by_group_class_session_id_fkey` FOREIGN KEY (`sponsored_by_group_class_session_id`) REFERENCES `group_class_session`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `group_class_enrollment` ADD CONSTRAINT `group_class_enrollment_sponsored_by_admin_user_id_fkey` FOREIGN KEY (`sponsored_by_admin_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `group_class_interest` ADD CONSTRAINT `group_class_interest_customer_profile_id_fkey` FOREIGN KEY (`customer_profile_id`) REFERENCES `customer_profile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `group_class_guest_enrollment_session` ADD CONSTRAINT `group_class_guest_enrollment_session_group_class_session_id_fkey` FOREIGN KEY (`group_class_session_id`) REFERENCES `group_class_session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `group_session_public_attendance_attempt` ADD CONSTRAINT `group_session_public_attendance_attempt_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `group_session_public_attendance_attempt` ADD CONSTRAINT `group_session_public_attendance_attempt_group_class_session_fkey` FOREIGN KEY (`group_class_session_id`) REFERENCES `group_class_session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `group_session_public_attendance_attempt` ADD CONSTRAINT `group_session_public_attendance_attempt_resolved_user_id_fkey` FOREIGN KEY (`resolved_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `free_event_registration` RENAME INDEX `free_event_registration_company_event_idx` TO `free_event_registration_company_id_group_event_id_idx`;

-- RenameIndex
ALTER TABLE `free_event_registration` RENAME INDEX `free_event_registration_event_email_key` TO `free_event_registration_group_event_id_email_key`;

-- RenameIndex
ALTER TABLE `free_event_registration` RENAME INDEX `free_event_registration_event_reservation_idx` TO `free_event_registration_group_event_id_reservation_code_idx`;

-- RenameIndex
ALTER TABLE `free_event_registration` RENAME INDEX `free_event_registration_event_status_idx` TO `free_event_registration_group_event_id_status_idx`;

-- RenameIndex
ALTER TABLE `restaurant_table_operational_state` RENAME INDEX `restaurant_table_state_table_id_key` TO `restaurant_table_operational_state_table_id_key`;

-- RenameIndex
ALTER TABLE `user` RENAME INDEX `User_email_key` TO `user_email_key`;

-- RenameIndex
ALTER TABLE `user` RENAME INDEX `User_phoneNumber_key` TO `user_phoneNumber_key`;
