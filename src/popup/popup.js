document.getElementById('logout').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'logout' }).then((response) => {
        hideProfile();
    });
});

document.getElementById('login').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'authenticate' }, (response) => {
        console.log('handling auth response', response);
        if (response.authenticated) {
            showProfile(response.profile);
        } else {
            hideProfile(response.error);
        }
    });
});

function showProfile(profile) {
    document.getElementById('user-profile').classList.add('visible');
    document.getElementById('user-handle').textContent = profile.handle;
    document.getElementById('user-displayName').textContent = profile.displayName;
    document.getElementById('user-avatar').src = profile.avatar;
    document.getElementById('login').classList.add('hidden');
    document.getElementById('logout').classList.remove('hidden');
}

function hideProfile(errorMessage) {
    document.getElementById('user-profile').classList.remove('visible');
    document.getElementById('error-message').textContent = errorMessage || '';
    document.getElementById('login').classList.remove('hidden');
    document.getElementById('logout').classList.add('hidden');
}

function processSessionStatusMessage(message) {
    console.log('Processing session-status message:', message);
    if (!message) {
        throw new Error('[Process Session Status] Undefined message!');
    }
    if (message?.authenticated) {
        showProfile(message.profile);
    } else {
        hideProfile(message.error);
    }
}

// Request session status when popup is ready
document.addEventListener('DOMContentLoaded', () => {
    chrome.runtime.sendMessage({ action: 'get-session-status' }, (response) => {
        processSessionStatusMessage(response);
    });
});
