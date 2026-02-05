//@ts-check
import { createHash } from 'crypto';
import { createReadStream } from 'fs';

/**
 * Computes the SHA-256 hash of a file.
 * @param {string} filePath - The path to the file.
 * @returns {Promise<string>} - A promise that resolves to the hexadecimal hash string.
 */
export async function calculateFileHash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = createHash('sha256');
        const stream = createReadStream(filePath);
        stream.on('data', data => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}
