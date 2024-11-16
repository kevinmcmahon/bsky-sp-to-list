function addCreateFeedButton() {
    const followAllButton = document.querySelector('button[aria-label="Follow all"]');
    console.log('followAllButton:', followAllButton);

    if (followAllButton) {
        const createFeedButton = document.createElement('button');
        // Copy styles from Follow All button
        createFeedButton.style.cssText = followAllButton.style.cssText;
        createFeedButton.setAttribute('aria-label', 'Create feed');
        createFeedButton.setAttribute('aria-pressed', 'false');
        createFeedButton.setAttribute('type', 'button');
        createFeedButton.setAttribute('role', 'button');
        createFeedButton.classList.add(...followAllButton.classList);

        createFeedButton.style.color = '#ffffff';
        createFeedButton.style.border = 'none';
        createFeedButton.style.padding = '9px 12px';
        createFeedButton.style.gap = '6px';
        createFeedButton.style.borderRadius = '6px';
        createFeedButton.style.cursor = 'pointer';
        createFeedButton.style.fontWeight = '600';

        // Add an event listener to perform action when the new button is clicked
        createFeedButton.addEventListener('click', () => {
            // Here you can define what action you want to take
            const dids = extractDIDs();
            console.log('dids:', dids);
            // Replace with the actual function to create a new feed
        });

        // Copy inner content from Follow All button
        createFeedButton.innerHTML = followAllButton.innerHTML;
        const createFeedButtonDiv = createFeedButton.querySelector('div');
        createFeedButtonDiv.textContent = 'Create feed';

        // Insert the "Create Feed" button before "Follow All"
        followAllButton.parentNode.insertBefore(createFeedButton, followAllButton);
    }
}
function extractDIDs() {
    const profileLinks = document.querySelectorAll('a[href^="/profile/did"]');
    const dids = Array.from(profileLinks)
        .map((link) => {
            const href = link.getAttribute('href');
            // Extract the DID portion from the href
            const did = href.split('/profile/')[1];
            return did;
        })
        .filter(Boolean);

    return [...new Set(dids)]; // Remove duplicates
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
                // Look for the main feed container being populated
                // const profileLinks = document.querySelectorAll('a[href^="/profile/did"]');
                const followAllButton = document.querySelector('button[aria-label="Follow all"]');
                if (followAllButton) {
                    addCreateFeedButton();
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
waitForContent().then(() => {
    console.log('Content loaded and button added');
});
