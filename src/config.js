//@ts-check
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads configuration from a file and merges it with CLI args.
 * @param {string} configPath 
 */
export function loadConfig(configPath) {
    if (!configPath || !existsSync(configPath)) return {};

    try {
        const content = readFileSync(resolve(configPath), 'utf8');
        return JSON.parse(content);
    } catch (e) {
        let err = e instanceof Error ? e : new Error(String(e));
        console.error(`[Config Error] Failed to parse ${configPath}: ${err.message}`);
        return {};
    }
}

/*
// example snapshot.config.json
{
  "path": "/var/www/html",
  "out": "/backups/web_integrity.db",
  "exclude": ["./logs", "./cache", "./tmp"],
  "encryptionKey": "stored-in-secure-file-or-env",
  "quiet": true
}
*/

/*
{
  "exclude": [
    "** /node_modules/**", 
    "** /*.tmp", 
    "** /cache/*.dat",
    ".git/**"
  ]
}
*/