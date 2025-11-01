import path from "node:path";
import fs from "fs-extra";
import { logger } from "../utils/logger.js";
import { project } from "../utils/project.js";
import { shell } from "../utils/shell.js";

export async function setupCommand(vmTarget: string): Promise<void> {
	try {
		if (!vmTarget) {
			logger.error("VM target is required");
			logger.info("Usage: gnext setup user@vm-ip");
			process.exit(1);
		}

		const cwd = project.getCwd();
		const projectName = path.basename(cwd).toLowerCase();
		const projectAbsolutePath = path.resolve(cwd);

		logger.info(`Project: ${projectName}`);
		logger.info(`Path: ${projectAbsolutePath}`);
		logger.info(`VM Target: ${vmTarget}`);
		logger.log("");

		// Get machine IP
		const machineIp = await getMachineIp();
		const currentUser = await getCurrentUser();
		const hostSpec = `${currentUser}@${machineIp}:${projectAbsolutePath}`;

		logger.info(`Host specification: ${hostSpec}`);

		// Generate dev script
		const scriptsDir = path.join(cwd, "scripts");
		await fs.ensureDir(scriptsDir);

		const devScriptName = `dev-${projectName}.sh`;
		const devScriptPath = path.join(scriptsDir, devScriptName);

		logger.info(`Generating ${devScriptName}...`);

		const devScriptContent = `#!/bin/bash
set -euo pipefail

MOUNT_POINT="/mnt/host/${projectName}"
HOST_SPEC="${hostSpec}"

mkdir -p "$MOUNT_POINT"

if ! mountpoint -q "$MOUNT_POINT"; then
\tsshfs "$HOST_SPEC" "$MOUNT_POINT" -o follow_symlinks
fi

cd "$MOUNT_POINT" || { echo "Failed to change directory to $MOUNT_POINT"; exit 1; }

# Replace the current process with an interactive shell so the CWD persists
exec "\${SHELL:-/bin/bash}" -i
`;

		await fs.writeFile(devScriptPath, devScriptContent, { mode: 0o755 });
		logger.success(`Generated ${devScriptName}`);

		// Copy dev script to VM
		const spinner = logger.startSpinner(
			`Copying ${devScriptName} to ${vmTarget}:~/`,
		);
		const scpResult = await shell.exec("scp", [
			devScriptPath,
			`${vmTarget}:~/`,
		]);

		if (scpResult.exitCode !== 0) {
			spinner.fail(`Failed to copy script: ${scpResult.stderr}`);
			process.exit(1);
		}
		spinner.succeed("Script copied to VM");

		// Setup VM
		const setupSpinner = logger.startSpinner(
			"Setting up VM (installing sshfs, creating mountpoint)...",
		);

		const setupScript = `
set -e;
if ! command -v sshfs >/dev/null 2>&1; then
  if command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y fuse-sshfs >/dev/null;
  elif command -v apt >/dev/null 2>&1; then
    sudo apt update >/dev/null && sudo apt install -y sshfs >/dev/null;
  fi;
fi;
mkdir -p /mnt/host;
chmod +x ~/${devScriptName};
echo 'Setup complete on VM.'
`;

		const sshResult = await shell.exec("ssh", ["-t", vmTarget, setupScript]);

		if (sshResult.exitCode !== 0) {
			setupSpinner.fail(`Failed to setup VM: ${sshResult.stderr}`);
			process.exit(1);
		}

		setupSpinner.succeed("VM setup complete");

		logger.success("\nAll done!");
		logger.info(`On the VM, run: ~/${devScriptName}`);
		logger.log("");
		logger.info(
			"This will mount your project directory and start a shell in it.",
		);
		logger.info(
			"You can then use gnext commands (build, dev, logs) on the VM.",
		);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error(`Setup failed: ${message}`);
		process.exit(1);
	}
}

async function getCurrentUser(): Promise<string> {
	const result = await shell.execCommand("whoami");
	if (result.exitCode === 0 && result.stdout) {
		return result.stdout.trim();
	}
	return process.env.USER || "unknown";
}

async function getMachineIp(): Promise<string> {
	// Try to get the IP from the default route
	let result = await shell.execCommand(
		"ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \\K\\S+' | head -1",
	);

	if (result.exitCode === 0 && result.stdout.trim()) {
		return result.stdout.trim();
	}

	// Try to get IP from network interfaces
	result = await shell.execCommand(
		"ip addr show | grep -oP 'inet \\K192\\.168\\.\\d+\\.\\d+' | head -1",
	);

	if (result.exitCode === 0 && result.stdout.trim()) {
		return result.stdout.trim();
	}

	// Try hostname -I
	result = await shell.execCommand("hostname -I | awk '{print $1}'");

	if (result.exitCode === 0 && result.stdout.trim()) {
		return result.stdout.trim();
	}

	throw new Error("Could not detect machine IP address");
}
