import { WebcryptoKey } from '@atproto/jwk-webcrypto';

export class ChromeExtensionRuntimeImplementation {
    constructor() {
        this.locks = new Map();
    }

    /**
     * Generates a new WebcryptoKey instance using the provided algorithms.
     * @param {object[]} algs - An array of algorithm objects to use for key generation.
     * @returns {WebcryptoKey} - A new WebcryptoKey instance.
     */
    createKey(algs) {
        return WebcryptoKey.generate(algs);
    }

    /**
     * Generates a new array of random values of the specified length.
     * @param {number} length - The length of the random value array to generate.
     * @returns {Uint8Array} - A new array of random values.
     */
    getRandomValues(length) {
        return crypto.getRandomValues(new Uint8Array(length));
    }

    /**
     * Computes the digest of the provided bytes using the specified algorithm.
     * @param {Uint8Array} bytes - The bytes to compute the digest for.
     * @param {object} algorithm - The algorithm to use for the digest computation.
     * @returns {Uint8Array} - The computed digest.
     * @throws {TypeError} - If the provided algorithm is not supported.
     */
    async digest(bytes, algorithm) {
        if (algorithm.name.startsWith('sha')) {
            const subtleAlgo = `SHA-${algorithm.name.slice(3)}`;
            const buffer = await crypto.subtle.digest(subtleAlgo, bytes);
            return new Uint8Array(buffer);
        }
        throw new TypeError(`Unsupported algorithm: ${algorithm.name}`);
    }

    /**
     * Requests a lock for the given name and executes the provided function.
     * The lock ensures that only one operation is executed at a time for the given name.
     * @param {string} name - The name of the lock to request.
     * @param {function} fn - The function to execute while holding the lock.
     * @returns {Promise} - A promise that resolves when the function has completed.
     */
    async requestLock(name, fn) {
        const current = this.locks.get(name) || Promise.resolve();
        const next = current
            .then(fn)
            .catch(() => {})
            .finally(() => {
                if (this.locks.get(name) === next) this.locks.delete(name);
            });

        this.locks.set(name, next);
        return next;
    }
}
