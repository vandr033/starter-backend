/*
  Warnings:

  - Made the column `phone_prefix` on table `company` required. This step will fail if there are existing NULL values in that column.
  - Made the column `phone` on table `company` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE `company` MODIFY `phone_prefix` VARCHAR(8) NOT NULL DEFAULT '591',
    MODIFY `phone` VARCHAR(32) NOT NULL;
