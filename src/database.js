// @ts-check
import Database from 'better-sqlite3';

/**
 * Initializes the SQLite database with required tables and pragmas.
 * @param {string} dbPath 
 * @returns 
 */
export function initDb(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = OFF');

  db.exec(`
CREATE TABLE IF NOT EXISTS snapshot_info (
    version TEXT,
    root_path TEXT,
    scan_start INTEGER,
    scan_end INTEGER,
    total_entries INTEGER,
    total_files INTEGER,
    total_dirs INTEGER,
    total_links INTEGER,
    total_size INTEGER,
    total_errors INTEGER, 
    os_platform TEXT,
    time_zone TEXT,
    snapshot_hash TEXT
);

CREATE TABLE entries (
    path TEXT PRIMARY KEY, -- Relative path (e.g., "subdir/file.txt")
    type TEXT,             -- 'file', 'dir', 'link'
    size INTEGER,
    mtime INTEGER, 
    ctime INTEGER, 
    btime INTEGER,
    mode INTEGER,          -- Permissions (755, 644)
    uid INTEGER,           -- User ID
    gid INTEGER,           -- Group ID
    ino INTEGER,           -- Inode number
    nlink INTEGER,         -- Number of hard links
    hash TEXT,             -- SHA256 for files
    target TEXT            -- For symlinks
) WITHOUT ROWID; -- Optimization: stores data directly in the index
  `);

  return db;
}

import { createHash } from 'node:crypto';

/**
 * Calculates a deterministic hash of the entire snapshot.
 * Uses .iterate() to handle large datasets without high RAM usage.
 * 
 * @param {import('better-sqlite3').Database} db 
 * @returns {string} The final SHA256 hex hash.
 */
export function calculateSnapshotHash(db) {
    const snapshotHasher = createHash('sha256');

    // WITHOUT ROWID tables store data sorted by PRIMARY KEY, so we can iterate directly.
    // This ensures we get a consistent order regardless of the underlying storage or platform.
    const statement = db.prepare('SELECT * FROM entries ORDER BY path ASC');

    for (const row of statement.iterate()) {
        // Stringify each row to ensure consistent hashing. We can also choose to only hash certain fields if desired.
        // This will give us a consistent hash regardless of the underlying storage or platform.
        snapshotHasher.update(JSON.stringify(row));
    }

    return snapshotHasher.digest('hex');
}