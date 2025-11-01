# GN'EXT

An all-in-one CLI tool to create and develop GNOME Extensions with TypeScript support.

## Features

- Create a new GNOME Extension from a template
- Build extensions with TypeScript, translations, resources, and schemas
- Develop with nested GNOME Shell (hot reload support)
- Watch extension logs in real-time
- Package extensions for distribution
- Publish to extensions.gnome.org

## Installation

### Global Installation

```bash
bun install -g @dagimg-dot/gnext
```

### For Extension Development

```bash
# Install as a dev dependency in your extension project
bun add -D @dagimg-dot/gnext
```

## Usage

### Create a New Extension

```bash
bun create @dagimg-dot/gnext@latest my-extension
cd my-extension
bun install
```

### Build Extension

Build your extension (compiles TypeScript with readable JS, processes translations, resources, schemas, and creates a zip):

```bash
gnext build
```

Build and install:

```bash
gnext build --install
```

Build, install, and reload GNOME Shell (X11 only, requires unsafe mode):

```bash
gnext build --unsafe-reload
```

**Note:** By default, GN'EXT uses `tsc` (TypeScript compiler) for compilation, which produces readable JavaScript code that's preferred by the GNOME extension store reviewers. If you need esbuild for development bundling, use:

> Note: But make sure you have esbuild configuration in scripts/ folder in your extension directory

```bash
gnext build --use-esbuild
```

### Development Mode

Run extension in a nested GNOME Shell for testing:

```bash
gnext dev
```

### Watch Logs

Watch extension logs in real-time:

```bash
gnext logs
```

Watch with filtering (only show errors and stack traces):

```bash
gnext logs --filtered
```

### Publish Extension

Publish your extension to extensions.gnome.org:

```bash
gnext publish --username=youruser --password=yourpass
```

Or use environment variables:

```bash
export GNOME_USERNAME=youruser
export GNOME_PASSWORD=yourpass
gnext publish
```

### Bump Version

Bump your extension version:

```bash
gnext bump 1.2.0
```

Bump version and create a git release (commit, push, tag):

```bash
gnext bump 1.2.0 --release
```

### Setup VM Development

Setup a VM for development with automatic sshfs mounting:

```bash
gnext setup user@vm-ip
```

This will:
- Generate a dev script for the VM
- Copy it to the VM
- Install sshfs on the VM
- Setup mount points

Then on the VM, run the generated script to mount your project and start developing.

## Compilation

GN'EXT uses **TypeScript compiler (tsc)** by default for GNOME extension compatibility:

- ✅ **Readable JavaScript** - Extension reviewers can easily read/debug code
- ✅ **One-to-one mapping** - Each `.ts` file becomes a `.js` file
- ✅ **GNOME store friendly** - No bundling/minification that reviewers dislike
- ✅ **Source maps** - Better debugging experience

If you need esbuild for development bundling:
```bash
gnext build --use-esbuild  # Requires scripts/esbuild.js
```

## Requirements

### For Building Extensions

- **Bun** - For TypeScript compilation
- **zip** - For packaging
- **glib-compile-resources** - For compiling resources (if used)
- **glib-compile-schemas** - For compiling schemas (if used)
- **msgfmt** (gettext) - For compiling translations (if used)

### For Publishing

- **curl** - For API requests
- **jq** - For JSON parsing

### For GNOME Shell Operations

- **gnome-shell** - For running nested sessions
- **gnome-extensions** - For installing extensions

## Project Structure

A typical GNOME extension project structure:

```
my-extension/
├── src/                  # TypeScript source files
│   ├── extension.ts
│   └── prefs.ts
├── data/                 # Resources (optional)
├── po/                   # Translations (optional)
├── schemas/              # GSettings schemas (optional)
├── metadata.json         # Extension metadata
├── package.json          # Node package config
├── tsconfig.json         # TypeScript config
└── LICENSE
```

## Commands Reference

| Command | Description |
|---------|-------------|
| `gnext create <name>` | Create a new extension from template |
| `gnext build` | Build the extension (readable JS) |
| `gnext build -i` | Build and install |
| `gnext build -r` | Build, install, and reload (X11) |
| `gnext build --use-esbuild` | Build with esbuild (bundled) |
| `gnext dev` | Run nested GNOME Shell |
| `gnext logs` | Watch logs |
| `gnext logs -f` | Watch filtered logs |
| `gnext publish` | Publish to extensions.gnome.org |
| `gnext bump <version>` | Bump extension version |
| `gnext bump <version> -r` | Bump version and create git release |
| `gnext setup <vm-target>` | Setup VM development workflow |

## Development

### Building the CLI

```bash
bun install
bun run build
```

### Local Testing

```bash
bun link
# Now you can use 'gnext' command globally
```

## License

MIT