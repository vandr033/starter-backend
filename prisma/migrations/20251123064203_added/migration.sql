-- CreateTable
CREATE TABLE `staff_service` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `staff_id` INTEGER NOT NULL,
    `service_id` INTEGER NOT NULL,
    `price_cents_override` INTEGER NULL,
    `duration_minutes_override` INTEGER NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `staff_service_company_id_service_id_idx`(`company_id`, `service_id`),
    INDEX `staff_service_staff_id_is_active_idx`(`staff_id`, `is_active`),
    UNIQUE INDEX `staff_service_company_id_staff_id_service_id_key`(`company_id`, `staff_id`, `service_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `staff_service` ADD CONSTRAINT `staff_service_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff_service` ADD CONSTRAINT `staff_service_staff_id_fkey` FOREIGN KEY (`staff_id`) REFERENCES `staff_profile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff_service` ADD CONSTRAINT `staff_service_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `service`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
