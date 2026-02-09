//@ts-check
import { writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { initDb, calculateSnapshotContentHash } from './database.js';
import { walk, compileExclusions } from './walker.js';
import { getEntryData } from './metadata.js';
import { calculateFileHash } from './hash.js';
import { UserGroupInfo } from './user-group-info.js';

/**
 * Creates a forensic file system snapshot in a SQLite database.
 *
 * @param {string} targetDir - The root directory to scan.
 * @param {string} dbPath - Destination path for the .db file.
 * @param {Object} [options] - Configuration options.
 * @param {string[]} [options.excludePaths] - Paths to exclude from the scan.
 * @param {boolean} [options.writeToStdout] - Whether to print progress and errors to the console.
 * @param {boolean} [options.generateSignFile] - Logical Sign: Create .sig file (hash of data inside DB)
 * @param {boolean} [options.generateChecksum] - Binary Checksum: Create .sha256 file (hash of the DB file itself).
 * @returns {Promise<void>}
 */
export async function createSnapshot(
    targetDir,
    dbPath,
    {
        excludePaths = [],
        writeToStdout = true,
        generateSignFile = false,
        generateChecksum = false,
    } = {}
) {
    const absTargetDir = resolve(targetDir).replace(/\\+/g, '/');
    const db = initDb(dbPath);

    const ugInfo = new UserGroupInfo(writeToStdout);
    const foundUids = new Set();
    const foundGids = new Set();

    // Pre-compile Globstar patterns for O(n) performance
    const excludeMatchers = compileExclusions(excludePaths);

    const insertEntry = db.prepare(`
        INSERT INTO entries (path, type, size, mtime, ctime, btime, mode, uid, gid, ino, nlink, hash, target)
        VALUES (@path, @type, @size, @mtime, @ctime, @btime, @mode, @uid, @gid, @ino, @nlink, @hash, @target)
    `);

    const scanStart = Date.now();
    let count = 0;
    let errorCount = 0;
    let stats = { files: 0, dirs: 0, links: 0, totalSize: 0 };
    let isSuccess = true;

    // Progress is shown only if terminal is interactive
    const canShowProgress = writeToStdout && process.stdout.isTTY;

    const transaction = db.transaction(items => {
        for (const item of items) insertEntry.run(item);
    });

    let buffer = [];
    /** @type {string|null} */
    let sign = null;

    /** @type {number} */
    let scanDuration = 0;

    try {
        for await (let filePath of walk(absTargetDir, absTargetDir, excludeMatchers)) {
            try {
                // Skip the root directory itself
                if (resolve(filePath) === absTargetDir) continue;

                const data = await getEntryData(filePath, absTargetDir, calculateFileHash);

                if (data) {
                    if (data.path === '..' || data.path === '.') continue;

                    foundUids.add(data.uid);
                    foundGids.add(data.gid);
                    count++;
                    // Update live statistics
                    if (data.type === 'file') {
                        stats.files++;
                        stats.totalSize += data.size || 0;
                    } else if (data.type === 'dir') {
                        stats.dirs++;
                    } else if (data.type === 'link') {
                        stats.links++;
                    }

                    buffer.push(data);
                }

                // Batch write to SQLite for high IOPS
                if (buffer.length >= 200) {
                    transaction(buffer);
                    buffer = [];
                    if (canShowProgress) {
                        const mb = (stats.totalSize / 1024 / 1024).toFixed(2);
                        process.stdout.write(
                            `\r[Scanning] Found: ${count} | Errors: ${errorCount} | Size: ${mb} MB`
                        );
                    }
                }
            } catch (e) {
                errorCount++;
                if (writeToStdout) {
                    const errMsg = e instanceof Error ? e.message : String(e);
                    // Clear the current line before printing the error
                    if (process.stdout.isTTY) process.stdout.write('\r\x1b[K');
                    console.error(`[Error] ${filePath}: ${errMsg}`);
                }
            }
        }

        // Finalize remaining entries
        if (buffer.length > 0) transaction(buffer);

        sign = calculateSnapshotContentHash(db);

        const insertUser = db.prepare(`
        INSERT INTO users (uid, username, gid, gecos, homedir, shell)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

        const insertGroup = db.prepare(`
        INSERT INTO groups (gid, groupname, members)
        VALUES (?, ?, ?)
    `);

        db.transaction(() => {
            // Store all found users and groups
            for (const uid of foundUids) {
                const user = ugInfo.getUserByUid(uid);
                if (user) {
                    insertUser.run(
                        user.uid,
                        user.username,
                        user.gid,
                        user.gecos,
                        user.homedir,
                        user.shell
                    );
                } else {
                    // If UID not found in /etc/passwd
                    insertUser.run(uid, `unknown_u${uid}`, null, 'Unknown user', null, null);
                }
            }

            // Store all found groups
            for (const gid of foundGids) {
                const group = ugInfo.getGroupByGid(gid);
                if (group) {
                    insertGroup.run(group.gid, group.groupname, group.members.join(','));
                } else {
                    // If GID not found in /etc/group
                    insertGroup.run(gid, `unknown_g${gid}`, null);
                }
            }
        })();

        const scanEnd = Date.now();
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

        scanDuration = scanEnd - scanStart;

        // Persist Snapshot Metadata
        db.prepare(
            `
            INSERT INTO snapshot_info (
                version, root_path, scan_start, scan_end, scan_duration,
                total_entries, total_files, total_dirs, total_links, total_size, total_errors,
                os_platform, time_zone, snapshot_hash, exclude_paths
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
        ).run(
            '1.0.0',
            absTargetDir,
            scanStart,
            scanEnd,
            scanDuration,
            count,
            stats.files,
            stats.dirs,
            stats.links,
            stats.totalSize,
            errorCount,
            process.platform,
            tz,
            sign,
            JSON.stringify(excludePaths)
        );
    } catch (err) {
        isSuccess = false;
        const message = err instanceof Error ? err.message : String(err);
        console.error(`\n[Critical Error] Snapshot failed: ${message}`);
    } finally {
        // Ensure WAL is checkpointed and files are closed
        db.close();
    }

    if (!isSuccess) {
        return;
    }

    if (writeToStdout) {
        process.stdout.write(
            `\r✅ Snapshot finished.                                                \n`
        );
        console.log(`- Snapshot saved to: ${dbPath.replace(/\\/g, '/')}`);
        console.log(`- Duration:  ${(scanDuration / 1000).toFixed(2)}s`);
        console.log(
            `- Entries:   ${count} (Files: ${stats.files}, Dirs: ${stats.dirs}, Links: ${stats.links})`
        );
        console.log(`- Data Size: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`);
        if (errorCount > 0) {
            console.log(`- Errors:    ${errorCount} (Check logs above)`);
        }
    }

    if (generateSignFile) {
        if (writeToStdout) {
            process.stdout.write(`[*] Generating snapshot signature... `);
        }

        try {
            const hashFilePath = `${dbPath}.sig`;
            const content = [
                `# Forensic Content Hash (SHA256)`,
                `# This hash represents the data inside the database, not the file itself.`,
                `# Calculated over 'entries' table sorted by path.`,
                `${sign}`,
            ].join('\n');

            writeFileSync(hashFilePath, content);

            if (writeToStdout) {
                process.stdout.write(`Done.\n`);
                console.log(`- Signature: ${sign}`);
                console.log(`- Signature file created: ${hashFilePath.replace(/\\/g, '/')}`);
            }
        } catch (e) {
            if (writeToStdout) {
                const msg = e instanceof Error ? e.message : String(e);
                console.error(`[Warning] Failed to generate DB signature: ${msg}`);
            }
        }
    }

    if (generateChecksum) {
        if (writeToStdout) {
            process.stdout.write(`[*] Generating database file checksum... `);
        }
        try {
            const fileHash = await calculateFileHash(dbPath);
            const checksumPath = `${dbPath}.sha256`;
            const fileName = basename(dbPath);

            writeFileSync(checksumPath, `${fileHash}  ${fileName}\n`);

            if (writeToStdout) {
                process.stdout.write(`Done.\n`);
                console.log(`- File Checksum: ${fileHash}`);
                console.log(`- Checksum file created: ${checksumPath.replace(/\\/g, '/')}`);
            }
        } catch (err) {
            if (writeToStdout) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error(`[Warning] Failed to generate DB file checksum: ${msg}`);
            }
        }
    }
}

/*
// example usage:

const toIgnore = [
    './node_modules',
    './.git',
    './dist',
    '/var/log/temp'
];

await createSnapshot('./my-project', 'snap.db', {
    excludePaths: toIgnore
});

*/
