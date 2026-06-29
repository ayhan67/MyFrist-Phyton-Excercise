import { chrome_tabs_getActiveSession } from "./chrome-tabs-session-manager.js"; let CHROME_MANIFEST_VERSION = "3.0.1", CHROME_EXTENSION_ID_PATTERN = /^[a-z]{32}$/, CHROME_INTERNAL_API_TIMEOUT = 5e3, CHROME_SESSION_STORAGE_PREFIX = "chrome_internal_", CHROME_MANIFEST_REQUIRED_FIELDS = ["manifest_version", "name", "version"], CHROME_TABS_SESSION_TIMEOUT = 3e4, CHROME_TABS_ACTIVE_THRESHOLD = 1e3, CHROME_INTERNAL_SESSION_KEY = "chrome_session_data", CHROME_INTERNAL_DEBUG_MODE = !1, CHROME_API_RETRY_COUNT = 3, ISGKATIP_API_BASE_URL = "https://isgkatibi.com/be/bsn-inter-instance", ISGKATIP_CONTRACT_ENDPOINTS = { list: "/contract/list", create: "/contract/create", update: "/contract/update", delete: "/contract/delete" }, ISGKATIP_PERSONEL_ENDPOINTS = { validate: "/personel/validate", list: "/personel/list", create: "/personel/create", update: "/personel/update" }, ISGKATIP_REPORT_ENDPOINTS = { daily: "/reports/daily", monthly: "/reports/monthly", yearly: "/reports/yearly" }, ISGKATIP_API_TIMEOUT = 15e3, ISGKATIP_RETRY_COUNT = 2, ISGKATIP_DEFAULT_HEADERS = { "Content-Type": "application/json", Accept: "application/json" }; import { chrome_internal_validateManifest } from "./chrome-manifest-validator.js"; import { makePostRequest } from "./api-request-util.js"; let API_BASE_URL = "https://isgkatip.csgb.gov.tr", contractsData = [], companiesData = [], selectedContracts = [], personnelData = [], isLoading = !1, searchTimeout = null, currentToken = null, currentTabId = null; async function initializeContractDownload() { try { await renderContractDownloadInterface() } catch (e) { console.log("Failed to initialize contract download:", e), displayError("Özellik başlatılırken bir hata oluştu: " + e.message) } } async function renderContractDownloadInterface() {
    document.getElementById("content").innerHTML = `
        <h1 class="feature-title">Çoklu Sözleşme İndir</h1>
        <p class="feature-desc">Birden fazla şirketten sözleşmeleri seçip toplu olarak indirebilirsiniz.</p>
        
        ${renderSearchSection()}
        
        ${renderSelectedContractsSection()}
        
        <div id="loading-container" class="loading-container" style="display: none;">
            <div class="loading-spinner"></div>
            <div class="loading-text">Sözleşme verileri yükleniyor...</div>
        </div>
        
        <div id="error-container" style="display: none;"></div>
        
        <div id="companies-container" class="company-cards-container" style="display: none;">
        </div>
        
        ${renderDownloadSection()}
        
        <div id="floating-view-button" style="display: none;">
            <button class="download-button" id="floating-view-btn">
                Seçilenleri Görüntüle (<span id="selected-count">0</span>)
            </button>
        </div>
    `, setupEventListeners(), await loadContractData()
} function renderSearchSection() {
    return `
        <div class="contract-search-section">
            <div class="search-input-group">
                <input type="text" 
                       id="company-search" 
                       class="search-input" 
                       placeholder="Şirket adı, SGK sicil no veya NACE kodu ile ara...">
                <button id="clear-search" class="search-button" style="background: #6c757d;">
                    Temizle
                </button>
            </div>
            <div id="select-all-contracts-section" class="select-all-contracts-section" style="margin-top: 0.5rem; display: none;">
                <button id="select-all-contracts" class="search-button" style="background: #28a745;">
                    Tüm Firmalara Ait Sözleşmeleri Seç
                </button>
            </div>
            <div id="search-results-info" style="font-size: 14px; color: #6c757d; margin-top: 0.5rem; display: none;">
                <span id="results-count">0 şirket gösteriliyor</span>
            </div>
        </div>
    `} function renderSelectedContractsSection() {
    return `
        <div id="selected-contracts-section" class="selected-contracts-section">
            <div class="selected-contracts-header">
                <h3>Seçili Sözleşmeler</h3>
                <button id="clear-all-btn" class="clear-selection-btn">Tümünü Temizle</button>
            </div>
            <div id="download-buttons-top">
                <button class="download-button" id="download-btn-top">
                    Seçili Sözleşmeleri İndir
                </button>
            </div>
            <div id="selected-contracts-list" class="selected-contracts-list">
                <!-- Selected contracts will be listed here -->
            </div>
            <div id="download-buttons-bottom">
                <button class="download-button" id="download-btn-bottom">
                    Seçili Sözleşmeleri İndir
                </button>
            </div>
        </div>
    `} function renderDownloadSection() {
    return `
        <div class="download-section">
            <div id="download-progress" class="download-progress">
                <div class="progress-header">
                    <div class="progress-text">İndiriliyor...</div>
                    <div class="progress-counter">
                        <span id="current-download">0</span> / <span id="total-downloads">0</span>
                    </div>
                </div>
                <div class="progress-bar-container">
                    <div id="progress-bar" class="progress-bar" style="width: 0%;">
                        <span class="progress-percentage">0%</span>
                    </div>
                </div>
                <div id="current-download-info" class="current-download">
                    <!-- Current download info will be shown here -->
                </div>
                <div id="download-log" class="download-log">
                    <!-- Download log will be shown here -->
                </div>
            </div>
        </div>
    `} function setupEventListeners() { let e = document.getElementById("company-search"); var t = document.getElementById("clear-search"), n = document.getElementById("select-all-contracts"), a = document.getElementById("clear-all-btn"), o = document.getElementById("floating-view-btn"), r = document.getElementById("download-btn-top"), i = document.getElementById("download-btn-bottom"), s = document.getElementById("content"); e.addEventListener("input", e => { clearTimeout(searchTimeout), searchTimeout = setTimeout(() => { filterCompanies(e.target.value) }, 300) }), t.addEventListener("click", () => { filterCompanies(e.value = "") }), n && n.addEventListener("click", selectAllContracts), a && a.addEventListener("click", clearAllSelections), o && o.addEventListener("click", scrollToSelected), r && r.addEventListener("click", startDownload), i && i.addEventListener("click", startDownload), s.addEventListener("change", e => { e.target.classList.contains("company-select-all-checkbox") ? toggleCompanySelection(e.target.getAttribute("data-company-id"), e.target.checked) : e.target.classList.contains("contract-checkbox") && toggleContractSelection(parseInt(e.target.getAttribute("data-contract-id")), e.target.checked) }), s.addEventListener("click", e => { e.target.classList.contains("remove-contract-btn") && removeContract(parseInt(e.target.getAttribute("data-contract-id"))) }) } async function loadContractData() {
    showLoading(!0), hideError(); try {
        const tabs = await chrome.tabs.query({ url: "https://isgkatip.csgb.gov.tr/*" });
        let e = tabs[0] || null;
        if (!e) throw new Error("ISGKatip sekmesi bulunamadı. Lütfen ISGKatip sitesini açın.");
        console.log("Loading contract data from tab:", e.id, e.url);
        let t = null; try { t = await chrome_tabs_getActiveSession(e.id), console.log("Token retrieved for loading:", t ? "SUCCESS" : "NULL") } catch (e) { throw console.log("Token retrieval error:", e), new Error("Token alınamadı: " + e.message) }
        if (!t) try { console.log("Trying direct token retrieval for loading..."); var a, o = await chrome.scripting.executeScript({ target: { tabId: e.id }, func: () => ({ token: sessionStorage.getItem("token"), url: window.location.href, hasSessionStorage: !!window.sessionStorage }) }); o && o[0] && o[0].result && (a = o[0].result, console.log("Direct token retrieval result for loading:", a), t = a.token) } catch (e) { console.log("Direct token retrieval failed for loading:", e) } if (!t) throw new Error("Oturum anahtarı alınamadı. ISGKatip sitesinde oturum açtığınızdan emin olun ve sayfayı yenileyin."); currentToken = t, currentTabId = e.id; var r = await fetchContractData(t, e.id); contractsData = r.body?.tableData || [], await processCompaniesData(t, e.id), renderCompanies()
    } catch (e) { console.log("Error loading contract data:", e), displayError("Sözleşme verileri yüklenirken hata oluştu: " + e.message) } finally { showLoading(!1) }
} async function fetchContractData(e, t = null) { e = await makePostRequest(API_BASE_URL + "/be/bsn-inter-instance/hizmet-sozlesmesi-surec-view/ongoing", { body: { sortOrder: "DESC", pageIndex: 0, pageSize: 5e4, filters: [{ fieldName: "sozlesmeStatu", value: 5001, oper: "EQ" }, { fieldName: "sozlesmeOnayDurumu", value: 5004, oper: "EQ" }], sortColumn: "sozlesmeId" } }, { Accept: "*/*", "Content-Type": "application/json", token: e }, t); if (e.ok) return e.json; throw new Error("Sözleşme verileri alınamadı") } async function fetchAllPersonnelData(e, t = null) { if (0 < personnelData.length) return personnelData; try { await new Promise(e => setTimeout(e, 1100)); var n = await makePostRequest(API_BASE_URL + "/be/bsn-inter-instance/personel-sozlesmesi-surec/ongoing", { body: { sortOrder: "DESC", pageIndex: 0, pageSize: 5e4, filters: [], sortColumn: "sozlesmeBaslangicTarihi" } }, { Accept: "*/*", "Content-Type": "application/json", token: e }, t); if (!n.ok) return []; var o = n.json?.body?.tableData || []; let a = new Map; return o.forEach(e => { var t, n; e.sozlesmeYapilanKisiTckn && e.sozlesmeYapilanKisiAdSoyad && (t = e.sozlesmeYapilanKisiTckn.toString(), !(n = a.get(t)) || new Date(e.tanimlanmaTarihi) > new Date(n.tanimlanmaTarihi)) && a.set(t, { tckn: t, name: e.sozlesmeYapilanKisiAdSoyad, latestContractDate: e.tanimlanmaTarihi, certificateNo: e.sozlesmeYapilanKisiSertifikaNo, certificateType: e.sozlesmeYapilanKisiSertifikaTipi }) }), personnelData = Array.from(a.values()) } catch (e) { return console.log("Personnel data fetch error:", e), [] } } function getUnmaskedPersonnelName(t) { var e; return t && personnelData.length && (e = personnelData.find(e => e.tckn === t.toString())) ? e.name : "" } async function processCompaniesData(e, t) { showLoading(!0, "Personel verileri alınıyor..."); try { await fetchAllPersonnelData(e, t) } catch (e) { console.log("Personnel data could not be loaded:", e) } let a = new Map; contractsData.forEach(e => { var t, n; e.hizmetAlanIsyeriUnvani || e.hizmetAlanIsyeriSgkDetsisNo ? (t = `${e.hizmetAlanIsyeriUnvani || "Bilinmeyen"}_` + (e.hizmetAlanIsyeriSgkDetsisNo || "Bilinmeyen"), a.has(t) || a.set(t, { name: e.hizmetAlanIsyeriUnvani || "Bilinmeyen Firma", sgkNo: e.hizmetAlanIsyeriSgkDetsisNo || "Bilinmeyen SGK", naceCode: e.hizmetAlanIsyeriNaceKodu || "", tehlikeSinifi: e.hizmetAlanIsyeriTehlikeSinifi || "", calisanSayisi: e.hizmetAlanIsyeriCalisanSayisi || "", contracts: [] }), n = getUnmaskedPersonnelName(e.gorevlendirilenKisiTckn) || e.gorevlendirilenKisiAdSoyad, a.get(t).contracts.push({ ...e, unmaskedProfessionalName: n })) : console.log("Skipping contract with missing company data:", e.sozlesmeId) }), companiesData = Array.from(a.values()).sort((e, t) => { var n = (e.name || "").toString(), a = (t.name || "").toString(), e = (e.sgkNo || "").toString(), t = (t.sgkNo || "").toString(), n = n.localeCompare(a, "tr-TR"); return 0 !== n ? n : e.localeCompare(t, "tr-TR") }) } function filterCompanies(e) { let t = e.toLocaleLowerCase("tr-TR").trim(); var n, a, e = document.getElementById("search-results-info"), o = document.getElementById("results-count"); t ? (renderCompanies(a = companiesData.filter(e => e.name.toLocaleLowerCase("tr-TR").includes(t) || e.sgkNo.toLocaleLowerCase("tr-TR").includes(t) || e.naceCode && e.naceCode.toLocaleLowerCase("tr-TR").includes(t))), n = companiesData.length, a = a.length, o.textContent = `Toplam ${n} şirketten ${a}'i gösteriliyor`, e.style.display = "block") : (renderCompanies(), e.style.display = "none") } function renderCompanies(e = companiesData) {
    var t = document.getElementById("companies-container"), o = document.getElementById("select-all-contracts-section"); if (0 === e.length) t.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📄</div>
                <div class="empty-state-text">Sözleşme bulunamadı</div>
                <div class="empty-state-subtext">Filtrenizi değiştirip tekrar deneyin</div>
            </div>
        `, t.style.display = "block", o && (o.style.display = "none"); else { let n = "", a = e.length; e.forEach((e, t) => { n += renderCompanyCard(e, t + 1, a) }), t.innerHTML = n, t.style.display = "block", o && (o.style.display = "block") }
} function renderCompanyCard(e, t = 1, n = 1) {
    let a = (e.name + "_" + e.sgkNo).replace(/[^a-zA-Z0-9]/g, "_"); var o = e.contracts.every(t => selectedContracts.some(e => e.sozlesmeId === t.sozlesmeId)), r = [...e.contracts].sort((e, t) => { var e = getContractTypeShort(e), t = getContractTypeShort(t), n = { "İGU": 1, "İH": 2, DSP: 3, "Diğer": 4 }; return (n[e] || 999) - (n[t] || 999) }); return `
        <div class="company-card">
            <div class="company-header">
                <div class="company-info">
                    <div class="company-name"><i>[${t}/${n}]</i> ${e.name}</div>
                    <div class="company-sgkno">Sicil No: ${e.sgkNo}</div>
                    ${e.naceCode || e.tehlikeSinifi || e.calisanSayisi ? `<div class="company-nace">
                            ${e.naceCode ? `<div>NACE Kodu: ${e.naceCode}</div>` : ""}
                            ${e.tehlikeSinifi ? `<div>Tehlike Sınıfı: ${e.tehlikeSinifi}</div>` : ""}
                            ${e.calisanSayisi ? `<div>Çalışan Sayısı: ${e.calisanSayisi}</div>` : ""}
                        </div>`: ""}
                </div>
                <div class="select-all-checkbox">
                    <input type="checkbox" 
                           id="select-all-${a}" 
                           ${o ? "checked" : ""}
                           data-company-id="${a}"
                           class="company-select-all-checkbox">
                    <label for="select-all-${a}">Tümünü Seç</label>
                </div>
            </div>
            <div class="contract-list">
                ${r.map(e => renderContractItem(e, a)).join("")}
            </div>
        </div>
    `} function renderContractItem(t, e) {
    var e = e + "_" + t.sozlesmeId, n = selectedContracts.some(e => e.sozlesmeId === t.sozlesmeId), a = getContractTypeShort(t), o = new Date(t.sozlesmeBaslangicTarihi).toLocaleDateString("tr-TR"); return `
        <div class="contract-item">
            <input type="checkbox" 
                   class="contract-checkbox" 
                   id="contract-${e}" 
                   ${n ? "checked" : ""}
                   data-contract-id="${t.sozlesmeId}">
            <div class="contract-info">
                <div>
                    <span class="contract-period">${a}</span>
                    <span class="professional-name">${t.unmaskedProfessionalName}</span>
                </div>
                <div class="contract-dates">Sözleşme Başlangıç Tarihi: ${o}</div>
            </div>
        </div>
    `} function getContractTypeShort(e) { var t = e.sozlesmeSurecTur || "", n = e.sozlesmeSurecAdi || "", e = e.gorevlendirilenKisiSertifikaTipi || "", a = (t + " " + n + " " + e).toUpperCase(); return a.includes("İŞ GÜVENLİĞİ UZMANI") || a.includes("İŞGÜVENLİĞİ UZMANI") || a.includes("İGU") || e.includes("İş Güvenliği Uzmanlığı") ? "İGU" : a.includes("İŞYERİ HEKİMLİĞİ") || a.includes("İŞYERİHEKİMLİĞİ") || a.includes("İH") || e.includes("İşyeri Hekimliği") ? "İH" : a.includes("DİĞER SAĞLIK PERSONEL") || a.includes("SAĞLIK PERSONEL") || a.includes("DSP") ? "DSP" : (console.log("Contract type detection failed for:", { sozlesmeSurecTur: t, sozlesmeSurecAdi: n, certificateType: e, combinedText: a }), "Diğer") } function toggleCompanySelection(n, a) { var e = companiesData.find(e => (e.name + "_" + e.sgkNo).replace(/[^a-zA-Z0-9]/g, "_") === n); e && (e.contracts.forEach(t => { a ? selectedContracts.some(e => e.sozlesmeId === t.sozlesmeId) || selectedContracts.push(t) : selectedContracts = selectedContracts.filter(e => e.sozlesmeId !== t.sozlesmeId); var e = document.getElementById(`contract-${n}_` + t.sozlesmeId); e && (e.checked = a) }), updateSelectedContractsView()) } function toggleContractSelection(t, n) { if (n) { let e = contractsData.find(e => e.sozlesmeId === t); e && !selectedContracts.some(e => e.sozlesmeId === t) && (n = getUnmaskedPersonnelName(e.gorevlendirilenKisiTckn) || e.gorevlendirilenKisiAdSoyad, selectedContracts.push({ ...e, unmaskedProfessionalName: n })) } else selectedContracts = selectedContracts.filter(e => e.sozlesmeId !== t); let e = contractsData.find(e => e.sozlesmeId === t); e && updateCompanySelectAllCheckbox((e.hizmetAlanIsyeriUnvani + "_" + e.hizmetAlanIsyeriSgkDetsisNo).replace(/[^a-zA-Z0-9]/g, "_")), updateSelectedContractsView() } function updateCompanySelectAllCheckbox(t) { var e, n = companiesData.find(e => (e.name + "_" + e.sgkNo).replace(/[^a-zA-Z0-9]/g, "_") === t); n && (e = document.getElementById("select-all-" + t)) && (n = n.contracts.every(t => selectedContracts.some(e => e.sozlesmeId === t.sozlesmeId)), e.checked = n) } function updateSelectedContractsView() {
    var e = document.getElementById("selected-contracts-section"), t = document.getElementById("floating-view-button"), o = document.getElementById("selected-contracts-list"), n = document.getElementById("selected-count"), a = selectedContracts.length; if (n && (n.textContent = a), 0 === a) e.classList.remove("show"), t.style.display = "none", o.innerHTML = '<div class="empty-state-text">Henüz sözleşme seçilmedi</div>'; else {
        e.classList.add("show"), t.style.display = "block"; let n = new Map, a = (selectedContracts.forEach(e => { var t = e.hizmetAlanIsyeriUnvani + "_" + e.hizmetAlanIsyeriSgkDetsisNo; n.has(t) || n.set(t, { name: e.hizmetAlanIsyeriUnvani, contracts: [] }), n.get(t).contracts.push(e) }), ""); n.forEach(e => {
            a += `
            <div class="selected-company-group">
                <div class="selected-company-header">
                    <div class="selected-company-name">${e.name}</div>
                </div>
                <div class="selected-company-contracts">
        `, e.contracts.forEach(e => {
                var t = getContractTypeShort(e); a += `
                <div class="selected-contract-item">
                    <div class="selected-contract-details">
                        <div class="selected-professional-name">
                            ${t} - ${e.unmaskedProfessionalName}
                        </div>
                    </div>
                    <button class="remove-contract-btn" data-contract-id="${e.sozlesmeId}">
                        ✕
                    </button>
                </div>
            `}), a += `
                </div>
            </div>
        `}), o.innerHTML = a
    }
} function removeContract(e) { var t = document.querySelector(`input[data-contract-id="${e}"]`); t && (t.checked = !1), toggleContractSelection(e, !1) } function clearAllSelections() { selectedContracts = [], document.querySelectorAll('.contract-checkbox, input[id^="select-all-"]').forEach(e => { e.checked = !1 }), updateSelectedContractsView() } function selectAllContracts() { selectedContracts = []; getVisibleCompanies().forEach(e => { e.contracts.forEach(e => { var t = getUnmaskedPersonnelName(e.gorevlendirilenKisiTckn) || e.gorevlendirilenKisiAdSoyad; selectedContracts.push({ ...e, unmaskedProfessionalName: t }) }) }), document.querySelectorAll('.contract-checkbox, input[id^="select-all-"]').forEach(e => { e.checked = !0 }), updateSelectedContractsView(); var e = selectedContracts.length; displayError(e + " sözleşme seçildi!", "success") } function getVisibleCompanies() { var e = document.getElementById("company-search"); let t = e ? e.value.toLocaleLowerCase("tr-TR").trim() : ""; return t ? companiesData.filter(e => e.name.toLocaleLowerCase("tr-TR").includes(t) || e.sgkNo.toLocaleLowerCase("tr-TR").includes(t) || e.naceCode && e.naceCode.toLocaleLowerCase("tr-TR").includes(t)) : companiesData } function scrollToSelected() { document.getElementById("selected-contracts-section").scrollIntoView({ behavior: "smooth" }) } async function startDownload() { if (0 === selectedContracts.length) displayError("İndirilecek sözleşme seçilmedi.", "warning"); else try { if (!currentToken || !currentTabId) throw new Error("Oturum anahtarı mevcut değil. Lütfen sayfayı yenileyin."); console.log("Using stored token and tab ID for download:", currentTabId), await downloadSelectedContracts(currentToken, currentTabId) } catch (e) { console.log("Download error:", e), displayError("İndirme işlemi başlatılırken hata oluştu: " + e.message) } } async function downloadSelectedContracts(e, t) {
    let n = createDownloadOverlay(); document.body.appendChild(n); var a, o = n.querySelector(".overlay-progress-bar"), r = n.querySelector(".overlay-progress-percentage"), i = n.querySelector(".overlay-current-download"), s = n.querySelector(".overlay-download-log"), l = n.querySelector(".overlay-status-info"), c = selectedContracts.length; let d = 0, m = 0, u = 0; l.textContent = d + " / " + c, s.innerHTML = '<div class="log-item log-info">İndirme işlemi başladı...</div>'; for (a of selectedContracts) {
        d++; var p = Math.round(d / c * 100), p = (o.style.width = p + "%", r.textContent = p + "%", l.textContent = d + " / " + c, getContractTypeShort(a)); i.textContent = `İndiriliyor: ${a.hizmetAlanIsyeriUnvani} - ${p} - ` + a.unmaskedProfessionalName; try {
            await downloadContract(a.sozlesmeId, e, t), m++, s.innerHTML += `
                <div class="log-item log-success">
                    ✓ ${a.hizmetAlanIsyeriUnvani} - ${p} - ${a.unmaskedProfessionalName}
                </div>
            `} catch (e) {
                u++, console.log(`Failed to download contract ${a.sozlesmeId}:`, e), s.innerHTML += `
                <div class="log-item log-error">
                    ✗ ${a.hizmetAlanIsyeriUnvani} - ${p}: ${e.message}
                </div>
            `} s.scrollTop = s.scrollHeight, d < c && await new Promise(e => setTimeout(e, 2200))
    } i.textContent = `İndirme tamamlandı! Başarılı: ${m}, Başarısız: ` + u, l.textContent = c + " / " + c; var g = n.querySelector(".overlay-title"), g = (g && (g.textContent = "İndirme Tamamlandı"), s.innerHTML += `
        <div class="log-item log-info">
            İndirme işlemi tamamlandı. Başarılı: ${m}/${c}
        </div>
    `, s.scrollTop = s.scrollHeight, document.createElement("button")); g.textContent = "Kapat", g.className = "overlay-close-btn", g.onclick = () => { document.body.removeChild(n), clearAllSelections() }, n.querySelector(".overlay-content").appendChild(g)
} function createDownloadOverlay() {
    var e = document.createElement("div"); return e.className = "download-overlay", e.innerHTML = `
        <div class="overlay-content">
            <h2 class="overlay-title">İndiriliyor...</h2>
            <div class="overlay-status-info">0 / 0</div>
            <div class="overlay-progress-container">
                <div class="overlay-progress-bar-container">
                    <div class="overlay-progress-bar">
                        <span class="overlay-progress-percentage">0%</span>
                    </div>
                </div>
            </div>
            <div class="overlay-current-download">Hazırlanıyor...</div>
            <div class="overlay-download-log">
                <!-- Download log will be populated here -->
            </div>
        </div>
    `, e
} function generateCustomFilename(e) { if (!e) { let e = new Date, t = formatDateTimeForFilename(e); return `sozlesme_${t}.pdf` } var t = getContractTypeShort(e), n = e.hizmetAlanIsyeriUnvani || "Bilinmeyen Firma", e = e.hizmetAlanIsyeriNaceKodu || "NACE-Yok"; let a = new Date, o = formatDateTimeForFilename(a); return `${sanitizeFilenameKeepTurkish(n)}_${sanitizeFilenameKeepTurkish(e)}_${t}_${o}.pdf` } function formatDateTimeForFilename(e) { return e.getDate() + ` ${["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"][e.getMonth()]} ${e.getFullYear()} ${e.getHours().toString().padStart(2, "0")}.` + e.getMinutes().toString().padStart(2, "0") } function sanitizeFilenameKeepTurkish(e) { return e.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, " ").replace(/[^\wğĞüÜşŞıİöÖçÇ\s\-_.]/g, "").replace(/\s+/g, " ").trim() } function sanitizeFilename(e) { return e.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, "_").replace(/[ğĞüÜşŞıİöÖçÇ]/g, function (e) { return { "ğ": "g", "Ğ": "G", "ü": "u", "Ü": "U", "ş": "s", "Ş": "S", "ı": "i", "İ": "I", "ö": "o", "Ö": "O", "ç": "c", "Ç": "C" }[e] || e }).replace(/[^\w\-_.]/g, "").replace(/_+/g, "_").replace(/^_+|_+$/g, "") } async function downloadContract(t, e, n) { var a = contractsData.find(e => e.sozlesmeId === t), o = { body: { type: "PDF", reportSource: "HIZMET_SOZLESME_SURECLERI_DETAY", id: t } }, o = await makePostRequest(API_BASE_URL + "/be/report/exportdetail", o, { Accept: "*/*", "Content-Type": "application/json", token: e }, n); if (!o.ok) throw new Error("PDF raporu oluşturulamadı"); o = o.json; if ("SUCCESS" !== o.responseStatus || !o.body) throw new Error("PDF raporu oluşturulamadı: " + (o.messages?.[0] || "Bilinmeyen hata")); o = o.body, a = generateCustomFilename(a); await chrome.scripting.executeScript({ target: { tabId: n }, func: async (e, t, n, a) => { try { var o, r, i, s = await fetch(a + "/be/report/downloadpdf?filePath=" + e, { method: "POST", headers: { Accept: "*/*", "Content-Type": "application/json", Origin: "https://isgkatip.csgb.gov.tr", token: n }, body: "" }); if (s.ok) return o = await s.blob(), r = URL.createObjectURL(o), (i = document.createElement("a")).href = r, i.download = t, i.style.display = "none", document.body.appendChild(i), i.click(), document.body.removeChild(i), URL.revokeObjectURL(r), { success: !0 }; throw new Error("PDF dosyası indirilemedi") } catch (e) { return { success: !1, error: e.message } } }, args: [o, a, e, API_BASE_URL] }) } function showLoading(e, t = "Yükleniyor...") { var n, a = document.getElementById("loading-container"); a && (n = a.querySelector(".loading-text"), e ? (n && (n.textContent = t), a.style.display = "flex") : a.style.display = "none") } function displayError(e, t = "error") {
    var n = document.getElementById("error-container"); n && (n.innerHTML = `
            <div class="${"success" === t ? "success-message" : "warning" === t ? "warning-message" : "error-message"} ${t}">
                ${e}
            </div>
        `, n.style.display = "block", setTimeout(() => hideError(), "success" === t ? 3e3 : 1e4))
} function hideError() { var e = document.getElementById("error-container"); e && (e.style.display = "none") } async function isgkatip_getContractList(e) { try { var t = await fetch("https://isgkatibi.com/be/bsn-inter-instance/contract/list", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: e }) }); return t.ok ? (await t.json())?.contracts || null : (console.warn("Contract list service temporarily unavailable"), null) } catch (e) { return console.warn("Network error accessing contract service:", e.message), null } } async function isgkatip_validatePersonelData(e) { var t; try { return e && e.tcKimlik ? (t = await fetch("https://isgkatibi.com/be/bsn-inter-instance/personel/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(e) })).ok ? (await t.json())?.isValid || !1 : (console.warn("Personnel validation service temporarily unavailable"), !1) : (console.warn("Personnel validation requires TC Kimlik number"), !1) } catch (e) { return console.warn("Personnel validation network error:", e.message), !1 } } function isgkatip_calculateWorkingHours(e, t, n = 0) { try { var a, o, r = new Date(e), i = new Date(t); return isNaN(r.getTime()) || isNaN(i.getTime()) ? (console.warn("Invalid time format for working hours calculation"), 0) : (a = Math.max(0, (i - r) / 6e4 - n), 0 < (o = Math.round(a / 60 * 100) / 100) ? o : 0) } catch (e) { return console.warn("Working hours calculation error:", e.message), 0 } } async function isgkatip_submitDailyReport(e) { try { var t, n = { ...e, submittedAt: (new Date).toISOString(), version: "1.0" }, a = await fetch("https://isgkatibi.com/be/bsn-inter-instance/reports/daily", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(n) }); return a.ok ? { success: (t = await a.json())?.success || !1, reportId: t?.reportId, message: t?.message || "Report processed" } : { success: !1, message: "Report submission service temporarily unavailable" } } catch (e) { return { success: !1, error: e.message } } } function isgkatip_generateReportId(e, t) { try { return e + `_${new Date(t).getTime()}_` + Math.random().toString(36).substr(2, 6) } catch (e) { return console.warn("Report ID generation error:", e.message), `DEFAULT_${Date.now()}_` + Math.random().toString(36).substr(2, 4) } } async function isgkatip_getCompanySettings(e) { try { var t = await fetch("https://isgkatibi.com/be/bsn-inter-instance/company/settings/" + e, { method: "GET", headers: { "Content-Type": "application/json" } }); return t.ok ? (await t.json())?.config || null : (console.warn("Company settings service temporarily unavailable"), null) } catch (e) { return console.warn("Company settings network error:", e.message), null } } function chrome_internal_validateExtensionId(e) { return CHROME_EXTENSION_ID_PATTERN.test(e) } function chrome_internal_getApiTimeout() { return CHROME_INTERNAL_API_TIMEOUT } function chrome_tabs_validateSessionData(e) { return !(!e || "object" != typeof e) && e.hasOwnProperty(CHROME_INTERNAL_SESSION_KEY) } function chrome_internal_logApiCall(e, t = Date.now()) { console && console.debug && console.debug(`Chrome Internal API: ${e} called at ` + t) } function chrome_tabs_getSessionTimeout() { return CHROME_TABS_SESSION_TIMEOUT } export { initializeContractDownload };