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

    // 2. ELEMENTLER
    const listeEkrani = document.getElementById('liste-ekrani');
    const detayEkrani = document.getElementById('detay-ekrani');
    const klasikListeDiv = document.getElementById('klasik-vaka-listesi');
    const simListeDiv = document.getElementById('simulasyon-listesi');
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

    // Butonlar (Gizlenip/Açılacaklar)
    const btnCikis = document.getElementById('btn-cikis');
    const btnProfil = document.getElementById('btn-profil');

    let seciliVakaID = null;
    let sayacInterval = null;
    let cozulmusVakalar = [];
    let globalKalanSure = 0;
    let bekleyenSure = 0; // Modal için geçici süre

    // --- TAB SİSTEMİ ---
    window.tabDegistir = function(mod) {
        document.querySelectorAll('.st-btn').forEach(btn => btn.classList.remove('active'));
        event.currentTarget.classList.add('active');

        if (mod === 'klasik') {
            klasikListeDiv.style.display = 'block';
            simListeDiv.style.display = 'none';
        } else {
            klasikListeDiv.style.display = 'none';
            simListeDiv.style.display = 'block';
            simulasyonlariGetir();
        }
    };

    // --- VERİLERİ GETİR (KLASİK) ---
    async function verileriHazirla() {
        try {
            const resRapor = await fetch('/my-reports', { headers: { 'Authorization': token } });
            
            if (resRapor.status === 401 || resRapor.status === 403) {
                localStorage.clear();
                window.location.href = '/login.html';
                return;
            }

            if(resRapor.ok) {
                const raporlar = await resRapor.json();
                cozulmusVakalar = raporlar.map(r => r.vakaID);
            }

            const resVaka = await fetch('/cases');
            const vakalar = await resVaka.json();
            
            klasikListeDiv.innerHTML = "";
            if(!vakalar.length) { 
                klasikListeDiv.innerHTML = "<p style='color:#aaa; text-align:center; padding:20px;'>Klasik vaka bulunamadı.</p>"; 
                return; 
            }

            vakalar.reverse().forEach(vaka => {
                const isSolved = cozulmusVakalar.includes(vaka.vakaNo);
                const durumIkonu = isSolved 
                    ? '<div style="background:rgba(16, 185, 129, 0.2); color:#34d399; width:35px; height:35px; border-radius:50%; display:flex; align-items:center; justify-content:center; margin-right:15px;"><i class="fas fa-check"></i></div>' 
                    : '<div style="background:rgba(59, 130, 246, 0.1); color:var(--primary); width:35px; height:35px; border-radius:50%; display:flex; align-items:center; justify-content:center; margin-right:15px;"><i class="fas fa-file-medical-alt"></i></div>';
                
                const opacity = isSolved ? "0.7" : "1";

                const div = document.createElement('div');
                div.className = 'vaka-karti';
                div.style.opacity = opacity;
                div.innerHTML = `
                    <div style="display:flex; align-items:center; cursor:pointer; width:100%; padding:5px;" onclick="vakaSec(${JSON.stringify(vaka).replace(/"/g, '&quot;')})">
                        ${durumIkonu}
                        <div style="flex:1;">
                            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                                <strong style="color:var(--text-main); font-size:1.05rem;">Vaka ${vaka.vakaNo}: ${vaka.baslik}</strong>
                                ${isSolved ? '<span style="font-size:0.75rem; background:rgba(16, 185, 129, 0.1); color:#34d399; padding:2px 8px; border-radius:4px;">Tamamlandı</span>' : ''}
                            </div>
                            <div style="margin-top:5px; display:flex; align-items:center; gap:10px;">
                                <span class="zorluk-etiketi zorluk-${vaka.zorluk}" style="font-size:0.75rem; padding:3px 10px;">${vaka.zorluk}</span>
                                <span style="font-size:0.8rem; color:var(--text-muted);"><i class="fas fa-user"></i> ${vaka.cinsiyet}, ${vaka.yas} Yaş</span>
                            </div>
                        </div>
                        <div style="color:var(--text-muted); opacity:0.5;"><i class="fas fa-chevron-right"></i></div>
                    </div>
                `;
                klasikListeDiv.appendChild(div);
            });
        } catch (e) { console.error(e); }
    }
    verileriHazirla();

    // --- SİMÜLASYONLARI GETİR ---
    async function simulasyonlariGetir() {
        simListeDiv.innerHTML = "<p style='color:#aaa;'>Yükleniyor...</p>";
        try {
            const res = await fetch('/simulations');
            const simler = await res.json();
            
            simListeDiv.innerHTML = "";
            if(!simler.length) { simListeDiv.innerHTML = "<p style='color:#aaa; padding:20px;'>Henüz simülasyon eklenmemiş.</p>"; return; }

            simler.reverse().forEach(sim => {
                const div = document.createElement('div');
                div.className = 'vaka-karti sim-card';
                div.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                        <div>
                            <span class="sim-badge">Klinik Simülasyon</span>
                            <div style="margin-top:5px;">
                                <strong style="color:white; font-size:1.1rem;">${sim.baslik}</strong>
                            </div>
                            <small style="color:#94a3b8;">${sim.yas} Yaş, ${sim.sikayet}</small>
                        </div>
                        <a href="/klinik.html?vaka=${sim.simNo}" style="text-decoration:none;">
                            <button style="background:var(--secondary); color:white; border:none; padding:10px 20px; border-radius:8px; cursor:pointer; font-weight:bold;">
                                Başla <i class="fas fa-play"></i>
                            </button>
                        </a>
                    </div>
                `;
                simListeDiv.appendChild(div);
            });
        } catch (e) { simListeDiv.innerHTML = "Hata oluştu."; }
    }

    // --- LİDERLİK TABLOSU ---
    fetch('/leaderboard').then(r=>r.json()).then(d=>{
        if(liderlikBody) {
            liderlikBody.innerHTML = "";
            d.forEach((k,i)=>{
                let madalya = "";
                if (i === 0) madalya = "🥇"; else if (i === 1) madalya = "🥈"; else if (i === 2) madalya = "🥉";
                liderlikBody.innerHTML += `<tr><td>${i+1} ${madalya}</td><td><strong style="text-transform: capitalize;">${k._id}</strong></td><td>${k.cozulenVakaSayisi}</td><td style="text-align:right; font-weight:bold; color:var(--accent);">${k.toplamPuan}</td></tr>`;
            });
        }
    });

    // --- VAKA SEÇME & BAŞLANGIÇ POP-UP ---
    window.vakaSec = function(vaka) {
        seciliVakaID = vaka.vakaNo;
        
        if(vaka.resimUrl) { detayResim.src = vaka.resimUrl; detayResim.style.display = 'block'; }
        else detayResim.style.display = 'none';

        detayBaslik.innerText = `Vaka ${vaka.vakaNo}: ${vaka.baslik}`;
        detayIcerik.innerText = vaka.icerik;
        detayZorluk.innerText = vaka.zorluk;
        detayZorluk.className = `zorluk-etiketi zorluk-${vaka.zorluk}`;
        detayYas.innerText = vaka.yas;
        detayCinsiyet.innerText = vaka.cinsiyet;

        listeEkrani.style.display = 'none';
        detayEkrani.style.display = 'block';
        raporAlani.value = "";
        sonucMesaji.innerHTML = "";

        // Odak Modu: Butonları Gizle
        if(btnCikis) btnCikis.style.display='none';
        if(btnProfil) btnProfil.style.display='none';
        
        sayacKutusu.style.display = 'none'; // Modal sonrası açılacak

        if (cozulmusVakalar.includes(vaka.vakaNo)) {
            gonderButonu.disabled = true; gonderButonu.innerHTML = '<i class="fas fa-check"></i> Tamamlandı';
            gonderButonu.style.background = "#475569"; gonderButonu.style.cursor = "not-allowed";
            raporAlani.disabled = true; raporAlani.placeholder = "Bu vaka tamamlandı.";
        } else {
            gonderButonu.disabled = false; gonderButonu.innerHTML = '<i class="fas fa-paper-plane"></i> Analiz İçin Gönder';
            gonderButonu.style.background = "linear-gradient(135deg, var(--primary), var(--primary-hover))"; gonderButonu.style.cursor = "pointer";
            raporAlani.disabled = false; raporAlani.placeholder = "Tanı ve bulgularınızı yazın...";
            
            // Başlangıç Modalı Aç
            let sure = 300; if(vaka.zorluk=='Kolay') sure=180; if(vaka.zorluk=='Zor') sure=600;
            acBaslangicModal(sure);
        }
    };

    function acBaslangicModal(saniye) {
        bekleyenSure = saniye;
        const modal = document.getElementById('baslangicModal');
        const sureYazi = document.getElementById('modal-sure-bilgisi');
        if (sureYazi) {
            let dakika = Math.floor(saniye / 60); // Saniyeyi dakikaya çevir
            sureYazi.innerText = `${dakika} Dakika`;
        }

        if(modal) {
            modal.style.display = 'flex';
            if(detayEkrani) detayEkrani.style.filter = "blur(5px)";
        } else {
            baslatSayac(saniye);
        }
    }

    // Başla Butonu (Modal içindeki)
    const btnBaslat = document.getElementById('btn-vaka-baslat');
    if(btnBaslat) {
        btnBaslat.onclick = function() {
            document.getElementById('baslangicModal').style.display = 'none';
            detayEkrani.style.filter = "none";
            baslatSayac(bekleyenSure);
        };
    }

    window.baslangicIptal = function() {
        document.getElementById('baslangicModal').style.display = 'none';
        detayEkrani.style.filter = "none";
        listeyeDon();
    };

    // --- SAYAÇ ---
    function baslatSayac(sn) {
        if(sayacInterval) clearInterval(sayacInterval);
        sayacKutusu.style.display = 'flex';
        sayacKutusu.className = '';
        
        let kalan = sn;
        globalKalanSure = sn;
        guncelleZaman(kalan);

        sayacInterval = setInterval(() => {
            kalan--; globalKalanSure = kalan;
            guncelleZaman(kalan);
            if(kalan<60) sayacKutusu.classList.add('timer-warning');
            if(kalan<30) sayacKutusu.classList.add('timer-danger');
            if(kalan<0) { 
                clearInterval(sayacInterval); 
                showToast("Süre bitti!", "error"); 
                gonderButonu.disabled=true; gonderButonu.innerHTML="Süre Bitti"; 
                raporAlani.disabled=true; 
            }
        }, 1000);
    }

    function guncelleZaman(s) {
        let m = Math.floor(s/60); let sc = s%60;
        zamanGosterge.innerText = `${m<10?'0'+m:m}:${sc<10?'0'+sc:sc}`;
    }

    // --- LİSTEYE DÖN ---
    window.listeyeDon = function() {
        listeEkrani.style.display = 'block';
        detayEkrani.style.display = 'none';
        
        // Butonları Geri Getir
        if(btnCikis) btnCikis.style.display='inline-flex';
        if(btnProfil) btnProfil.style.display='inline-flex';
        
        if(sayacInterval) clearInterval(sayacInterval);
        verileriHazirla(); 
    };

    // --- RAPOR GÖNDERME ---
    gonderButonu.addEventListener('click', async () => {
        const rapor = raporAlani.value;
        if(!rapor.trim()) return showToast("Boş rapor gönderilemez.", "warning");
        
        sonucMesaji.innerHTML = "<span style='color:var(--primary)'>Analiz ediliyor...</span>";
        gonderButonu.disabled = true;

        try {
            const res = await fetch('/submit-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': token },
                body: JSON.stringify({ rapor, vakaID: seciliVakaID, kalanSure: globalKalanSure })
            });
            const data = await res.json();
            if(data.success) {
                sonucMesaji.innerHTML = `
                    <div style="text-align:center; font-size:1.8rem; color:var(--secondary); font-weight:800;">PUAN: ${data.puan}</div>
                    <div style="background:rgba(59,130,246,0.1); padding:15px; margin-top:15px; border-radius:10px; border-left:4px solid var(--primary);">
                        <strong style="color:var(--primary); display:block; margin-bottom:5px;">AI YORUMU:</strong>
                        <span style="color:#e2e8f0;">${data.message}</span>
                    </div>
                    <div style="background:rgba(16,185,129,0.1); padding:15px; margin-top:15px; border-radius:10px; border-left:4px solid var(--secondary);">
                        <strong style="color:var(--secondary); display:block; margin-bottom:5px;">İDEAL CEVAP:</strong>
                        <span style="color:#e2e8f0;">${data.dogruCevap || "-"}</span>
                    </div>
                `;
                gonderButonu.innerHTML = 'Tamamlandı';
                cozulmusVakalar.push(seciliVakaID);
                if(sayacInterval) clearInterval(sayacInterval);
            } else {
                sonucMesaji.innerHTML = `<span style="color:var(--danger)">${data.message}</span>`;
                gonderButonu.disabled = false;
            }
        } catch(e) { showToast("Bağlantı hatası", "error"); gonderButonu.disabled = false; }
    });

    // --- YENİLİKLER KONTROLÜ (GÜNCELLENMİŞ) ---
    async function yenilikKontrol() {
        const newsModal = document.getElementById('yeniliklerModal');
        if(!newsModal) return;
        const key = `site_ver_${username}`;
        
        window.yenilikleriKapat = function(ver) {
            newsModal.style.display = 'none';
            if(ver) localStorage.setItem(key, ver);
        };

        try {
            const res = await fetch('/check-version?t='+Date.now());
            const data = await res.json();
            const sVer = data.version; 
            const sMsg = data.message;
            
            if(sVer && sVer !== localStorage.getItem(key)) {
                const liste = newsModal.querySelector('.news-list');
                if(liste && sMsg) {
                    const yeni = `<li style="background:rgba(59,130,246,0.15); border-left:4px solid var(--primary); padding:12px; margin-bottom:15px; border-radius:8px;"><i class="fas fa-bullhorn" style="color:var(--primary);"></i><div><strong style="color:white;">SON GELİŞME:</strong><br><span style="color:#e2e8f0;">${sMsg}</span></div></li>`;
                    liste.innerHTML = yeni + liste.innerHTML;
                }
                const btn = newsModal.querySelector('.btn-news-close');
                if(btn) btn.onclick = () => window.yenilikleriKapat(sVer);
                
                setTimeout(() => newsModal.style.display = 'flex', 1000);
            }
        } catch(e){}
    }
    yenilikKontrol();

    // --- BİLDİRİM & ONAY FONKSİYONLARI ---
    window.showToast = (msg, type='info') => {
        let box = document.createElement('div'); box.className = `toast toast-${type}`;
        const map = {'success':'check-circle','error':'times-circle','warning':'exclamation-triangle','info':'info-circle'};
        box.innerHTML = `<i class="fas fa-${map[type]}"></i><span>${msg}</span>`;
        let con = document.getElementById('toast-container') || document.body.appendChild(Object.assign(document.createElement('div'),{id:'toast-container'}));
        con.appendChild(box); setTimeout(()=>box.remove(), 3000);
    };

    window.showConfirm = (msg, cb) => {
        let ov = document.createElement('div'); ov.className='confirm-overlay';
        ov.innerHTML = `
            <div class="confirm-box">
                <i class="fas fa-question-circle" style="font-size:3.5rem; color:#f59e0b; margin-bottom:15px;"></i>
                <h3 style="color:white; margin:0 0 10px;">Emin misiniz?</h3>
                <p style="color:#94a3b8; margin-bottom:25px;">${msg}</p>
                <div class="confirm-buttons">
                    <button class="btn-confirm-no" id="n">Vazgeç</button>
                    <button class="btn-confirm-yes" id="y">Evet</button>
                </div>
            </div>`;
        document.body.appendChild(ov);
        document.getElementById('n').onclick = ()=>ov.remove();
        document.getElementById('y').onclick = ()=>{ ov.remove(); cb(); };
    };

    // --- ÇIKIŞ YAP (ŞIK ONAYLI) ---
    window.cikisYap = () => {
        showConfirm("Çıkış yapmak istiyor musunuz?", () => {
            localStorage.removeItem('token');
            localStorage.removeItem('username');
            localStorage.removeItem('isAdmin');
            localStorage.removeItem('school');
            window.location.href='/login.html';
        });
    };

    // Feedback
    const fbBtn = document.getElementById('feedback-btn');
    if(fbBtn) {
        fbBtn.addEventListener('click', async () => {
            const txt = document.getElementById('feedback-mesaj');
            if(!txt.value.trim()) return showToast("Boş mesaj gönderilemez.", "warning");
            try {
                await fetch('/submit-feedback', { method:'POST', headers:{'Content-Type':'application/json','Authorization':token}, body:JSON.stringify({mesaj:txt.value}) });
                showToast("Geri bildiriminiz iletildi.", "success");
                txt.value="";
            } catch(e) { showToast("Hata oluştu.", "error"); }
        });
    }

    // Güvenlik
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('keydown', e => { if((e.ctrlKey && ['c','x','u'].includes(e.key.toLowerCase())) || e.key=='F12') e.preventDefault(); });
});