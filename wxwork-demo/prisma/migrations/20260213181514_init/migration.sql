-- CreateTable
CREATE TABLE `sessions` (
    `uuid` VARCHAR(255) NOT NULL,
    `vid` VARCHAR(255) NOT NULL DEFAULT '',
    `is_login` INTEGER NOT NULL DEFAULT 0,
    `qrcode` TEXT NULL,
    `qrcode_key` VARCHAR(255) NOT NULL DEFAULT '',
    `last_event` VARCHAR(255) NOT NULL DEFAULT '',
    `last_error` TEXT NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`uuid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `session_uuid` VARCHAR(255) NOT NULL,
    `stage` VARCHAR(255) NOT NULL DEFAULT '',
    `event_type` VARCHAR(255) NOT NULL DEFAULT '',
    `payload` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `events` ADD CONSTRAINT `events_session_uuid_fkey` FOREIGN KEY (`session_uuid`) REFERENCES `sessions`(`uuid`) ON DELETE RESTRICT ON UPDATE CASCADE;
