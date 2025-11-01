import { execa, execaCommand, type Options } from "execa";

export class ShellExecutor {
	/**
	 * Execute a shell command with execa
	 */
	async exec(
		command: string,
		args: string[] = [],
		options: Options = {},
	): Promise<{ stdout: string; stderr: string; exitCode: number }> {
		try {
			const result = await execa(command, args, {
				...options,
				reject: false,
			});
			return {
				stdout: result.stdout,
				stderr: result.stderr,
				exitCode: result.exitCode,
			};
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : "Unknown error";
			return {
				stdout: "",
				stderr: message,
				exitCode: 1,
			};
		}
	}

	/**
	 * Execute a shell command string with execa
	 */
	async execCommand(
		command: string,
		options: Options = {},
	): Promise<{ stdout: string; stderr: string; exitCode: number }> {
		try {
			const result = await execaCommand(command, {
				...options,
				reject: false,
				shell: true,
			});
			return {
				stdout: result.stdout,
				stderr: result.stderr,
				exitCode: result.exitCode,
			};
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : "Unknown error";
			return {
				stdout: "",
				stderr: message,
				exitCode: 1,
			};
		}
	}

	/**
	 * Check if a command exists in the system
	 */
	async commandExists(command: string): Promise<boolean> {
		const result = await this.execCommand(`command -v ${command}`);
		return result.exitCode === 0;
	}

	/**
	 * Execute command and throw if it fails
	 */
	async execOrThrow(
		command: string,
		args: string[] = [],
		options: Options = {},
	): Promise<string> {
		const result = await this.exec(command, args, options);
		if (result.exitCode !== 0) {
			throw new Error(
				`Command failed: ${command} ${args.join(" ")}\n${result.stderr}`,
			);
		}
		return result.stdout;
	}
}

export const shell = new ShellExecutor();
