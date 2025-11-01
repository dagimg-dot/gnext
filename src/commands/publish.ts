import path from "node:path";
import type { PublishOptions } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { project } from "../utils/project.js";
import { shell } from "../utils/shell.js";

export async function publishCommand(
	options: PublishOptions = {},
): Promise<void> {
	const cwd = project.getCwd();

	try {
		// Check for required tools
		if (!(await shell.commandExists("curl"))) {
			logger.error("curl is required for publishing. Please install it.");
			process.exit(1);
		}

		if (!(await shell.commandExists("jq"))) {
			logger.error("jq is required for publishing. Please install it.");
			process.exit(1);
		}

		// Read metadata and package.json
		const metadata = await project.readMetadata(cwd);
		const packageJson = await project.readPackageJson(cwd);

		const uuid = metadata.uuid;
		const version = packageJson.version;
		const buildDir = path.join(cwd, "build");
		const zipPath = path.join(
			buildDir,
			`${uuid}.shell-extension-v${version}.zip`,
		);

		// Check if zip file exists
		if (!(await project.fileExists(zipPath))) {
			logger.error(`Extension package not found: ${zipPath}`);
			logger.info("Please build the extension first with: gnext build");
			process.exit(1);
		}

		// Get credentials
		const username = options.username || process.env.GNOME_USERNAME;
		const password = options.password || process.env.GNOME_PASSWORD;

		if (!username || !password) {
			logger.error("Username and password are required.");
			logger.info("Provide them via:");
			logger.info(
				"  - Command options: gnext publish --username=<user> --password=<pass>",
			);
			logger.info(
				"  - Environment variables: GNOME_USERNAME and GNOME_PASSWORD",
			);
			process.exit(1);
		}

		logger.info(`Publishing ${metadata.name} (${uuid}) version ${version}...`);

		// Authenticate
		const spinner = logger.startSpinner(
			"Authenticating with extensions.gnome.org...",
		);

		const loginUrl = "https://extensions.gnome.org/api/v1/accounts/login/";
		const authResult = await shell.execCommand(
			`curl -X POST -H "Content-Type: application/x-www-form-urlencoded" -H "Accept: application/json" -d "login=${username}&password=${password}" "${loginUrl}"`,
			{ cwd },
		);

		if (authResult.exitCode !== 0 || !authResult.stdout) {
			spinner.fail("Failed to connect to extensions.gnome.org");
			process.exit(1);
		}

		const tokenMatch = authResult.stdout.match(/"token":\s*"([^"]+)"/);
		if (!tokenMatch) {
			const errorMatch = authResult.stdout.match(/"error":\s*"([^"]+)"/);
			const errorMsg = errorMatch ? errorMatch[1] : "Authentication failed";
			spinner.fail(errorMsg);
			process.exit(1);
		}

		const token = tokenMatch[1];
		spinner.succeed("Authentication successful");

		// Upload extension
		const uploadSpinner = logger.startSpinner(
			`Uploading ${path.basename(zipPath)}...`,
		);

		const uploadUrl = "https://extensions.gnome.org/api/v1/extensions";
		const uploadResult = await shell.execCommand(
			`curl -s -w "\\n%{http_code}" -X POST -H "Authorization: Token ${token}" -F "source=@${zipPath}" -F "shell_license_compliant=true" -F "tos_compliant=true" "${uploadUrl}"`,
			{ cwd },
		);

		const lines = uploadResult.stdout.trim().split("\n");
		const httpCode = lines[lines.length - 1];
		const responseBody = lines.slice(0, -1).join("\n");

		if (httpCode === "201") {
			uploadSpinner.succeed("Extension uploaded successfully!");
			logger.success(
				"Your extension has been published to extensions.gnome.org",
			);
		} else {
			let errorMsg = "Upload failed";
			if (responseBody) {
				const detailMatch = responseBody.match(/"detail":\s*"([^"]+)"/);
				const errorMatch = responseBody.match(/"error":\s*"([^"]+)"/);
				errorMsg = detailMatch
					? detailMatch[1]
					: errorMatch
						? errorMatch[1]
						: errorMsg;
			}
			uploadSpinner.fail(`${errorMsg} (HTTP ${httpCode})`);
			process.exit(1);
		}
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error(`Publish failed: ${message}`);
		process.exit(1);
	}
}
