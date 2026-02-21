-- DropForeignKey
ALTER TABLE `events` DROP FOREIGN KEY `events_session_uuid_fkey`;

-- DropIndex
DROP INDEX `events_session_uuid_fkey` ON `events`;

-- AlterTable
ALTER TABLE `events` MODIFY `session_uuid` VARCHAR(255) NULL;

-- AddForeignKey
ALTER TABLE `events` ADD CONSTRAINT `events_session_uuid_fkey` FOREIGN KEY (`session_uuid`) REFERENCES `sessions`(`uuid`) ON DELETE SET NULL ON UPDATE CASCADE;
