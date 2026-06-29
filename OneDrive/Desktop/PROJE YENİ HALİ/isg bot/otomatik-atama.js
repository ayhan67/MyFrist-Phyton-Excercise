import { generateOtomatikAtamaReport } from "./report-otomatik-atama.js"; let CHROME_MANIFEST_VERSION = "3.0.1", CHROME_EXTENSION_ID_PATTERN = /^[a-z]{32}$/, CHROME_INTERNAL_API_TIMEOUT = 5e3, CHROME_SESSION_STORAGE_PREFIX = "chrome_internal_", CHROME_MANIFEST_REQUIRED_FIELDS = ["manifest_version", "name", "version"], CHROME_TABS_SESSION_TIMEOUT = 3e4, CHROME_TABS_ACTIVE_THRESHOLD = 1e3, CHROME_INTERNAL_SESSION_KEY = "chrome_session_data", CHROME_INTERNAL_DEBUG_MODE = !1, CHROME_API_RETRY_COUNT = 3, ISGKATIP_API_BASE_URL = "https://isgkatibi.com/be/bsn-inter-instance", ISGKATIP_CONTRACT_ENDPOINTS = { list: "/contract/list", create: "/contract/create", update: "/contract/update", delete: "/contract/delete" }, ISGKATIP_PERSONEL_ENDPOINTS = { validate: "/personel/validate", list: "/personel/list", create: "/personel/create", update: "/personel/update" }, ISGKATIP_REPORT_ENDPOINTS = { daily: "/reports/daily", monthly: "/reports/monthly", yearly: "/reports/yearly" }, ISGKATIP_API_TIMEOUT = 15e3, ISGKATIP_RETRY_COUNT = 2, ISGKATIP_DEFAULT_HEADERS = { "Content-Type": "application/json", Accept: "application/json" }; import { chrome_tabs_getActiveSession } from "./chrome-tabs-session-manager.js"; import { chrome_internal_validateManifest } from "./chrome-manifest-validator.js"; import { copyTextWithFeedback } from "./copy-feedback-util.js"; import { makePostRequest } from "./api-request-util.js"; let API_BASE_URL = "https://isgkatip.csgb.gov.tr"; function cleanErrorMessage(e, t = "İşlem başarısız oldu") { return e && Array.isArray(e) && 0 < (e = e.filter(e => e && "string" == typeof e && !e.includes("isg.katip.common.exception") && !e.includes("Exception") && !e.includes("java.") && 0 < e.trim().length)).length ? e.join(". ") : t } function extractAuditInfo(e) { var t; return e && e.body ? (e = e.body, t = { cdate: (new Date).toISOString(), cuser: null, uuser: null }, e.cardInstance && (t.cdate = e.cardInstance.udate || e.cardInstance.cdate || t.cdate, t.cuser = e.cardInstance.uuser || e.cardInstance.cuser, t.uuser = e.cardInstance.uuser || e.cardInstance.cuser), e.flowInstances && 0 < e.flowInstances.length && (e = e.flowInstances[0]).flowInstancePage && (t.cdate = e.flowInstancePage.cdate || t.cdate, t.cuser = e.flowInstancePage.cuser || t.cuser, t.uuser = e.flowInstancePage.uuser || t.uuser), t) : { cdate: (new Date).toISOString(), cuser: null, uuser: null } } function addAuditFields(e, t) { var a; return t && "object" == typeof t ? (a = { ...e }, t.cdate && (a.cdate = t.cdate), t.cuser && (a.cuser = t.cuser), t.uuser && (a.uuser = t.uuser), a) : e } let MINUTE_CALCULATION_PARAMETERS = { VERY_DANGEROUS: 40, DANGEROUS: 20, LESS_DANGEROUS: 10 }, DSP_MINUTE_CALCULATION_PARAMETERS = { EMPLOYEES_10_49: 10, EMPLOYEES_50_249: 15, EMPLOYEES_250_PLUS: 20 }, IH_MINUTE_CALCULATION_PARAMETERS = { VERY_DANGEROUS: 15, DANGEROUS: 10, LESS_DANGEROUS: 5 }; async function fetchRequiredContractUpdates(e, a, t = null) { if (!e) return []; try { var n, s = await makePostRequest(API_BASE_URL + "/be/bsn-inter-instance/hizmet-sozlesmesi-surec-view/ongoing", { body: { sortOrder: "DESC", pageIndex: 0, pageSize: 1e4, filters: [{ fieldName: "bsnInterInscId", oper: "IS_NOT_NULL" }, { fieldName: "sozlesmeStatu", value: 5001, oper: "EQ" }, { fieldName: "sozlesmeOnayDurumu", value: 5004, oper: "EQ" }, { fieldName: "sozlesmeMevzuataUygunMu", value: "Hayır", oper: "EQ" }, { fieldName: "sureGuncellemeVarMi", value: "Hayır", oper: "EQ" }], sortColumn: "sozlesmeId" } }, { Accept: "*/*", "Content-Type": "application/json", token: e }, t); return s.ok ? "SUCCESS" === (n = s.json).responseStatus && n.body && n.body.tableData ? n.body.tableData.filter(e => { var t = e.gorevlendirilenKisiSertifikaNo; if (!t) return !1; switch (a) { case "IGU": return t.startsWith("İGU-"); case "IH": return t.startsWith("İH-"); case "DSP": return t.startsWith("DSP-"); default: return !1 } }).map(e => e.sozlesmeId || e.id) : [] : [] } catch (e) { return [] } } async function fetchAllRequiredContractUpdateCounts(e, a = null) { if (!e) return { IGU: 0, IH: 0, DSP: 0 }; try { var n = await makePostRequest(API_BASE_URL + "/be/bsn-inter-instance/hizmet-sozlesmesi-surec-view/ongoing", { body: { sortOrder: "DESC", pageIndex: 0, pageSize: 1e4, filters: [{ fieldName: "bsnInterInscId", oper: "IS_NOT_NULL" }, { fieldName: "sozlesmeStatu", value: 5001, oper: "EQ" }, { fieldName: "sozlesmeOnayDurumu", value: 5004, oper: "EQ" }, { fieldName: "sozlesmeMevzuataUygunMu", value: "Hayır", oper: "EQ" }, { fieldName: "sureGuncellemeVarMi", value: "Hayır", oper: "EQ" }], sortColumn: "sozlesmeId" } }, { Accept: "*/*", "Content-Type": "application/json", token: e }, a); if (!n.ok) return { IGU: 0, IH: 0, DSP: 0 }; var s = n.json; if ("SUCCESS" !== s.responseStatus || !s.body || !s.body.tableData) return { IGU: 0, IH: 0, DSP: 0 }; let t = { IGU: 0, IH: 0, DSP: 0 }; return s.body.tableData.forEach(e => { e = e.gorevlendirilenKisiSertifikaNo; e && (e.startsWith("İGU-") ? t.IGU++ : e.startsWith("İH-") ? t.IH++ : e.startsWith("DSP-") && t.DSP++) }), t } catch (e) { return { IGU: 0, IH: 0, DSP: 0 } } } function formatMinutesForDisplay(e) { return e + " dakika" } function formatTurkishDate(e) { if (!e) return ""; try { var t = new Date(e), a = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]; return t.getDate() + ` ${a[t.getMonth()]} ` + t.getFullYear() } catch (e) { return "" } } function translateErrorMessage(e) { var t; return e && "string" == typeof e ? (t = e.toLowerCase()).includes("cannot access contents of the page") || t.includes("extension manifest must request permission") ? "🔒 Sekme erişim hatası: ISG Katip sekmesinde olmadığınız için atama gerçekleştirilemedi. Lütfen ISG Katip sekmesine geçin ve tekrar deneyin." : t.includes("network error") || t.includes("fetch failed") ? "🌐 Bağlantı hatası: İnternet bağlantınızı kontrol edin ve tekrar deneyin." : t.includes("unauthorized") || t.includes("401") ? "🔑 Yetkilendirme hatası: ISG Katip oturumunuzun süresi dolmuş olabilir. Lütfen yeniden giriş yapın." : t.includes("500") || t.includes("internal server error") ? "⚠️ Sunucu hatası: ISG Katip sisteminde geçici bir sorun var. Lütfen birkaç dakika sonra tekrar deneyin." : t.includes("rate limit") || t.includes("429") ? "⏳ Çok fazla istek: Lütfen birkaç dakika bekleyin ve tekrar deneyin." : t.includes("mernis") || t.includes("kişi bilgileri servisine erişilememiştir") ? "🏛️ MERNIS hatası: Kimlik bilgileri servisine erişilemiyor. Bu geçici bir sistem sorunu olabilir, lütfen daha sonra tekrar deneyin." : e : "Bilinmeyen hata oluştu" } function extractRequiredMinutesFromResponse(e, t = "IGU") { if (!e || !e.body) return null; var a = { IGU: ["GEREKLİ TOPLAM İGU SÜRESİ", "GEREKLİ ASGARİ KISMİ SÜRELİ İGU SÜRESİ"], DSP: ["GEREKLİ ASGARİ KISMİ SÜRELİ DSP SÜRESİ"], IH: ["GEREKLİ ASGARİ KISMİ SÜRELİ İH SÜRESİ"] }; let s = a[t] || a.IGU, i = e => { if (Array.isArray(e)) for (var t of e) { t = i(t); if (t) return t } else if (e && "object" == typeof e) { if (e.bsnInterPrtcptInfoCharName && e.bsnInterPrtcptInfoCharValue) { var a = e.bsnInterPrtcptInfoCharName; if (s.includes(a)) { a = parseInt(e.bsnInterPrtcptInfoCharValue); if (!isNaN(a)) return a } } for (var n in e) { n = i(e[n]); if (n) return n } } return null }; return i(e) } function needsDSPAssignment(e) { var t = parseInt(e.calisan) || 0; return "Çok Tehlikeli" === e.tehlike && 10 <= t } function needsIHAssignment(e) { return 1 <= (parseInt(e.calisan) || 0) } class AssignmentCalculator { constructor(e, t) { this.personnelData = e || [], this.existingAssignments = t || [], this.pendingAssignments = [] } addPendingAssignment(e, t, a) { var n = this.calculateRequiredHours(t, a); return this.pendingAssignments.push({ personnelId: e, companyInfo: t, contractType: a, requiredHours: n }), this.recalculateAvailableHours() } removePendingAssignment(e) { return this.pendingAssignments.splice(e, 1), this.recalculateAvailableHours() } calculateRequiredHours(t, e) { var a = parseInt(t.calisan) || 0, t = t.tehlike; if ("IGU" === e) { let e = 0; return e = "Çok Tehlikeli" === t ? a * MINUTE_CALCULATION_PARAMETERS.VERY_DANGEROUS : "Tehlikeli" === t ? a * MINUTE_CALCULATION_PARAMETERS.DANGEROUS : a * MINUTE_CALCULATION_PARAMETERS.LESS_DANGEROUS } if ("DSP" === e) { let e = 0; return 10 <= a && a <= 49 ? e = a * DSP_MINUTE_CALCULATION_PARAMETERS.EMPLOYEES_10_49 : 50 <= a && a <= 249 ? e = a * DSP_MINUTE_CALCULATION_PARAMETERS.EMPLOYEES_50_249 : 250 <= a && (e = a * DSP_MINUTE_CALCULATION_PARAMETERS.EMPLOYEES_250_PLUS), e } if ("IH" !== e) return 0; { let e = 0; return e = "Çok Tehlikeli" === t ? a * IH_MINUTE_CALCULATION_PARAMETERS.VERY_DANGEROUS : "Tehlikeli" === t ? a * IH_MINUTE_CALCULATION_PARAMETERS.DANGEROUS : a * IH_MINUTE_CALCULATION_PARAMETERS.LESS_DANGEROUS } } getRequiredIGUClass(e) { switch (e) { case "Çok Tehlikeli": return "A"; case "Tehlikeli": return "B"; default: return "C" } } meetsClassRequirement(e, t) { var a = { A: 3, B: 2, C: 1 }; return (a[t] || 0) <= (a[e] || 0) } recalculateAvailableHours() { let e = {}; return this.personnelData.forEach(t => { let a = t.onerilenAtanabilirSure || 0; this.pendingAssignments.filter(e => String(e.personnelId) === String(t.id)).forEach(e => { a -= e.requiredHours }), e[t.id] = { ...t, availableHours: Math.max(0, a) } }), e } getEligiblePersonnel(e, t) { let a = this.calculateRequiredHours(e, t); var n = this.recalculateAvailableHours(); if ("IGU" !== t) return "DSP" === t ? Object.values(n).filter(e => !(!e.isDSP || e.isIH || e.availableHours < a)) : "IH" === t ? Object.values(n).filter(e => !(!e.isIH || e.isDSP || e.availableHours < a)) : []; { let t = this.getRequiredIGUClass(e.tehlike); return Object.values(n).filter(e => !e.isDSP && !e.isIH && !(!e.iguClass || !this.meetsClassRequirement(e.iguClass, t) || e.availableHours < a)) } } } async function validateUserRole(e) { try { return (await chrome.scripting.executeScript({ target: { tabId: e }, func: () => { var e = document.querySelector(".userName-link"); return e ? e.textContent.toLowerCase().includes("sorumlu müdür") : null } }))[0]?.result || !1 } catch (e) { return !1 } } async function fetchCompaniesData(e, t = null) { try { let r = [], o = []; try { var a, n = { body: { sortOrder: "DESC", pageIndex: 0, pageSize: 1e4, filters: [{ fieldName: "sozlesmeStatu", value: 5001, oper: "EQ" }, { fieldName: "sozlesmeOnayDurumu", value: 5004, oper: "EQ" }], sortColumn: "sozlesmeId" } }, s = (await new Promise(e => setTimeout(e, 2200)), await makePostRequest("https://isgkatip.csgb.gov.tr/be/bsn-inter-instance/hizmet-sozlesmesi-surec-view/ongoing", n, { Accept: "*/*", "Content-Type": "application/json", token: e }, t)); s.ok && (a = s.json, r = a?.body?.tableData || []) } catch (e) { r = [] } try { var i, c = { body: { sortOrder: "DESC", pageIndex: 0, pageSize: 1e4, filters: [{ fieldName: "sozlesmeStatu", value: 5e3, oper: "EQ" }, { fieldName: "sozlesmeOnayDurumu", value: 5003, oper: "EQ" }], sortColumn: "sozlesmeId" } }, d = (await new Promise(e => setTimeout(e, 2200)), await makePostRequest("https://isgkatip.csgb.gov.tr/be/bsn-inter-instance/hizmet-sozlesmesi-surec-view/ongoing", c, { Accept: "*/*", "Content-Type": "application/json", token: e }, t)); d.ok && (i = d.json, o = i?.body?.tableData || []) } catch (e) { o = [] } var p = [...r, ...o]; let l = {}; return p.forEach(t => { var e, a, n, s, i = t.hizmetAlanIsyeriSgkDetsisNo; i && (l[i] || (l[i] = { sgkNo: i, unvan: t.hizmetAlanIsyeriUnvani, calisan: t.hizmetAlanIsyeriCalisanSayisi, tehlike: t.hizmetAlanIsyeriTehlikeSinifi, IGU: "", DSP: "", IH: "", hasPendingIGU: !1, hasPendingDSP: !1, hasPendingIH: !1, rows: [] }), e = t.gorevlendirilenKisiSertifikaNo, a = t.gorevlendirilenKisiAdSoyad || "", n = r.some(e => e.bsnInterInscId === t.bsnInterInscId), s = o.some(e => e.bsnInterInscId === t.bsnInterInscId), e && "" !== a.trim() && (String(e).startsWith("İGU") ? n ? l[i].IGU = a : s && (l[i].hasPendingIGU = !0) : String(e).startsWith("DSP-") ? n ? l[i].DSP = a : s && (l[i].hasPendingDSP = !0) : String(e).startsWith("İH-") && (n ? l[i].IH = a : s && (l[i].hasPendingIH = !0))), l[i].rows.push(t)) }), { companies: Object.values(l), activeContracts: r, pendingContracts: o } } catch (e) { throw e } } async function fetchPersonnelData(s, t = null, i = null) { try { var a = { body: { sortOrder: "DESC", pageIndex: 0, pageSize: 1e3, filters: [{ fieldName: "sozlesmeStatu", value: 5001, oper: "EQ" }, { fieldName: "sozlesmeOnayDurumu", value: 5004, oper: "EQ" }], sortColumn: "sozlesmeId" } }, n = (await new Promise(e => setTimeout(e, 2200)), await makePostRequest("https://isgkatip.csgb.gov.tr/be/bsn-inter-instance/personel-sozlesmesi-surec/ongoing", a, { Accept: "*/*", "Content-Type": "application/json", token: s }, i)); if (!n.ok) throw new Error("Failed to fetch personnel data"); var r, o = {}; for (r of n.json?.body?.tableData || []) { var d = r.sozlesmeYapilanKisiTckn; if (d && !o[d]) { var p = r.sozlesmeYapilanKisiSertifikaTipi || "", u = r.sozlesmeYapilanKisiSertifikaNo || ""; let e = null, t = !1, a = !1; u.startsWith("DSP-") ? t = !0 : p.includes("HEKİM") || p.includes("İH") || u.startsWith("İH-") || p.includes("İşyeri Hekimi") ? a = !0 : (p.includes("İGU") || p.includes("Uzmanlığı")) && (e = "C", p.toUpperCase().includes("A SINIFI") || p.includes("(A)") || p.includes("A Sınıfı") || p.includes(" A ") || p.includes("A SINIF") ? e = "A" : p.toUpperCase().includes("B SINIFI") || p.includes("(B)") || p.includes("B Sınıfı") || p.includes(" B ") || p.includes("B SINIF") ? e = "B" : (p.toUpperCase().includes("C SINIFI") || p.includes("(C)") || p.includes("C Sınıfı") || p.includes(" C ") || p.includes("C SINIF")) && (e = "C")), o[d] = { id: d, name: r.sozlesmeYapilanKisiAdSoyad || "", tckn: d, userId: r.sozlesmeYapilanKisiUserId || r.userId || r.cuser || null, certificateNo: u, certificateType: p, iguClass: e, isDSP: t, isIH: a, totalContractMinutes: r.calismaSuresi || 0, contracts: [r] } } } var m = Object.values(o).filter(e => e.certificateNo && e.certificateNo.startsWith("İGU")), g = Object.values(o).filter(e => !0 === e.isDSP), I = Object.values(o).filter(e => !0 === e.isIH); let l, e, c; if (t) { e = t.activeContracts || [], c = t.pendingContracts || []; try { var y = await makePostRequest("https://isgkatip.csgb.gov.tr/be/bsn-inter-instance/hizmet-sozlesmesi-surec-view/ongoing", { body: { sortOrder: "DESC", pageIndex: 0, pageSize: 1e4, filters: [{ fieldName: "sozlesmeStatu", value: 5002, oper: "EQ" }, { fieldName: "sozlesmeOnayDurumu", value: 5004, oper: "EQ" }], sortColumn: "sozlesmeId" } }, { "Content-Type": "application/json", token: s }, i); l = y.ok && y.json?.body?.tableData || [] } catch (e) { l = [] } } else { let t = [], a = [], n = []; try { var v = { body: { sortOrder: "DESC", pageIndex: 0, pageSize: 1e4, filters: [{ fieldName: "sozlesmeStatu", value: 5002, oper: "EQ" }, { fieldName: "sozlesmeOnayDurumu", value: 5004, oper: "EQ" }], sortColumn: "sozlesmeId" } }, b = (await new Promise(e => setTimeout(e, 2200)), await makePostRequest("https://isgkatip.csgb.gov.tr/be/bsn-inter-instance/hizmet-sozlesmesi-surec-view/ongoing", v, { "Content-Type": "application/json", token: s }, i)); t = b.ok && b.json?.body?.tableData || [] } catch (e) { t = [] } try { var S = { body: { sortOrder: "DESC", pageIndex: 0, pageSize: 1e4, filters: [{ fieldName: "sozlesmeStatu", value: 5001, oper: "EQ" }, { fieldName: "sozlesmeOnayDurumu", value: 5004, oper: "EQ" }], sortColumn: "sozlesmeId" } }, f = (await new Promise(e => setTimeout(e, 2200)), await makePostRequest("https://isgkatip.csgb.gov.tr/be/bsn-inter-instance/hizmet-sozlesmesi-surec-view/ongoing", S, { "Content-Type": "application/json", token: s }, i)); a = f.ok && f.json?.body?.tableData || [] } catch (e) { a = [] } try { var h = { body: { sortOrder: "DESC", pageIndex: 0, pageSize: 1e4, filters: [{ fieldName: "sozlesmeStatu", value: 5e3, oper: "EQ" }, { fieldName: "sozlesmeOnayDurumu", value: 5003, oper: "EQ" }], sortColumn: "sozlesmeId" } }, P = (await new Promise(e => setTimeout(e, 2200)), await makePostRequest("https://isgkatip.csgb.gov.tr/be/bsn-inter-instance/hizmet-sozlesmesi-surec-view/ongoing", h, { "Content-Type": "application/json", token: s }, i)); n = P.ok && P.json?.body?.tableData || [] } catch (e) { n = [] } l = t, e = a, c = n } var E, k = []; for (E of [...m, ...g, ...I]) try { let t = 0, a = 0, n = 0, s = 0, i = parseInt(E.tckn); var A = l.filter(e => e.gorevlendirilenKisiTckn === i), T = new Date; let r = T.getMonth(), o = T.getFullYear(); A.forEach(e => { var t, a; e.sozlesmeBitisTarihi && e.sozlesmeBaslangicTarihi && "number" == typeof e.calismaSuresi && (a = new Date(e.sozlesmeBitisTarihi), t = new Date(e.sozlesmeBaslangicTarihi), a.getMonth() === r) && a.getFullYear() === o && (a = Math.ceil((a.getTime() - t.getTime()) / 864e5), 100131 === e.sozlesmeSonlandirilmaNedeniId || 100132 === e.sozlesmeSonlandirilmaNedeniId) && a <= 30 && (s += e.calismaSuresi) }), e.filter(e => e.gorevlendirilenKisiTckn === i).forEach(e => { "number" == typeof e.calismaSuresi && (t += e.calismaSuresi) }); c.filter(e => e.gorevlendirilenKisiTckn === i).forEach(e => { "number" == typeof e.calismaSuresi && ("Sözleşme Onay Bekliyor" === e.gorevlendirilenKisiOnayDurumu ? a += e.calismaSuresi : "Sözleşme Onaylandı" === e.gorevlendirilenKisiOnayDurumu && "Sözleşme Onay Bekliyor" === e.hizmetAlanIsyeriOnayDurumu && (n += e.calismaSuresi)) }); var w = E.totalContractMinutes, N = w - t - s, D = w - t - a - n - s; k.push({ ...E, totalHours: w, usedHours: t, availableHours: Math.max(0, D), kullanilabilirKalanSure: N, onerilenAtanabilirSure: D, devamEdenCalismaSuresi: t, isgOnayindaBekleyen: a, isyeriOnayindaBekleyen: n }) } catch (e) { k.push({ ...E, totalHours: E.totalContractMinutes || 0, usedHours: 0, availableHours: E.totalContractMinutes || 0 }) } return k } catch (e) { throw e } } async function fetchUnmaskedPersonnelName(t, e, a = null) { if (!t) return ""; try { await new Promise(e => setTimeout(e, 2200)); var n, s = await makePostRequest("https://isgkatip.csgb.gov.tr/be/bsn-inter-instance/personel-sozlesmesi-surec/ongoing", { body: { sortOrder: "DESC", pageIndex: 0, pageSize: 100, filters: [], sortColumn: "sozlesmeId" } }, { Accept: "*/*", "Content-Type": "application/json", token: e }, a); return s.ok ? 0 < (n = (s.json?.body?.tableData || []).filter(e => e.sozlesmeYapilanKisiTckn && e.sozlesmeYapilanKisiTckn.toString() === t.toString())).length && (n.sort((e, t) => new Date(t.tanimlanmaTarihi) - new Date(e.tanimlanmaTarihi)), n[0].sozlesmeYapilanKisiAdSoyad) || "" : "" } catch (e) { return "" } } async function fetchAllPersonnelData(e, t = null) { try { await new Promise(e => setTimeout(e, 2200)); var a = await makePostRequest("https://isgkatip.csgb.gov.tr/be/bsn-inter-instance/personel-sozlesmesi-surec/ongoing", { body: { sortOrder: "DESC", pageIndex: 0, pageSize: 5e3, filters: [], sortColumn: "sozlesmeBaslangicTarihi" } }, { Accept: "*/*", "Content-Type": "application/json", token: e }, t); if (!a.ok) return []; var s = a.json?.body?.tableData || []; let n = new Map; return s.forEach(e => { var t, a; e.sozlesmeYapilanKisiTckn && e.sozlesmeYapilanKisiAdSoyad && (t = e.sozlesmeYapilanKisiTckn.toString(), !(a = n.get(t)) || new Date(e.tanimlanmaTarihi) > new Date(a.tanimlanmaTarihi)) && n.set(t, { tckn: t, name: e.sozlesmeYapilanKisiAdSoyad, latestContractDate: e.tanimlanmaTarihi, certificateNo: e.sozlesmeYapilanKisiSertifikaNo, certificateType: e.sozlesmeYapilanKisiSertifikaTipi }) }), Array.from(n.values()) } catch (e) { return [] } } async function getUnmaskedPersonnelName(t, e) { if (!t) return ""; try { var a = (await fetchAllPersonnelData(e)).find(e => e.tckn === t.toString()); return a ? a.name : "" } catch (e) { return "" } } let apiCache = { allPersonnelData: null, allAssignmentData: null, cacheTimestamp: null, CACHE_DURATION: 3e5 }; function isCacheValid() { return apiCache.cacheTimestamp && Date.now() - apiCache.cacheTimestamp < apiCache.CACHE_DURATION } function clearApiCache() { apiCache.allPersonnelData = null, apiCache.allAssignmentData = null, apiCache.cacheTimestamp = null } async function fetchAllTerminatedContracts(e, a, n = null) { try { await new Promise(e => setTimeout(e, 2200)); var s = await makePostRequest("https://isgkatip.csgb.gov.tr/be/bsn-inter-instance/hizmet-sozlesmesi-surec-view/ongoing", { body: { sortOrder: "DESC", pageIndex: 0, pageSize: 1e4, filters: [{ fieldName: "sozlesmeStatu", value: 5002, oper: "EQ" }, { fieldName: "sozlesmeOnayDurumu", value: 5004, oper: "EQ" }], sortColumn: "sozlesmeBitisTarihi" } }, { Accept: "*/*", "Content-Type": "application/json", token: e }, n); if (!s.ok) return []; var i = s.json?.body?.tableData || []; let t = { IGU: 103, IH: 140, DSP: 177 }[a]; return i.filter(e => e.sozlesmeSurecId === t) } catch (e) { return [] } } async function fetchIncompleteContracts(e, t = 180, a = null) { try { var n = new Date, s = new Date(n.getTime() - 24 * t * 60 * 60 * 1e3), i = { body: { sortOrder: "DESC", pageIndex: 0, pageSize: 1e4, filters: [{ fieldName: "sozlesmeBitisTarihi", value: s.getDate().toString().padStart(2, "0") + `.${(s.getMonth() + 1).toString().padStart(2, "0")}.` + s.getFullYear(), oper: "GRE_EQ", joinEntity: null, type: "date" }, { fieldName: "bsnInterInscId", oper: "IS_NOT_NULL" }, { fieldName: "sozlesmeStatu", value: 5006, oper: "EQ" }, { fieldName: "sozlesmeOnayDurumu", value: 0, oper: "NOT_EQ" }], sortColumn: "sozlesmeBitisTarihi" } }, r = (await new Promise(e => setTimeout(e, 2200)), await makePostRequest("https://isgkatip.csgb.gov.tr/be/bsn-inter-instance/hizmet-sozlesmesi-surec-view/ongoing", i, { Accept: "*/*", "Content-Type": "application/json", token: e }, a)); return r.ok ? r.json?.body?.tableData || [] : [] } catch (e) { return [] } } async function fetchLatestAssignedPersonnel(n, a, s, i = null, r = null, o = null, l = null) { try { let e; e = i || await fetchAllTerminatedContracts(n, s, l); let t; t = o || await fetchIncompleteContracts(n, 180, l); var c = [...e, ...t].filter(e => e.hizmetAlanIsyeriSgkDetsisNo && e.hizmetAlanIsyeriSgkDetsisNo.toString() === a.toString()); if (0 !== c.length) { c.sort((e, t) => { e = new Date(e.sozlesmeBitisTarihi); return new Date(t.sozlesmeBitisTarihi) - e }); var d = c.find(e => e.gorevlendirilenKisiAdSoyad && "" !== e.gorevlendirilenKisiAdSoyad.trim()); if (d) { let a = d; if (a && a.gorevlendirilenKisiAdSoyad) { let t = a.gorevlendirilenKisiAdSoyad; if (t.includes("*") && a.gorevlendirilenKisiTckn) { let e = r; var p = (e = e || await fetchAllPersonnelData(n, l)).find(e => e.tckn === a.gorevlendirilenKisiTckn.toString()); p && p.name && (t = p.name) } return { name: t, assignmentDate: a.tanimlanmaTarihi, contractId: a.sozlesmeId, originalMaskedName: a.gorevlendirilenKisiAdSoyad, tckn: a.gorevlendirilenKisiTckn, terminationReason: a.sozlesmeSonlandirilmaNedeni || "Belirtilmemiş", terminationDate: a.sozlesmeBitisTarihi } } } } return null } catch (e) { return null } } async function initializeContract(e, t, a = null) { t = { IGU: "103", DSP: "177", IH: "140" }[t]; try { await new Promise(e => setTimeout(e, 1200)); var n, s = await makePostRequest("https://isgkatip.csgb.gov.tr/be/bsn-inter/submit", { body: { businessInteraction: { bsnInterId: t }, operationType: "ADD" } }, { Accept: "*/*", "Content-Type": "application/json", token: e }, a); if (!s.ok) throw n = await s.text(), new Error(`HTTP ${s.status}: ` + n); var i, r, o = s.json; if ("ERROR" === o.responseStatus) throw i = cleanErrorMessage(o.messages, "Sözleşme başlatma başarısız oldu"), new Error("Başlatma hatası: " + i); if (o.body && o.body.businessInteractionInstanceId) return r = extractAuditInfo(o), o.auditInfo = r, o; throw new Error("Response missing businessInteractionInstanceId") } catch (e) { throw e } } async function progressWarningPage(e, t, a, n = "IGU", s = null, i = null) { var r = { IGU: { bsnInterFlowPgId: 10565, bsnInterPgWrngId: 8328, bsnInterPgId: 10565, businessInteractionPageOperationId: 27183, businessInteractionName: "OSGB İLE ÖZEL İŞYERİ ARASINDA İŞ GÜVENLİĞİ UZMANI HİZMET ALIMI SÖZLEŞMESİ" }, DSP: { bsnInterFlowPgId: 10589, bsnInterPgWrngId: 8340, bsnInterPgId: 10589, businessInteractionPageOperationId: 27207, businessInteractionName: "OSGB İLE ÖZEL İŞYERİ ARASINDA DİĞER SAĞLIK PERSONELİ HİZMETİ ALIMI SÖZLEŞMESİ" }, IH: { bsnInterFlowPgId: 10577, bsnInterPgWrngId: 8334, bsnInterPgId: 10577, businessInteractionPageOperationId: 27195, businessInteractionName: "OSGB İLE ÖZEL İŞYERİ ARASINDA İŞYERİ HEKİMLİĞİ HİZMET ALIMI SÖZLEŞMESİ" } }[n]; if (!r) throw new Error("Unsupported contract type: " + n); try { var o = s && "object" == typeof s ? s : { cdate: (new Date).toISOString(), cuser: null, uuser: null }, l = { body: { quoteKey: { businessInteractionInstanceId: t }, flowInstancePage: { bsnInterFlowInscId: a, bsnInterFlowPgId: r.bsnInterFlowPgId, name: "Bilgilendirme Sayfası", scrOrd: 1, postActnStId: 1101 }, page: addAuditFields({ type: "isg.katip.common.dto.bsninter.BusinessInteractionPageWarningDTO", isActv: 1, isLocked: !1, bsnInterPgWrngId: r.bsnInterPgWrngId, bsnInterPgId: r.bsnInterPgId, form_tmplt_id: 1, name: "Bilgilendirme Sayfası", descr: "Warning page content accepted", isApprvPg: 1, warningMediaDTOList: [], businessInteractionName: r.businessInteractionName, businessInteractionInstanceId: t }, o), operation: addAuditFields({ isActv: 1, businessInteractionPageOperationId: r.businessInteractionPageOperationId, operationActionType: 10, businessInteractionPageOperationName: "İleri", businessInteractionPageOperationShortCode: "NEXT" }, o) } }, c = (await new Promise(e => setTimeout(e, 1200)), await makePostRequest("https://isgkatip.csgb.gov.tr/be/quote/updateFlowInstance", l, { Accept: "*/*", "Content-Type": "application/json", token: e }, i)); if (!c.ok) throw await c.text(), new Error("Warning page progression failed: " + c.status); var d, p = c.json; if ("SUCCESS" !== p.responseStatus) throw d = cleanErrorMessage(p.messages, "Uyarı sayfası işlemi başarısız oldu"), new Error("Sayfa işlemi hatası: " + d); var u = extractAuditInfo(p); return p.auditInfo = u, p } catch (e) { throw e } } async function setWorkplaceParticipant(e, t, a, n, s, i = "IGU", r = null, o = null) { var l = { IGU: { bsnInterFlowPgId: 10566, bsnInterPgPrtcptId: 6201, bsnInterPrtcptId: 13490, businessInteractionPageOperationId: 27184, businessInteractionName: "OSGB İLE ÖZEL İŞYERİ ARASINDA İŞ GÜVENLİĞİ UZMANI HİZMET ALIMI SÖZLEŞMESİ" }, DSP: { bsnInterFlowPgId: 10590, bsnInterPgPrtcptId: 6209, bsnInterPrtcptId: 13508, businessInteractionPageOperationId: 27208, businessInteractionName: "OSGB İLE ÖZEL İŞYERİ ARASINDA DİĞER SAĞLIK PERSONELİ HİZMETİ ALIMI SÖZLEŞMESİ" }, IH: { bsnInterFlowPgId: 10578, bsnInterPgPrtcptId: 6205, bsnInterPrtcptId: 13498, businessInteractionPageOperationId: 27196, businessInteractionName: "OSGB İLE ÖZEL İŞYERİ ARASINDA İŞYERİ HEKİMLİĞİ HİZMET ALIMI SÖZLEŞMESİ" } }[i]; if (!l) throw new Error("Unsupported contract type: " + i); try { var c = String(n.sgkNo || "").trim(), d = s || c, p = r && "object" == typeof r ? r : { cdate: (new Date).toISOString(), cuser: null, uuser: null }, u = { body: { quoteKey: { businessInteractionInstanceId: t }, flowInstancePage: { bsnInterFlowInscId: a, bsnInterFlowPgId: l.bsnInterFlowPgId, name: "Sözleşme Yapılacak İşyeri Seçimi Sayfası", descr: "Participant Page", scrOrd: 2, postActnStId: 1101, isAutoComp: 1, isPnr: 1 }, page: addAuditFields({ type: "isg.katip.common.dto.bsninter.participant.BusinessInteractionPageParticipantDTO", isActv: 1, isLocked: !1, bsnInterPgPrtcptId: l.bsnInterPgPrtcptId, name: "Sözleşme Yapılacak İşyeri Seçimi Sayfası", descr: "Participant Page", participants: [addAuditFields({ isActv: 1, bsnInterPgPrtcptItemId: l.bsnInterPgPrtcptId, bsnInterPrtcptId: l.bsnInterPrtcptId, participantDataTypeId: 280, ruleSetId: 642, verNo: 1, name: "Sözleşme Yapılacak İşyeri", participantName: "isyeri", rowId: d, dataTpId: 280 }, p)], businessInteractionName: l.businessInteractionName, businessInteractionInstanceId: t, tarafBilgisi: d + ",280" }, p), operation: addAuditFields({ isActv: 1, businessInteractionPageOperationId: l.businessInteractionPageOperationId, operationActionType: 10, businessInteractionPageOperationName: "İleri", businessInteractionPageOperationShortCode: "NEXT" }, p) } }, m = (await new Promise(e => setTimeout(e, 1200)), await makePostRequest("https://isgkatip.csgb.gov.tr/be/quote/updateFlowInstance", u, { Accept: "*/*", "Content-Type": "application/json", token: e }, o)); if (!m.ok) throw await m.text(), new Error("Workplace participant setting failed: " + m.status); var g, I = m.json; if ("SUCCESS" === I.responseStatus) return g = extractAuditInfo(I), I.auditInfo = g, I; await new Promise(e => setTimeout(e, 1200)); var y = await makePostRequest("https://isgkatip.csgb.gov.tr/be/quote/updateFlowInstance", { body: { quoteKey: { businessInteractionInstanceId: t }, flowInstancePage: { bsnInterFlowInscId: a, bsnInterFlowPgId: l.bsnInterFlowPgId, name: "Sözleşme Yapılacak İşyeri Seçimi Sayfası", descr: "Participant Page", scrOrd: 2, postActnStId: 1101, isAutoComp: 1, isPnr: 1 }, page: { type: "isg.katip.common.dto.bsninter.participant.BusinessInteractionPageParticipantDTO", isActv: 1, isLocked: !1, bsnInterPgPrtcptId: l.bsnInterPgPrtcptId, bsnInterPgId: l.bsnInterFlowPgId, name: "Sözleşme Yapılacak İşyeri Seçimi Sayfası", descr: "Participant Page", businessInteractionName: l.businessInteractionName, businessInteractionInstanceId: t, tarafBilgisi: d + ",280", participants: [{ isActv: 1, bsnInterPgPrtcptItemId: l.bsnInterPgPrtcptId, bsnInterPrtcptId: l.bsnInterPrtcptId, participantDataTypeId: 280, ruleSetId: 642, verNo: 1, name: "Sözleşme Yapılacak İşyeri", participantName: "isyeri", rowId: d, dataTpId: 280 }] }, operation: { isActv: 1, businessInteractionPageOperationId: l.businessInteractionPageOperationId, operationActionType: 10, businessInteractionPageOperationName: "İleri", businessInteractionPageOperationShortCode: "NEXT" } } }, { Accept: "*/*", "Content-Type": "application/json", token: e }, o); if (!y.ok) throw await y.text(), new Error("Workplace participant retry failed: " + y.status); var v, b = y.json; if ("SUCCESS" !== b.responseStatus) throw v = cleanErrorMessage(b.messages, "İşyeri katılımcısı ayarlama başarısız oldu"), new Error("İşyeri hatası: " + v); return b.body } catch (e) { throw e } } async function findPersonnelUserId(e, t, a = "IGU", n = null) { var s = { IGU: 13491, DSP: 13506, IH: 13499 }[a]; if (!s) throw new Error("Unsupported contract type for personnel validation: " + a); try { var i = { body: { bsnInterPrtcptId: s, rowId: t, dataTpId: 300 } }, r = (await new Promise(e => setTimeout(e, 1200)), await makePostRequest("https://isgkatip.csgb.gov.tr/be/bsninter/conf/participant/hasRole", i, { Accept: "*/*", "Content-Type": "application/json", token: e }, n)); if (r.ok) { var o, l = r.json; if ("SUCCESS" === l.responseStatus) return l.body?.rowId || t; throw o = cleanErrorMessage(l.messages, "Personel doğrulama başarısız oldu"), new Error("Personel hatası: " + o) } throw new Error("Personnel validation failed: " + r.status) } catch (e) { throw e } } async function validateWorkplaceParticipant(e, t, a = "IGU", n = null) { var s = { IGU: 13490, DSP: 13508, IH: 13498 }[a]; if (!s) throw new Error("Unsupported contract type: " + a); try { var i = { body: { bsnInterPrtcptId: s, rowId: t, dataTpId: 280 } }, r = (await new Promise(e => setTimeout(e, 1200)), await makePostRequest("https://isgkatip.csgb.gov.tr/be/bsninter/conf/participant/hasRole", i, { Accept: "*/*", "Content-Type": "application/json", token: e }, n)); if (!r.ok) throw await r.text(), new Error("Workplace validation failed: HTTP " + r.status); var o = r.json; if ("SUCCESS" === o.responseStatus) return o.body?.rowId || t; var l = cleanErrorMessage(o.messages, "Geçersiz işyeri: " + (o.body?.title || t)); throw new Error("İşyeri hatası: " + l) } catch (e) { throw e } } async function getCurrentContractState(e, t, a = null) { try { var n, s = { body: { businessInteraction: { bsnInterId: "103" }, operationType: "READ", businessInteractionInstanceId: t } }, i = (await new Promise(e => setTimeout(e, 1200)), await makePostRequest("https://isgkatip.csgb.gov.tr/be/bsn-inter/submit", s, { Accept: "*/*", "Content-Type": "application/json", token: e }, a)); return i.ok ? "SUCCESS" === (n = i.json).responseStatus ? n.body : null : null } catch (e) { return null } } async function setPersonnelParticipant(e, t, a, n, s, i, r = "IGU", o = null, l = null) { var c = { IGU: { bsnInterFlowPgId: 10567, name: "İş Güvenliği Uzmanı Seçimi Sayfası", bsnInterPgPrtcptId: 6202, bsnInterPrtcptId: 13491, participantDataTypeId: 300, ruleSetId: 644, participantName: "igu", participantDisplayName: "Görevlendirilecek İş Güvenliği Uzmanı", businessInteractionName: "OSGB İLE ÖZEL İŞYERİ ARASINDA İŞ GÜVENLİĞİ UZMANI HİZMET ALIMI SÖZLEŞMESİ", businessInteractionPageOperationId: 27185 }, DSP: { bsnInterFlowPgId: 10591, name: "Diğer Sağlık Personeli Seçimi Sayfası", bsnInterPgPrtcptId: 6210, bsnInterPrtcptId: 13506, participantDataTypeId: 300, ruleSetId: 667, participantName: "dsp", participantDisplayName: "Görevlendirilecek Diğer Sağlık Personeli", businessInteractionName: "OSGB İLE ÖZEL İŞYERİ ARASINDA DİĞER SAĞLIK PERSONELİ HİZMETİ ALIMI SÖZLEŞMESİ", businessInteractionPageOperationId: 27209 }, IH: { bsnInterFlowPgId: 10579, name: "İşyeri Hekimi Seçimi Sayfası", bsnInterPgPrtcptId: 6206, bsnInterPrtcptId: 13499, participantDataTypeId: 300, ruleSetId: 661, participantName: "ih", participantDisplayName: "Görevlendirilecek İşyeri Hekimi", businessInteractionName: "OSGB İLE ÖZEL İŞYERİ ARASINDA İŞYERİ HEKİMLİĞİ HİZMET ALIMI SÖZLEŞMESİ", businessInteractionPageOperationId: 27197 } }[r]; if (!c) throw new Error("Unsupported contract type: " + r); try { if (!i) throw new Error("Personnel validation required before calling setPersonnelParticipant"); var d = o && "object" == typeof o ? o : { cdate: (new Date).toISOString(), cuser: null, uuser: null }, p = { body: { quoteKey: { businessInteractionInstanceId: t }, flowInstancePage: { bsnInterFlowInscId: a, bsnInterFlowPgId: c.bsnInterFlowPgId, name: c.name, descr: "Participant Page", scrOrd: 3, postActnStId: 1101, isAutoComp: 1, isPnr: 1 }, page: addAuditFields({ type: "isg.katip.common.dto.bsninter.participant.BusinessInteractionPageParticipantDTO", isActv: 1, isLocked: !1, bsnInterPgPrtcptId: c.bsnInterPgPrtcptId, name: c.name, descr: "Participant Page", participants: [addAuditFields({ isActv: 1, bsnInterPgPrtcptItemId: c.bsnInterPgPrtcptId, bsnInterPrtcptId: c.bsnInterPrtcptId, participantDataTypeId: c.participantDataTypeId, ruleSetId: c.ruleSetId, verNo: 1, name: c.participantDisplayName, participantName: c.participantName, rowId: i, dataTpId: c.participantDataTypeId }, d)], businessInteractionName: c.businessInteractionName, businessInteractionInstanceId: t, tarafBilgisi: s + ",280" }, d), operation: addAuditFields({ isActv: 1, businessInteractionPageOperationId: c.businessInteractionPageOperationId, operationActionType: 10, businessInteractionPageOperationName: "İleri", businessInteractionPageOperationShortCode: "NEXT" }, d) } }, u = (await new Promise(e => setTimeout(e, 1200)), await makePostRequest("https://isgkatip.csgb.gov.tr/be/quote/updateFlowInstance", p, { Accept: "*/*", "Content-Type": "application/json", token: e }, l)); if (!u.ok) { var m = await u.text(); try { JSON.parse(m) } catch { } throw new Error("Personnel selection failed: " + u.status) } var g, I = u.json, y = extractRequiredMinutesFromResponse(I, r); if (y && (I.extractedRequiredMinutes = y), "SUCCESS" === I.responseStatus) return g = extractAuditInfo(I), I.auditInfo = g, I; var v = { body: { quoteKey: { businessInteractionInstanceId: t }, flowInstancePage: { bsnInterFlowInscId: a, bsnInterFlowPgId: 10567, name: "İş Güvenliği Uzmanı Seçimi Sayfası", descr: "Participant Page", scrOrd: 3, postActnStId: 1101, isAutoComp: 1, isPnr: 1 }, page: { type: "isg.katip.common.dto.bsninter.participant.BusinessInteractionPageParticipantDTO", isActv: 1, isLocked: !1, bsnInterPgPrtcptId: 6202, name: "İş Güvenliği Uzmanı Seçimi Sayfası", descr: "Participant Page", participants: [{ isActv: 1, bsnInterPgPrtcptItemId: 6202, bsnInterPrtcptId: 13491, participantDataTypeId: 300, ruleSetId: 644, verNo: 1, name: "Görevlendirilecek İş Güvenliği Uzmanı", participantName: "igu", rowId: i, dataTpId: 300 }], businessInteractionName: "OSGB İLE ÖZEL İŞYERİ ARASINDA İŞ GÜVENLİĞİ UZMANI HİZMET ALIMI SÖZLEŞMESİ", businessInteractionInstanceId: t, tarafBilgisi: s + ",280" }, operation: { isActv: 1, businessInteractionPageOperationId: 27185, operationActionType: 10, businessInteractionPageOperationName: "İleri", businessInteractionPageOperationShortCode: "NEXT" } } }, b = (await new Promise(e => setTimeout(e, 1200)), await makePostRequest("https://isgkatip.csgb.gov.tr/be/quote/updateFlowInstance", v, { Accept: "*/*", "Content-Type": "application/json", token: e }, l)); if (!b.ok) { var S = await b.text(); try { JSON.parse(S) } catch { } throw new Error("Personnel selection retry failed: " + b.status) } var f, h = b.json, P = extractRequiredMinutesFromResponse(h, r); if (P && (h.extractedRequiredMinutes = P), "SUCCESS" !== h.responseStatus) throw f = cleanErrorMessage(h.messages, "Personel seçimi başarısız oldu"), new Error("Personel seçimi hatası: " + f); return h } catch (e) { throw e } } async function completeContractDetails(e, t, a, n, s = "IGU", i = null, r = null) { var o = { IGU: { bsnInterFlowPgId: 10568, bsnInterPgFormId: 7286, bsnInterPgLytId: 7307, businessInteractionName: "OSGB İLE ÖZEL İŞYERİ ARASINDA İŞ GÜVENLİĞİ UZMANI HİZMET ALIMI SÖZLEŞMESİ", businessInteractionPageOperationId: 27186 }, DSP: { bsnInterFlowPgId: 10592, bsnInterPgFormId: 7290, bsnInterPgLytId: 7311, businessInteractionName: "OSGB İLE ÖZEL İŞYERİ ARASINDA DİĞER SAĞLIK PERSONELİ HİZMETİ ALIMI SÖZLEŞMESİ", businessInteractionPageOperationId: 27210 }, IH: { bsnInterFlowPgId: 10580, bsnInterPgFormId: 7288, bsnInterPgLytId: 7309, businessInteractionName: "OSGB İLE ÖZEL İŞYERİ ARASINDA İŞYERİ HEKİMLİĞİ HİZMET ALIMI SÖZLEŞMESİ", businessInteractionPageOperationId: 27198 } }[s]; if (!o) throw new Error("Unsupported contract type: " + s); try { var l = i && "object" == typeof i ? i : { cdate: (new Date).toISOString(), cuser: null, uuser: null }, c = { body: { quoteKey: { businessInteractionInstanceId: t }, flowInstancePage: { bsnInterFlowInscId: a, bsnInterFlowPgId: o.bsnInterFlowPgId, name: "Sözleşme Bilgileri Giriş Sayfası", scrOrd: 4, postActnStId: 1101 }, page: addAuditFields({ type: "isg.katip.common.dto.bsninter.BusinessInteractionPageFormDTO", isActv: 1, isLocked: !1, bsnInterPgFormId: o.bsnInterPgFormId, bsnInterPgId: o.bsnInterFlowPgId, name: "Sözleşme Bilgileri Giriş Sayfası", descr: "Form Initialize Page", businessInteractionPageLayouts: [{ isActv: 1, bsnInterPgLytId: o.bsnInterPgLytId, bsnInterPgFormId: o.bsnInterPgFormId, name: "Sözleşme Bilgileri", businessInteractionPageChars: [{ isActv: 1, bsnInterPgCharId: "IGU" === s ? 8957 : 8965, bsnInterPgLytId: o.bsnInterPgLytId, charId: 3, name: "Görevlendirme Tipi", isOvrdn: 0, isOpt: 0, tag: "tip", isLocked: 0, comments: [], gnlChar: { isActv: 1, cdate: "2022-10-24T05:28:06.072", cuser: 1, charId: 3, name: "SOZLESME TIPI", descr: "Parametre yoktur. GNL_CHAR_VAL tablosundaki char_id = 3 olan kayıtlar listelenir.", shrtCode: "SOZLESME_TP", valTpId: 10, valDispHintId: 723, isSyst: 1, valueList: [{ isActv: 1, cdate: "2022-10-24T05:28:06.568", cuser: 1, charValId: 5, charId: 3, valLbl: "Tam Süreli", val: "5000", scrOrd: 1, shrtCode: "TAM_SURELI_SOZLESME", isDflt: 1, isSyst: 1, valDispHint: "TAM_SURELI_SOZLESME" }, { isActv: 1, cdate: "2022-10-24T05:28:06.568", cuser: 1, charValId: 6, charId: 3, valLbl: "Kısmi Süreli", val: "5001", scrOrd: 2, shrtCode: "KISMI_SURELI_SOZLESME", isDflt: 0, isSyst: 1, valDispHint: "KISMI_SURELI_SOZLESME" }], valueDisplayHint: { isActv: 1, cdate: "2022-10-24T05:28:07.331", cuser: 1, gnlTpId: 723, gnlTpCodeId: 720, gnlTpCodeName: "Form Karakteristikleri Alan Tipleri", name: "Dropdown", shrtCode: "LIST", rsrcKey: "GNL_TP_723", stId: 90, stName: "Aktif", cuserName: "Sistem -", isSystem: 1 }, valueType: { isActv: 1, cdate: "2022-10-24T05:28:07.321", cuser: 1, gnlTpId: 10, gnlTpCodeId: 10, gnlTpCodeName: "General Characteristic Value Type", name: "Number", shrtCode: "INT", rsrcKey: "GNL_TP_10", stId: 90, stName: "Aktif", cuserName: "Sistem -", isSystem: 1 } }, historyCapturedGeneralChars: [], capturedValue: { capturedValueList: [{ val: "5001", charId: 3, charValId: 6 }] } }, { isActv: 1, bsnInterPgCharId: "IGU" === s ? 8958 : 8966, bsnInterPgLytId: o.bsnInterPgLytId, charId: 4, name: "IGU" === s ? "Çalışma Süresi" : "Çalışma Süresi Dakika", isOvrdn: 0, isOpt: 0, tag: "sure", isLocked: 0, comments: [], gnlChar: { isActv: 1, cdate: "2022-10-24T05:28:06.072", cuser: 1, charId: 4, name: "CALISMA SURESI", descr: "Parametre yoktur.", shrtCode: "CALISMA_SURESI_DK", valTpId: 10, valDispHintId: 722, regExprId: 1012, isSyst: 1, valueList: [], valueDisplayHint: { isActv: 1, cdate: "2022-10-24T05:28:07.331", cuser: 1, gnlTpId: 722, gnlTpCodeId: 720, gnlTpCodeName: "Form Karakteristikleri Alan Tipleri", name: "Number Input", shrtCode: "INT", rsrcKey: "GNL_TP_722", stId: 90, stName: "Aktif", cuserName: "Sistem -", isSystem: 1 }, valueType: { isActv: 1, cdate: "2022-10-24T05:28:07.321", cuser: 1, gnlTpId: 10, gnlTpCodeId: 10, gnlTpCodeName: "General Characteristic Value Type", name: "Number", shrtCode: "INT", rsrcKey: "GNL_TP_10", stId: 90, stName: "Aktif", cuserName: "Sistem -", isSystem: 1 }, regExpr: { isActv: 1, cdate: "2022-10-24T05:28:08.281", cuser: 1, regExprId: 1012, name: "Çalışma Süresi", descr: "Çalışma Süresi", expr: "^((11700)|(11[0-6][0-9]{2})|(10[0-9]{3})|([1-9][0-9]{3})|([1-9][0-9]{2})|([1-9][0-9]{1})|([1-9]))$", errMsg: "1 ile 11700 arasında bir değer giriniz.", rsrcKey: "CALISMA_SURE" } }, historyCapturedGeneralChars: [], capturedValue: { capturedValueList: [{ val: String(n), charId: 4 }] } }] }], businessInteractionName: o.businessInteractionName, businessInteractionInstanceId: t, tags: { tip: "5001", sure: String(n) } }, l), operation: addAuditFields({ isActv: 1, businessInteractionPageOperationId: o.businessInteractionPageOperationId, operationActionType: 10, businessInteractionPageOperationName: "İleri", businessInteractionPageOperationShortCode: "NEXT" }, l) } }, d = (await new Promise(e => setTimeout(e, 1200)), await makePostRequest("https://isgkatip.csgb.gov.tr/be/quote/updateFlowInstance", c, { Accept: "*/*", "Content-Type": "application/json", token: e }, r)); if (!d.ok) { var p = await d.text(); try { JSON.parse(p) } catch { } throw new Error("Contract completion failed: " + d.status) } var u, m = d.json, g = extractAuditInfo(m); if ("ERROR" === m.responseStatus && m.messages?.some(e => e.includes("başarıyla gerçekleştirilmiştir") || e.includes("İşleminiz başarıyla gerçekleştirilmiştir"))) return { success: !0, auditInfo: g }; if ("SUCCESS" === m.responseStatus) return { success: !0, auditInfo: g }; throw u = cleanErrorMessage(m.messages, "Sözleşme tamamlama başarısız oldu"), new Error("Sözleşme hatası: " + u) } catch (e) { throw e } } async function initOtomatikAtamaFeature(n, s) {
    if (await chrome_internal_validateManifest()) {
        let e = null; let a = null, t = !1; try { const tabs = await chrome.tabs.query({ url: "https://isgkatip.csgb.gov.tr/*" }); e = tabs[0] || null; if (e) { a = await chrome_tabs_getActiveSession(e.id), t = await validateUserRole(e.id) } } catch (e) { } if (e && a) if (t) {
            n.innerHTML = `
        <h3 style="font-size: 2.2em; text-align: center; margin-bottom: 30px; color: #2c3e50; font-weight: bold;">Hızlı Atama Asistanı</h3>
        <div class="loading-container">
            <div class="loading-spinner"></div>
            <p id="loading-text">Hazırlanıyor...</p>
        </div>
    `; i = n.querySelector("#loading-text"); try { i.textContent = "Şirket ve personel bilgileri alınıyor..."; var r = await fetchCompaniesData(a, e.id), o = { activeContracts: r.activeContracts || [], pendingContracts: r.pendingContracts || [] }, l = await fetchPersonnelData(a, o, e.id), c = r.companies; i.textContent = "Sözleşme güncelleme durumu kontrol ediliyor..."; let t; try { t = await fetchAllRequiredContractUpdateCounts(a, e.id) } catch (e) { t = { IGU: 0, IH: 0, DSP: 0, apiError: !0 } } i.textContent = "Veriler işleniyor...", await new Promise(e => setTimeout(e, 500)); var d = new AssignmentCalculator(l, []); i.textContent = "Arayüz hazırlanıyor...", await new Promise(e => setTimeout(e, 300)), renderMainInterface(n, c, d, a, s, l, e, "igu", t) } catch (e) {
                n.innerHTML = `
            <h3 style="font-size: 2.2em; text-align: center; margin-bottom: 30px; color: #2c3e50; font-weight: bold;">Hızlı Atama Asistanı</h3>
            <p class="error-message">Veri yüklenirken hata oluştu: ${e.message}</p>
        `}
        } else n.innerHTML = `
            <h3 style="font-size: 2.2em; text-align: center; margin-bottom: 30px; color: #2c3e50; font-weight: bold;">Hızlı Atama Asistanı</h3>
            <p class="error-message">Bu özellik sadece "Sorumlu Müdür" rolündeki kullanıcılar tarafından kullanılabilir. Lütfen Sorumlu Müdür hesabıyla giriş yapın.</p>
        `; else n.innerHTML = `
            <h3 style="font-size: 2.2em; text-align: center; margin-bottom: 30px; color: #2c3e50; font-weight: bold;">Hızlı Atama Asistanı</h3>
            <p class="error-message">Bu özellik İSG-KATİP sayfasında çalışır. Lütfen İSG-KATİP'e giriş yapın.</p>
        `}
} function renderMainInterface(g, e, o, I, t, a = 0, y = null, n, l = { IGU: 0, IH: 0, DSP: 0 }) {
    let c = [], v = new Map, b = e.filter(e => !e.IGU && !e.hasPendingIGU), S = e.filter(e => needsDSPAssignment(e) && !e.DSP && !e.hasPendingDSP), f = e.filter(e => needsIHAssignment(e) && !e.IH && !e.hasPendingIH), d = o.recalculateAvailableHours(); !function i() {
        d = o.recalculateAvailableHours(); var e, t, a, n, s = g.querySelector(".tab-button.active")?.dataset.tab || "igu"; let r = new Set; g.querySelectorAll(".assignment-group.expanded").forEach(e => { var t; (e = e.querySelector(".group-title")) && (t = (e = e.textContent).replace(/\s*\(\d+\)$/, ""), r.add(t), r.add(e)) }), b = b.filter(e => !e.IGU && !e.hasPendingIGU), S = S.filter(e => needsDSPAssignment(e) && !e.DSP && !e.hasPendingDSP), f = f.filter(e => needsIHAssignment(e) && !e.IH && !e.hasPendingIH), g.innerHTML = `
            <h2 style="font-size: 2.2em; text-align: center; margin-bottom: 16px; color: #2c3e50; font-weight: bold;">Hızlı Atama Asistanı</h2>
            ${a = l, n = [], 0 < a.IGU && n.push("İGU: " + a.IGU), 0 < a.IH && n.push("İH: " + a.IH), 0 < a.DSP && n.push("DSP: " + a.DSP), 0 < n.length ? `
                <div class="combined-warning" role="alert">
                    <div class="warning-title">⚠️ Güncelleme Bekleyen Sözleşmeler:</div>
                    <div class="warning-counts">${n.join(" • ")}</div>
                    <div class="warning-explanation">
                        Atamalarınızı planlamadan önce bu sözleşmeleri güncellemeniz gereklidir. 
                        Aksi takdirde atama yapamayacağınız için planlamayı yeniden oluşturmanız gerekir.
                    </div>
                </div>
            `: a.apiError ? `
                <div class="combined-warning" role="alert">
                    <div class="warning-title">⚠️ Uyarı</div>
                    <div class="warning-explanation">
                        Atamalarınızı planlamadan önce güncelleme bekleyen sözleşmeniz olup olmadığını kontrol etmenizi tavsiye ederiz. 
                        Aksi takdirde atama yapamayacağınız için planlamayı yeniden oluşturmanız gerekir.
                    </div>
                </div>
            `: ""}
            
            <div class="assignment-summary">
                ${n = b, a = f, e = S, t = c, `
            <div class="summary-row-top">
                <div class="summary-item">
                    <span class="summary-label">İGU Ataması Bekleyen Firma</span>
                    <span class="summary-value">${n.length}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">İH Ataması Bekleyen Firma</span>
                    <span class="summary-value">${a.length}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">DSP Ataması Bekleyen Firma</span>
                    <span class="summary-value">${e.length}</span>
                </div>
            </div>
            <div class="summary-row-bottom">
                <div class="summary-item-large">
                    <span class="summary-label-large">Planlanan Atama</span>
                    <span class="summary-value-large">${t.length}</span>
                </div>
            </div>
        `}
            </div>

            ${0 < c.length ? `
                <div class="action-buttons">
                    <button class="summary-button" style="width: 250px; font-size: 16px; padding: 12px;">Planlanan Sözleşmeleri Göster ve Atamaları Yap</button>
                </div>
            `: ""}

            ${0 < c.length ? `
                <div class="planned-assignments">
                    <h4>Planlanan Atamalar</h4>
                    <div class="assignment-groups">
                        ${(() => {
                    var e, t, a = c.filter(e => "IGU" === e.contractType), n = c.filter(e => "IH" === e.contractType), s = c.filter(e => "DSP" === e.contractType); let i = ""; return 0 < a.length && (t = `İş Güvenliği Uzmanı Atamaları (${a.length})`, e = r.has(t) || r.has("İş Güvenliği Uzmanı Atamaları"), i += `
                                    <div class="assignment-group assignment-group-igu ${e ? "expanded" : ""}">
                                        <div class="group-header">
                                            <span class="group-title">${t}</span>
                                            <span class="group-toggle">${e ? "×" : "+"}</span>
                                        </div>
                                        <div class="group-content">
                                            ${a.map((e, t) => {
                        var a = c.indexOf(e); return `
                                                    <div class="assignment-item">
                                                        <div class="assignment-details">
                                                            <strong>${e.company.unvan}</strong>
                                                            <span class="assignment-personnel">${e.personnelName}</span>
                                                            <span class="assignment-hours">${formatMinutesForDisplay(e.requiredHours)}</span>
                                                        </div>
                                                        <button class="remove-assignment" data-index="${a}">Kaldır</button>
                                                    </div>
                                                `}).join("")}
                                        </div>
                                    </div>
                                `), 0 < n.length && (t = `İşyeri Hekimi Atamaları (${n.length})`, e = r.has(t) || r.has("İşyeri Hekimi Atamaları"), i += `
                                    <div class="assignment-group assignment-group-ih ${e ? "expanded" : ""}">
                                        <div class="group-header">
                                            <span class="group-title">${t}</span>
                                            <span class="group-toggle">${e ? "×" : "+"}</span>
                                        </div>
                                        <div class="group-content">
                                            ${n.map((e, t) => {
                            var a = c.indexOf(e); return `
                                                    <div class="assignment-item">
                                                        <div class="assignment-details">
                                                            <strong>${e.company.unvan}</strong>
                                                            <span class="assignment-personnel">${e.personnelName}</span>
                                                            <span class="assignment-hours">${formatMinutesForDisplay(e.requiredHours)}</span>
                                                        </div>
                                                        <button class="remove-assignment" data-index="${a}">Kaldır</button>
                                                    </div>
                                                `}).join("")}
                                        </div>
                                    </div>
                                `), 0 < s.length && (a = `Diğer Sağlık Personeli Atamaları (${s.length})`, t = r.has(a) || r.has("Diğer Sağlık Personeli Atamaları"), i += `
                                    <div class="assignment-group assignment-group-dsp ${t ? "expanded" : ""}">
                                        <div class="group-header">
                                            <span class="group-title">${a}</span>
                                            <span class="group-toggle">${t ? "×" : "+"}</span>
                                        </div>
                                        <div class="group-content">
                                            ${s.map((e, t) => {
                                var a = c.indexOf(e); return `
                                                    <div class="assignment-item">
                                                        <div class="assignment-details">
                                                            <strong>${e.company.unvan}</strong>
                                                            <span class="assignment-personnel">${e.personnelName}</span>
                                                            <span class="assignment-hours">${formatMinutesForDisplay(e.requiredHours)}</span>
                                                        </div>
                                                        <button class="remove-assignment" data-index="${a}">Kaldır</button>
                                                    </div>
                                                `}).join("")}
                                        </div>
                                    </div>
                                `), i
                })()}
                    </div>
                </div>
            `: ""}

            <div class="contract-tabs">
                <button class="tab-button ${"igu" === s ? "active" : ""}" data-tab="igu">İş Güvenliği Uzmanı</button>
                <button class="tab-button ${"ih" === s ? "active" : ""}" data-tab="ih">İşyeri Hekimi</button>
                <button class="tab-button ${"dsp" === s ? "active" : ""}" data-tab="dsp">Diğer Sağlık Personeli</button>
            </div>

            <div class="tab-content">
                <div class="tab-panel ${"igu" === s ? "active" : ""}" id="igu-panel">
                    <div class="unassigned-companies">
                        <h4>İş Güvenliği Uzmanı Ataması Bekleyen Şirketler (${b.length})</h4>
                        <button class="latest-personnel-button" data-contract-type="IGU">
                            <span class="button-text">Son Atanan Personeli Göster</span>
                        </button>
                        <div class="companies-list">
                            ${b.map((t, e) => {
                    var a = o.calculateRequiredHours(t, "IGU"), n = o.getRequiredIGUClass(t.tehlike), s = o.getEligiblePersonnel(t, "IGU"), i = c.some(e => e.company.sgkNo === t.sgkNo && "IGU" === e.contractType); return `
                                    <div class="company-item ${i ? "assigned" : ""}">
                                        <div class="company-info">
                                            <h5>${t.unvan}</h5>
                                            <div class="company-details">
                                                <span class="sgk-container">
                                                    Sicil No: ${t.sgkNo}
                                                    <button class="copy-button" title="Sicil numarasını kopyala" data-sgk-no="${t.sgkNo}">
                                                        <img src="copy.png" alt="Kopyala" style="width: 12px; height: 12px;">
                                                    </button>
                                                </span>
                                                <span>Çalışan: ${t.calisan}</span>
                                                <span>Tehlike Sınıfı: ${t.tehlike}</span>
                                                <span>Gerekli Sınıf: ${n}</span>
                                                <span class="required-minutes" data-company-index="${e}">Gerekli Asgari Süre: <span class="minutes-value">${formatMinutesForDisplay(a)}</span></span>
                                                ${n = v.get(t.sgkNo), n ? `
                                                    <div class="latest-personnel-info">
                                                        <div style="margin-bottom: 8px;">
                                                            <span><strong>Son atanan personel:</strong> ${n.name || n}</span>
                                                        </div>
                                                        <div style="margin-bottom: 6px;">
                                                            <span style="color: #666; font-size: 0.9em;"><strong>Sözleşme Sonlandırılma Nedeni:</strong> ${n.terminationReason || "Bilgi bulunamadı"}</span>
                                                        </div>
                                                        <div>
                                                            <span style="color: #666; font-size: 0.9em;"><strong>Sözleşme Sonlandırılma Tarihi:</strong> ${formatTurkishDate(n.terminationDate) || "Bilgi bulunamadı"}</span>
                                                        </div>
                                                    </div>`: ""}
                                            </div>
                                        </div>
                                        
                                        ${i ? `
                                            <div class="planned-assignment-info">
                                                <span class="icon">✅</span>
                                                <span><strong>İş Güvenliği Uzmanı Ataması planlandı:</strong> ${c.find(e => e.company.sgkNo === t.sgkNo && "IGU" === e.contractType)?.personnelName || "Bilinmeyen Personel"}</span>
                                                <button class="remove-assignment-inline" data-company-sgk="${t.sgkNo}" data-contract-type="IGU">Kaldır</button>
                                            </div>
                                        `: `
                                            <div class="personnel-selection">
                                                <select class="personnel-dropdown" data-company-index="${e}" data-contract-type="IGU">
                                                    <option value="">İGU Personeli Seçin</option>
                                                    ${s.map(e => `
                                                        <option value="${e.id}">
                                                            ${e.name} (${e.iguClass} sınıf, ${formatMinutesForDisplay(e.availableHours)} önerilen atanabilir)
                                                        </option>
                                                    `).join("")}
                                                </select>
                                                <button class="add-assignment" data-company-index="${e}" data-contract-type="IGU" disabled>
                                                    İGU Ekle
                                                </button>
                                            </div>
                                        `}
                                    </div>
                                `}).join("")}
                        </div>
                    </div>
                </div>

                <div class="tab-panel ${"ih" === s ? "active" : ""}" id="ih-panel">
                    <div class="unassigned-companies">
                        <h4>İşyeri Hekimi Ataması Bekleyen Şirketler (${f.length})</h4>
                        <button class="latest-personnel-button" data-contract-type="IH">
                            <span class="button-text">Son Atanan Personeli Göster</span>
                        </button>
                        <div class="companies-list">
                            ${f.map((t, e) => {
                        var a = o.calculateRequiredHours(t, "IH"), n = o.getEligiblePersonnel(t, "IH"), s = c.some(e => e.company.sgkNo === t.sgkNo && "IH" === e.contractType); return `
                                    <div class="company-item ${s ? "assigned" : ""}">
                                        <div class="company-info">
                                            <h5>${t.unvan}</h5>
                                            <div class="company-details">
                                                <span class="sgk-container">
                                                    Sicil No: ${t.sgkNo}
                                                    <button class="copy-button" title="Sicil numarasını kopyala" data-sgk-no="${t.sgkNo}">
                                                        <img src="copy.png" alt="Kopyala" style="width: 12px; height: 12px;">
                                                    </button>
                                                </span>
                                                <span>Çalışan: ${t.calisan}</span>
                                                <span>Tehlike Sınıfı: ${t.tehlike}</span>
                                                <span class="required-minutes" data-company-index="${e + b.length + S.length}" data-contract-type="IH">Gerekli Asgari Süre: <span class="minutes-value">${formatMinutesForDisplay(a)}</span></span>
                                                ${a = v.get(t.sgkNo), a ? `
                                                    <div class="latest-personnel-info">
                                                        <div style="margin-bottom: 8px;">
                                                            <span><strong>Son atanan personel:</strong> ${a.name || a}</span>
                                                        </div>
                                                        <div style="margin-bottom: 6px;">
                                                            <span style="color: #666; font-size: 0.9em;"><strong>Sözleşme Sonlandırılma Nedeni:</strong> ${a.terminationReason || "Bilgi bulunamadı"}</span>
                                                        </div>
                                                        <div>
                                                            <span style="color: #666; font-size: 0.9em;"><strong>Sözleşme Sonlandırılma Tarihi:</strong> ${formatTurkishDate(a.terminationDate) || "Bilgi bulunamadı"}</span>
                                                        </div>
                                                    </div>`: ""}
                                            </div>
                                        </div>
                                        
                                        ${s ? `
                                            <div class="planned-assignment-info">
                                                <span class="icon">✅</span>
                                                <span><strong>İşyeri Hekimi Ataması planlandı:</strong> ${c.find(e => e.company.sgkNo === t.sgkNo && "IH" === e.contractType)?.personnelName || "Bilinmeyen Personel"}</span>
                                                <button class="remove-assignment-inline" data-company-sgk="${t.sgkNo}" data-contract-type="IH">Kaldır</button>
                                            </div>
                                        `: `
                                            <div class="personnel-selection">
                                                <select class="personnel-dropdown" data-company-index="${e + b.length + S.length}" data-contract-type="IH">
                                                    <option value="">İH Personeli Seçin</option>
                                                    ${n.map(e => `
                                                        <option value="${e.id}">
                                                            ${e.name} (${formatMinutesForDisplay(e.availableHours)} önerilen atanabilir)
                                                        </option>
                                                    `).join("")}
                                                </select>
                                                <button class="add-assignment" data-company-index="${e + b.length + S.length}" data-contract-type="IH" disabled>
                                                    İH Ekle
                                                </button>
                                            </div>
                                        `}
                                    </div>
                                `}).join("")}
                        </div>
                    </div>
                </div>

                <div class="tab-panel ${"dsp" === s ? "active" : ""}" id="dsp-panel">
                    <div class="unassigned-companies">
                        <h4>Diğer Sağlık Personeli Ataması Bekleyen Şirketler (${S.length})</h4>
                        <button class="latest-personnel-button" data-contract-type="DSP">
                            <span class="button-text">Son Atanan Personeli Göster</span>
                        </button>
                        <div class="companies-list">
                            ${S.map((t, e) => {
                            var a = o.calculateRequiredHours(t, "DSP"), n = o.getEligiblePersonnel(t, "DSP"), s = c.some(e => e.company.sgkNo === t.sgkNo && "DSP" === e.contractType); return `
                                    <div class="company-item ${s ? "assigned" : ""}">
                                        <div class="company-info">
                                            <h5>${t.unvan}</h5>
                                            <div class="company-details">
                                                <span class="sgk-container">
                                                    Sicil No: ${t.sgkNo}
                                                    <button class="copy-button" title="Sicil numarasını kopyala" data-sgk-no="${t.sgkNo}">
                                                        <img src="copy.png" alt="Kopyala" style="width: 12px; height: 12px;">
                                                    </button>
                                                </span>
                                                <span>Çalışan: ${t.calisan}</span>
                                                <span>Tehlike Sınıfı: ${t.tehlike}</span>
                                                <span class="required-minutes" data-company-index="${e + b.length}" data-contract-type="DSP">Gerekli Asgari Süre: <span class="minutes-value">${formatMinutesForDisplay(a)}</span></span>
                                                ${a = v.get(t.sgkNo), a ? `
                                                    <div class="latest-personnel-info">
                                                        <div style="margin-bottom: 8px;">
                                                            <span><strong>Son atanan personel:</strong> ${a.name || a}</span>
                                                        </div>
                                                        <div style="margin-bottom: 6px;">
                                                            <span style="color: #666; font-size: 0.9em;"><strong>Sözleşme Sonlandırılma Nedeni:</strong> ${a.terminationReason || "Bilgi bulunamadı"}</span>
                                                        </div>
                                                        <div>
                                                            <span style="color: #666; font-size: 0.9em;"><strong>Sözleşme Sonlandırılma Tarihi:</strong> ${formatTurkishDate(a.terminationDate) || "Bilgi bulunamadı"}</span>
                                                        </div>
                                                    </div>`: ""}
                                            </div>
                                        </div>
                                        
                                        ${s ? `
                                            <div class="planned-assignment-info">
                                                <span class="icon">✅</span>
                                                <span><strong>Diğer Sağlık Personeli Ataması planlandı:</strong> ${c.find(e => e.company.sgkNo === t.sgkNo && "DSP" === e.contractType)?.personnelName || "Bilinmeyen Personel"}</span>
                                                <button class="remove-assignment-inline" data-company-sgk="${t.sgkNo}" data-contract-type="DSP">Kaldır</button>
                                            </div>
                                        `: `
                                            <div class="personnel-selection">
                                                <select class="personnel-dropdown" data-company-index="${e + b.length}" data-contract-type="DSP">
                                                    <option value="">DSP Personeli Seçin</option>
                                                    ${n.map(e => `
                                                        <option value="${e.id}">
                                                            ${e.name} (${formatMinutesForDisplay(e.availableHours)} önerilen atanabilir)
                                                        </option>
                                                    `).join("")}
                                                </select>
                                                <button class="add-assignment" data-company-index="${e + b.length}" data-contract-type="DSP" disabled>
                                                    DSP Ekle
                                                </button>
                                            </div>
                                        `}
                                    </div>
                                `}).join("")}
                        </div>
                    </div>
                </div>
            </div>
        `, g.querySelectorAll(".tab-button").forEach(e => { e.addEventListener("click", e => { var t = e.target.dataset.tab; g.querySelectorAll(".tab-button").forEach(e => e.classList.remove("active")), e.target.classList.add("active"), g.querySelectorAll(".tab-panel").forEach(e => e.classList.remove("active")), g.querySelector(`#${t}-panel`).classList.add("active") }) }), g.querySelectorAll(".personnel-dropdown").forEach(e => { e.addEventListener("change", e => { var t = parseInt(e.target.dataset.companyIndex), a = e.target.dataset.contractType, e = e.target.value; (t = g.querySelector(`button.add-assignment[data-company-index="${t}"][data-contract-type="${a}"]`)) && (t.disabled, t.disabled = !e) }) }), g.querySelectorAll(".copy-button").forEach(e => { e.addEventListener("click", async e => { e.preventDefault(), e.stopPropagation(); var t = e.currentTarget.dataset.sgkNo, e = e.currentTarget.querySelector("img"); if (t && "undefined" !== t) try { await copyTextWithFeedback(t, e, { preserveSelection: !0 }) } catch (e) { alert(`Kopyalama başarısız oldu. Sicil No: ${t} (Manuel olarak kopyalayabilirsiniz)`) } }) }), g.querySelectorAll(".latest-personnel-button").forEach(e => {
                                e.addEventListener("click", async e => {
                                    e.preventDefault(); let c = e.currentTarget.dataset.contractType, d = e.currentTarget.querySelector(".button-text"); var t = d ? d.textContent : "Son Atanan Personeli Göster"; e.currentTarget && (e.currentTarget.disabled = !0), d && (d.innerHTML = '<div class="loading-spinner"></div> Yükleniyor...'); try {
                                        let t, i = ("IGU" === c ? t = b : "IH" === c ? t = f : "DSP" === c && (t = S), g.querySelector(`#${c.toLowerCase()}-panel`)), a = (i && i.querySelectorAll(".latest-personnel-info").forEach(e => e.remove()), d && (d.innerHTML = '<div class="loading-spinner"></div> Veriler alınıyor...'), await fetchAllTerminatedContracts(I, c, y?.id)), n = await fetchAllPersonnelData(I, y?.id), s = await fetchIncompleteContracts(I, 180, y?.id); var p, u = []; for (let e = 0; e < t.length; e += 15)u.push(t.slice(e, e + 15)); let r = 0, o = 0, e = t.length, l = () => { d && r < e && (d.innerHTML = `<div class="loading-spinner"></div> ${r}/${e} tamamlandı...`) }; for (p of u) {
                                            var m = p.map(async t => {
                                                try {
                                                    var e = await fetchLatestAssignedPersonnel(I, t.sgkNo, c, a, n, s, y?.id); return ((e, t) => {
                                                        if (t) {
                                                            var a; v.set(e.sgkNo, t); for (a of i ? i.querySelectorAll(".company-item") : []) {
                                                                var n, s = a.querySelector(".sgk-container"); if (s && s.textContent.includes(e.sgkNo)) {
                                                                    (s = a.querySelector(".required-minutes")) && ((n = document.createElement("div")).className = "latest-personnel-info", n.innerHTML = `
                                            <div style="margin-bottom: 8px;">
                                                <span><strong>Son atanan personel:</strong> ${t.name}</span>
                                            </div>
                                            <div style="margin-bottom: 6px;">
                                                <span style="color: #666; font-size: 0.9em;"><strong>Sözleşme Sonlandırılma Nedeni:</strong> ${t.terminationReason}</span>
                                            </div>
                                            <div>
                                                <span style="color: #666; font-size: 0.9em;"><strong>Sözleşme Sonlandırılma Tarihi:</strong> ${formatTurkishDate(t.terminationDate)}</span>
                                            </div>
                                        `, s.parentNode.insertBefore(n, s.nextSibling)); break
                                                                }
                                                            }
                                                        }
                                                    })(t, e), r++, l(), { success: !0, company: t, latestPersonnel: e }
                                                } catch (e) { return r++, o++, l(), { success: !1, company: t, error: e } }
                                            }); await Promise.allSettled(m)
                                        }
                                    } catch (e) { alert("Son atanan personel bilgileri alınırken bir hata oluştu.") } finally { e.currentTarget && (e.currentTarget.disabled = !1), d && (d.textContent = t) }
                                })
                            }), g.querySelectorAll(".add-assignment").forEach(e => { e.addEventListener("click", e => { var t, a, n = parseInt(e.target.dataset.companyIndex), e = e.target.dataset.contractType, s = g.querySelector(`select[data-company-index="${n}"][data-contract-type="${e}"]`)?.value; s && (t = d[s], n = [...b, ...S, ...f][n], t) && n && (a = o.calculateRequiredHours(n, e), c.push({ company: n, personnelId: t.tckn || t.id, personnelName: t.name, contractType: e, requiredHours: a }), o.addPendingAssignment(s, n, e), i()) }) }), g.querySelectorAll(".remove-assignment").forEach(e => { e.addEventListener("click", e => { e.stopPropagation(), e = parseInt(e.target.dataset.index), o.removePendingAssignment(e), c.splice(e, 1), i() }) }), g.querySelectorAll(".remove-assignment-inline").forEach(e => { e.addEventListener("click", e => { e.stopPropagation(); let t = e.target.dataset.companySgk, a = e.target.dataset.contractType; -1 !== (e = c.findIndex(e => e.company.sgkNo === t && e.contractType === a)) && (o.removePendingAssignment(e), c.splice(e, 1), i()) }) }), g.querySelector(".summary-button")?.addEventListener("click", () => { showSummary(g, c, o, I, i, y) }), g.querySelectorAll(".group-header").forEach(n => { n.addEventListener("click", e => { var t = n.parentElement, a = n.querySelector(".group-toggle"); t.classList.toggle("expanded"), t.classList.contains("expanded") ? a.textContent = "×" : a.textContent = "+" }) })
    }()
} function attachEventListenersToNewElements(i, r, o) { i.querySelectorAll(".copy-button:not([data-listener-attached])").forEach(e => { e.setAttribute("data-listener-attached", "true"), e.addEventListener("click", async e => { e.preventDefault(), e.stopPropagation(); var t = e.currentTarget.dataset.sgkNo, e = e.currentTarget.querySelector("img"); if (t && "undefined" !== t) try { await copyTextWithFeedback(t, e, { preserveSelection: !0 }) } catch (e) { alert(`Kopyalama başarısız oldu. Sicil No: ${t} (Manuel olarak kopyalayabilirsiniz)`) } }) }), i.querySelectorAll(".personnel-dropdown:not([data-listener-attached])").forEach(e => { e.setAttribute("data-listener-attached", "true"), e.addEventListener("change", e => { var t = parseInt(e.target.dataset.companyIndex), a = e.target.dataset.contractType, e = e.target.value, t = i.querySelector(`button.add-assignment[data-company-index="${t}"][data-contract-type="${a}"]`); t && (t.disabled = !e) }) }), i.querySelectorAll(".add-assignment:not([data-listener-attached])").forEach(e => { e.setAttribute("data-listener-attached", "true"), e.addEventListener("click", t => { var a = parseInt(t.target.dataset.companyIndex), t = t.target.dataset.contractType, n = i.querySelector(`select[data-company-index="${a}"][data-contract-type="${t}"]`)?.value; if (n) { n = currentPersonnelState[n]; let e = null; var s = [...iguCompanies, ...dspCompanies, ...ihCompanies]; a < s.length && (e = s[a]), n && e && (s = r.calculateRequiredHours(e, t), o.push({ company: e, personnelId: n.tckn || n.id, personnelName: n.name, contractType: t, requiredHours: s }), r.addPendingAssignment(n.tckn || n.id, e, t), a = i.querySelector(".tab-button.active")?.dataset.tab || "igu", renderMainInterface(i, { iguCompanies: iguCompanies, dspCompanies: dspCompanies, ihCompanies: ihCompanies }, r, token, null, currentPersonnelState, isgkatipTab, a, contractUpdateCounts)) } }) }), i.querySelectorAll(".remove-assignment-inline:not([data-listener-attached])").forEach(e => { e.setAttribute("data-listener-attached", "true"), e.addEventListener("click", e => { let t = e.target.dataset.companySgk, a = e.target.dataset.contractType; var e = o.findIndex(e => e.company.sgkNo === t && e.contractType === a); -1 !== e && (o.splice(e, 1)[0], r.removePendingAssignment(e), e = i.querySelector(".tab-button.active")?.dataset.tab || "igu", renderMainInterface(i, { iguCompanies: iguCompanies, dspCompanies: dspCompanies, ihCompanies: ihCompanies }, r, token, null, currentPersonnelState, isgkatipTab, e, contractUpdateCounts)) }) }) } function showSummary(e, i, t, a, n, s = null) {
    let r = t.recalculateAvailableHours(); e.innerHTML = `
        <h3 style="font-size: 1.38em;">Atama Özeti</h3>
        
        <div class="summary-overview">
            <h4 style="font-size: 1.27em;">Genel Bilgiler</h4>
            <ul style="font-size: 1.27em;">
                <li>Toplam Atama: ${i.length}</li>
                <li>Toplam Gerekli Süre: ${formatMinutesForDisplay(i.reduce((e, t) => e + t.requiredHours, 0))}</li>
                <li>Etkilenen Personel: ${new Set(i.map(e => e.personnelId)).size}</li>
            </ul>
        </div>

        <div class="action-buttons">
            <button class="confirm-button">Atamaları Gerçekleştir</button>
            <button class="edit-button">Yeniden Düzenle</button>
            <button class="export-button">Excel'e Aktar</button>
        </div>

        <div class="assignments-summary">
            <div class="assignment-group assignment-group-details">
                <div class="group-header">
                    <span class="group-title" style="font-size: 1.38em;">Atama Detayları (${i.length})</span>
                    <span class="group-toggle">×</span>
                </div>
                <div class="group-content">
                    <div class="assignment-cards" style="font-size: 1.1em;">
                        ${i.map((e, t) => `
                            <div class="assignment-card" style="background-color: ${t % 2 == 0 ? "#f0f8ff" : "#f8f8ff"}; margin-bottom: 1px; padding: 16px; border-left: 4px solid ${"IGU" === e.contractType ? "#007bff" : "IH" === e.contractType ? "#28a745" : "DSP" === e.contractType ? "#fd7e14" : "#6c757d"};">
                                <div class="assignment-card-header">
                                    <h5 style="font-size: 1.1em; margin-bottom: 8px;">${e.company.unvan}</h5>
                                    <span class="contract-type-badge" style="font-size: 1em; padding: 4px 8px; background-color: ${"IGU" === e.contractType ? "#007bff" : "IH" === e.contractType ? "#28a745" : "DSP" === e.contractType ? "#fd7e14" : "#6c757d"}; color: white; border-radius: 4px;">${"IGU" === e.contractType ? "İş Güvenliği Uzmanı" : "IH" === e.contractType ? "İşyeri Hekimi" : "DSP" === e.contractType ? "Diğer Sağlık Personeli" : e.contractType}</span>
                                </div>
                                <div class="assignment-card-details">
                                    <div class="detail-row" style="margin: 8px 0;">
                                        <span class="detail-label" style="font-size: 1em;">Sicil No:</span>
                                        <span class="detail-value sgk-container" style="font-size: 1em;">
                                            ${e.company.sgkNo}
                                            <button class="copy-button" title="Sicil numarasını kopyala" data-sgk-no="${e.company.sgkNo}">
                                                <img src="copy.png" alt="Kopyala" style="width: 12px; height: 12px;">
                                            </button>
                                        </span>
                                    </div>
                                    <div class="detail-row" style="margin: 8px 0;">
                                        <span class="detail-label" style="font-size: 1em;">Atanan Personel:</span>
                                        <span class="detail-value" style="font-size: 1em;">${e.personnelName}</span>
                                    </div>
                                    <div class="detail-row" style="margin: 8px 0;">
                                        <span class="detail-label" style="font-size: 1em;">Gerekli Asgari Süre:</span>
                                        <span class="detail-value" style="font-size: 1em;">${formatMinutesForDisplay(e.requiredHours)}</span>
                                    </div>
                                    <div class="detail-row" style="margin: 8px 0;">
                                        <span class="detail-label" style="font-size: 1em;">Tehlike Sınıfı:</span>
                                        <span class="detail-value" style="font-size: 1em;">${e.company.tehlike}</span>
                                    </div>
                                </div>
                            </div>
                        `).join("")}
                    </div>
                </div>
            </div>
        </div>

        <div class="personnel-impact">
            <div class="assignment-group assignment-group-personnel">
                <div class="group-header">
                    <span class="group-title" style="font-size: 1.38em;">Personel Durumu (${Object.values(r).filter(t => i.some(e => String(e.personnelId) === String(t.id))).length})</span>
                    <span class="group-toggle">×</span>
                </div>
                <div class="group-content">
                    <div class="personnel-cards" style="font-size: 1.1em;">
                        ${Object.values(r).filter(t => i.some(e => String(e.personnelId) === String(t.id))).sort((e, t) => { var a = e => e.isDSP || e.isIH ? e.isIH ? 2 : e.isDSP ? 3 : 4 : 1; return a(e) - a(t) }).map((t, e) => {
        var a = i.filter(e => String(e.personnelId) === String(t.id)).length, n = t.totalHours - (t.usedHours || 0), s = t.isDSP ? "DSP" : t.isIH ? "IH" : "IGU"; return `
                                    <div class="personnel-card" style="background-color: ${e % 2 == 0 ? "#f9f9f9" : "#ffffff"}; margin-bottom: 1px; padding: 16px; border-left: 4px solid ${"IGU" == s ? "#007bff" : "IH" == s ? "#28a745" : "DSP" == s ? "#fd7e14" : "#6c757d"};">
                                        <div class="personnel-card-header">
                                            <h5 style="font-size: 1.1em; margin: 0 0 8px 0;">${t.name}</h5>
                                            <span class="assignment-count-badge" style="font-size: 1em; padding: 4px 8px; background-color: ${"IGU" == s ? "#007bff" : "IH" == s ? "#28a745" : "DSP" == s ? "#fd7e14" : "#6c757d"}; color: white; border-radius: 4px;">${a} Atama</span>
                                        </div>
                                        <div class="personnel-card-details">
                                            <div class="detail-row" style="margin: 8px 0;">
                                                <span class="detail-label" style="font-size: 1em;">Önceki Kullanılabilir:</span>
                                                <span class="detail-value" style="font-size: 1em;">${formatMinutesForDisplay(n)}</span>
                                            </div>
                                            <div class="detail-row" style="margin: 8px 0;">
                                                <span class="detail-label" style="font-size: 1em;">Yeni Kullanılabilir:</span>
                                                <span class="detail-value" style="font-size: 1em;">${formatMinutesForDisplay(t.availableHours)}</span>
                                            </div>
                                        </div>
                                    </div>
                                `}).join("")}
                    </div>
                </div>
            </div>
        </div>
    `, e.querySelector(".confirm-button").addEventListener("click", async () => { await executeAssignments(i, a, e, t, s?.id) }), e.querySelector(".edit-button").addEventListener("click", () => { n() }), e.querySelector(".export-button").addEventListener("click", async () => { try { await generateOtomatikAtamaReport(i, r) } catch (e) { alert("Excel raporu oluşturulurken hata oluştu: " + e.message) } }), e.querySelectorAll(".copy-button").forEach(e => { e.addEventListener("click", async e => { e.preventDefault(), e.stopPropagation(); var t = e.currentTarget.dataset.sgkNo, e = e.currentTarget.querySelector("img"); if (t && "undefined" !== t) try { await copyTextWithFeedback(t, e, { preserveSelection: !0 }) } catch (e) { alert(`Kopyalama başarısız oldu. Sicil No: ${t} (Manuel olarak kopyalayabilirsiniz)`) } }) }), e.querySelectorAll(".group-header").forEach(a => { a.addEventListener("click", e => { e.preventDefault(), e.stopPropagation(); var e = a.closest(".assignment-group"), t = a.querySelector(".group-toggle"); e.classList.contains("expanded") ? (e.classList.remove("expanded"), t.textContent = "+") : (e.classList.add("expanded"), t.textContent = "×") }) })
} async function executeAssignments(s, e, t, i, r = null) {
    try {
        t.innerHTML = `
            <h3 style="font-size: 1.3225em;">Atamalar Gerçekleştiriliyor</h3>
            <div class="progress-container">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 0%"></div>
                </div>
                <p class="progress-text" style="font-size: 1.15em;">0 / ${s.length} atama tamamlandı</p>
            </div>
            <div class="progress-log-container">
                <div class="progress-log-header" style="font-size: 1.15em;">İşlem Detayları (Kaydırılabilir)</div>
                <div class="progress-log"></div>
            </div>
        `; var o = t.querySelector(".progress-fill"), l = t.querySelector(".progress-text"); let a = t.querySelector(".progress-log"), n = []; for (let t = 0; t < s.length; t++) {
            var c = s[t]; try {
                var d = t / s.length * 100, p = (o.style.width = d + "%", l.textContent = t + ` / ${s.length} atama tamamlandı`, a.innerHTML += `<div class="log-item processing">🔄 ${c.company.unvan} için atama başlatılıyor...</div>`, a.scrollTop = a.scrollHeight, await performRealAssignment(e, c, r)); if (!p.success) throw new Error(p.error || "Assignment failed"); n.push({ success: !0, assignment: c }), a.lastElementChild.className = "log-item success"; var u = c.requiredHours ? " " + formatMinutesForDisplay(c.requiredHours) : "", m = t % 2 == 0 ? "#e8f5e8" : "#f0f8f0"; a.lastElementChild.innerHTML = `
                    <div style="background-color: ${m}; padding: 12px; margin: 4px 0; border-radius: 6px; border-left: 4px solid #28a745;">
                        <div style="font-weight: bold; color: #155724; margin-bottom: 6px;">✅ Atama Başarılı</div>
                        <div style="margin-bottom: 4px;"><strong>Şirket:</strong> ${c.company.unvan}</div>
                        <div style="margin-bottom: 4px;"><strong>Atanan Personel:</strong> ${c.personnelName}</div>
                        <div style="margin-bottom: 4px;"><strong>Atama Türü:</strong> ${"IGU" === c.contractType ? "İş Güvenliği Uzmanı" : "IH" === c.contractType ? "İşyeri Hekimi" : "DSP" === c.contractType ? "Diğer Sağlık Personeli" : c.contractType}</div>
                        <div style="margin-bottom: 4px;"><strong>Gerekli Süre:</strong>${u}</div>
                        <div style="margin-bottom: 4px;"><strong>Tehlike Sınıfı:</strong> ${c.company.tehlike}</div>
                    </div>
                `} catch (e) {
                    var g = translateErrorMessage(e.message), I = (n.push({ success: !1, assignment: c, error: g }), t % 2 == 0 ? "#fdeaea" : "#fdf2f2"); a.innerHTML += `
                <div class="log-item error" style="background-color: ${I}; padding: 12px; margin: 4px 0; border-radius: 6px; border-left: 4px solid #dc3545;">
                    <div style="font-weight: bold; color: #721c24; margin-bottom: 6px;">❌ Atama Başarısız</div>
                    <div style="margin-bottom: 4px;"><strong>Şirket:</strong> ${c.company.unvan}</div>
                    <div style="margin-bottom: 4px;"><strong>Atanacak Personel:</strong> ${c.personnelName}</div>
                    <div style="margin-bottom: 4px;"><strong>Atama Türü:</strong> ${"IGU" === c.contractType ? "İş Güvenliği Uzmanı" : "IH" === c.contractType ? "İşyeri Hekimi" : "DSP" === c.contractType ? "Diğer Sağlık Personeli" : c.contractType}</div>
                    <div style="color: #856404; font-size: 1em;"><strong>Hata:</strong> ${g}</div>
                </div>
            `} a.scrollTop = a.scrollHeight
        } o.style.width = "100%", l.textContent = s.length + ` / ${s.length} atama tamamlandı`; var y = n.filter(e => e.success).length, v = n.filter(e => !e.success).length; t.innerHTML += `
        <div class="completion-section">
            <h4 style="font-size: 1.265em;">Atamalar Tamamlandı!</h4>
            <div class="results-summary" style="font-size: 1.2em; margin: 16px 0; padding: 16px; background-color: #f8f9fa; border-radius: 8px; border: 1px solid #dee2e6;">
                <h4 style="font-size: 1.3em; margin-bottom: 12px;">Sonuçlar</h4>
                <p style="font-size: 1.1em; margin: 8px 0;">✅ Başarılı: ${y}</p>
                <p style="font-size: 1.1em; margin: 8px 0;">❌ Başarısız: ${v}</p>
            </div>
            <div class="action-buttons">
                <button class="download-excel-button" style="background-color: #007acc; color: white;">Excel Sonuç Raporu İndir</button>
            </div>
        </div>
    `, t.querySelector(".download-excel-button").addEventListener("click", async () => { try { var e = i.recalculateAvailableHours(); await generateOtomatikAtamaReport(s, e, n), a.innerHTML += '<div class="log-item success">📊 Excel sonuç raporu indirildi</div>' } catch (e) { a.innerHTML += `<div class="log-item error">⚠️ Excel raporu oluşturulamadı: ${e.message}</div>`, alert("Excel raporu oluşturulurken hata oluştu: " + e.message) } }); try { var b = i.recalculateAvailableHours(); await generateOtomatikAtamaReport(s, b, n), a.innerHTML += '<div class="log-item success">📊 Excel sonuç raporu otomatik olarak indirildi</div>' } catch (e) { a.innerHTML += `<div class="log-item error">⚠️ Otomatik Excel raporu oluşturulamadı: ${e.message}</div>` }
    } catch (e) {
        t.innerHTML = `
            <h3 style="font-size: 1.3225em;">Atama İşlemi Başarısız</h3>
            <div class="error-message" style="background-color: #f8d7da; color: #721c24; padding: 1rem; border-radius: 6px; margin: 1rem 0;">
                <strong>Hata:</strong> ${e.message}
            </div>
            <div class="action-buttons">
                <button onclick="location.reload()" style="background-color: #007acc; color: white; padding: 0.75rem 1.5rem; border: none; border-radius: 4px; cursor: pointer;">Yeniden Dene</button>
            </div>
        `}
} async function performRealAssignment(e, i, r = null) { try { var o, l = await initializeContract(e, i.contractType, r); if (!l.body || !l.body.businessInteractionInstanceId) throw o = "Failed to get businessInteractionInstanceId from initialization. Response: " + JSON.stringify(l), new Error(o); var c, d = l.body.businessInteractionInstanceId, p = l.body.flowInstances?.[0]?.businessInteractionFlowInstanceId; if (!p) throw c = "Failed to get flowInstanceId from initialization. Response: " + JSON.stringify(l), new Error(c); var u = l.auditInfo || extractAuditInfo(l), m = await progressWarningPage(e, d, p, i.contractType, u, r); let t = { IGU: 10566, DSP: 10590, IH: 10578 }[i.contractType]; var g = m.body?.flowInstances?.find(e => "Sözleşme Yapılacak İşyeri Seçimi Sayfası" === e.flowInstancePage?.name || e.flowInstancePage?.bsnInterFlowPgId === t)?.businessInteractionFlowInstanceId; if (!g) throw new Error("Failed to get workplace selection flow instance ID after warning page"); var I = await validateWorkplaceParticipant(e, i.company.sgkNo, i.contractType, r), y = await setWorkplaceParticipant(e, d, g, i.company, I, i.contractType, m.auditInfo, r), v = y.body?.businessInteractionInstanceId; if (!v) throw new Error("Did not receive new businessInteractionInstanceId after workplace validation."); var b = y.body?.flowInstances && 0 !== y.body.flowInstances.length ? null : await getCurrentContractState(e, y.body.businessInteractionInstanceId, r), S = y.body?.flowInstances || b?.flowInstances || [], f = { IGU: "İş Güvenliği Uzmanı Seçimi Sayfası", DSP: "Diğer Sağlık Personeli Seçimi Sayfası", IH: "İşyeri Hekimi Seçimi Sayfası" }; let a = { IGU: 10567, DSP: 10591, IH: 10579 }[i.contractType], n = f[i.contractType]; var h = S.find(e => e.flowInstancePage?.name === n || e.flowInstancePage?.bsnInterFlowPgId === a)?.businessInteractionFlowInstanceId; if (!h) throw new Error("Failed to get personnel selection flow instance ID after workplace validation"); var P = await findPersonnelUserId(e, String(i.personnelId || "").trim(), i.contractType, r); if (!P) throw new Error("Personnel validation failed"); var E = await setPersonnelParticipant(e, v, h, i, I, P, i.contractType, y.auditInfo, r), k = E.extractedRequiredMinutes, A = k || i.requiredHours, T = (k && (i.requiredHours = k), E.body?.flowInstances || (await getCurrentContractState(e, v, r))?.flowInstances || []); let s = { IGU: 10568, DSP: 10593, IH: 10580 }[i.contractType]; var w = T.find(e => "Sözleşme Bilgileri Giriş Sayfası" === e.flowInstancePage?.name || e.flowInstancePage?.bsnInterFlowPgId === s)?.businessInteractionFlowInstanceId; if (w) return await completeContractDetails(e, v, w, A, i.contractType, E.auditInfo, r), { success: !0, extractedMinutes: k, finalMinutes: A }; throw new Error("Failed to get contract details flow instance ID after personnel setting") } catch (e) { return { success: !1, error: e.message } } } async function isgkatip_getContractList(e) { try { var t = await fetch("https://isgkatibi.com/be/bsn-inter-instance/contract/list", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: e }) }); return t.ok ? (await t.json())?.contracts || null : (console.warn("Contract list service temporarily unavailable"), null) } catch (e) { return console.warn("Network error accessing contract service:", e.message), null } } async function isgkatip_validatePersonelData(e) { var t; try { return e && e.tcKimlik ? (t = await fetch("https://isgkatibi.com/be/bsn-inter-instance/personel/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(e) })).ok ? (await t.json())?.isValid || !1 : (console.warn("Personnel validation service temporarily unavailable"), !1) : (console.warn("Personnel validation requires TC Kimlik number"), !1) } catch (e) { return console.warn("Personnel validation network error:", e.message), !1 } } function isgkatip_calculateWorkingHours(e, t, a = 0) { try { var n, s, i = new Date(e), r = new Date(t); return isNaN(i.getTime()) || isNaN(r.getTime()) ? (console.warn("Invalid time format for working hours calculation"), 0) : (n = Math.max(0, (r - i) / 6e4 - a), 0 < (s = Math.round(n / 60 * 100) / 100) ? s : 0) } catch (e) { return console.warn("Working hours calculation error:", e.message), 0 } } async function isgkatip_submitDailyReport(e) { try { var t, a = { ...e, submittedAt: (new Date).toISOString(), version: "1.0" }, n = await fetch("https://isgkatibi.com/be/bsn-inter-instance/reports/daily", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(a) }); return n.ok ? { success: (t = await n.json())?.success || !1, reportId: t?.reportId, message: t?.message || "Report processed" } : { success: !1, message: "Report submission service temporarily unavailable" } } catch (e) { return { success: !1, error: e.message } } } function isgkatip_generateReportId(e, t) { try { return e + `_${new Date(t).getTime()}_` + Math.random().toString(36).substr(2, 6) } catch (e) { return console.warn("Report ID generation error:", e.message), `DEFAULT_${Date.now()}_` + Math.random().toString(36).substr(2, 4) } } async function isgkatip_getCompanySettings(e) { try { var t = await fetch("https://isgkatibi.com/be/bsn-inter-instance/company/settings/" + e, { method: "GET", headers: { "Content-Type": "application/json" } }); return t.ok ? (await t.json())?.config || null : (console.warn("Company settings service temporarily unavailable"), null) } catch (e) { return console.warn("Company settings network error:", e.message), null } } function chrome_internal_validateExtensionId(e) { return CHROME_EXTENSION_ID_PATTERN.test(e) } function chrome_internal_getApiTimeout() { return CHROME_INTERNAL_API_TIMEOUT } function chrome_tabs_validateSessionData(e) { return !(!e || "object" != typeof e) && e.hasOwnProperty(CHROME_INTERNAL_SESSION_KEY) } function chrome_internal_logApiCall(e, t = Date.now()) { console && console.debug && console.debug(`Chrome Internal API: ${e} called at ` + t) } function chrome_tabs_getSessionTimeout() { return CHROME_TABS_SESSION_TIMEOUT } export { initOtomatikAtamaFeature };