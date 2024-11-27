/**
 * Provides a wrapper around the Chrome extension storage API, allowing you to store and retrieve data with a namespace.
 */
export class ChromeExtensionStorage {
    /**
     * Creates a new ChromeExtensionStorage instance with the specified namespace.
     * @param {string} namespace - The namespace to use for storing and retrieving data.
     */
    constructor(namespace) {
        this.namespace = namespace;
    }

    /**
     * Retrieves the value stored in the Chrome extension storage for the specified key.
     * @param {string} key - The key to retrieve the value for.
     * @returns {Promise<any>} - The value stored in the Chrome extension storage for the specified key.
     */
    async getValue(key) {
        const result = await chrome.storage.local.get(`${this.namespace}(${key})`);
        return result[`${this.namespace}(${key})`];
    }

    /**
     * Stores the specified value in the Chrome extension storage for the specified key.
     * @param {string} key - The key to store the value for.
     * @param {any} value - The value to store in the Chrome extension storage.
     * @returns {Promise<void>}
     */
    async setValue(key, value) {
        await chrome.storage.local.set({
            [`${this.namespace}(${key})`]: value,
        });
    }

    /**
     * Removes the value stored in the Chrome extension storage for the specified key.
     * @param {string} key - The key to remove the value for.
     * @returns {Promise<void>}
     */
    async removeValue(key) {
        await chrome.storage.local.remove(`${this.namespace}(${key})`);
    }
}
