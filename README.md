# Maliyet Hesaplama

Çelik fabrikası maliyet modelleri oluşturmak için geliştirilmiş yerel (native) bir Windows masaüstü uygulamasıdır. Tek bir **`.exe`** dosyası olarak sunulur; herhangi bir Windows 10/11 bilgisayara kopyalayıp çift tıklamanız yeterlidir. Kurulum gerektirmez: .NET çalışma zamanı (runtime) exe dosyasının içine gömülüdür ve kullanıcı arayüzü (UI), halihazırda Windows 10/11 ile birlikte gelen WebView2 bileşeni üzerinde çalışır.

## Nasıl Çalıştırılır

```
.\dist\MaliyetHesaplamaAraci.exe

```

Uygulamanın ilk kez açıldığı bir bilgisayarda, exe dosyası kod imzalı (code-signed) olmadığı için bir Windows SmartScreen uyarısı ("Windows kişisel bilgisayarınızı korudu") çıkabilir. Bu durumda **Ek bilgi → Yine de çalıştır** seçeneklerine tıklayın. İmzalanmamış bir kurum içi araç için bu durum tamamen normaldir ve yalnızca ilk açılışta karşınıza çıkar.

Veriler otomatik olarak bilgisayarın yerel profiline (`%LOCALAPPDATA%\MaliyetHesaplamaAraci`) kaydedilir. Tüm ayarları indirmek veya geri yüklemek için **Yedek** menüsünü, maliyet dökümünü Excel'e aktarmak için ise **CSV** seçeneğini kullanabilirsiniz.

Uygulama ayrıca günde bir kez, ilk açılışta `Belgeler\Maliyet Hesaplama\Yedekler\` klasörüne tarihli bir JSON kopyası yazar ve son 14 yedeği saklar. Çalışan kopya kullanıcı profilinde yer aldığından, yedekleri de aynı yerde tutmak olası bir formatlama durumunda her ikisinin de kaybolmasına neden olur; bu yüzden kurumsal yedekleme sistemlerinin ve OneDrive'ın doğrudan erişebildiği "Belgeler" klasörü tercih edilmiştir. **Yedek → Yedek klasörünü aç** seçeneği doğrudan bu klasörü açar. Başarısız olan otomatik yedeklemeler bilerek sessizce arka planda geçiştirilir; olası bir hatayı görmek isterseniz aynı menüden manuel olarak yedek alabilirsiniz.

## Neleri Değiştirebilirsiniz?

Maliyet yapısıyla ilgili hiçbir şey koda sabitlenmiş (hard-coded) değildir; varsayılan olarak gelen iki sistem sadece örnek veridir, eklediğiniz diğer her şey gibi bunlar da düzenlenebilir veya silinebilir.

* **Sistemler** — Her sekme; kendi tonajı, değişkenleri ve kategorileri olan bağımsız bir maliyet modelidir. Boş bir sistem ekleyebilir veya mevcut olanı kopyalayabilirsiniz (`+ Sistem`), ardından aktif sekmedeki `⋯` menüsünden sistemi yeniden adlandırabilir, çoğaltabilir veya silebilirsiniz.
* **Kategoriler ve kalemler** — İstediğiniz gibi ekleyin, yeniden adlandırın, sıralayın veya silin. Her satır, istendiği zaman değiştirilebilen dört farklı türden biridir:
| Tür | Anlamı |
| --- | --- |
| Miktar × Fiyat | miktar × birim fiyat, üretime dağıtılır |
| Toplam tutar | tek bir aylık toplam, üretime dağıtılır |
| Ton başına | halihazırda ton başına hesaplanmış bir değer |
| Formül | sizin yazdığınız bir ifade (aşağıya bakınız) |


* **Değişkenler** — Formüllerin başvurduğu isimlendirilmiş sayılardır (çevrim süresi, hurda fiyatı, fire yüzdesi vb.). Her birinin etiketinin yanında kısa bir kod adı gösterilir.
* **Göstergeler** — Etiketi, birimi ve ondalık basamak sayısı olan formüllerden oluşan, kendi hesaplattığınız okuma değerleridir.
* **Dönemler** — Tüm sistemlerin o anki durumunu (hesaplandığı döviz kurlarıyla birlikte) `2026-07` gibi bir etiket altında dondurun ve daha sonraki bir ay ile karşılaştırın. Ayrıntılar için aşağıya bakınız.
* **Ayarlar** — Sayı formatı (`1,234.567` veya `1.234,567`) ve maliyetlerin ondalık basamak görünümü.

### Arama ve Bulma

**Maliyet Kalemleri** başlığındaki arama kutusu (veya `Ctrl+F`), siz yazdıkça kategorileri ve kalemleri filtreler; eşleşen sonuçlar otomatik olarak genişletilir ve `Esc` tuşu aramayı temizler. Türkçe karakterleri çift yönlü olarak tanır; örneğin `curuf` yazarsanız *Cüruf* kelimesini, `İŞLETME` yazarsanız *işletme* kelimesini bulur. Arama işlemi sadece anlık görünüme etki eder: geçmişe hiçbir şey kaydetmez ve verileri değiştirmez.

### Dönemler ve Sapma (Karşılaştırma)

**Dönemler → Bu durumu dönem olarak kaydet** seçeneği; tüm sistemlerin ve o an geçerli olan USD ve EUR kurlarının bir anlık görüntüsünü (snapshot) sizin belirlediğiniz bir etiketle kaydeder. Daha sonra, aynı menüden o dönemi seçtiğinizde tablonun üzerinde bir karşılaştırma paneli belirir: o zamanki toplam, şimdiki toplam, `$/birim` ile yüzde cinsinden fark ve her bir kategorinin ne kadar değiştiğini sıralayan bir tablo gösterilir.

Kaydedilen sistem **kendi döneminin kurlarıyla** yeniden hesaplanır, bu yüzden alınan sonuç "geçen ayın değerlerini bugünün kuruyla hesaplarsak ne olur" değil, "o zaman bu işin maliyeti neydi" sorusunun cevabıdır. Kategoriler öncelikle kimliklerine (id), bulamazsa başlıklarına göre eşleştirilir, böylece bir kategoriyi yeniden adlandırsanız bile geçmişi korunur; gerçekten yeni eklenen veya tamamen kaldırılan kategoriler ise sessizce birleştirilmek yerine açıkça etiketlenir. Bir karşılaştırma açıkken **CSV** dışa aktarımı yapıldığında, sapma tablosu da dosyaya dahil edilir.

### Geri Alma

Her değişiklik geri alınabilir: `Ctrl+Z`, ileri almak için `Ctrl+Y` (veya `Ctrl+Shift+Z`), ayrıca araç çubuğunun solundaki iki ok düğmesi de kullanılabilir. *Aynı* alana yapılan ardışık düzenlemeler tek bir adımda birleştirilir; örneğin, altı haneli bir tonaj değeri girdiğinizde bu altı ayrı işlem yerine tek bir işlem olarak sayılır. Bir satırı silerken onay kutusu çıkmaz, bu nedenle olası kazalara karşı güvenlik ağınız geri alma (undo) işlemidir; JSON yedeğini geri yüklemek de geri alınabilen bir işlemdir. Geçmiş sadece oturumla sınırlıdır ve son 100 adımı tutar — kaydedilen belgeye kalıcı olarak yazılmaz.

### Sayı Girişi

Sayı alanları, doğrudan Excel'den veya yazdırılmış bir rapordan kopyalanan değerleri sorunsuz kabul eder: `1.234,56`, `1,234.56`, `16 965 414`, `₺5.658,80`, `%18` ve muhasebe tarzı negatifleri belirten `(1.234,56)` gibi formatlar yapıştırma sırasında otomatik olarak normalleştirilir. Standart bir `<input type="number">` alanı bunları reddeder ve sessizce boş bırakırken, bu uygulama hepsini anlar. Sayıda her iki ayırıcı da (nokta ve virgül) varsa, en sağdaki ondalık işareti kabul edilir; `1.234` gibi gerçekten belirsiz bir durum varsa, **Ayarlar** kısmında belirlediğiniz sayı formatı baz alınır.

Bir hücre **bloğunu** yapıştırdığınızda, veriler yapıştırdığınız yerden aşağıya doğru doldurulur: tek bir sütun kopyaladıysanız Miktar'a, iki sütun kopyaladıysanız Miktar ve Birim Fiyat'a yerleşir. Olmayan satırlar uydurulmaz, sadece halihazırda var olan satırlara yazılır; geri kalanlar atlandı olarak raporlanır. Tüm yapıştırma işlemi tek bir `Ctrl+Z` adımıdır.

`Enter` ve `Shift+Enter` tuşları kategori sınırlarını aşarak aynı sütun içinde aşağı ve yukarı hareket etmenizi sağlar; böylece basılı bir rapordaki rakamlar sütun boyunca hızlıca girilebilir. Yön tuşlarına müdahale edilmemiştir, sayı artırma/azaltma işlevleri eskisi gibi çalışmaya devam eder.

Fare imleci odaklanılmış bir sayı alanının üzerindeyken fare tekerleğini kaydırmak, sayıyı sessizce artırmak veya azaltmak yerine odaklanmayı (focus) iptal eder.

### Formüller

Formüller `eval()` kullanılarak değil, bu iş için özel olarak yazılmış küçük bir ayrıştırıcı (`wwwroot/formula.js`) tarafından hesaplanır; böylece bir yazım hatası yanlışlıkla sistemde kod çalışmasına neden olamaz. `+ − * / ^ ( )` işaretleri, `> < >= <= = <>` (sonucu 1 veya 0 veren) karşılaştırma operatörleri, `abs, min, max, round, floor, ceil, sqrt` fonksiyonları ve `eger, ve, veya, degil` (`if` de `eger` yerine geçer) koşullu ifadeleri desteklenir ve şunlara referans verebilir:

* `uretim` — sistemin üretim rakamı
* `usd`, `eur` — güncel döviz kurları
* herhangi bir değişkenin kod adı
* `toplam` ve `kat("Kategori Adı")` — yalnızca göstergeler için geçerlidir (toplam maliyet, belirli bir kategorinin maliyeti)

Bir **formül satırı** ayrıca sonucunun aylık toplam mı yoksa doğrudan ton başına mı olduğunu ve hangi para biriminde olduğunu belirtir; uygulama buna göre dönüştürme ve bölme işlemlerini otomatik yapar. Formül düzenleyici, siz yazarken mevcut değerlerinizle çıkan sonucu gösterir ve ayrıştırma (parse) hatalarını satır içinde anında bildirir.

**Yardım** butonu (sağ üstte veya formül düzenleyicinin içi dahil herhangi bir yerde `F1` tuşu), Türkçe bir başvuru kılavuzu açar: her bir operatör ve fonksiyonun ne yaptığı, örnekli açıklamalar, yerleşik isimler, aktif sistemin kendi değişkenleri ve anlık değerleri, hazır formül örnekleri ve sık yapılan hatalar (virgül yerine nokta kullanmak, `%` işareti koymamak, büyük/küçük harf duyarlılığı, sıfıra bölmenin 0 döndürmesi gibi) burada yer alır.

Varsayılan olarak gelen Haddehane sistemi, önceden koda sabitlenmiş olan kütük/hurda-kazanım hesaplaması için bu formül altyapısını kullanır ve önceki değerleri birebir aynı verir (24,497 ve −11,911 → **12,586 $/ton** net, %95,45 verim).

## Raporlar, Yazdırma ve PDF

**Rapor** seçeneği, doğrudan düzenleme ekranını yazdırmak yerine düzgün bir belge oluşturur. Hangi sistemlerin ve bölümlerin ekleneceğini sorar (seçimleriniz hatırlanır) ve ardından üç eylem içeren bir önizleme gösterir: **Yazdır**, **PDF olarak kaydet** ve **Kapat**. `Ctrl+P` tuş kombinasyonu bu iletişim kutusunu atlayarak son kullandığınız ayarlarla aynı raporu doğrudan yazdırır.

Bölümler (her biri isteğe bağlıdır):

| Bölüm | Ne ekler? |
| --- | --- |
| Kapak | Sistem, üretim, kullanılan döviz kurları ve alındıkları kaynak, zaman damgası |
| Özet | Göstergelerinizin salt okunur kutucuklar halinde görünümü |
| Grafikler | Kategori pasta grafiği + her kategorinin sütun grafiği |
| Kategori özeti | Kategori bazında pay, `$/birim`, **aylık tutar** ve satır sayısı |
| Kalem detayı | Miktar, birim fiyat, para birimi, `$/birim`, **aylık tutar** ve **toplamdaki payı** ile birlikte tüm kalemler |
| Dönem karşılaştırması | Sapma grafiği + tablosu (bir dönem karşılaştırması açıksa) |
| Varsayımlar | Modelin okuduğu her veri girişi ve hesaplanan her değerin arkasındaki matematiksel ifade |

Koyu yazılmış sütunlar, düzenleme ekranında asla görünmeyen rakamlardır. Bir raporu denetlenebilir kılan şey "Varsayımlar" (Assumptions) ekidir; bu bölüm olmadan okuyucu sadece aritmetiği kontrol edebilir, hesaplamanın dayandığı temel girdileri göremez.

**PDF olarak kaydet** seçeneği, yazdır iletişim kutusunu açmadan dosyayı doğrudan `Belgeler\Maliyet Hesaplama\Raporlar\` klasörüne yazar ve dosya yolunu ekranda bildirir. Bu işlem, arka planda arka plan grafiklerini zorla açarak doğrudan WebView2'nin kendi PDF yazıcısı üzerinden gerçekleşir. Aksi takdirde, varsayılan Windows yazdırma iletişim kutusunda bu ayar *kapalı* olduğundan grafikler sayfa dolusu boş ana hatlar olarak çıkar.

### Grafikler Hakkında

Her iki grafik de dışarıdan bir kütüphane kullanılmadan oluşturulan satıriçi (inline) SVG'lerdir: vektörel olduklarından her boyutta keskin görünürler ve SVG dolguları ön plan (foreground) boyası sayıldığından arka plan grafikleri devre dışı bırakılsa bile baskıda sorunsuz çıkarlar.

**Pasta grafik** her kategoriyi gösterir. Ancak renklerin hakkıyla taşıyabileceğinden daha fazla dilim vardır; genellikle sekiz renkten sonra yan yana duran renkleri ayırt etmek zorlaşır ve buradaki en küçük kategoriler %1'in altındadır. Bu yüzden grafik kimliği sadece renk üzerinden değil, üç koldan sağlanır: dilimler saat yönünde büyükten küçüğe sıralanır ve **lejant, eşleşmesi için numaralandırılmış olarak aynı sırayı birebir tekrar eder**, böylece kategoriler sadece konumuna bakılarak bulunabilir; yeri müsait olan dilimlerin doğrudan üstüne etiketler yazılır; ve ekrandayken, bir dilimin veya lejanttaki bir satırın üzerine gelindiğinde her ikisi de vurgulanarak o kategorinin adı belirginleşir. Tüm değerler tablolarda da yer aldığından hiçbir bilgi sadece "renk üzerinden" bulunmaya mahkum edilmez. Alacak/İade (negatif) kalemler pasta grafiğe dahil edilmez ve altında ayrıca belirtilir (bütünün bir payı negatif olamaz) ancak sütun grafiğinde ve tablolarda eksiksiz olarak görünürler.

**Sütun grafiği** tüm kategorilerdeki tek bir ölçümü karşılaştırdığı için tek bir renk tonu kullanır; ayırt edicilik renklerle değil, satır etiketleriyle sağlanır. Alacak/İade (negatif) kalemler yeşil renkli olarak referans çizgisinin solunda yer alır. **Sapma grafiği** ise ayrışan bir yapıya sahiptir (diverging); referans çizgisi tam merkeze değil, verilerin dağılımına göre yerleştirilir, böylece her şeyin zamlandığı/yükseldiği bir ayda grafiğin tam genişliği kullanılabilir.

Sekiz renkli kategorik palet, bu uygulamanın beyaz grafik zeminine göre özel olarak doğrulanmıştır (yan yana en kötü CVD [Renk Görme Eksikliği] ΔE 9.1, normal görüşte ΔE 19.6). Sekiz renkten üçü 3:1 kontrast oranının altında kalır, bu da okunabilir etiketleri ve aynı rakamların yer aldığı bir tabloyu zorunlu kılar — ki raporda her ikisi de mevcuttur.

## Yapay Zeka (AI) İçermez

Uygulama herhangi bir yapay zeka özelliği içermez ve hiçbir yapay zeka servisiyle iletişim kurmaz. Önceki sürümlerde Gemini destekli bir komut çubuğu ve formül oluşturucu vardı; bunlar, API anahtarı işleme mekanizmasıyla birlikte kaldırıldı, bu nedenle yapılandırılacak, devre dışı bırakılacak veya girilecek bir anahtar (key) yoktur. Formüller tamamen formül düzenleyicide elle yazılır.

Exe dosyasının yaptığı tek ağ isteği, aşağıda belirtilen döviz kurları çekme işlemidir.

## Döviz Kurları

Uygulama ilk açıldığında ve siz **Kurları güncelle** düğmesine bastığınızda; USD/TRY ve EUR/TRY kurlarını doğrudan **TCMB**'nin (Türkiye Cumhuriyet Merkez Bankası) günlük bülteninden çeker. TCMB'nin henüz veri yayımlamadığı zamanlarda (hafta sonları ve tatil günleri) ise frankfurter.app üzerinden Avrupa Merkez Bankası (ECB) referans kurlarını yedek olarak kullanır. Veri çekme işlemi JavaScript değil C# üzerinden gerçekleşir, bu nedenle tarayıcının CORS (Kökenler Arası Kaynak Paylaşımı) kısıtlamalarına takılmaz.

**Kur kutularından herhangi birine kendiniz bir değer yazarsanız mevcut kur geçersiz kılınır** ve yazdığınız değer sabitlenir — bu durumda başlıkta kurun kaynağı ve tarihi yerine "elle girildi" yazar ve uygulama yeniden başlatıldığında bile bu değerin üzerine yazılmaz. Otomatik kur güncellemelerine dönmek için **Kurları güncelle** düğmesine basmanız yeterlidir.

Uygulama çevrimdışıyken, en son kaydedilen kurlar neyse onlarla sorunsuz çalışmaya devam eder.

## Exe Dosyasını Yeniden Oluşturma

Sadece PowerShell ve internet erişimi gerektirir (ilk seferinde .NET SDK'sını ve WebView2 NuGet paketini çekmek için). Yönetici yetkisine (admin rights) ihtiyaç duymaz.

```powershell
powershell -ExecutionPolicy Bypass -File .\build.ps1

```

Çıktı `.\dist\MaliyetHesaplamaAraci.exe` (~69 MB) konumuna kaydedilir.

## Nasıl Derlendi? (Yapısı)

* **`app/wwwroot/`** — Herhangi bir derleme adımı (build step), npm veya framework içermeyen, tamamen düz HTML/CSS/JS olarak uygulamanın kendisi:
* `formula.js` — ifade ayrıştırıcı / hesaplayıcı
* `store.js` — veri modeli, varsayılanlar, kalıcılık (persistence) ve tüm maliyet matematiği
* `ui.js` — ikonlar, modallar, menüler, uyarı bildirimleri (toasts)
* `charts.js` — SVG formatında grafik çizimleri; salt fonksiyonlardır (pure functions), DOM veya state (durum) içermez
* `report.js` — yazdırılabilir rapor: bölümler, seçenekler, önizleme ve yazdırma döngüsü
* `app.js` — ekran yerleşimi ve etkileşimler
* `styles.css` — açık tonlu "ofis" teması: sistem arayüz fontu, ince (hairline) kenarlıklar, sıkışık satır aralıkları


* **`app/`** — Tek bir `WebView2` bileşeni barındıran bir .NET 8 WinForms ana sunucusu (`MainForm.cs`). `wwwroot` dosyaları exe'nin içine gömülmüştür ve uygulama başlatıldığında `%LOCALAPPDATA%\MaliyetHesaplamaAraci\web` konumuna açılır; sanal bir ana bilgisayar (virtual host) eşlemesi, sayfaya kararlı bir `[https://app.local](https://app.local)` kaynağı (origin) sağlar, böylece exe nereden çalıştırılırsa çalıştırılsın `localStorage` verileri kalıcı olur. Ana sunucu (host) ayrıca döviz kuru isteklerini karşılar, tarihli yedekleri yazar ve yedekleme klasörünü açar.
* `dotnet publish`, `win-x64` mimarisi hedeflenerek harici bir çalışma zamanı gerektirmeyen (self-contained) ve tek dosya (single-file) yapısında oluşturulmuştur.

### Düzenleme Ekranındaki Grafikler

Kenar çubuğundaki döküm (breakdown), çubukların satıriçi çizildiği sıralı bir tablo şeklinde kalır: birçok kategori arasındaki tek bir ölçümü karşılaştırmak bir büyüklük karşılaştırması (magnitude comparison) olduğundan, her kategori için ayrı bir renkten oluşan renk döngüsü yerine **doğrulanmış tek bir renk tonu** (`#2a78d6`) kullanır — ayrıyetenliği (identity) satır etiketi sağlar. Alacak/İade (negatif) kalemler yeşil renkli gösterilir.

Pasta grafik burada değil, raporda bulunur — tüm kategorilerin neden gösterildiğini ve o kadar çok dilimle bile nasıl okunaklı kaldığını öğrenmek için [Raporlar, Yazdırma ve PDF](https://www.google.com/search?q=%23raporlar-yazdirma-ve-pdf) bölümünün altındaki grafik notuna bakabilirsiniz.

## Bilinen Kısıtlamalar

* Yalnızca Windows (WinForms + WebView2). Çapraz platform desteği yoktur.
* Kod imzası yoktur (Unsigned) — yukarıdaki SmartScreen notuna bakın. Kod imzalama bu uyarının çıkmasını engellerdi ancak bir sertifika gerektirir.
* Formüllerin hala referans aldığı bir değişkeni silmek, siz düzeltinceye kadar o formüllerin hatalı görünmesine sebep olur (bu bilinçli yapılmıştır; sistem, matematiğinizi sessizce yeniden yazmaz).
* Kaydedilen dönemler, çalışma kopyasının hemen yanında `localStorage`'da tutulan tam anlık görüntülerdir (snapshots). Uygulamanın tasarlanış amacı olan aylık düzenli takipler için bu idealdir; ancak büyük bir modelde kaydedilecek onlarca dönem verisi eninde sonunda tarayıcının depolama sınırına (quota) takılacaktır; artık karşılaştırma yapmadığınız eski dönemleri silmeniz önerilir.
* Geri alma geçmişi oturuma bağlıdır — belgeyle birlikte kaydedilmez ve sadece son 100 adımı tutar, bu nedenle uygulamayı kapatmak bu geçmişi temizler.

## Geçmiş (Tarihçe)

Deponun (repo) ana dizinindeki `maliyet-hesaplama-araci.jsx` dosyası, bu uygulamanın temelini oluşturan orijinal React/Recharts prototipidir. Yalnızca referans amaçlı tutulmaktadır, artık kullanılmamakta veya derlenmemektedir.
