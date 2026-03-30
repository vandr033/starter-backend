-- Deduplicate sessions (safe to re-run: deletes 0 rows if already clean)
DELETE s1
FROM `group_class_session` s1
INNER JOIN `group_class_session` s2
    ON s1.`group_class_id` = s2.`group_class_id`
    AND s1.`start_at` = s2.`start_at`
    AND s1.`id` > s2.`id`;

SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'group_class_session' AND INDEX_NAME = 'group_class_session_group_class_id_start_at_key');
SET @sql := IF(@idx_exists = 0, 'CREATE UNIQUE INDEX `group_class_session_group_class_id_start_at_key` ON `group_class_session`(`group_class_id`, `start_at`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'group_event_booking' AND INDEX_NAME = 'group_event_booking_company_id_group_event_id_user_id_status_idx');
SET @sql := IF(@idx_exists = 0, 'CREATE INDEX `group_event_booking_company_id_group_event_id_user_id_status_idx` ON `group_event_booking`(`company_id`, `group_event_id`, `user_id`, `status`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'group_class_enrollment' AND INDEX_NAME = 'gce_cmp_cls_usr_sts_vu_idx');
SET @sql := IF(@idx_exists = 0, 'CREATE INDEX `gce_cmp_cls_usr_sts_vu_idx` ON `group_class_enrollment`(`company_id`, `group_class_id`, `user_id`, `status`, `valid_until`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'group_class_enrollment' AND INDEX_NAME = 'gce_cmp_cls_sts_vf_vu_idx');
SET @sql := IF(@idx_exists = 0, 'CREATE INDEX `gce_cmp_cls_sts_vf_vu_idx` ON `group_class_enrollment`(`company_id`, `group_class_id`, `status`, `valid_from`, `valid_until`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
