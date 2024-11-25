function addCreateListButton() {
    const followAllButton = document.querySelector('button[aria-label="Follow all"]');

    if (followAllButton) {
        const createListButton = document.createElement('button');
        // Copy styles from Follow All button
        createListButton.style.cssText = followAllButton.style.cssText;
        createListButton.setAttribute('aria-label', 'Create list');
        createListButton.setAttribute('aria-pressed', 'false');
        createListButton.setAttribute('type', 'button');
        createListButton.setAttribute('role', 'button');
        createListButton.classList.add(...followAllButton.classList);

        createListButton.style.color = '#ffffff';
        createListButton.style.border = 'none';
        createListButton.style.padding = '9px 12px';
        createListButton.style.gap = '6px';
        createListButton.style.borderRadius = '6px';
        createListButton.style.cursor = 'pointer';
        createListButton.style.fontWeight = '600';

        // Add an event listener to perform action when the new button is clicked
        createListButton.addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'createList' });
        });

        // Copy inner content from Follow All button
        createListButton.innerHTML = followAllButton.innerHTML;
        const createListButtonDiv = createListButton.querySelector('div');
        createListButtonDiv.textContent = 'Create list';

        // Insert the "Create list" button before "Follow all"
        followAllButton.parentNode.insertBefore(createListButton, followAllButton);
    }
}

function waitForContent() {
    return new Promise((resolve) => {
        // First wait for page load
        if (document.readyState === 'complete') {
            checkForContent();
        } else {
            window.addEventListener('load', checkForContent);
        }

        function checkForContent() {
            const observer = new MutationObserver((mutations, obs) => {
                const followAllButton = document.querySelector('button[aria-label="Follow all"]');
                if (followAllButton) {
                    addCreateListButton();
                    obs.disconnect();
                    resolve();
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
            });
        }
    });
}

waitForContent();
