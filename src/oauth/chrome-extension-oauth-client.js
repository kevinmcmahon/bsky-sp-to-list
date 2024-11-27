import { OAuthClient } from '@atproto/oauth-client';
import { ChromeExtensionStorage } from '../utils/chrome-extension-storage';
import { ChromeExtensionOAuthDatabase } from './chrome-extension-oauth-database';
import { ChromeExtensionRuntimeImplementation } from './chrome-extension-runtime-implementation';

const NAMESPACE = `@@oauth-client-chrome-extension`;

/**
 * Extends the OAuthClient class to provide a Chrome extension-specific implementation.
 * This class handles the OAuth flow and caching for a Chrome extension application.
 */
export class ChromeExtensionOAuthClient extends OAuthClient {
    /**
     * Constructs a new instance of the ChromeExtensionOAuthClient class.
     * This class extends the OAuthClient class to provide a Chrome extension-specific implementation for handling the OAuth flow and caching.
     *
     * @param {Object} options - The options object for configuring the ChromeExtensionOAuthClient instance.
     * @param {string} [options.handleResolver='https://bsky.social'] - The handle resolver URL.
     * @param {Object} options.clientMetadata - The client metadata object.
     */
    constructor({ handleResolver = 'https://bsky.social', clientMetadata }) {
        const database = new ChromeExtensionOAuthDatabase();

        super({
            handleResolver,
            responseMode: 'fragment',
            clientMetadata,
            runtimeImplementation: new ChromeExtensionRuntimeImplementation(),
            stateStore: database.getStateStore(),
            sessionStore: database.getSessionStore(),
            dpopNonceCache: database.getDpopNonceCache(),
            didCache: database.getDidCache(),
            handleCache: database.getHandleCache(),
            authorizationServerMetadataCache: database.getAuthorizationServerMetadataCache(),
            protectedResourceMetadataCache: database.getProtectedResourceMetadataCache(),
            keyset: undefined,
        });

        this.database = database;
        this.storage = new ChromeExtensionStorage(NAMESPACE);
    }

    /**
     * Initializes the OAuth client by restoring a previous session from storage, if available.
     * If a previous session is found, it is restored and returned. Otherwise, the method returns an empty session object.
     *
     * @param {boolean} refresh - Whether to force a refresh of the session.
     * @returns {Promise<{ session: any }>} - A promise that resolves to an object containing the restored session, or an empty session object.
     */
    async init(refresh) {
        const sub = await this.storage.getValue('sub');
        if (sub) {
            try {
                const session = await this.restore(sub, refresh);
                return { session };
            } catch (err) {
                await this.storage.removeValue('sub');
                throw err;
            }
        }
    }

    /**
     * Handles the OAuth callback, restoring the session and storing the subject (sub) in the storage.
     *
     * @param {Object} params - The parameters received from the OAuth callback.
     * @returns {Promise<{ session: any }>} - A promise that resolves to an object containing the restored session.
     */
    async callback(params) {
        const result = await super.callback(params);
        await this.storage.setValue('sub', result.session.sub);
        return result;
    }

    /**
     * Restores a previous OAuth session from storage and updates the stored subject (sub) value.
     *
     * @param {string} sub - The subject (sub) value to use for restoring the session.
     * @param {boolean} refresh - Whether to force a refresh of the session.
     * @returns {Promise<any>} - A promise that resolves to the restored session object.
     */
    async restore(sub, refresh) {
        const session = await super.restore(sub, refresh);
        await this.storage.setValue('sub', session.sub);
        return session;
    }

    /**
     * Revokes the OAuth session for the given subject (sub) and removes the stored subject value from the extension's storage.
     *
     * @param {string} sub - The subject (sub) value to use for revoking the session.
     * @returns {Promise<any>} - A promise that resolves when the session has been revoked.
     */
    async revoke(sub) {
        await this.storage.removeValue('sub');
        return super.revoke(sub);
    }
}
