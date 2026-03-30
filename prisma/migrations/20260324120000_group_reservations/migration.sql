-- CreateEnum: GroupItemStatus, ClassPricingMode, RecurrenceType, GroupBookingStatus, GroupStaffRole, TicketStatus, CheckInMethod

-- CreateTable: group_event
CREATE TABLE `group_event` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `slug` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `cover_image_url` VARCHAR(512) NULL,
    `thumbnail_url` VARCHAR(512) NULL,
    `status` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `is_free` BOOLEAN NOT NULL DEFAULT true,
    `price_cents` INTEGER NOT NULL DEFAULT 0,
    `max_capacity` INTEGER NOT NULL,
    `start_at` DATETIME(3) NOT NULL,
    `end_at` DATETIME(3) NOT NULL,
    `location_text` VARCHAR(500) NULL,
    `created_by_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `group_event_company_id_slug_key`(`company_id`, `slug`),
    INDEX `group_event_company_id_status_idx`(`company_id`, `status`),
    INDEX `group_event_company_id_start_at_idx`(`company_id`, `start_at`),
    INDEX `group_event_created_by_user_id_idx`(`created_by_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: group_class
CREATE TABLE `group_class` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `slug` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `cover_image_url` VARCHAR(512) NULL,
    `thumbnail_url` VARCHAR(512) NULL,
    `status` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `pricing_mode` ENUM('PER_SESSION', 'WEEKLY_PASS', 'MONTHLY_PASS') NOT NULL DEFAULT 'PER_SESSION',
    `price_cents` INTEGER NOT NULL DEFAULT 0,
    `max_capacity_per_session` INTEGER NOT NULL,
    `session_duration_minutes` INTEGER NOT NULL,
    `recurrence_type` ENUM('WEEKLY', 'MONTHLY', 'CUSTOM') NOT NULL DEFAULT 'WEEKLY',
    `recurrence_config` JSON NOT NULL,
    `recurrence_start_date` DATE NOT NULL,
    `recurrence_end_date` DATE NULL,
    `start_time` VARCHAR(8) NOT NULL,
    `location_text` VARCHAR(500) NULL,
    `created_by_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `group_class_company_id_slug_key`(`company_id`, `slug`),
    INDEX `group_class_company_id_status_idx`(`company_id`, `status`),
    INDEX `group_class_created_by_user_id_idx`(`created_by_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: group_class_session
CREATE TABLE `group_class_session` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `group_class_id` INTEGER NOT NULL,
    `start_at` DATETIME(3) NOT NULL,
    `end_at` DATETIME(3) NOT NULL,
    `status` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'PUBLISHED',
    `max_capacity_override` INTEGER NULL,
    `cancelled_at` DATETIME(3) NULL,
    `cancel_reason` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `group_class_session_company_id_group_class_id_start_at_idx`(`company_id`, `group_class_id`, `start_at`),
    INDEX `group_class_session_group_class_id_start_at_idx`(`group_class_id`, `start_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: group_staff_assignment
CREATE TABLE `group_staff_assignment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `group_event_id` INTEGER NULL,
    `group_class_id` INTEGER NULL,
    `staff_profile_id` INTEGER NULL,
    `display_name` VARCHAR(255) NULL,
    `display_phone` VARCHAR(64) NULL,
    `role` ENUM('INSTRUCTOR', 'ASSISTANT') NOT NULL DEFAULT 'INSTRUCTOR',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `group_staff_assignment_company_id_group_event_id_idx`(`company_id`, `group_event_id`),
    INDEX `group_staff_assignment_company_id_group_class_id_idx`(`company_id`, `group_class_id`),
    INDEX `group_staff_assignment_staff_profile_id_idx`(`staff_profile_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: group_event_booking
CREATE TABLE `group_event_booking` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `group_event_id` INTEGER NOT NULL,
    `customer_profile_id` INTEGER NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'CONFIRMED', 'CANCELLED', 'WAITLISTED') NOT NULL DEFAULT 'PENDING',
    `booked_spots` INTEGER NOT NULL DEFAULT 1,
    `payment_method` ENUM('NONE', 'CASH', 'QR') NOT NULL DEFAULT 'NONE',
    `payment_status` ENUM('UNPAID', 'PENDING_CONFIRMATION', 'PAID', 'REJECTED') NOT NULL DEFAULT 'UNPAID',
    `qr_proof_image_url` VARCHAR(512) NULL,
    `total_price_cents` INTEGER NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `cancelled_at` DATETIME(3) NULL,

    INDEX `group_event_booking_company_id_group_event_id_status_idx`(`company_id`, `group_event_id`, `status`),
    INDEX `group_event_booking_user_id_group_event_id_idx`(`user_id`, `group_event_id`),
    INDEX `group_event_booking_customer_profile_id_idx`(`customer_profile_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: group_class_enrollment
CREATE TABLE `group_class_enrollment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `group_class_id` INTEGER NOT NULL,
    `customer_profile_id` INTEGER NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `pricing_mode` ENUM('PER_SESSION', 'WEEKLY_PASS', 'MONTHLY_PASS') NOT NULL,
    `price_cents_snapshot` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'CONFIRMED', 'CANCELLED', 'WAITLISTED') NOT NULL DEFAULT 'PENDING',
    `payment_method` ENUM('NONE', 'CASH', 'QR') NOT NULL DEFAULT 'NONE',
    `payment_status` ENUM('UNPAID', 'PENDING_CONFIRMATION', 'PAID', 'REJECTED') NOT NULL DEFAULT 'UNPAID',
    `qr_proof_image_url` VARCHAR(512) NULL,
    `valid_from` DATETIME(3) NOT NULL,
    `valid_until` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `cancelled_at` DATETIME(3) NULL,

    INDEX `group_class_enrollment_company_id_group_class_id_status_idx`(`company_id`, `group_class_id`, `status`),
    INDEX `group_class_enrollment_user_id_group_class_id_idx`(`user_id`, `group_class_id`),
    INDEX `group_class_enrollment_customer_profile_id_idx`(`customer_profile_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: group_session_attendance
CREATE TABLE `group_session_attendance` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `group_class_session_id` INTEGER NULL,
    `group_event_id` INTEGER NULL,
    `customer_profile_id` INTEGER NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `enrollment_id` INTEGER NULL,
    `event_booking_id` INTEGER NULL,
    `checked_in_at` DATETIME(3) NULL,
    `checked_in_method` ENUM('QR_SCAN', 'MANUAL') NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `group_session_attendance_group_class_session_id_user_id_key`(`group_class_session_id`, `user_id`),
    UNIQUE INDEX `group_session_attendance_group_event_id_user_id_key`(`group_event_id`, `user_id`),
    INDEX `group_session_attendance_company_id_idx`(`company_id`),
    INDEX `group_session_attendance_enrollment_id_idx`(`enrollment_id`),
    INDEX `group_session_attendance_event_booking_id_idx`(`event_booking_id`),
    INDEX `group_session_attendance_customer_profile_id_idx`(`customer_profile_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: group_ticket
CREATE TABLE `group_ticket` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `group_event_booking_id` INTEGER NULL,
    `group_class_enrollment_id` INTEGER NULL,
    `group_class_session_id` INTEGER NULL,
    `ticket_code` VARCHAR(64) NOT NULL,
    `status` ENUM('ACTIVE', 'USED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
    `valid_from` DATETIME(3) NOT NULL,
    `valid_until` DATETIME(3) NOT NULL,
    `issued_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `used_at` DATETIME(3) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `group_ticket_ticket_code_key`(`ticket_code`),
    INDEX `group_ticket_company_id_idx`(`company_id`),
    INDEX `group_ticket_group_event_booking_id_idx`(`group_event_booking_id`),
    INDEX `group_ticket_group_class_enrollment_id_idx`(`group_class_enrollment_id`),
    INDEX `group_ticket_group_class_session_id_idx`(`group_class_session_id`),
    INDEX `group_ticket_status_valid_until_idx`(`status`, `valid_until`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: group_event_interest
CREATE TABLE `group_event_interest` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `group_event_id` INTEGER NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `customer_profile_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `group_event_interest_group_event_id_user_id_key`(`group_event_id`, `user_id`),
    INDEX `group_event_interest_company_id_group_event_id_idx`(`company_id`, `group_event_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `group_event` ADD CONSTRAINT `group_event_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `group_event` ADD CONSTRAINT `group_event_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `group_class` ADD CONSTRAINT `group_class_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `group_class` ADD CONSTRAINT `group_class_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `group_class_session` ADD CONSTRAINT `group_class_session_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `group_class_session` ADD CONSTRAINT `group_class_session_group_class_id_fkey` FOREIGN KEY (`group_class_id`) REFERENCES `group_class`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `group_staff_assignment` ADD CONSTRAINT `group_staff_assignment_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `group_staff_assignment` ADD CONSTRAINT `group_staff_assignment_group_event_id_fkey` FOREIGN KEY (`group_event_id`) REFERENCES `group_event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `group_staff_assignment` ADD CONSTRAINT `group_staff_assignment_group_class_id_fkey` FOREIGN KEY (`group_class_id`) REFERENCES `group_class`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `group_staff_assignment` ADD CONSTRAINT `group_staff_assignment_staff_profile_id_fkey` FOREIGN KEY (`staff_profile_id`) REFERENCES `staff_profile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `group_event_booking` ADD CONSTRAINT `group_event_booking_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `group_event_booking` ADD CONSTRAINT `group_event_booking_group_event_id_fkey` FOREIGN KEY (`group_event_id`) REFERENCES `group_event`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `group_event_booking` ADD CONSTRAINT `group_event_booking_customer_profile_id_fkey` FOREIGN KEY (`customer_profile_id`) REFERENCES `customer_profile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `group_event_booking` ADD CONSTRAINT `group_event_booking_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `group_class_enrollment` ADD CONSTRAINT `group_class_enrollment_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `group_class_enrollment` ADD CONSTRAINT `group_class_enrollment_group_class_id_fkey` FOREIGN KEY (`group_class_id`) REFERENCES `group_class`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `group_class_enrollment` ADD CONSTRAINT `group_class_enrollment_customer_profile_id_fkey` FOREIGN KEY (`customer_profile_id`) REFERENCES `customer_profile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `group_class_enrollment` ADD CONSTRAINT `group_class_enrollment_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `group_session_attendance` ADD CONSTRAINT `group_session_attendance_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `group_session_attendance` ADD CONSTRAINT `group_session_attendance_group_class_session_id_fkey` FOREIGN KEY (`group_class_session_id`) REFERENCES `group_class_session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `group_session_attendance` ADD CONSTRAINT `group_session_attendance_group_event_id_fkey` FOREIGN KEY (`group_event_id`) REFERENCES `group_event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `group_session_attendance` ADD CONSTRAINT `group_session_attendance_customer_profile_id_fkey` FOREIGN KEY (`customer_profile_id`) REFERENCES `customer_profile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `group_session_attendance` ADD CONSTRAINT `group_session_attendance_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `group_session_attendance` ADD CONSTRAINT `group_session_attendance_enrollment_id_fkey` FOREIGN KEY (`enrollment_id`) REFERENCES `group_class_enrollment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `group_session_attendance` ADD CONSTRAINT `group_session_attendance_event_booking_id_fkey` FOREIGN KEY (`event_booking_id`) REFERENCES `group_event_booking`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `group_ticket` ADD CONSTRAINT `group_ticket_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `group_ticket` ADD CONSTRAINT `group_ticket_group_event_booking_id_fkey` FOREIGN KEY (`group_event_booking_id`) REFERENCES `group_event_booking`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `group_ticket` ADD CONSTRAINT `group_ticket_group_class_enrollment_id_fkey` FOREIGN KEY (`group_class_enrollment_id`) REFERENCES `group_class_enrollment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `group_ticket` ADD CONSTRAINT `group_ticket_group_class_session_id_fkey` FOREIGN KEY (`group_class_session_id`) REFERENCES `group_class_session`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `group_event_interest` ADD CONSTRAINT `group_event_interest_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `group_event_interest` ADD CONSTRAINT `group_event_interest_group_event_id_fkey` FOREIGN KEY (`group_event_id`) REFERENCES `group_event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `group_event_interest` ADD CONSTRAINT `group_event_interest_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `group_event_interest` ADD CONSTRAINT `group_event_interest_customer_profile_id_fkey` FOREIGN KEY (`customer_profile_id`) REFERENCES `customer_profile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
