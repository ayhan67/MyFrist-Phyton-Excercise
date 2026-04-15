// OSGB Connector - Runs on localhost:3000 or production OSGB URL
console.log('OSGB Köprüsü: Sistem bağlantısı kontrol ediliyor...');

function sendTokenToExtension() {
    // Check if extension context is valid
    if (!chrome.runtime?.id) {
        console.warn('OSGB Köprüsü: Uzantı bağlamı geçersiz. Sayfayı yenileyin.');
        return;
    }

    const token = localStorage.getItem('authToken');
    const selectedBranch = localStorage.getItem('selectedBranch');
    
    // NEW: Get available branches from Organization data
    const userStr = localStorage.getItem('user');
    let availableBranches = [];
    try {
        if (userStr) {
            const user = JSON.parse(userStr);
            const org = user?.Organization || user?.organization;
            if (org && Array.isArray(org.branches)) {
                availableBranches = org.branches.map(b => b.city).filter(Boolean);
            }
        }
    } catch (err) {
        console.warn('OSGB Köprüsü: Branch parsing error:', err);
    }
    
    if (token) {
        // Save to storage directly (Content scripts have access to chrome.storage)
        const dataToSave = { 
            authToken: token, 
            selectedBranch: selectedBranch,
            availableBranches: availableBranches,  // NEW: Send branch list
            backendUrl: window.location.origin
        };
        
        chrome.storage.local.set(dataToSave, () => {
            if (chrome.runtime.lastError) {
                console.warn('OSGB Köprüsü: Veri kaydedilemedi:', chrome.runtime.lastError.message);
            } else {
                console.log('OSGB Köprüsü: Oturum ve şube bilgisi eklenti hafızasına kaydedildi.', {
                    selectedBranch,
                    availableBranches,
                    autoSelect: availableBranches.length === 1 ? availableBranches[0] : null
                });
            }
        });

        // Still send message for background actions if needed (like updating icon or state)
        chrome.runtime.sendMessage({
            action: 'SAVE_AUTH_TOKEN',
            token: token,
            selectedBranch: selectedBranch,
            availableBranches: availableBranches,  // NEW
            backendUrl: window.location.origin
        });
    } else {
        // Eğer sayfada token yoksa (çıkış yapılmışsa), uzantıdaki token'ı da temizle
        chrome.runtime.sendMessage({ action: 'CLEAR_AUTH_DATA' }, () => {
             if (chrome.runtime.lastError) return;
             console.log('OSGB Köprüsü: Oturum bulunamadı, uzantı verisi temizlendi.');
        });
    }
}

// Check every time page loads or storage changes
sendTokenToExtension();

window.addEventListener('storage', (e) => {
    if (e.key === 'authToken' || e.key === 'selectedBranch') {
        sendTokenToExtension();
    }
});

// Also send periodically or on focus to ensure sync
window.addEventListener('focus', sendTokenToExtension);

// ── NIRVANA: LISTEN FOR ASSIGNMENT DATA ──────────────────────
window.addEventListener('message', (event) => {
    // We only accept messages from ourselves
    if (event.source !== window) return;

    if (event.data && event.data.type === 'START_KATIP_ASSIGNMENT') {
        console.log('OSGB Köprüsü: Nirvana verisi alındı, arka plana iletiliyor...', event.data.workplace.name);
        chrome.runtime.sendMessage(event.data);
    }

    // PING check for frontend to detect extension
    if (event.data && event.data.type === 'PING_EXTENSION') {
        window.postMessage({ type: 'PONG_EXTENSION', version: '1.2.2' }, '*');
    }
});
