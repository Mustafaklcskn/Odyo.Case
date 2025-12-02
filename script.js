document.addEventListener("DOMContentLoaded", function() {
    
    // 1. GİRİŞ KONTROLÜ
    const token = localStorage.getItem('token');
    const isAdmin = localStorage.getItem('isAdmin');
    const username = localStorage.getItem('username');

    if (!token) { window.location.href = '/login.html'; return; }
    
    if (isAdmin === "true") {
        const adminBtn = document.getElementById('admin-btn');
        if(adminBtn) adminBtn.style.display = "inline-flex";
    }

    // 2. ELEMENTLER VE DEĞİŞKENLER
    const listeEkrani = document.getElementById('liste-ekrani');
    const detayEkrani = document.getElementById('detay-ekrani');
    const vakaListesiDiv = document.getElementById('vaka-listesi');
    const liderlikBody = document.getElementById('liderlik-body');
    
    // Detay Elemanları
    const detayBaslik = document.getElementById('detay-baslik');
    const detayIcerik = document.getElementById('detay-icerik');
    const detayZorluk = document.getElementById('detay-zorluk');
    const detayResim = document.getElementById('detay-resim');
    const detayYas = document.getElementById('detay-yas');
    const detayCinsiyet = document.getElementById('detay-cinsiyet');

    // İşlem Elemanları
    const gonderButonu = document.getElementById('gonder-butonu');
    const raporAlani = document.getElementById('rapor-alani');
    const sonucMesaji = document.getElementById('sonuc-mesaji');
    const sayacKutusu = document.getElementById('sayac-kutusu');
    const zamanGosterge = document.getElementById('zaman');

    let seciliVakaID = null;
    let sayacInterval = null;
    let cozulmusVakalar = []; 
    let globalKalanSure = 0;
    let bekleyenSure = 0;

    // 3. TOAST BİLDİRİM SİSTEMİ
    window.showToast = function(mesaj, tip = 'info') {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }

        const iconMap = {
            'success': 'fa-check-circle',
            'error': 'fa-times-circle',
            'warning': 'fa-exclamation-triangle',
            'info': 'fa-info-circle'
        };
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${tip}`;
        toast.innerHTML = `
            <i class="fas ${iconMap[tip]}"></i>
            <span>${mesaj}</span>
        `;

        container.appendChild(toast);
        setTimeout(() => { toast.remove(); }, 3000);
    };

    // 4. ÖZEL ONAY PENCERESİ (CONFIRM)
    window.showConfirm = function(mesaj, callback) {
        const eski = document.querySelector('.confirm-overlay');
        if(eski) eski.remove();

        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = `
            <div class="confirm-box">
                <i class="fas fa-question-circle" style="font-size:3rem; color:#f59e0b; margin-bottom:15px; display:block;"></i>
                <h3 style="margin:0 0 10px 0; color:white;">Emin misiniz?</h3>
                <p style="color:#94a3b8; margin:0;">${mesaj}</p>
                <div class="confirm-buttons">
                    <button class="btn-confirm-no" id="btn-iptal">Vazgeç</button>
                    <button class="btn-confirm-yes" id="btn-onayla">Evet, Yap</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('btn-iptal').onclick = () => overlay.remove();
        document.getElementById('btn-onayla').onclick = () => {
            overlay.remove();
            callback();
        };
    };

    // 5. ÇIKIŞ FONKSİYONU
    window.cikisYap = function() {
        showConfirm("Hesabınızdan çıkış yapılacak.", function() {
            localStorage.clear();
            window.location.href = '/login.html';
        });
    };

    // 6. VERİLERİ GETİR (Vakalar & Raporlar)
    async function verileriHazirla() {
        try {
            // Raporları çekerken token kontrolü de yapmış oluyoruz
            const resRapor = await fetch('/my-reports', { headers: { 'Authorization': token } });
            
            // --- GÜVENLİK KONTROLÜ BAŞLANGICI ---
            if (resRapor.status === 401 || resRapor.status === 403) {
                // Eğer sunucu "Yetkisiz" (401) veya "Yasaklı" (403) derse:
                localStorage.clear(); // Hatalı token'ı sil
                window.location.href = '/login.html'; // Girişe at
                return; // İşlemi durdur
            }
            // --- GÜVENLİK KONTROLÜ BİTİŞİ ---

            if(resRapor.ok) {
                const raporlar = await resRapor.json();
                cozulmusVakalar = raporlar.map(r => r.vakaID);
            }

            const resVaka = await fetch('/cases');
            const vakalar = await resVaka.json();
            
            if (!vakaListesiDiv) return;
            vakaListesiDiv.innerHTML = "";
            
            if(!Array.isArray(vakalar) || vakalar.length === 0) {
                vakaListesiDiv.innerHTML = "<p style='padding:20px; color:#aaa;'>Henüz vaka eklenmemiş.</p>";
                return;
            }

            vakalar.reverse().forEach(vaka => {
                const isSolved = cozulmusVakalar.includes(vaka.vakaNo);
                const durumIkonu = isSolved ? '<i class="fas fa-check-circle" style="color:var(--secondary); margin-right:10px;"></i>' : '';
                const opacity = isSolved ? "0.6" : "1";

                const kart = document.createElement('div');
                kart.className = 'vaka-karti';
                kart.style.opacity = opacity;
                kart.innerHTML = `
                    <div style="display:flex; align-items:center;">
                        ${durumIkonu}
                        <div><strong style="color:var(--text-main);">Vaka ${vaka.vakaNo}:</strong> ${vaka.baslik}</div>
                    </div>
                    <div class="zorluk-etiketi zorluk-${vaka.zorluk}">${vaka.zorluk}</div>
                `;
                kart.onclick = () => vakaSec(vaka);
                vakaListesiDiv.appendChild(kart);
            });
        } catch (error) { 
            console.error("Veri hatası:", error);
            // İstersen burada da genel bir hata durumunda yönlendirme yapabilirsin ama 
            // yukarıdaki 401 kontrolü en kritik olanıdır.
        }
    }
    verileriHazirla();

    // Liderlik Tablosu
    fetch('/leaderboard').then(res => res.json()).then(data => {
        if(liderlikBody) {
            liderlikBody.innerHTML = "";
            if (!data || data.length === 0) liderlikBody.innerHTML = "<tr><td colspan='4' style='text-align:center; color:#aaa;'>Henüz veri yok.</td></tr>";
            else {
                data.forEach((kul, index) => {
                    let madalya = "";
                    if (index === 0) madalya = "🥇";
                    if (index === 1) madalya = "🥈";
                    if (index === 2) madalya = "🥉";
                    liderlikBody.innerHTML += `<tr><td>${index + 1} ${madalya}</td><td><strong style="text-transform: capitalize;">${kul._id}</strong></td><td>${kul.cozulenVakaSayisi}</td><td style="text-align:right; font-weight:bold; color:var(--accent);">${kul.toplamPuan}</td></tr>`;
                });
            }
        }
    });

    // 7. VAKA DETAY VE SAYAÇ SİSTEMİ
    const vakaSec = (vaka) => {
        seciliVakaID = vaka.vakaNo;
        if(!detayEkrani || !listeEkrani) return;

        // Verileri Doldur (Resim, Başlık, İçerik vb.)
        if (vaka.resimUrl) { detayResim.src = vaka.resimUrl; detayResim.style.display = 'block'; } 
        else { detayResim.style.display = 'none'; }

        detayBaslik.innerText = `Vaka ${vaka.vakaNo}: ${vaka.baslik}`;
        detayIcerik.innerText = vaka.icerik;
        detayZorluk.innerText = vaka.zorluk; 
        detayZorluk.className = `zorluk-etiketi zorluk-${vaka.zorluk}`;
        detayYas.innerText = vaka.yas || "-";
        detayCinsiyet.innerText = vaka.cinsiyet || "-";

        // Ekran Değişimi
        listeEkrani.style.display = 'none';
        detayEkrani.style.display = 'block';
        raporAlani.value = "";
        sonucMesaji.innerHTML = "";
        
        const btnCikis = document.getElementById('btn-cikis');
        if(btnCikis) btnCikis.style.display = 'none';

        // SAYAÇ KUTUSUNU BAŞLANGIÇTA GİZLE (Pop-up'tan sonra açılacak)
        if(sayacKutusu) sayacKutusu.style.display = "none";

        // Vaka zaten çözülmüş mü?
        if (cozulmusVakalar.includes(vaka.vakaNo)) {
            gonderButonu.disabled = true; 
            gonderButonu.innerHTML = '<i class="fas fa-check"></i> Tamamlandı'; 
            gonderButonu.style.background = "#475569"; 
            gonderButonu.style.cursor = "not-allowed";
            raporAlani.disabled = true; 
            raporAlani.placeholder = "Bu vaka daha önce tamamlandı.";
            if(sayacInterval) clearInterval(sayacInterval);
        } else {
            // Çözülmemişse Hazırlık Yap
            gonderButonu.disabled = false; 
            gonderButonu.innerHTML = '<i class="fas fa-paper-plane"></i> Analiz İçin Gönder'; 
            gonderButonu.style.background = "linear-gradient(135deg, var(--primary), var(--primary-hover))"; 
            gonderButonu.style.cursor = "pointer";
            raporAlani.disabled = false; 
            raporAlani.placeholder = "LÜTFEN DETAYLI YAZIN:\n1. Olası Tanı\n2. İstenen Testler\n3. Beklenen Bulgular";
            
            // SÜREYİ HESAPLA AMA BAŞLATMA
            let sure = 300; 
            if(vaka.zorluk === 'Kolay') sure = 180;
            if(vaka.zorluk === 'Zor') sure = 600;
            
            // --- BURASI DEĞİŞTİ: Direkt başlatmak yerine Modal Açıyoruz ---
            acBaslangicModal(sure);
        }
    };

    function acBaslangicModal(saniye) {
        const modal = document.getElementById('baslangicModal');
        const sureBilgi = document.getElementById('modal-sure-bilgisi');
        
        // Saniyeyi dakikaya çevirip ekrana yaz
        let dk = Math.floor(saniye / 60);
        if(sureBilgi) sureBilgi.innerText = dk;
        
        // Süreyi hafızaya al
        bekleyenSure = saniye;
        
        // Modalı Göster
        modal.style.display = 'flex';
        
        // Arka planı (detay ekranını) bulanıklaştır ki kopya çekilmesin :)
        if(detayEkrani) detayEkrani.style.filter = "blur(10px)";
    }

    // Başla Butonuna Tıklanınca
    const btnBaslat = document.getElementById('btn-vaka-baslat');
    if(btnBaslat) {
        btnBaslat.onclick = function() {
            document.getElementById('baslangicModal').style.display = 'none';
            if(detayEkrani) detayEkrani.style.filter = "none"; // Bulanıklığı kaldır
            
            // Sayacı Şimdi Başlat
            baslatSayac(bekleyenSure);
        };
    }

    // Vazgeç Butonu
    window.baslangicIptal = function() {
        document.getElementById('baslangicModal').style.display = 'none';
        if(detayEkrani) detayEkrani.style.filter = "none";
        listeyeDon();
    };

    const baslatSayac = (saniye) => {
        if(sayacInterval) clearInterval(sayacInterval);
        
        sayacKutusu.style.display = "flex";
        sayacKutusu.className = ""; // Renkleri sıfırla
        
        let kalan = saniye;
        globalKalanSure = saniye;
        guncelleZaman(kalan);

        sayacInterval = setInterval(() => {
            kalan--;
            globalKalanSure = kalan;
            guncelleZaman(kalan);

            // Görsel Efektler
            if(kalan < 60) sayacKutusu.classList.add('timer-warning');
            if(kalan < 30) {
                sayacKutusu.classList.remove('timer-warning');
                sayacKutusu.classList.add('timer-danger');
            }

            if (kalan < 0) {
                clearInterval(sayacInterval);
                zamanGosterge.innerText = "00:00";
                showToast("Süre Doldu!", "error");
                gonderButonu.disabled = true; 
                gonderButonu.innerHTML = "Süre Bitti";
                raporAlani.disabled = true;
            }
        }, 1000);
    };

    const guncelleZaman = (sn) => {
        let dk = Math.floor(sn / 60);
        let saniye = sn % 60;
        if(dk < 10) dk = "0" + dk;
        if(saniye < 10) saniye = "0" + saniye;
        zamanGosterge.innerText = `${dk}:${saniye}`;
    };

    // 8. RAPOR GÖNDERME
    if(gonderButonu) {
        gonderButonu.addEventListener("click", function() {
            const yazilanRapor = raporAlani.value;
            if(!yazilanRapor.trim()) { showToast("Lütfen bir rapor yazınız.", "warning"); return; }
            
            sonucMesaji.innerHTML = "<span style='color:var(--primary)'>Analiz ediliyor...</span>";
            gonderButonu.disabled = true;

            fetch('/submit-report', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json', 'Authorization': token }, 
                body: JSON.stringify({ 
                    rapor: yazilanRapor, 
                    vakaID: seciliVakaID,
                    kalanSure: globalKalanSure
                }) 
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    showToast("Analiz Tamamlandı!", "success");
                    
                    sonucMesaji.innerHTML = `
                        <div style="margin-bottom:15px; text-align:center;">
                            <span style="font-size:1.8rem; color:var(--secondary); font-weight:800;">PUAN: ${data.puan}</span>
                        </div>
                        <div style="background:rgba(59, 130, 246, 0.1); padding:15px; border-radius:10px; border-left:4px solid var(--primary); margin-bottom:15px; text-align:left;">
                            <strong style="display:block; color:var(--primary); margin-bottom:5px; font-size:0.9rem; text-transform:uppercase;">AI Hoca Yorumu:</strong>
                            <span style="color:#e2e8f0;">${data.message}</span>
                        </div>
                        <div style="background:rgba(16, 185, 129, 0.1); padding:15px; border-radius:10px; border-left:4px solid var(--secondary); text-align:left;">
                            <strong style="display:block; color:var(--secondary); margin-bottom:5px; font-size:0.9rem; text-transform:uppercase;">✅ İdeal Uzman Yaklaşımı:</strong>
                            <span style="font-style:italic; color:#cbd5e1; font-size:0.95rem;">${data.dogruCevap || "Cevap oluşturulamadı."}</span>
                        </div>
                    `;
                    
                    if(sayacInterval) clearInterval(sayacInterval);
                    cozulmusVakalar.push(seciliVakaID);
                    gonderButonu.innerHTML = '<i class="fas fa-check"></i> Tamamlandı';
                    gonderButonu.style.background = "#475569";
                    raporAlani.disabled = true;
                } else {
                    showToast(data.message, "error");
                    sonucMesaji.innerHTML = `<span style="color:var(--danger)">${data.message}</span>`;
                    gonderButonu.disabled = false;
                }
            }).catch(err => { 
                showToast("Sunucu hatası oluştu.", "error"); 
                gonderButonu.disabled = false; 
            });
        });
    }

    window.listeyeDon = function() {
        listeEkrani.style.display = 'block';
        detayEkrani.style.display = 'none';
        const btnCikis = document.getElementById('btn-cikis');
        if(btnCikis) btnCikis.style.display = 'inline-flex';
        
        if(sayacInterval) clearInterval(sayacInterval);
        verileriHazirla();

        if(sayacInterval) clearInterval(sayacInterval);
        verileriHazirla(); 
    };

    // --- AKILLI YENİLİKLER MODALI (DÜZELTİLMİŞ) ---
    // --- SÜPER DEBUG YENİLİK KONTROLÜ ---
    // --- SÜPER DEBUG YENİLİK KONTROLÜ (DÜZELTİLDİ) ---
    async function yenilikKontrol() {
        const newsModal = document.getElementById('yeniliklerModal');
        if(!newsModal) return;

        const aktifKullanici = localStorage.getItem('username');
        if (!aktifKullanici) return;

        const storageKey = `site_version_key_${aktifKullanici}`;

        try {
            // Sunucuya istek atıyoruz
            const res = await fetch('/check-version?t=' + Date.now());
            
            // Cevabı önce METİN olarak alalım
            const gelenCevap = await res.text();
            
            // Eğer gelen cevap JSON değilse (HTML ise) hata ver
            if (!gelenCevap.trim().startsWith("{")) {
                console.log("SUNUCUDAN GELEN HATALI CEVAP:", gelenCevap);
                return;
            }

            // JSON'a çevir
            const data = JSON.parse(gelenCevap);
            const sunucuVersiyonu = data.version; // Değişken adı: sunucuVersiyonu
            const sunucuMesaji = data.message;
            const yerelVersiyon = localStorage.getItem(storageKey);

            // KARŞILAŞTIRMA (HATA BURADAYDI, DÜZELDİ)
            if (sunucuVersiyonu !== yerelVersiyon) {
                const liste = newsModal.querySelector('.news-list');
                if(liste && sunucuMesaji) {
                    liste.innerHTML = `
                        <li style="background:rgba(59,130,246,0.1); border-left:3px solid var(--primary);">
                            <i class="fas fa-bell" style="color:var(--primary);"></i>
                            <div>
                                <strong style="color:white;">📢 Son Gelişme:</strong><br>
                                ${sunucuMesaji}
                            </div>
                        </li>
                    `;
                }
                newsModal.style.display = 'flex';
            }

            window.yenilikleriKapat = function() {
                newsModal.style.display = 'none';
                localStorage.setItem(storageKey, sunucuVersiyonu);
            };

        } catch (err) {
            console.error("Yenilik kontrol hatası:", err);
        }
    }
    
    // Fonksiyonu çalıştır
    yenilikKontrol();

    // Feedback Gönderimi
    const feedbackBtn = document.getElementById('feedback-btn');
    if(feedbackBtn) {
        feedbackBtn.addEventListener('click', async () => {
            const kutu = document.getElementById('feedback-mesaj');
            const sonuc = document.getElementById('feedback-sonuc');
            if(!kutu.value.trim()) { showToast("Boş mesaj gönderilemez.", "warning"); return; }
            
            sonuc.innerText = "Gönderiliyor...";
            try {
                const res = await fetch('/submit-feedback', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': token },
                    body: JSON.stringify({ mesaj: kutu.value })
                });
                const data = await res.json();
                if(data.success) {
                    showToast("Mesajınız iletildi, teşekkürler!", "success");
                    kutu.value = "";
                    sonuc.innerText = "";
                } else {
                    showToast("Hata: " + data.message, "error");
                    sonuc.innerText = "";
                }
            } catch(e) { showToast("Bağlantı hatası.", "error"); sonuc.innerText = ""; }
        });
    }

    // Güvenlik: Sağ Tık ve Kopyalama Engeli
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('keydown', e => {
        if ((e.ctrlKey && ['c', 'x', 'u', 'C', 'X', 'U'].includes(e.key)) || e.key === 'F12') {
            e.preventDefault();
        }
    });

});