class DOMUtils {
    static createElement(tag, attributes = {}, styles = {}) {
        const element = document.createElement(tag);
        Object.entries(attributes).forEach(([key, value]) => {
            element.setAttribute(key, value);
        });
        Object.assign(element.style, styles);
        return element;
    }

    static addStyles(element, sourceElement) {
        element.style.cssText = sourceElement.style.cssText;
        element.classList.add(...sourceElement.classList);
    }
}

class ContentScript {
    constructor() {
        this.observer = null;
        this.observerConfig = {
            childList: true,
            subtree: true,
        };
    }

    init() {
        this.setupNavigationListener();
        this.waitForContent();
    }

    createListButton(followAllButton) {
        try {
            const createListButton = DOMUtils.createElement('button', {
                'aria-label': 'Create list',
                'aria-pressed': 'false',
                type: 'button',
                role: 'button',
            });

            DOMUtils.addStyles(createListButton, followAllButton);

            Object.assign(createListButton.style, {
                color: '#ffffff',
                border: 'none',
                padding: '9px 12px',
                gap: '6px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600',
            });

            createListButton.addEventListener('click', () => {
                chrome.runtime.sendMessage({ action: 'createList' }, (response) => {
                    console.log('[ContentScript] Create list response:', response);
                });
            });

            createListButton.innerHTML = followAllButton.innerHTML;
            const createListButtonDiv = createListButton.querySelector('div');
            createListButtonDiv.textContent = 'Create list';

            return createListButton;
        } catch (error) {
            console.error('[ContentScript] Failed to create list button:', error);
            return null;
        }
    }

    setupNavigationListener() {
        window.addEventListener('popstate', () => this.checkForContent());
        this.interceptHistoryMethods();
    }

    interceptHistoryMethods() {
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        history.pushState = (...args) => {
            originalPushState.apply(history, args);
            this.checkForContent();
        };

        history.replaceState = (...args) => {
            originalReplaceState.apply(history, args);
            this.checkForContent();
        };
    }

    checkForContent() {
        if (this.observer) {
            this.observer.disconnect();
        }

        this.observer = new MutationObserver((mutations, obs) => {
            const createListButton = document.querySelector('button[aria-label="Create list"]');
            if (createListButton) {
                obs.disconnect();
                return;
            }

            const followAllButton = document.querySelector('button[aria-label="Follow all"]');
            if (followAllButton) {
                const newButton = this.createListButton(followAllButton);
                if (newButton) {
                    followAllButton.parentNode.insertBefore(newButton, followAllButton);
                }
                obs.disconnect();
            }
        });

        this.observer.observe(document.body, this.observerConfig);
    }

    waitForContent() {
        if (document.readyState === 'complete') {
            this.checkForContent();
        } else {
            window.addEventListener('load', () => this.checkForContent());
        }
    }

    cleanup() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }
}

const contentScript = new ContentScript();
contentScript.init();
