-- CreateTable
CREATE TABLE `whatsapp_event_group` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `group_event_id` INTEGER NOT NULL,
    `group_jid` VARCHAR(64) NOT NULL,
    `group_name` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `whatsapp_event_group_group_event_id_idx`(`group_event_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `whatsapp_event_group` ADD CONSTRAINT `whatsapp_event_group_group_event_id_fkey` FOREIGN KEY (`group_event_id`) REFERENCES `group_event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
