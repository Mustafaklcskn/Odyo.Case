document.addEventListener("DOMContentLoaded", function() {
    
    // --- 1. GİRİŞ KONTROLÜ ---
    const token = localStorage.getItem('token');
    const isAdmin = localStorage.getItem('isAdmin');
    
    // Eğer giriş yapılmamışsa login sayfasına at
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    // Admin butonunu göster (Eleman varsa işlem yap)
    if (isAdmin === "true") {
        const adminBtn = document.getElementById('admin-btn');
        if(adminBtn) adminBtn.style.display = "inline-flex"; // flex yaptık ki ikon düzgün dursun
    }

    // --- 2. HTML ELEMENTLERİNİ GÜVENLİ SEÇME ---
    // Eğer getElementById null dönerse kod patlamasın diye kontroller ekleyeceğiz.

    const listeEkrani = document.getElementById('liste-ekrani');
    const detayEkrani = document.getElementById('detay-ekrani');
    const vakaListesiDiv = document.getElementById('vaka-listesi');
    const liderlikBody = document.getElementById('liderlik-body');
    
    const detayBaslik = document.getElementById('detay-baslik');
    const detayIcerik = document.getElementById('detay-icerik');
    const detayZorluk = document.getElementById('detay-zorluk');
    const detayResim = document.getElementById('detay-resim');
    
    const gonderButonu = document.getElementById('gonder-butonu');
    const raporAlani = document.getElementById('rapor-alani');
    const sonucMesaji = document.getElementById('sonuc-mesaji');
    const sayacKutusu = document.getElementById('sayac-kutusu');
    const zamanGosterge = document.getElementById('zaman');

    let seciliVakaID = null;
    let sayacInterval = null;
    let cozulmusVakalar = []; 

    // --- 3. VERİLERİ ÇEKME ---
    async function verileriHazirla() {
        try {
            // A) Geçmiş Raporları Çek
            const resRapor = await fetch('/my-reports', { 
                headers: { 'Authorization': token } 
            });
            
            if(resRapor.ok) {
                const raporlar = await resRapor.json();
                cozulmusVakalar = raporlar.map(r => r.vakaID);
            }

            // B) Vakaları Çek
            const resVaka = await fetch('/cases');
            const vakalar = await resVaka.json();
            
            // Eğer vaka listesi divi yoksa (başka sayfadaysak) dur.
            if (!vakaListesiDiv) return;

            vakaListesiDiv.innerHTML = "";
            
            if(!Array.isArray(vakalar) || vakalar.length === 0) {
                vakaListesiDiv.innerHTML = "<p style='padding:20px; color:#aaa;'>Henüz vaka eklenmemiş.</p>";
                return;
            }

            // C) Listeyi Ekrana Bas
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
            if(vakaListesiDiv) vakaListesiDiv.innerHTML = "<p style='color:var(--danger);'>Veriler yüklenirken hata oluştu.</p>";
        }
    }

    // Başlat
    verileriHazirla();

    // Liderlik Tablosunu Getir
    fetch('/leaderboard')
        .then(res => res.json())
        .then(data => {
            if(liderlikBody) {
                liderlikBody.innerHTML = "";
                if (!data || data.length === 0) {
                    liderlikBody.innerHTML = "<tr><td colspan='4' style='text-align:center; color:#aaa;'>Henüz veri yok.</td></tr>";
                } else {
                    data.forEach((kul, index) => {
                        let madalya = "";
                        if (index === 0) madalya = "🥇";
                        if (index === 1) madalya = "🥈";
                        if (index === 2) madalya = "🥉";
                        liderlikBody.innerHTML += `
                            <tr>
                                <td>${index + 1} ${madalya}</td>
                                <td><strong style="text-transform: capitalize;">${kul._id}</strong></td>
                                <td>${kul.cozulenVakaSayisi}</td>
                                <td style="text-align:right; font-weight:bold; color:var(--accent);">${kul.toplamPuan}</td>
                            </tr>`;
                    });
                }
            }
        }).catch(e => console.log("Liderlik tablosu hatası:", e));


    // --- 4. VAKA DETAY FONKSİYONLARI ---
    
    const vakaSec = (vaka) => {
        seciliVakaID = vaka.vakaNo;
        
        // Elementler var mı kontrol et
        if(!detayEkrani || !listeEkrani) return;

        // Resim Ayarı
        if(detayResim) {
            if (vaka.resimUrl) {
                detayResim.src = vaka.resimUrl;
                detayResim.style.display = 'block';
            } else {
                detayResim.style.display = 'none';
            }
        }

        // İçerikleri Doldur
        if(detayBaslik) detayBaslik.innerText = `Vaka ${vaka.vakaNo}: ${vaka.baslik}`;
        if(detayIcerik) detayIcerik.innerText = vaka.icerik;
        if(detayZorluk) {
            detayZorluk.innerText = vaka.zorluk;
            detayZorluk.className = `zorluk-etiketi zorluk-${vaka.zorluk}`;
        }
        
        // Ekran Değişimi
        listeEkrani.style.display = 'none';
        detayEkrani.style.display = 'block';
        
        // Form Temizliği
        if(raporAlani) raporAlani.value = "";
        if(sonucMesaji) sonucMesaji.innerText = "";
        
        // KİLİT KONTROLÜ
        if (cozulmusVakalar.includes(vaka.vakaNo)) {
            // Çözülmüşse Kilitle
            if(gonderButonu) {
                gonderButonu.disabled = true;
                gonderButonu.innerHTML = '<i class="fas fa-check"></i> Tamamlandı';
                gonderButonu.style.background = "#475569";
                gonderButonu.style.cursor = "not-allowed";
            }
            if(raporAlani) {
                raporAlani.disabled = true;
                raporAlani.placeholder = "Bu vaka tamamlandı.";
            }
            if(sayacKutusu) sayacKutusu.style.display = "none";
            if(sayacInterval) clearInterval(sayacInterval);
            
        } else {
            // Çözülmemişse Aç
            if(gonderButonu) {
                gonderButonu.disabled = false;
                gonderButonu.innerHTML = '<i class="fas fa-paper-plane"></i> Analiz İçin Gönder';
                gonderButonu.style.background = "linear-gradient(135deg, var(--primary), var(--primary-hover))";
                gonderButonu.style.cursor = "pointer";
            }
            if(raporAlani) {
                raporAlani.disabled = false;
                raporAlani.placeholder = "LÜTFEN DETAYLI YAZIN:\n1. Olası Tanı\n2. İstenen Testler\n3. Beklenen Bulgular";
            }
            
            // Sayacı Başlat (300sn)
            baslatSayac(300);
        }
    };

    // SAYAÇ
    const baslatSayac = (saniye) => {
        if(sayacInterval) clearInterval(sayacInterval);
        
        if(sayacKutusu) sayacKutusu.style.display = "block";
        let kalan = saniye;
        guncelleZaman(kalan);

        sayacInterval = setInterval(() => {
            kalan--;
            guncelleZaman(kalan);

            if (kalan < 0) {
                clearInterval(sayacInterval);
                if(zamanGosterge) zamanGosterge.innerText = "00:00";
                alert("Süre Doldu!");
                
                if(gonderButonu) {
                    gonderButonu.disabled = true;
                    gonderButonu.style.background = "#475569";
                    gonderButonu.innerText = "Süre Doldu";
                }
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

    // GÖNDER BUTONU
    if(gonderButonu) {
        gonderButonu.addEventListener("click", function() {
            const yazilanRapor = raporAlani.value;
            if(!yazilanRapor.trim()) { alert("Lütfen rapor yazın!"); return; }

            sonucMesaji.innerText = "Analiz ediliyor...";
            sonucMesaji.style.color = "var(--primary)";
            gonderButonu.disabled = true;

            fetch('/submit-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': token },
                body: JSON.stringify({ rapor: yazilanRapor, vakaID: seciliVakaID })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    sonucMesaji.innerText = `PUAN: ${data.puan} - ${data.message}`;
                    sonucMesaji.style.color = "var(--secondary)";
                    if(sayacInterval) clearInterval(sayacInterval);
                    cozulmusVakalar.push(seciliVakaID);
                    
                    gonderButonu.innerHTML = '<i class="fas fa-check"></i> Tamamlandı';
                    gonderButonu.style.background = "#475569";
                    raporAlani.disabled = true;
                } else {
                    sonucMesaji.innerText = data.message;
                    sonucMesaji.style.color = "var(--danger)";
                    gonderButonu.disabled = false;
                }
            })
            .catch(err => { 
                sonucMesaji.innerText = "Hata oluştu."; 
                gonderButonu.disabled = false; 
            });
        });
    }

    // GLOBAL FONKSİYONLAR
    window.listeyeDon = function() {
        if(listeEkrani) listeEkrani.style.display = 'block';
        if(detayEkrani) detayEkrani.style.display = 'none';
        if(sayacKutusu) sayacKutusu.style.display = 'none';
        if(sayacInterval) clearInterval(sayacInterval);
        verileriHazirla(); 
    };

    window.cikisYap = function() {
        if(confirm("Çıkış yapmak istiyor musunuz?")) {
            localStorage.clear();
            window.location.href = '/login.html';
        }
    };

});