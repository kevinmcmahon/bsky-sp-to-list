import { Agent } from '@atproto/api';
import { ChromeExtensionStorage } from '../utils/chrome-extension-storage';
import { BskyAuth } from './auth';
import { ListConverter } from './list-converter';

const NAMESPACE = `@@sp-to-list-chrome-extension`;

const serverUrl = process.env.SERVER_URL;
const redirectUri = process.env.REDIRECT_URI;
const clientId = process.env.CLIENT_ID;
const handleResolver = process.env.HANDLE_RESOLVER;

class MessageHandler {
    constructor() {
        this.auth = new BskyAuth({
            serverUrl,
            redirectUri,
            clientId,
            handleResolver,
        });

        this.storage = new ChromeExtensionStorage(NAMESPACE); // Initialize storage
    }

    createResponse = (success, data = null, error = null) => ({
        success,
        data,
        error,
    });

    fetchProfile = async (forceRefresh = false) => {
        // Try to get the profile from storage
        let profile = await this.storage.getValue('profile');

        if (!profile || forceRefresh) {
            const result = await this.auth.init();

            if (result?.session) {
                const agent = new Agent(result.session);
                const profileResponse = await agent.getProfile({ actor: agent.assertDid });
                profile = profileResponse.data;
                // Store the fetched profile in storage
                await this.storage.setValue('profile', profile);
            } else {
                profile = null;
            }
        }

        return profile;
    };

    clearProfile = async () => {
        await this.storage.removeValue('profile');
    };

    isStarterPackUrl = (url) => {
        const urlObj = new URL(url);
        return (
            urlObj.hostname === 'bsky.app' &&
            (urlObj.pathname.startsWith('/starter-pack/') ||
                urlObj.pathname.startsWith('/starter-pack-short/') ||
                urlObj.pathname.startsWith('/start/'))
        );
    };

    handleSessionStatus = async () => {
        try {
            const profile = await this.fetchProfile();
            return this.createResponse(true, { profile });
        } catch (error) {
            return this.createResponse(false, null, error.message);
        }
    };

    handleCreateList = async (sender) => {
        if (!this.isStarterPackUrl(sender?.tab?.url)) {
            return this.createResponse(false, null, 'Invalid URL');
        }
        try {
            const { session } = await this.auth.init();
            const agent = new Agent(session);
            const listConverter = new ListConverter(agent);
            const url = new URL(sender?.tab?.url);

            const list = await listConverter.createListFromStarterPack(url);
            return this.createResponse(true, { list });
        } catch (error) {
            return this.createResponse(false, null, error.message);
        }
    };

    handleLogout = async () => {
        const result = await this.auth.init();
        if (result?.session) {
            await result.session.signOut();
        }
        await this.clearProfile();
        return this.createResponse(true);
    };

    handleAuthenticate = async () => {
        try {
            const result = await this.auth.startOAuthFlow();
            if (result?.session) {
                const profile = await this.fetchProfile(true);
                return this.createResponse(true, { profile });
            } else {
                return this.createResponse(
                    false,
                    null,
                    'OAuth flow did not return a valid session'
                );
            }
        } catch (error) {
            console.error('[Authenticate] error with startOAuthFlow', error);
            return this.createResponse(false, null, error.message);
        }
    };
}

class BackgroundService {
    constructor() {
        this.messageHandler = new MessageHandler();
    }

    init() {
        chrome.runtime.onMessage.addListener(this.handleMessage);
    }

    handleMessage = (message, sender, sendResponse) => {
        const handlers = {
            createList: () => this.messageHandler.handleCreateList(sender),
            authenticate: () => this.messageHandler.handleAuthenticate(),
            logout: () => this.messageHandler.handleLogout(),
            'get-session-status': () => this.messageHandler.handleSessionStatus(),
        };

        const handler = handlers[message.action];
        if (handler) {
            handler().then(sendResponse);
            return true;
        }
        return false;
    };
}

const backgroundService = new BackgroundService();
backgroundService.init();
