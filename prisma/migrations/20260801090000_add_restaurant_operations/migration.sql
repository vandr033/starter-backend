ALTER TABLE `restaurant_settings`
  ADD COLUMN `turnover_buffer_minutes` INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN `cleanup_buffer_minutes` INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN `at_risk_warning_window_minutes` INTEGER NOT NULL DEFAULT 30;

ALTER TABLE `restaurant_reservation`
  ADD COLUMN `preferred_dining_area_id` INTEGER NULL,
  ADD COLUMN `combination_id` INTEGER NULL,
  ADD INDEX `restaurant_reservation_combination_time_idx`(`combination_id`, `start_time`, `end_time`),
  ADD INDEX `restaurant_reservation_preferred_area_idx`(`company_id`, `preferred_dining_area_id`, `start_time`),
  ADD CONSTRAINT `restaurant_reservation_preferred_dining_area_id_fkey` FOREIGN KEY (`preferred_dining_area_id`) REFERENCES `restaurant_dining_area`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `restaurant_shift` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `shift_date` DATE NOT NULL,
  `start_at` DATETIME(3) NOT NULL,
  `end_at` DATETIME(3) NOT NULL,
  `timezone` VARCHAR(64) NOT NULL,
  `status` ENUM('DRAFT', 'OPEN', 'CLOSED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `service_period_id` INTEGER NULL,
  `notes` TEXT NULL,
  `shift_manager_user_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_by_user_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `updated_by_user_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `opened_by_user_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `opened_at` DATETIME(3) NULL,
  `closed_by_user_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `closed_at` DATETIME(3) NULL,
  `cancelled_by_user_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `cancelled_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `restaurant_shift_company_date_status_idx`(`company_id`, `shift_date`, `status`),
  INDEX `restaurant_shift_company_time_idx`(`company_id`, `start_at`, `end_at`),
  INDEX `restaurant_shift_service_period_idx`(`service_period_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `restaurant_shift_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `restaurant_shift_service_period_id_fkey` FOREIGN KEY (`service_period_id`) REFERENCES `restaurant_service_period`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `restaurant_shift_manager_user_id_fkey` FOREIGN KEY (`shift_manager_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `restaurant_shift_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `restaurant_shift_updated_by_user_id_fkey` FOREIGN KEY (`updated_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `restaurant_shift_opened_by_user_id_fkey` FOREIGN KEY (`opened_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `restaurant_shift_closed_by_user_id_fkey` FOREIGN KEY (`closed_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `restaurant_shift_cancelled_by_user_id_fkey` FOREIGN KEY (`cancelled_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE `restaurant_shift_member` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `shift_id` INTEGER NOT NULL,
  `user_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` ENUM('MANAGER', 'HOST', 'WAITER') NOT NULL,
  `created_by_user_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `restaurant_shift_member_shift_user_key`(`shift_id`, `user_id`),
  INDEX `restaurant_shift_member_company_user_idx`(`company_id`, `user_id`),
  INDEX `restaurant_shift_member_shift_role_idx`(`shift_id`, `role`),
  PRIMARY KEY (`id`),
  CONSTRAINT `restaurant_shift_member_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `restaurant_shift_member_shift_id_fkey` FOREIGN KEY (`shift_id`) REFERENCES `restaurant_shift`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `restaurant_shift_member_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `restaurant_shift_member_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE `restaurant_shift_dining_area` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `shift_id` INTEGER NOT NULL,
  `dining_area_id` INTEGER NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `restaurant_shift_area_shift_area_key`(`shift_id`, `dining_area_id`),
  INDEX `restaurant_shift_area_company_area_idx`(`company_id`, `dining_area_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `restaurant_shift_area_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `restaurant_shift_area_shift_id_fkey` FOREIGN KEY (`shift_id`) REFERENCES `restaurant_shift`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `restaurant_shift_area_dining_area_id_fkey` FOREIGN KEY (`dining_area_id`) REFERENCES `restaurant_dining_area`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE `restaurant_shift_table_assignment` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `shift_id` INTEGER NOT NULL,
  `table_id` INTEGER NOT NULL,
  `member_id` INTEGER NOT NULL,
  `assigned_by_user_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `restaurant_shift_table_assignment_shift_table_key`(`shift_id`, `table_id`),
  INDEX `restaurant_shift_table_assignment_company_table_idx`(`company_id`, `table_id`),
  INDEX `restaurant_shift_table_assignment_member_idx`(`member_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `restaurant_shift_table_assignment_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `restaurant_shift_table_assignment_shift_id_fkey` FOREIGN KEY (`shift_id`) REFERENCES `restaurant_shift`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `restaurant_shift_table_assignment_table_id_fkey` FOREIGN KEY (`table_id`) REFERENCES `restaurant_table`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `restaurant_shift_table_assignment_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `restaurant_shift_member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `restaurant_shift_table_assignment_assigned_by_user_id_fkey` FOREIGN KEY (`assigned_by_user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE `restaurant_shift_template` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `start_time` VARCHAR(5) NOT NULL,
  `end_time` VARCHAR(5) NOT NULL,
  `timezone` VARCHAR(64) NOT NULL,
  `notes` TEXT NULL,
  `created_by_user_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `restaurant_shift_template_company_name_key`(`company_id`, `name`),
  INDEX `restaurant_shift_template_company_idx`(`company_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `restaurant_shift_template_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `restaurant_shift_template_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE `restaurant_shift_template_member` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `template_id` INTEGER NOT NULL,
  `user_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` ENUM('MANAGER', 'HOST', 'WAITER') NOT NULL,
  UNIQUE INDEX `restaurant_shift_template_member_template_user_key`(`template_id`, `user_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `restaurant_shift_template_member_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `restaurant_shift_template`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `restaurant_shift_template_member_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE `restaurant_shift_template_dining_area` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `template_id` INTEGER NOT NULL,
  `dining_area_id` INTEGER NOT NULL,
  UNIQUE INDEX `restaurant_shift_template_area_key`(`template_id`, `dining_area_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `restaurant_shift_template_area_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `restaurant_shift_template`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `restaurant_shift_template_area_dining_area_id_fkey` FOREIGN KEY (`dining_area_id`) REFERENCES `restaurant_dining_area`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE `restaurant_shift_template_table_assignment` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `template_id` INTEGER NOT NULL,
  `table_id` INTEGER NOT NULL,
  `user_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  UNIQUE INDEX `restaurant_shift_template_table_key`(`template_id`, `table_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `restaurant_shift_template_table_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `restaurant_shift_template`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `restaurant_shift_template_table_table_id_fkey` FOREIGN KEY (`table_id`) REFERENCES `restaurant_table`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `restaurant_shift_template_table_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE `restaurant_table_operational_state` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `table_id` INTEGER NOT NULL,
  `status` ENUM('AVAILABLE', 'RESERVED_SOON', 'RESERVED', 'ARRIVED', 'SEATED', 'BILL_REQUESTED', 'CLEANING', 'BLOCKED') NOT NULL DEFAULT 'AVAILABLE',
  `status_since` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `occupied_at` DATETIME(3) NULL,
  `bill_requested_at` DATETIME(3) NULL,
  `cleaning_started_at` DATETIME(3) NULL,
  `blocked_reason` VARCHAR(500) NULL,
  `updated_by_user_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `restaurant_table_state_table_id_key`(`table_id`),
  UNIQUE INDEX `restaurant_table_state_company_table_key`(`company_id`, `table_id`),
  INDEX `restaurant_table_state_company_status_idx`(`company_id`, `status`),
  PRIMARY KEY (`id`),
  CONSTRAINT `restaurant_table_state_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `restaurant_table_state_table_id_fkey` FOREIGN KEY (`table_id`) REFERENCES `restaurant_table`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `restaurant_table_state_updated_by_user_id_fkey` FOREIGN KEY (`updated_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE `restaurant_table_combination` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `dining_area_id` INTEGER NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_by_user_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `restaurant_table_combination_company_name_key`(`company_id`, `name`),
  INDEX `restaurant_table_combination_company_active_idx`(`company_id`, `is_active`),
  PRIMARY KEY (`id`),
  CONSTRAINT `restaurant_table_combination_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `restaurant_table_combination_dining_area_id_fkey` FOREIGN KEY (`dining_area_id`) REFERENCES `restaurant_dining_area`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `restaurant_table_combination_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE `restaurant_table_combination_table` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `combination_id` INTEGER NOT NULL,
  `table_id` INTEGER NOT NULL,
  UNIQUE INDEX `restaurant_table_combination_table_key`(`combination_id`, `table_id`),
  INDEX `restaurant_table_combination_table_company_table_idx`(`company_id`, `table_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `restaurant_table_combination_table_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `restaurant_table_combination_table_combination_id_fkey` FOREIGN KEY (`combination_id`) REFERENCES `restaurant_table_combination`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `restaurant_table_combination_table_table_id_fkey` FOREIGN KEY (`table_id`) REFERENCES `restaurant_table`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE `restaurant_reservation`
  ADD CONSTRAINT `restaurant_reservation_combination_id_fkey` FOREIGN KEY (`combination_id`) REFERENCES `restaurant_table_combination`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `restaurant_table_combination_session` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `combination_id` INTEGER NOT NULL,
  `reservation_id` INTEGER NULL,
  `start_at` DATETIME(3) NOT NULL,
  `end_at` DATETIME(3) NOT NULL,
  `status` ENUM('ACTIVE', 'RELEASED') NOT NULL DEFAULT 'ACTIVE',
  `created_by_user_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `released_by_user_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `released_at` DATETIME(3) NULL,
  INDEX `restaurant_combination_session_time_idx`(`company_id`, `combination_id`, `start_at`, `end_at`),
  INDEX `restaurant_combination_session_reservation_idx`(`reservation_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `restaurant_combination_session_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `restaurant_combination_session_combination_id_fkey` FOREIGN KEY (`combination_id`) REFERENCES `restaurant_table_combination`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `restaurant_combination_session_reservation_id_fkey` FOREIGN KEY (`reservation_id`) REFERENCES `restaurant_reservation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `restaurant_combination_session_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `restaurant_combination_session_released_by_user_id_fkey` FOREIGN KEY (`released_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE `restaurant_reservation_assignment` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `reservation_id` INTEGER NOT NULL,
  `table_id` INTEGER NULL,
  `combination_id` INTEGER NULL,
  `assigned_by_user_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `reason` VARCHAR(500) NULL,
  `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `released_at` DATETIME(3) NULL,
  INDEX `restaurant_reservation_assignment_history_idx`(`company_id`, `reservation_id`, `assigned_at`),
  INDEX `restaurant_reservation_assignment_table_time_idx`(`company_id`, `table_id`, `assigned_at`, `released_at`),
  INDEX `restaurant_reservation_assignment_combination_time_idx`(`company_id`, `combination_id`, `assigned_at`, `released_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `restaurant_reservation_assignment_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `restaurant_reservation_assignment_reservation_id_fkey` FOREIGN KEY (`reservation_id`) REFERENCES `restaurant_reservation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `restaurant_reservation_assignment_table_id_fkey` FOREIGN KEY (`table_id`) REFERENCES `restaurant_table`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `restaurant_reservation_assignment_combination_id_fkey` FOREIGN KEY (`combination_id`) REFERENCES `restaurant_table_combination`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `restaurant_reservation_assignment_user_id_fkey` FOREIGN KEY (`assigned_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE `restaurant_audit_log` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `event` VARCHAR(100) NOT NULL,
  `actor_user_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `shift_id` INTEGER NULL,
  `table_id` INTEGER NULL,
  `reservation_id` INTEGER NULL,
  `combination_id` INTEGER NULL,
  `metadata` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `restaurant_audit_company_created_idx`(`company_id`, `created_at`),
  INDEX `restaurant_audit_company_event_idx`(`company_id`, `event`, `created_at`),
  INDEX `restaurant_audit_shift_created_idx`(`shift_id`, `created_at`),
  INDEX `restaurant_audit_reservation_created_idx`(`reservation_id`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `restaurant_audit_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `restaurant_audit_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `restaurant_audit_shift_id_fkey` FOREIGN KEY (`shift_id`) REFERENCES `restaurant_shift`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `restaurant_audit_table_id_fkey` FOREIGN KEY (`table_id`) REFERENCES `restaurant_table`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `restaurant_audit_reservation_id_fkey` FOREIGN KEY (`reservation_id`) REFERENCES `restaurant_reservation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `restaurant_audit_combination_id_fkey` FOREIGN KEY (`combination_id`) REFERENCES `restaurant_table_combination`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE `restaurant_internal_note` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `author_user_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `shift_id` INTEGER NULL,
  `table_id` INTEGER NULL,
  `reservation_id` INTEGER NULL,
  `note` TEXT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `restaurant_internal_note_company_created_idx`(`company_id`, `created_at`),
  INDEX `restaurant_internal_note_reservation_created_idx`(`reservation_id`, `created_at`),
  INDEX `restaurant_internal_note_table_created_idx`(`table_id`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `restaurant_internal_note_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `restaurant_internal_note_author_user_id_fkey` FOREIGN KEY (`author_user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `restaurant_internal_note_shift_id_fkey` FOREIGN KEY (`shift_id`) REFERENCES `restaurant_shift`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `restaurant_internal_note_table_id_fkey` FOREIGN KEY (`table_id`) REFERENCES `restaurant_table`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `restaurant_internal_note_reservation_id_fkey` FOREIGN KEY (`reservation_id`) REFERENCES `restaurant_reservation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
);
