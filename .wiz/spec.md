# Photi — Yüz Tanıma ile Fotoğraf Dağıtımı

## Özet
Photi, etkinlik organizatörlerinin yükledikleri fotoğrafları yüz tanıma ile katılımcılara otomatik dağıtan bir web platformudur. Organizatörler etkinlik oluşturup fotoğraf yükler; katılımcılar QR/link ile etkinliğe katılır, bir selfie atar ve sadece kendi göründükleri kareleri görür. Fuaye ekranı (TV) isFeatured fotoğrafları canlı döndürür. Auth kullanılmaz; istemci ilk açılışta UUID üretip her isteğe `x-user-id` header olarak ekler. Backend yeni kullanıcıya 100 Photi kredisi yükler ve her dağıtım başına organizatörün bakiyesinden 1 Photi düşer.

## Kullanıcı Hikayeleri
1. **Organizatör olarak**, bir etkinlik oluşturup tarih/marka rengi/logo ayarlayabilmek ve QR kodu indirebilmek istiyorum, böylece katılımcıları kolayca davet edebilirim.
2. **Organizatör olarak**, çoklu drag-drop ile yüzlerce fotoğrafı yükleyip her birinde eşleşen kişi sayısını görebilmek istiyorum.
3. **Katılımcı olarak**, etkinlik linkini açıp selfie attığımda sadece beni içeren fotoğrafların galeriye düşmesini istiyorum.
4. **Katılımcı olarak**, "Verimi Sil" diyerek selfie ve faceVector'ümün anında silinmesini istiyorum.
5. **Organizatör olarak**, "Fuayede Göster" toggle'ı ile öne çıkan kareleri TV ekranında canlı karusel olarak yayınlamak istiyorum.
6. **Organizatör olarak**, kredilerim azaldığında uyarı görmek ve mock bir ödeme akışıyla Photi paketi satın alabilmek istiyorum.
7. **Katılımcı olarak**, yeni bir foto galerime düştüğünde browser bildirimi almak istiyorum.

## Fonksiyonel Gereksinimler
### Kimlik & Krediler
- İlk istekte `x-user-id` header'ı görüldüğünde User otomatik açılır + 100 Photi `signup_bonus` PhotiTransaction yazılır.
- `GET /me` bakiye + son 20 işlem döner.
- `GET /billing/packages` sabit liste; `POST /billing/purchase` mock başarı ile bakiye artırır.

### Etkinlik
- CRUD: oluştur, listele (kendi), public meta, patch, publish, archive.
- Slug = `kebab-case-{6chrandom}`.
- QR PNG endpoint'i, `/e/:slug` paylaşım URL'si.

### Fotoğraf
- Multipart çoklu yükleme, sharp ile 400px webp thumb, EXIF takenAt.
- `process-photo` job: face-api.js (tfjs-node) ile 128-D embedding, eventteki tüm Participant'larla cosine distance < 0.5 ise eşleşme.
- Eşleşme başına organizatör bakiyesinden 1 Photi düşülür; bakiye yetmiyorsa `awaiting_credit`.
- DELETE foto + dosyaları siler. PATCH `isFeatured` toggle.

### Katılımcı
- `POST /events/:slug/join` participant kaydı (selfie henüz yok).
- `POST /participants/:id/selfie` selfie yükler, faceVector çıkarır, eventteki tüm `ready` fotolarla geriye dönük eşleştirir (eşleşme başına 1 Photi düşer).
- `DELETE /participants/:id` selfie + faceVector + matchedUserIds temizliği.

### Galeri & Fuaye
- `GET /me/photos?eventId` katılımcının kendi fotoğrafları.
- `/e/:slug/gallery` 5sn poll + Notification API.
- `GET /events/:slug/foyer-data` public; `GET /events/:id/foyer-stream` SSE.
- Fuaye 6sn rotasyon, F fullscreen toggle, kopukluk → 30sn'de auto-reload.

### Storage
- Yerel adapter (`apps/backend/storage/`), key formatı: `events/{eventId}/photos/{photoId}/{full|thumb}.jpg`, `participants/{participantId}/selfie.jpg`.
- `getSignedUrl` şimdilik `/files/:key` proxy'ye yönlendirir.

## Non-Fonksiyonel Gereksinimler
- **Performans:** Thumb'lar webp + `loading="lazy"`. Fotoğraf işlem job'u kuyrukta paralelsiz; HTTP yanıtı <300ms. Galeri poll 5sn. SSE delay <5sn. 100+ foto ile lightbox akıcı.
- **İndeksler:** `photos(eventId, status)`, `participants(eventId, userId)`.
- **Erişilebilirlik:** Mobile-first; kontrast (lacivert/turuncu beyaz arka plan) WCAG AA; `aria-label`'lı butonlar; klavye odak çemberi; QR ve fotoğraf grid'inde alt text.
- **Gizlilik:** Selfie ve faceVector kullanıcı isteğiyle silinir; storage local; sadece etkinlik içinde eşleşme yapılır. Selfie sayfasında açıklayıcı metin.
- **Hata toleransı:** Job retry (attempts++), bakiye yetersiz → `awaiting_credit` + retry trigger.
- **DX:** README'de 3 komutla ayağa kalkar (`pnpm install` → `pnpm --filter backend run db:migrate` → `pnpm dev`). Backend Dockerfile, web statik build çıktısı.

## Kapsam Dışı (v1'de yapılmayacak)
- Gerçek ödeme entegrasyonu (Stripe/iyzico) — sadece mock.
- Gerçek auth, e-posta doğrulama, şifre sıfırlama.
- Çoklu organizatör/rol/izin sistemi.
- S3/R2 gibi bulut depolama; CDN, video desteği.
- Push notification (FCM); Web Notification API ile yetinilir.
- Yüz tanıma için cross-event veya global eşleştirme.
- Mobil native uygulama.
- Çoklu dil — sadece Türkçe.
- Yedekleme/restore akışı, audit log.
- Yapay zekalı küratörlük (otomatik isFeatured).
