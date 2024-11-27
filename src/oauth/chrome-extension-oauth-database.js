import { WebcryptoKey } from '@atproto/jwk-webcrypto';

const STORES = [
    'state',
    'session',
    'didCache',
    'dpopNonceCache',
    'handleCache',
    'authorizationServerMetadataCache',
    'protectedResourceMetadataCache',
];

/**
 * Custom error class for database-related errors.
 */
class DatabaseError extends Error {
    constructor(message) {
        super(message);
        this.name = 'DatabaseError';
    }
}

/**
 * Encodes a key object into a format suitable for storage in the database.
 * @param {Object} key - The key object to encode.
 * @param {string} key.kid - The key ID of the key.
 * @param {CryptoKeyPair} key.cryptoKeyPair - The crypto key pair of the key.
 * @returns {Object} - An encoded key object with the key ID and key pair.
 * @throws {DatabaseError} - If the input key object is invalid.
 */
function encodeKey(key) {
    if (!key.kid) {
        throw new DatabaseError('Invalid key object');
    }
    return {
        keyId: key.kid,
        keyPair: key.cryptoKeyPair,
    };
}

/**
 * Decodes an encoded key object from the database.
 * @param {Object} encoded - The encoded key object to decode.
 * @param {Object} encoded.keyPair - The encoded crypto key pair.
 * @param {string} encoded.keyId - The key ID of the encoded key.
 * @returns {Promise<WebcryptoKey>} - The decoded `WebcryptoKey` object.
 * @throws {DatabaseError} - If the encoded key data is invalid.
 */
async function decodeKey(encoded) {
    try {
        if (!encoded || !encoded.keyPair || !encoded.keyId) {
            throw new DatabaseError('Invalid encoded key data');
        }
        return await WebcryptoKey.fromKeypair(encoded.keyPair, encoded.keyId);
    } catch (error) {
        if (error instanceof DatabaseError) {
            throw error;
        }
        throw new DatabaseError(`Failed to decode key: ${error.message}`);
    }
}

/**
 * The `ChromeExtensionOAuthDatabase` class is responsible for managing an IndexedDB database for storing OAuth-related data in a Chrome extension. It provides methods for initializing the database, creating and managing various data stores, and performing cleanup tasks. The class is designed to handle the encoding and decoding of data, including the handling of DPoP keys, and provides a set of utility methods for interacting with the database.
 */
export class ChromeExtensionOAuthDatabase {
    /**
     * Constructs a new instance of the `ChromeExtensionOAuthDatabase` class.
     * @param {Object} [options] - The options for configuring the database.
     * @param {string} [options.name] - The name of the database, defaults to '@atproto-oauth-client'.
     * @param {string} [options.durability] - The durability setting for the database, defaults to 'strict'.
     * @param {number} [options.cleanupInterval] - The interval (in milliseconds) for cleaning up expired data, defaults to 30000 (30 seconds).
     */
    constructor(options = {}) {
        this.dbName = options.name ?? '@atproto-oauth-client';
        this.durability = options.durability ?? 'strict';
        this.cleanupInterval = options.cleanupInterval ?? 30000;
        this.db = null;

        this.#initDatabase().then((db) => {
            this.db = db;
        });
        this.startCleanupInterval();
    }

    async #initDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onerror = () => {
                reject(request.error);
            };

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                STORES.forEach((storeName) => {
                    const store = db.createObjectStore(storeName, { autoIncrement: true });
                    store.createIndex('expiresAt', 'expiresAt', { unique: false });
                });
            };
        });
    }

    startCleanupInterval() {
        this.cleanupIntervalId = setInterval(() => {
            this.cleanup();
        }, this.cleanupInterval);
    }

    /**
     * Runs a callback function within a transaction on the specified object store.
     * @param {string} storeName - The name of the object store to use.
     * @param {string} mode - The mode of the transaction, either 'readonly' or 'readwrite'.
     * @param {function(IDBObjectStore): IDBRequest|any} callback - The callback function to execute within the transaction. It should return either an IDBRequest or any other value.
     * @returns {Promise<any>} - A promise that resolves with the result of the callback function.
     */
    async run(storeName, mode, callback) {
        const db = this.db || (await this.#initDatabase());
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], mode);
            const store = transaction.objectStore(storeName);

            try {
                const request = callback(store);

                // Add this block to handle the IDBRequest
                if (request instanceof IDBRequest) {
                    request.onsuccess = () => {
                        resolve(request.result);
                    };
                    request.onerror = () => {
                        reject(request.error);
                    };
                    return;
                }

                // Handle non-IDBRequest results
                transaction.oncomplete = () => {
                    resolve(request);
                };
                transaction.onerror = () => {
                    console.error(transaction.error);
                    reject(transaction.error);
                };
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Creates a store with the specified name and options.
     * @param {string} name - The name of the store.
     * @param {object} options - The options for the store, including `encode`, `decode`, and `expiresAt` functions.
     * @returns {object} - An object with `get`, `set`, and `del` methods for interacting with the store.
     */
    createStore(name, { encode, decode, expiresAt }) {
        return {
            get: async (key) => {
                const item = await this.run(name, 'readonly', (store) => store.get(key));

                if (!item) {
                    return undefined;
                }

                if (item.expiresAt && new Date(item.expiresAt) < new Date()) {
                    await this.run(name, 'readwrite', (store) => store.delete(key));
                    return undefined;
                }

                return decode(item.value);
            },

            set: async (key, value) => {
                const item = {
                    value: await encode(value),
                    expiresAt: expiresAt(value)?.toISOString(),
                };

                await this.run(name, 'readwrite', (store) => store.put(item, key));
            },

            del: async (key) => {
                await this.run(name, 'readwrite', (store) => store.delete(key));
            },
        };
    }

    /**
     * Creates a session store with the specified options.
     * The session store is used to store and retrieve session-related data, such as token sets.
     * The `expiresAt` option determines when the stored data should expire, based on the `tokenSet` object.
     * The `encode` and `decode` options are used to handle encoding and decoding of the stored data, including the `dpopKey`.
     * @returns {object} - An object with `get`, `set`, and `del` methods for interacting with the session store.
     */
    getSessionStore() {
        return this.createStore('session', {
            expiresAt: ({ tokenSet }) =>
                tokenSet.refresh_token || !tokenSet.expires_at
                    ? null
                    : new Date(tokenSet.expires_at),
            encode: (data) => {
                if (!data) {
                    return null;
                }
                if (!data.dpopKey) {
                    return data;
                }
                const { dpopKey, ...rest } = data;
                return {
                    ...rest,
                    dpopKey: encodeKey(dpopKey),
                };
            },
            decode: async (encoded) => {
                if (!encoded) {
                    return null;
                }
                if (!encoded.dpopKey) {
                    return encoded;
                }
                const { dpopKey, ...rest } = encoded;
                return {
                    ...rest,
                    dpopKey: await decodeKey(dpopKey),
                };
            },
        });
    }

    /**
     * Creates a state store with the specified options.
     * The state store is used to store and retrieve state-related data, such as PKCE code verifiers.
     * The `expiresAt` option determines when the stored data should expire, based on a 10-minute duration.
     * The `encode` and `decode` options are used to handle encoding and decoding of the stored data, including the `dpopKey`.
     * @returns {object} - An object with `get`, `set`, and `del` methods for interacting with the state store.
     */
    getStateStore() {
        return this.createStore('state', {
            expiresAt: () => new Date(Date.now() + 600000), // 10 minutes
            encode: (data) => {
                if (!data) {
                    return null;
                }
                if (!data.dpopKey) {
                    return data;
                }
                const { dpopKey, ...rest } = data;
                return {
                    ...rest,
                    dpopKey: encodeKey(dpopKey),
                };
            },
            decode: async (encoded) => {
                if (!encoded) {
                    return null;
                }
                if (!encoded.dpopKey) {
                    return encoded;
                }
                const { dpopKey, ...rest } = encoded;
                return {
                    ...rest,
                    dpopKey: await decodeKey(dpopKey),
                };
            },
        });
    }

    /**
     * Creates a cache store for storing and retrieving DPoP nonces.
     * The cache store has a 10-minute expiration time for the stored data.
     * The `encode` and `decode` options are used to handle encoding and decoding of the stored data.
     * @returns {object} - An object with `get`, `set`, and `del` methods for interacting with the DPoP nonce cache store.
     */
    getDpopNonceCache() {
        return this.createStore('dpopNonceCache', {
            expiresAt: () => new Date(Date.now() + 600000),
            encode: (value) => value,
            decode: (encoded) => encoded,
        });
    }

    /**
     * Creates a cache store for storing and retrieving DID (Decentralized Identifier) data.
     * The cache store has a 1-minute expiration time for the stored data.
     * The `encode` and `decode` options are used to handle encoding and decoding of the stored data.
     * @returns {object} - An object with `get`, `set`, and `del` methods for interacting with the DID cache store.
     */
    getDidCache() {
        return this.createStore('didCache', {
            expiresAt: () => new Date(Date.now() + 60000),
            encode: (value) => value,
            decode: (encoded) => encoded,
        });
    }

    /**
     * Creates a cache store for storing and retrieving handle data.
     * The cache store has a 1-minute expiration time for the stored data.
     * The `encode` and `decode` options are used to handle encoding and decoding of the stored data.
     * @returns {object} - An object with `get`, `set`, and `del` methods for interacting with the handle cache store.
     */
    getHandleCache() {
        return this.createStore('handleCache', {
            expiresAt: () => new Date(Date.now() + 60000),
            encode: (value) => value,
            decode: (encoded) => encoded,
        });
    }

    /**
     * Creates a cache store for storing and retrieving authorization server metadata.
     * The cache store has a 1-minute expiration time for the stored data.
     * The `encode` and `decode` options are used to handle encoding and decoding of the stored data.
     * @returns {object} - An object with `get`, `set`, and `del` methods for interacting with the authorization server metadata cache store.
     */
    getAuthorizationServerMetadataCache() {
        return this.createStore('authorizationServerMetadataCache', {
            expiresAt: () => new Date(Date.now() + 60000),
            encode: (value) => value,
            decode: (encoded) => encoded,
        });
    }

    /**
     * Creates a cache store for storing and retrieving protected resource metadata.
     * The cache store has a 1-minute expiration time for the stored data.
     * The `encode` and `decode` options are used to handle encoding and decoding of the stored data.
     * @returns {object} - An object with `get`, `set`, and `del` methods for interacting with the protected resource metadata cache store.
     */
    getProtectedResourceMetadataCache() {
        return this.createStore('protectedResourceMetadataCache', {
            expiresAt: () => new Date(Date.now() + 60000),
            encode: (value) => value,
            decode: (encoded) => encoded,
        });
    }

    /**
     * Cleans up expired data from the various cache stores.
     * This method iterates through the `STORES` array and deletes any entries in each store
     * that have an `expiresAt` timestamp earlier than the current time.
     */
    async cleanup() {
        const now = new Date().toISOString();

        for (const storeName of STORES) {
            await this.run(storeName, 'readwrite', (store) => {
                const index = store.index('expiresAt');
                const range = IDBKeyRange.upperBound(now);
                index.openCursor(range).onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        cursor.delete();
                        cursor.continue();
                    }
                };
            });
        }
    }

    /**
     * Disposes of the database connection and cleans up any associated resources.
     * This method clears the cleanup interval, waits for the cleanup process to complete,
     * closes the database connection, and sets the `db` property to `null`.
     */
    async dispose() {
        clearInterval(this.cleanupIntervalId);
        this.cleanupIntervalId = undefined;
        await this.cleanup();
        const db = await this.#initDatabase();
        db.close();
        this.db = null;
    }
}
