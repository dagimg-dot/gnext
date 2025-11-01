import path from "node:path";
import fs from "fs-extra";
import type { BuildOptions } from "../types/index.js";
import { gnome } from "../utils/gnome.js";
import { logger } from "../utils/logger.js";
import { project } from "../utils/project.js";
import { shell } from "../utils/shell.js";

export async function buildCommand(options: BuildOptions = {}): Promise<void> {
	const cwd = project.getCwd();

	try {
		// Read metadata and package.json
		const metadata = await project.readMetadata(cwd);
		const packageJson = await project.readPackageJson(cwd);

		const uuid = metadata.uuid;
		const version = packageJson.version;
		const buildDir = path.join(cwd, "build");
		const usesTS = await project.usesTypeScript(cwd);
		const jsDir = await project.getJsDir(cwd);

		logger.info(`Building extension: ${metadata.name} (${uuid})`);
		logger.info(`Version: ${version}`);

		// Compile TypeScript if needed
		if (usesTS) {
			await compileTypeScript(cwd, jsDir);
		}

		// Compile translations if they exist
		if (await project.hasTranslations(cwd)) {
			await compileTranslations(cwd, jsDir, uuid);
		}

		// Compile resources if they exist
		let resourceTarget: string | null = null;
		if (await project.hasResources(cwd)) {
			resourceTarget = await compileResources(cwd, buildDir, uuid);
		}

		// Compile schemas if they exist
		if (await project.hasSchemas(cwd)) {
			await compileSchemas(cwd, jsDir);
		}

		// Create zip package
		await createZipPackage(cwd, buildDir, jsDir, uuid, version, resourceTarget);

		logger.success(`Extension built successfully!`);
		logger.info(`Package: ${buildDir}/${uuid}.shell-extension-v${version}.zip`);

		// Install if requested
		if (options.install) {
			const zipPath = path.join(
				buildDir,
				`${uuid}.shell-extension-v${version}.zip`,
			);
			const installed = await gnome.installExtension(zipPath);

			if (installed) {
				await gnome.enableExtension(uuid);

				// Restart GNOME Shell if requested
				if (options.unsafeReload) {
					await gnome.restartGnomeShell();
				} else {
					logger.info("Log out and log back in to apply changes.");
				}
			}
		}
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error(`Build failed: ${message}`);
		process.exit(1);
	}
}

async function compileTypeScript(cwd: string, outDir: string): Promise<void> {
	const spinner = logger.startSpinner("Compiling TypeScript files...");

	// Check if bun is installed
	if (!(await shell.commandExists("bun"))) {
		spinner.fail(
			"Bun is not installed. Please install Bun to compile TypeScript.",
		);
		throw new Error("Bun not found");
	}

	// Remove old dist directory
	const distPath = path.join(cwd, outDir);
	if (await project.fileExists(distPath)) {
		await fs.remove(distPath);
	}

	// Install dependencies if node_modules doesn't exist
	if (!(await project.fileExists(path.join(cwd, "node_modules")))) {
		spinner.text = "Installing dependencies...";
		await shell.execOrThrow("bun", ["install"], { cwd });
	}

	// Check if custom esbuild script exists
	const esbuildScript = path.join(cwd, "scripts", "esbuild.js");
	if (await project.fileExists(esbuildScript)) {
		spinner.text = "Compiling with esbuild...";
		await shell.execOrThrow("bun", ["./scripts/esbuild.js"], { cwd });
	} else {
		spinner.text = "Compiling with tsc...";
		await shell.execOrThrow("bunx", ["tsc"], { cwd });
	}

	// Copy non-TypeScript files from src to dist
	const srcDir = path.join(cwd, "src");
	const files = await fs.readdir(srcDir, { recursive: true });

	for (const file of files) {
		const filePath = path.join(srcDir, file as string);
		const stat = await fs.stat(filePath);

		if (stat.isFile() && !filePath.endsWith(".ts")) {
			const relativePath = path.relative(srcDir, filePath);
			const destPath = path.join(distPath, relativePath);
			await fs.ensureDir(path.dirname(destPath));
			await fs.copy(filePath, destPath);
		}
	}

	spinner.succeed("TypeScript compiled successfully");
}

async function compileTranslations(
	cwd: string,
	jsDir: string,
	uuid: string,
): Promise<void> {
	const spinner = logger.startSpinner("Compiling translations...");

	// Check if msgfmt is installed
	if (!(await shell.commandExists("msgfmt"))) {
		spinner.warn("gettext (msgfmt) not installed. Skipping translations.");
		return;
	}

	const poDir = path.join(cwd, "po");
	const poFiles = await fs.readdir(poDir);

	for (const poFile of poFiles) {
		if (!poFile.endsWith(".po")) continue;

		const lang = path.basename(poFile, ".po");
		const localeDir = path.join(cwd, jsDir, "locale", lang, "LC_MESSAGES");
		await fs.ensureDir(localeDir);

		const poPath = path.join(poDir, poFile);
		const moPath = path.join(localeDir, `${uuid}.mo`);

		await shell.execOrThrow("msgfmt", ["-c", poPath, "-o", moPath], { cwd });
	}

	spinner.succeed("Translations compiled");
}

async function compileResources(
	cwd: string,
	buildDir: string,
	uuid: string,
): Promise<string> {
	const spinner = logger.startSpinner("Compiling resources...");

	// Check if glib-compile-resources is installed
	if (!(await shell.commandExists("glib-compile-resources"))) {
		spinner.fail(
			"glib-compile-resources not installed. Cannot compile resources.",
		);
		throw new Error("glib-compile-resources not found");
	}

	await fs.ensureDir(buildDir);

	const resourceXml = path.join(buildDir, `${uuid}.gresource.xml`);
	const resourceTarget = path.join(buildDir, `${uuid}.gresource`);

	// Generate resource XML
	const dataDir = path.join(cwd, "data");
	const files = await fs.readdir(dataDir, { recursive: true });

	const fileEntries = files
		.filter((file) => {
			const filePath = path.join(dataDir, file as string);
			return fs.statSync(filePath).isFile();
		})
		.map((file) => `    <file>${file}</file>`)
		.join("\n");

	const xmlContent = `<?xml version='1.0' encoding='UTF-8'?>
<gresources>
  <gresource>
${fileEntries}
  </gresource>
</gresources>`;

	await fs.writeFile(resourceXml, xmlContent, "utf-8");

	// Compile resources
	await shell.execOrThrow(
		"glib-compile-resources",
		[
			"--generate",
			resourceXml,
			"--sourcedir=data",
			`--target=${resourceTarget}`,
		],
		{ cwd },
	);

	spinner.succeed("Resources compiled");
	return resourceTarget;
}

async function compileSchemas(cwd: string, jsDir: string): Promise<void> {
	const spinner = logger.startSpinner("Compiling schemas...");

	// Check if glib-compile-schemas is installed
	if (!(await shell.commandExists("glib-compile-schemas"))) {
		spinner.fail("glib-compile-schemas not installed. Cannot compile schemas.");
		throw new Error("glib-compile-schemas not found");
	}

	const schemasDir = path.join(cwd, jsDir, "schemas");
	await shell.execOrThrow("glib-compile-schemas", [schemasDir], { cwd });

	spinner.succeed("Schemas compiled");
}

async function createZipPackage(
	cwd: string,
	buildDir: string,
	jsDir: string,
	uuid: string,
	version: string,
	resourceTarget: string | null,
): Promise<void> {
	const spinner = logger.startSpinner("Creating extension package...");

	await fs.ensureDir(buildDir);

	const zipPath = path.join(
		buildDir,
		`${uuid}.shell-extension-v${version}.zip`,
	);
	const jsDirPath = path.join(cwd, jsDir);

	// Remove existing zip
	if (await project.fileExists(zipPath)) {
		await fs.remove(zipPath);
	}

	// Copy resource to jsDir if it exists
	if (resourceTarget) {
		await fs.copy(resourceTarget, path.join(jsDirPath, `${uuid}.gresource`));
	}

	// Copy metadata.json and LICENSE to jsDir
	await fs.copy(
		path.join(cwd, "metadata.json"),
		path.join(jsDirPath, "metadata.json"),
	);

	const licensePath = path.join(cwd, "LICENSE");
	if (await project.fileExists(licensePath)) {
		await fs.copy(licensePath, path.join(jsDirPath, "LICENSE"));
	}

	// Create zip using the zip command
	await shell.execOrThrow("zip", ["-qr", `../${path.basename(zipPath)}`, "."], {
		cwd: jsDirPath,
	});

	// Clean up temporary files
	if (resourceTarget) {
		await fs.remove(path.join(jsDirPath, `${uuid}.gresource`));
	}
	await fs.remove(path.join(jsDirPath, "metadata.json"));

	const licenseInJs = path.join(jsDirPath, "LICENSE");
	if (await project.fileExists(licenseInJs)) {
		await fs.remove(licenseInJs);
	}

	spinner.succeed("Extension package created");
}
