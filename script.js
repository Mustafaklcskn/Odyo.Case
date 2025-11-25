document.addEventListener("DOMContentLoaded", function() {
    
    // --- 1. GİRİŞ VE YETKİ KONTROLÜ ---
    const token = localStorage.getItem('token');
    const isAdmin = localStorage.getItem('isAdmin');
    const username = localStorage.getItem('username');

    // Token yoksa direkt Login sayfasına at
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    // --- SIDEBAR BİLGİLERİNİ GÜNCELLE ---
    if(username) {
        document.getElementById('sidebar-username').innerText = username;
        // Kullanıcının baş harfini alıp büyük harf yap
        document.getElementById('avatar-initial').innerText = username.charAt(0).toUpperCase();
    }

    // Admin ise menüdeki butonu görünür yap
    if (isAdmin === "true") {
        const adminBtn = document.getElementById('admin-btn');
        if(adminBtn) adminBtn.style.display = "flex"; // Flex yapısı bozulmasın
    }

    // --- 2. HTML ELEMENTLERİNİ SEÇİYORUZ ---
    const listeEkrani = document.getElementById('liste-ekrani');
    const detayEkrani = document.getElementById('detay-ekrani');
    const vakaListesiDiv = document.getElementById('vaka-listesi');
    const liderlikBody = document.getElementById('liderlik-body');
    
    // Detay Ekranı Elementleri
    const detayBaslik = document.getElementById('detay-baslik');
    const detayIcerik = document.getElementById('detay-icerik');
    const detayZorluk = document.getElementById('detay-zorluk');
    const detayResim = document.getElementById('detay-resim');
    
    const gonderButonu = document.getElementById('gonder-butonu');
    const raporAlani = document.getElementById('rapor-alani');
    const sonucMesaji = document.getElementById('sonuc-mesaji');
    
    // Sayaç Elementleri
    const sayacKutusu = document.getElementById('sayac-kutusu');

    let seciliVakaID = null;
    let sayacInterval = null;
    let cozulmusVakalar = []; 

    // --- 3. VERİLERİ ÇEKME VE İSTATİSTİKLER ---

    async function verileriHazirla() {
        try {
            // A) Geçmiş Raporları Çek
            const resRapor = await fetch('/my-reports', { headers: { 'Authorization': token } });
            let raporlar;

            // GÜVENLİK KONTROLÜ: Gelen cevap başarılı mı?
            if (resRapor.ok) {
                raporlar = await resRapor.json();
            } else {
                console.error("Raporlar çekilemedi:", resRapor.status);
                raporlar = []; // Hata varsa boş liste kabul et
            }
            
            // EKSTRA GÜVENLİK: Gelen şey gerçekten bir dizi (liste) mi?
            if (Array.isArray(raporlar)) {
                // Sadece vaka ID'lerini al
                cozulmusVakalar = raporlar.map(r => r.vakaID);
            } else {
                console.error("Sunucudan liste gelmedi:", raporlar);
                cozulmusVakalar = [];
                raporlar = []; // İstatistik fonksiyonu patlamasın diye boş array yap
            }

            // B) Tüm Vakaları Çek
            const resVaka = await fetch('/cases');
            const vakalar = await resVaka.json();
            
            vakaListesiDiv.innerHTML = "";
            
            if(!Array.isArray(vakalar) || vakalar.length === 0) {
                vakaListesiDiv.innerHTML = "<p style='text-align:center; color:#94a3b8; padding:20px;'>Görüntülenecek vaka bulunamadı.</p>";
            } else {
                // Vakaları Listele
                vakalar.reverse().forEach(vaka => {
                    const isSolved = cozulmusVakalar.includes(vaka.vakaNo);
                    
                    // İkon ayarı
                    const ikon = isSolved 
                        ? '<i class="fas fa-check-circle" style="color:var(--secondary); font-size:1.5rem;"></i>' 
                        : '<i class="fas fa-folder" style="color:#cbd5e1; font-size:1.5rem;"></i>';
                    
                    const opacity = isSolved ? "0.6" : "1";

                    // Başlık Gösterimi (Yaş/Cinsiyet var mı?)
                    let baslikHTML = '';
                    if (vaka.yas && vaka.cinsiyet) {
                        const ikonCinsiyet = vaka.cinsiyet === 'Kadın' ? '<i class="fas fa-venus"></i>' : '<i class="fas fa-mars"></i>';
                        const renkCinsiyet = vaka.cinsiyet === 'Kadın' ? 'etiket-kadin' : 'etiket-erkek';
                        
                        baslikHTML = `
                            <div class="hasta-bilgi">
                                <span style="font-size:0.8rem; font-weight:700; color:var(--primary);">#${vaka.vakaNo}</span>
                                <span class="etiket-cinsiyet ${renkCinsiyet}">${ikonCinsiyet} ${vaka.cinsiyet}</span>
                                <span class="etiket-yas">${vaka.yas} Yaş</span>
                            </div>
                            <div class="vaka-sikayet">${vaka.sikayet}</div>
                        `;
                    } else {
                        // Eski format desteği
                        baslikHTML = `
                            <div class="hasta-bilgi">
                                <span style="font-size:0.8rem; font-weight:700; color:var(--primary);">#${vaka.vakaNo}</span>
                            </div>
                            <div class="vaka-sikayet">${vaka.baslik}</div>
                        `;
                    }

                    const kart = document.createElement('div');
                    kart.className = 'vaka-karti';
                    kart.style.opacity = opacity;
                    
                    kart.innerHTML = `
                        <div style="display:flex; align-items:center; gap:15px;">
                            ${ikon}
                            <div>${baslikHTML}</div>
                        </div>
                        <div class="zorluk-etiketi zorluk-${vaka.zorluk}">${vaka.zorluk}</div>
                    `;
                    
                    kart.onclick = () => vakaSec(vaka);
                    vakaListesiDiv.appendChild(kart);
                });
            }

            // C) İSTATİSTİKLERİ GÜNCELLE
            istatistikleriGuncelle(raporlar);

        } catch (error) {
            console.error("Veri hatası:", error);
            vakaListesiDiv.innerHTML = "<p style='color:red; text-align:center;'>Veriler yüklenirken bir hata oluştu. Lütfen sayfayı yenileyin.</p>";
        }
    }

    // İstatistik Kartlarını Doldur
    function istatistikleriGuncelle(raporlar) {
        // 1. Çözülen Vaka Sayısı
        document.getElementById('stat-vaka').innerText = cozulmusVakalar.length;

        // 2. Toplam Puan ve Sıralama (Leaderboard'dan çekeceğiz)
        fetch('/leaderboard')
            .then(res => res.json())
            .then(data => {
                // Liderlik tablosunu da dolduralım
                liderlikBody.innerHTML = "";
                data.forEach((kul, index) => {
                    let madalya = "";
                    if (index === 0) madalya = "🥇";
                    if (index === 1) madalya = "🥈";
                    if (index === 2) madalya = "🥉";
                    
                    liderlikBody.innerHTML += `
                        <tr>
                            <td>${index + 1} ${madalya}</td>
                            <td style="font-weight:600;">${kul._id}</td>
                            <td>${kul.cozulenVakaSayisi}</td>
                            <td style="text-align:right; font-weight:bold; color:var(--primary);">${kul.toplamPuan}</td>
                        </tr>`;
                });

                // Benim verilerim
                const myUser = data.find(u => u._id === username);
                if (myUser) {
                    document.getElementById('stat-puan').innerText = myUser.toplamPuan;
                    const sira = data.indexOf(myUser) + 1;
                    document.getElementById('stat-sira').innerText = sira + ".";
                } else {
                    document.getElementById('stat-puan').innerText = "0";
                    document.getElementById('stat-sira').innerText = "-";
                }
            });
    }

    // Başlat
    verileriHazirla();


    // --- 4. VAKA SEÇME VE DETAY ---
    
    const vakaSec = (vaka) => {
        seciliVakaID = vaka.vakaNo;
        
        // Resim Kontrolü
        if (vaka.resimUrl) {
            detayResim.src = vaka.resimUrl;
            detayResim.style.display = 'block';
        } else {
            detayResim.style.display = 'none';
        }

        // İçerik Doldur
        detayBaslik.innerText = `Vaka ${vaka.vakaNo}: ${vaka.baslik}`;
        detayIcerik.innerText = vaka.icerik;
        detayZorluk.innerText = vaka.zorluk;
        detayZorluk.className = `zorluk-etiketi zorluk-${vaka.zorluk}`;
        
        // Ekran Değiştir (Split Screen açılır)
        listeEkrani.style.display = 'none';
        detayEkrani.style.display = 'block';
        
        // Temizle
        raporAlani.value = "";
        sonucMesaji.innerText = "";
        
        // --- KİLİT KONTROLÜ ---
        if (cozulmusVakalar.includes(vaka.vakaNo)) {
            // Çözülmüşse Kilitle
            gonderButonu.disabled = true;
            gonderButonu.innerHTML = '<i class="fas fa-check-circle"></i> Bu Vakayı Tamamladınız';
            gonderButonu.style.background = "#94a3b8"; 
            gonderButonu.style.cursor = "not-allowed";
            
            raporAlani.disabled = true;
            raporAlani.placeholder = "Bu vaka tamamlandı. Raporunuzu 'Geçmişim' sayfasından görebilirsiniz.";
            
            sayacKutusu.style.display = "none";
            if(sayacInterval) clearInterval(sayacInterval);
            
        } else {
            // Çözülmemişse Aç
            gonderButonu.disabled = false;
            gonderButonu.innerHTML = 'Analiz Et ve Gönder';
            gonderButonu.style.background = "var(--primary)";
            gonderButonu.style.cursor = "pointer";
            
            raporAlani.disabled = false;
            raporAlani.placeholder = "Bulgularınızı buraya yazın...";
            
            // Sayacı Başlat (5 dk)
            baslatSayac(300);
        }
    };

    // --- 5. SAYAÇ ---
    const baslatSayac = (saniye) => {
        if(sayacInterval) clearInterval(sayacInterval);
        
        sayacKutusu.style.display = "block";
        sayacKutusu.innerText = "05:00"; // Sıfırla
        
        let kalan = saniye;
        
        sayacInterval = setInterval(() => {
            kalan--;
            let dk = Math.floor(kalan / 60);
            let sn = kalan % 60;
            if(dk < 10) dk = "0" + dk;
            if(sn < 10) sn = "0" + sn;
            
            sayacKutusu.innerText = `${dk}:${sn}`;

            if (kalan < 0) {
                clearInterval(sayacInterval);
                sayacKutusu.innerText = "00:00";
                alert("Süre doldu!");
                gonderButonu.disabled = true;
                raporAlani.disabled = true;
                gonderButonu.innerText = "Süre Doldu";
            }
        }, 1000);
    };


    // --- 6. RAPOR GÖNDERME ---
    gonderButonu.addEventListener("click", function() {
        const yazilanRapor = raporAlani.value;
        if(!yazilanRapor.trim()) { alert("Lütfen rapor yazın!"); return; }

        sonucMesaji.innerText = "Yapay zeka analiz ediyor, lütfen bekleyin...";
        sonucMesaji.style.color = "var(--primary)";
        gonderButonu.disabled = true;

        fetch('/submit-report', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': token 
            },
            body: JSON.stringify({ rapor: yazilanRapor, vakaID: seciliVakaID })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                sonucMesaji.innerHTML = `<strong style="color:var(--secondary); font-size:1.1rem;">PUAN: ${data.puan}</strong><br>${data.message}`;
                if(sayacInterval) clearInterval(sayacInterval);
                
                // Listeye ekle ve istatistikleri güncelle
                cozulmusVakalar.push(seciliVakaID);
                verileriHazirla(); // İstatistikler güncellensin diye

                gonderButonu.innerHTML = '<i class="fas fa-check"></i> Gönderildi';
                raporAlani.disabled = true;
            } else {
                sonucMesaji.innerText = data.message;
                sonucMesaji.style.color = "var(--danger)";
                gonderButonu.disabled = false;
            }
        })
        .catch(err => { 
            sonucMesaji.innerText = "Bağlantı hatası.";
            gonderButonu.disabled = false;
        });
    });

    // --- 7. GLOBAL FONKSİYONLAR ---
    window.listeyeDon = function() {
        listeEkrani.style.display = 'block';
        detayEkrani.style.display = 'none';
        if(sayacInterval) clearInterval(sayacInterval);
        verileriHazirla(); // Listeyi yenile
    };

    window.cikisYap = function() {
        if(confirm("Çıkış yapmak istediğine emin misin?")) {
            localStorage.clear();
            window.location.href = '/login.html';
        }
    };
});