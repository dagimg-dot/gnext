import { logger } from "./logger.js";
import { shell } from "./shell.js";

export class GnomeUtils {
	/**
	 * Check if running on Wayland
	 */
	isWayland(): boolean {
		return process.env.XDG_SESSION_TYPE === "wayland";
	}

	/**
	 * Get GNOME Shell version
	 */
	async getGnomeShellVersion(): Promise<string | null> {
		const result = await shell.execCommand("gnome-shell --version 2>/dev/null");
		if (result.exitCode === 0) {
			const match = result.stdout.match(/(\d+\.\d+)/);
			return match ? match[1] : null;
		}
		return null;
	}

	/**
	 * Get GNOME Shell major version
	 */
	async getGnomeShellMajorVersion(): Promise<number | null> {
		const version = await this.getGnomeShellVersion();
		if (version) {
			const major = parseInt(version.split(".")[0], 10);
			return Number.isNaN(major) ? null : major;
		}
		return null;
	}

	/**
	 * Install extension using gnome-extensions command
	 */
	async installExtension(zipPath: string): Promise<boolean> {
		logger.info("Installing extension...");
		const result = await shell.exec("gnome-extensions", [
			"install",
			"--force",
			zipPath,
		]);

		if (result.exitCode === 0) {
			logger.success("Extension installed");
			return true;
		} else {
			logger.error(`Failed to install extension: ${result.stderr}`);
			return false;
		}
	}

	/**
	 * Enable extension using gnome-extensions command
	 */
	async enableExtension(uuid: string): Promise<boolean> {
		logger.info("Enabling extension...");
		const result = await shell.exec("gnome-extensions", ["enable", uuid]);

		if (result.exitCode === 0) {
			logger.success("Extension enabled");
			return true;
		} else {
			logger.error(`Failed to enable extension: ${result.stderr}`);
			return false;
		}
	}

	/**
	 * Restart GNOME Shell (X11 only)
	 */
	async restartGnomeShell(): Promise<boolean> {
		if (this.isWayland()) {
			logger.error(
				"Cannot restart GNOME Shell on Wayland. Please log out and log back in.",
			);
			return false;
		}

		logger.info("Attempting to restart GNOME Shell...");

		// Try using gdbus with Meta.restart
		const js = `if (Meta.is_wayland_compositor()) throw new Error("Wayland detected"); else Meta.restart(_("Restarting…"), global.context);`;

		const result = await shell.execCommand(
			`gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval '${js}'`,
		);

		if (result.exitCode === 0 && result.stdout.includes("true")) {
			logger.success("GNOME Shell restart initiated");
			return true;
		}

		// Fallback to killall
		logger.info("Trying killall method...");
		const killallResult = await shell.exec("killall", ["-HUP", "gnome-shell"]);

		if (killallResult.exitCode === 0) {
			logger.success("GNOME Shell restart initiated using killall");
			return true;
		}

		logger.error("Failed to restart GNOME Shell");
		return false;
	}

	/**
	 * Run nested GNOME Shell for development
	 */
	async runNestedShell(): Promise<void> {
		const majorVersion = await this.getGnomeShellMajorVersion();

		if (!majorVersion) {
			throw new Error("Could not detect GNOME Shell version");
		}

		const command =
			majorVersion >= 49
				? "dbus-run-session -- gnome-shell --devkit --wayland"
				: "dbus-run-session -- gnome-shell --nested --wayland";

		logger.info(`Starting nested GNOME Shell (version ${majorVersion})...`);
		logger.info("Press Ctrl+C to stop");

		// Run in foreground with inherited stdio
		await shell.exec("sh", ["-c", command], { stdio: "inherit" });
	}

	/**
	 * Watch extension logs
	 */
	async watchLogs(
		extensionName: string,
		filtered: boolean = false,
	): Promise<void> {
		logger.info(`Watching logs for ${extensionName}...`);
		logger.info("Press Ctrl+C to stop");
		logger.log("");

		if (filtered) {
			// Create awk filter for relevant logs
			const awkScript = `
        /^\\[${extensionName}\\]/ { print }
        /^Extension/ { print }
        /^Stack trace:/ {
          print
          while (getline > 0) {
            if ($0 ~ /^[[:space:]]*$/) break
            print
          }
          print ""
        }
        /^JS ERROR:/ {
          print
          while (getline > 0) {
            if ($0 ~ /^[[:space:]]*$/) break
            print
          }
          print ""
        }
      `;

			// Start both journalctl processes
			const gnomeShellCmd = `journalctl /usr/bin/gnome-shell -f -o cat | awk '${awkScript}'`;
			const gjsCmd = `journalctl /usr/bin/gjs -f -o cat | awk '${awkScript}'`;

			await Promise.all([
				shell.execCommand(gnomeShellCmd, { stdio: "inherit" }),
				shell.execCommand(gjsCmd, { stdio: "inherit" }),
			]);
		} else {
			// Unfiltered logs
			await Promise.all([
				shell.execCommand("journalctl /usr/bin/gnome-shell -f -o cat", {
					stdio: "inherit",
				}),
				shell.execCommand("journalctl /usr/bin/gjs -f -o cat", {
					stdio: "inherit",
				}),
			]);
		}
	}
}

export const gnome = new GnomeUtils();
