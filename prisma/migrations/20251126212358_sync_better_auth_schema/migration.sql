/*
  Warnings:

  - You are about to drop the column `userID` on the `session` table. All the data in the column will be lost.
  - You are about to drop the column `email_verified_at` on the `user` table. All the data in the column will be lost.
  - You are about to drop the column `phone` on the `user` table. All the data in the column will be lost.
  - You are about to drop the column `phone_verified_at` on the `user` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[phoneNumber]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `userId` to the `session` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `session` DROP FOREIGN KEY `session_userID_fkey`;

-- DropIndex
DROP INDEX `session_userID_fkey` ON `session`;

-- DropIndex
DROP INDEX `User_phone_prefix_key` ON `user`;

-- AlterTable
ALTER TABLE `session` DROP COLUMN `userID`,
    ADD COLUMN `userId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `user` DROP COLUMN `email_verified_at`,
    DROP COLUMN `phone`,
    DROP COLUMN `phone_verified_at`,
    ADD COLUMN `phoneNumber` VARCHAR(32) NULL,
    ADD COLUMN `phoneNumberVerified` BOOLEAN NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX `User_phoneNumber_key` ON `user`(`phoneNumber`);

-- AddForeignKey
ALTER TABLE `session` ADD CONSTRAINT `session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
