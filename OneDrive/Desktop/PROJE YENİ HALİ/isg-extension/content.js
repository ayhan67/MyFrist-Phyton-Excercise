// İSG Katip Köprüsü - Content Script
console.log('İSG Katip Köprüsü: Content Script ÇALIŞIYOR (v1.3.9)');

let isSyncing = false;
const KATIP_API_BASE = 'https://isgkatip.csgb.gov.tr/be/bsn-inter-instance';

// UI Injection
async function injectSyncUI() {
    if (document.getElementById('isg-katip-bridge-ui')) {
        document.getElementById('isg-katip-bridge-ui').style.display = 'block';
        return;
    }

    console.log('OSGB Köprüsü: UI Enjekte ediliyor... (v1.3.7)');

    try {
        // Inject CSS programmatically...
        const style = document.createElement('style');
    style.id = 'isg-bridge-styles';
    style.textContent = `
        #isg-katip-bridge-ui {
            position: fixed !important;
            top: 20px;
            right: 20px;
            width: 260px;
            background: #ffffff !important;
            border-radius: 12px !important;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2) !important;
            z-index: 2147483647 !important;
            font-family: 'Segoe UI', sans-serif !important;
            overflow: hidden !important;
            border: 1px solid #e2e8f0 !important;
            transition: box-shadow 0.2s;
            pointer-events: auto !important;
        }
        #isg-katip-bridge-ui.dragging {
            box-shadow: 0 15px 35px rgba(0, 0, 0, 0.3) !important;
            opacity: 0.95 !important;
        }
        .bridge-header {
            background: #1e293b !important;
            color: white !important;
            padding: 10px 15px !important;
            display: flex !important;
            align-items: center !important;
            gap: 10px !important;
            font-size: 13px !important;
            font-weight: 600 !important;
            cursor: move !important;
            user-select: none !important;
            pointer-events: auto !important;
        }
        .bridge-header * {
            pointer-events: none !important;
        }
        .bridge-header button#bridge-close {
            pointer-events: auto !important;
            margin-left: auto;
            background: none;
            border: none;
            color: #94a3b8;
            cursor: pointer;
            font-size: 18px;
        }
    `;
    document.head.appendChild(style);

    const container = document.createElement('div');
    container.id = 'isg-katip-bridge-ui';
    container.innerHTML = `
    <div class="bridge-header" id="isg-bridge-drag-handle">
      <img src="${chrome.runtime.getURL('icons/icon48.png')}" width="20">
      <span>OSGB Köprüsü (v1.3.9)</span>
      <button id="bridge-close">×</button>
    </div>
    <div class="bridge-body">
      <div id="bridge-status">OSGB Oturumu Hazır. Verileri toplamaya başlayabilirsiniz.</div>
      <div id="bridge-branch-info" style="font-size: 11px; color: #64748b; margin: 8px 0; padding: 4px; background: #f8fafc; border-radius: 4px; border: 1px dashed #cbd5e1;">Şube: <span id="current-branch-name" style="font-weight: 600; color: #1e293b;">Yükleniyor...</span></div>
      <button id="bridge-sync-btn" disabled>Verileri Topla ve Aktar</button>
    </div>
  `;
    // HTML (Root) seviyesine ekleyelim, BODY'deki CSS kapanlarından kurtulalım
    document.documentElement.appendChild(container);

    // Global manager handle edecek.

    // Load and apply saved position immediately
    const pos = await chrome.storage.local.get(['bridge_pos']);
    if (pos && pos.bridge_pos) {
        console.log('OSGB Köprüsü: Kayıtlı konum yükleniyor:', pos.bridge_pos);
        container.style.top = pos.bridge_pos.top;
        container.style.left = pos.bridge_pos.left;
        container.style.right = 'auto';
    }

    // Global manager handle edecek.

    document.getElementById('bridge-close').addEventListener('click', () => {
        container.style.display = 'none';
    });

    const syncBtn = document.getElementById('bridge-sync-btn');
    syncBtn.addEventListener('click', startDataSync);

    updateUIFromStorage();

    // Listen for storage changes to update UI in real-time
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local') {
            updateUIFromStorage();
        }
    });
    } catch (err) {
        console.error('OSGB Köprüsü: injectSyncUI HATASI:', err);
    }
}

/**
 * Overlord Sürükleme Yöneticisi (v1.3.5) - "Nirvana ötesi" kesin çözüm
 */
let activeDrag = null;
let dragOverlay = null;

function handleDragStart(e) {
    const handle = e.target.closest('#isg-bridge-drag-handle, #nirvana-drag-handle');
    if (!handle || e.target.closest('button')) return;

    const el = handle.closest('#isg-katip-bridge-ui, #nirvana-banner');
    if (!el) return;

    console.log('OSGB Köprüsü: Overlord Sürükleme TETİKLENDİ ->', el.id);

    const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

    e.preventDefault();
    e.stopPropagation();

    // Sayfa üzerindeki tüm etkileşimleri geçici olarak donduran şeffaf bir katman oluşturalım
    if (!dragOverlay) {
        dragOverlay = document.createElement('div');
        dragOverlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 2147483646; cursor: move; pointer-events: all; background: transparent;';
        document.documentElement.appendChild(dragOverlay);
    }

    const rect = el.getBoundingClientRect();
    activeDrag = {
        el,
        startX: clientX,
        startY: clientY,
        initialLeft: rect.left,
        initialTop: rect.top
    };

    el.style.zIndex = '2147483647';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.transform = 'none';
    el.style.transition = 'none';
    el.classList.add('dragging');

    window.addEventListener('mousemove', handleDragMove, { capture: true, passive: false });
    window.addEventListener('mouseup', handleDragEnd, { capture: true });
    window.addEventListener('touchmove', handleDragMove, { capture: true, passive: false });
    window.addEventListener('touchend', handleDragEnd, { capture: true });
}

function handleDragMove(e) {
    if (!activeDrag) return;

    const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

    const deltaX = clientX - activeDrag.startX;
    const deltaY = clientY - activeDrag.startY;

    activeDrag.el.style.left = (activeDrag.initialLeft + deltaX) + 'px';
    activeDrag.el.style.top = (activeDrag.initialTop + deltaY) + 'px';
}

function handleDragEnd() {
    if (!activeDrag) return;

    if (dragOverlay) {
        dragOverlay.remove();
        dragOverlay = null;
    }

    if (activeDrag.el.id === 'isg-katip-bridge-ui') {
        chrome.storage.local.set({
            bridge_pos: {
                top: activeDrag.el.style.top,
                left: activeDrag.el.style.left
            }
        });
    }

    activeDrag.el.classList.remove('dragging');
    activeDrag.el.style.transition = ''; 
    activeDrag = null;

    window.removeEventListener('mousemove', handleDragMove, true);
    window.removeEventListener('mouseup', handleDragEnd, true);
    window.removeEventListener('touchmove', handleDragMove, true);
    window.removeEventListener('touchend', handleDragEnd, true);
    
    console.log('OSGB Köprüsü: Sürükleme başarıyla tamamlandı.');
}

// Global olarak dinleyelim (En erken yakalayan biz olalım)
document.addEventListener('mousedown', handleDragStart, true);
document.addEventListener('touchstart', handleDragStart, { capture: true, passive: false });

async function updateUIFromStorage() {
    console.log('OSGB Köprüsü: updateUIFromStorage çağrıldı.');
    try {
        const settings = await chrome.storage.local.get(['authToken', 'backendUrl', 'selectedBranch', 'availableBranches']);
        console.log('OSGB Köprüsü: Storage\'dan okunan veriler:', settings);
        
        const statusEl = document.getElementById('bridge-status');
        const branchEl = document.getElementById('current-branch-name');
        const btn = document.getElementById('bridge-sync-btn');

        // NEW: Smart branch detection
        const branches = settings.availableBranches || [];
        let currentBranch = settings.selectedBranch;
        
        // AUTO-SELECT: If only 1 branch exists, auto-select it
        if (branches.length === 1 && (!currentBranch || currentBranch === 'Tüm Şubeler')) {
            console.log('OSGB Köprüsü: Tek şube algılandı, otomatik seçiliyor:', branches[0]);
            currentBranch = branches[0];
            await chrome.storage.local.set({ selectedBranch: currentBranch });
        }
        
        // NO BRANCHES: Single-branch or headquarter OSGB
        if (branches.length === 0 && (!currentBranch || currentBranch === 'Tüm Şubeler')) {
            console.log('OSGB Köprüsü: Şube bilgisi yok, tek şube varsayılıyor');
            currentBranch = 'Merkez (Tek Şube)';
        }
        
        // WARNING: Multiple branches exist but user selected 'Tüm Şubeler'
        if (branches.length > 1 && (!currentBranch || currentBranch === 'Tüm Şubeler')) {
            console.warn('OSGB Köprüsü: Birden fazla şube var ama şube seçilmemiş!', {
                availableBranches: branches,
                currentSelection: currentBranch
            });
        }

        if (branchEl) {
            branchEl.innerText = currentBranch || 'Seçilmedi';
            if (!currentBranch || currentBranch === 'Tüm Şubeler') {
                branchEl.style.color = '#f43f5e';
                
                // WARNING: Multiple branches - show alert message
                if (branches.length > 1) {
                    const statusEl = document.getElementById('bridge-status');
                    if (statusEl) {
                        statusEl.innerHTML = '<span style="color: #f43f5e; font-weight: bold">⚠️ Birden fazla şube var! Lütfen OSGB sisteminden şube seçin.</span>';
                    }
                }
            } else {
                branchEl.style.color = '#10b981';
            }
        }

        if (settings.authToken) {
            // Check if branch selection is needed
            const multipleBranches = branches.length > 1 && (!currentBranch || currentBranch === 'Tüm Şubeler');
            
            if (multipleBranches) {
                // Multiple branches exist but none selected - disable sync
                statusEl.innerHTML = '<span style="color: #f43f5e; font-weight: bold">⚠️ Birden fazla şube var! Lütfen OSGB sisteminden şube seçin.</span>';
                btn.disabled = true;
            } else {
                statusEl.innerText = 'Bağlantı kuruldu. Senkronizasyona hazır.';
                btn.disabled = false;
            }
        } else {
            statusEl.innerHTML = '<span style="color: #f43f5e">⚠ OSGB Oturumu bulunamadı. Lütfen sisteme giriş yapın ve sayfayı yenileyin.</span>';
            btn.disabled = true;
        }
    } catch (err) {
        console.error('OSGB Köprüsü: updateUIFromStorage HATASI:', err);
    }
}

function getKatipToken() {
    let t = sessionStorage.getItem('token') || localStorage.getItem('token');
    if (!t) {
        ['accessToken', 'jwt', 'authToken'].forEach(k => {
            if (!t) t = sessionStorage.getItem(k) || localStorage.getItem(k);
        });
    }
    if (!t && document.cookie.includes('token=')) {
        t = document.cookie.split('; ').find(r => r.trim().startsWith('token='))?.split('=')[1];
    }
    if (typeof t === 'string' && t.startsWith('"')) t = t.replace(/^"|"$/g, '');
    return t;
}

// Data Scraping Logic
async function startDataSync() {
    if (isSyncing) return;

    const katipToken = getKatipToken();
    if (!katipToken) {
        alert('İSG Katip oturumu bulunamadı. Lütfen sayfayı yenileyip giriş yapın.');
        return;
    }

    const settings = await chrome.storage.local.get(['authToken', 'backendUrl', 'selectedBranch']);
    if (!settings.authToken) {
        alert('OSGB Sistem oturumu bulunamadı. Lütfen OSGB sayfanıza gidip oturum açın.');
        return;
    }

    const serverUrl = settings.backendUrl || 'https://isgdestek.com.tr';

    isSyncing = true;
    const statusEl = document.getElementById('bridge-status');
    const btn = document.getElementById('bridge-sync-btn');

    statusEl.innerText = 'Veriler toplanıyor... (Hasat/Harman Başladı)';
    btn.disabled = true;

    console.log('OSGB Köprüsü: Senkronizasyon Ayarları:', {
        serverUrl,
        selectedBranch: settings.selectedBranch
    });

    try {
        const fetchData = async (url, body) => {
            const response = await fetch(KATIP_API_BASE + url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'token': katipToken
                },
                body: JSON.stringify({ body })
            });
            if (!response.ok) throw new Error(`${url} hatası: ${response.status}`);
            const text = await response.text();
            try {
                const json = JSON.parse(text);
                return json?.body?.tableData || [];
            } catch (e) {
                return [];
            }
        };

        console.log('Fetching active, pending and personnel contracts...');

        const [active, pending, personnel] = await Promise.all([
            fetchData('/hizmet-sozlesmesi-surec-view/ongoing', {
                sortOrder: 'DESC', pageIndex: 0, pageSize: 50000,
                filters: [
                    { fieldName: 'sozlesmeStatu', value: 5001, oper: 'EQ' },
                    { fieldName: 'sozlesmeOnayDurumu', value: 5004, oper: 'EQ' }
                ],
                sortColumn: 'sozlesmeId'
            }),
            fetchData('/hizmet-sozlesmesi-surec-view/ongoing', {
                sortOrder: 'DESC', pageIndex: 0, pageSize: 50000,
                filters: [
                    { fieldName: 'sozlesmeStatu', value: 5000, oper: 'EQ' },
                    { fieldName: 'sozlesmeOnayDurumu', value: 5003, oper: 'EQ' }
                ],
                sortColumn: 'sozlesmeId'
            }),
            fetchData('/personel-sozlesmesi-surec/ongoing', {
                sortOrder: 'DESC', pageIndex: 0, pageSize: 15000,
                filters: [
                    { fieldName: 'sozlesmeStatu', value: 5001, oper: 'EQ' },
                    { fieldName: 'sozlesmeOnayDurumu', value: 5004, oper: 'EQ' }
                ],
                sortColumn: 'sozlesmeId'
            })
        ]);

        console.log('📊 CONTRACT SAYILARI:', {
            active: active.length,
            pending: pending.length,
            personnel: personnel.length
        });

        if (active.length === 0) {
            console.warn('⚠️ DİKKAT: Hiç aktif sözleşme bulunamadı!');
            console.warn('ISG Katip filtresi: sozlesmeStatu=5001, sozlesmeOnayDurumu=5004');
        }

        statusEl.innerText = 'OSGB Sistemine aktarılıyor...';

        const payload = {
            activeContracts: active,
            pendingContracts: pending,
            personnelContracts: personnel,
            isPreview: false,
            branchCity: settings.selectedBranch,
            source: 'extension'
        };

        console.log('OSGB Köprüsü: Payload Hazırla ndı:', {
            active: active.length,
            branchCity: payload.branchCity
        });
        
        let syncUrl = `${serverUrl}/api/isg-katip/sync-from-browser`;
                
        // Append branchCity if selected
        // NEW: Allow sync even if 'Merkez (Tek Şube)' (no branches)
        if (settings.selectedBranch && 
            settings.selectedBranch !== 'Tüm Şubeler' && 
            settings.selectedBranch !== 'Merkez (Tek Şube)') {
            syncUrl += `?branchCity=${encodeURIComponent(settings.selectedBranch)}`;
        }

        const response = await fetch(syncUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.authToken}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Sunucu hatası: ${response.status}`);
        }

        const result = await response.json();
        statusEl.innerHTML = `<span style="color: #10b981; font-weight: bold;">✓ BAŞARILI: ${result.updated || 0} İşyeri güncellendi.</span>`;
        btn.innerText = 'Yeniden Eşitle';
    } catch (err) {
        console.error('Sync Error:', err);
        statusEl.innerHTML = `<span style="color: #f43f5e">⚠ Hata: ${err.message}</span>`;
        btn.innerText = 'Tekrar Dene';
    } finally {
        isSyncing = false;
        btn.disabled = false;
    }
}

// Message Listener from Popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'START_SYNC') {
        injectSyncUI();
        startDataSync();
        sendResponse({ status: 'STARTED' });
    }
    return true;
});

// Auto-inject if on isgkatip or OSGB domain
const currentHost = window.location.host;
console.log('OSGB Köprüsü: Alan adı kontrol ediliyor:', currentHost);

// Giriş sayfasında veya token yoksa otomatik açılmasın
function shouldAutoInject() {
    const isKatip = currentHost.includes('isgkatip');
    
    // UI SADECE İSG KATİP ÜZERİNDE GÖZÜKMELİDİR.
    // Localhost üzerinde sadece osgb_connector.js çalışır (token yakalamak için).
    if (!isKatip) return false;

    // 1. Giriş sayfası tespiti (URL veya Element)
    const isGenericLogin = window.location.pathname.includes('/login') || 
                          window.location.pathname.includes('/giris') ||
                          document.querySelector('.login-container') || 
                          document.querySelector('.login-window') ||
                          document.querySelector('.btn-login') || 
                          document.querySelector('.btn-custom');

    if (isGenericLogin) {
        console.log('OSGB Köprüsü: Giriş sayfası/elementi tespit edildi. UI atlanıyor.');
        return false;
    }

    // Kök dizindeysen ve token yoksa (veya token çok kısaysa) giriş sayfasıdır
    const token = getKatipToken();
    if (window.location.pathname === '/' || window.location.pathname === '/index.html' || !token) {
        if (!token || token.length < 20) {
             console.log('OSGB Köprüsü: Token yetersiz veya ana dizindesiniz. Giriş bekleniyor.');
             return false;
        }
    }
    
    return true;
}

if (shouldAutoInject()) {
    console.log('OSGB Köprüsü: Koşullar sağlandı, UI başlatılıyor... (v1.3.7)');
    if (document.readyState === 'complete') {
        injectSyncUI();
    } else {
        window.addEventListener('load', injectSyncUI);
    }
}
// ── NIRVANA: AUTO-FILL LOGIC ────────────────────────────────

async function checkNirvanaStatus() {
    const data = await chrome.storage.local.get(['pendingAssignment', 'assignmentStep']);
    if (!data.pendingAssignment) return;

    injectNirvanaBanner(data.pendingAssignment, data.assignmentStep);
    handleNirvanaAutomation(data.pendingAssignment, data.assignmentStep);
}

function injectNirvanaBanner(assignment, step) {
    if (document.getElementById('nirvana-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'nirvana-banner';
    // Draggable Nirvana Window
    banner.style.cssText = 'background: #4f46e5; color: white; padding: 12px; border-radius: 8px; font-weight: bold; z-index: 1000000; position: fixed; top: 100px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; gap: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.4); width: 350px; border: 1px solid rgba(255,255,255,0.2); cursor: default;';

    let stepText = '';
    if (step === 'SEARCH_WORKPLACE') stepText = `Adım 1: İşyeri Sorgulama (${assignment.workplace.sskRegistrationNo})`;
    if (step === 'FILL_ASSIGNMENT') stepText = `Adım 2: Personel Atama (${assignment.assignments.expert?.name || ''})`;

    banner.innerHTML = `
        <div id="nirvana-drag-handle" style="cursor: move; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 8px; display: flex; align-items: center; gap: 10px; user-select: none;">
            <span style="background: white; color: #4f46e5; padding: 2px 6px; border-radius: 4px; font-size: 10px;">NİRVANA</span>
            <span style="font-size: 13px;">${assignment.workplace.name}</span>
        </div>
        <div style="font-size: 12px; opacity: 0.9;">${stepText}</div>
        <div style="display: flex; gap: 8px; margin-top: 5px;">
            <button id="nirvana-skip" style="flex: 1; background: rgba(255,255,255,0.1); border: 1px solid white; color: white; padding: 6px; border-radius: 4px; cursor: pointer; font-size: 11px;">Durdur</button>
            <button id="nirvana-next" style="flex: 2; background: white; color: #4f46e5; border: none; padding: 6px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold;">Otomatik Doldur</button>
        </div>
    `;
    document.documentElement.appendChild(banner);

    const handle = document.getElementById('nirvana-drag-handle');
    // Global manager handle edecek.

    document.getElementById('nirvana-skip').onclick = () => {
        chrome.storage.local.remove(['pendingAssignment', 'assignmentStep']);
        banner.remove();
    };

    document.getElementById('nirvana-next').onclick = () => {
        handleNirvanaAutomation(assignment, step, true);
    };
}

async function handleNirvanaAutomation(assignment, step, force = false) {
    console.log(`🚀 Nirvana Automation - Step: ${step}, Force: ${force}`);

    // Adım 1: İşyeri Sorgulama
    if (step === 'SEARCH_WORKPLACE') {
        const sskField = findInputByLabel(['Sicil No', 'SGK Sicil', 'İşyeri Sicil']);
        if (sskField) {
            sskField.value = assignment.workplace.sskRegistrationNo;
            sskField.dispatchEvent(new Event('input', { bubbles: true }));
            sskField.dispatchEvent(new Event('change', { bubbles: true }));
            sskField.style.border = '3px solid #4f46e5';
            sskField.style.backgroundColor = '#eef2ff';

            const searchBtn = findButtonByText(['Sorgula', 'Ara', 'Bul']);
            if (searchBtn && force) {
                searchBtn.click();
                chrome.storage.local.set({ assignmentStep: 'SELECT_WORKPLACE' });
                showToast('İşyeri sorgulanıyor...', 'info');
            }
        }
    }

    // Adım 2: İşyeri Seçimi (Listeden doğru satırı bulma)
    if (step === 'SELECT_WORKPLACE') {
        const rows = Array.from(document.querySelectorAll('tr'));
        const targetRow = rows.find(r => r.innerText.includes(assignment.workplace.sskRegistrationNo));

        if (targetRow) {
            targetRow.style.backgroundColor = '#eef2ff';
            targetRow.style.border = '2px solid #4f46e5';
            const selectBtn = targetRow.querySelector('button, .v-btn, [role="button"]');
            if (selectBtn && force) {
                selectBtn.click();
                chrome.storage.local.set({ assignmentStep: 'FILL_ASSIGNMENT' });
                showToast('İşyeri seçildi, personel sayfasına geçiliyor...', 'success');
            }
        }
    }

    // Adım 3: Personel Atama (TCKN Girişi)
    if (step === 'FILL_ASSIGNMENT') {
        const assignments = assignment.assignments;

        // Bu adımda genellikle dinamik bir form açılır.
        // Uzman, Hekim veya DSP için TCKN alanlarını bulalım.
        const tcknInputs = Array.from(document.querySelectorAll('input')).filter(i =>
            i.placeholder?.includes('TC') ||
            i.getAttribute('name')?.includes('tckn') ||
            i.previousElementSibling?.innerText?.includes('TC')
        );

        if (tcknInputs.length > 0) {
            // Mapping: İlk boş alana ilk personeli yazalım veya label'a göre eşleştirelim
            tcknInputs.forEach((input, idx) => {
                const personnel = Object.values(assignments).filter(p => p !== null)[idx];
                if (personnel && personnel.tcNo) {
                    input.value = personnel.tcNo;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.style.border = '3px solid #10b981';
                    input.title = `Nirvana: ${personnel.name} atanıyor.`;
                }
            });

            showToast('Personel bilgileri dolduruldu. Lütfen süreleri kontrol edin.', 'success');
        }
    }
}

function showToast(msg, type = 'info') {
    const toast = document.createElement('div');
    toast.style.cssText = `position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); padding: 10px 20px; border-radius: 8px; color: white; z-index: 1000000; font-family: sans-serif; font-weight: bold; box-shadow: 0 4px 15px rgba(0,0,0,0.2); transition: opacity 0.3s;`;
    toast.style.backgroundColor = type === 'success' ? '#10b981' : '#3b82f6';
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Helper to find elements by text (İSG Katip uses specific labels)
function findInputByLabel(labels) {
    const allLabels = Array.from(document.querySelectorAll('label'));
    for (const label of allLabels) {
        if (labels.some(l => label.innerText.includes(l))) {
            const inputId = label.getAttribute('for');
            if (inputId) return document.getElementById(inputId);
            return label.nextElementSibling?.querySelector('input') || label.parentElement?.querySelector('input');
        }
    }
    // Fallback: search placeholders
    return document.querySelector('input[placeholder*="Sicil"]');
}

function findButtonByText(texts) {
    const buttons = Array.from(document.querySelectorAll('button, .btn, .v-btn'));
    return buttons.find(b => texts.some(t => b.innerText.includes(t)));
}

// Auto-trigger Nirvana check
if (window.location.host.includes('isgkatip')) {
    checkNirvanaStatus();
}
