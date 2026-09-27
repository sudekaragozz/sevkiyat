# Dağıtımlar — Tasarım

Tarih: 2026-09-27

## Amaç

Varış şubesine ulaşmış paketlerin kurye ile alıcıya dağıtımını yönetmek. Kullanıcı bir şube, kurye ve
araç seçip o şubede dağıtıma hazır paketlerden bir dağıtım oluşturur; dağıtımı yola çıkarır, her paketi
teslim edildi / edilemedi olarak işaretler ve dağıtımı sonlandırır. Her adım `PackageHistory`'ye yansır.

## Kapsam kararları

- CLAUDE.md backend'i yasaklıyor; bu özellik için kullanıcı backend istisnası verdi. Backend adımları
  implementasyonda yine önizleme → "uygula" onayıyla ilerler. Migration ve dev sunucusu kullanıcı
  tarafından çalıştırılır.
- `READY_TO_GO` yalnızca **dağıtımın** statüsüdür. `Package.Status` enum'una yeni değer eklenmez;
  dağıtıma eklenen paket `AT_BRANCH` (veya `DELIVERY_FAILED`) statüsünde kalır.
- Dağıtıma ekleme anında `PackageHistory` kaydı atılmaz.
- **Sonlandır** yalnızca `OUT_FOR_DELIVERY` statüsündeki dağıtımda mümkündür. `READY_TO_GO` dağıtım
  iptal/sonlandırılamaz.
- Araç kapasitesi (desi) kontrolü yapılır.
- Paket–dağıtım ilişkisi ara tablo (`DistributionPackage`) ile tutulur; bir paket zaman içinde birden
  fazla dağıtımda yer alabilir (teslim edilemeyip tekrar çıkarılması).

## Dağıtıma uygun paket kuralı

Seçilen şube `B` için bir paket şu koşulların hepsini sağlıyorsa dağıtıma eklenebilir:

- `current_branch_id == B`
- `destination_branch_id == B`
- `status` ∈ {`AT_BRANCH`, `DELIVERY_FAILED`}
- Statüsü `COMPLETED` olmayan bir dağıtıma ait `DistributionPackage` kaydı yok.

Bu kural hem `eligible-packages` endpoint'inde (listeleme) hem `create` servisinde (doğrulama) aynı
yardımcı queryset fonksiyonuyla uygulanır.

## Backend

### Modeller (`backend/shipments/models.py`; migration kullanıcı tarafından `makemigrations` ile üretilir)

```python
class Distribution(models.Model):
    class Status(models.TextChoices):
        READY_TO_GO = "READY_TO_GO", "Dağıtıma Hazır"
        OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY", "Dağıtımda"
        COMPLETED = "COMPLETED", "Tamamlandı"

    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="distributions")
    courier = models.ForeignKey(Employee, on_delete=models.PROTECT, related_name="distributions")
    vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name="distributions")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.READY_TO_GO)
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)    # "Dağıtıma Çıkma Tarihi"
    completed_at = models.DateTimeField(null=True, blank=True)


class DistributionPackage(models.Model):
    class Result(models.TextChoices):
        PENDING = "PENDING", "Bekliyor"
        DELIVERED = "DELIVERED", "Teslim Edildi"
        FAILED = "FAILED", "Teslim Edilemedi"

    distribution = models.ForeignKey(Distribution, on_delete=models.PROTECT, related_name="items")
    package = models.ForeignKey(Package, on_delete=models.PROTECT, related_name="distribution_items")
    result = models.CharField(max_length=20, choices=Result.choices, default=Result.PENDING)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["distribution", "package"], name="unique_distribution_package"),
        ]
```

`PackageHistory`'ye eklenir:

```python
distribution = models.ForeignKey(
    Distribution, on_delete=models.PROTECT, null=True, blank=True, related_name="package_histories"
)
```

### PackageService değişikliği (`package_service.py`)

`send_out_for_delivery`, `deliver`, `mark_delivery_failed` fonksiyonlarına `distribution=None`
keyword parametresi eklenir ve oluşturdukları `PackageHistory` kaydına yazılır. `employee_id` zaten
parametre; çağıran taraf kuryenin id'sini geçer. Parametre verilmediğinde mevcut davranış aynen korunur.

### DistributionService (`distribution_service.py`, yeni)

Tüm fonksiyonlar `@transaction.atomic`, dağıtım satırı `select_for_update()` ile kilitlenir, hatalar
`ShipmentError` olarak fırlatılır.

- `create(*, branch_id, courier_id, vehicle_id, package_ids)`
  - Kurye `role == COURIER` değilse hata.
  - `package_ids` boşsa hata.
  - Paketler `select_for_update()` ile kilitlenir; uygunluk kuralını sağlamayan her paket için hata
    (takip numarasıyla).
  - Seçili paketlerin toplam desisi `vehicle.capacity`'yi aşarsa `capacity_exceeded` hatası.
  - `Distribution` (READY_TO_GO) ve her paket için `DistributionPackage` (PENDING) oluşturulur.
    History atılmaz.
- `start(*, distribution_id)`
  - Statü `READY_TO_GO` değilse hata.
  - Her paket için `PackageService.send_out_for_delivery(package_id, employee_id=courier_id,
    distribution=distribution)`. Bu fonksiyon geçiş kuralını ve paketin varış şubesinde olduğunu
    kontrol eder; paket bu arada başka bir sefere yüklendiyse hata fırlar ve tüm işlem geri alınır.
  - Statü `OUT_FOR_DELIVERY`, `started_at = now()`.
- `set_result(*, distribution_id, package_id, result)`
  - `result` ∈ {`DELIVERED`, `FAILED`} değilse hata.
  - Dağıtım `OUT_FOR_DELIVERY` değilse hata.
  - `DistributionPackage` bulunamazsa 404; `result != PENDING` ise hata ("zaten işaretlendi").
  - `DELIVERED` → `PackageService.deliver(...)`, `FAILED` → `PackageService.mark_delivery_failed(...)`
    (kurye ve dağıtım ile).
  - `DistributionPackage.result` güncellenir.
- `complete(*, distribution_id)`
  - Statü `OUT_FOR_DELIVERY` değilse hata.
  - `result == PENDING` olan her kalem için `mark_delivery_failed(...)` ve `result = FAILED`.
  - Statü `COMPLETED`, `completed_at = now()`.

### Serializer'lar (`serializers.py`)

- `DistributionSerializer`: `id, branch, courier, vehicle, status, created_at, started_at,
  completed_at, package_count` (`package_count` read-only, queryset'te `Count('items')` ile annotate).
- `DistributionCreateSerializer`: `branch, courier, vehicle` (PK alanları), `package_ids`
  (`ListField(child=IntegerField(), allow_empty=False)`).
- `DistributionPackageSerializer`: `PackageSerializer` alanları + `result` (DistributionPackage
  üzerinden paketi düzleştirir).

### Endpoint'ler (`urls.py`, `views.py`)

Servis `ShipmentError`'ları `{"detail": message}` ile 400 döner.

| Method | URL | Açıklama |
|---|---|---|
| GET | `/api/distributions/?page_number&page_size&…` | Sayfalı liste, `-id` sırası. Filtreler: `branch`, `courier`, `vehicle`, `status` (virgüllü çoklu), `started_after`, `started_before` (YYYY-MM-DD), `package_count_min`, `package_count_max`. Mevcut `apply_list_filters` + `paginate` kullanılır. |
| GET | `/api/distributions/filter-options/?field=` | `branch`, `courier`, `vehicle`, `status` için `{value, label}` listesi (TripFilterOptionsView ile aynı kalıp). |
| GET | `/api/distributions/eligible-packages/?branch=<id>` | Uygunluk kuralını sağlayan paketler, `PackageSerializer`. `branch` eksikse 400. |
| POST | `/api/distributions/` | Gövde `{branch, courier, vehicle, package_ids}`. 201 + `DistributionSerializer`. |
| GET | `/api/distributions/<id>/` | `DistributionSerializer`. |
| GET | `/api/distributions/<id>/packages/` | `DistributionPackageSerializer` listesi. |
| POST | `/api/distributions/<id>/start/` | Dağıtıma çıkar. Güncel `DistributionSerializer` döner. |
| POST | `/api/distributions/<id>/complete/` | Sonlandır. Güncel `DistributionSerializer` döner. |
| POST | `/api/distributions/<id>/packages/<package_id>/result/` | Gövde `{"result": "DELIVERED" \| "FAILED"}`. Güncel `DistributionPackageSerializer` kaydı döner. |

## Frontend

### Yeni dosyalar

- `src/api/distributions.ts` — `fetchDistributions`, `fetchDistributionFilterOptions`,
  `fetchEligiblePackages`, `createDistribution`, `fetchDistribution`, `fetchDistributionPackages`,
  `startDistribution`, `completeDistribution`, `setPackageResult`. Hatalar `apiError` ile okunur.
- `src/pages/DistributionsPage.tsx` — liste + oluşturma modalı.
- `src/pages/DistributionDetailPage.tsx` — detay.

### Değişen dosyalar

- `src/types/index.ts` — `Distribution`, `DistributionFilters`, `PaginatedDistributions`,
  `DistributionPackage` (`Package & { result: string }`).
- `src/constants.ts` — `distributionStatus` (READY_TO_GO: Dağıtıma Hazır, OUT_FOR_DELIVERY: Dağıtımda,
  COMPLETED: Tamamlandı), `distributionResult` (PENDING: Bekliyor, DELIVERED: Teslim Edildi,
  FAILED: Teslim Edilemedi).
- `src/components/AppLayout.tsx` — Seferler'in altına "Dağıtımlar" (`/distributions`,
  `DeliveryDiningOutlined` ikonu).
- `src/App.tsx` — `distributions` ve `distributions/:id` route'ları.

### Dağıtımlar sayfası

SefersPage ile aynı yapı: AG Grid, kolon filtreleri (`MultiSelectFilter`, `DateRangeFilter`,
`NumberRangeFilter`), backend filtreleme/sayfalama, `AbortController` ile istek iptali.

Kolonlar: **ID, Şube, Kurye, Araç, Dağıtıma Çıkma Tarihi** (`started_at`, boşsa "-"), **Status,
Paket Sayısı, Aksiyonlar**.

Aksiyonlar:
- **Dağıtıma çıkar** — yalnızca `READY_TO_GO`.
- **Sonlandır** — yalnızca `OUT_FOR_DELIVERY`; onay diyaloğu açar.
- **İncele** — her zaman; `/distributions/<id>`.

Sonlandır onay diyaloğu, `/packages/` isteğiyle bekleyen paket sayısını (N) alır ve
"N paket otomatik olarak Teslim Edilemedi olarak işaretlenecek. Devam edilsin mi?" gösterir.

Sağ üstte **Dağıtım Oluştur** butonu.

### Dağıtım Oluştur modalı (MUI Stepper, 2 adım)

1. **Şube / Kurye / Araç** — Kurye listesi context'teki `couriers`. Üçü de seçilmeden "İleri" pasif.
2. **Paketler** — `eligible-packages?branch=` ile uygun paketler checkbox listesi (takip no, alıcı,
   desi) + "Tümünü seç". Altta "Seçilen: X desi / Kapasite: Y desi"; aşımda kırmızı ve Kaydet pasif
   (asıl kontrol backend'de). Uygun paket yoksa bilgi mesajı. "Geri" 1. adıma döner (seçimler korunur;
   şube değişirse paket seçimi sıfırlanır).
3. **Kaydet** — `POST /api/distributions/`; başarıda modal kapanır, liste yenilenir, detay sayfasına
   yönlendirilir. Hata modal içinde `Alert` olarak gösterilir.

### Dağıtım detay sayfası

- "Dağıtımlar listesine dön" butonu.
- Bilgi kutusu (SeferDetailView stili): Şube, Kurye, Araç, Durum, Dağıtıma Çıkma, Tamamlanma.
- Statüye göre **Dağıtıma çıkar** veya **Sonlandır** butonu (listedekiyle aynı onay diyaloğu).
- Paket tablosu: Takip No, Alıcı, Telefon, Desi, Sonuç (renkli `Chip`), aksiyonlar.
- **Teslim Edildi** / **Teslim Edilmedi** — yalnızca dağıtım `OUT_FOR_DELIVERY` ve paket `PENDING`
  iken aktif. Tıklanınca sadece o satır kilitlenir; sonrasında paket listesi yeniden çekilir.
- Dağıtım veya paket istekleri başarısız olursa `Alert` ile gösterilir.

## Hata durumları

- Backend tüm iş kuralı ihlallerinde 400 + `{"detail"}` döner; frontend bunu olduğu gibi gösterir.
- `start` sırasında bir paket artık uygun değilse (ör. başka sefere yüklendi) işlem tamamen geri alınır,
  kullanıcı hatayı görür.
- Aynı pakete iki kez sonuç verilmesi backend'de reddedilir (`result != PENDING`).

## Doğrulama

- Backend: `python3 -m py_compile` ile değişen dosyalar. Migration kullanıcı tarafından
  `makemigrations` / `migrate` ile oluşturulur ve uygulanır.
- Frontend: `tsc -b` ve `vite build`.
- Uçtan uca akış (oluştur → çıkar → işaretle → sonlandır, history kayıtları) kullanıcı tarafından
  tarayıcıda denenir.

## Kapsam dışı

- READY_TO_GO dağıtımı iptal etme veya paket ekleme/çıkarma.
- Paket statüsüne yeni değer eklenmesi.
- Otomatik test altyapısı kurulması.
