import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../utils/logger.js";
import { project } from "../utils/project.js";

export async function bumpCommand(
	version: string,
	options: { release?: boolean } = {},
): Promise<void> {
	try {
		const cwd = project.getCwd();

		// Validate version format
		if (!/^\d+\.\d+\.\d+$/.test(version)) {
			logger.error(
				"Invalid version format. Please use semantic versioning (e.g., 1.2.0)",
			);
			process.exit(1);
		}

		if (options.release) {
			await createRelease(version, cwd);
		} else {
			await bumpVersion(version, cwd);
		}
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error(`Version bump failed: ${message}`);
		process.exit(1);
	}
}

async function bumpVersion(newVersion: string, cwd: string): Promise<void> {
	const spinner = logger.startSpinner("Bumping version...");

	try {
		const packagePath = join(cwd, "package.json");
		const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));

		const metadataPath = join(cwd, "metadata.json");
		const metadataJson = JSON.parse(readFileSync(metadataPath, "utf8"));

		packageJson.version = newVersion;
		metadataJson["version-name"] = newVersion;

		const currentVersion = metadataJson.version || 0;
		metadataJson.version = currentVersion + 1;

		writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
		writeFileSync(metadataPath, `${JSON.stringify(metadataJson, null, 2)}\n`);

		spinner.succeed("Version bumped successfully!");
		logger.info(`📦 package.json: ${newVersion}`);
		logger.info(
			`🔧 metadata.json: version-name = ${newVersion}, version = ${metadataJson.version}`,
		);
	} catch (error: unknown) {
		spinner.fail("Failed to bump version");
		throw error;
	}
}

async function createRelease(newVersion: string, cwd: string): Promise<void> {
	logger.info(`Creating release ${newVersion}...`);

	try {
		// Check if we're in a git repository
		try {
			execSync("git rev-parse --git-dir", { stdio: "ignore", cwd });
		} catch {
			throw new Error("Not in a git repository");
		}

		// Check if there are uncommitted changes
		const status = execSync("git status --porcelain", {
			encoding: "utf8",
			cwd,
		});
		if (status.trim()) {
			logger.error(
				"There are uncommitted changes. Please commit or stash them first.",
			);
			logger.error("Uncommitted files:");
			logger.error(status);
			process.exit(1);
		}

		// Bump version first
		await bumpVersion(newVersion, cwd);

		// Add version files
		logger.info("📝 Adding version files to git...");
		execSync("git add package.json metadata.json", { stdio: "inherit", cwd });

		// Commit with conventional commit message
		const commitMessage = `chore: bump version to ${newVersion}`;
		logger.info(`💾 Committing: ${commitMessage}`);
		execSync(`git commit -m "${commitMessage}"`, { stdio: "inherit", cwd });

		// Push to remote
		logger.info("🚀 Pushing to remote...");
		execSync("git push", { stdio: "inherit", cwd });

		// Create and push tag
		const tagName = `v${newVersion}`;
		logger.info(`🏷️  Creating tag: ${tagName}`);
		execSync(`git tag ${tagName}`, { stdio: "inherit", cwd });

		logger.info(`📤 Pushing tag: ${tagName}`);
		execSync(`git push origin ${tagName}`, { stdio: "inherit", cwd });

		logger.success(`🎉 Release ${newVersion} created successfully!`);
		logger.info("📋 Summary:");
		logger.info(`   • Version bumped to ${newVersion}`);
		logger.info("   • Changes committed and pushed");
		logger.info(`   • Tag ${tagName} created and pushed`);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to create release: ${message}`);
	}
}
