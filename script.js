document.addEventListener("DOMContentLoaded", function () {

    // =========================================
    // GLOBAL HATA YÖNETİMİ
    // =========================================

    // API istekleri için wrapper fonksiyon
    async function apiRequest(url, options = {}) {
        try {
            // Varsayılan header'ları ekle
            const defaultHeaders = {
                'Content-Type': 'application/json'
            };

            const token = localStorage.getItem('token');
            if (token && !options.noAuth) {
                defaultHeaders['Authorization'] = token;
            }

            const config = {
                ...options,
                headers: {
                    ...defaultHeaders,
                    ...options.headers
                }
            };

            const response = await fetch(url, config);

            // Token süresi dolduysa
            if (response.status === 401 || response.status === 403) {
                showToast('Oturumunuz sona erdi. Yeniden giriş yapın.', 'warning');
                setTimeout(() => {
                    localStorage.clear();
                    window.location.href = '/login.html';
                }, 2000);
                return { success: false, expired: true };
            }

            // Server hatası
            if (response.status >= 500) {
                showToast('Sunucu hatası oluştu. Lütfen tekrar deneyin.', 'error');
                return { success: false, error: 'server_error' };
            }

            // 404 - Bulunamadı
            if (response.status === 404) {
                return { success: false, error: 'not_found' };
            }

            const data = await response.json();
            return data;

        } catch (error) {
            // Network hatası (internet yok, sunucu kapalı vb.)
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                showToast('Bağlantı hatası! İnternet bağlantınızı kontrol edin.', 'error');
            } else {
                showToast('Beklenmeyen bir hata oluştu.', 'error');
                console.error('API Hatası:', error);
            }
            return { success: false, error: 'network_error' };
        }
    }

    // Global window'a ekle (diğer scriptlerde kullanılabilsin)
    window.apiRequest = apiRequest;

    // XSS koruması için HTML escape
    function safeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
    window.safeHTML = safeHTML;

    // 1. GİRİŞ KONTROLÜ
    const token = localStorage.getItem('token');
    const isAdmin = localStorage.getItem('isAdmin');
    const username = localStorage.getItem('username');

    if (!token) { window.location.href = '/login.html'; return; }

    if (isAdmin === "true") {
        const adminBtn = document.getElementById('admin-btn');
        if (adminBtn) adminBtn.style.display = "inline-flex";
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
    let favoriVakalar = []; // Favori vakaları tutmak için

    // --- YENİ: BAŞLANGIÇ FONKSİYONLARI ---
    hosgeldinIsmiGuncelle();
    motivasyonGetir();
    ilerlemeGuncelle();
    favorileriGetir();

    // --- TAB SİSTEMİ ---
    window.tabDegistir = function (mod, e) {
        document.querySelectorAll('.st-btn').forEach(btn => btn.classList.remove('active'));
        if (e && e.currentTarget) e.currentTarget.classList.add('active');

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
        if (!klasikListeDiv) return;

        // Skeleton loading göster
        klasikListeDiv.innerHTML = `
            <div class="skeleton-card">
                <div class="skeleton skeleton-avatar"></div>
                <div style="flex:1;">
                    <div class="skeleton skeleton-line long"></div>
                    <div class="skeleton skeleton-line short"></div>
                </div>
            </div>
            <div class="skeleton-card">
                <div class="skeleton skeleton-avatar"></div>
                <div style="flex:1;">
                    <div class="skeleton skeleton-line long"></div>
                    <div class="skeleton skeleton-line short"></div>
                </div>
            </div>
            <div class="skeleton-card">
                <div class="skeleton skeleton-avatar"></div>
                <div style="flex:1;">
                    <div class="skeleton skeleton-line long"></div>
                    <div class="skeleton skeleton-line short"></div>
                </div>
            </div>
        `;

        try {
            const resRapor = await fetch('/my-reports', { headers: { 'Authorization': token } });

            if (resRapor.status === 401 || resRapor.status === 403) {
                localStorage.clear();
                window.location.href = '/login.html';
                return;
            }

            if (resRapor.ok) {
                const raporlar = await resRapor.json();
                cozulmusVakalar = raporlar.map(r => r.vakaID);
            }

            const resVaka = await fetch('/cases');
            const vakalar = await resVaka.json();

            klasikListeDiv.innerHTML = "";
            if (!vakalar.length) {
                klasikListeDiv.innerHTML = "<p style='color:#aaa; text-align:center; padding:20px;'>Klasik vaka bulunamadı.</p>";
                return;
            }

            vakalar.reverse().forEach(vaka => {
                const isSolved = cozulmusVakalar.includes(vaka.vakaNo);
                const isFavorite = favoriVakalar.includes(vaka.vakaNo);
                const durumIkonu = isSolved
                    ? '<div style="background:rgba(16, 185, 129, 0.2); color:#34d399; width:35px; height:35px; border-radius:50%; display:flex; align-items:center; justify-content:center; margin-right:15px;"><i class="fas fa-check"></i></div>'
                    : '<div style="background:rgba(59, 130, 246, 0.1); color:var(--primary); width:35px; height:35px; border-radius:50%; display:flex; align-items:center; justify-content:center; margin-right:15px;"><i class="fas fa-file-medical-alt"></i></div>';

                const opacity = isSolved ? "0.7" : "1";
                const favClass = isFavorite ? 'active' : '';
                const favIcon = isFavorite ? 'fas' : 'far';

                const div = document.createElement('div');
                div.className = 'vaka-karti';
                div.style.opacity = opacity;
                div.innerHTML = `
                    <div style="display:flex; align-items:center; cursor:pointer; flex:1; padding:5px;" onclick="vakaSec(${JSON.stringify(vaka).replace(/"/g, '&quot;')})">
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
                    </div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <button class="fav-btn ${favClass}" onclick="favoriToggle(${vaka.vakaNo}, event)" title="Favorilere Ekle">
                            <i class="${favIcon} fa-heart"></i>
                        </button>
                        <div style="color:var(--text-muted); opacity:0.5;"><i class="fas fa-chevron-right"></i></div>
                    </div>
                `;
                klasikListeDiv.appendChild(div);
            });
        } catch (e) {
            console.error('Vaka listesi hatası:', e);
            if (klasikListeDiv) klasikListeDiv.innerHTML = "<p style='color:#f87171; text-align:center; padding:20px;'><i class='fas fa-exclamation-triangle'></i> Vakalar yüklenirken bir hata oluştu.</p>";
        }
    }
    verileriHazirla();

    // --- SİMÜLASYONLARI GETİR ---
    async function simulasyonlariGetir() {
        simListeDiv.innerHTML = "<p style='color:#aaa;'>Yükleniyor...</p>";
        try {
            const res = await fetch('/simulations');
            const simler = await res.json();

            simListeDiv.innerHTML = "";
            if (!simler.length) { simListeDiv.innerHTML = "<p style='color:#aaa; padding:20px;'>Henüz simülasyon eklenmemiş.</p>"; return; }

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
    fetch('/leaderboard').then(r => r.json()).then(d => {
        if (liderlikBody) {
            liderlikBody.innerHTML = "";
            d.forEach((k, i) => {
                let madalya = "";
                if (i === 0) madalya = "🥇"; else if (i === 1) madalya = "🥈"; else if (i === 2) madalya = "🥉";
                liderlikBody.innerHTML += `<tr><td>${i + 1} ${madalya}</td><td><strong style="text-transform: capitalize;">${safeHTML(k._id)}</strong></td><td>${k.cozulenVakaSayisi}</td><td style="text-align:right; font-weight:bold; color:var(--accent);">${k.toplamPuan}</td></tr>`;
            });
        }
    });

    // --- VAKA SEÇME & BAŞLANGIÇ POP-UP ---
    window.vakaSec = function (vaka) {
        seciliVakaID = vaka.vakaNo;

        if (vaka.resimUrl) { detayResim.src = vaka.resimUrl; detayResim.style.display = 'block'; }
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
        if (btnCikis) btnCikis.style.display = 'none';
        if (btnProfil) btnProfil.style.display = 'none';

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
            let sure = 300; if (vaka.zorluk == 'Kolay') sure = 180; if (vaka.zorluk == 'Zor') sure = 600;
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

        if (modal) {
            modal.style.display = 'flex';
            if (detayEkrani) detayEkrani.style.filter = "blur(5px)";
        } else {
            baslatSayac(saniye);
        }
    }

    // Başla Butonu (Modal içindeki)
    const btnBaslat = document.getElementById('btn-vaka-baslat');
    if (btnBaslat) {
        btnBaslat.onclick = function () {
            document.getElementById('baslangicModal').style.display = 'none';
            detayEkrani.style.filter = "none";
            baslatSayac(bekleyenSure);
        };
    }

    window.baslangicIptal = function () {
        document.getElementById('baslangicModal').style.display = 'none';
        detayEkrani.style.filter = "none";
        listeyeDon();
    };

    // --- SAYAÇ ---
    function baslatSayac(sn) {
        if (sayacInterval) clearInterval(sayacInterval);
        sayacKutusu.style.display = 'flex';
        sayacKutusu.className = '';

        let kalan = sn;
        globalKalanSure = sn;
        guncelleZaman(kalan);

        sayacInterval = setInterval(() => {
            kalan--; globalKalanSure = kalan;
            guncelleZaman(kalan);
            if (kalan < 60) sayacKutusu.classList.add('timer-warning');
            if (kalan < 30) sayacKutusu.classList.add('timer-danger');
            if (kalan < 0) {
                clearInterval(sayacInterval);
                showToast("Süre bitti!", "error");
                gonderButonu.disabled = true; gonderButonu.innerHTML = "Süre Bitti";
                raporAlani.disabled = true;
            }
        }, 1000);
    }

    function guncelleZaman(s) {
        let m = Math.floor(s / 60); let sc = s % 60;
        zamanGosterge.innerText = `${m < 10 ? '0' + m : m}:${sc < 10 ? '0' + sc : sc}`;
    }

    // --- LİSTEYE DÖN ---
    window.listeyeDon = function () {
        listeEkrani.style.display = 'block';
        detayEkrani.style.display = 'none';

        // Butonları Geri Getir
        if (btnCikis) btnCikis.style.display = 'inline-flex';
        if (btnProfil) btnProfil.style.display = 'inline-flex';

        if (sayacInterval) clearInterval(sayacInterval);
        verileriHazirla();
    };

    // --- RAPOR GÖNDERME ---
    gonderButonu.addEventListener('click', async () => {
        const rapor = raporAlani.value;
        if (!rapor.trim()) return showToast("Boş rapor gönderilemez.", "warning");

        sonucMesaji.innerHTML = "<span style='color:var(--primary)'>Analiz ediliyor...</span>";
        gonderButonu.disabled = true;

        try {
            const res = await fetch('/submit-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': token },
                body: JSON.stringify({ rapor, vakaID: seciliVakaID, kalanSure: globalKalanSure })
            });
            const data = await res.json();
            if (data.success) {
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
                if (sayacInterval) clearInterval(sayacInterval);
                rozetKontrol();
                // Confetti animasyonu (puan >= 70)
                if (data.puan >= 70 && typeof launchConfetti === 'function') {
                    launchConfetti();
                }
            } else {
                sonucMesaji.innerHTML = `<span style="color:var(--danger)">${data.message}</span>`;
                gonderButonu.disabled = false;
            }
        } catch (e) { showToast("Bağlantı hatası", "error"); gonderButonu.disabled = false; }
    });

    // --- BİLDİRİM & ONAY FONKSİYONLARI ---
    window.showToast = (msg, type = 'info') => {
        let box = document.createElement('div'); box.className = `toast toast-${type}`;
        const map = { 'success': 'check-circle', 'error': 'times-circle', 'warning': 'exclamation-triangle', 'info': 'info-circle' };
        box.innerHTML = `<i class="fas fa-${map[type]}"></i><span>${msg}</span>`;
        let con = document.getElementById('toast-container') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'toast-container' }));
        con.appendChild(box); setTimeout(() => box.remove(), 3000);
    };

    window.showConfirm = (msg, cb) => {
        let ov = document.createElement('div'); ov.className = 'confirm-overlay';
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
        document.getElementById('n').onclick = () => ov.remove();
        document.getElementById('y').onclick = () => { ov.remove(); cb(); };
    };

    // --- ÇIKIŞ YAP (ŞIK ONAYLI) ---
    window.cikisYap = () => {
        showConfirm("Çıkış yapmak istiyor musunuz?", () => {
            localStorage.removeItem('token');
            localStorage.removeItem('username');
            localStorage.removeItem('isAdmin');
            localStorage.removeItem('school');
            window.location.href = '/login.html';
        });
    };

    // Feedback
    const fbBtn = document.getElementById('feedback-btn');
    if (fbBtn) {
        fbBtn.addEventListener('click', async () => {
            const txt = document.getElementById('feedback-mesaj');
            if (!txt.value.trim()) return showToast("Boş mesaj gönderilemez.", "warning");
            try {
                await fetch('/submit-feedback', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': token }, body: JSON.stringify({ mesaj: txt.value }) });
                showToast("Geri bildiriminiz iletildi.", "success");
                txt.value = "";
            } catch (e) { showToast("Hata oluştu.", "error"); }
        });
    }

    // Güvenlik
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('keydown', e => { if ((e.ctrlKey && ['c', 'x', 'u'].includes(e.key.toLowerCase())) || e.key == 'F12') e.preventDefault(); });

    // ================= YENİ FONKSIYONLAR =================

    // --- HOŞGELDİN İSMİ ---
    function hosgeldinIsmiGuncelle() {
        const isimSpan = document.getElementById('hosgeldin-isim');
        if (isimSpan && username) {
            isimSpan.textContent = username;
        }
    }

    // --- MOTİVASYON SÖZÜ GETİR ---
    async function motivasyonGetir() {
        try {
            const res = await fetch('/motivasyon');
            const data = await res.json();
            const sozEl = document.getElementById('motivasyon-soz');
            if (sozEl && data.soz) {
                sozEl.textContent = data.soz;
            }
        } catch (e) { console.log('Motivasyon alınamadı'); }
    }

    // --- İLERLEME GÖSTERGESİ GÜNCELLE ---
    async function ilerlemeGuncelle() {
        try {
            const [raporRes, toplamRes] = await Promise.all([
                fetch('/my-reports', { headers: { 'Authorization': token } }),
                fetch('/toplam-vaka-sayisi')
            ]);

            const raporlar = await raporRes.json();
            const toplam = await toplamRes.json();

            const cozulen = raporlar.length;
            const tumVakalar = toplam.toplam || 1;
            const yuzde = Math.round((cozulen / tumVakalar) * 100);

            // İlerleme yazısını güncelle
            const ilerText = document.getElementById('ilerleme-yazi');
            if (ilerText) ilerText.textContent = `${cozulen}/${tumVakalar}`;

            // Circular progress'i güncelle
            const progressCircle = document.querySelector('.progress-circle');
            if (progressCircle) {
                progressCircle.style.setProperty('--progress', `${yuzde}%`);
            }
        } catch (e) { console.log('İlerleme alınamadı'); }
    }

    // --- FAVORİLERİ GETİR ---
    async function favorileriGetir() {
        try {
            const res = await fetch('/my-favorites', { headers: { 'Authorization': token } });
            if (res.ok) {
                favoriVakalar = await res.json();
            }
        } catch (e) { console.log('Favoriler alınamadı'); }
    }

    // --- FAVORİ TOGGLE ---
    window.favoriToggle = async function (vakaID, event) {
        event.stopPropagation();
        const btn = event.currentTarget;
        const icon = btn.querySelector('i');

        if (favoriVakalar.includes(vakaID)) {
            // Favoriden çıkar
            try {
                await fetch(`/favorites/remove/${vakaID}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': token }
                });
                favoriVakalar = favoriVakalar.filter(id => id !== vakaID);
                icon.classList.remove('fas');
                icon.classList.add('far');
                btn.classList.remove('active');
                showToast('Favorilerden çıkarıldı', 'info');
            } catch (e) { showToast('Hata oluştu', 'error'); }
        } else {
            // Favoriye ekle
            try {
                await fetch('/favorites/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': token },
                    body: JSON.stringify({ vakaID })
                });
                favoriVakalar.push(vakaID);
                icon.classList.remove('far');
                icon.classList.add('fas');
                btn.classList.add('active');
                showToast('Favorilere eklendi!', 'success');
            } catch (e) { showToast('Hata oluştu', 'error'); }
        }
    };

    // --- VAKALARI FİLTRELE ---
    window.vakalariFiltrele = async function () {
        const aramaInput = document.getElementById('arama-input');
        const zorlukFiltre = document.getElementById('zorluk-filtre');
        const siralamaFiltre = document.getElementById('siralama-filtre');

        const search = aramaInput?.value || '';
        const zorluk = zorlukFiltre?.value || 'Tümü';
        const sort = siralamaFiltre?.value || 'yeni';

        try {
            const res = await fetch(`/cases-search?search=${encodeURIComponent(search)}&zorluk=${encodeURIComponent(zorluk)}&sort=${sort}`);
            const vakalar = await res.json();

            klasikListeDiv.innerHTML = "";
            if (!vakalar.length) {
                klasikListeDiv.innerHTML = "<p style='color:#aaa; text-align:center; padding:20px;'>Kriterlere uygun vaka bulunamadı.</p>";
                return;
            }

            vakalar.forEach(vaka => {
                const isSolved = cozulmusVakalar.includes(vaka.vakaNo);
                const isFavorite = favoriVakalar.includes(vaka.vakaNo);

                const durumIkonu = isSolved
                    ? '<div style="background:rgba(16, 185, 129, 0.2); color:#34d399; width:35px; height:35px; border-radius:50%; display:flex; align-items:center; justify-content:center; margin-right:15px;"><i class="fas fa-check"></i></div>'
                    : '<div style="background:rgba(59, 130, 246, 0.1); color:var(--primary); width:35px; height:35px; border-radius:50%; display:flex; align-items:center; justify-content:center; margin-right:15px;"><i class="fas fa-file-medical-alt"></i></div>';

                const opacity = isSolved ? "0.7" : "1";
                const favClass = isFavorite ? 'active' : '';
                const favIcon = isFavorite ? 'fas' : 'far';

                const div = document.createElement('div');
                div.className = 'vaka-karti';
                div.style.opacity = opacity;
                div.innerHTML = `
                    <div style="display:flex; align-items:center; cursor:pointer; flex:1; padding:5px;" onclick="vakaSec(${JSON.stringify(vaka).replace(/"/g, '&quot;')})">
                        ${durumIkonu}
                        <div>
                            <h4 style="margin:0; color:white;">${vaka.baslik}</h4>
                            <small style="color:#94a3b8;">${vaka.yas} yaş • ${vaka.cinsiyet}</small>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <button class="fav-btn ${favClass}" onclick="favoriToggle(${vaka.vakaNo}, event)">
                            <i class="${favIcon} fa-heart"></i>
                        </button>
                        <span class="zorluk-etiketi zorluk-${vaka.zorluk.toLowerCase()}">${vaka.zorluk}</span>
                    </div>
                `;
                klasikListeDiv.appendChild(div);
            });

            showToast(`${vakalar.length} vaka bulundu`, 'info');
        } catch (e) { showToast('Filtreleme hatası', 'error'); }
    };

    // --- NOT KAYDET ---
    window.notuKaydet = async function () {
        const notAlani = document.getElementById('not-alani');
        if (!notAlani || !seciliVakaID) return;

        try {
            await fetch('/notes/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': token },
                body: JSON.stringify({ vakaID: seciliVakaID, vakaType: 'klasik', text: notAlani.value })
            });
            showToast('Not kaydedildi!', 'success');
        } catch (e) { showToast('Not kaydedilemedi', 'error'); }
    };

    // --- NOTU GETİR ---
    async function notuGetir(vakaID) {
        try {
            const res = await fetch(`/notes/${vakaID}?type=klasik`, { headers: { 'Authorization': token } });
            const data = await res.json();
            const notAlani = document.getElementById('not-alani');
            if (notAlani) notAlani.value = data.text || '';
        } catch (e) { console.log('Not alınamadı'); }
    }

    // --- YORUM GÖNDER ---
    window.yorumGonder = async function () {
        const tartismaInput = document.getElementById('tartisma-input');
        if (!tartismaInput || !tartismaInput.value.trim() || !seciliVakaID) return;

        try {
            await fetch('/discussions/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': token },
                body: JSON.stringify({ vakaID: seciliVakaID, vakaType: 'klasik', text: tartismaInput.value })
            });
            tartismaInput.value = '';
            yorumlariGetir(seciliVakaID);
            showToast('Yorumunuz eklendi!', 'success');
        } catch (e) { showToast('Yorum gönderilemedi', 'error'); }
    };

    // --- YORUMLARI GETİR ---
    async function yorumlariGetir(vakaID) {
        try {
            const res = await fetch(`/discussions/${vakaID}?type=klasik`);
            const yorumlar = await res.json();
            const liste = document.getElementById('tartisma-listesi');
            const currentUser = localStorage.getItem('username');

            if (!liste) return;

            if (!yorumlar.length) {
                liste.innerHTML = '<p style="color:#94a3b8;">Henüz yorum yok. İlk yorumu sen yap!</p>';
                return;
            }

            liste.innerHTML = yorumlar.map(y => {
                const likeCount = y.likeCount || 0;
                const isLiked = y.likes && y.likes.includes(currentUser);
                return `
                <div class="discussion-item" data-id="${y._id}">
                    <div class="discussion-header">
                        <strong>@${safeHTML(y.username)}</strong>
                        <small>${new Date(y.createdAt).toLocaleDateString('tr-TR')}</small>
                    </div>
                    <p>${safeHTML(y.text)}</p>
                    <div class="discussion-actions">
                        <button class="like-btn ${isLiked ? 'liked' : ''}" onclick="yorumBegen('${y._id}', ${vakaID})">
                            <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i>
                            <span>${likeCount}</span>
                        </button>
                        <button class="reply-btn" onclick="toggleReplyForm('${y._id}')">
                            <i class="fas fa-reply"></i> Yanıtla
                        </button>
                    </div>
                    
                    <!-- Yanıt Formu (Gizli) -->
                    <div class="reply-form" id="reply-form-${y._id}" style="display:none;">
                        <input type="text" id="reply-input-${y._id}" placeholder="Yanıtınızı yazın..." />
                        <button onclick="yanitGonder('${y._id}', ${vakaID})">
                            <i class="fas fa-paper-plane"></i> Gönder
                        </button>
                    </div>
                    
                    <!-- Yanıtlar -->
                    ${y.replies && y.replies.length > 0 ? `
                        <div class="replies-container">
                            ${y.replies.map(r => `
                                <div class="discussion-reply">
                                    <strong>@${safeHTML(r.username)}</strong>
                                    <small>${new Date(r.createdAt).toLocaleDateString('tr-TR')}</small>
                                    <p>${safeHTML(r.text)}</p>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
            }).join('');
        } catch (e) { console.log('Yorumlar alınamadı'); }
    }

    // --- YORUM BEĞEN ---
    window.yorumBegen = async function (yorumId, vakaID) {
        try {
            const res = await fetch(`/discussions/like/${yorumId}`, {
                method: 'POST',
                headers: { 'Authorization': token }
            });
            const data = await res.json();
            if (data.success) {
                yorumlariGetir(vakaID);
            }
        } catch (e) { console.log('Beğeni hatası'); }
    };

    // --- YANIT FORMU TOGGLE ---
    window.toggleReplyForm = function (yorumId) {
        const form = document.getElementById(`reply-form-${yorumId}`);
        if (form) {
            form.style.display = form.style.display === 'none' ? 'flex' : 'none';
            if (form.style.display === 'flex') {
                form.querySelector('input').focus();
            }
        }
    };

    // --- YANIT GÖNDER ---
    window.yanitGonder = async function (parentId, vakaID) {
        const input = document.getElementById(`reply-input-${parentId}`);
        if (!input || !input.value.trim()) return;

        try {
            await fetch('/discussions/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': token },
                body: JSON.stringify({
                    vakaID: vakaID,
                    vakaType: 'klasik',
                    text: input.value,
                    parentId: parentId
                })
            });
            input.value = '';
            document.getElementById(`reply-form-${parentId}`).style.display = 'none';
            yorumlariGetir(vakaID);
            showToast('Yanıtınız eklendi!', 'success');
        } catch (e) { showToast('Yanıt gönderilemedi', 'error'); }
    };

    // --- YARDIM MODAL ---
    window.yardimModalAc = function () {
        document.getElementById('yardimModal').style.display = 'flex';
    };
    window.yardimModalKapat = function () {
        document.getElementById('yardimModal').style.display = 'none';
    };

    // --- DROPDOWN TOGGLE ---
    window.toggleDropdown = function (dropdownId) {
        const dropdown = document.getElementById(dropdownId);
        if (!dropdown) return;

        // Diğer tüm açık dropdownları kapat
        document.querySelectorAll('.dropdown-panel.show').forEach(panel => {
            if (panel.id !== dropdownId) {
                panel.classList.remove('show');
            }
        });

        // Bildirim panelini de kapat
        const notifPanel = document.getElementById('notif-dropdown');
        if (notifPanel) notifPanel.classList.remove('show');

        // Bu dropdown'ı toggle et
        dropdown.classList.toggle('show');
    };

    // Sayfa herhangi bir yerine tıklandığında dropdown'ları kapat
    document.addEventListener('click', function (e) {
        // Eğer tıklanan element bir dropdown içinde veya toggle butonu değilse
        if (!e.target.closest('.dropdown-container')) {
            document.querySelectorAll('.dropdown-panel.show').forEach(panel => {
                panel.classList.remove('show');
            });
            // Bildirim panelini de kapat
            const notifPanel = document.getElementById('notif-dropdown');
            if (notifPanel) {
                notifPanel.classList.remove('show');
                notifPanel.style.display = 'none';
            }
        }
    });

    // --- PRATİK MODU BUTON STİLİ GÜNCELLE ---
    window.updatePracticeButtonStyle = function () {
        const checkbox = document.getElementById('pratik-modu');
        const btn = document.getElementById('practice-toggle-btn');

        if (!checkbox || !btn) return;

        if (checkbox.checked) {
            btn.classList.add('practice-active');
            btn.innerHTML = '<i class="fas fa-dumbbell"></i> Pratik Modu <i class="fas fa-check" style="color:#10b981;"></i>';
        } else {
            btn.classList.remove('practice-active');
            btn.innerHTML = '<i class="fas fa-dumbbell"></i> Pratik Modu';
        }
    };

    // --- ROZET KONTROLÜ (Rapor gönderildikten sonra) ---
    async function rozetKontrol() {
        try {
            const res = await fetch('/check-badges', {
                method: 'POST',
                headers: { 'Authorization': token }
            });
            const data = await res.json();

            if (data.yeniRozetler && data.yeniRozetler.length > 0) {
                // Yeni rozet kazanıldı!
                data.yeniRozetler.forEach(rozet => {
                    showToast(`🏆 Yeni Rozet: ${rozet}`, 'success');
                });
            }
        } catch (e) { console.log('Rozet kontrolü yapılamadı'); }
    }

    // --- vakaSec fonksiyonunu güncelle (not ve tartışma için) ---
    const originalVakaSec = window.vakaSec;
    window.vakaSec = function (vaka) {
        // Orijinal fonksiyonu çağır
        if (originalVakaSec) {
            originalVakaSec(vaka);
        }

        // Ek işlemler: not ve tartışma
        seciliVakaID = vaka.vakaNo;
        notuGetir(vaka.vakaNo);

        // Çözülmüş vaka ise tartışma bölümünü göster
        const tartismaBolumu = document.getElementById('tartisma-bolumu');
        if (tartismaBolumu) {
            if (cozulmusVakalar.includes(vaka.vakaNo)) {
                tartismaBolumu.style.display = 'block';
                yorumlariGetir(vaka.vakaNo);
            } else {
                tartismaBolumu.style.display = 'none';
            }
        }
    };
    // --- RASTGELE VAKA ---
    window.rastgeleVaka = async function () {
        try {
            showToast('Rastgele vaka seçiliyor...', 'info');
            const res = await fetch('/random-case', {
                headers: { 'Authorization': token }
            });
            const data = await res.json();
            if (data.success && data.vaka) {
                vakaSec(data.vaka);
                showToast(`Vaka #${data.vaka.vakaNo} seçildi! 🎲`, 'success');
            } else {
                showToast(data.message || 'Vaka bulunamadı', 'warning');
            }
        } catch (e) { showToast('Bağlantı hatası', 'error'); }
    };

});

// =========================================
// GLOBAL FONKSİYONLAR (DOMContentLoaded dışında)
// =========================================

// --- NAVBAR SCROLL EFEKTİ ---
window.addEventListener('scroll', function () {
    const navbar = document.querySelector('.navbar');
    if (navbar) {
        if (window.scrollY > 50) {
            navbar.classList.add('navbar-scrolled');
        } else {
            navbar.classList.remove('navbar-scrolled');
        }
    }
});

// --- DARK / LIGHT THEME TOGGLE ---
function toggleTheme() {
    const html = document.documentElement;
    const icon = document.getElementById('theme-icon');
    const current = html.getAttribute('data-theme');
    if (current === 'light') {
        html.removeAttribute('data-theme');
        if (icon) { icon.classList.remove('fa-sun'); icon.classList.add('fa-moon'); }
        localStorage.setItem('theme', 'dark');
    } else {
        html.setAttribute('data-theme', 'light');
        if (icon) { icon.classList.remove('fa-moon'); icon.classList.add('fa-sun'); }
        localStorage.setItem('theme', 'light');
    }
}

// Tema tercihi yükle
(function () {
    const saved = localStorage.getItem('theme');
    if (saved === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        const icon = document.getElementById('theme-icon');
        if (icon) { icon.classList.remove('fa-moon'); icon.classList.add('fa-sun'); }
    }
})();

// --- CONFETTİ ANİMASYONU ---
function launchConfetti() {
    const container = document.createElement('div');
    container.className = 'confetti-container';
    document.body.appendChild(container);

    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
    const shapes = ['circle', 'rect'];

    for (let i = 0; i < 50; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        const color = colors[Math.floor(Math.random() * colors.length)];
        const shape = shapes[Math.floor(Math.random() * shapes.length)];
        const size = Math.random() * 8 + 6;
        const left = Math.random() * 100;
        const delay = Math.random() * 1.5;
        const duration = Math.random() * 2 + 2;

        piece.style.left = left + '%';
        piece.style.width = size + 'px';
        piece.style.height = shape === 'rect' ? (size * 0.6) + 'px' : size + 'px';
        piece.style.background = color;
        piece.style.borderRadius = shape === 'circle' ? '50%' : '2px';
        piece.style.animationDelay = delay + 's';
        piece.style.animationDuration = duration + 's';

        container.appendChild(piece);
    }

    setTimeout(() => container.remove(), 5000);
}
window.launchConfetti = launchConfetti;

// --- BİLDİRİM PANELİ ---
function toggleNotifPanel(e) {
    if (e) e.stopPropagation();
    const panel = document.getElementById('notif-dropdown');
    if (!panel) return;

    const isOpen = panel.classList.contains('show');

    // Diğer açık dropdown panellerini kapat
    document.querySelectorAll('.dropdown-panel.show').forEach(p => p.classList.remove('show'));

    // Bildirim panelini toggle et
    if (isOpen) {
        panel.classList.remove('show');
        panel.style.display = 'none';
    } else {
        panel.classList.add('show');
        panel.style.display = 'block';
    }
}

function markAllRead() {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch('/notifications/read-all', {
        method: 'PUT',
        headers: { 'Authorization': token }
    }).then(() => {
        loadNotifications();
    }).catch(() => { });
}

async function loadNotifications() {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
        const res = await fetch('/my-notifications', { headers: { 'Authorization': token } });
        if (!res.ok) return;
        const notifs = await res.json();
        const list = document.getElementById('notif-list');
        const badge = document.getElementById('notif-count');
        if (!list) return;

        const unreadCount = notifs.filter(n => !n.read).length;
        if (badge) {
            if (unreadCount > 0) {
                badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }

        if (!notifs.length) {
            list.innerHTML = '<div class="notif-empty"><i class="fas fa-check-circle"></i><br>Bildirim yok</div>';
            return;
        }

        list.innerHTML = notifs.slice(0, 20).map(n => {
            const date = new Date(n.createdAt).toLocaleDateString('tr-TR');
            return `<div class="notif-item ${n.read ? '' : 'unread'}">
                <p>${n.message}</p>
                <small>${date}</small>
            </div>`;
        }).join('');
    } catch (e) { /* ignore */ }
}

// Başlangıçta bildirimleri yükle
setTimeout(loadNotifications, 1000);

// Panel dışına tıklayınca kapat
document.addEventListener('click', function (e) {
    const dropdown = document.getElementById('notif-dropdown');
    const bell = document.querySelector('.notif-bell');
    if (dropdown && dropdown.classList.contains('show') && !dropdown.contains(e.target) && bell && !bell.contains(e.target)) {
        dropdown.classList.remove('show');
        dropdown.style.display = 'none';
    }
});