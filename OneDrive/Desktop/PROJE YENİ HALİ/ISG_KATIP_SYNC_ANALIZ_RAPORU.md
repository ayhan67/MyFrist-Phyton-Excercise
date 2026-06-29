# 🔍 ISG KATIP SENKRONIZASYON SİSTEMİ - KAPSAMLI ANALİZ RAPORU

**Tarih:** 17 Nisan 2026  
**Analiz Edilen Sistem:** ISG Katip ↔ OSGB Backend Senkronizasyon  
**Versiyon:** v1.3.13 (Extension), v1.3.15 (Backend)

---

## 📋 1. SİSTEM MİMARİSİ

### 1.1 Bileşenler

```
┌─────────────────────────────────────────────────────────────┐
│                    ISG KATIP PORTAL                         │
│         (https://isgkatip.csgb.gov.tr)                      │
│   - Devlet API'si (BSN Inter-Instance)                      │
│   - SGK sicilNo bazlı işyeri verileri                       │
│   - Şube filtresi YOK (tüm şubeler gelir)                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ Chrome Extension (v1.3.13)
                     │ - content.js: Data collection
                     │ - osgb_connector.js: Token bridge
                     │
┌────────────────────▼────────────────────────────────────────┐
│              OSGB BACKEND API                               │
│         (https://isgdestek.com.tr)                          │
│   - IsgKatipService.processApiData()                        │
│   - Workplace matching (sicilNo bazlı)                      │
│   - BranchCity filtering (SORUNLU!)                         │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Veri Akışı

```
1. Kullanıcı ISG Katip'e giriş yapar
2. Extension API'den sözleşmeleri çeker:
   - activeContracts (aktif sözleşmeler)
   - pendingContracts (bekleyen sözleşmeler)
   - personnelContracts (personel sözleşmeleri)
3. Extension → Backend POST:
   URL: /api/isg-katip/sync-from-browser?branchCity=Denizli
   Payload: {active: 2443, branchCity: "Denizli"}
4. Backend processApiData():
   - Gruplama: sicilNo'ya göre
   - Workplace match: DB'de sicilNo ara
   - Güncelleme: employeeCount, hazardClass, personnel
   - ❌ ARŞİVLEME: branchCity filtresi ile (SORUN!)
5. Response: {processed, updated, droppedWorkplaces, errors}
```

---

## 🐛 2. KRİTİK SORUNLAR

### 2.1 **BRANCHCITY FİLTRE UYUMSUZLUĞU** ⚠️⚠️⚠️

**SORUN:**
```javascript
// ISG KATIP API'si:
// Şube filtresi DESTEKLEMİYOR
// TÜM şubelerin sözleşmeleri geliyor

// BACKEND:
// branchCity filtresi UYGULUYOR
analyzeMissingWorkplaces(seenSicilNos, organizationId, branchCity)
// Sadece "Denizli" işyerlerini kontrol ediyor
// Diğer şubeleri "kayıp" sanıyor
// ARŞİV'LİYOR! ❌
```

**ETKİ:**
- Denizli sync → 650 işyeri ARŞİVE ALINDI
- Antalya sync → Diğer şubeler etkilenebilir
- **VERİ KAYBI!**

**KÖK NEDEN:**
- ISG Katip API'si çoklu şube desteklemiyor
- Backend tek şube bekliyor
- **Mimari uyumsuzluk**

**DURUM:** ✅ DÜZELTİLDİ (v1.3.14 - analyzeMissingWorkplaces devre dışı)

---

### 2.2 **TIMEOUT SORUNU** ⚠️⚠️

**SORUN:**
```
Payload: 2443 contract = 7.1 MB
Nginx timeout: 60 saniye (default)
Backend timeout: 300 saniye (v1.3.15 eklendi)
Sonuç: 504 Gateway Timeout ❌
```

**ETKİ:**
- Büyük şubeler sync yapamıyor
- CORS hatası (nginx 504'de CORS header gönderemiyor)
- Kullanıcı deneyimi BOZUK

**KÖK NEDEN:**
- Nginx configuration erişimi YOK
- Batch processing YOK
- Tek seferde tüm data işleniyor

**DURUM:** ❌ HALA DEVAM EDİYOR (nginx config gerekiyor)

---

### 2.3 **TDZ (TEMPORAL DEAD ZONE) HATASI** ⚠️

**SORUN:**
```javascript
// Satır 3758'de (önceki versiyon):
let workplace = await Workplace.findOne({...});
// Ama tanımlanmadan ÖNCE kullanılıyordu
// "Cannot access 'workplace' before initialization"
```

**ETKİ:**
- 631 işyerinin HEPSİ hata verdi
- `processed: 0, updated: 0`
- Sync tamamen BAŞARISIZ

**DURUM:** ✅ KISMEN DÜZELTİLDİ (fix yapıldı ama doğru deploy edilemedi)

---

### 2.4 **SICILNO NORMALIZASYON TUTARSIZLIĞI** ⚠️

**SORUN:**
```javascript
// Extension'dan:
sicilNo: "25221010114560240071804000"

// DB'de:
sskRegistrationNo: "13229782"

// Normalizasyon:
.replace(/[^a-zA-Z0-9]/g, '').replace(/^0+/, '')
// Farklı formatlar match olmayabilir
```

**ETKİ:**
- Workplace match başarısız
- Yeni işyeri oluşturuluyor (duplicate risk)
- Güncelleme yapılamıyor

**DURUM:** ⚠️ İYİLEŞTİRME GEREKLİ

---

## ✅ 3. İYİ ÇALIŞAN YÖNLER

### 3.1 **TOKEN KÖPRÜSÜ** ✅
```javascript
// osgb_connector.js: OSGB → Extension token transfer
chrome.storage.local.set({authToken, selectedBranch, backendUrl})
// Doğru çalışıyor
```

### 3.2 **ÇOKLU SÖZLEŞME GRUPLAMA** ✅
```javascript
// Aynı sicilNo'lu sözleşmeleri gruplama
const grouped = new Map();
for (const contract of allContracts) {
  const rawSicil = contract.hizmetAlanIsyeriSgkSicilNo;
  if (!grouped.has(rawSicil)) grouped.set(rawSicil, []);
  grouped.get(rawSicil).push(contract);
}
// Status scoring: Active(3) > Pending(2)
```

### 3.3 **PERSONEL ISIM MAP** ✅
```javascript
// TCKN → İsim mapping
personnelNameMap[String(p.sozlesmeYapilanKisiTckn)] = p.sozlesmeYapilanKisiAdSoyad;
// Doğru çalışıyor
```

### 3.4 **SAFETY THRESHOLD** ✅ (AMA BOZUK)
```javascript
// Toplu arşivleme önleme
const threshold = Math.max(5, Math.ceil(activeCount * 0.1));
if (missingInsideDb.length > threshold) {
  skipAutoArchive = true; // Koruma mekanizması
}
// Fikir iyi, ama branchCity filtresi yanlış
```

---

## 📊 4. PERFORMANS METRİKLERİ

### 4.1 Mevcut Durum
```
Extension Data Collection:  ~30 saniye ✅
Payload Size:               7.1 MB (2443 contract) ❌
Backend Processing:         >60 saniye ❌
Nginx Timeout:              60 saniye ❌
Backend Timeout:            300 saniye ✅ (ama nginx engelliyor)
Total Sync Time:            FAIL (504)
```

### 4.2 Hedeflenen
```
Payload Size:               <2 MB (batch)
Backend Processing:         <180 saniye
Total Sync Time:            <240 saniye ✅
```

---

## 🎯 5. MİMARİ DEĞERLENDİRME

### 5.1 Güçlü Yönler
- ✅ **Modüler yapı:** Service-Controller separation
- ✅ **Error handling:** Try-catch blokları
- ✅ **Logging:** Detaylı logger kullanımı
- ✅ **History tracking:** EmployeeCountHistory
- ✅ **Quota management:** Personnel dakika takibi

### 5.2 Zayıf Yönler
- ❌ **Stateless design:** Session/batch tracking yok
- ❌ **No retry logic:** Timeout'da restart yok
- ❌ **No progress reporting:** User feedback yok
- ❌ **Monolithic processing:** Batch yok
- ❌ **API mismatch handling:** ISG Katip limitations yok sayılıyor

### 5.3 Riskler
- 🔴 **VERİ KAYBI:** Auto-archive yanlış çalışıyor (DÜZELTİLDİ)
- 🔴 **TIMEOUT:** Büyük şubeler sync edemiyor (DEVAM EDİYOR)
- 🔴 **DUPLICATE:** SicilNo mismatch yeni kayıt oluşturabilir
- 🟡 **PERFORMANCE:** 7MB payload inefficient
- 🟡 **NO ROLLBACK:** Hatalı sync geri alınamıyor

---

## 💡 6. ÖNERİLER

### 6.1 Acil (Critical) - ÖNCELİK 1
1. ✅ **Auto-archive'ı KALDIR** (v1.3.14 - YAPILDI)
2. ❌ **Nginx timeout artır** (proxy_read_timeout 300s) - YAPILMADI
3. ❌ **Arşivlenmiş işyerlerini RESTORE et** - YAPILMADI

### 6.2 Kısa Vadeli (1-2 hafta) - ÖNCELİK 2
1. **Batch processing ekle** (500 contract/batch)
2. **Progress endpoint ekle** (frontend polling)
3. **Retry logic ekle** (timeout'da otomatik restart)
4. **SicilNo validation güçlendir** (cross-check)

### 6.3 Orta Vadeli (1-2 ay) - ÖNCELİK 3
1. **ISG Katip API wrapper oluştur** (şube filtresi ekle)
2. **Incremental sync** (sadece değişenler)
3. **Conflict resolution** (manuel override desteği)
4. **Audit log** (kim ne zaman sync yaptı)

### 6.4 Uzun Vadeli (3-6 ay) - ÖNCELİK 4
1. **WebSocket real-time sync**
2. **Background job queue** (Bull/Redis)
3. **Multi-tenant optimization**
4. **API rate limiting**

---

## 📈 7. SONUÇ

### Genel Değerlendirme: **6/10** ⚠️

**Neden:**
- ✅ Temel mantık DOĞRU (sicilNo matching)
- ✅ Token köprüsü ÇALIŞIYOR
- ❌ BranchCity filtresi CİDDİ HATA (DÜZELTİLDİ)
- ❌ Timeout sorunu KULLANICIYI ETKİLİYOR (DEVAM EDİYOR)
- ❌ Veri kaybı RİSKİ vardı (DÜZELTİLDİ)

**Öncelik Sırası:**
1. 🔴 ~~Auto-archive'ı devre dışı bırak~~ ✅ YAPILDI
2. 🔴 Nginx timeout artır ❌ YAPILMADI (SSH gerekir)
3. 🟡 Batch processing ekle ❌ YAPILMADI
4. 🟢 Monitoring ekle ❌ YAPILMADI

---

## 🔧 8. PAZARTESİ TEST PLANI

### Test Adımları:
1. **Nginx timeout kontrolü:**
   - SSH ile sunucuya bağlan
   - `/etc/nginx/sites-enabled/default` düzenle
   - `proxy_read_timeout 300s;` ekle
   - `systemctl restart nginx`

2. **Sync testi (küçük şube):**
   - Önce az işyeri olan şubeyi dene
   - Network response kontrol et
   - `droppedWorkplaces: 0` olmalı

3. **Sync testi (büyük şube):**
   - Denizli şubesini dene
   - 2443 contract işlenebilmeli
   - 504 hatası olmamalı

4. **Database kontrolü:**
   ```sql
   SELECT "branchCity", COUNT(*), 
          COUNT(*) FILTER (WHERE "approvalStatus" = 'arsiv') as archived
   FROM "Workplaces" 
   WHERE "organizationId" = 19
   GROUP BY "branchCity";
   ```

5. **Arşivlenmiş işyerleri restore:**
   ```sql
   UPDATE "Workplaces"
   SET "approvalStatus" = 'bekliyor',
       "archivedDate" = NULL
   WHERE "organizationId" = 19
     AND "branchCity" = 'Denizli'
     AND "approvalStatus" = 'arsiv'
     AND "updatedAt" > '2026-04-16';
   ```

### Başarı Kriterleri:
- ✅ Denizli sync başarılı (200 OK)
- ✅ `droppedWorkplaces: 0`
- ✅ 650+ işyeri güncellenmiş
- ✅ Arşivlenmiş işyerleri geri gelmiş
- ✅ 504 hatası yok

---

**RAPOR SONU**

*Bu rapor analiz amaçlı hazırlanmıştır. Pazartesi test planı uygulanarak değişiklikler yapılabilir.*
