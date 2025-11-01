#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { buildCommand } from "./commands/build.js";
import { bumpCommand } from "./commands/bump.js";
import { createCommand } from "./commands/create.js";
import { devCommand } from "./commands/dev.js";
import { logsCommand } from "./commands/logs.js";
import { publishCommand } from "./commands/publish.js";
import { setupCommand } from "./commands/setup.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageJsonPath = path.join(__dirname, "../package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

const program = new Command();

program
	.name("gnext")
	.description("An all-in-one CLI tool to create and develop GNOME Extensions")
	.version(packageJson.version);

// Create command
program
	.command("create <project-name>")
	.description("Create a new GNOME extension from template")
	.action(async (projectName: string) => {
		await createCommand(projectName);
	});

// Build command
program
	.command("build")
	.description("Build the GNOME extension")
	.option("-i, --install", "Install the extension after building")
	.option(
		"-r, --unsafe-reload",
		"Build, install, and reload GNOME Shell (X11 only, requires unsafe mode)",
	)
	.option(
		"--use-esbuild",
		"Use esbuild for compilation (produces bundled code - not recommended for GNOME store)",
	)
	.action(async (options) => {
		await buildCommand({
			install: options.install,
			unsafeReload: options.unsafeReload,
			useEsbuild: options.useEsbuild,
		});
	});

// Dev command
program
	.command("dev")
	.description("Run extension in development mode (nested GNOME Shell)")
	.action(async () => {
		await devCommand();
	});

// Logs command
program
	.command("logs")
	.description("Watch extension logs in real-time")
	.option(
		"-f, --filtered",
		"Show only relevant logs (extension errors and stack traces)",
	)
	.action(async (options) => {
		await logsCommand({
			filtered: options.filtered,
		});
	});

// Publish command
program
	.command("publish")
	.description("Publish extension to extensions.gnome.org")
	.option("-u, --username <username>", "Username for extensions.gnome.org")
	.option("-p, --password <password>", "Password for extensions.gnome.org")
	.action(async (options) => {
		await publishCommand({
			username: options.username,
			password: options.password,
		});
	});

// Bump command
program
	.command("bump <version>")
	.description("Bump extension version")
	.option("-r, --release", "Create git release (commit, push, tag)")
	.action(async (version: string, options) => {
		await bumpCommand(version, { release: options.release });
	});

// Setup command
program
	.command("setup <vm-target>")
	.description("Setup VM development workflow with sshfs mounting")
	.action(async (vmTarget: string) => {
		await setupCommand(vmTarget);
	});

program.parse();
