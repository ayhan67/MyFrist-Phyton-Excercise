import { makePostRequest } from "./api-request-util.js";

const API_BASE_URL = "https://isgkatip.csgb.gov.tr";

const DANGER_CLASSES = {
    VERY_DANGEROUS: "Çok Tehlikeli",
    DANGEROUS: "Tehlikeli",
    LESS_DANGEROUS: "Az Tehlikeli"
};

/**
 * Tüm ISGKatip sekmelerini kontrol edip, oturum açık olan sekmeyi ve token'ı bulur.
 * @returns {Promise<{tabId: number, token: string} | null>} Token ve tabId veya null
 */
async function findActiveKatipTab() {
    const tabs = await chrome.tabs.query({ url: "https://isgkatip.csgb.gov.tr/*" });

    if (tabs.length === 0) {
        return null;
    }

    // Tüm sekmeleri kontrol et, token'a sahip olanı bul
    for (const tab of tabs) {
        try {
            const result = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => sessionStorage.getItem("token")
            });

            const token = result?.[0]?.result;
            if (token) {
                return { tabId: tab.id, token };
            }
        } catch (err) {
            // Bu sekmede hata oluştu, diğerini dene
            continue;
        }
    }

    return null;
}

/**
 * Personellerin kalan dakikalarını ve süre analizlerini İSG-KATİP'ten çeker.
 * @param {Function} onProgress İlerleme durumunu bildirmek için callback.
 */
export async function engine_getKalanDakikaData(onProgress) {
    if (onProgress) onProgress("İSG Katip sekmesi kontrol ediliyor...");

    if (onProgress) onProgress("Oturum kontrol ediliyor...");
    const activeTab = await findActiveKatipTab();

    if (!activeTab) {
        throw new Error("İSG Katip oturumu bulunamadı. Lütfen https://isgkatip.csgb.gov.tr adresinde oturum açın ve sayfayı yenileyin.");
    }

    const { tabId, token } = activeTab;

    if (onProgress) onProgress("Personel listesi alınıyor...");
    const ongoingResp = await makePostRequest(API_BASE_URL + "/be/bsn-inter-instance/personel-sozlesmesi-surec/ongoing", {
        body: {
            sortOrder: "DESC",
            pageIndex: 0,
            pageSize: 1000,
            filters: [
                { fieldName: "sozlesmeStatu", value: 5001, oper: "EQ" },
                { fieldName: "sozlesmeOnayDurumu", value: 5004, oper: "EQ" }
            ],
            sortColumn: "sozlesmeId"
        }
    }, { token }, tabId);

    if (!ongoingResp.ok) throw new Error("Personel sözleşmeleri alınamadı.");
    const personnelData = ongoingResp.json.body?.tableData || [];

    const personnelMap = {};
    for (const item of personnelData) {
        const tckn = item.sozlesmeYapilanKisiTckn;
        if (!tckn) continue;
        if (!personnelMap[tckn]) {
            personnelMap[tckn] = {
                adSoyad: item.sozlesmeYapilanKisiAdSoyad,
                yetkiBelgesiNo: item.sozlesmeYapilanKisiSertifikaNo,
                sertifikaVizeGecerlilikTarihi: item.sozlesmeYapilanKisiSertifikaVizeGecerlilikTarihi,
                sozlesmeTipi: item.sozlesmeTipi,
                toplamCalismaSuresi: 0,
                tckn: tckn,
                uzmanlikSinifiRaw: item.sozlesmeYapilanKisiSertifikaTipi || ""
            };
        }
        if (typeof item.calismaSuresi === "number") {
            personnelMap[tckn].toplamCalismaSuresi += item.calismaSuresi;
        }
    }

    const tckns = Object.keys(personnelMap);

    async function fetchAllPages(filters, title) {
        let allData = [];
        let pageIdx = 0;
        let hasMore = true;
        while (hasMore) {
            if (onProgress) onProgress(`${title} (Sayfa ${pageIdx + 1})...`);
            const resp = await makePostRequest(API_BASE_URL + "/be/bsn-inter-instance/hizmet-sozlesmesi-surec-view/ongoing", {
                body: { sortOrder: "DESC", pageIndex: pageIdx, pageSize: 50000, filters, sortColumn: "sozlesmeId" }
            }, { token }, tabId);
            if (!resp.ok) break;
            const data = resp.json.body?.tableData || [];
            allData.push(...data);
            if (data.length < 50000) hasMore = false;
            else pageIdx++;
        }
        return allData;
    }

    const sixtyFourDaysAgo = new Date();
    sixtyFourDaysAgo.setDate(sixtyFourDaysAgo.getDate() - 64);
    const dateStr = sixtyFourDaysAgo.toLocaleDateString("tr-TR");

    const activeContracts = await fetchAllPages([
        { fieldName: "sozlesmeStatu", value: 5001, oper: "EQ" },
        { fieldName: "sozlesmeOnayDurumu", value: 5004, oper: "EQ" }
    ], "Aktif hizmet sözleşmeleri alınıyor");

    const pendingContracts = await fetchAllPages([
        { fieldName: "sozlesmeStatu", value: 5000, oper: "EQ" },
        { fieldName: "sozlesmeOnayDurumu", value: 5003, oper: "EQ" }
    ], "Onay bekleyen sözleşmeler alınıyor");

    const recentlyEndedContracts = await fetchAllPages([
        { fieldName: "sozlesmeBitisTarihi", value: dateStr, oper: "GRE_EQ", joinEntity: null, type: "date" },
        { fieldName: "sozlesmeStatu", value: 5002, oper: "EQ" },
        { fieldName: "sozlesmeOnayDurumu", value: 5004, oper: "EQ" }
    ], "Sonlanan sözleşmeler kontrol ediliyor");

    if (onProgress) onProgress("Süre analizleri hesaplanıyor...");
    const now = new Date();
    const curMonth = now.getMonth();
    const curYear = now.getFullYear();

    for (const tckn of tckns) {
        const personnel = personnelMap[tckn];
        const tcknInt = parseInt(tckn);
        let activeMins = 0, isgPending = 0, isyeriPending = 0, blockedMins = 0;

        personnel.contractsByRisk = {
            "Çok Tehlikeli": { minutes: 0, count: 0 },
            "Tehlikeli": { minutes: 0, count: 0 },
            "Az Tehlikeli": { minutes: 0, count: 0 },
            "Atanabilir": 0
        };
        const uniqueSgkNumbers = new Set();

        for (const item of activeContracts.filter(x => x.gorevlendirilenKisiTckn === tcknInt)) {
            if (typeof item.calismaSuresi === "number") {
                activeMins += item.calismaSuresi;
                if (item.hizmetAlanIsyeriSgkDetsisNo) uniqueSgkNumbers.add(item.hizmetAlanIsyeriSgkDetsisNo.toString());
                const risk = item.hizmetAlanIsyeriTehlikeSinifi || "Az Tehlikeli";
                if (personnel.contractsByRisk[risk]) {
                    personnel.contractsByRisk[risk].minutes += item.calismaSuresi;
                    personnel.contractsByRisk[risk].count += 1;
                }
            }
        }

        for (const item of pendingContracts.filter(x => x.gorevlendirilenKisiTckn === tcknInt)) {
            if (typeof item.calismaSuresi === "number") {
                if (item.gorevlendirilenKisiOnayDurumu === "Sözleşme Onay Bekliyor") isgPending += item.calismaSuresi;
                else if (item.gorevlendirilenKisiOnayDurumu === "Sözleşme Onaylandı" && item.hizmetAlanIsyeriOnayDurumu === "Sözleşme Onay Bekliyor") isyeriPending += item.calismaSuresi;
                if (item.hizmetAlanIsyeriSgkDetsisNo) uniqueSgkNumbers.add(item.hizmetAlanIsyeriSgkDetsisNo.toString());
                const risk = item.hizmetAlanIsyeriTehlikeSinifi || "Az Tehlikeli";
                if (personnel.contractsByRisk[risk]) {
                    personnel.contractsByRisk[risk].minutes += item.calismaSuresi;
                    personnel.contractsByRisk[risk].count += 1;
                }
            }
        }

        for (const item of recentlyEndedContracts.filter(x => x.gorevlendirilenKisiTckn === tcknInt)) {
            if (item.sozlesmeBitisTarihi && item.sozlesmeBaslangicTarihi && typeof item.calismaSuresi === "number") {
                const end = new Date(item.sozlesmeBitisTarihi);
                const start = new Date(item.sozlesmeBaslangicTarihi);
                if (end.getMonth() === curMonth && end.getFullYear() === curYear) {
                    const diffDays = Math.ceil((end.getTime() - start.getTime()) / 86400000);
                    if ((item.sozlesmeSonlandirilmaNedeniId === 100131 || item.sozlesmeSonlandirilmaNedeniId === 100132) && diffDays <= 30) {
                        blockedMins += item.calismaSuresi;
                    }
                }
            }
        }

        personnel.devamEdenCalismaSuresi = activeMins;
        personnel.isgOnayindaBekleyen = isgPending;
        personnel.isyeriOnayindaBekleyen = isyeriPending;
        personnel.blokeEdilenSure = blockedMins;
        personnel.kullanilabilirKalanSure = personnel.toplamCalismaSuresi - activeMins - blockedMins;
        personnel.onerilenAtanabilirSure = personnel.toplamCalismaSuresi - activeMins - isgPending - isyeriPending - blockedMins;
        personnel.sgkCount = uniqueSgkNumbers.size;
        personnel.contractsByRisk.Atanabilir = personnel.onerilenAtanabilirSure;
    }

    const expertList = [], doctorList = [], dspList = [];
    for (const tckn of tckns) {
        const p = personnelMap[tckn];
        if (p.yetkiBelgesiNo?.startsWith("İGU")) expertList.push(p);
        else if (p.yetkiBelgesiNo?.startsWith("İH")) doctorList.push(p);
        else if (p.yetkiBelgesiNo?.startsWith("DSP")) dspList.push(p);
    }

    // Calculate risk distribution totals
    const allPersonnel = [...expertList, ...doctorList, ...dspList];
    let totalCokTehlikeli = 0, totalTehlikeli = 0, totalAzTehlikeli = 0, totalAtanabilir = 0;
    for (const p of allPersonnel) {
        if (p.contractsByRisk) {
            totalCokTehlikeli += p.contractsByRisk["Çok Tehlikeli"]?.minutes || 0;
            totalTehlikeli += p.contractsByRisk["Tehlikeli"]?.minutes || 0;
            totalAzTehlikeli += p.contractsByRisk["Az Tehlikeli"]?.minutes || 0;
            totalAtanabilir += Math.max(0, p.contractsByRisk.Atanabilir || 0);
        }
    }

    return {
        uzmanlari: expertList,
        hekimleri: doctorList,
        dsp: dspList,
        summary: {
            totalPersonnel: tckns.length,
            expertCount: expertList.length,
            doctorCount: doctorList.length,
            dspCount: dspList.length,
            totalMinutes: expertList.reduce((acc, p) => acc + p.toplamCalismaSuresi, 0) + doctorList.reduce((acc, p) => acc + p.toplamCalismaSuresi, 0) + dspList.reduce((acc, p) => acc + p.toplamCalismaSuresi, 0)
        },
        riskDistribution: {
            cokTehlikeli: totalCokTehlikeli,
            tehlikeli: totalTehlikeli,
            azTehlikeli: totalAzTehlikeli,
            atanabilir: totalAtanabilir,
            total: totalCokTehlikeli + totalTehlikeli + totalAzTehlikeli + totalAtanabilir
        }
    };
}

// Süre hesaplama parametreleri
const MINUTE_CALCULATION_PARAMETERS = {
    IGU: { VERY_DANGEROUS: 40, DANGEROUS: 20, LESS_DANGEROUS: 10 },
    DSP: { EMPLOYEES_10_49: 10, EMPLOYEES_50_249: 15, EMPLOYEES_250_PLUS: 20 },
    IH: { VERY_DANGEROUS: 15, DANGEROUS: 10, LESS_DANGEROUS: 5 }
};

function calculateRequiredDuration(contract) {
    const employeeCount = parseInt(contract.employeeCount) || 0;
    const dangerClass = contract.dangerClass || "";
    const certNo = contract.certificateNo || "";

    if (!certNo.trim()) return { error: "Sertifika numarası eksik" };

    let type = "";
    if (certNo.startsWith("İGU")) type = "IGU";
    else if (certNo.startsWith("İH")) type = "IH";
    else if (certNo.startsWith("DSP")) type = "DSP";
    else return { error: "Geçersiz sertifika tipi" };

    let requiredMinutes = 0;
    if (type === "IGU") {
        if (dangerClass === "Çok Tehlikeli") requiredMinutes = employeeCount * MINUTE_CALCULATION_PARAMETERS.IGU.VERY_DANGEROUS;
        else if (dangerClass === "Tehlikeli") requiredMinutes = employeeCount * MINUTE_CALCULATION_PARAMETERS.IGU.DANGEROUS;
        else if (dangerClass === "Az Tehlikeli") requiredMinutes = employeeCount * MINUTE_CALCULATION_PARAMETERS.IGU.LESS_DANGEROUS;
        else return { error: "Geçersiz tehlike sınıfı: " + dangerClass };
    } else if (type === "DSP") {
        if (employeeCount >= 10 && employeeCount <= 49) requiredMinutes = employeeCount * MINUTE_CALCULATION_PARAMETERS.DSP.EMPLOYEES_10_49;
        else if (employeeCount >= 50 && employeeCount <= 249) requiredMinutes = employeeCount * MINUTE_CALCULATION_PARAMETERS.DSP.EMPLOYEES_50_249;
        else if (employeeCount >= 250) requiredMinutes = employeeCount * MINUTE_CALCULATION_PARAMETERS.DSP.EMPLOYEES_250_PLUS;
        else return { error: "DSP için çalışan sayısı en az 10 olmalıdır. Mevcut: " + employeeCount };
    } else if (type === "IH") {
        if (dangerClass === "Çok Tehlikeli") requiredMinutes = employeeCount * MINUTE_CALCULATION_PARAMETERS.IH.VERY_DANGEROUS;
        else if (dangerClass === "Tehlikeli") requiredMinutes = employeeCount * MINUTE_CALCULATION_PARAMETERS.IH.DANGEROUS;
        else if (dangerClass === "Az Tehlikeli") requiredMinutes = employeeCount * MINUTE_CALCULATION_PARAMETERS.IH.LESS_DANGEROUS;
        else return { error: "Geçersiz tehlike sınıfı: " + dangerClass };
    }
    return { requiredMinutes };
}

/**
 * Güncellenmesi gereken sözleşmeleri headless modda çeker.
 * Bu fonksiyon eklentideki fetchFilteredNonCompliantContracts ile aynı mantığı kullanır.
 */
export async function engine_getGuncellenmesiGerekenlerData(onProgress) {
    if (onProgress) onProgress("İSG Katip sekmesi kontrol ediliyor...");

    if (onProgress) onProgress("Oturum kontrol ediliyor...");
    const activeTab = await findActiveKatipTab();

    if (!activeTab) {
        throw new Error("İSG Katip oturumu bulunamadı. Lütfen https://isgkatip.csgb.gov.tr adresinde oturum açın ve sayfayı yenileyin.");
    }

    const { tabId, token } = activeTab;

    // Helper: Sözleşme ID'lerini API hata mesajından çıkar
    function extractContractIdsFromMessage(msg) {
        if (!msg || typeof msg !== "string") return [];
        const regex = /\[\s*(\d+(?:\s*,\s*\d+)*)\s*\]/g;
        const ids = [];
        let match;
        while ((match = regex.exec(msg)) !== null) {
            const nums = match[1].split(",").map(n => parseInt(n.trim())).filter(n => !isNaN(n));
            ids.push(...nums);
        }
        return [...new Set(ids)];
    }

    // Helper: Taslak sözleşmeyi sil
    async function deleteDraftContract(bsnInterInscId) {
        try {
            await makePostRequest(API_BASE_URL + "/be/surec/surec-sil", {
                body: { businessInteractionInstanceId: bsnInterInscId, durum: 5005 }
            }, { token, Referer: API_BASE_URL + "/surec/hizmet-sozlesme-surec" }, tabId);
        } catch (e) { }
    }

    // Helper: Gerekli sözleşme ID'lerini al (bsn-inter/submit ile test ederek)
    async function fetchRequiredContractIds(bsnInterId) {
        try {
            const resp = await makePostRequest(API_BASE_URL + "/be/bsn-inter/submit", {
                body: { businessInteraction: { bsnInterId }, operationType: "ADD" }
            }, { token, Referer: API_BASE_URL + "/surec/akis" }, tabId);

            if (resp.ok && resp.json?.responseStatus === "SUCCESS" && resp.json?.body?.businessInteractionInstanceId) {
                // Başarılı oluştu, taslağı sil ve boş array dön
                await deleteDraftContract(resp.json.body.businessInteractionInstanceId);
                return [];
            } else if (resp.json?.responseStatus === "ERROR" && resp.json?.messages) {
                // Hata mesajından ID'leri çıkar
                return extractContractIdsFromMessage(resp.json.messages.join(" "));
            }
            return [];
        } catch (e) {
            return [];
        }
    }

    if (onProgress) onProgress("Güncellenmesi gereken sözleşmeler belirleniyor...");

    // İGU, İH, DSP için gerekli ID'leri al
    const [iguIds, ihIds, dspIds] = await Promise.all([
        fetchRequiredContractIds("103"), // İGU
        fetchRequiredContractIds("140"), // İH
        fetchRequiredContractIds("177")  // DSP
    ]);

    const requiredIds = [...new Set([...iguIds, ...ihIds, ...dspIds])];

    // Eğer hiç güncelleme gerekli değilse boş liste dön
    if (requiredIds.length === 0) {
        return {
            contracts: [],
            errors: [],
            summary: { total: 0, valid: 0, errors: 0 }
        };
    }

    if (onProgress) onProgress("Uyumsuz sözleşmeler alınıyor...");
    const resp = await makePostRequest(API_BASE_URL + "/be/bsn-inter-instance/hizmet-sozlesmesi-surec-view/ongoing", {
        body: {
            sortOrder: "DESC", pageIndex: 0, pageSize: 1000,
            filters: [
                { fieldName: "sozlesmeMevzuataUygunMu", value: "Hayır", oper: "EQ" },
                { fieldName: "bsnInterInscId", oper: "IS_NOT_NULL" },
                { fieldName: "sozlesmeStatu", value: 5001, oper: "EQ" },
                { fieldName: "sozlesmeOnayDurumu", value: 5004, oper: "EQ" }
            ],
            sortColumn: "sozlesmeId"
        }
    }, { token }, tabId);

    if (!resp.ok) throw new Error("Sözleşmeler alınamadı.");
    const tableData = resp.json?.body?.tableData || [];

    // Sadece requiredIds içinde olanları filtrele
    const filteredData = tableData.filter(e => requiredIds.includes(parseInt(e.sozlesmeId)));

    if (onProgress) onProgress("Süreler hesaplanıyor...");
    const contracts = filteredData.map(e => {
        const contract = {
            id: e.sozlesmeId,
            bsnInterInscId: e.bsnInterInscId,
            personName: e.gorevlendirilenKisiAdSoyad,
            personTckn: e.gorevlendirilenKisiTckn,
            companyName: e.hizmetAlanIsyeriUnvani,
            certificateNo: e.gorevlendirilenKisiSertifikaNo || "",
            currentDuration: e.calismaSuresi || 0,
            employeeCount: e.hizmetAlanIsyeriCalisanSayisi || 0,
            dangerClass: e.hizmetAlanIsyeriTehlikeSinifi || ""
        };
        const calc = calculateRequiredDuration(contract);
        contract.newDuration = calc.error ? null : calc.requiredMinutes;
        contract.error = calc.error || null;
        return contract;
    });

    const validContracts = contracts.filter(c => c.newDuration !== null);
    const errorContracts = contracts.filter(c => c.error);

    return {
        contracts: validContracts,
        errors: errorContracts,
        summary: {
            total: contracts.length,
            valid: validContracts.length,
            errors: errorContracts.length
        }
    };
}

/**
 * Asgari süreden fazla atanan sözleşmeleri headless modda çeker.
 * Bu fonksiyon eklentideki initSureGuncelle ile aynı mantığı kullanır.
 * asgariSuredenFazlaMi = 1 ve sureGuncellemeVarMi = Hayır filtrelerini uygular.
 */
export async function engine_getAsgariSuredenFazlaData(onProgress) {
    if (onProgress) onProgress("İSG Katip sekmesi kontrol ediliyor...");

    if (onProgress) onProgress("Oturum kontrol ediliyor...");
    const activeTab = await findActiveKatipTab();

    if (!activeTab) {
        throw new Error("İSG Katip oturumu bulunamadı. Lütfen https://isgkatip.csgb.gov.tr adresinde oturum açın ve sayfayı yenileyin.");
    }

    const { tabId, token } = activeTab;

    if (onProgress) onProgress("Asgari süreden fazla atanan sözleşmeler alınıyor...");

    // asgariSuredenFazlaMi = 1 ve sureGuncellemeVarMi = Hayır filtresi ile sözleşmeleri çek
    const resp = await makePostRequest(API_BASE_URL + "/be/bsn-inter-instance/hizmet-sozlesmesi-surec-view/ongoing", {
        body: {
            sortOrder: "DESC",
            pageIndex: 0,
            pageSize: 1000,
            filters: [
                { fieldName: "bsnInterInscId", oper: "IS_NOT_NULL" },
                { fieldName: "asgariSuredenFazlaMi", value: 1, oper: "EQ" },
                { fieldName: "sureGuncellemeVarMi", value: "Hayır", oper: "EQ" }
            ],
            sortColumn: "sozlesmeId"
        }
    }, { token }, tabId);

    if (!resp.ok) throw new Error("Sözleşmeler alınamadı: " + (resp.status || "Bilinmeyen hata"));

    const tableData = resp.json?.body?.tableData || [];

    if (tableData.length === 0) {
        return {
            contracts: [],
            errors: [],
            summary: { total: 0, valid: 0, errors: 0, totalSavableMinutes: 0 }
        };
    }

    if (onProgress) onProgress("Asgari süreler hesaplanıyor...");

    // Otomatik onay bilgisini de al
    const autoApprovalMap = {};
    tableData.forEach(e => {
        if (e.sozlesmeId) {
            autoApprovalMap[String(e.sozlesmeId)] = e.sozlesmeOnayIzniVarMi === 1;
        }
    });

    const contracts = tableData.map(e => {
        const contract = {
            id: e.sozlesmeId,
            bsnInterInscId: e.bsnInterInscId,
            personName: e.gorevlendirilenKisiAdSoyad || "Bilinmeyen Kişi",
            personTckn: e.gorevlendirilenKisiTckn,
            companyName: e.hizmetAlanIsyeriUnvani || "Bilinmeyen İşyeri",
            certificateNo: e.gorevlendirilenKisiSertifikaNo || "",
            currentDuration: e.calismaSuresi || 0,
            employeeCount: e.hizmetAlanIsyeriCalisanSayisi || 0,
            dangerClass: e.hizmetAlanIsyeriTehlikeSinifi || "",
            hasAutoApproval: autoApprovalMap[String(e.sozlesmeId)] || false
        };

        const calc = calculateRequiredDuration(contract);
        contract.newDuration = calc.error ? null : calc.requiredMinutes;
        contract.error = calc.error || null;

        // Tasarruf edilecek dakika hesapla
        if (contract.newDuration !== null && contract.currentDuration > contract.newDuration) {
            contract.savableMinutes = contract.currentDuration - contract.newDuration;
        } else {
            contract.savableMinutes = 0;
        }

        return contract;
    });

    // Geçerli ve hatalı sözleşmeleri ayır
    const validContracts = contracts.filter(c => c.newDuration !== null && c.currentDuration > c.newDuration);
    const errorContracts = contracts.filter(c => c.error);

    // Toplam tasarruf edilebilecek dakika
    const totalSavableMinutes = validContracts.reduce((acc, c) => acc + (c.savableMinutes || 0), 0);

    return {
        contracts: validContracts,
        errors: errorContracts,
        summary: {
            total: contracts.length,
            valid: validContracts.length,
            errors: errorContracts.length,
            totalSavableMinutes: totalSavableMinutes
        }
    };
}

/**
 * Hizmet Alan İşyerleri İSG Sözleşme Durumu verisi - Geliştirilmiş sürüm.
 */
export async function engine_getAtamaDurumuData(onProgress, options = {}) {
    if (onProgress) onProgress("İSG Katip sekmesi kontrol ediliyor...");

    if (onProgress) onProgress("Oturum kontrol ediliyor...");
    const activeTab = await findActiveKatipTab();

    if (!activeTab) {
        throw new Error("İSG Katip oturumu bulunamadı. Lütfen https://isgkatip.csgb.gov.tr adresinde oturum açın ve sayfayı yenileyin.");
    }

    const { tabId, token } = activeTab;

    async function fetchAllOf(filters, title) {
        let allData = [];
        let pageIdx = 0;
        let hasMore = true;
        while (hasMore) {
            if (onProgress) onProgress(`${title} (Sayfa ${pageIdx + 1})...`);
            const resp = await makePostRequest(API_BASE_URL + "/be/bsn-inter-instance/hizmet-sozlesmesi-surec-view/ongoing", {
                body: { sortOrder: "DESC", pageIndex: pageIdx, pageSize: 50000, filters, sortColumn: "sozlesmeId" }
            }, { token }, tabId);
            if (!resp.ok) break;
            const data = resp.json.body?.tableData || [];
            allData.push(...data);
            if (data.length < 50000) hasMore = false;
            else {
                pageIdx++;
                await new Promise(r => setTimeout(r, 1500)); // Rate limit
            }
        }
        return allData;
    }

    const activeContracts = await fetchAllOf([
        { fieldName: "sozlesmeStatu", value: 5001, oper: "EQ" },
        { fieldName: "sozlesmeOnayDurumu", value: 5004, oper: "EQ" }
    ], "Aktif sözleşmeler alınıyor");

    const pendingContracts = await fetchAllOf([
        { fieldName: "sozlesmeStatu", value: 5000, oper: "EQ" },
        { fieldName: "sozlesmeOnayDurumu", value: 5003, oper: "EQ" }
    ], "Onay bekleyen sözleşmeler alınıyor");

    let incompleteContracts = [];
    let zeroEmployeeContracts = []; // Çalışan sayısı 0'a düşen firmalar

    if (options.incompleteDays && options.incompleteDays > 0) {
        const now = new Date();
        const pastDate = new Date(now.getTime() - (options.incompleteDays * 24 * 60 * 60 * 1000));
        const dateStr = pastDate.getDate().toString().padStart(2, '0') + '.' + (pastDate.getMonth() + 1).toString().padStart(2, '0') + '.' + pastDate.getFullYear();

        incompleteContracts = await fetchAllOf([
            { fieldName: "sozlesmeBitisTarihi", value: dateStr, oper: "GRE_EQ", joinEntity: null, type: "date" },
            { fieldName: "bsnInterInscId", oper: "IS_NOT_NULL" },
            { fieldName: "sozlesmeStatu", value: 5006, oper: "EQ" },
            { fieldName: "sozlesmeOnayDurumu", value: 0, oper: "NOT_EQ" }
        ], "Tamamlanmayan sözleşmeler alınıyor");
    }

    // Sonlandırılmış sözleşmelerden "Çalışan sayısının 0'a düşmesi" nedenine sahip olanları çek
    if (onProgress) onProgress("Çalışan sayısı sıfıra düşen firmalar kontrol ediliyor...");
    const terminatedContracts = await fetchAllOf([
        { fieldName: "sozlesmeStatu", value: 5002, oper: "EQ" }, // Sözleşme Sonlandırıldı
        { fieldName: "sozlesmeOnayDurumu", value: 5004, oper: "EQ" } // Onaylı sözleşmeler
    ], "Sonlandırılmış sözleşmeler alınıyor");

    // "Hizmet alan işyeri çalışan sayısının 0'a düşmüş olması" nedeniyle sonlananları filtrele
    zeroEmployeeContracts = terminatedContracts.filter(c =>
        c.sozlesmeSonlandirilmaNedeni &&
        c.sozlesmeSonlandirilmaNedeni.toLowerCase().includes("çalışan sayısı") &&
        c.sozlesmeSonlandirilmaNedeni.toLowerCase().includes("0")
    );

    // Personel isimlerini çek (Eklenti raporu gibi daha temiz isimler için)
    if (onProgress) onProgress("Personel listesi senkronize ediliyor...");
    const personnelMap = {};
    try {
        const persResp = await makePostRequest(API_BASE_URL + "/be/bsn-inter-instance/personel-sozlesmesi-surec/ongoing", {
            body: { sortOrder: "DESC", pageIndex: 0, pageSize: 15000, filters: [{ fieldName: "sozlesmeStatu", value: 5001, oper: "EQ" }, { fieldName: "sozlesmeOnayDurumu", value: 5004, oper: "EQ" }], sortColumn: "sozlesmeId" }
        }, { token }, tabId);
        if (persResp.ok) {
            (persResp.json.body?.tableData || []).forEach(p => {
                if (p.sozlesmeYapilanKisiTckn && p.sozlesmeYapilanKisiAdSoyad) {
                    personnelMap[p.sozlesmeYapilanKisiTckn] = p.sozlesmeYapilanKisiAdSoyad;
                }
            });
        }
    } catch (e) { }

    const companyMap = {};
    function getSafeKey(c) {
        const sgk = c.hizmetAlanIsyeriSgkSicilNo || c.hizmetAlanIsyeriSgkDetsisNo || "";
        const unvan = (c.hizmetAlanIsyeriUnvani || "").trim();
        if (sgk) return sgk;
        return unvan || "UNKNOWN";
    }

    function ensureCompany(c, initialStatus) {
        const key = getSafeKey(c);
        if (!companyMap[key]) {
            companyMap[key] = {
                sgkSicilNo: c.hizmetAlanIsyeriSgkSicilNo || c.hizmetAlanIsyeriSgkDetsisNo || "UNKNOWN",
                companyName: c.hizmetAlanIsyeriUnvani || "Bilinmeyen Firma",
                dangerClass: c.hizmetAlanIsyeriTehlikeSinifi || "Az Tehlikeli",
                employeeCount: c.hizmetAlanIsyeriCalisanSayisi || 0,
                naceKodu: c.hizmetAlanIsyeriNaceKodu || "",
                personnel: { IGU: [], IH: [], DSP: [] },
                status: initialStatus
            };
        }
        return companyMap[key];
    }

    function addPersonnel(comp, c, source) {
        const tckn = c.gorevlendirilenKisiTckn;
        const rawName = c.gorevlendirilenKisiAdSoyad || "";
        const name = (tckn && personnelMap[tckn]) ? personnelMap[tckn] : rawName;
        const certNo = c.gorevlendirilenKisiSertifikaNo || "";

        // Sertifika sınıfını al (personnelMap'ten veya doğrudan)
        const sertifikaTipi = (tckn && personnelMap[tckn] && personnelMap[tckn].uzmanlikSinifiRaw)
            ? personnelMap[tckn].uzmanlikSinifiRaw
            : (c.gorevlendirilenKisiSertifikaTipi || "");

        let targetList = null;
        if (certNo.startsWith("İGU")) targetList = comp.personnel.IGU;
        else if (certNo.startsWith("İH")) targetList = comp.personnel.IH;
        else if (certNo.startsWith("DSP")) targetList = comp.personnel.DSP;

        if (targetList) {
            // Duplicate kontrolü
            if (!targetList.some(p => p.ad === name)) {
                targetList.push({
                    ad: name,
                    tckn: tckn,
                    sertifikaNo: certNo, // Sertifika numarası eklendi
                    sertifikaTipi: sertifikaTipi, // Sertifika sınıfı eklendi
                    calismaSuresi: c.calismaSuresi || 0,
                    baslangicTarihi: c.sozlesmeBaslangicTarihi || "",
                    onay: c.gorevlendirilenKisiOnayDurumu === "Sözleşme Onaylandı",
                    // Yeni: Sözleşme durumu bilgileri
                    sozlesmeStatu: c.sozlesmeStatu, // 5000: Beklemede, 5001: Aktif, 5002: Sonlandırıldı, 5006: Tamamlanmadı
                    sozlesmeOnayDurumu: c.sozlesmeOnayDurumu, // 5003: Onay Bekliyor, 5004: Onaylandı
                    gorevlendirilenKisiOnayDurumu: c.gorevlendirilenKisiOnayDurumu, // "Sözleşme Onaylandı" / "Sözleşme Onay Bekliyor"
                    isyeriOnayDurumu: c.hizmetAlanIsyeriOnayDurumu, // "Sözleşme Onaylandı" / "Sözleşme Onay Bekliyor"
                    source: source // "active", "pending", "incomplete"
                });
            }
        }
    }

    // Sırayla işle: Önce aktifler
    activeContracts.forEach(c => {
        const comp = ensureCompany(c, "green");
        addPersonnel(comp, c, "active");
    });

    // Bekleyenler
    pendingContracts.forEach(c => {
        const comp = ensureCompany(c, "yellow");
        addPersonnel(comp, c, "pending");

        // Eğer bir personel "Sözleşme Onay Bekliyor" ise durum 'white' olur (Sarıdan baskındır)
        if (c.gorevlendirilenKisiOnayDurumu === "Sözleşme Onay Bekliyor") {
            comp.status = "white";
        } else if (comp.status === "green") {
            comp.status = "yellow"; // Yeşilse sarıya çek
        }
    });

    // Tamamlanmayanlar (Sadece listede yoksa ekle veya kırmızıyı işaretle)
    incompleteContracts.forEach(c => {
        const comp = ensureCompany(c, "red");
    });

    // Çalışan sayısı 0'a düşen firmalar (mavi/gri status)
    zeroEmployeeContracts.forEach(c => {
        const key = getSafeKey(c);
        // Eğer firma zaten aktif listede varsa, onu zeroEmployee olarak işaretle
        if (companyMap[key]) {
            companyMap[key].status = "zeroEmployee";
            companyMap[key].employeeCount = 0;
            companyMap[key].terminationReason = c.sozlesmeSonlandirilmaNedeni;
        } else {
            // Yeni firma ekle
            companyMap[key] = {
                sgkSicilNo: c.hizmetAlanIsyeriSgkSicilNo || c.hizmetAlanIsyeriSgkDetsisNo || "UNKNOWN",
                companyName: c.hizmetAlanIsyeriUnvani || "Bilinmeyen Firma",
                dangerClass: c.hizmetAlanIsyeriTehlikeSinifi || "Az Tehlikeli",
                employeeCount: 0,
                naceKodu: c.hizmetAlanIsyeriNaceKodu || "",
                personnel: { IGU: [], IH: [], DSP: [] },
                status: "zeroEmployee",
                terminationReason: c.sozlesmeSonlandirilmaNedeni
            };
        }
    });

    const companies = Object.values(companyMap).map(c => {
        // UI için düzleştirme
        return {
            ...c,
            // Geriye dönük uyumluluk için isimler (ilk personeli al)
            isgUzmani: c.personnel.IGU.map(p => p.ad).join(" / ") || null,
            isyeriHekimi: c.personnel.IH.map(p => p.ad).join(" / ") || null,
            dsp: c.personnel.DSP.map(p => p.ad).join(" / ") || null,
            isgUzmaniCalismaSuresi: c.personnel.IGU.reduce((acc, p) => acc + p.calismaSuresi, 0),
            isyeriHekimiCalismaSuresi: c.personnel.IH.reduce((acc, p) => acc + p.calismaSuresi, 0),
            dspCalismaSuresi: c.personnel.DSP.reduce((acc, p) => acc + p.calismaSuresi, 0)
        };
    });

    // Final status check (Eğer IGU ve IH yoksa KIRMIZI)
    companies.forEach(c => {
        if (!c.isgUzmani && !c.isyeriHekimi) c.status = "red";
    });

    return {
        companies,
        summary: {
            total: companies.length,
            green: companies.filter(c => c.status === "green").length,
            yellow: companies.filter(c => c.status === "yellow").length,
            white: companies.filter(c => c.status === "white").length,
            red: companies.filter(c => c.status === "red").length,
            zeroEmployee: companies.filter(c => c.status === "zeroEmployee").length
        }
    };
}

/**
 * Toplu PDF indirme için sözleşme listesi (sadece aktif onaylanmış sözleşmeler).
 */
export async function engine_getContractListData(onProgress) {
    if (onProgress) onProgress("İSG Katip sekmesi kontrol ediliyor...");

    if (onProgress) onProgress("Oturum kontrol ediliyor...");
    const activeTab = await findActiveKatipTab();

    if (!activeTab) {
        throw new Error("İSG Katip oturumu bulunamadı. Lütfen https://isgkatip.csgb.gov.tr adresinde oturum açın ve sayfayı yenileyin.");
    }

    const { tabId, token } = activeTab;

    if (onProgress) onProgress("Aktif sözleşme listesi alınıyor...");
    const resp = await makePostRequest(API_BASE_URL + "/be/bsn-inter-instance/hizmet-sozlesmesi-surec-view/ongoing", {
        body: {
            sortOrder: "DESC", pageIndex: 0, pageSize: 5000,
            filters: [
                { fieldName: "sozlesmeStatu", value: 5001, oper: "EQ" },
                { fieldName: "sozlesmeOnayDurumu", value: 5004, oper: "EQ" }
            ],
            sortColumn: "sozlesmeId"
        }
    }, { token }, tabId);

    if (!resp.ok) throw new Error("Sözleşmeler alınamadı.");
    const tableData = resp.json?.body?.tableData || [];

    // Sadece başlangıç tarihi olan (aktif) sözleşmeleri filtrele
    const activeContracts = tableData.filter(c => c.sozlesmeBaslangicTarihi);

    // Şirket bazında grupla
    const companyMap = {};
    for (const c of activeContracts) {
        const sgk = c.hizmetAlanIsyeriSgkSicilNo || c.hizmetAlanIsyeriSgkDetsisNo || "UNKNOWN";
        if (!companyMap[sgk]) {
            companyMap[sgk] = {
                sgkSicilNo: sgk,
                companyName: c.hizmetAlanIsyeriUnvani,
                contracts: []
            };
        }
        companyMap[sgk].contracts.push({
            id: c.sozlesmeId,
            personName: c.gorevlendirilenKisiAdSoyad,
            certificateNo: c.gorevlendirilenKisiSertifikaNo,
            dangerClass: c.hizmetAlanIsyeriTehlikeSinifi,
            duration: c.calismaSuresi,
            startDate: c.sozlesmeBaslangicTarihi
        });
    }

    return {
        companies: Object.values(companyMap),
        summary: {
            totalCompanies: Object.keys(companyMap).length,
            totalContracts: activeContracts.length
        }
    };
}

/**
 * Onay bekleyen sözleşme listesi (personel veya işyeri onayı bekleyen).
 * sozlesmeStatu=5000 (Beklemede), sozlesmeOnayDurumu=5003 (Onay Bekliyor)
 */
export async function engine_getPendingContractListData(onProgress) {
    if (onProgress) onProgress("İSG Katip sekmesi kontrol ediliyor...");

    if (onProgress) onProgress("Oturum kontrol ediliyor...");
    const activeTab = await findActiveKatipTab();

    if (!activeTab) {
        throw new Error("İSG Katip oturumu bulunamadı. Lütfen https://isgkatip.csgb.gov.tr adresinde oturum açın ve sayfayı yenileyin.");
    }

    const { tabId, token } = activeTab;

    if (onProgress) onProgress("Onay bekleyen sözleşmeler alınıyor...");
    const resp = await makePostRequest(API_BASE_URL + "/be/bsn-inter-instance/hizmet-sozlesmesi-surec-view/ongoing", {
        body: {
            sortOrder: "DESC", pageIndex: 0, pageSize: 5000,
            filters: [
                { fieldName: "sozlesmeStatu", value: 5000, oper: "EQ" },
                { fieldName: "sozlesmeOnayDurumu", value: 5003, oper: "EQ" }
            ],
            sortColumn: "sozlesmeId"
        }
    }, { token }, tabId);

    if (!resp.ok) throw new Error("Onay bekleyen sözleşmeler alınamadı.");
    const tableData = resp.json?.body?.tableData || [];

    // Şirket bazında grupla
    const companyMap = {};
    for (const c of tableData) {
        const sgk = c.hizmetAlanIsyeriSgkSicilNo || c.hizmetAlanIsyeriSgkDetsisNo || "UNKNOWN";

        // Onay türünü belirle
        let pendingType = "isyeri_onay"; // varsayılan
        if (c.gorevlendirilenKisiOnayDurumu === "Sözleşme Onay Bekliyor") {
            pendingType = "personel_onay";
        } else if (c.hizmetAlanIsyeriOnayDurumu === "Sözleşme Onay Bekliyor") {
            pendingType = "isyeri_onay";
        }

        if (!companyMap[sgk]) {
            companyMap[sgk] = {
                sgkSicilNo: sgk,
                companyName: c.hizmetAlanIsyeriUnvani,
                contracts: []
            };
        }
        companyMap[sgk].contracts.push({
            id: c.sozlesmeId,
            personName: c.gorevlendirilenKisiAdSoyad,
            certificateNo: c.gorevlendirilenKisiSertifikaNo,
            dangerClass: c.hizmetAlanIsyeriTehlikeSinifi,
            duration: c.calismaSuresi,
            startDate: c.sozlesmeBaslangicTarihi,
            pendingType: pendingType
        });
    }

    const companies = Object.values(companyMap);
    const totalContracts = companies.reduce((sum, c) => sum + c.contracts.length, 0);
    const personelOnayCount = tableData.filter(c => c.gorevlendirilenKisiOnayDurumu === "Sözleşme Onay Bekliyor").length;
    const isyeriOnayCount = totalContracts - personelOnayCount;

    return {
        companies,
        summary: {
            totalCompanies: companies.length,
            totalContracts,
            personelOnayCount,
            isyeriOnayCount
        }
    };
}

/**
 * Seçilen sözleşmeleri günceller (çalışan mantık).
 */
export async function engine_updateContractsHeadless(contracts, onProgress) {
    if (onProgress) onProgress("İSG Katip sekmesi kontrol ediliyor...");

    if (onProgress) onProgress("Oturum kontrol ediliyor...");
    const activeTab = await findActiveKatipTab();

    if (!activeTab) {
        throw new Error("İSG Katip oturumu bulunamadı. Lütfen https://isgkatip.csgb.gov.tr adresinde oturum açın ve sayfayı yenileyin.");
    }

    const { tabId, token } = activeTab;

    const results = { success: 0, failed: 0, details: [] };
    const updateUrl = API_BASE_URL + "/be/bsn-inter-instance/hizmet-sozlesmesi-surec/sozlesme-guncelle-ekle";
    const fallbackUrl = API_BASE_URL + "/be/bsn-inter-instance/hizmet-sozlesmesi-surec-view/sozlesme-guncelle-ekle";

    for (let i = 0; i < contracts.length; i++) {
        const c = contracts[i];
        if (onProgress) onProgress(`${i + 1}/${contracts.length} sözleşme güncelleniyor...`);

        try {
            // Rate limiting - ISG Katip 10 saniye bekliyor
            if (i > 0) await new Promise(r => setTimeout(r, 10500));

            const requestBody = {
                body: {
                    bsnInterInscId: c.bsnInterInscId,
                    yeniSozlesmeTipiId: 5001,
                    yeniSozlesmeSuresi: String(c.newDuration)
                }
            };

            let resp = await makePostRequest(updateUrl, requestBody, {
                token,
                "Content-Type": "application/json",
                Accept: "*/*",
                Referer: API_BASE_URL + "/surec/hizmet-sozlesme-surec/sozlesme-guncelle/tanimlama"
            }, tabId);

            // 404 durumunda fallback URL dene
            if (!resp.ok && resp.status === 404) {
                resp = await makePostRequest(fallbackUrl, requestBody, {
                    token,
                    "Content-Type": "application/json",
                    Accept: "*/*",
                    Referer: API_BASE_URL + "/surec/hizmet-sozlesme-surec/sozlesme-guncelle/tanimlama"
                }, tabId);
            }

            if (resp.ok && resp.json?.responseStatus === "SUCCESS") {
                results.success++;
                results.details.push({ id: c.id, success: true, message: "Başarıyla güncellendi" });
            } else {
                results.failed++;
                let errMsg = "Bilinmeyen hata";
                if (resp.json?.messages && resp.json.messages.length > 0) {
                    // Exception mesajlarını filtrele
                    const filtered = resp.json.messages.find(m => !m.includes("Exception") && !m.includes("isg.katip.common"));
                    errMsg = filtered || resp.json.messages[resp.json.messages.length > 1 ? 1 : 0];
                }
                results.details.push({ id: c.id, success: false, message: errMsg });
            }
        } catch (err) {
            results.failed++;
            results.details.push({ id: c.id, success: false, message: err.message });
        }
    }

    return results;
}

/**
 * Seçilen sözleşmelerin PDF'lerini indirir (chrome.scripting kullanarak).
 * @param {Array} contracts - [{id, companyName, certificateNo}]
 */
export async function engine_downloadContractPdfsHeadless(contracts, onProgress) {
    if (onProgress) onProgress("İSG Katip sekmesi kontrol ediliyor...");

    if (onProgress) onProgress("Oturum kontrol ediliyor...");
    const activeTab = await findActiveKatipTab();

    if (!activeTab) {
        throw new Error("İSG Katip oturumu bulunamadı. Lütfen https://isgkatip.csgb.gov.tr adresinde oturum açın ve sayfayı yenileyin.");
    }

    const { tabId, token } = activeTab;

    const results = { success: 0, failed: 0 };

    // Dosya adı oluşturma fonksiyonu
    const generateFilename = (contract) => {
        const companyName = contract.companyName || "Bilinmeyen Firma";
        const certNo = contract.certificateNo || "";

        // Firma adının ilk 2 kelimesi
        const companyWords = companyName.split(/\s+/).slice(0, 2).join(" ");

        // Sertifika tipine göre uzman türü
        let expertType = "Atama Sözleşmesi";
        if (certNo.startsWith("İGU")) {
            expertType = "İş Güvenliği Uzmanı Atama Sözleşmesi";
        } else if (certNo.startsWith("İH")) {
            expertType = "İşyeri Hekimi Atama Sözleşmesi";
        } else if (certNo.startsWith("DSP")) {
            expertType = "Diğer Sağlık Personeli Atama Sözleşmesi";
        }

        // Türkçe karakterleri koruyarak dosya adını oluştur
        const filename = `${companyWords} ${expertType}.pdf`
            .replace(/[<>:"/\\|?*]/g, "")
            .replace(/\s+/g, " ")
            .trim();

        return filename;
    };

    for (let i = 0; i < contracts.length; i++) {
        const contract = contracts[i];
        const contractId = typeof contract === 'object' ? contract.id : contract;
        if (onProgress) onProgress(`${i + 1}/${contracts.length} sözleşme indiriliyor...`);

        try {
            // Rate limiting
            if (i > 0) await new Promise(r => setTimeout(r, 2500));

            // Önce PDF raporu oluştur
            const exportResp = await makePostRequest(API_BASE_URL + "/be/report/exportdetail", {
                body: {
                    type: "PDF",
                    reportSource: "HIZMET_SOZLESME_SURECLERI_DETAY",
                    id: contractId
                }
            }, { token }, tabId);

            if (!exportResp.ok || exportResp.json?.responseStatus !== "SUCCESS" || !exportResp.json?.body) {
                results.failed++;
                continue;
            }

            const filePath = exportResp.json.body;
            const filename = typeof contract === 'object' ? generateFilename(contract) : `Sozlesme_${contractId}.pdf`;

            // PDF'i indir (ISG Katip sekmesinde çalıştır)
            const downloadResult = await chrome.scripting.executeScript({
                target: { tabId },
                func: async (filePath, filename, token, apiBase) => {
                    try {
                        const resp = await fetch(apiBase + "/be/report/downloadpdf?filePath=" + filePath, {
                            method: "POST",
                            headers: {
                                Accept: "*/*",
                                "Content-Type": "application/json",
                                Origin: "https://isgkatip.csgb.gov.tr",
                                token: token
                            },
                            body: ""
                        });

                        if (resp.ok) {
                            const blob = await resp.blob();
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = filename;
                            a.style.display = "none";
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                            return { success: true };
                        }
                        return { success: false, error: "PDF dosyası indirilemedi" };
                    } catch (e) {
                        return { success: false, error: e.message };
                    }
                },
                args: [filePath, filename, token, API_BASE_URL]
            });

            if (downloadResult && downloadResult[0]?.result?.success) {
                results.success++;
            } else {
                results.failed++;
            }
        } catch (err) {
            results.failed++;
        }
    }

    return results;
}

/**
 * Seçilen sözleşmelerin PDF'lerini tek bir ZIP dosyası olarak indirir.
 * PDF'leri base64 olarak toplar, minimal ZIP oluşturur ve web sayfasına gönderir.
 * @param {Array} contracts - [{id, companyName, certificateNo}]
 */
export async function engine_downloadContractPdfsAsZipHeadless(contracts, onProgress) {
    if (onProgress) onProgress("İSG Katip sekmesi kontrol ediliyor...");

    const activeTab = await findActiveKatipTab();
    if (!activeTab) {
        throw new Error("İSG Katip oturumu bulunamadı. Lütfen https://isgkatip.csgb.gov.tr adresinde oturum açın ve sayfayı yenileyin.");
    }

    const { tabId, token } = activeTab;

    // Dosya adı oluşturma fonksiyonu
    const generateFilename = (contract) => {
        const companyName = contract.companyName || "Bilinmeyen Firma";
        const certNo = contract.certificateNo || "";
        const companyWords = companyName.split(/\s+/).slice(0, 2).join(" ");

        let expertType = "Atama Sözleşmesi";
        if (certNo.startsWith("İGU")) expertType = "İGU Atama Sözleşmesi";
        else if (certNo.startsWith("İH")) expertType = "İH Atama Sözleşmesi";
        else if (certNo.startsWith("DSP")) expertType = "DSP Atama Sözleşmesi";

        return `${companyWords} ${expertType}.pdf`
            .replace(/[<>:"/\\|?*]/g, "")
            .replace(/\s+/g, " ")
            .trim();
    };

    // PDF'leri base64 olarak topla
    const pdfFiles = [];
    const results = { success: 0, failed: 0 };

    for (let i = 0; i < contracts.length; i++) {
        const contract = contracts[i];
        const contractId = typeof contract === 'object' ? contract.id : contract;
        if (onProgress) onProgress(`${i + 1}/${contracts.length} PDF hazırlanıyor...`);

        try {
            if (i > 0) await new Promise(r => setTimeout(r, 2500));

            // PDF raporu oluştur
            const exportResp = await makePostRequest(API_BASE_URL + "/be/report/exportdetail", {
                body: {
                    type: "PDF",
                    reportSource: "HIZMET_SOZLESME_SURECLERI_DETAY",
                    id: contractId
                }
            }, { token }, tabId);

            if (!exportResp.ok || exportResp.json?.responseStatus !== "SUCCESS" || !exportResp.json?.body) {
                results.failed++;
                continue;
            }

            const filePath = exportResp.json.body;
            const filename = typeof contract === 'object' ? generateFilename(contract) : `Sozlesme_${contractId}.pdf`;

            // PDF'i base64 olarak al (ISG Katip sekmesinde çalıştır)
            const fetchResult = await chrome.scripting.executeScript({
                target: { tabId },
                func: async (filePath, token, apiBase) => {
                    try {
                        const resp = await fetch(apiBase + "/be/report/downloadpdf?filePath=" + filePath, {
                            method: "POST",
                            headers: {
                                Accept: "*/*",
                                "Content-Type": "application/json",
                                Origin: "https://isgkatip.csgb.gov.tr",
                                token: token
                            },
                            body: ""
                        });

                        if (resp.ok) {
                            const blob = await resp.blob();
                            // Blob'u base64'e çevir
                            const reader = new FileReader();
                            const base64 = await new Promise((resolve, reject) => {
                                reader.onload = () => resolve(reader.result.split(',')[1]);
                                reader.onerror = reject;
                                reader.readAsDataURL(blob);
                            });
                            return { success: true, data: base64 };
                        }
                        return { success: false, error: "PDF dosyası indirilemedi" };
                    } catch (e) {
                        return { success: false, error: e.message };
                    }
                },
                args: [filePath, token, API_BASE_URL]
            });

            if (fetchResult && fetchResult[0]?.result?.success && fetchResult[0]?.result?.data) {
                pdfFiles.push({
                    filename: filename,
                    data: fetchResult[0].result.data
                });
                results.success++;
            } else {
                results.failed++;
            }
        } catch (err) {
            results.failed++;
        }
    }

    if (pdfFiles.length === 0) {
        throw new Error("Hiçbir PDF dosyası alınamadı.");
    }

    if (onProgress) onProgress("ZIP dosyası oluşturuluyor...");

    // --- Minimal ZIP oluşturma (harici kütüphane gerektirmez) ---
    function createZipFromBase64Files(files) {
        // base64 -> Uint8Array
        function b64ToUint8(b64) {
            const bin = atob(b64);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            return arr;
        }

        // Dosya adını UTF-8 Uint8Array'e çevir
        function strToUint8(str) {
            return new TextEncoder().encode(str);
        }

        // CRC32 hesaplama
        function crc32(data) {
            let crc = 0xFFFFFFFF;
            for (let i = 0; i < data.length; i++) {
                crc ^= data[i];
                for (let j = 0; j < 8; j++) {
                    crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
                }
            }
            return (crc ^ 0xFFFFFFFF) >>> 0;
        }

        // Little-endian yazma yardımcıları
        function writeU16(val) { return [val & 0xFF, (val >> 8) & 0xFF]; }
        function writeU32(val) { return [val & 0xFF, (val >> 8) & 0xFF, (val >> 16) & 0xFF, (val >> 24) & 0xFF]; }

        const localHeaders = [];
        const centralHeaders = [];
        let offset = 0;

        for (const file of files) {
            const nameBytes = strToUint8(file.filename);
            const fileData = b64ToUint8(file.data);
            const crc = crc32(fileData);
            const size = fileData.length;

            // Local file header (30 + nameLen + dataLen)
            const local = new Uint8Array([
                0x50, 0x4B, 0x03, 0x04, // Signature
                0x14, 0x00,             // Version needed (2.0)
                0x00, 0x08,             // General purpose bit flag (bit 11 = UTF-8)
                0x00, 0x00,             // Compression: stored
                0x00, 0x00,             // Mod time
                0x00, 0x00,             // Mod date
                ...writeU32(crc),       // CRC-32
                ...writeU32(size),      // Compressed size
                ...writeU32(size),      // Uncompressed size
                ...writeU16(nameBytes.length), // Filename length
                0x00, 0x00              // Extra field length
            ]);

            const localEntry = new Uint8Array(local.length + nameBytes.length + fileData.length);
            localEntry.set(local, 0);
            localEntry.set(nameBytes, local.length);
            localEntry.set(fileData, local.length + nameBytes.length);

            // Central directory header
            const central = new Uint8Array([
                0x50, 0x4B, 0x01, 0x02, // Signature
                0x14, 0x00,             // Version made by
                0x14, 0x00,             // Version needed
                0x00, 0x08,             // General purpose bit flag (UTF-8)
                0x00, 0x00,             // Compression: stored
                0x00, 0x00,             // Mod time
                0x00, 0x00,             // Mod date
                ...writeU32(crc),
                ...writeU32(size),
                ...writeU32(size),
                ...writeU16(nameBytes.length),
                0x00, 0x00,             // Extra field length
                0x00, 0x00,             // File comment length
                0x00, 0x00,             // Disk number start
                0x00, 0x00,             // Internal file attributes
                0x00, 0x00, 0x00, 0x00, // External file attributes
                ...writeU32(offset)     // Relative offset of local header
            ]);

            const centralEntry = new Uint8Array(central.length + nameBytes.length);
            centralEntry.set(central, 0);
            centralEntry.set(nameBytes, central.length);

            localHeaders.push(localEntry);
            centralHeaders.push(centralEntry);
            offset += localEntry.length;
        }

        // Central directory offset ve size
        const centralDirOffset = offset;
        let centralDirSize = 0;
        for (const c of centralHeaders) centralDirSize += c.length;

        // End of central directory record
        const eocd = new Uint8Array([
            0x50, 0x4B, 0x05, 0x06, // Signature
            0x00, 0x00,             // Disk number
            0x00, 0x00,             // Disk number with central dir
            ...writeU16(files.length), // Total entries on disk
            ...writeU16(files.length), // Total entries
            ...writeU32(centralDirSize),
            ...writeU32(centralDirOffset),
            0x00, 0x00              // Comment length
        ]);

        // Tüm parçaları birleştir
        const totalSize = offset + centralDirSize + eocd.length;
        const zipData = new Uint8Array(totalSize);
        let pos = 0;
        for (const l of localHeaders) { zipData.set(l, pos); pos += l.length; }
        for (const c of centralHeaders) { zipData.set(c, pos); pos += c.length; }
        zipData.set(eocd, pos);

        // Uint8Array'i base64'e çevir (service worker'da btoa kullanılabilir)
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < zipData.length; i += chunkSize) {
            const chunk = zipData.subarray(i, Math.min(i + chunkSize, zipData.length));
            binary += String.fromCharCode.apply(null, chunk);
        }
        return btoa(binary);
    }

    const zipBase64 = createZipFromBase64Files(pdfFiles);

    return {
        ...results,
        zipData: zipBase64,
        totalFiles: pdfFiles.length
    };
}

// =====================================================
// ÇOKLU ATAMA FONKSİYONLARI
// =====================================================

/**
 * Çoklu atama için personel listesini çeker.
 * Her personelin atanabilir dakikasını hesaplar.
 */
export async function engine_getPersonnelForBulkAssignment(onProgress) {
    if (onProgress) onProgress("İSG Katip sekmesi kontrol ediliyor...");

    if (onProgress) onProgress("Oturum kontrol ediliyor...");
    const activeTab = await findActiveKatipTab();

    if (!activeTab) {
        throw new Error("İSG Katip oturumu bulunamadı. Lütfen https://isgkatip.csgb.gov.tr adresinde oturum açın ve sayfayı yenileyin.");
    }

    const { tabId, token } = activeTab;

    if (onProgress) onProgress("Personel listesi alınıyor...");

    // Personel sözleşmeleri
    const personnelResp = await makePostRequest(API_BASE_URL + "/be/bsn-inter-instance/personel-sozlesmesi-surec/ongoing", {
        body: {
            sortOrder: "DESC",
            pageIndex: 0,
            pageSize: 1000,
            filters: [
                { fieldName: "sozlesmeStatu", value: 5001, oper: "EQ" },
                { fieldName: "sozlesmeOnayDurumu", value: 5004, oper: "EQ" }
            ],
            sortColumn: "sozlesmeId"
        }
    }, { token }, tabId);

    if (!personnelResp.ok) throw new Error("Personel sözleşmeleri alınamadı.");
    const personnelData = personnelResp.json.body?.tableData || [];

    // Hizmet sözleşmeleri (aktif)
    if (onProgress) onProgress("Aktif sözleşmeler kontrol ediliyor...");
    const activeResp = await makePostRequest(API_BASE_URL + "/be/bsn-inter-instance/hizmet-sozlesmesi-surec-view/ongoing", {
        body: {
            sortOrder: "DESC",
            pageIndex: 0,
            pageSize: 50000,
            filters: [
                { fieldName: "sozlesmeStatu", value: 5001, oper: "EQ" },
                { fieldName: "sozlesmeOnayDurumu", value: 5004, oper: "EQ" }
            ],
            sortColumn: "sozlesmeId"
        }
    }, { token }, tabId);

    const activeContracts = activeResp.ok ? (activeResp.json.body?.tableData || []) : [];

    // Onay bekleyen sözleşmeler
    if (onProgress) onProgress("Onay bekleyen sözleşmeler kontrol ediliyor...");
    const pendingResp = await makePostRequest(API_BASE_URL + "/be/bsn-inter-instance/hizmet-sozlesmesi-surec-view/ongoing", {
        body: {
            sortOrder: "DESC",
            pageIndex: 0,
            pageSize: 50000,
            filters: [
                { fieldName: "sozlesmeStatu", value: 5000, oper: "EQ" },
                { fieldName: "sozlesmeOnayDurumu", value: 5003, oper: "EQ" }
            ],
            sortColumn: "sozlesmeId"
        }
    }, { token }, tabId);

    const pendingContracts = pendingResp.ok ? (pendingResp.json.body?.tableData || []) : [];

    if (onProgress) onProgress("Personel süreleri hesaplanıyor...");

    // Personel map oluştur
    const personnelMap = {};
    for (const item of personnelData) {
        const tckn = item.sozlesmeYapilanKisiTckn;
        if (!tckn) continue;

        if (!personnelMap[tckn]) {
            const certNo = item.sozlesmeYapilanKisiSertifikaNo || "";
            const certType = item.sozlesmeYapilanKisiSertifikaTipi || "";

            let type = "";
            let iguClass = null;

            if (certNo.startsWith("İGU") || certType.includes("İGU") || certType.includes("Uzmanlığı")) {
                type = "İGU";
                if (certType.includes("A Sınıfı") || certType.includes("(A)")) iguClass = "A";
                else if (certType.includes("B Sınıfı") || certType.includes("(B)")) iguClass = "B";
                else iguClass = "C";
            } else if (certNo.startsWith("İH") || certType.includes("HEKİM") || certType.includes("İH")) {
                type = "İH";
            } else if (certNo.startsWith("DSP") || certType.includes("Sağlık Personeli")) {
                type = "DSP";
            }

            personnelMap[tckn] = {
                tckn: tckn,
                name: item.sozlesmeYapilanKisiAdSoyad,
                certificateNo: certNo,
                certificateType: certType,
                type: type,
                iguClass: iguClass,
                toplamCalismaSuresi: 0,
                devamEdenCalismaSuresi: 0,
                isgOnayindaBekleyen: 0,
                isyeriOnayindaBekleyen: 0,
                onerilenAtanabilirSure: 0
            };
        }

        if (typeof item.calismaSuresi === "number") {
            personnelMap[tckn].toplamCalismaSuresi += item.calismaSuresi;
        }
    }

    // Her personelin kullanılan sürelerini hesapla
    for (const tckn of Object.keys(personnelMap)) {
        const personnel = personnelMap[tckn];
        const tcknInt = parseInt(tckn);

        let activeMins = 0, isgPending = 0, isyeriPending = 0;

        // Aktif sözleşmelerden kullanılan süre
        for (const item of activeContracts.filter(x => x.gorevlendirilenKisiTckn === tcknInt)) {
            if (typeof item.calismaSuresi === "number") {
                activeMins += item.calismaSuresi;
            }
        }

        // Onay bekleyen sözleşmeler
        for (const item of pendingContracts.filter(x => x.gorevlendirilenKisiTckn === tcknInt)) {
            if (typeof item.calismaSuresi === "number") {
                if (item.gorevlendirilenKisiOnayDurumu === "Sözleşme Onay Bekliyor") {
                    isgPending += item.calismaSuresi;
                } else if (item.gorevlendirilenKisiOnayDurumu === "Sözleşme Onaylandı" &&
                    item.hizmetAlanIsyeriOnayDurumu === "Sözleşme Onay Bekliyor") {
                    isyeriPending += item.calismaSuresi;
                }
            }
        }

        personnel.devamEdenCalismaSuresi = activeMins;
        personnel.isgOnayindaBekleyen = isgPending;
        personnel.isyeriOnayindaBekleyen = isyeriPending;
        personnel.onerilenAtanabilirSure = personnel.toplamCalismaSuresi - activeMins - isgPending - isyeriPending;
    }

    // Gruplara ayır
    const iguList = [], ihList = [], dspList = [];
    for (const tckn of Object.keys(personnelMap)) {
        const p = personnelMap[tckn];
        if (p.type === "İGU") iguList.push(p);
        else if (p.type === "İH") ihList.push(p);
        else if (p.type === "DSP") dspList.push(p);
    }

    // İGU'ları sınıfa göre sırala (A > B > C)
    const classOrder = { A: 1, B: 2, C: 3 };
    iguList.sort((a, b) => (classOrder[a.iguClass] || 3) - (classOrder[b.iguClass] || 3));

    return {
        iguPersonnel: iguList,
        ihPersonnel: ihList,
        dspPersonnel: dspList,
        summary: {
            totalIGU: iguList.length,
            totalIH: ihList.length,
            totalDSP: dspList.length
        }
    };
}

/**
 * SGK sicil numarasına göre firma bilgisini sorgular.
 * @param {string} sgkNo - SGK Sicil Numarası (26 hane)
 * @param {string} contractType - Sözleşme tipi (İGU, İH, DSP)
 * @param {string} employeeTckn - Test için kullanılacak personel TCKN
 */
export async function engine_queryCompanyInfo(sgkNo, contractType, employeeTckn, onProgress) {
    console.log("[engine_queryCompanyInfo] Function called with:", { sgkNo, contractType, employeeTckn });
    if (onProgress) onProgress("İSG Katip sekmesi kontrol ediliyor...");

    if (onProgress) onProgress("Oturum kontrol ediliyor...");
    const activeTab = await findActiveKatipTab();

    if (!activeTab) {
        throw new Error("İSG Katip oturumu bulunamadı. Lütfen https://isgkatip.csgb.gov.tr adresinde oturum açın ve sayfayı yenileyin.");
    }

    const { tabId, token } = activeTab;
    console.log("[engine_queryCompanyInfo] Found ISG Katip tab:", tabId);

    const bsnInterId = contractType === "İGU" ? "103" : contractType === "İH" ? "140" : "177";
    let businessInteractionInstanceId = null;

    try {
        // Önceki tüm taslak sözleşmeleri sil (farklı firmalardan kalan verilerin bulaşmasını önle)
        if (onProgress) onProgress("Önceki taslaklar temizleniyor...");
        try {
            const draftsResp = await makePostRequest(API_BASE_URL + "/be/bsn-inter-instance/hizmet-sozlesmesi-surec-view/draft", {
                body: { sortOrder: "DESC", pageIndex: 0, pageSize: 50, sortColumn: "sozlesmeId" }
            }, { token }, tabId);

            if (draftsResp.ok && draftsResp.json?.body?.tableData) {
                for (const draft of draftsResp.json.body.tableData) {
                    const draftId = draft.businessInteractionInstanceId;
                    if (draftId) {
                        await makePostRequest(API_BASE_URL + "/be/surec/surec-sil", {
                            body: { businessInteractionInstanceId: draftId, durum: 5005 }
                        }, { token }, tabId);
                        console.log("[engine_queryCompanyInfo] Deleted draft:", draftId);
                    }
                }
            }
        } catch (e) {
            console.log("[engine_queryCompanyInfo] Could not clean drafts:", e);
        }

        if (onProgress) onProgress("Sözleşme başlatılıyor...");

        // Sözleşme başlat
        const initResp = await makePostRequest(API_BASE_URL + "/be/bsn-inter/submit", {
            body: { businessInteraction: { bsnInterId }, operationType: "ADD" }
        }, { token }, tabId);

        if (!initResp.ok || initResp.json?.responseStatus !== "SUCCESS") {
            throw new Error("Sözleşme başlatılamadı: " + (initResp.json?.messages?.join(", ") || "Bilinmeyen hata"));
        }

        businessInteractionInstanceId = initResp.json.body.businessInteractionInstanceId;
        const flowInstanceId = initResp.json.body.flowInstances?.[0]?.businessInteractionFlowInstanceId;

        if (!businessInteractionInstanceId || !flowInstanceId) {
            throw new Error("Flow instance ID alınamadı");
        }

        // Uyarı sayfasını geç
        if (onProgress) onProgress("Uyarı sayfası geçiliyor...");
        const warningConfig = {
            "İGU": { bsnInterFlowPgId: 10565, bsnInterPgWrngId: 8328, operationId: 27183 },
            "İH": { bsnInterFlowPgId: 10577, bsnInterPgWrngId: 8334, operationId: 27195 },
            "DSP": { bsnInterFlowPgId: 10589, bsnInterPgWrngId: 8340, operationId: 27207 }
        }[contractType];

        const warningResp = await makePostRequest(API_BASE_URL + "/be/quote/updateFlowInstance", {
            body: {
                quoteKey: { businessInteractionInstanceId },
                flowInstancePage: { bsnInterFlowInscId: flowInstanceId, bsnInterFlowPgId: warningConfig.bsnInterFlowPgId, name: "Bilgilendirme Sayfası", scrOrd: 1, postActnStId: 1101 },
                page: { type: "isg.katip.common.dto.bsninter.BusinessInteractionPageWarningDTO", isActv: 1, isLocked: false, bsnInterPgWrngId: warningConfig.bsnInterPgWrngId, bsnInterPgId: warningConfig.bsnInterFlowPgId, businessInteractionInstanceId },
                operation: { isActv: 1, businessInteractionPageOperationId: warningConfig.operationId, operationActionType: 10, businessInteractionPageOperationName: "İleri", businessInteractionPageOperationShortCode: "NEXT" }
            }
        }, { token }, tabId);

        // Warning yanıtından workplace flow instance ID'sini al
        let workplaceFlowInstanceId = flowInstanceId; // fallback
        const workplacePageId = { "İGU": 10566, "İH": 10578, "DSP": 10590 }[contractType];
        if (warningResp.ok && warningResp.json?.body?.flowInstances) {
            for (const flow of warningResp.json.body.flowInstances) {
                if (flow.flowInstancePage?.bsnInterFlowPgId === workplacePageId ||
                    flow.flowInstancePage?.name?.includes("Sözleşme Yapılacak İşyeri Seçimi")) {
                    workplaceFlowInstanceId = flow.businessInteractionFlowInstanceId;
                    console.log("[engine_queryCompanyInfo] Found workplace flow instance from warning resp:", workplaceFlowInstanceId);
                    break;
                }
            }
        }

        // Firma rolünü kontrol et
        if (onProgress) onProgress("Firma bilgisi sorgulanıyor...");
        const participantId = { "İGU": 13490, "İH": 13498, "DSP": 13508 }[contractType];

        const roleResp = await makePostRequest(API_BASE_URL + "/be/bsninter/conf/participant/hasRole", {
            body: { bsnInterPrtcptId: participantId, rowId: sgkNo, dataTpId: 280 }
        }, { token }, tabId);

        if (!roleResp.ok || roleResp.json?.responseStatus !== "SUCCESS") {
            const errMsg = roleResp.json?.messages?.find(m => !m.includes("Exception")) || "Firma bulunamadı";
            throw new Error(errMsg);
        }

        // ÖNEMLİ: roleResp.body.rowId OSGB'nin rowId'sini dönebilir!
        // yeni-atama.js'de de böyle - validateCompanyParticipant sgkNo gönderiyor ama API rowId dönüyor
        // Ancak kritik fark: workplace seçiminde rowId değil SGK no kullanılmalı
        const apiRowId = roleResp.json.body?.rowId;
        const companyTitle = roleResp.json.body?.title || `Firma (${sgkNo.substring(0, 12)}...)`;

        // DEBUG: API'nin döndüğü rowId'yi ve SGK no'yu karşılaştır
        console.log("[engine_queryCompanyInfo] roleResp returned rowId:", apiRowId);
        console.log("[engine_queryCompanyInfo] Original sgkNo from request:", sgkNo);
        console.log("[engine_queryCompanyInfo] Are they same?", apiRowId?.toString() === sgkNo?.toString());

        // yeni-atama.js'deki mantık: validateCompanyParticipant'tan dönen rowId kullanılıyor
        // Sidepanel logları gösterdi ki: 6996441 rowId ile 25 çalışan doğru geliyor
        // Demek ki apiRowId kullanılmalı, sgkNo değil
        const companyRowId = apiRowId || sgkNo; // apiRowId kullan (sidepanel gibi)
        console.log("[engine_queryCompanyInfo] Using companyRowId:", companyRowId, "(apiRowId from hasRole response)");


        // İşyeri katılımcısını ayarla (bilgi almak için)
        if (onProgress) onProgress("Firma detayları alınıyor...");
        const workplaceConfig = {
            "İGU": { bsnInterFlowPgId: 10566, bsnInterPgPrtcptId: 6201, bsnInterPrtcptId: 13490, operationId: 27184, ruleSetId: 642 },
            "İH": { bsnInterFlowPgId: 10578, bsnInterPgPrtcptId: 6205, bsnInterPrtcptId: 13498, operationId: 27196, ruleSetId: 642 },
            "DSP": { bsnInterFlowPgId: 10590, bsnInterPgPrtcptId: 6209, bsnInterPrtcptId: 13508, operationId: 27208, ruleSetId: 642 }
        }[contractType];

        // Sidepanel'deki tam yapıyı kullan - tüm gerekli fieldler
        const workplaceResp = await makePostRequest(API_BASE_URL + "/be/quote/updateFlowInstance", {
            body: {
                quoteKey: { businessInteractionInstanceId },
                flowInstancePage: {
                    bsnInterFlowInscId: workplaceFlowInstanceId,
                    bsnInterFlowPgId: workplaceConfig.bsnInterFlowPgId,
                    name: "Sözleşme Yapılacak İşyeri Seçimi Sayfası",
                    descr: "Participant Page",
                    scrOrd: 2,
                    postActnStId: 1101,
                    isAutoComp: 1,
                    isPnr: 1
                },
                page: {
                    type: "isg.katip.common.dto.bsninter.participant.BusinessInteractionPageParticipantDTO",
                    isActv: 1, isLocked: false,
                    bsnInterPgPrtcptId: workplaceConfig.bsnInterPgPrtcptId,
                    name: "Sözleşme Yapılacak İşyeri Seçimi Sayfası",
                    descr: "Participant Page",
                    // Sidepanel'deki gibi tam participants yapısı
                    participants: [{
                        isActv: 1,
                        bsnInterPgPrtcptItemId: workplaceConfig.bsnInterPgPrtcptId,
                        bsnInterPrtcptId: workplaceConfig.bsnInterPrtcptId,
                        participantDataTypeId: 280,
                        ruleSetId: workplaceConfig.ruleSetId,
                        verNo: 1,
                        name: "Sözleşme Yapılacak İşyeri",
                        participantName: "isyeri",
                        rowId: companyRowId,
                        dataTpId: 280
                    }],
                    businessInteractionInstanceId,
                    businessInteractionName: { "İGU": "OSGB İLE ÖZEL İŞYERİ ARASINDA İŞ GÜVENLİĞİ UZMANI HİZMET ALIMI SÖZLEŞMESİ", "İH": "OSGB İLE ÖZEL İŞYERİ ARASINDA İŞYERİ HEKİMLİĞİ HİZMET ALIMI SÖZLEŞMESİ", "DSP": "OSGB İLE ÖZEL İŞYERİ ARASINDA DİĞER SAĞLIK PERSONELİ HİZMETİ ALIMI SÖZLEŞMESİ" }[contractType],
                    tarafBilgisi: companyRowId + ",280"
                },
                operation: { isActv: 1, businessInteractionPageOperationId: workplaceConfig.operationId, operationActionType: 10, businessInteractionPageOperationName: "İleri", businessInteractionPageOperationShortCode: "NEXT" }
            }
        }, { token }, tabId);


        console.log("[engine_queryCompanyInfo] Workplace resp status:", workplaceResp.ok, workplaceResp.json?.responseStatus);
        console.log("[engine_queryCompanyInfo] Workplace resp flowInstances:", workplaceResp.json?.body?.flowInstances?.length || 0);

        // İşyeri seçimi başarısızsa bile devam et - API bazen hata verip yine de işlem yapabilir
        if (!workplaceResp.ok) {
            console.log("[engine_queryCompanyInfo] Workplace response not OK, but continuing...", workplaceResp);
        }

        // Personel flow instance ID'sini al
        const personnelFlowConfig = {
            "İGU": { bsnInterFlowPgId: 10567, bsnInterPgPrtcptId: 6202, bsnInterPrtcptId: 13491, operationId: 27185, pageName: "Görevlendirilecek İş Güvenliği Uzmanı Seçimi Sayfası" },
            "İH": { bsnInterFlowPgId: 10579, bsnInterPgPrtcptId: 6206, bsnInterPrtcptId: 13499, operationId: 27197, pageName: "Görevlendirilecek İşyeri Hekimi Seçimi Sayfası" },
            "DSP": { bsnInterFlowPgId: 10591, bsnInterPgPrtcptId: 6210, bsnInterPrtcptId: 13506, operationId: 27209, pageName: "Görevlendirilecek Diğer Sağlık Personeli Seçimi Sayfası" }
        }[contractType];

        // Yeni flow instance ID'sini bul
        let personnelFlowInstanceId = null;
        if (workplaceResp.json?.body?.flowInstances) {
            for (const flow of workplaceResp.json.body.flowInstances) {
                if (flow.flowInstancePage?.bsnInterFlowPgId === personnelFlowConfig.bsnInterFlowPgId ||
                    flow.flowInstancePage?.name?.includes("Seçimi Sayfası")) {
                    personnelFlowInstanceId = flow.businessInteractionFlowInstanceId;
                    break;
                }
            }
        }

        if (!personnelFlowInstanceId) {
            console.log("[engine_queryCompanyInfo] Could not find personnel flow instance, using fallback");
            personnelFlowInstanceId = flowInstanceId; // Fallback
        }

        // Personel doğrulama - hata durumunda devam et
        if (onProgress) onProgress("Personel doğrulanıyor...");
        let personnelRowId = employeeTckn;
        try {
            const personnelValidateResp = await makePostRequest(API_BASE_URL + "/be/bsninter/conf/participant/hasRole", {
                body: { bsnInterPrtcptId: personnelFlowConfig.bsnInterPrtcptId, rowId: employeeTckn, dataTpId: 300 }
            }, { token }, tabId);

            if (personnelValidateResp.ok && personnelValidateResp.json?.responseStatus === "SUCCESS") {
                personnelRowId = personnelValidateResp.json.body?.rowId || employeeTckn;
            }
        } catch (e) {
            console.log("[engine_queryCompanyInfo] Personnel validation failed, using fallback:", e);
        }

        // Personel seçimi yap - BU ADIMDA FİRMA BİLGİLERİ DÖNECEk
        if (onProgress) onProgress("Personel seçimi yapılıyor...");
        console.log("[engine_queryCompanyInfo] Making personnelResp request for SGK:", sgkNo, "with companyRowId:", companyRowId);
        const personnelResp = await makePostRequest(API_BASE_URL + "/be/quote/updateFlowInstance", {
            body: {
                quoteKey: { businessInteractionInstanceId },
                flowInstancePage: { bsnInterFlowInscId: personnelFlowInstanceId, bsnInterFlowPgId: personnelFlowConfig.bsnInterFlowPgId, name: personnelFlowConfig.pageName, scrOrd: 3, postActnStId: 1101 },
                page: {
                    type: "isg.katip.common.dto.bsninter.participant.BusinessInteractionPageParticipantDTO",
                    isActv: 1, isLocked: false,
                    bsnInterPgPrtcptId: personnelFlowConfig.bsnInterPgPrtcptId,
                    name: personnelFlowConfig.pageName,
                    participants: [{ bsnInterPrtcptId: personnelFlowConfig.bsnInterPrtcptId, rowId: personnelRowId, dataTpId: 300 }],
                    businessInteractionInstanceId,
                    tarafBilgisi: companyRowId + ",280"
                },
                operation: { isActv: 1, businessInteractionPageOperationId: personnelFlowConfig.operationId, operationActionType: 10, businessInteractionPageOperationName: "İleri", businessInteractionPageOperationShortCode: "NEXT" }
            }
        }, { token }, tabId);

        console.log("[engine_queryCompanyInfo] personnelResp status:", personnelResp.ok, personnelResp.json?.responseStatus);
        console.log("[engine_queryCompanyInfo] personnelResp businessInteractionInstanceId:", personnelResp.json?.body?.businessInteractionInstanceId);

        // Yanıttan firma bilgilerini çıkar - derin JSON taraması
        let employeeCount = 0, dangerClass = "Az Tehlikeli", requiredMinutes = 0;

        // Derinlemesine bilgi arama fonksiyonu
        const extractInfoFromResponse = (obj, sourceName = "Unknown") => {
            if (!obj || typeof obj !== 'object') return;

            // Array ise her öğeyi tara
            if (Array.isArray(obj)) {
                for (const item of obj) {
                    extractInfoFromResponse(item, sourceName);
                }
                return;
            }

            // bsnInterFlowInscPrtcptArgmntInfoList içinde bilgi varsa çıkar
            if (obj.bsnInterFlowInscPrtcptArgmntInfoList && Array.isArray(obj.bsnInterFlowInscPrtcptArgmntInfoList)) {
                for (const info of obj.bsnInterFlowInscPrtcptArgmntInfoList) {
                    const name = (info.bsnInterPrtcptInfoCharName || "").toString().trim().toUpperCase();
                    const value = (info.bsnInterPrtcptInfoCharValue || "").toString().trim();

                    if (!name) continue;

                    if (name.includes("TOPLAM ÇALIŞAN SAYISI") || name === "TOPLAM ÇALIŞAN" || name.includes("ÇALIŞAN SAYISI")) {
                        const count = parseInt(value);
                        if (!isNaN(count) && count > 0) {
                            employeeCount = count;
                            console.log(`[engine_queryCompanyInfo] Found employeeCount from ${sourceName}:`, employeeCount);
                        }
                    }
                    else if (name.includes("TEHLİKE SINIFI")) {
                        if (value) {
                            dangerClass = value;
                            console.log(`[engine_queryCompanyInfo] Found dangerClass from ${sourceName}:`, dangerClass);
                        }
                    }
                    else if (name.includes("GEREKLİ ASGARİ KISMİ SÜRELİ İGU SÜRESİ") && contractType === "İGU") {
                        requiredMinutes = parseInt(value) || requiredMinutes;
                    }
                    else if (name.includes("GEREKLİ ASGARİ KISMİ SÜRELİ İH SÜRESİ") && contractType === "İH") {
                        requiredMinutes = parseInt(value) || requiredMinutes;
                    }
                    else if (name.includes("GEREKLİ ASGARİ KISMİ SÜRELİ DSP SÜRESİ") && contractType === "DSP") {
                        requiredMinutes = parseInt(value) || requiredMinutes;
                    }
                    else if (name.includes("GEREKLİ TOPLAM İGU SÜRESİ") && contractType === "İGU" && requiredMinutes === 0) {
                        requiredMinutes = parseInt(value) || requiredMinutes;
                    }
                }
            }

            // Tekil bilgi objesi ise (alternatif yapı - bsnInterPrtcptInfoCharValue direkt objenin içindeyse)
            if (obj.bsnInterPrtcptInfoCharName && obj.bsnInterPrtcptInfoCharValue) {
                const name = obj.bsnInterPrtcptInfoCharName.toString().toUpperCase();
                const value = obj.bsnInterPrtcptInfoCharValue.toString();

                if (name.includes("TOPLAM ÇALIŞAN SAYISI") || name.includes("ÇALIŞAN SAYISI")) {
                    employeeCount = parseInt(value) || employeeCount;
                }
                else if (name.includes("TEHLİKE SINIFI")) {
                    dangerClass = value || dangerClass;
                }
                else if (name.includes("GEREKLİ ASGARİ KISMİ SÜRELİ İGU SÜRESİ") && contractType === "İGU") requiredMinutes = parseInt(value) || requiredMinutes;
                else if (name.includes("GEREKLİ ASGARİ KISMİ SÜRELİ İH SÜRESİ") && contractType === "İH") requiredMinutes = parseInt(value) || requiredMinutes;
                else if (name.includes("GEREKLİ ASGARİ KISMİ SÜRELİ DSP SÜRESİ") && contractType === "DSP") requiredMinutes = parseInt(value) || requiredMinutes;
            }

            // Alt objeleri tara
            for (const key of Object.keys(obj)) {
                if (obj[key] && typeof obj[key] === 'object' && key !== 'auditInfo') {
                    extractInfoFromResponse(obj[key], sourceName);
                }
            }
        };

        // SADECE personnelResp yanıtını tara - workplaceResp OSGB verilerini içerebilir ve yanlış sonuç verir
        // yeni-atama.js'deki extractCompanyInfoFromCalculationResult mantığı sadece personnel yanıtını kullanır
        if (personnelResp.ok && personnelResp.json) {
            console.log("[engine_queryCompanyInfo] Extracting company info from personnelResp only (skipping workplaceResp to avoid OSGB data contamination)");
            extractInfoFromResponse(personnelResp.json, "personnelResp");
        }

        // UYARI: workplaceResp kullanılMIYOR çünkü bu yanıt OSGB firma bilgilerini içerebilir
        // eskiden: if (workplaceResp.ok && workplaceResp.json) { extractInfoFromResponse(workplaceResp.json, "workplaceResp"); }

        // Gerekli dakikayı hesapla (API'den gelmezse)
        if (requiredMinutes === 0 || employeeCount === 0) {
            console.log("[engine_queryCompanyInfo] Minutes or EmployeeCount still 0 after personnelResp extraction");
        }

        // Taslak sözleşmeyi sil
        await makePostRequest(API_BASE_URL + "/be/surec/surec-sil", {
            body: { businessInteractionInstanceId, durum: 5005 }
        }, { token }, tabId);

        // Mevcut atamaları kontrol et - hem ongoing hem pending
        if (onProgress) onProgress("Mevcut atamalar kontrol ediliyor...");

        // 1. Devam eden sözleşmeler (onaylanmış)
        const existingResp = await makePostRequest(API_BASE_URL + "/be/bsn-inter-instance/hizmet-sozlesmesi-surec-view/ongoing", {
            body: {
                sortOrder: "DESC", pageIndex: 0, pageSize: 100,
                filters: [
                    { fieldName: "hizmetAlanIsyeriSgkDetsisNo", value: sgkNo, oper: "EQ" },
                    { fieldName: "sozlesmeStatu", value: 5001, oper: "EQ" },
                    { fieldName: "sozlesmeOnayDurumu", value: 5004, oper: "EQ" }
                ],
                sortColumn: "sozlesmeId"
            }
        }, { token }, tabId);

        // 2. Onay bekleyen sözleşmeler
        const pendingResp = await makePostRequest(API_BASE_URL + "/be/bsn-inter-instance/hizmet-sozlesmesi-surec-view/ongoing", {
            body: {
                sortOrder: "DESC", pageIndex: 0, pageSize: 100,
                filters: [
                    { fieldName: "hizmetAlanIsyeriSgkDetsisNo", value: sgkNo, oper: "EQ" },
                    { fieldName: "sozlesmeStatu", value: 5001, oper: "EQ" },
                    { fieldName: "sozlesmeOnayDurumu", value: 5001, oper: "EQ" } // Onay bekliyor
                ],
                sortColumn: "sozlesmeId"
            }
        }, { token }, tabId);

        const ongoingContracts = existingResp.ok ? (existingResp.json.body?.tableData || []) : [];
        const pendingContracts = pendingResp.ok ? (pendingResp.json.body?.tableData || []) : [];
        const existingContracts = [...ongoingContracts, ...pendingContracts];

        console.log("[engine_queryCompanyInfo] Found contracts:", { ongoing: ongoingContracts.length, pending: pendingContracts.length });

        let hasIGU = false, hasIH = false, hasDSP = false;
        let iguEmployee = null, ihEmployee = null, dspEmployee = null;
        let iguStatus = null, ihStatus = null, dspStatus = null;

        for (const c of existingContracts) {
            // Mevcut sözleşmeden çalışan sayısı ve tehlike sınıfını al (yeni-atama.js'deki gibi)
            if (employeeCount === 0 && (c.hizmetAlanIsyeriCalisanSayisi || c.calisanSayisi)) {
                employeeCount = parseInt(c.hizmetAlanIsyeriCalisanSayisi || c.calisanSayisi) || 0;
                console.log("[engine_queryCompanyInfo] Found employeeCount from existing contract:", employeeCount);
            }
            if (dangerClass === "Az Tehlikeli" && (c.hizmetAlanIsyeriTehlikeSinifi || c.tehlikeSinifi)) {
                dangerClass = c.hizmetAlanIsyeriTehlikeSinifi || c.tehlikeSinifi || "Az Tehlikeli";
                console.log("[engine_queryCompanyInfo] Found dangerClass from existing contract:", dangerClass);
            }

            const certNo = c.gorevlendirilenKisiSertifikaNo || "";
            const status = c.sozlesmeOnayDurumu === "Onay Bekliyor" || c.sozlesmeOnayDurumuId === 5001 ? "Onay Bekliyor" : "Aktif";

            if (certNo.startsWith("İGU")) {
                hasIGU = true;
                iguEmployee = c.gorevlendirilenKisiAdSoyad;
                iguStatus = status;
            }
            else if (certNo.startsWith("İH")) {
                hasIH = true;
                ihEmployee = c.gorevlendirilenKisiAdSoyad;
                ihStatus = status;
            }
            else if (certNo.startsWith("DSP")) {
                hasDSP = true;
                dspEmployee = c.gorevlendirilenKisiAdSoyad;
                dspStatus = status;
            }
        }

        // Yeniden hesapla (Eğer existing contractlardan veri geldiyse ve hala 0 ise)
        if (requiredMinutes === 0 && employeeCount > 0) {
            const params = MINUTE_CALCULATION_PARAMETERS;
            console.log(`[engine_queryCompanyInfo] Calculating minutes based on employeeCount (${employeeCount}) and dangerClass (${dangerClass})`);
            if (contractType === "İGU") {
                if (dangerClass === "Çok Tehlikeli") requiredMinutes = employeeCount * params.IGU.VERY_DANGEROUS;
                else if (dangerClass === "Tehlikeli") requiredMinutes = employeeCount * params.IGU.DANGEROUS;
                else requiredMinutes = employeeCount * params.IGU.LESS_DANGEROUS;
            } else if (contractType === "İH") {
                if (dangerClass === "Çok Tehlikeli") requiredMinutes = employeeCount * params.IH.VERY_DANGEROUS;
                else if (dangerClass === "Tehlikeli") requiredMinutes = employeeCount * params.IH.DANGEROUS;
                else requiredMinutes = employeeCount * params.IH.LESS_DANGEROUS;
            } else if (contractType === "DSP") {
                if (employeeCount >= 10 && employeeCount <= 49) requiredMinutes = employeeCount * params.DSP.EMPLOYEES_10_49;
                else if (employeeCount >= 50 && employeeCount <= 249) requiredMinutes = employeeCount * params.DSP.EMPLOYEES_50_249;
                else if (employeeCount >= 250) requiredMinutes = employeeCount * params.DSP.EMPLOYEES_250_PLUS;
            }
        }

        console.log("[engine_queryCompanyInfo] Returning data:", { employeeCount, dangerClass, requiredMinutes, hasIGU, hasIH, hasDSP });

        return {
            success: true,
            sgkNo: sgkNo,
            companyName: companyTitle,
            employeeCount: employeeCount,
            dangerClass: dangerClass,
            requiredMinutes: {
                iguMinutes: contractType === "İGU" ? requiredMinutes : 0,
                ihMinutes: contractType === "İH" ? requiredMinutes : 0,
                dspMinutes: contractType === "DSP" ? requiredMinutes : 0
            },
            existingAssignments: { hasIGU, hasIH, hasDSP, iguEmployee, ihEmployee, dspEmployee, iguStatus, ihStatus, dspStatus },
            requiredIguClass: dangerClass === "Çok Tehlikeli" ? "A" : dangerClass === "Tehlikeli" ? "A,B" : "A,B,C"
        };

    } catch (error) {
        // Taslak sözleşmeyi temizle
        if (businessInteractionInstanceId) {
            try {
                await makePostRequest(API_BASE_URL + "/be/surec/surec-sil", {
                    body: { businessInteractionInstanceId, durum: 5005 }
                }, { token }, tabId);
            } catch (e) { }
        }

        return {
            success: false,
            sgkNo: sgkNo,
            error: error.message || "Firma bilgisi alınamadı"
        };
    }
}

/**
 * Çoklu atama gerçekleştirir.
 * @param {Array} assignments - [{ sgkNo, contractType, employeeTckn, requiredMinutes }]
 */
export async function engine_executeBulkAssignment(assignments, onProgress) {
    if (onProgress) onProgress("İSG Katip sekmesi kontrol ediliyor...");

    if (onProgress) onProgress("Oturum kontrol ediliyor...");
    const activeTab = await findActiveKatipTab();

    if (!activeTab) {
        throw new Error("İSG Katip oturumu bulunamadı. Lütfen https://isgkatip.csgb.gov.tr adresinde oturum açın ve sayfayı yenileyin.");
    }

    const { tabId, token } = activeTab;

    const results = { success: 0, failed: 0, details: [] };

    for (let i = 0; i < assignments.length; i++) {
        const assignment = assignments[i];
        // String format (extension UI için)
        if (onProgress) onProgress(`${i + 1}/${assignments.length} atama gerçekleştiriliyor: ${assignment.companyName || assignment.sgkNo}`);
        // Object format (web için)
        if (onProgress) onProgress({ current: i + 1, total: assignments.length, companyName: assignment.companyName || assignment.sgkNo });

        // Rate limiting
        if (i > 0) await new Promise(r => setTimeout(r, 3000));

        let businessInteractionInstanceId = null;

        try {
            const { sgkNo, contractType, employeeTckn, requiredMinutes } = assignment;
            const bsnInterId = contractType === "İGU" ? "103" : contractType === "İH" ? "140" : "177";

            // 1. Sözleşme başlat
            const initResp = await makePostRequest(API_BASE_URL + "/be/bsn-inter/submit", {
                body: { businessInteraction: { bsnInterId }, operationType: "ADD" }
            }, { token }, tabId);

            if (!initResp.ok || initResp.json?.responseStatus !== "SUCCESS") {
                throw new Error("Sözleşme başlatılamadı");
            }

            businessInteractionInstanceId = initResp.json.body.businessInteractionInstanceId;
            const flowInstanceId = initResp.json.body.flowInstances?.[0]?.businessInteractionFlowInstanceId;

            // 2. Uyarı sayfasını geç
            const warningConfig = {
                "İGU": { bsnInterFlowPgId: 10565, bsnInterPgWrngId: 8328, operationId: 27183 },
                "İH": { bsnInterFlowPgId: 10577, bsnInterPgWrngId: 8334, operationId: 27195 },
                "DSP": { bsnInterFlowPgId: 10589, bsnInterPgWrngId: 8340, operationId: 27207 }
            }[contractType];

            const warningResp = await makePostRequest(API_BASE_URL + "/be/quote/updateFlowInstance", {
                body: {
                    quoteKey: { businessInteractionInstanceId },
                    flowInstancePage: { bsnInterFlowInscId: flowInstanceId, bsnInterFlowPgId: warningConfig.bsnInterFlowPgId, name: "Bilgilendirme Sayfası", scrOrd: 1, postActnStId: 1101 },
                    page: { type: "isg.katip.common.dto.bsninter.BusinessInteractionPageWarningDTO", isActv: 1, bsnInterPgWrngId: warningConfig.bsnInterPgWrngId, bsnInterPgId: warningConfig.bsnInterFlowPgId, businessInteractionInstanceId },
                    operation: { isActv: 1, businessInteractionPageOperationId: warningConfig.operationId, operationActionType: 10, businessInteractionPageOperationShortCode: "NEXT" }
                }
            }, { token }, tabId);

            // İşyeri seçimi flow ID'sini bul
            const workplaceFlowId = warningResp.json?.body?.flowInstances?.find(f =>
                f.flowInstancePage?.name?.includes("İşyeri Seçimi") ||
                f.flowInstancePage?.bsnInterFlowPgId === ({ "İGU": 10566, "İH": 10578, "DSP": 10590 }[contractType])
            )?.businessInteractionFlowInstanceId;

            // 3. Firma rolünü kontrol et
            const participantId = { "İGU": 13490, "İH": 13498, "DSP": 13508 }[contractType];
            const roleResp = await makePostRequest(API_BASE_URL + "/be/bsninter/conf/participant/hasRole", {
                body: { bsnInterPrtcptId: participantId, rowId: sgkNo, dataTpId: 280 }
            }, { token }, tabId);

            if (!roleResp.ok || roleResp.json?.responseStatus !== "SUCCESS") {
                throw new Error("Firma doğrulaması başarısız");
            }

            const companyRowId = roleResp.json.body?.rowId || sgkNo;
            console.log("[engine_executeBulkAssignment] companyRowId from hasRole:", companyRowId, "(sgkNo was:", sgkNo, ")");

            // 4. İşyeri katılımcısını ayarla - engine_queryCompanyInfo ile aynı tam yapı
            const workplaceConfig = {
                "İGU": { bsnInterFlowPgId: 10566, bsnInterPgPrtcptId: 6201, bsnInterPrtcptId: 13490, operationId: 27184, ruleSetId: 642 },
                "İH": { bsnInterFlowPgId: 10578, bsnInterPgPrtcptId: 6205, bsnInterPrtcptId: 13498, operationId: 27196, ruleSetId: 642 },
                "DSP": { bsnInterFlowPgId: 10590, bsnInterPgPrtcptId: 6209, bsnInterPrtcptId: 13508, operationId: 27208, ruleSetId: 642 }
            }[contractType];

            // Sidepanel'deki tam yapıyı kullan - tüm gerekli fieldler
            const workplaceResp = await makePostRequest(API_BASE_URL + "/be/quote/updateFlowInstance", {
                body: {
                    quoteKey: { businessInteractionInstanceId },
                    flowInstancePage: {
                        bsnInterFlowInscId: workplaceFlowId || flowInstanceId,
                        bsnInterFlowPgId: workplaceConfig.bsnInterFlowPgId,
                        name: "Sözleşme Yapılacak İşyeri Seçimi Sayfası",
                        descr: "Participant Page",
                        scrOrd: 2,
                        postActnStId: 1101,
                        isAutoComp: 1,
                        isPnr: 1
                    },
                    page: {
                        type: "isg.katip.common.dto.bsninter.participant.BusinessInteractionPageParticipantDTO",
                        isActv: 1,
                        isLocked: false,
                        bsnInterPgPrtcptId: workplaceConfig.bsnInterPgPrtcptId,
                        name: "Sözleşme Yapılacak İşyeri Seçimi Sayfası",
                        descr: "Participant Page",
                        // Sidepanel'deki gibi tam participants yapısı
                        participants: [{
                            isActv: 1,
                            bsnInterPgPrtcptItemId: workplaceConfig.bsnInterPgPrtcptId,
                            bsnInterPrtcptId: workplaceConfig.bsnInterPrtcptId,
                            participantDataTypeId: 280,
                            ruleSetId: workplaceConfig.ruleSetId,
                            verNo: 1,
                            name: "Sözleşme Yapılacak İşyeri",
                            participantName: "isyeri",
                            rowId: companyRowId,
                            dataTpId: 280
                        }],
                        businessInteractionInstanceId,
                        businessInteractionName: { "İGU": "OSGB İLE ÖZEL İŞYERİ ARASINDA İŞ GÜVENLİĞİ UZMANI HİZMET ALIMI SÖZLEŞMESİ", "İH": "OSGB İLE ÖZEL İŞYERİ ARASINDA İŞYERİ HEKİMLİĞİ HİZMET ALIMI SÖZLEŞMESİ", "DSP": "OSGB İLE ÖZEL İŞYERİ ARASINDA DİĞER SAĞLIK PERSONELİ HİZMETİ ALIMI SÖZLEŞMESİ" }[contractType],
                        tarafBilgisi: companyRowId + ",280"
                    },
                    operation: { isActv: 1, businessInteractionPageOperationId: workplaceConfig.operationId, operationActionType: 10, businessInteractionPageOperationName: "İleri", businessInteractionPageOperationShortCode: "NEXT" }
                }
            }, { token }, tabId);


            const newBusinessId = workplaceResp.json?.body?.businessInteractionInstanceId || businessInteractionInstanceId;

            // Personel seçimi flow ID'sini bul - daha güvenilir eşleştirme
            const personnelFlows = workplaceResp.json?.body?.flowInstances || [];
            console.log("[engine_executeBulkAssignment] workplaceResp flowInstances count:", personnelFlows.length);
            console.log("[engine_executeBulkAssignment] workplaceResp flowInstances names:", personnelFlows.map(f => f.flowInstancePage?.name || f.flowInstancePage?.bsnInterFlowPgId).join(", "));

            const personnelPageId = { "İGU": 10567, "İH": 10579, "DSP": 10591 }[contractType];
            let personnelFlowId = personnelFlows.find(f =>
                f.flowInstancePage?.bsnInterFlowPgId === personnelPageId
            )?.businessInteractionFlowInstanceId;

            // Fallback: İsim ile eşleştirme
            if (!personnelFlowId) {
                personnelFlowId = personnelFlows.find(f =>
                    f.flowInstancePage?.name?.includes("Uzmanı Seçimi") ||
                    f.flowInstancePage?.name?.includes("Hekimi Seçimi") ||
                    f.flowInstancePage?.name?.includes("Sağlık Personeli Seçimi") ||
                    (f.flowInstancePage?.name?.includes("Seçimi Sayfası") && !f.flowInstancePage?.name?.includes("İşyeri"))
                )?.businessInteractionFlowInstanceId;
            }

            // Son fallback: workplaceFlowId'den sonraki flow instance
            if (!personnelFlowId && personnelFlows.length > 0) {
                // En son flow instance ID'yi al (genellikle sonraki adım)
                const sortedFlows = personnelFlows.filter(f => f.businessInteractionFlowInstanceId);
                if (sortedFlows.length > 0) {
                    personnelFlowId = sortedFlows[sortedFlows.length - 1].businessInteractionFlowInstanceId;
                    console.log("[engine_executeBulkAssignment] Using last flow instance as fallback:", personnelFlowId);
                }
            }

            // 5. Personel rolünü kontrol et
            const personnelParticipantId = { "İGU": 13491, "İH": 13499, "DSP": 13506 }[contractType];
            const personnelRoleResp = await makePostRequest(API_BASE_URL + "/be/bsninter/conf/participant/hasRole", {
                body: { bsnInterPrtcptId: personnelParticipantId, rowId: employeeTckn, dataTpId: 300 }
            }, { token }, tabId);

            if (!personnelRoleResp.ok || personnelRoleResp.json?.responseStatus !== "SUCCESS") {
                throw new Error("Personel doğrulaması başarısız");
            }

            const personnelRowId = personnelRoleResp.json.body?.rowId || employeeTckn;
            console.log("[engine_executeBulkAssignment] personnelRowId:", personnelRowId);

            // 6. Personel katılımcısını ayarla
            const personnelConfig = {
                "İGU": { bsnInterFlowPgId: 10567, bsnInterPgPrtcptId: 6202, operationId: 27185, ruleSetId: 644 },
                "İH": { bsnInterFlowPgId: 10579, bsnInterPgPrtcptId: 6206, operationId: 27197, ruleSetId: 661 },
                "DSP": { bsnInterFlowPgId: 10591, bsnInterPgPrtcptId: 6210, operationId: 27209, ruleSetId: 667 }
            }[contractType];

            console.log("[engine_executeBulkAssignment] personnelFlowId:", personnelFlowId);

            const personnelResp = await makePostRequest(API_BASE_URL + "/be/quote/updateFlowInstance", {
                body: {
                    quoteKey: { businessInteractionInstanceId: newBusinessId },
                    flowInstancePage: { bsnInterFlowInscId: personnelFlowId, bsnInterFlowPgId: personnelConfig.bsnInterFlowPgId, scrOrd: 3, postActnStId: 1101 },
                    page: {
                        type: "isg.katip.common.dto.bsninter.participant.BusinessInteractionPageParticipantDTO",
                        bsnInterPgPrtcptId: personnelConfig.bsnInterPgPrtcptId,
                        participants: [{ bsnInterPrtcptId: personnelParticipantId, rowId: personnelRowId, dataTpId: 300, ruleSetId: personnelConfig.ruleSetId }],
                        businessInteractionInstanceId: newBusinessId,
                        tarafBilgisi: companyRowId + ",280"
                    },
                    operation: { isActv: 1, businessInteractionPageOperationId: personnelConfig.operationId, operationActionType: 10, businessInteractionPageOperationShortCode: "NEXT" }
                }
            }, { token }, tabId);

            console.log("[engine_executeBulkAssignment] personnelResp status:", personnelResp.ok, personnelResp.json?.responseStatus);
            console.log("[engine_executeBulkAssignment] personnelResp flowInstances:", personnelResp.json?.body?.flowInstances?.length || 0);

            // Sözleşme detayları flow ID'sini bul
            const detailsFlows = personnelResp.json?.body?.flowInstances || [];
            const detailsFlowId = detailsFlows.find(f =>
                f.flowInstancePage?.name?.includes("Bilgileri Giriş") ||
                f.flowInstancePage?.bsnInterFlowPgId === ({ "İGU": 10568, "İH": 10580, "DSP": 10592 }[contractType])
            )?.businessInteractionFlowInstanceId;

            console.log("[engine_executeBulkAssignment] detailsFlowId:", detailsFlowId);

            const finalBusinessId = personnelResp.json?.body?.businessInteractionInstanceId || newBusinessId;

            // 7. Sözleşme detaylarını tamamla - yeni-atama.js'deki completeContractDetails yapısıyla aynı
            const detailsConfig = {
                "İGU": { bsnInterFlowPgId: 10568, bsnInterPgFormId: 7286, bsnInterPgLytId: 7307, businessInteractionName: "OSGB İLE ÖZEL İŞYERİ ARASINDA İŞ GÜVENLİĞİ UZMANI HİZMET ALIMI SÖZLEŞMESİ", businessInteractionPageOperationId: 27186, bsnInterPgCharIdTip: 8957, bsnInterPgCharIdSure: 8958 },
                "İH": { bsnInterFlowPgId: 10580, bsnInterPgFormId: 7288, bsnInterPgLytId: 7309, businessInteractionName: "OSGB İLE ÖZEL İŞYERİ ARASINDA İŞYERİ HEKİMLİĞİ HİZMET ALIMI SÖZLEŞMESİ", businessInteractionPageOperationId: 27198, bsnInterPgCharIdTip: 8965, bsnInterPgCharIdSure: 8966 },
                "DSP": { bsnInterFlowPgId: 10592, bsnInterPgFormId: 7290, bsnInterPgLytId: 7311, businessInteractionName: "OSGB İLE ÖZEL İŞYERİ ARASINDA DİĞER SAĞLIK PERSONELİ HİZMETİ ALIMI SÖZLEŞMESİ", businessInteractionPageOperationId: 27210, bsnInterPgCharIdTip: 8965, bsnInterPgCharIdSure: 8966 }
            }[contractType];

            console.log("[engine_executeBulkAssignment] Completing contract with minutes:", requiredMinutes);

            const completeResp = await makePostRequest(API_BASE_URL + "/be/quote/updateFlowInstance", {
                body: {
                    quoteKey: { businessInteractionInstanceId: finalBusinessId },
                    flowInstancePage: { bsnInterFlowInscId: detailsFlowId, bsnInterFlowPgId: detailsConfig.bsnInterFlowPgId, name: "Sözleşme Bilgileri Giriş Sayfası", scrOrd: 4, postActnStId: 1101 },
                    page: {
                        type: "isg.katip.common.dto.bsninter.BusinessInteractionPageFormDTO",
                        isActv: 1,
                        isLocked: false,
                        bsnInterPgFormId: detailsConfig.bsnInterPgFormId,
                        bsnInterPgId: detailsConfig.bsnInterFlowPgId,
                        name: "Sözleşme Bilgileri Giriş Sayfası",
                        descr: "Form Initialize Page",
                        businessInteractionPageLayouts: [{
                            isActv: 1,
                            bsnInterPgLytId: detailsConfig.bsnInterPgLytId,
                            bsnInterPgFormId: detailsConfig.bsnInterPgFormId,
                            name: "Sözleşme Bilgileri",
                            businessInteractionPageChars: [
                                // Görevlendirme Tipi = Kısmi Süreli (5001)
                                {
                                    isActv: 1,
                                    bsnInterPgCharId: detailsConfig.bsnInterPgCharIdTip,
                                    bsnInterPgLytId: detailsConfig.bsnInterPgLytId,
                                    charId: 3,
                                    name: "Görevlendirme Tipi",
                                    isOvrdn: 0,
                                    isOpt: 0,
                                    tag: "tip",
                                    isLocked: 0,
                                    comments: [],
                                    gnlChar: {
                                        isActv: 1, charId: 3, name: "SOZLESME TIPI", shrtCode: "SOZLESME_TP", valTpId: 10, valDispHintId: 723, isSyst: 1,
                                        valueList: [
                                            { isActv: 1, charValId: 5, charId: 3, valLbl: "Tam Süreli", val: "5000", scrOrd: 1, shrtCode: "TAM_SURELI_SOZLESME", isDflt: 1, isSyst: 1 },
                                            { isActv: 1, charValId: 6, charId: 3, valLbl: "Kısmi Süreli", val: "5001", scrOrd: 2, shrtCode: "KISMI_SURELI_SOZLESME", isDflt: 0, isSyst: 1 }
                                        ]
                                    },
                                    historyCapturedGeneralChars: [],
                                    capturedValue: { capturedValueList: [{ val: "5001", charId: 3, charValId: 6 }] }
                                },
                                // Çalışma Süresi
                                {
                                    isActv: 1,
                                    bsnInterPgCharId: detailsConfig.bsnInterPgCharIdSure,
                                    bsnInterPgLytId: detailsConfig.bsnInterPgLytId,
                                    charId: 4,
                                    name: contractType === "İGU" ? "Çalışma Süresi" : "Çalışma Süresi Dakika",
                                    isOvrdn: 0,
                                    isOpt: 0,
                                    tag: "sure",
                                    isLocked: 0,
                                    comments: [],
                                    gnlChar: {
                                        isActv: 1, charId: 4, name: "CALISMA SURESI", shrtCode: "CALISMA_SURESI_DK", valTpId: 10, valDispHintId: 722, regExprId: 1012, isSyst: 1, valueList: []
                                    },
                                    historyCapturedGeneralChars: [],
                                    capturedValue: { capturedValueList: [{ val: String(requiredMinutes || 0), charId: 4 }] }
                                }
                            ]
                        }],
                        businessInteractionName: detailsConfig.businessInteractionName,
                        businessInteractionInstanceId: finalBusinessId,
                        tags: { tip: "5001", sure: String(requiredMinutes || 0) }
                    },
                    operation: { isActv: 1, businessInteractionPageOperationId: detailsConfig.businessInteractionPageOperationId, operationActionType: 10, businessInteractionPageOperationName: "İleri", businessInteractionPageOperationShortCode: "NEXT" }
                }
            }, { token }, tabId);

            // API bazen ERROR döner ama işlem başarılı olur
            const respStatus = completeResp.json?.responseStatus;
            const messages = completeResp.json?.messages || [];
            const hasSuccessMessage = messages.some(m =>
                m?.includes("başarıyla gerçekleştirilmiştir") || m?.includes("İşleminiz başarıyla gerçekleştirilmiştir")
            );

            // Kritik hata kontrolü - mevcut sözleşme varsa
            const hasExistingContractError = messages.some(m =>
                m?.includes("zaten kayıtlı bir sözleşmesi") ||
                m?.includes("süreç devam ettirilemez") ||
                m?.includes("mevcut bir sözleşme")
            );

            if (hasExistingContractError) {
                // Bu bir hata - mevcut sözleşme var, işlem başarısız
                const errorMessage = "Bu personelin bu firmada zaten aktif veya onay bekleyen bir sözleşmesi var.";
                console.log("[engine_executeBulkAssignment] FAILED - Existing contract detected:", messages);

                // Taslak sözleşmeyi temizle
                try {
                    await makePostRequest(API_BASE_URL + "/be/surec/surec-sil", {
                        body: { businessInteractionInstanceId: finalBusinessId, durum: 5005 }
                    }, { token }, tabId);
                } catch (e) { }

                results.failed++;
                results.details.push({ sgkNo, success: false, message: errorMessage });
                continue; // Sonraki atamaya geç
            }

            if (respStatus === "SUCCESS" || hasSuccessMessage) {
                console.log("[engine_executeBulkAssignment] Contract completion successful");
                results.success++;
                results.details.push({ sgkNo, success: true, message: "Atama başarılı" });
            } else if (respStatus === "ERROR" && !hasSuccessMessage) {
                // Diğer hatalar
                const errorMsg = messages.find(m => m && !m.includes("Exception")) || "Sözleşme tamamlama hatası";
                console.log("[engine_executeBulkAssignment] Contract completion failed:", messages);

                // Taslak sözleşmeyi temizle
                try {
                    await makePostRequest(API_BASE_URL + "/be/surec/surec-sil", {
                        body: { businessInteractionInstanceId: finalBusinessId, durum: 5005 }
                    }, { token }, tabId);
                } catch (e) { }

                results.failed++;
                results.details.push({ sgkNo, success: false, message: errorMsg });
                continue;
            } else {
                // Başarılı
                results.success++;
                results.details.push({ sgkNo, success: true, message: "Atama başarılı" });
            }


        } catch (error) {
            results.failed++;
            results.details.push({ sgkNo: assignment.sgkNo, success: false, message: error.message });

            // Taslak sözleşmeyi temizle
            if (businessInteractionInstanceId) {
                try {
                    await makePostRequest(API_BASE_URL + "/be/surec/surec-sil", {
                        body: { businessInteractionInstanceId, durum: 5005 }
                    }, { token }, tabId);
                } catch (e) { }
            }
        }
    }

    return results;
}


