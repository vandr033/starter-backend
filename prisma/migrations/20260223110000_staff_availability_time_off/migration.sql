-- AlterTable
ALTER TABLE `company_settings`
    ADD COLUMN `auto_approve_staff_time_off` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `staff_availability` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `staff_id` INTEGER NOT NULL,
    `day_of_week` INTEGER NOT NULL,
    `start_time` VARCHAR(8) NOT NULL,
    `end_time` VARCHAR(8) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `staff_availability_company_id_staff_id_day_of_week_is_active_idx`(`company_id`, `staff_id`, `day_of_week`, `is_active`),
    INDEX `staff_availability_staff_id_fkey`(`staff_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `staff_time_off` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `staff_id` INTEGER NOT NULL,
    `requested_by_user_id` VARCHAR(191) NOT NULL,
    `starts_at` DATETIME(3) NOT NULL,
    `ends_at` DATETIME(3) NOT NULL,
    `reason` VARCHAR(500) NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `review_note` VARCHAR(500) NULL,
    `reviewed_by_user_id` VARCHAR(191) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `staff_time_off_company_id_staff_id_status_starts_at_ends_at_idx`(`company_id`, `staff_id`, `status`, `starts_at`, `ends_at`),
    INDEX `staff_time_off_requested_by_user_id_fkey`(`requested_by_user_id`),
    INDEX `staff_time_off_reviewed_by_user_id_fkey`(`reviewed_by_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `staff_availability`
    ADD CONSTRAINT `staff_availability_company_id_fkey`
    FOREIGN KEY (`company_id`) REFERENCES `company`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff_availability`
    ADD CONSTRAINT `staff_availability_staff_id_fkey`
    FOREIGN KEY (`staff_id`) REFERENCES `staff_profile`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff_time_off`
    ADD CONSTRAINT `staff_time_off_company_id_fkey`
    FOREIGN KEY (`company_id`) REFERENCES `company`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff_time_off`
    ADD CONSTRAINT `staff_time_off_staff_id_fkey`
    FOREIGN KEY (`staff_id`) REFERENCES `staff_profile`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff_time_off`
    ADD CONSTRAINT `staff_time_off_requested_by_user_id_fkey`
    FOREIGN KEY (`requested_by_user_id`) REFERENCES `user`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff_time_off`
    ADD CONSTRAINT `staff_time_off_reviewed_by_user_id_fkey`
    FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `user`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
