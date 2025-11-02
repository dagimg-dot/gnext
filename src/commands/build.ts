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
		// Read metadata and package.json once
		const [metadata, packageJson] = await Promise.all([
			project.readMetadata(cwd),
			project.readPackageJson(cwd),
		]);

		const uuid = metadata.uuid;
		const version = packageJson.version;
		const buildDir = path.join(cwd, "build");

		// Check file existence once for all needed directories/files
		const [usesTS, hasTranslations, hasResources, hasSchemas] =
			await Promise.all([
				project.usesTypeScript(cwd),
				project.hasTranslations(cwd),
				project.hasResources(cwd),
				project.hasSchemas(cwd),
			]);

		const jsDir = usesTS ? "dist" : "src";

		logger.info(`Building extension: ${metadata.name} (${uuid})`);
		logger.info(`Version: ${version}`);

		// Compile TypeScript if needed
		if (usesTS) {
			await compileTypeScript(cwd, jsDir, options);
		}

		// Compile translations if they exist
		if (hasTranslations) {
			await compileTranslations(cwd, jsDir, uuid);
		}

		// Compile resources if they exist
		let resourceTarget: string | null = null;
		if (hasResources) {
			resourceTarget = await compileResources(cwd, buildDir, uuid);
		}

		// Compile schemas if they exist
		if (hasSchemas) {
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

async function compileTypeScript(
	cwd: string,
	outDir: string,
	options: BuildOptions,
): Promise<void> {
	const spinner = logger.startSpinner("Compiling TypeScript files...");

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

	// Compile TypeScript - prefer tsc for GNOME extension store compatibility
	if (options.useEsbuild) {
		// Use esbuild for development/bundling (if explicitly requested)
		const esbuildScript = path.join(cwd, "scripts", "esbuild.js");
		if (await project.fileExists(esbuildScript)) {
			spinner.text = "Compiling with esbuild (bundled)...";
			await shell.execOrThrow("bun", ["./scripts/esbuild.js"], { cwd });
		} else {
			logger.warning(
				"esbuild requested but scripts/esbuild.js not found. Using tsc instead.",
			);
			spinner.text = "Compiling with tsc...";
			await runTscWithFallback(cwd);
		}
	} else {
		// Use tsc for GNOME extension compatibility (readable JS, 1:1 mapping)
		spinner.text = "Compiling with tsc (readable JS for GNOME)...";
		await runTscWithFallback(cwd);
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
	const relativeZipPath = path.relative(jsDirPath, zipPath);
	await shell.execOrThrow("zip", ["-qr", relativeZipPath, "."], {
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

/**
 * Run TypeScript compiler with fallback options
 */
async function runTscWithFallback(cwd: string): Promise<void> {
	// Try bunx first (most common for bun users)
	try {
		await shell.execOrThrow("bunx", ["tsc"], { cwd });
		return;
	} catch {}

	// Fallback to npx
	try {
		await shell.execOrThrow("npx", ["tsc"], { cwd });
		return;
	} catch {}

	throw new Error("Failed to run TypeScript compiler - tried bunx and npx");
}
