// @ts-check
import { minimatch } from 'minimatch';
import { readdir } from 'node:fs/promises';
import { join, resolve, sep, relative } from 'node:path';

/**
 * Pre-compiles glob patterns for maximum performance during the scan.
 * @param {string[]} patterns 
 * @returns {Array<(path: string) => boolean>}
 */
export function compileExclusions(patterns) {
    return patterns.map(p => {
        // Return a pre-compiled matcher
        const matcher = new minimatch.Minimatch(p, { 
            dot: true, 
            nocase: true, 
            nocomment: true 
        });
        return (relPath) => matcher.match(relPath);
    });
}

/**
 * Optimized exclusion checker
 * @param {string} fullPath - Absolute path
 * @param {string} rootPath - Scan root
 * @param {Array<Function>} matchers - Pre-compiled matchers
 */
export function shouldExclude(fullPath, rootPath, matchers) {
    if (matchers.length === 0) return false;

    let relPath = relative(rootPath, fullPath) || '.';
    if (sep === '\\') relPath = relPath.split('\\').join('/');

    // .some() stops at the first true result (Short-circuiting)
    return matchers.some(match => match(relPath));
}

/**
 * Recursive directory walker with Globstar exclusion support.
 * @param {string} dir - Current directory to scan.
 * @param {string} rootPath - The fixed root directory of the scan.
 * @param {Array<(path: string) => boolean>} matchers - Pre-compiled exclusion matchers.
 * @returns {AsyncGenerator<string>} Yields absolute paths of files and directories to be processed.
 */
export async function* walk(dir, rootPath, matchers) {
    const absDir = resolve(dir);

    // 1. Check if the current directory itself is excluded
    if (shouldExclude(absDir, rootPath, matchers)) return;

    // 2. Yield the directory so it gets recorded in the DB
    yield absDir;

    // 3. Read directory contents
    const entries = await readdir(absDir, { withFileTypes: true }).catch((err) => {
        // We don't throw here to allow the scan to continue despite local permission errors
        return []; 
    });

    for (const entry of entries) {
        const fullPath = join(absDir, entry.name);

        // 4. Check files/subdirs before diving deeper or processing
        if (shouldExclude(fullPath, rootPath, matchers)) continue;

        if (entry.isDirectory()) {
            // Recursive call for subdirectories
            yield* walk(fullPath, rootPath, matchers);
        } else {
            // Yield file or symlink path
            yield fullPath;
        }
    }
}