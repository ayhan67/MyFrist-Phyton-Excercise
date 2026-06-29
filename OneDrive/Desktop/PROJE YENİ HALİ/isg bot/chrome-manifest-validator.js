import { chrome_tabs_getActiveSession } from "./chrome-tabs-session-manager.js";
import { makePostRequest, makeApiRequest } from "./api-request-util.js";

// İSG Pratik API URLs
const SESSION_VERIFY_URL = "https://isgpratik.com/api/extension/session/verify";
const LICENSE_API_URL = "https://isgpratik.com/api/extension/license/check";

// Sabitler
let CHROME_MANIFEST_VERSION = "3.0.1";
let CHROME_EXTENSION_ID_PATTERN = /^[a-z]{32}$/;
let CHROME_INTERNAL_API_TIMEOUT = 5e3;

// Cihaz parmak izi oluştur
async function getDeviceFingerprint() {
    try {
        const data = [
            navigator.userAgent,
            navigator.language,
            screen.width + 'x' + screen.height,
            new Date().getTimezoneOffset(),
            navigator.hardwareConcurrency || 'unknown'
        ].join('|');

        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
    } catch (e) {
        return 'device_' + Date.now();
    }
}

// Lisans bilgisini storage'dan al
async function getStoredLicenseInfo() {
    try {
        const result = await chrome.storage.local.get('licenseInfo');
        return result.licenseInfo || null;
    } catch (e) {
        return null;
    }
}

// Lisans bilgisini storage'a kaydet
async function storeLicenseInfo(licenseInfo) {
    try {
        await chrome.storage.local.set({ licenseInfo: licenseInfo });
    } catch (e) {
        console.error("Lisans kaydetme hatası:", e);
    }
}

// Lisans anahtarını storage'dan al
async function getStoredLicenseKey() {
    const info = await getStoredLicenseInfo();
    return info?.licenseKey || null;
}

// Oturum bilgisini storage'dan al
async function getStoredSessionInfo() {
    try {
        const result = await chrome.storage.local.get('sessionInfo');
        return result.sessionInfo || null;
    } catch (e) {
        return null;
    }
}

// Oturum bilgisini storage'a kaydet
async function storeSessionInfo(sessionInfo) {
    try {
        await chrome.storage.local.set({ sessionInfo: sessionInfo });
    } catch (e) {
        console.error("Oturum kaydetme hatası:", e);
    }
}

// Oturum bilgisini temizle
async function clearSessionInfo() {
    try {
        await chrome.storage.local.remove(['sessionInfo', 'licenseInfo']);
    } catch (e) {
        console.error("Oturum temizleme hatası:", e);
    }
}

// Hibrit doğrulama: Oturum + Cihaz + Lisans kontrolü
async function verifyUserSession() {
    const deviceId = await getDeviceFingerprint();

    try {
        const response = await fetch(SESSION_VERIFY_URL, {
            method: "POST",
            credentials: "include", // Cookie'leri gönder (oturum için)
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                deviceId: deviceId,
                browserInfo: navigator.userAgent
            })
        });

        const result = await response.json();

        if (result.authenticated && result.isValid) {
            // Başarılı yanıtı cache'le
            result._cacheTime = Date.now();
            await storeSessionInfo(result);

            // Lisans bilgisini de kaydet
            if (result.license) {
                await storeLicenseInfo({
                    isValid: true,
                    licenseKey: result.license.licenseKey,
                    status: result.license.status,
                    expiresAt: result.license.expiresAt,
                    osgbId: result.license.osgbId,
                    osgbName: result.license.osgbName,
                    _cacheTime: Date.now()
                });
            }
        }

        return result;

    } catch (error) {
        console.error("Oturum doğrulama hatası:", error);

        // Offline durumda cached bilgiyi kullan (15 dakika geçerli)
        const cached = await getStoredSessionInfo();
        if (cached && cached.isValid) {
            const cacheTime = cached._cacheTime || 0;
            if (Date.now() - cacheTime < 15 * 60 * 1000) {
                return cached;
            }
        }

        return {
            authenticated: false,
            error: "NETWORK_ERROR",
            message: "Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin."
        };
    }
}

// Ana lisans kontrolü fonksiyonu (artık hibrit)
async function chrome_extension_checkPermissions(licenseKey = null) {
    // Hibrit doğrulama: önce oturum kontrolü
    const sessionResult = await verifyUserSession();

    // Oturum yoksa
    if (!sessionResult.authenticated) {
        return {
            isValid: false,
            error: sessionResult.error || "NOT_LOGGED_IN",
            message: sessionResult.message || "ISGPratik.com'a giriş yapmanız gerekiyor.",
            requiresLogin: true
        };
    }

    // Lisans yok
    if (!sessionResult.hasLicense) {
        return {
            isValid: false,
            error: "NO_LICENSE",
            message: "Aktif lisansınız bulunmuyor. ISGPratik.com'dan lisans alabilirsiniz.",
            requiresLicense: true
        };
    }

    // Lisans geçersiz (iptal, askıya alınmış, süresi dolmuş, max cihaz)
    if (!sessionResult.isValid) {
        return {
            isValid: false,
            error: sessionResult.error,
            message: sessionResult.message,
            devices: sessionResult.devices || null
        };
    }

    // Başarılı - lisans geçerli
    return {
        isValid: true,
        licenseKey: sessionResult.license?.licenseKey,
        status: sessionResult.license?.status,
        expiresAt: sessionResult.license?.expiresAt,
        osgbId: sessionResult.license?.osgbId,
        osgbName: sessionResult.license?.osgbName,
        deviceRegistered: sessionResult.license?.deviceRegistered,
        user: sessionResult.user
    };
}

// Manifest doğrulama
async function chrome_internal_validateManifest() {
    // Önce cached bilgiyi kontrol et
    const sessionInfo = await getStoredSessionInfo();
    if (sessionInfo && sessionInfo.isValid) {
        const cacheTime = sessionInfo._cacheTime || 0;
        // Cache 5 dakika geçerli
        if (Date.now() - cacheTime < 5 * 60 * 1000) {
            return true;
        }
    }

    // Cache geçersiz, yeni doğrulama yap
    const result = await chrome_extension_checkPermissions();
    return result.isValid === true;
}

// Aktif tab'ı al
async function getCurrentTab() {
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs && tabs.length > 0 && tabs[0].id && tabs[0].url && tabs[0].url.startsWith("https://isgkatip.csgb.gov.tr")) {
            return tabs[0];
        }
        return tabs && tabs.length > 0 && tabs[0].id ? tabs[0] : null;
    } catch (e) {
        return null;
    }
}

// Lisans hata mesajı göster
function showLicenseError(message, type = "license") {
    let existingError = document.getElementById("license-error-message");

    if (!existingError) {
        existingError = document.createElement("div");
        existingError.id = "license-error-message";
        existingError.className = type === "osgb-mismatch" ? "license-osgb-mismatch-error" :
            type === "login-required" ? "license-login-required" : "license-error-message";

        const mainMenu = document.getElementById("main-menu");
        if (mainMenu) {
            mainMenu.insertBefore(existingError, mainMenu.firstChild);
        }
    }

    existingError.textContent = message;
    existingError.style.display = "block";
}

// Giriş yapmanız gerekiyor mesajı göster
function showLoginRequired() {
    const mainMenu = document.getElementById("main-menu");
    if (!mainMenu) return;

    let loginBox = document.getElementById("login-required-box");
    if (loginBox) {
        loginBox.style.display = "block";
        return;
    }

    loginBox = document.createElement("div");
    loginBox.id = "login-required-box";
    loginBox.className = "login-required-box";
    loginBox.innerHTML = `
        <div class="login-icon">🔒</div>
        <h3>Giriş Yapmanız Gerekiyor</h3>
        <p>Bu eklentiyi kullanmak için ISGPratik.com hesabınızla giriş yapmanız gerekiyor.</p>
        <button id="goto-login-btn" class="login-btn">Giriş Yap</button>
        <p class="login-hint">Giriş yaptıktan sonra bu sayfayı yenileyin.</p>
    `;
    mainMenu.insertBefore(loginBox, mainMenu.firstChild);

    document.getElementById("goto-login-btn")?.addEventListener("click", () => {
        chrome.tabs.create({ url: "https://isgpratik.com/login" });
    });
}

// Giriş gerekli mesajını gizle
function hideLoginRequired() {
    const loginBox = document.getElementById("login-required-box");
    if (loginBox) {
        loginBox.style.display = "none";
    }
}

// Lisans hata mesajını gizle
function hideLicenseError() {
    const errorElement = document.getElementById("license-error-message");
    if (errorElement) {
        errorElement.style.display = "none";
    }
}

// Lisans anahtarı giriş modalı (sidepanel'de)
async function promptForLicenseInSidePanel() {
    return new Promise((resolve) => {
        // Kullanıcıdan lisans anahtarı iste
        const licenseKey = prompt("Lütfen lisans anahtarınızı girin:");
        resolve(licenseKey);
    });
}

export {
    getStoredLicenseInfo,
    getStoredSessionInfo,
    chrome_internal_validateManifest,
    showLicenseError,
    hideLicenseError,
    showLoginRequired,
    hideLoginRequired,
    chrome_extension_checkPermissions,
    verifyUserSession,
    storeLicenseInfo,
    storeSessionInfo,
    clearSessionInfo,
    getCurrentTab,
    getDeviceFingerprint
};