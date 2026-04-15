// Background worker
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'PING') {
        sendResponse({ status: 'OK' });
        return false; // Synchronous
    }

    if (request.action === 'SAVE_AUTH_TOKEN') {
        const dataToSave = { authToken: request.token };
        if (request.backendUrl) dataToSave.backendUrl = request.backendUrl;
        if (request.selectedBranch) dataToSave.selectedBranch = request.selectedBranch;

        chrome.storage.local.set(dataToSave, () => {
            console.log('Auth token, backend URL and selected branch saved in extension storage.');
            sendResponse({ status: 'SUCCESS' });
        });
        return true; 
    }

    if (request.action === 'CLEAR_AUTH_DATA') {
        chrome.storage.local.remove(['authToken'], () => {
            console.log('OSGB Köprüsü: Oturum bilgisi temizlendi (Cache Temizliği).');
            sendResponse({ status: 'CLEARED' });
        });
        return true;
    }

    if (request.type === 'START_KATIP_ASSIGNMENT') {
        console.log('Background: Nirvana assignment starting for', request.workplace.name);
        // Store the data for the content script
        chrome.storage.local.set({
            pendingAssignment: request,
            assignmentStep: 'SEARCH_WORKPLACE'
        }, () => {
            // Open İSG Katip Portal (Redirects to login if needed)
            const katipUrl = 'https://isgkatip.csgb.gov.tr/Logout.aspx';
            chrome.tabs.create({ url: katipUrl });
            sendResponse({ status: 'STARTED' });
        });
        return true; // Asynchronous
    }

    // Default response to avoid hanging if nothing matches
    sendResponse({ status: 'IGNORED' });
    return false;
});
