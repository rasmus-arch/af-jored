/*
  Warnings:

  - You are about to drop the column `base_discount_percent` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `brand_id` on the `decors` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `decors` DROP FOREIGN KEY `decors_brand_id_fkey`;

-- AlterTable
ALTER TABLE `companies` DROP COLUMN `base_discount_percent`;

-- AlterTable
ALTER TABLE `decors` DROP COLUMN `brand_id`;

-- AlterTable
ALTER TABLE `settings` ADD COLUMN `accent_color` VARCHAR(7) NULL,
    ADD COLUMN `logo_url` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `products` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` ENUM('DISKHO', 'BLANDARE', 'TILLBEHOR') NOT NULL,
    `brand_id` INTEGER NOT NULL,
    `article_code` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `image_url` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `products_article_code_key`(`article_code`),
    INDEX `products_brand_id_idx`(`brand_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_prices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `price_list_id` INTEGER NOT NULL,
    `product_id` INTEGER NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `product_prices_price_list_id_product_id_key`(`price_list_id`, `product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `company_brand_access` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `brand_id` INTEGER NOT NULL,
    `visible` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `company_brand_access_company_id_brand_id_key`(`company_id`, `brand_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_brand_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_prices` ADD CONSTRAINT `product_prices_price_list_id_fkey` FOREIGN KEY (`price_list_id`) REFERENCES `price_lists`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_prices` ADD CONSTRAINT `product_prices_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `company_brand_access` ADD CONSTRAINT `company_brand_access_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `company_brand_access` ADD CONSTRAINT `company_brand_access_brand_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
