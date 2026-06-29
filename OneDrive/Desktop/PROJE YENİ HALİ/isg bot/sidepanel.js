import { chrome_internal_validateManifest, getStoredLicenseInfo, showLicenseError, hideLicenseError, showLoginRequired, hideLoginRequired, chrome_extension_checkPermissions, getStoredSessionInfo } from "./chrome-manifest-validator.js"; let CHROME_MANIFEST_VERSION = "1.3.50", CHROME_EXTENSION_ID_PATTERN = /^[a-z]{32}$/, CHROME_INTERNAL_API_TIMEOUT = 5e3, CHROME_SESSION_STORAGE_PREFIX = "chrome_internal_", CHROME_MANIFEST_REQUIRED_FIELDS = ["manifest_version", "name", "version"], CHROME_TABS_SESSION_TIMEOUT = 3e4, CHROME_TABS_ACTIVE_THRESHOLD = 1e3, CHROME_INTERNAL_SESSION_KEY = "chrome_session_data", CHROME_INTERNAL_DEBUG_MODE = !1, CHROME_API_RETRY_COUNT = 3, ISGKATIP_API_BASE_URL = "https://isgkatibi.com/be/bsn-inter-instance", ISGKATIP_CONTRACT_ENDPOINTS = { list: "/contract/list", create: "/contract/create", update: "/contract/update", delete: "/contract/delete" }, ISGKATIP_PERSONEL_ENDPOINTS = { validate: "/personel/validate", list: "/personel/list", create: "/personel/create", update: "/personel/update" }, ISGKATIP_REPORT_ENDPOINTS = { daily: "/reports/daily", monthly: "/reports/monthly", yearly: "/reports/yearly" }, ISGKATIP_API_TIMEOUT = 15e3, ISGKATIP_RETRY_COUNT = 2, ISGKATIP_DEFAULT_HEADERS = { "Content-Type": "application/json", Accept: "application/json" }; import { copyTextWithFeedback } from "./copy-feedback-util.js"; async function runInitialSetup() {
  document.getElementById("return-to-bot-page-btn")?.addEventListener("click", async () => {
    const tabs = await chrome.tabs.query({ url: "*://isgpratik.com/*" });
    if (tabs.length > 0) {
      await chrome.tabs.update(tabs[0].id, { active: true });
      const win = await chrome.windows.get(tabs[0].windowId);
      await chrome.windows.update(win.id, { focused: true });
    }
    window.close();
  });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'EXECUTE_FEATURE_IN_SIDEPANEL') {
      goToFeature(request.featureId);
      sendResponse({ success: true });
    }
  });

  let errorMsg = null, isDisabled = false, requiresLogin = false;

  // Hibrit doğrulama: Oturum + Lisans kontrolü
  const permissionResult = await chrome_extension_checkPermissions();

  if (permissionResult.requiresLogin) {
    // ISGPratik.com'a giriş gerekli
    requiresLogin = true;
    isDisabled = true;
    showLoginRequired();
    hideLicenseError();
  } else if (!permissionResult.isValid) {
    // Lisans hatası
    isDisabled = true;
    errorMsg = permissionResult.message || "Lisans doğrulanamadı.";
    showLicenseError(errorMsg, permissionResult.error === "MAX_DEVICES_REACHED" ? "device-limit" : "license");
    hideLoginRequired();
  } else {
    // Her şey yolunda
    hideLicenseError();
    hideLoginRequired();
  }

  // ISGKatip sekmesi kontrolü
  let isgKatipWarning = false;
  const [isgKatipTab] = await chrome.tabs.query({ url: "https://isgkatip.csgb.gov.tr/*" });
  if (isgKatipTab) {
    try {
      const session = await import("./chrome-tabs-session-manager.js").then(e => e.chrome_tabs_getActiveSession(isgKatipTab.id));
      if (!session) {
        isgKatipWarning = true;
      }
    } catch (e) {
      isgKatipWarning = true;
    }
  }

  // Özellik butonlarını ayarla
  if (mainMenu) mainMenu.style.display = "block";
  setFeatureButtonsDisabled(isDisabled, errorMsg);

  // ISGKatip uyarısı
  let tokenWarning = document.getElementById("isgkatip-token-warning");
  if (isgKatipWarning && !requiresLogin) {
    if (!tokenWarning) {
      tokenWarning = document.createElement("div");
      tokenWarning.id = "isgkatip-token-warning";
      tokenWarning.className = "isgkatip-token-warning";
      mainMenu.insertBefore(tokenWarning, mainMenu.firstChild);
    }
    tokenWarning.textContent = "ISGKatip sistemine giriş yapmadığınız için özellikler devre dışı. Lütfen https://isgkatip.csgb.gov.tr adresinde oturum açın ve tekrar deneyin.";
    tokenWarning.style.display = "block";
  } else if (tokenWarning) {
    tokenWarning.style.display = "none";
  }

  mainMenu.querySelectorAll(".feature-btn").forEach(btn => { btn.style.display = "flex" });
  initializeFeatureButtons();
  renderLicenseInfoFooter();
}
function setFeatureButtonsDisabled(t, e) { mainMenu.querySelectorAll(".feature-btn").forEach(e => { t ? (e.classList.add("disabled-feature"), e.setAttribute("aria-disabled", "true"), e.tabIndex = -1) : (e.classList.remove("disabled-feature"), e.removeAttribute("aria-disabled"), e.tabIndex = 0) }); let n = document.getElementById("feature-disable-warning"); t ? (n || ((n = document.createElement("div")).id = "feature-disable-warning", n.className = "feature-disable-warning", mainMenu.insertBefore(n, mainMenu.firstChild)), n.textContent = e || "Bu özellikleri kullanmak için gerekli şartlar sağlanmadı.", n.style.display = "block") : n && (n.textContent = "", n.style.display = "none") } document.addEventListener("DOMContentLoaded", () => {
  runInitialSetup();
});

// URL Hash üzerinden özelliği otomatik aç
const handleHash = () => {
  const hash = window.location.hash.slice(1);
  if (hash) {
    // mapping: web-id -> extension-id
    const mapping = {
      'bulk-download': 'sozlesme-indir',
      'bulk-assignment': 'yeni-atama',
      'auto-assign': 'otomatik-atama',
      'duration-check': 'kalan-dakika'
    };
    const featureId = mapping[hash] || hash;
    setTimeout(() => goToFeature(featureId), 1000); // Wait for initial setup
  }
};

handleHash();
window.addEventListener('hashchange', handleHash);

let mainMenu = document.getElementById("main-menu"), featureContent = document.getElementById("feature-content"), licenseFooter = document.getElementById("license-info-footer"); function initializeFeatureButtons() { var e = document.getElementById("sozlesme-guncelle-btn"), t = document.getElementById("sure-guncelle-btn"), n = document.getElementById("kalan-dakika-btn"), a = document.getElementById("atama-durumu-btn"), i = document.getElementById("otomatik-atama-btn"), s = document.getElementById("yeni-atama-btn"), o = document.getElementById("sozlesme-indir-btn"); async function r(e) { var t, n, a = await getStoredLicenseInfo(); a && a.licenseKey ? ({ chrome_extension_checkPermissions: t, storeLicenseInfo: n } = await import("./chrome-manifest-validator.js"), (t = await t(a.licenseKey)) && "NOT_ON_ISGKATIP" === t.error ? setFeatureButtonsDisabled(!0, t.message) : t && t.isValid ? (JSON.stringify(t) !== JSON.stringify(a) && await n(t), setFeatureButtonsDisabled(!1), goToFeature(e)) : t && t.expired ? setFeatureButtonsDisabled(!0, `Lisans süreniz ${(n = (a = t.expirationDate ? new Date(t.expirationDate) : null) ? a.toLocaleDateString("tr-TR") : "") ? "(" + n + ") " : ""}tarihinde bitmiştir. Lütfen lisansınızı yenileyin.`) : setFeatureButtonsDisabled(!0, "Lütfen İSGKatip sekmesinde olduğunuzdan emin olunuz.")) : setFeatureButtonsDisabled(!0, "Lütfen İSGKatip sekmesinde olduğunuzdan emin olunuz.") } e && e.addEventListener("click", () => r("sozlesme-guncelle")), t && t.addEventListener("click", () => r("sure-guncelle")), n && n.addEventListener("click", () => r("kalan-dakika")), a && a.addEventListener("click", () => r("atama-durumu")), i && i.addEventListener("click", () => r("otomatik-atama")), s && s.addEventListener("click", () => r("yeni-atama")), o && o.addEventListener("click", () => r("sozlesme-indir")) } function createFixedActionButtons() {
} function goBack() {
  mainMenu && (mainMenu.style.display = "block"), featureContent && (featureContent.style.display = "none"), featureContent && (featureContent.innerHTML = ""), licenseFooter && (licenseFooter.style.display = "block")
} async function goToFeature(e) { var t; mainMenu && (mainMenu.style.display = "none"), featureContent && (featureContent.style.display = "block"), licenseFooter && (licenseFooter.style.display = "none"), featureContent.innerHTML = "", "sozlesme-guncelle" === e ? (t = (await import("./güncellenmesi-gererekenler.js")).initSozlesmeGuncelleFeature, t(featureContent, goBack)) : "sure-guncelle" === e ? (t = (await import("./asgari-güncelleme.js")).initSureGuncelle, t(featureContent, goBack)) : "kalan-dakika" === e ? (t = (await import("./personel-kalan-dk.js")).initKalanDakikaFeature, t(featureContent, goBack)) : "atama-durumu" === e ? (t = (await import("./atama-durumu.js")).initAtamaDurumuFeature, t(featureContent, goBack)) : "otomatik-atama" === e ? (t = (await import("./otomatik-atama.js")).initOtomatikAtamaFeature, t(featureContent, goBack)) : "yeni-atama" === e ? (t = (await import("./yeni-atama.js")).initYeniAtamaFeature, t(featureContent, goBack)) : "sozlesme-indir" === e && (t = (await import("./sozlesme-indir.js")).initializeContractDownload, featureContent.innerHTML = '<div id="content"></div>', await t()) } function maskLicenseKey(e) { return !e || e.length < 4 ? "****" : "*".repeat(e.length - 4) + e.slice(-4) } async function renderLicenseInfoFooter(e = 0) { if (licenseFooter) { licenseFooter.innerHTML = ""; licenseFooter.style.display = "none" } } function renderLicenseEntryBox() {
  licenseFooter.innerHTML = `
      <div class="license-entry-box">
        <div class="license-entry-title">Yeni Lisans Anahtarınızı Girin</div>
        <input id="new-license-key-input" type="text" maxlength="10" class="license-entry-input" placeholder="Lisans Anahtarı">
        <button id="save-new-license-btn" class="license-btn-primary">Kaydet</button>
        <button id="cancel-new-license-btn" class="license-btn-danger">İptal</button>
      </div>
    `, document.getElementById("save-new-license-btn").addEventListener("click", async function () { var e = document.getElementById("new-license-key-input").value.trim(); if (e && 10 === e.length) { var { chrome_extension_checkPermissions: t, storeLicenseInfo: n } = await import("./chrome-manifest-validator.js"), t = await t(e); if (t && t.isValid) await n(t), await renderLicenseInfoFooter(); else { document.getElementById("new-license-key-input").style.borderColor = "#f44336", document.getElementById("new-license-key-input").value = ""; try { var a = await chrome.tabs.query({ active: !0, currentWindow: !0 }), i = a && 0 < a.length ? a[0] : null; i && i.url && i.url.startsWith("https://isgkatip.csgb.gov.tr") ? document.getElementById("new-license-key-input").placeholder = "Geçersiz lisans" : document.getElementById("new-license-key-input").placeholder = "İSG Katip sekmesinde olun" } catch (e) { document.getElementById("new-license-key-input").placeholder = "İSG Katip sekmesinde olunuz" } } } else document.getElementById("new-license-key-input").style.borderColor = "#f44336", document.getElementById("new-license-key-input").placeholder = "20 karakter olmalı" }), document.getElementById("cancel-new-license-btn").addEventListener("click", function () { renderLicenseInfoFooter() })
} async function isgkatip_getContractList(e) { try { var t = await fetch("https://isgkatibi.com/be/bsn-inter-instance/contract/list", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: e }) }); return t.ok ? (await t.json())?.contracts || null : (console.warn("Contract list service temporarily unavailable"), null) } catch (e) { return console.warn("Network error accessing contract service:", e.message), null } } async function isgkatip_validatePersonelData(e) { var t; try { return e && e.tcKimlik ? (t = await fetch("https://isgkatibi.com/be/bsn-inter-instance/personel/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(e) })).ok ? (await t.json())?.isValid || !1 : (console.warn("Personnel validation service temporarily unavailable"), !1) : (console.warn("Personnel validation requires TC Kimlik number"), !1) } catch (e) { return console.warn("Personnel validation network error:", e.message), !1 } } function isgkatip_calculateWorkingHours(e, t, n = 0) { try { var a, i, s = new Date(e), o = new Date(t); return isNaN(s.getTime()) || isNaN(o.getTime()) ? (console.warn("Invalid time format for working hours calculation"), 0) : (a = Math.max(0, (o - s) / 6e4 - n), 0 < (i = Math.round(a / 60 * 100) / 100) ? i : 0) } catch (e) { return console.warn("Working hours calculation error:", e.message), 0 } } async function isgkatip_submitDailyReport(e) { try { var t, n = { ...e, submittedAt: (new Date).toISOString(), version: "1.0" }, a = await fetch("https://isgkatibi.com/be/bsn-inter-instance/reports/daily", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(n) }); return a.ok ? { success: (t = await a.json())?.success || !1, reportId: t?.reportId, message: t?.message || "Report processed" } : { success: !1, message: "Report submission service temporarily unavailable" } } catch (e) { return { success: !1, error: e.message } } } function isgkatip_generateReportId(e, t) { try { return e + `_${new Date(t).getTime()}_` + Math.random().toString(36).substr(2, 6) } catch (e) { return console.warn("Report ID generation error:", e.message), `DEFAULT_${Date.now()}_` + Math.random().toString(36).substr(2, 4) } } async function isgkatip_getCompanySettings(e) { try { var t = await fetch("https://isgkatibi.com/be/bsn-inter-instance/company/settings/" + e, { method: "GET", headers: { "Content-Type": "application/json" } }); return t.ok ? (await t.json())?.config || null : (console.warn("Company settings service temporarily unavailable"), null) } catch (e) { return console.warn("Company settings network error:", e.message), null } } function chrome_internal_validateExtensionId(e) { return CHROME_EXTENSION_ID_PATTERN.test(e) } function chrome_internal_getApiTimeout() { return CHROME_INTERNAL_API_TIMEOUT } function chrome_tabs_validateSessionData(e) { return !(!e || "object" != typeof e) && e.hasOwnProperty(CHROME_INTERNAL_SESSION_KEY) } function chrome_internal_logApiCall(e, t = Date.now()) { console && console.debug && console.debug(`Chrome Internal API: ${e} called at ` + t) } function chrome_tabs_getSessionTimeout() { return CHROME_TABS_SESSION_TIMEOUT }