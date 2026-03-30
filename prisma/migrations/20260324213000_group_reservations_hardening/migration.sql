DELETE s1
FROM `group_class_session` s1
INNER JOIN `group_class_session` s2
    ON s1.`group_class_id` = s2.`group_class_id`
    AND s1.`start_at` = s2.`start_at`
    AND s1.`id` > s2.`id`;

CREATE UNIQUE INDEX `group_class_session_group_class_id_start_at_key`
    ON `group_class_session`(`group_class_id`, `start_at`);

CREATE INDEX `group_event_booking_company_id_group_event_id_user_id_status_idx`
    ON `group_event_booking`(`company_id`, `group_event_id`, `user_id`, `status`);

CREATE INDEX `gce_cmp_cls_usr_sts_vu_idx`
    ON `group_class_enrollment`(`company_id`, `group_class_id`, `user_id`, `status`, `valid_until`);

CREATE INDEX `gce_cmp_cls_sts_vf_vu_idx`
    ON `group_class_enrollment`(`company_id`, `group_class_id`, `status`, `valid_from`, `valid_until`);
