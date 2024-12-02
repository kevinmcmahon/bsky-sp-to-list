class HttpClient {
    constructor(timeout = 5000) {
        this.timeout = timeout;
    }

    async fetch(url, options = {}) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            throw new Error(`Network request failed: ${error.message}`);
        }
    }
}

export class ListConverter {
    constructor(agent) {
        this.agent = agent;
        this.httpClient = new HttpClient();
        this.CONTENT_TYPE_JSON = 'application/json';
    }

    async createListFromStarterPack(url) {
        try {
            const atUri = await this.#getStarterPackUri(url);
            const starterPack = await this.#getStarterPack(atUri);
            const { list, items } = await this.#getList(starterPack.list.uri);

            const newList = await this.#createBskyList({
                name: list.name,
                description: list.description,
            });

            await this.#addUsersToList({
                listUri: newList.uri,
                users: items,
            });

            return newList;
        } catch (error) {
            throw new Error(`Failed to create list: ${error.message}`);
        }
    }

    async #fetchStarterPackRedirect(code) {
        return this.httpClient.fetch(`https://go.bsky.app/${code}`, {
            headers: { accept: this.CONTENT_TYPE_JSON },
        });
    }

    #getShortCode(url) {
        if (!url?.pathname) throw new Error('Invalid URL object');
        const segments = url.pathname.split('/').filter((segment) => segment !== '');
        if (segments.length < 2) throw new Error('Invalid URL path structure');
        return segments[1];
    }

    #getAtUri(starterPackUrl) {
        const url = new URL(starterPackUrl);
        const segments = url.pathname.split('/').filter((segment) => segment !== '');
        const handleOrDid = segments[1];
        const rkey = segments[2];

        return `at://${handleOrDid}/app.bsky.graph.list/${rkey}`;
    }

    #getStarterPackUri = async (url) => {
        let atUri;
        if (url.pathname.startsWith('/starter-pack-short/')) {
            const shortCode = this.#getShortCode(url);
            const starterPackRedirect = await this.#fetchStarterPackRedirect(shortCode);
            atUri = this.#getAtUri(starterPackRedirect.url);
        } else {
            atUri = this.#getAtUri(url);
        }
        return atUri;
    };

    async #getStarterPack(atUri) {
        const { data } = await this.agent.app.bsky.graph.getStarterPack({ starterPack: atUri });
        return data.starterPack;
    }

    async #getList(atUri) {
        const { data } = await this.agent.app.bsky.graph.getList({ list: atUri });
        return data;
    }

    #createBskyList = async (config = { name, description }) => {
        const response = await this.agent.com.atproto.repo.createRecord({
            repo: this.agent.assertDid,
            collection: 'app.bsky.graph.list',
            record: {
                $type: 'app.bsky.graph.list',
                purpose: 'app.bsky.graph.defs#curatelist',
                name: `${config.name} - ${Math.random().toString(36).substring(7)}`,
                description: config.description,
                createdAt: new Date().toISOString(),
            },
        });

        return response.data;
    };

    #addUsersToList = async (params = { listUri, users }) => {
        const addUserPromises = params.users.map((user) => {
            try {
                return this.agent.com.atproto.repo.createRecord({
                    repo: this.agent.assertDid,
                    collection: 'app.bsky.graph.listitem',
                    record: {
                        $type: 'app.bsky.graph.listitem',
                        subject: user.subject.did,
                        list: params.listUri,
                        createdAt: new Date().toISOString(),
                    },
                });
            } catch (error) {
                const errorMessage = `Error adding user ${user.subject.did} to list: ${error.message}`;
                console.error(`${errorMessage}:`, error);
                return Promise.reject(new Error(errorMessage));
            }
        });

        try {
            await Promise.all(addUserPromises);
        } catch (error) {
            console.error(`Error adding users to list ${listUri}:`, error);
            throw error;
        }
    };
}
