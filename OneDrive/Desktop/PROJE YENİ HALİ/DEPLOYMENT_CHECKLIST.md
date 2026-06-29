# 🚀 CANLI DEPLOYMENT CHECKLIST

## ✅ YAPILAN DEĞİŞİKLİKLER (Production'a Gidecek)

### 1. Frontend Değişiklikleri
- ✅ `DoctorWorkplaceDetailModal.tsx` - TypeScript hatası düzeltildi (deleteWorkplaceDocument 2 argüman)
- ✅ `DoctorWorkplaceDetailModal.tsx` - Muhasebe kullanıcısına düzenleme yetkisi eklendi
- ✅ `WorkplaceDetailModal.tsx` - Muhasebe kullanıcısına düzenleme yetkisi eklendi

### 2. Backend Değişiklikleri
- ✅ `.env` - Dosya yükleme limiti 50 MB'a çıkarıldı (MAX_FILE_SIZE=52428800)
- ✅ `StorageService.js` - Default limit 25MB → 50MB güncellendi

---

## ⚠️ CRITICAL: PostgreSQL Kontrolü

### LOKALDE TEST:
**PostgreSQL servisi bulunamadı!** 

**Çözüm seçenekleri:**

#### Seçenek A: Canlı Sunucuda PostgreSQL Var (ÖNERİLEN)
✅ Canlı sunucuda PostgreSQL çalışıyor → Sorun yok!
```bash
# Canlı sunucuda backend'i başlat
cd isg-backend
npm start
```

#### Seçenek B: Lokalde Test İçin SQLite Kullan
📋 Şu anki `.env` dosyası PostgreSQL için ayarlı
✅ Canlıya göndermeden önce lokalde test etmek için:
```env
DB_DIALECT=sqlite  # Geçici olarak değiştir
```

---

## 📋 PRODUCTION DEPLOYMENT ADIMLARI

### 1. Backend Deployment (Canlı Sunucu)

```bash
# Canlı sunucuya bağlan
ssh user@isgdestek.com.tr

# Proje dizinine git
cd /path/to/isg-backend

# Git pull ile değişiklikleri çek
git pull origin main

# Dependencies kontrol
npm install

# .env dosyası kontrolü (ZATEN AYARLI OLMALI)
# DB_DIALECT=postgres
# DB_HOST=localhost
# DB_PORT=5432
# DB_USER=postgres
# DB_PASSWORD=<canli_sifre>
# DB_NAME=osgb_db
# MAX_FILE_SIZE=52428800  # 50 MB

# Backend'i restart et
pm2 restart isg-backend
# VEYA
systemctl restart isg-backend
```

### 2. Frontend Deployment (Canlı Sunucu)

```bash
# Canlı sunucuya bağlan
ssh user@isgdestek.com.tr

# Proje dizinine git
cd /path/to/isg-frontend

# Git pull ile değişiklikleri çek
git pull origin main

# Dependencies kontrol
npm install

# Production build oluştur
npm run build

# Nginx/Apache restart
sudo systemctl restart nginx
# VEYA
sudo service apache2 restart
```

---

## 🧪 DEPLOYMENT SONRASI TEST

### 1. Backend Health Check
```bash
curl http://localhost:5004/api/health
# Beklenen: {"status":"OK","version":"2.2.2",...}
```

### 2. Frontend Erişim
```
Tarayıcıda: https://isgdestek.com.tr
```

### 3. Fonksiyonel Testler

#### A) Muhasebe Kullanıcı Testi
1. ✅ Muhasebe kullanıcısı ile giriş yap
2. ✅ İşyerleri sayfasına git
3. ✅ Bir işyerini aç
4. ✅ "Kaydet" butonu görünüyor mu?
5. ✅ "Sil" butonu görünüyor mu?
6. ✅ Değişiklik yapıp kaydedebiliyor mu?

#### B) Dosya Yükleme Testi (50 MB)
1. ✅ Arşiv sayfasına git
2. ✅ 30-40 MB arası bir dosya seç
3. ✅ Yükle butonuna tıkla
4. ✅ Başarılı şekilde yükleniyor mu?

#### C) Doktor Modal Testi
1. ✅ Doktor kullanıcı ile giriş yap
2. ✅ İşyeri detay modal'ını aç
3. ✅ Belge silme işlemi çalışıyor mu?
4. ✅ TypeScript hatası var mı? (Console'da)

---

## 🔒 GÜVENLİK KONTROLÜ

### .env Dosyası Güvenliği
```bash
# Canlı sunucuda kontrol
chmod 600 /path/to/isg-backend/.env
chown www-data:www-data /path/to/isg-backend/.env
```

### Git Ignore Kontrolü
```bash
# .env dosyası .gitignore'da olmalı
cat .gitignore | grep .env
# Çıktı: .env
```

---

## 📊 ROLLBACK PLANI

### Sorun Olursa:

#### Backend Rollback
```bash
cd /path/to/isg-backend
git revert HEAD  # Son commit'i geri al
pm2 restart isg-backend
```

#### Frontend Rollback
```bash
cd /path/to/isg-frontend
git revert HEAD
npm run build
sudo systemctl restart nginx
```

#### Database Rollback (Gerekirse)
```bash
# Backup'tan geri dön
pg_restore -U postgres -d osgb_db backup_before_deploy.sql
```

---

## 🎯 DEPLOYMENT ZAMANI

### Önerilen Zaman:
- **Gece 02:00 - 04:00** (Kullanıcı trafiği en düşük)
- **Hafta sonu** (Cumartesi/Pazar gece)

### Bildirim:
- [ ] Kullanıcılara bakım duyurusu yapıldı mı?
- [ ] Team hazır mı?
- [ ] Monitoring araçları aktif mi?

---

## 📞 İLETİŞİM

**Deployment sırasında:**
- Tech Lead: [İsim] - [Telefon]
- DevOps: [İsim] - [Telefon]
- On-call: [İsim] - [Telefon]

---

## ✅ DEPLOYMENT ONAYI

- [ ] Tüm testler başarılı
- [ ] Backup alındı
- [ ] Rollback planı hazır
- [ ] Team bilgilendirildi
- [ ] Monitoring aktif
- [ ] **DEPLOYMENT ONAYLANDI**

---

**Son Güncelleme:** 2026-04-03 16:10  
**Version:** 2.2.2  
**Status:** Ready for Production ✅
