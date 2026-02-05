# snap-generator 🛡️

A lightweight, high-performance CLI utility for creating forensic-grade file system snapshots. Designed for **File Integrity Monitoring (FIM)**, security auditing, and deep data analysis.

`snap-generator` crawls your directories and captures essential metadata into an indexed **SQLite** database, enabling precise detection of changes across your file system.

## 🚀 Key Features

- **Forensic Metadata:** Captures `mtime`, `ctime`, `btime` (birth time where available), `mode` (permissions), `uid/gid`, `inode`, `size`, and `nlink` (link count).
- **High Performance:** Powered by [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) with batched transactional writes and `WAL` mode for efficient handling of millions of files.
- **Memory Efficient:** Uses Node.js streams and asynchronous generators to process large directory trees with minimal RAM footprint.
- **Cross-Platform Ready:** Standardizes path separators (`/`) and records `time_zone` and `os_platform` for reliable auditing across Linux, macOS, and Windows.
- **Flexible Configuration:** Supports layered configuration via JSON files, CLI arguments, and environment variables.

## 📦 Installation

```bash
# Clone the repository
git clone https://github.com/supercat1337/snap-generator.git
cd snap-generator

# Install dependencies
npm install

# Build the project (if it's a TypeScript project, check for build scripts)
# npm run build

# Link for global CLI usage (optional)
npm link
```

After linking, the `snap-gen` command will be available globally.

## 🛠 Usage

### Basic Snapshot

Scan a directory and save the snapshot to the default database file (`snap.db`):

```bash
snap-gen -p ./my-data
```

### Advanced Auditing

Specify an output file and exclude directories using **Globstar** patterns (e.g., `node_modules`, logs, or specific extensions anywhere in the tree):

```bash
# Exclude specific folders and all .log files in any subdirectory
snap-gen -p /var/www/html -o ./prod.db -e "**/node_modules/**" -e "**/*.log" -e "./temp/*"
```

### Using a Configuration File

Define complex scan parameters and patterns in a JSON configuration file:

```bash
snap-gen --config ./audit-config.json
```

Example `audit-config.json`:

```json
{
    "path": "/usr/local/bin",
    "out": "./snapshots/bin_audit.db",
    "exclude": ["**/cache/**", "**/*.tmp", "**/logs/*.log", ".git/**"],
    "quiet": true
}
```

### Using Environment Variables

Set defaults via environment variables:

```bash
export SNAP_PATH="/var/log"
export SNAP_OUT="/backups/log_snapshot.db"
snap-gen  # Will use the environment variables above
```

## 📂 Snapshot Database Schema

The tool creates a portable SQLite database (`*.db` file) with two main tables:

1.  **`snapshot_info`**: Metadata about the scan operation.
    - `version`, `root_path`
    - `scan_start`, `scan_end` (Unix timestamps)
    - `os_platform`, `time_zone`
    - Statistics: `total_entries`, `total_files`, `total_dirs`, `total_links`, `total_size`, `total_errors`

2.  **`entries`**: A detailed record for every entry.
    - `path` (PRIMARY KEY, standardized to `/`)
    - `type` (`file`, `dir`, `link`)
    - `size`, `hash` (SHA-256 for files), `target` (for symlinks)
    - Metadata: `mode`, `uid`, `gid`, `ino`, `nlink`
    - Timestamps: `mtime`, `ctime`, `btime`

## ⚙️ Configuration Hierarchy

Settings are resolved in order of highest priority (1) to lowest (4):

1.  **CLI Arguments** (e.g., `--path /now --out ./now.db`)
2.  **Config File** (values from the file specified via `--config`)
3.  **Environment Variables** (`SNAP_PATH`, `SNAP_OUT`)
4.  **Defaults** (path: current directory `.`, out: `./snap.db`)

The `--exclude` flag can be specified multiple times on the CLI. Exclusions from a config file and CLI are combined.

## 🛡 Security & Operational Notes

- **Permissions:** On Linux/macOS, run with `sudo` if you need to capture metadata for files/directories owned by other users or elevated system paths.
- **Safe Scanning:** Always exclude virtual filesystems like `/proc`, `/sys`, `/dev`, and runtime directories (e.g., `/run`) when scanning the root `/` to avoid hangs or infinite loops.
- **Output Location:** Write the snapshot database to a different location than the one being scanned to avoid including it in its own snapshot.
- **File Handle Limits:** When scanning very large filesystems (millions of entries), ensure your system's file descriptor limits are sufficiently high.

## 📄 License

MIT © supercat1337
