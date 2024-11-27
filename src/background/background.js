import { Agent } from '@atproto/api';
import { ChromeExtensionStorage } from '../utils/chrome-extension-storage';
import { BskyAuth } from './auth';

// Constants
const BLUESKY_API_BASE_URL = 'https://bsky.social/xrpc';
const PUBLIC_API_BASE_URL = 'https://public.api.bsky.app/xrpc';
const TIMEOUT_DURATION = 5000; // 5 seconds
const CONTENT_TYPE_JSON = 'application/json';
const NAMESPACE = `@@sp-to-list-chrome-extension`;

// Validate environment variables
if (!process.env.BLUESKY_APP_PASSWORD) {
    throw new Error('Environment variable BLUESKY_APP_PASSWORD is not set');
}

// Create an instance at the top level
const bskyAuth = new BskyAuth();
const storage = new ChromeExtensionStorage(NAMESPACE); // Initialize storage

// Utility function for fetch requests
const fetchWithTimeout = async (url, options = {}, timeout = TIMEOUT_DURATION) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    } catch (error) {
        clearTimeout(timeoutId);
        console.error('Fetch error:', error);
        throw error;
    }
};

const initiateAuth = async () => {
    return fetchWithTimeout(`${BLUESKY_API_BASE_URL}/com.atproto.server.createSession`, {
        method: 'POST',
        headers: {
            'Content-Type': CONTENT_TYPE_JSON,
        },
        body: JSON.stringify({
            identifier: 'kevmac.dev', // e.g. username.bsky.social
            password: process.env.BLUESKY_APP_PASSWORD, // Use an App Password from Bluesky settings
        }),
    });
};

const isStarterPackUrl = (url) => {
    const urlObj = new URL(url);
    return (
        urlObj.hostname === 'bsky.app' &&
        (urlObj.pathname.startsWith('/starter-pack/') ||
            urlObj.pathname.startsWith('/starter-pack-short/') ||
            urlObj.pathname.startsWith('/start/'))
    );
};

const fetchStarterPackRedirect = async (code) => {
    return fetchWithTimeout(`https://go.bsky.app/${code}`, {
        headers: { accept: CONTENT_TYPE_JSON },
    });
};

const getShortCode = (url) => {
    if (!url?.pathname) throw new Error('Invalid URL object');
    const segments = url.pathname.split('/').filter((segment) => segment !== '');
    if (segments.length < 2) throw new Error('Invalid URL path structure');
    return segments[1];
};

const getAtUri = (starterPackUrl) => {
    const url = new URL(starterPackUrl);
    const segments = url.pathname.split('/').filter((segment) => segment !== '');
    const handleOrDid = segments[1];
    const rkey = segments[2];

    return `at://${handleOrDid}/app.bsky.graph.list/${rkey}`;
};

const getStarterPack = async (atUri) => {
    const data = await fetchWithTimeout(
        `${PUBLIC_API_BASE_URL}/app.bsky.graph.getStarterPack?starterPack=${atUri}`,
        {
            method: 'GET',
            headers: {
                'Content-Type': CONTENT_TYPE_JSON,
            },
        }
    );
    return data.starterPack;
};

const getList = async (atUri) => {
    return fetchWithTimeout(`${PUBLIC_API_BASE_URL}/app.bsky.graph.getList?list=${atUri}`, {
        method: 'GET',
        headers: {
            'Content-Type': CONTENT_TYPE_JSON,
        },
    });
};

const createBskyList = async (auth, name, description) => {
    if (!auth) {
        throw new Error('Authentication failed - please log in to Bluesky');
    }
    const { accessJwt, did } = auth;

    return fetchWithTimeout(`${BLUESKY_API_BASE_URL}/com.atproto.repo.createRecord`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessJwt}`,
            'Content-Type': CONTENT_TYPE_JSON,
        },
        body: JSON.stringify({
            repo: did,
            collection: 'app.bsky.graph.list',
            record: {
                $type: 'app.bsky.graph.list',
                purpose: 'app.bsky.graph.defs#curatelist',
                name: `${name} - ${Math.random().toString(36).substring(7)}`,
                description,
                createdAt: new Date().toISOString(),
            },
        }),
    });
};

const addUsersToList = async (auth, listUri, users) => {
    const { accessJwt, did } = auth;
    const addUserPromises = users.map((user) => {
        return fetchWithTimeout(`${BLUESKY_API_BASE_URL}/com.atproto.repo.createRecord`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessJwt}`,
                'Content-Type': CONTENT_TYPE_JSON,
            },
            body: JSON.stringify({
                repo: did,
                collection: 'app.bsky.graph.listitem',
                record: {
                    $type: 'app.bsky.graph.listitem',
                    subject: user.subject.did,
                    list: listUri,
                    createdAt: new Date().toISOString(),
                },
            }),
        });
    });

    try {
        await Promise.all(addUserPromises);
    } catch (error) {
        console.error('Error adding users to list:', error);
        throw error;
    }
};

const sendSessionStatusResponse = (sendResponse, authenticated, profile = null, error = null) => {
    sendResponse({
        authenticated,
        profile,
        error,
        success: !error,
    });
};

const fetchProfile = async (forceRefresh = false) => {
    // Try to get the profile from storage
    let profile = await storage.getValue('profile');

    if (!profile || forceRefresh) {
        const result = await bskyAuth.init();

        if (result?.session) {
            const agent = new Agent(result.session);
            const profileResponse = await agent.getProfile({ actor: agent.assertDid });
            profile = profileResponse.data;
            // Store the fetched profile in storage
            await storage.setValue('profile', profile);
        } else {
            profile = null;
        }
    }

    return profile;
};

const clearProfile = async () => {
    await storage.removeValue('profile');
};

const sessionStatusHandler = async (sendResponse) => {
    try {
        console.log('[Profile] Looking up profile...');
        const profile = await fetchProfile();
        if (profile) {
            console.log('[Profile] Profile found:', profile);
            sendSessionStatusResponse(sendResponse, true, profile);
        } else {
            console.log('[Profile] No profile found');
            sendSessionStatusResponse(sendResponse, false);
        }
    } catch (error) {
        console.error('[Session] Error during initialization:', error);
        sendSessionStatusResponse(sendResponse, false, null, error.message);
    }
};

const createListHandler = async (sender) => {
    if (isStarterPackUrl(sender?.tab?.url)) {
        const url = new URL(sender?.tab?.url);

        let atUri;
        if (url.pathname.startsWith('/starter-pack-short/')) {
            const shortCode = getShortCode(url);
            const starterPackRedirect = await fetchStarterPackRedirect(shortCode);
            atUri = getAtUri(starterPackRedirect.url);
        } else {
            console.log('on a starter pack page!');
            atUri = getAtUri(url);
        }
        const starterPack = await getStarterPack(atUri);
        const { list, items } = await getList(starterPack.list.uri);

        const auth = await initiateAuth();

        const newList = await createBskyList(auth, list.name, list.description);
        console.log('new list:', newList);

        await addUsersToList(auth, newList.uri, items);
    }
};

const logoutHandler = async (sendResponse) => {
    const result = await bskyAuth.init();
    if (result?.session) {
        await result.session.signOut();
    }
    await clearProfile();
    sendSessionStatusResponse(sendResponse, false);
};

const authenticateHandler = async (sendResponse) => {
    try {
        const result = await bskyAuth.startOAuthFlow();
        if (result?.session) {
            const profile = await fetchProfile(true);
            sendSessionStatusResponse(sendResponse, true, profile);
        } else {
            sendSessionStatusResponse(
                sendResponse,
                false,
                null,
                'OAuth flow did not return a valid session'
            );
        }
    } catch (error) {
        console.error('[Authenticate] error with startOAuthFlow', error);
        sendSessionStatusResponse(sendResponse, false, null, error.message);
    }
};

const listener = (message, sender, sendResponse) => {
    try {
        if (message.action === 'createList') {
            console.log('[Create List] Creating list...');
            createListHandler(sender);
            return true;
        }

        if (message.action === 'authenticate') {
            console.log('[Authenticate] handling authenticate');
            authenticateHandler(sendResponse);
            return true;
        }

        if (message.action === 'logout') {
            console.log('[Logout] handling logout');
            logoutHandler(sendResponse);
            return true;
        }

        if (message.action === 'get-session-status') {
            console.log('[Session] getting session status');
            sessionStatusHandler(sendResponse);
            return true;
        }
        return false;
    } catch (error) {
        console.error('[Listener] Exception error:', error);
        sendSessionStatusResponse(sendResponse, false, null, error.message);
    }
};

chrome.runtime.onMessage.addListener(listener);
