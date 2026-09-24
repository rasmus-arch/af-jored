-- CreateTable
CREATE TABLE `companies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `org_number` VARCHAR(191) NOT NULL,
    `street` VARCHAR(191) NULL,
    `postal_code` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `contact_name` VARCHAR(191) NULL,
    `contact_email` VARCHAR(191) NULL,
    `contact_phone` VARCHAR(191) NULL,
    `base_discount_percent` DECIMAL(5, 2) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NULL,
    `email` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'RESELLER') NOT NULL,
    `totp_secret` VARCHAR(191) NULL,
    `totp_enabled` BOOLEAN NOT NULL DEFAULT false,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_company_id_idx`(`company_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invitations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'RESELLER') NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `accepted_at` DATETIME(3) NULL,
    `invited_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `invitations_token_key`(`token`),
    INDEX `invitations_company_id_idx`(`company_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `password_reset_tokens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `password_reset_tokens_token_key`(`token`),
    INDEX `password_reset_tokens_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NULL,
    `action` VARCHAR(191) NOT NULL,
    `entity_type` VARCHAR(191) NULL,
    `entity_id` INTEGER NULL,
    `old_value` JSON NULL,
    `new_value` JSON NULL,
    `ip_address` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_user_id_idx`(`user_id`),
    INDEX `audit_logs_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `decor_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `materials` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `image_url` VARCHAR(191) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `brands` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `logo_url` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `decors` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `material_id` INTEGER NOT NULL,
    `brand_id` INTEGER NOT NULL,
    `category_id` INTEGER NOT NULL,
    `article_code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `surface_texture` VARCHAR(191) NULL,
    `max_length_mm` INTEGER NULL,
    `image_url` VARCHAR(191) NULL,
    `status` ENUM('AKTIV', 'UTGAENDE', 'UTGATT') NOT NULL DEFAULT 'AKTIV',
    `notes` TEXT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `decors_article_code_key`(`article_code`),
    INDEX `decors_material_id_idx`(`material_id`),
    INDEX `decors_brand_id_idx`(`brand_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thicknesses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `material_id` INTEGER NOT NULL,
    `value_mm` INTEGER NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `thicknesses_material_id_value_mm_key`(`material_id`, `value_mm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `decor_thicknesses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `decor_id` INTEGER NOT NULL,
    `thickness_id` INTEGER NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `decor_thicknesses_decor_id_thickness_id_key`(`decor_id`, `thickness_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `edge_profiles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `image_url` VARCHAR(191) NULL,
    `price_unit` ENUM('STYCK', 'LOPMETER') NOT NULL DEFAULT 'LOPMETER',
    `active` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `edge_profile_compatibilities` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `edge_profile_id` INTEGER NOT NULL,
    `material_id` INTEGER NOT NULL,
    `thickness_id` INTEGER NOT NULL,

    UNIQUE INDEX `edge_profile_compatibilities_edge_profile_id_material_id_thi_key`(`edge_profile_id`, `material_id`, `thickness_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `add_ons` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `price_unit` ENUM('STYCK', 'LOPMETER') NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `add_on_materials` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `add_on_id` INTEGER NOT NULL,
    `material_id` INTEGER NOT NULL,

    UNIQUE INDEX `add_on_materials_add_on_id_material_id_key`(`add_on_id`, `material_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `price_lists` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `valid_from` DATETIME(3) NOT NULL,
    `created_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `price_lists_valid_from_idx`(`valid_from`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `countertop_price_rows` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `price_list_id` INTEGER NOT NULL,
    `material_id` INTEGER NOT NULL,
    `thickness_id` INTEGER NOT NULL,
    `depth_from_mm` INTEGER NOT NULL,
    `depth_to_mm` INTEGER NOT NULL,
    `price_per_meter` DECIMAL(10, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `countertop_price_rows_price_list_id_material_id_thickness_id_idx`(`price_list_id`, `material_id`, `thickness_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `edge_profile_prices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `price_list_id` INTEGER NOT NULL,
    `edge_profile_id` INTEGER NOT NULL,
    `thickness_id` INTEGER NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `edge_profile_prices_price_list_id_edge_profile_id_idx`(`price_list_id`, `edge_profile_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `add_on_prices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `price_list_id` INTEGER NOT NULL,
    `add_on_id` INTEGER NOT NULL,
    `thickness_id` INTEGER NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `add_on_prices_price_list_id_add_on_id_idx`(`price_list_id`, `add_on_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `discount_rules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `material_id` INTEGER NULL,
    `brand_id` INTEGER NULL,
    `discount_percent` DECIMAL(5, 2) NOT NULL,
    `valid_from` DATETIME(3) NULL,
    `valid_to` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `discount_rules_company_id_material_id_brand_id_idx`(`company_id`, `material_id`, `brand_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `net_price_overrides` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `decor_id` INTEGER NOT NULL,
    `thickness_id` INTEGER NOT NULL,
    `depth_from_mm` INTEGER NOT NULL,
    `depth_to_mm` INTEGER NOT NULL,
    `net_price_per_meter` DECIMAL(10, 2) NOT NULL,
    `valid_from` DATETIME(3) NULL,
    `valid_to` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `net_price_overrides_company_id_decor_id_thickness_id_idx`(`company_id`, `decor_id`, `thickness_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `news_posts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `published_at` DATETIME(3) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `documents` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NOT NULL,
    `file_url` VARCHAR(191) NOT NULL,
    `category` ENUM('PRISLISTA', 'MONTERINGSANVISNING', 'GARANTIVILLKOR', 'MARKNADSMATERIAL') NOT NULL,
    `visibility` ENUM('ALLA', 'SPECIFIKA') NOT NULL DEFAULT 'ALLA',
    `created_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_companies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `document_id` INTEGER NOT NULL,
    `company_id` INTEGER NOT NULL,

    UNIQUE INDEX `document_companies_document_id_company_id_key`(`document_id`, `company_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_views` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `decor_id` INTEGER NOT NULL,
    `company_id` INTEGER NULL,
    `user_id` INTEGER NULL,
    `viewed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `product_views_decor_id_idx`(`decor_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `vat_percentage` DECIMAL(5, 2) NOT NULL DEFAULT 25.00,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invitations` ADD CONSTRAINT `invitations_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invitations` ADD CONSTRAINT `invitations_invited_by_id_fkey` FOREIGN KEY (`invited_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `password_reset_tokens` ADD CONSTRAINT `password_reset_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `decors` ADD CONSTRAINT `decors_material_id_fkey` FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `decors` ADD CONSTRAINT `decors_brand_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `decors` ADD CONSTRAINT `decors_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `decor_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thicknesses` ADD CONSTRAINT `thicknesses_material_id_fkey` FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `decor_thicknesses` ADD CONSTRAINT `decor_thicknesses_decor_id_fkey` FOREIGN KEY (`decor_id`) REFERENCES `decors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `decor_thicknesses` ADD CONSTRAINT `decor_thicknesses_thickness_id_fkey` FOREIGN KEY (`thickness_id`) REFERENCES `thicknesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `edge_profile_compatibilities` ADD CONSTRAINT `edge_profile_compatibilities_edge_profile_id_fkey` FOREIGN KEY (`edge_profile_id`) REFERENCES `edge_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `edge_profile_compatibilities` ADD CONSTRAINT `edge_profile_compatibilities_material_id_fkey` FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `edge_profile_compatibilities` ADD CONSTRAINT `edge_profile_compatibilities_thickness_id_fkey` FOREIGN KEY (`thickness_id`) REFERENCES `thicknesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `add_on_materials` ADD CONSTRAINT `add_on_materials_add_on_id_fkey` FOREIGN KEY (`add_on_id`) REFERENCES `add_ons`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `add_on_materials` ADD CONSTRAINT `add_on_materials_material_id_fkey` FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `countertop_price_rows` ADD CONSTRAINT `countertop_price_rows_price_list_id_fkey` FOREIGN KEY (`price_list_id`) REFERENCES `price_lists`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `countertop_price_rows` ADD CONSTRAINT `countertop_price_rows_material_id_fkey` FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `countertop_price_rows` ADD CONSTRAINT `countertop_price_rows_thickness_id_fkey` FOREIGN KEY (`thickness_id`) REFERENCES `thicknesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `edge_profile_prices` ADD CONSTRAINT `edge_profile_prices_price_list_id_fkey` FOREIGN KEY (`price_list_id`) REFERENCES `price_lists`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `edge_profile_prices` ADD CONSTRAINT `edge_profile_prices_edge_profile_id_fkey` FOREIGN KEY (`edge_profile_id`) REFERENCES `edge_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `edge_profile_prices` ADD CONSTRAINT `edge_profile_prices_thickness_id_fkey` FOREIGN KEY (`thickness_id`) REFERENCES `thicknesses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `add_on_prices` ADD CONSTRAINT `add_on_prices_price_list_id_fkey` FOREIGN KEY (`price_list_id`) REFERENCES `price_lists`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `add_on_prices` ADD CONSTRAINT `add_on_prices_add_on_id_fkey` FOREIGN KEY (`add_on_id`) REFERENCES `add_ons`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `add_on_prices` ADD CONSTRAINT `add_on_prices_thickness_id_fkey` FOREIGN KEY (`thickness_id`) REFERENCES `thicknesses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `discount_rules` ADD CONSTRAINT `discount_rules_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `discount_rules` ADD CONSTRAINT `discount_rules_material_id_fkey` FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `discount_rules` ADD CONSTRAINT `discount_rules_brand_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `net_price_overrides` ADD CONSTRAINT `net_price_overrides_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `net_price_overrides` ADD CONSTRAINT `net_price_overrides_decor_id_fkey` FOREIGN KEY (`decor_id`) REFERENCES `decors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `net_price_overrides` ADD CONSTRAINT `net_price_overrides_thickness_id_fkey` FOREIGN KEY (`thickness_id`) REFERENCES `thicknesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_companies` ADD CONSTRAINT `document_companies_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_companies` ADD CONSTRAINT `document_companies_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_views` ADD CONSTRAINT `product_views_decor_id_fkey` FOREIGN KEY (`decor_id`) REFERENCES `decors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_views` ADD CONSTRAINT `product_views_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_views` ADD CONSTRAINT `product_views_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
