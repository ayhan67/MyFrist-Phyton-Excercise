document.addEventListener('DOMContentLoaded', async () => {
    const katipStatus = document.getElementById('katipStatus');
    const osgbStatus = document.getElementById('osgbStatus');
    const syncNowBtn = document.getElementById('syncNowBtn');
    const backendUrlInput = document.getElementById('backendUrl');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const authAlert = document.getElementById('authAlert');

    // 1. Load Settings
    const settings = await chrome.storage.local.get(['backendUrl', 'authToken']);
    backendUrlInput.value = settings.backendUrl || 'https://isgdestek.com.tr';

    // 2. Check ISG Katip Connection
    const [katipTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (katipTab?.url?.includes('isgkatip.csgb.gov.tr')) {
        katipStatus.innerText = 'Bağlı';
        katipStatus.style.color = '#10b981';
        syncNowBtn.disabled = false;
    } else {
        katipStatus.innerText = 'Pasif (Siteye gidin)';
        katipStatus.style.color = '#f43f5e';
        syncNowBtn.disabled = true;
    }

    // 3. Check OSGB Auth Status
    if (settings.authToken) {
        osgbStatus.innerText = 'Oturum Açık';
        osgbStatus.style.color = '#10b981';
        authAlert.style.display = 'none';
        
        // NEW: Validate token with backend
        const backendUrl = settings.backendUrl || 'https://isgdestek.com.tr';
        fetch(`${backendUrl}/api/auth/me`, {
            headers: { 'Authorization': `Bearer ${settings.authToken}` }
        })
        .then(res => {
            if (!res.ok) {
                // Token expired or invalid
                osgbStatus.innerText = 'Oturum SÜRESİ DOLMUŞ!';
                osgbStatus.style.color = '#f59e0b';
                console.error('⚠️ OSGB Token geçersiz veya süresi dolmuş!');
            } else {
                console.log('✅ OSGB Token geçerli!');
            }
        })
        .catch(err => {
            console.error('❌ Token validation failed:', err);
        });
    } else {
        osgbStatus.innerText = 'Bağlı Değil';
        osgbStatus.style.color = '#f43f5e';
        authAlert.style.display = 'block';
    }

    // 4. Save Settings
    saveSettingsBtn.addEventListener('click', async () => {
        const url = backendUrlInput.value.trim();
        await chrome.storage.local.set({ backendUrl: url });
        alert('Ayarlar kaydedildi.');
    });

    // 5. Start Sync
    syncNowBtn.addEventListener('click', () => {
        chrome.tabs.sendMessage(katipTab.id, {
            action: 'START_SYNC',
            backendUrl: backendUrlInput.value
        }, (response) => {
            if (chrome.runtime.lastError) {
                alert('Hata: Sayfayı yenileyip tekrar deneyin.');
                return;
            }
            window.close();
        });
    });
});
