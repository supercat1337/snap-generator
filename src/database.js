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
    snapshot_name TEXT,
    version TEXT,
    root_path TEXT,
    scan_start INTEGER,
    scan_end INTEGER,
    scan_duration INTEGER,
    total_entries INTEGER,
    total_files INTEGER,
    total_dirs INTEGER,
    total_links INTEGER,
    total_size INTEGER,
    total_errors INTEGER, 
    os_platform TEXT,
    time_zone TEXT,
    snapshot_hash TEXT,
    exclude_paths TEXT
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

    db.exec(`
CREATE TABLE IF NOT EXISTS users (
    uid INTEGER PRIMARY KEY,
    username TEXT,
    gid INTEGER,
    gecos TEXT,
    homedir TEXT,
    shell TEXT
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS groups (
    gid INTEGER PRIMARY KEY,
    groupname TEXT,
    members TEXT -- Store as comma-separated string or JSON
) WITHOUT ROWID;
`);

    return db;
}

import { createHash } from 'node:crypto';

/**
 * Calculates a deterministic hash of the entire snapshot.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {string} The final SHA256 hex hash.
 */
export function calculateSnapshotContentHash(db) {
    const snapshotHasher = createHash('sha256');

    const entriesStmt = db.prepare('SELECT * FROM entries ORDER BY path ASC');
    for (const row of entriesStmt.iterate()) {
        snapshotHasher.update(JSON.stringify(row));
    }

    const usersStmt = db.prepare('SELECT * FROM users ORDER BY uid ASC');
    for (const row of usersStmt.iterate()) {
        snapshotHasher.update(JSON.stringify(row));
    }

    const groupsStmt = db.prepare('SELECT * FROM groups ORDER BY gid ASC');
    for (const row of groupsStmt.iterate()) {
        snapshotHasher.update(JSON.stringify(row));
    }
    return snapshotHasher.digest('hex');
}
