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
    time_zone TEXT
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