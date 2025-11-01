import chalk from "chalk";
import ora, { type Ora } from "ora";

export class Logger {
	private spinner: Ora | null = null;

	success(message: string): void {
		console.log(chalk.green("✓"), message);
	}

	error(message: string): void {
		console.log(chalk.red("✗"), message);
	}

	info(message: string): void {
		console.log(chalk.blue("ℹ"), message);
	}

	warning(message: string): void {
		console.log(chalk.yellow("⚠"), message);
	}

	log(message: string): void {
		console.log(message);
	}

	startSpinner(message: string): Ora {
		this.spinner = ora(message).start();
		return this.spinner;
	}

	stopSpinner(success: boolean = true, message?: string): void {
		if (this.spinner) {
			if (success) {
				this.spinner.succeed(message);
			} else {
				this.spinner.fail(message);
			}
			this.spinner = null;
		}
	}

	updateSpinner(message: string): void {
		if (this.spinner) {
			this.spinner.text = message;
		}
	}
}

export const logger = new Logger();
