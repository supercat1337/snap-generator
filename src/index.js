#!/usr/bin/env node

//@ts-check
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { loadConfig } from './config.js';
import { createSnapshot } from './snapshot.js';

/**
 * Entry point for the snap-generator utility.
 */
async function main() {
    /** @type {import('node:util').ParseArgsConfig['options']} */
    const argOptions = {
        name: { type: 'string', short: 'n' },
        config: { type: 'string', short: 'c' },
        path: { type: 'string', short: 'p' },
        out: { type: 'string', short: 'o' },
        exclude: { type: 'string', short: 'e', multiple: true },
        quiet: { type: 'boolean', short: 'q', default: false },
        sign: { type: 'boolean', short: 's', default: false }, // Content hash
        checksum: { type: 'boolean', short: 'k', default: false }, // File checksum
        help: { type: 'boolean', short: 'h', default: false },
    };

    try {
        const { values } = parseArgs({ options: argOptions, strict: false });

        if (values.help) {
            console.log(`
snap-generator v1.0.0
Usage: snap-gen [options]

Options:
  -c, --config <file>   Path to JSON configuration file
  -n, --name <name>     Name of the snapshot
  -p, --path <dir>      Directory to scan (overrides config)
  -o, --out <file>      Output SQLite DB path (overrides config)
  -e, --exclude <path>  Paths to exclude (can be multiple)
  -q, --quiet           Disable progress output
  -s, --sign            Create .sig (logical hash of data)
  -k, --checksum        Create .sha256 (binary hash of the DB file)
  -h, --help            Show this help info

Environment Variables:
  SNAP_PATH             Default directory to scan
  SNAP_OUT              Default output database path
            `);
            return;
        }

        // 1. Load from file if provided
        const fileConfig = typeof values.config === 'string' ? loadConfig(values.config || '') : {};

        // 2. Resolve final configuration (Priority: CLI > Config File > Env > Default)
        const config = {
            targetDir: resolve(
                /** @type {string} */ (
                    values.path || fileConfig.path || process.env.SNAP_PATH || '.'
                )
            ),
            dbPath: resolve(
                /** @type {string} */ (
                    values.out ||
                        fileConfig.out ||
                        process.env.SNAP_OUT ||
                        `./snapshot-${Date.now()}.db`
                )
            ),
            // Merge excludes from CLI and Config
            excludePaths: [
                ...(Array.isArray(values.exclude) ? values.exclude : []),
                ...(Array.isArray(fileConfig.exclude) ? fileConfig.exclude : []),
            ],
            writeToStdout: !(values.quiet || fileConfig.quiet || false),
            generateSignFile: values.sign || fileConfig.sign || false, // mapped from 'sign'
            generateChecksum: values.checksum || fileConfig.checksum || false, // mapped from 'checksum'
            name: values.name || fileConfig.name || "",
        };

        // 3. Execution

        if (config.writeToStdout) {
            console.log(`[*] Initializing Snapshot...`);
        }

        await createSnapshot(config.targetDir, config.dbPath, {
            excludePaths: config.excludePaths,
            writeToStdout: config.writeToStdout,
            generateSignFile: config.generateSignFile,
            generateChecksum: config.generateChecksum,
            snapshotName: config.name,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`\n[FATAL ERROR] ${message}`);
        process.exit(1);
    }
}

// Execute the app
main().catch(err => {
    console.error('Unhandled Rejection:', err);
    process.exit(1);
});
