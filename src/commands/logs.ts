import type { LogsOptions } from "../types/index.js";
import { gnome } from "../utils/gnome.js";
import { logger } from "../utils/logger.js";
import { project } from "../utils/project.js";

export async function logsCommand(options: LogsOptions = {}): Promise<void> {
	try {
		const cwd = project.getCwd();
		const metadata = await project.readMetadata(cwd);

		logger.info(`Watching logs for: ${metadata.name}`);
		logger.info(`Filtered: ${options.filtered ? "Yes" : "No"}`);
		logger.log("");

		await gnome.watchLogs(metadata.name, options.filtered || false);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error(`Failed to watch logs: ${message}`);
		process.exit(1);
	}
}
