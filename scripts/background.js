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

const listener = async (details) => {
    if (isStarterPackUrl(details.url)) {
        const url = new URL(details.url);

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
        console.log('list:', list);
        console.log('items:', items);
    }
};

chrome.webNavigation.onCompleted.addListener(listener);
