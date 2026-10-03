CREATE TABLE `platform_access` (
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	PRIMARY KEY(`tenant_id`, `user_id`),
	FOREIGN KEY (`tenant_id`) REFERENCES `platform_tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `platform_access_user` ON `platform_access` (`user_id`);--> statement-breakpoint
CREATE TABLE `platform_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`text` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `platform_audit_tenant` ON `platform_audit` (`tenant_id`,`id`);--> statement-breakpoint
CREATE TABLE `platform_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`request_key` text NOT NULL,
	`cents` integer NOT NULL,
	`label` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `platform_tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `platform_ledger_request` ON `platform_ledger` (`tenant_id`,`request_key`);--> statement-breakpoint
CREATE INDEX `platform_ledger_tenant` ON `platform_ledger` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `platform_owners` (
	`slot` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `platform_requests` (
	`user_id` text NOT NULL,
	`request_key` text NOT NULL,
	`digest` text NOT NULL,
	`tenant_id` text NOT NULL,
	`action` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `request_key`)
);
--> statement-breakpoint
CREATE TABLE `platform_tenants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`domain` text NOT NULL,
	`until` text NOT NULL,
	`status` text NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL,
	`last_op` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `platform_tenants_name` ON `platform_tenants` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `platform_tenants_domain` ON `platform_tenants` (`domain`);