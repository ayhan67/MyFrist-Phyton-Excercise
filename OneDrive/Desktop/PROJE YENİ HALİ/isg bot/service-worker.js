import { chrome_tabs_getActiveSession } from "./chrome-tabs-session-manager.js";
import {
    engine_getKalanDakikaData,
    engine_getGuncellenmesiGerekenlerData,
    engine_getAsgariSuredenFazlaData,
    engine_getAtamaDurumuData,
    engine_getContractListData,
    engine_getPendingContractListData,
    engine_updateContractsHeadless,
    engine_downloadContractPdfsHeadless,
    engine_downloadContractPdfsAsZipHeadless,
    engine_getPersonnelForBulkAssignment,
    engine_queryCompanyInfo,
    engine_executeBulkAssignment
} from "./headless-engine.js";

let CHROME_MANIFEST_VERSION = "1.4.32";

// Web sitesinden gelen mesajları dinle
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
    if (request.type === 'PING') {
        sendResponse({ success: true, version: CHROME_MANIFEST_VERSION, name: "İSGPratik Bot" });
    } else if (request.type === 'SYNC') {
        sendResponse({ success: true });
    } else if (request.type === 'EXECUTE_FEATURE') {
        const featureId = request.featureId;
        chrome.runtime.sendMessage({ type: 'EXECUTE_FEATURE_IN_SIDEPANEL', featureId: featureId }, (response) => {
            if (chrome.runtime.lastError) {
                const url = chrome.runtime.getURL(`sidepanel.html#${featureId}`);
                chrome.tabs.create({ url: url });
            }
            sendResponse({ success: true });
        });
    } else if (request.type === 'EXECUTE_FEATURE_HEADLESS') {
        const featureId = request.featureId;

        (async () => {
            try {
                let data = null;

                if (featureId === 'kalan-dakika') {
                    data = await engine_getKalanDakikaData((status) => console.log("Progress:", status));
                } else if (featureId === 'guncellenmesi-gerekenler') {
                    data = await engine_getGuncellenmesiGerekenlerData((status) => console.log("Progress:", status));
                } else if (featureId === 'atama-durumu') {
                    // Modal'dan gelen filtre parametrelerini al
                    const options = request.options || {};
                    data = await engine_getAtamaDurumuData((status) => console.log("Progress:", status), options);
                } else if (featureId === 'sozlesme-listesi') {
                    data = await engine_getContractListData((status) => console.log("Progress:", status));
                } else if (featureId === 'onay-bekleyen-sozlesmeler') {
                    // Onay bekleyen (personel/işyeri onayı) sözleşmeler
                    data = await engine_getPendingContractListData((status) => console.log("Progress:", status));
                } else if (featureId === 'asgari-sureden-fazla') {
                    // Asgari süreden fazla atanan sözleşmeler
                    data = await engine_getAsgariSuredenFazlaData((status) => console.log("Progress:", status));
                } else if (featureId === 'coklu-atama-personel') {
                    // Çoklu atama için personel listesi
                    data = await engine_getPersonnelForBulkAssignment((status) => console.log("Progress:", status));
                } else if (featureId === 'coklu-atama-firma-sorgula') {
                    // Çoklu atama için firma sorgulama
                    const { sgkNo, contractType, employeeTckn } = request.payload || {};
                    data = await engine_queryCompanyInfo(sgkNo, contractType, employeeTckn, (status) => console.log("Progress:", status));
                } else {
                    sendResponse({ success: false, error: "Bu özellik henüz headless modda desteklenmiyor." });
                    return;
                }

                sendResponse({ success: true, data: data });
            } catch (err) {
                sendResponse({ success: false, error: err.message });
            }
        })();
    } else if (request.type === 'EXECUTE_ACTION_HEADLESS') {
        const actionId = request.actionId;
        const payload = request.payload;

        (async () => {
            try {
                let result = null;

                if (actionId === 'update-contracts') {
                    result = await engine_updateContractsHeadless(payload.contracts, (status) => console.log("Progress:", status));
                } else if (actionId === 'download-pdfs') {
                    result = await engine_downloadContractPdfsHeadless(payload.contracts, (status) => console.log("Progress:", status));
                } else if (actionId === 'download-pdfs-zip') {
                    result = await engine_downloadContractPdfsAsZipHeadless(payload.contracts, (status) => console.log("Progress:", status));
                } else if (actionId === 'coklu-atama-gerceklestir') {
                    // Çoklu atama gerçekleştir - ilerleme mesajı gönder
                    result = await engine_executeBulkAssignment(payload.assignments, (progress) => {
                        console.log("Progress:", progress);
                        // Web sayfasına ilerleme mesajı gönder
                        if (progress && typeof progress === 'object' && progress.current !== undefined) {
                            // Tüm tab'lara executeScript ile postMessage gönder
                            chrome.tabs.query({}, (tabs) => {
                                tabs.forEach(tab => {
                                    if (tab.url && (tab.url.includes('localhost') || tab.url.includes('isgpratik.com'))) {
                                        chrome.scripting.executeScript({
                                            target: { tabId: tab.id },
                                            func: (progressData) => {
                                                window.postMessage({ type: 'BULK_ASSIGNMENT_PROGRESS', progress: progressData }, '*');
                                            },
                                            args: [progress]
                                        }).catch(() => { });
                                    }
                                });
                            });
                        }
                    });
                } else {
                    sendResponse({ success: false, error: "Bu aksiyon desteklenmiyor." });
                    return;
                }

                sendResponse({ success: true, result: result });
            } catch (err) {
                sendResponse({ success: false, error: err.message });
            }
        })();
    }
    return true;
});

// Eklenti simgesine tıklama devre dışı - sadece arka plan modu


