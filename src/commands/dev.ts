import { gnome } from "../utils/gnome.js";
import { logger } from "../utils/logger.js";

export async function devCommand(): Promise<void> {
	try {
		logger.info("Starting development mode...");
		logger.info("This will launch a nested GNOME Shell session for testing.");
		logger.log("");

		await gnome.runNestedShell();
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error(`Dev mode failed: ${message}`);
		process.exit(1);
	}
}
