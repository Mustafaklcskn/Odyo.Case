document.addEventListener("DOMContentLoaded", function() {
    
    // --- YENİ BİLDİRİM FONKSİYONU ---
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
        const renkMap = {
            'success': '#10b981', // Yeşil
            'error': '#ef4444',   // Kırmızı
            'warning': '#f59e0b', // Turuncu
            'info': '#3b82f6'     // Mavi
        };

        const toast = document.createElement('div');
        toast.className = `toast toast-${tip}`;
        toast.innerHTML = `
            <i class="fas ${iconMap[tip]}" style="color:${renkMap[tip]}"></i>
            <span>${mesaj}</span>
        `;

        container.appendChild(toast);

        // 3 saniye sonra DOM'dan sil
        setTimeout(() => { toast.remove(); }, 3000);
    };

    // 1. GİRİŞ KONTROLÜ
    const token = localStorage.getItem('token');
    const isAdmin = localStorage.getItem('isAdmin');
    if (!token) { window.location.href = '/login.html'; return; }
    if (isAdmin === "true") {
        const adminBtn = document.getElementById('admin-btn');
        if(adminBtn) adminBtn.style.display = "inline-flex";
    }

    // 2. ELEMENTLER
    const listeEkrani = document.getElementById('liste-ekrani');
    const detayEkrani = document.getElementById('detay-ekrani');
    const vakaListesiDiv = document.getElementById('vaka-listesi');
    const liderlikBody = document.getElementById('liderlik-body');
    const detayBaslik = document.getElementById('detay-baslik');
    const detayIcerik = document.getElementById('detay-icerik');
    const detayZorluk = document.getElementById('detay-zorluk');
    const detayResim = document.getElementById('detay-resim');
    
    // YENİ EKLENENLER
    const detayYas = document.getElementById('detay-yas');
    const detayCinsiyet = document.getElementById('detay-cinsiyet');

    const gonderButonu = document.getElementById('gonder-butonu');
    const raporAlani = document.getElementById('rapor-alani');
    const sonucMesaji = document.getElementById('sonuc-mesaji');
    const sayacKutusu = document.getElementById('sayac-kutusu');
    const zamanGosterge = document.getElementById('zaman');

    let seciliVakaID = null;
    let sayacInterval = null;
    let cozulmusVakalar = []; 

    // 3. VERİ ÇEKME
    async function verileriHazirla() {
        try {
            const resRapor = await fetch('/my-reports', { headers: { 'Authorization': token } });
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
        } catch (error) { console.error("Veri hatası:", error); }
    }
    verileriHazirla();

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

    // 4. VAKA DETAY
    const vakaSec = (vaka) => {
        seciliVakaID = vaka.vakaNo;
        if(!detayEkrani || !listeEkrani) return;

        if(detayResim) {
            if (vaka.resimUrl) { detayResim.src = vaka.resimUrl; detayResim.style.display = 'block'; } 
            else { detayResim.style.display = 'none'; }
        }

        if(detayBaslik) detayBaslik.innerText = `Vaka ${vaka.vakaNo}: ${vaka.baslik}`;
        if(detayIcerik) detayIcerik.innerText = vaka.icerik;
        if(detayZorluk) { detayZorluk.innerText = vaka.zorluk; detayZorluk.className = `zorluk-etiketi zorluk-${vaka.zorluk}`; }
        
        // YENİ: Yaş ve Cinsiyet
        if(detayYas) detayYas.innerText = vaka.yas || "-";
        if(detayCinsiyet) detayCinsiyet.innerText = vaka.cinsiyet || "-";

        listeEkrani.style.display = 'none';
        detayEkrani.style.display = 'block';
        if(raporAlani) raporAlani.value = "";
        if(sonucMesaji) sonucMesaji.innerText = "";
        
        if (cozulmusVakalar.includes(vaka.vakaNo)) {
            if(gonderButonu) { gonderButonu.disabled = true; gonderButonu.innerHTML = '<i class="fas fa-check"></i> Tamamlandı'; gonderButonu.style.background = "#475569"; gonderButonu.style.cursor = "not-allowed"; }
            if(raporAlani) { raporAlani.disabled = true; raporAlani.placeholder = "Bu vaka tamamlandı."; }
            if(sayacKutusu) sayacKutusu.style.display = "none";
            if(sayacInterval) clearInterval(sayacInterval);
        } else {
            if(gonderButonu) { gonderButonu.disabled = false; gonderButonu.innerHTML = '<i class="fas fa-paper-plane"></i> Analiz İçin Gönder'; gonderButonu.style.background = "linear-gradient(135deg, var(--primary), var(--primary-hover))"; gonderButonu.style.cursor = "pointer"; }
            if(raporAlani) { raporAlani.disabled = false; raporAlani.placeholder = "LÜTFEN DETAYLI YAZIN:\n1. Olası Tanı\n2. İstenen Testler\n3. Beklenen Bulgular"; }
            baslatSayac(300);
        }
    };

    const baslatSayac = (saniye) => {
        if(sayacInterval) clearInterval(sayacInterval);
        if(sayacKutusu) sayacKutusu.style.display = "block";
        let kalan = saniye;
        guncelleZaman(kalan);
        sayacInterval = setInterval(() => {
            kalan--; guncelleZaman(kalan);
            if (kalan < 0) {
                clearInterval(sayacInterval);
                if(zamanGosterge) zamanGosterge.innerText = "00:00";
                alert("Süre Doldu!");
                if(gonderButonu) { gonderButonu.disabled = true; gonderButonu.style.background = "#475569"; gonderButonu.innerText = "Süre Doldu"; }
                if(raporAlani) raporAlani.disabled = true;
            }
        }, 1000);
    };

    const guncelleZaman = (sn) => {
        if(!zamanGosterge) return;
        let dk = Math.floor(sn / 60);
        let saniye = sn % 60;
        if(dk < 10) dk = "0" + dk;
        if(saniye < 10) saniye = "0" + saniye;
        zamanGosterge.innerText = `${dk}:${saniye}`;
    };

    if(gonderButonu) {
        gonderButonu.addEventListener("click", function() {
            const yazilanRapor = raporAlani.value;
            if(!yazilanRapor.trim()) { alert("Lütfen rapor yazın!"); return; }
            sonucMesaji.innerText = "Analiz ediliyor...";
            sonucMesaji.style.color = "var(--primary)";
            gonderButonu.disabled = true;
            fetch('/submit-report', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': token }, body: JSON.stringify({ rapor: yazilanRapor, vakaID: seciliVakaID }) })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    // --- BURASI GÜNCELLENDİ: HTML KUTULARI EKLENDİ ---
                    sonucMesaji.innerHTML = `
                        <div style="margin-bottom:15px; text-align:center;">
                            <span style="font-size:1.8rem; color:var(--secondary); font-weight:800;">PUAN: ${data.puan}</span>
                        </div>
                        
                        <!-- AI Yorumu Kutusu -->
                        <div style="background:rgba(59, 130, 246, 0.1); padding:15px; border-radius:10px; border-left:4px solid var(--primary); margin-bottom:15px; text-align:left;">
                            <strong style="display:block; color:var(--primary); margin-bottom:5px; font-size:0.9rem; text-transform:uppercase;">AI Hoca Yorumu:</strong>
                            <span style="color:#e2e8f0;">${data.message}</span>
                        </div>

                        <!-- İdeal Cevap Kutusu -->
                        <div style="background:rgba(16, 185, 129, 0.1); padding:15px; border-radius:10px; border-left:4px solid var(--secondary); text-align:left;">
                            <strong style="display:block; color:var(--secondary); margin-bottom:5px; font-size:0.9rem; text-transform:uppercase;">✅ İdeal Uzman Yaklaşımı:</strong>
                            <span style="font-style:italic; color:#cbd5e1; font-size:0.95rem;">${data.dogruCevap || "Cevap oluşturulamadı."}</span>
                        </div>
                    `;
                    // ----------------------------------------------------

                    sonucMesaji.style.color = "inherit"; // Rengi CSS yönetsin
                    
                    if(sayacInterval) clearInterval(sayacInterval);
                    cozulmusVakalar.push(seciliVakaID);
                    
                    gonderButonu.innerHTML = '<i class="fas fa-check"></i> Tamamlandı';
                    gonderButonu.style.background = "#475569";
                    gonderButonu.style.cursor = "not-allowed";
                    raporAlani.disabled = true;

                } else {
                    // HATA DURUMU
                    sonucMesaji.innerHTML = `<span style="color:var(--danger); font-weight:bold;">${data.message}</span>`;
                    gonderButonu.disabled = false;
                }
            }).catch(err => { sonucMesaji.innerText = "Hata oluştu."; gonderButonu.disabled = false; });
        });
    }

    window.listeyeDon = function() {
        if(listeEkrani) listeEkrani.style.display = 'block';
        if(detayEkrani) detayEkrani.style.display = 'none';
        if(sayacKutusu) sayacKutusu.style.display = 'none';
        if(sayacInterval) clearInterval(sayacInterval);
        verileriHazirla(); 
    };

    // --- ÖZEL ONAY PENCERESİ FONKSİYONU ---
    window.showConfirm = function(mesaj, callback) {
        // Varsa eskileri temizle
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

        // Buton Olayları
        document.getElementById('btn-iptal').onclick = () => overlay.remove();
        document.getElementById('btn-onayla').onclick = () => {
            overlay.remove();
            callback(); // İşlemi gerçekleştir
        };
    };

    // --- ÇIKIŞ YAP (GÜNCELLENDİ) ---
    window.cikisYap = function() {
        showConfirm("Hesabınızdan çıkış yapılacak.", function() {
            localStorage.clear();
            window.location.href = '/login.html';
        });
    };

// --- GÜVENLİK KORUMALARI ---

// 1. Sağ Tıklamayı Engelle
document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
});

// 2. Kopyalama ve Geliştirici Araçları Kısayollarını Engelle
document.addEventListener('keydown', function(e) {
    // Ctrl+C (Kopyala), Ctrl+X (Kes), Ctrl+U (Kaynak Kod), F12 (Geliştirici)
    if (
        (e.ctrlKey && (e.key === 'c' || e.key === 'C')) || 
        (e.ctrlKey && (e.key === 'x' || e.key === 'X')) || 
        (e.ctrlKey && (e.key === 'u' || e.key === 'U')) || 
        e.key === 'F12'
    ) {
        e.preventDefault();
        // İstersen caydırıcı bir uyarı da gösterebilirsin:
        // alert("Sınav güvenliği nedeniyle kopyalama yapmak yasaktır!");
    }
});

    // --- AKILLI YENİLİKLER MODALI (OTOMATİK KONTROL) ---
    async function yenilikKontrol() {
        const newsModal = document.getElementById('yeniliklerModal');
        if(!newsModal) return;

        try {
            // 1. Sunucudan güncel versiyonu öğren
            const res = await fetch('/check-version');
            const data = await res.json();
            const sunucuVersiyonu = data.version;

            // 2. Tarayıcıda kayıtlı versiyonu öğren
            const yerelVersiyon = localStorage.getItem('site_version_key');

            // 3. Eğer versiyonlar farklıysa Pop-up'ı göster
            if (sunucuVersiyon !== yerelVersiyon) {
                setTimeout(() => {
                    newsModal.style.display = 'flex';
                }, 1500); // 1.5 sn sonra havalı bir giriş yapsın
            }

            // 4. Kapatma butonuna basınca yeni versiyonu kaydet
            window.yenilikleriKapat = function() {
                newsModal.style.display = 'none';
                localStorage.setItem('site_version_key', sunucuVersiyonu);
            };

        } catch (err) {
            console.log("Versiyon kontrol hatası (Önemsiz):", err);
        }
    }

    // Fonksiyonu çalıştır
    yenilikKontrol();

});