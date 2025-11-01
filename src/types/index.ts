export interface ExtensionMetadata {
	uuid: string;
	name: string;
	description: string;
	version?: number;
	"version-name"?: string;
	"shell-version"?: string[];
	url?: string;
}

export interface PackageJson {
	name: string;
	version: string;
	description?: string;
	[key: string]: unknown;
}

export interface BuildOptions {
	install?: boolean;
	unsafeReload?: boolean;
	useEsbuild?: boolean;
}

export interface PublishOptions {
	username?: string;
	password?: string;
}

export interface LogsOptions {
	filtered?: boolean;
}

export interface CompileResult {
	success: boolean;
	message?: string;
}
