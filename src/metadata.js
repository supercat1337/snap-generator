// @ts-check

import { lstat, readlink } from 'node:fs/promises';
import { relative } from 'node:path';

/**
 * Retrieves metadata for a file system entry.
 * @param {string} filePath - The path to the file system entry.
 * @param {string} rootPath - The root path of the file system.
 * @param {(filePath: string)=>Promise<string|null>} calculateFileHash - A function to compute the hash of a file.
 * @returns {Promise<{type: string, path: string, size: number|null, mtime: number, ctime: number, btime: number, mode: number, uid: number, gid: number, ino: number, nlink: number, hash: string|null, target: string|null}|null>} - Metadata object or null for unsupported types.
 */
export async function getEntryData(filePath, rootPath, calculateFileHash) {
    const stats = await lstat(filePath);
    let relPath = relative(rootPath, filePath) || '.';

    //Normalize separators to '/' (Forward Slash)
    relPath = relPath.replace(/\\+/g, '/');

    const meta = {
        path: relPath,
        size: stats.size,
        mtime: Math.floor(stats.mtimeMs), // Changes to content
        ctime: Math.floor(stats.ctimeMs), // Changes to rights/ownership
        btime: Math.floor(stats.birthtimeMs || 0), // btime may not be supported on all platforms
        mode: stats.mode & 0o777,
        uid: stats.uid, // User ID
        gid: stats.gid, // Group ID
        ino: stats.ino,
        nlink: stats.nlink, // Track hard link count
        hash: null,
        target: null,
    };

    if (stats.isDirectory()) {
        return { ...meta, type: 'dir', size: null };
    }

    if (stats.isSymbolicLink()) {
        let target = await readlink(filePath);
        target = target.replace(/\\+/g, '/');
        return { ...meta, type: 'link', target };
    }

    if (stats.isFile()) {
        const hash = await calculateFileHash(filePath);
        return { ...meta, type: 'file', hash };
    }

    return null; // Ignoring unsupported types
}
