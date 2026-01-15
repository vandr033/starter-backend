/*
  Warnings:

  - A unique constraint covering the columns `[phone_prefix]` on the table `user` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `user_phone_prefix_key` ON `user`(`phone_prefix`);
