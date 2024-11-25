const initiateAuth = async () => {
    const response = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            identifier: 'kevmac.dev', // e.g. username.bsky.social
            password: process.env.BLUESKY_APP_PASSWORD, // Use an App Password from Bluesky settings
        }),
    });

    if (!response.ok) {
        throw new Error('Authentication failed');
    }

    return response.json();
};

/**
 * Checks if the given URL is for the Bluesky starter pack.
 *
 * @param {string} url - The URL to check.
 * @returns {boolean} - True if the URL is for the Bluesky starter pack, false otherwise.
 */
const isStarterPackUrl = (url) => {
    const urlObj = new URL(url);
    return (
        urlObj.hostname === 'bsky.app' &&
        (urlObj.pathname.startsWith('/starter-pack/') ||
            urlObj.pathname.startsWith('/starter-pack-short/') ||
            urlObj.pathname.startsWith('/start/'))
    );
};

/**
 * Fetches the redirect URL for the Bluesky starter pack based on the provided short code.
 *
 * @param {string} code - The short code to use for fetching the starter pack redirect.
 * @returns {Promise<{ url: string }>} - An object containing the redirect URL for the starter pack.
 * @throws {Error} - If there is an error fetching the starter pack redirect.
 */
const fetchStarterPackRedirect = async (code) => {
    try {
        const response = await fetch(`https://go.bsky.app/${code}`, {
            headers: { accept: 'application/json' },
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('Failed to fetch starter pack redirect:', error);
        throw error;
    }
};

/**
 * Extracts the short code from the provided URL.
 *
 * @param {string} url - The URL to extract the short code from.
 * @returns {string} - The short code extracted from the URL.
 * @throws {Error} - If the URL object is invalid or the URL path structure is invalid.
 */
const getShortCode = (url) => {
    if (!url?.pathname) throw new Error('Invalid URL object');
    const segments = url.pathname.split('/').filter((segment) => segment !== '');
    if (segments.length < 2) throw new Error('Invalid URL path structure');
    return segments[1];
};

/**
 * Generates the AT URI for a starter pack based on the provided starter pack URL.
 *
 * @param {string} starterPackUrl - The URL of the starter pack.
 * @returns {string} - The AT URI for the starter pack.
 */
const getAtUri = (starterPackUrl) => {
    const url = new URL(starterPackUrl);
    const segments = url.pathname.split('/').filter((segment) => segment !== '');
    const handleOrDid = segments[1];
    const rkey = segments[2];

    return `at://${handleOrDid}/app.bsky.graph.list/${rkey}`;
};

/**
 * Fetches the starter pack details for the given AT URI.
 *
 * @param {string} atUri - The AT URI of the starter pack to fetch.
 * @returns {Promise<{ starterPack: any }>} - An object containing the starter pack details.
 */
const getStarterPack = async (atUri) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(
        `https://public.api.bsky.app/xrpc/app.bsky.graph.getStarterPack?starterPack=${atUri}`,
        {
            signal: controller.signal,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        }
    );

    clearTimeout(timeoutId);

    const data = await response.json();
    return data.starterPack;
};

/**
 * Fetches a list of items from the Bluesky API using the provided `atUri`.
 *
 * @param {string} atUri - The AT URI of the list to fetch.
 * @returns {Promise<{ list: any, items: any }>} - An object containing the list metadata and the list items.
 */
const getList = async (atUri) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(
        `https://public.api.bsky.app/xrpc/app.bsky.graph.getList?list=${atUri}`,
        {
            signal: controller.signal,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        }
    );

    clearTimeout(timeoutId);

    const data = await response.json();
    return data;
};

/**
 * Creates a new Bluesky list with the provided name and description.
 *
 * @param {Object} auth - The authentication object containing the access JWT and DID.
 * @param {string} name - The name of the new list.
 * @param {string} description - The description of the new list.
 * @returns {Promise<any>} - The response from the Bluesky API containing the created list.
 */
const createBskyList = async (auth, name, description) => {
    if (!auth) {
        throw new Error('Authentication failed - please log in to Bluesky');
    }
    const { accessJwt, did } = auth;

    try {
        const response = await fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessJwt}`,
                'Content-Type': 'application/json',
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

        if (!response.ok) {
            throw new Error(`Failed to create list: ${response.status} ${response.statusText}`);
        }

        return response.json();
    } catch (error) {
        throw new Error(`Error creating list: ${error.message}`);
    }
};

const addUsersToList = async (auth, listUri, users) => {
    const { accessJwt, did } = auth;
    const addUserPromises = users.map((user) => {
        console.log('user', user);
        return fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessJwt}`,
                'Content-Type': 'application/json',
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

    return Promise.all(addUserPromises);
};

/**
 * Listens for a message with the 'createList' action and creates a new Bluesky list based on the starter pack details.
 *
 * @param {Object} message - The message object containing the action to perform.
 * @param {Object} sender - The sender of the message.
 * @param {function} sendResponse - A function to send a response back to the sender.
 * @returns {Promise<void>} - A Promise that resolves when the list creation is complete.
 */
const listener = async (message, sender, sendResponse) => {
    if (message.action === 'createList') {
        console.log('Creating list...');

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

            // Create new list using the starter pack details
            const newList = await createBskyList(auth, list.name, list.description);
            console.log('new list:', newList);

            await addUsersToList(auth, newList.uri, items);
        }
    }
};

chrome.runtime.onMessage.addListener(listener);
