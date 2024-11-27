import { ChromeExtensionOAuthClient } from '../oauth/chrome-extension-oauth-client';

export class BskyAuth {
    constructor() {
        const serverUrl = process.env.SERVER_URL;
        const redirectUri = process.env.REDIRECT_URI;
        const clientId = process.env.CLIENT_ID;

        this.handleResolver = process.env.HANDLE_RESOLVER;

        this.oauthClient = new ChromeExtensionOAuthClient({
            clientId,
            handleResolver: this.handleResolver,
            clientMetadata: {
                client_id: clientId,
                client_name: 'OAuth Example',
                client_uri: serverUrl,
                redirect_uris: [redirectUri],
                grant_types: ['authorization_code', 'refresh_token'],
                response_types: ['code'],
                token_endpoint_auth_method: 'none',
                application_type: 'native',
                scope: 'atproto transition:generic',
                dpop_bound_access_tokens: true,
            },
        });
    }

    async handleOAuthCallback(redirectUrl) {
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

    async startOAuthFlow() {
        try {
            const authUrl = await this.oauthClient.authorize(this.handleResolver, {
                scope: 'atproto transition:generic',
                responseMode: 'fragment',
            });

            const authResult = await chrome.identity.launchWebAuthFlow({
                url: authUrl.toString(),
                interactive: true,
            });

            return await this.handleOAuthCallback(authResult);
        } catch (error) {
            console.error('OAuth Error:', error);
            throw error;
        }
    }

    init() {
        return this.oauthClient.init();
    }
}
