import { ChromeExtensionOAuthClient } from '../oauth/chrome-extension-oauth-client';

export class BskyAuth {
    constructor(config) {
        this.validateConfig(config);
        this.config = config;
        this.oauthClient = this.initializeOAuthClient(config);
    }

    validateConfig(config) {
        const requiredFields = ['serverUrl', 'redirectUri', 'clientId', 'handleResolver'];
        const missingFields = requiredFields.filter((field) => !config[field]);

        if (missingFields.length > 0) {
            throw new Error(`Missing required configuration: ${missingFields.join(', ')}`);
        }
    }

    initializeOAuthClient(config) {
        return new ChromeExtensionOAuthClient({
            clientId: config.clientId,
            handleResolver: config.handleResolver,
            clientMetadata: {
                client_id: config.clientId,
                client_name: 'OAuth Example',
                client_uri: config.serverUrl,
                redirect_uris: [config.redirectUri],
                grant_types: ['authorization_code', 'refresh_token'],
                response_types: ['code'],
                token_endpoint_auth_method: 'none',
                application_type: 'native',
                scope: 'atproto transition:generic',
                dpop_bound_access_tokens: true,
            },
        });
    }

    cleanup() {
        // Cleanup resources, clear tokens, etc.
        this.oauthClient = null;
    }

    async startOAuthFlow() {
        try {
            const authUrl = await this.oauthClient.authorize(this.config.handleResolver, {
                scope: 'atproto transition:generic',
                responseMode: 'fragment',
            });

            const authResult = await chrome.identity.launchWebAuthFlow({
                url: authUrl.toString(),
                interactive: true,
            });

            return await this.#handleOAuthCallback(authResult);
        } catch (error) {
            console.error('OAuth Error:', error);
            throw error;
        }
    }

    init() {
        return this.oauthClient.init();
    }

    async #handleOAuthCallback(redirectUrl) {
        if (!redirectUrl) {
            throw new Error('no redirect url present');
        }

        const hashParams = new URLSearchParams(new URL(redirectUrl).hash.substring(1));

        if (!hashParams) {
            throw new Error('invalid URL search params');
        }

        const { session, state } = await this.oauthClient.callback(hashParams);
        return { session, state };
    }
}
