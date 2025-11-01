import path from "node:path";
import fs from "fs-extra";
import type { ExtensionMetadata, PackageJson } from "../types/index.js";

export class ProjectUtils {
	/**
	 * Get the current working directory
	 */
	getCwd(): string {
		return process.cwd();
	}

	/**
	 * Check if a file exists
	 */
	async fileExists(filePath: string): Promise<boolean> {
		try {
			await fs.access(filePath);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Read and parse metadata.json
	 */
	async readMetadata(cwd: string = this.getCwd()): Promise<ExtensionMetadata> {
		const metadataPath = path.join(cwd, "metadata.json");

		if (!(await this.fileExists(metadataPath))) {
			throw new Error(
				"metadata.json not found. Are you in a GNOME extension directory?",
			);
		}

		const content = await fs.readFile(metadataPath, "utf-8");
		return JSON.parse(content);
	}

	/**
	 * Read and parse package.json
	 */
	async readPackageJson(cwd: string = this.getCwd()): Promise<PackageJson> {
		const packagePath = path.join(cwd, "package.json");

		if (!(await this.fileExists(packagePath))) {
			throw new Error("package.json not found.");
		}

		const content = await fs.readFile(packagePath, "utf-8");
		return JSON.parse(content);
	}

	/**
	 * Write metadata.json
	 */
	async writeMetadata(
		metadata: ExtensionMetadata,
		cwd: string = this.getCwd(),
	): Promise<void> {
		const metadataPath = path.join(cwd, "metadata.json");
		await fs.writeFile(
			metadataPath,
			`${JSON.stringify(metadata, null, 2)}\n`,
			"utf-8",
		);
	}

	/**
	 * Write package.json
	 */
	async writePackageJson(
		packageJson: PackageJson,
		cwd: string = this.getCwd(),
	): Promise<void> {
		const packagePath = path.join(cwd, "package.json");
		await fs.writeFile(
			packagePath,
			`${JSON.stringify(packageJson, null, 2)}\n`,
			"utf-8",
		);
	}

	/**
	 * Check if the project uses TypeScript
	 */
	async usesTypeScript(cwd: string = this.getCwd()): Promise<boolean> {
		const tsconfigPath = path.join(cwd, "tsconfig.json");
		return await this.fileExists(tsconfigPath);
	}

	/**
	 * Get the JavaScript output directory (dist/ for TypeScript, src/ otherwise)
	 */
	async getJsDir(cwd: string = this.getCwd()): Promise<string> {
		const usesTS = await this.usesTypeScript(cwd);
		return usesTS ? "dist" : "src";
	}

	/**
	 * Check if directory has translations (po files)
	 */
	async hasTranslations(cwd: string = this.getCwd()): Promise<boolean> {
		const poDir = path.join(cwd, "po");
		if (!(await this.fileExists(poDir))) {
			return false;
		}

		const files = await fs.readdir(poDir);
		return files.some((f) => f.endsWith(".po"));
	}

	/**
	 * Check if directory has resources (data files)
	 */
	async hasResources(cwd: string = this.getCwd()): Promise<boolean> {
		const dataDir = path.join(cwd, "data");
		if (!(await this.fileExists(dataDir))) {
			return false;
		}

		const files = await fs.readdir(dataDir);
		return files.length > 0;
	}

	/**
	 * Check if directory has schemas
	 */
	async hasSchemas(cwd: string = this.getCwd()): Promise<boolean> {
		const jsDir = await this.getJsDir(cwd);
		const schemasDir = path.join(cwd, jsDir, "schemas");

		if (!(await this.fileExists(schemasDir))) {
			return false;
		}

		const files = await fs.readdir(schemasDir);
		return files.length > 0;
	}
}

export const project = new ProjectUtils();
