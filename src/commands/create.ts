import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";
import { logger } from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createCommand(projectName: string): Promise<void> {
	try {
		const targetDir = path.join(process.cwd(), projectName);

		// Check if directory already exists
		if (await fs.pathExists(targetDir)) {
			logger.error(`Directory ${projectName} already exists!`);
			process.exit(1);
		}

		logger.info(`Creating new GNOME extension: ${projectName}`);

		// Get template directory (assumes template folder is at root of package)
		const templateDir = path.join(__dirname, "../../template");

		// Check if template exists
		if (!(await fs.pathExists(templateDir))) {
			logger.error(
				"Template directory not found. Please ensure the template folder exists.",
			);
			process.exit(1);
		}

		const spinner = logger.startSpinner("Copying template files...");

		// Copy template to target directory
		await fs.copy(templateDir, targetDir);

		spinner.succeed("Template files copied");

		logger.success(`Extension created successfully in ${projectName}/`);
		logger.info("\nNext steps:");
		logger.log(`  cd ${projectName}`);
		logger.log(`  bun install`);
		logger.log(`  gnext dev`);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error(`Failed to create extension: ${message}`);
		process.exit(1);
	}
}
