
// ODYOMETRİ SİMÜLATÖRÜ

// Değişkenler
let audioContext = null;
let oscillator = null;
let gainNode = null;

// Durum
let currentState = {
    freqIndex: 3, // 1000 Hz
    db: 30,
    ear: 'right', // right, left
    conduction: 'air', // air, bone
    masking: false,
    maskDb: 0,
    maskType: 'NBN',
    maskEar: 'left' // Maske gürültüsünün verildiği kulak
};

// Maskeleme Plato Logu
let maskingLog = []; // {freq, testEar, maskDb, maskEar, threshold, heard}

// Sabitler
const FREQUENCIES = [125, 250, 500, 1000, 2000, 4000, 8000];
const MIN_DB = -10;
const MAX_DB = 120;

// Vaka Verisi (AI Tarafından Üretilecek veya Rastgele)
let currentCase = {
    right: { 125: 10, 250: 10, 500: 15, 1000: 20, 2000: 25, 4000: 40, 8000: 50 },
    left: { 125: 10, 250: 10, 500: 10, 1000: 15, 2000: 15, 4000: 20, 8000: 20 },
    boneRight: { 500: 0, 1000: 5, 2000: 10, 4000: 15 }, // Kemik yolu
    boneLeft: { 500: 0, 1000: 0, 2000: 0, 4000: 5 }
};

// İşaretlenen Noktalar
let userPoints = {
    right: { air: {}, bone: {} },
    left: { air: {}, bone: {} }
};

// Puanlama
let score = 100;
let usedHint = false;

document.addEventListener("DOMContentLoaded", () => {
    initAudio();
    initCanvas();
    generateRandomCase();
    updateScreen();
    drawAudiogram();

    // Klavye kısayolları
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            e.preventDefault();
            markThreshold();
        }
        if (e.code === 'ArrowUp') changeDb(-5);
        if (e.code === 'ArrowDown') changeDb(5);
        if (e.code === 'ArrowLeft') changeFreq(-1);
        if (e.code === 'ArrowRight') changeFreq(1);
        if (e.key === 'Control') presentTone(true);
    });

    document.addEventListener('keyup', (e) => {
        if (e.key === 'Control') presentTone(false);
    });
});

// --- SES SİSTEMİ ---
function initAudio() {
    try {
        window.AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioContext();
    } catch (e) {
        console.error("Web Audio API desteklenmiyor.");
    }
}

function playTone(freq, db, ear) {
    if (!audioContext) initAudio();
    if (oscillator) stopTone();

    oscillator = audioContext.createOscillator();
    gainNode = audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = freq;

    // dB to Gain (Basit logaritmik çeviri)
    // 0 dBHL yaklaşık 0.001 gain kabul edelim (kalibrasyon gerekir normalde)
    // Bu sadece simülasyon duyumu için, gerçek odyometri değil.
    // Kullanıcıya duyurmak için:
    let gainVal = Math.pow(10, (db - 100) / 20);
    // Not: Web Audio'da çok yüksek sesler distorsiyon yaratır, burada sadece temsilidir.
    // Gerçekte odyometre sessizdir, sadece hasta duyar. 
    // Simülasyonda kullanıcı "Klinisyen" olduğu için sesi duymamalı, sadece ışığı görmeli.
    // Ancak "Pratik Mod"da duymak isteyebilir. Şimdilik sesi kapalı tutalım, sadece mantık işlesin.

    // gainNode.gain.value = 0; // Sesi kullanıcıya duyurma (Profesyonel mod)

    // oscillator.connect(gainNode);
    // gainNode.connect(audioContext.destination);
    // oscillator.start();

    checkPatientResponse(freq, db, ear);
}

function stopTone() {
    if (oscillator) {
        try { oscillator.stop(); } catch (e) { }
        oscillator = null;
    }
}

// --- HASTA YANITI (GELİŞMİŞ MASKELEME + PLATO MANTIĞI) ---
function checkPatientResponse(freq, dbRef, earRef) {
    const testEar = currentState.ear;
    const nonTestEar = testEar === 'right' ? 'left' : 'right';
    const mode = currentState.conduction;
    const maskEar = currentState.maskEar; // Kullanıcının seçtiği maske kulağı

    // 1. GERÇEK EŞİKLERİ AL
    let testEarThreshold = getThreshold(testEar, mode, freq);
    let testEarBoneThreshold = getBoneThreshold(testEar, freq);
    let nonTestBoneThreshold = getBoneThreshold(nonTestEar, freq);

    // 2. KROS İŞİTME (CROSS HEARING)
    const IA = (mode === 'bone') ? 0 : 40;
    const crossOverLevel = currentState.db - IA;

    // 3. MASKELEME ETKİSİ (Kullanıcının seçtiği kulağa göre)
    let maskingEffectOnMaskEar = 0;  // Maskenin verildiği kulaktaki etki
    let overmaskingEffect = 0;        // Maskenin test kulağına sızma etkisi
    let isOvermasking = false;

    if (currentState.masking && currentState.maskDb > 0) {
        const maskEarAirThreshold = (maskEar === 'right') ? currentCase.right[freq] : currentCase.left[freq];
        if (maskEarAirThreshold === undefined) return showResponseLight(false);

        // Effective Masking: Maske > Eşik ise fark kadar maskeleme yapılır
        if (currentState.maskDb > maskEarAirThreshold) {
            maskingEffectOnMaskEar = currentState.maskDb - maskEarAirThreshold;
        }

        // OVERMASKING: Maske sesi IA'yı aşarak test kulağına sızıyor mu?
        // Maske kulağından test kulağına geçen ses = maskDb - IA
        const maskCrossover = currentState.maskDb - IA;
        if (maskCrossover >= testEarBoneThreshold) {
            overmaskingEffect = maskCrossover - testEarBoneThreshold + 5;
            isOvermasking = true;
        }

        // WN (Beyaz Gürültü) daha fazla enerji yayar → overmasking riski %20 daha yüksek
        if (currentState.maskType === 'WN') {
            overmaskingEffect = Math.ceil(overmaskingEffect * 1.2);
        }
    }

    // Overmasking uyarısı göster/gizle
    const overmaskWarning = document.getElementById('overmasking-warning');
    if (overmaskWarning) {
        overmaskWarning.style.display = isOvermasking ? 'block' : 'none';
    }

    // 4. YENİ EŞİKLER HESAPLA
    // Maskenin verildiği kulağın kemik eşiği yükselir (maskeleme etkisi)
    let effectiveNonTestBone = nonTestBoneThreshold;
    let effectiveTestThreshold = testEarThreshold;

    if (currentState.masking) {
        if (maskEar === nonTestEar) {
            // DOĞRU KULAK: Karşı kulak maskeleniyor
            effectiveNonTestBone = nonTestBoneThreshold + maskingEffectOnMaskEar;
        } else if (maskEar === testEar) {
            // YANLIŞ KULAK: Test kulağı maskeleniyor (her zaman hata)
            effectiveTestThreshold = testEarThreshold + maskingEffectOnMaskEar;
        }

        // Overmasking etkisi (maske karşıdan test kulağına sızarsa)
        if (isOvermasking && maskEar === nonTestEar) {
            effectiveTestThreshold = testEarThreshold + overmaskingEffect;
        }
    }

    // 5. KARAR: HASTA DUYDU MU?
    let heard = false;

    // A) Test Kulağı duydu mu?
    if (currentState.db >= effectiveTestThreshold) {
        heard = true;
    }

    // B) Karşı Kulak duydu mu? (Gölge İşitme)
    if (crossOverLevel >= effectiveNonTestBone) {
        heard = true;
    }

    // 6. PLATO LOG KAYDI
    if (currentState.masking) {
        maskingLog.push({
            freq: freq,
            testEar: testEar,
            maskDb: currentState.maskDb,
            maskEar: maskEar,
            conduction: mode,
            signalDb: currentState.db,
            heard: heard,
            isOvermasking: isOvermasking
        });
        updatePlateauLog();
    }

    showResponseLight(heard);
}

// Yardımcı: Eşik al
function getThreshold(ear, mode, freq) {
    let val;
    if (mode === 'bone') {
        val = (ear === 'right') ? currentCase.boneRight[freq] : currentCase.boneLeft[freq];
    } else {
        val = (ear === 'right') ? currentCase.right[freq] : currentCase.left[freq];
    }
    if (val === undefined) val = (ear === 'right') ? currentCase.right[freq] : currentCase.left[freq];
    return val || 0;
}

function getBoneThreshold(ear, freq) {
    let val = (ear === 'right') ? currentCase.boneRight[freq] : currentCase.boneLeft[freq];
    if (val === undefined) val = (ear === 'right') ? currentCase.right[freq] : currentCase.left[freq];
    return val || 0;
}

// Plato log'u güncelle (UI)
function updatePlateauLog() {
    const logEl = document.getElementById('plateau-log');
    const statusEl = document.getElementById('plateau-status');
    if (!logEl) return;

    // Son 10 kaydı göster
    const recentLogs = maskingLog.slice(-10);
    if (recentLogs.length === 0) {
        logEl.innerHTML = '<span style="color:#64748b;">Henüz veri yok</span>';
        statusEl.innerText = '—';
        statusEl.style.color = '#64748b';
        return;
    }

    let html = '';
    recentLogs.forEach((entry, i) => {
        const icon = entry.heard ? '🔴' : '⚫';
        const maskLabel = entry.maskEar === 'right' ? 'R' : 'L';
        html += `<div style="margin-bottom:2px;">${icon} ${entry.freq}Hz | ${entry.signalDb}dB | Maske:${entry.maskDb}dB→${maskLabel} ${entry.isOvermasking ? '⚠️' : ''}</div>`;
    });
    logEl.innerHTML = html;

    // Plato durumu kontrol
    const plateauResult = detectPlateau();
    if (plateauResult.found) {
        statusEl.innerText = '✅ PLATO BULUNDU';
        statusEl.style.color = '#10b981';
    } else if (recentLogs.some(e => e.isOvermasking)) {
        statusEl.innerText = '⚠️ OVERMASKING';
        statusEl.style.color = '#ef4444';
    } else {
        statusEl.innerText = `${recentLogs.length} kayıt`;
        statusEl.style.color = '#f59e0b';
    }

    // Scroll to bottom
    const container = document.getElementById('plateau-log-container');
    if (container) container.scrollTop = container.scrollHeight;
}

// Plato tespit: Aynı frekans + kulak + iletim tipinde, 3 ardışık farklı maskDb'de aynı threshold (heard/not aynı)
function detectPlateau() {
    if (maskingLog.length < 3) return { found: false };

    // Son frekans/kulak/conduction'a göre filtrele
    const last = maskingLog[maskingLog.length - 1];
    const relevantLogs = maskingLog.filter(e =>
        e.freq === last.freq &&
        e.testEar === last.testEar &&
        e.conduction === last.conduction &&
        e.signalDb === last.signalDb
    );

    if (relevantLogs.length < 3) return { found: false };

    // Son 3 kaydın maskDb değerleri farklı olmalı (artan) ve heard durumları aynı olmalı
    const lastThree = relevantLogs.slice(-3);
    const sameHeard = lastThree.every(e => e.heard === lastThree[0].heard);
    const maskDbs = lastThree.map(e => e.maskDb);
    const increasing = maskDbs[0] < maskDbs[1] && maskDbs[1] < maskDbs[2];
    const range = maskDbs[2] - maskDbs[0];

    if (sameHeard && increasing && range >= 10) {
        return { found: true, threshold: lastThree[0].signalDb, freq: last.freq, ear: last.testEar };
    }

    return { found: false };
}

// Maskeleme gerekliliği kontrolü
function checkIfMaskingNeeded(ear, freq, mode) {
    const nonTestEar = ear === 'right' ? 'left' : 'right';
    const IA = (mode === 'bone') ? 0 : 40;
    const testThreshold = getThreshold(ear, mode, freq);
    const nonTestBone = getBoneThreshold(nonTestEar, freq);

    // Maskeleme gerekli: test kulağı eşiği - karşı kulak kemik eşiği >= IA
    return (testThreshold - nonTestBone) >= IA;
}

// Maskeleme puanlama
function evaluateMaskingScore() {
    let maskScore = 0;
    let maskFeedback = [];

    // Her frekans/kulak/iletim tipi için maskeleme gerekli miydi kontrol et
    let maskingNeededCount = 0;
    let maskingAppliedCorrectly = 0;
    let wrongEarCount = 0;
    let overmaskCount = 0;
    let plateauFoundWhenNeeded = 0;

    ['right', 'left'].forEach(ear => {
        ['air', 'bone'].forEach(mode => {
            const freqs = mode === 'bone' ? [500, 1000, 2000, 4000] : [125, 250, 500, 1000, 2000, 4000, 8000];
            freqs.forEach(freq => {
                const needed = checkIfMaskingNeeded(ear, freq, mode);
                if (!needed) return;
                maskingNeededCount++;

                // Bu frekans için maskeleme log'u var mı?
                const logs = maskingLog.filter(e =>
                    e.freq === freq && e.testEar === ear && e.conduction === mode
                );

                if (logs.length === 0) {
                    // Maskeleme gerekli ama uygulanmamış
                    maskFeedback.push(`❌ ${ear === 'right' ? 'Sağ' : 'Sol'} ${freq}Hz (${mode === 'air' ? 'Hava' : 'Kemik'}): Maskeleme gerekli ama yapılmadı`);
                    return;
                }

                // Yanlış kulağa verilmiş mi?
                const nonTestEar = ear === 'right' ? 'left' : 'right';
                const wrongEarLogs = logs.filter(e => e.maskEar === ear); // Test kulağına verildiyse yanlış
                if (wrongEarLogs.length > 0) {
                    wrongEarCount++;
                    maskFeedback.push(`⚠️ ${ear === 'right' ? 'Sağ' : 'Sol'} ${freq}Hz: Maske test kulağına verilmiş (yanlış)`);
                }

                // Overmasking var mı?
                const overLogs = logs.filter(e => e.isOvermasking);
                if (overLogs.length > 0) {
                    overmaskCount++;
                }

                // Doğru kulağa verilmiş mi?
                const correctLogs = logs.filter(e => e.maskEar === nonTestEar && !e.isOvermasking);
                if (correctLogs.length > 0) {
                    maskingAppliedCorrectly++;
                }
            });
        });
    });

    // Puanlama
    if (maskingNeededCount > 0) {
        const missingMaskPenalty = (maskingNeededCount - maskingAppliedCorrectly) * 5;
        maskScore -= Math.min(missingMaskPenalty, 15);

        if (wrongEarCount > 0) {
            maskScore -= Math.min(wrongEarCount * 5, 10);
            maskFeedback.push(`Yanlış kulağa maskeleme: -${Math.min(wrongEarCount * 5, 10)} puan`);
        }

        if (overmaskCount > 0) {
            maskScore -= Math.min(overmaskCount * 5, 10);
            maskFeedback.push(`Overmasking tespit edildi: -${Math.min(overmaskCount * 5, 10)} puan`);
        }
    }

    return { score: maskScore, feedback: maskFeedback, needed: maskingNeededCount };
}

// Maske kulağı seç
function setMaskEar(ear) {
    currentState.maskEar = ear;
    // UI güncelle
    const rightBtn = document.getElementById('mask-ear-right');
    const leftBtn = document.getElementById('mask-ear-left');

    if (ear === 'right') {
        rightBtn.style.border = '2px solid #ef4444';
        rightBtn.style.background = 'rgba(239,68,68,0.2)';
        rightBtn.style.color = '#ef4444';
        rightBtn.style.opacity = '1';
        leftBtn.style.border = '2px solid transparent';
        leftBtn.style.background = '#334155';
        leftBtn.style.color = '#94a3b8';
        leftBtn.style.opacity = '0.6';
    } else {
        leftBtn.style.border = '2px solid #3b82f6';
        leftBtn.style.background = 'rgba(59,130,246,0.2)';
        leftBtn.style.color = '#3b82f6';
        leftBtn.style.opacity = '1';
        rightBtn.style.border = '2px solid transparent';
        rightBtn.style.background = '#334155';
        rightBtn.style.color = '#94a3b8';
        rightBtn.style.opacity = '0.6';
    }
}

function showResponseLight(active) {
    const light = document.getElementById('response-light');
    if (active) {
        light.classList.add('active');
        // Rastgele gecikme ile söndür (gerçekçilik için)
        // Kullanıcı butondan elini çekince sönmeli aslında.
    } else {
        light.classList.remove('active');
    }
}

function presentTone(isActive) {
    // Görsel geri bildirim
    const btn = document.getElementById('present-tone-btn');
    if (isActive) {
        btn.style.backgroundColor = '#dc2626';
        btn.style.transform = 'translateY(2px)';
        const freq = FREQUENCIES[currentState.freqIndex];
        playTone(freq, currentState.db, currentState.ear);
    } else {
        btn.style.backgroundColor = '#ef4444';
        btn.style.transform = 'translateY(0)';
        showResponseLight(false); // Butondan elini çekince ışık söner
        stopTone();
    }
}


// --- KONTROLLER ---
function changeFreq(dir) {
    let newIndex = currentState.freqIndex + dir;
    if (newIndex >= 0 && newIndex < FREQUENCIES.length) {
        currentState.freqIndex = newIndex;
        updateScreen();
    }
}

function changeDb(amount) {
    let newDb = currentState.db + amount;
    if (newDb >= MIN_DB && newDb <= MAX_DB) {
        currentState.db = newDb;
        updateScreen();
    }
}

function setEar(ear) {
    currentState.ear = ear;
    document.querySelectorAll('.ear-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.ear-btn.${ear}`).classList.add('active');
    updateScreen(); // Ekranda bir şey değişmiyor ama state güncellendi
}

function setConduction(mode) {
    currentState.conduction = mode;
    document.getElementById('btn-air').classList.remove('active');
    document.getElementById('btn-bone').classList.remove('active');
    document.getElementById(`btn-${mode}`).classList.add('active');

    // Kemik yoluna geçince bazı frekanslar olmayabilir (125, 8000), bunu kontrol etmeliyiz
    // Şimdilik serbest bırakalım, çizimde hallederiz.
}

function updateScreen() {
    document.getElementById('screen-freq').innerText = FREQUENCIES[currentState.freqIndex] + " Hz";
    document.getElementById('screen-db').innerText = currentState.db + " dB";
}

// --- ODYOGRAM (CANVAS) ---
let canvas, ctx;
const MARGIN = 50;
let width, height;

function initCanvas() {
    canvas = document.getElementById('audiogramCanvas');
    ctx = canvas.getContext('2d');
    // Retina ekranlar için ölçekleme
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    width = rect.width;
    height = rect.height;

    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    drawAudiogram();
}

function drawAudiogram() {
    ctx.clearRect(0, 0, width, height);

    // Arkaplan
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);

    const graphW = width - 2 * MARGIN;
    const graphH = height - 2 * MARGIN;

    // IZGARA ÇİZİMİ
    ctx.beginPath();
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;

    // Frekanslar (Dikey Çizgiler)
    FREQUENCIES.forEach((f, i) => {
        const x = MARGIN + (i / (FREQUENCIES.length - 1)) * graphW;
        ctx.moveTo(x, MARGIN);
        ctx.lineTo(x, height - MARGIN);

        // Etiket
        ctx.fillStyle = "#64748b";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(f.toString(), x, MARGIN - 10);
    });

    // Desibeller (Yatay Çizgiler)
    const dbRange = MAX_DB - MIN_DB; // 120 - (-10) = 130
    for (let db = MIN_DB; db <= MAX_DB; db += 10) {
        const y = MARGIN + ((db - MIN_DB) / dbRange) * graphH;
        ctx.moveTo(MARGIN, y);
        ctx.lineTo(width - MARGIN, y);

        // Etiket
        ctx.fillStyle = "#64748b";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(db.toString(), MARGIN - 10, y + 4);
    }
    ctx.stroke();

    // NOKTALARI ÇİZ
    drawPoints('right', 'air', '#ef4444', 'O');
    drawPoints('left', 'air', '#3b82f6', 'X');
    drawPoints('right', 'bone', '#ef4444', '<');
    drawPoints('left', 'bone', '#3b82f6', '>');
}

function drawPoints(ear, mode, color, symbol) {
    const points = userPoints[ear][mode];
    const keys = Object.keys(points).map(Number).sort((a, b) => a - b);

    if (keys.length === 0) return;

    const graphW = width - 2 * MARGIN;
    const graphH = height - 2 * MARGIN;
    const dbRange = MAX_DB - MIN_DB;

    // Çizgi
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    keys.forEach((freq, i) => {
        const db = points[freq];
        const fIndex = FREQUENCIES.indexOf(freq);
        if (fIndex === -1) return;

        const x = MARGIN + (fIndex / (FREQUENCIES.length - 1)) * graphW;
        const y = MARGIN + ((db - MIN_DB) / dbRange) * graphH;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    // Kemik yolu çizgisi kesik olur
    if (mode === 'bone') ctx.setLineDash([5, 5]);
    else ctx.setLineDash([]);

    ctx.stroke();
    ctx.setLineDash([]);

    // Semboller
    keys.forEach(freq => {
        const db = points[freq];
        const fIndex = FREQUENCIES.indexOf(freq);
        if (fIndex === -1) return;

        const x = MARGIN + (fIndex / (FREQUENCIES.length - 1)) * graphW;
        const y = MARGIN + ((db - MIN_DB) / dbRange) * graphH;

        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.font = "bold 16px sans-serif";
        ctx.textAlign = "center";

        if (symbol === 'O') {
            ctx.beginPath();
            ctx.arc(x, y, 6, 0, 2 * Math.PI);
            ctx.stroke(); // İçi boş daire
            ctx.fillStyle = "white"; // Simge çizgisi üstüne gelmesin diye
            // ctx.fill(); // Gerek yok, şeffaf daha iyi
        } else if (symbol === 'X') {
            // X çiz
            ctx.beginPath();
            const s = 5;
            ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s);
            ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s);
            ctx.stroke();
        } else {
            // < veya >
            ctx.fillText(symbol, x, y + 5);
        }
    });
}

function markThreshold() {
    const freq = FREQUENCIES[currentState.freqIndex];
    const db = currentState.db;
    const ear = currentState.ear;
    const mode = currentState.conduction;

    // Veriyi kaydet
    userPoints[ear][mode][freq] = db;

    drawAudiogram();
}

function deletePoint() {
    // Mevcut frekanstaki noktayı sil
    const freq = FREQUENCIES[currentState.freqIndex];
    const ear = currentState.ear;
    const mode = currentState.conduction;

    if (userPoints[ear][mode][freq] !== undefined) {
        delete userPoints[ear][mode][freq];
        drawAudiogram();
    }
}

// --- VAKA ÜRETİMİ (ÇOK ÇEŞİTLİ) ---
function generateRandomCase() {
    const r = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];

    // Vaka tipleri
    const caseTypes = [
        // 0: PRESBİAKUZİ (Yaşa bağlı bilateral SNK, tiz kayıp)
        {
            name: 'Presbiakuzi',
            gen: () => {
                const b = r(5, 15);
                return {
                    right: { 125: b, 250: b, 500: b + r(0, 5), 1000: b + r(5, 15), 2000: b + r(15, 25), 4000: b + r(30, 50), 8000: b + r(40, 60) },
                    left: { 125: b, 250: b + r(0, 5), 500: b + r(0, 10), 1000: b + r(5, 15), 2000: b + r(15, 30), 4000: b + r(35, 55), 8000: b + r(45, 65) },
                    gapRight: 0, gapLeft: 0
                };
            },
            ages: [55, 85],
            genders: ['Erkek', 'Kadın'],
            anamnez: [
                'Son birkaç yıldır her iki kulakta da yavaş ilerleyen işitme kaybı. Televizyon sesini açmak zorunda kalıyor. Tinnitus mevcut.',
                'Yakınları duyma problemi olduğunu söylüyor. Özellikle kalabalık ortamlarda konuşmaları anlamakta güçlük çekiyor.',
                'Uzun süredir ilerleyici bilateral işitme kaybı. Yüksek frekanslı sesleri (kuş sesi, zil) duymakta zorluk.',
                'Emekli. Çevresindekiler yüksek sesle konuşmak zorunda kalıyor. Sağ kulak soldan biraz daha kötü.'
            ]
        },
        // 1: İLETİM TİPİ (Unilateral veya bilateral, air-bone gap var)
        {
            name: 'İletim Tipi Kayıp',
            gen: () => {
                const gap = r(20, 40);
                const boneBase = r(0, 10);
                const side = pick(['right', 'left', 'both']);
                const makeAir = () => ({ 125: boneBase + gap + r(-5, 5), 250: boneBase + gap + r(-5, 5), 500: boneBase + gap + r(-5, 5), 1000: boneBase + gap + r(-5, 10), 2000: boneBase + gap + r(-5, 10), 4000: boneBase + gap + r(-5, 5), 8000: boneBase + gap + r(-5, 10) });
                const makeNormal = () => ({ 125: boneBase + r(0, 5), 250: boneBase + r(0, 5), 500: boneBase + r(0, 10), 1000: boneBase + r(0, 10), 2000: boneBase + r(0, 10), 4000: boneBase + r(0, 15), 8000: boneBase + r(0, 15) });
                return {
                    right: (side === 'right' || side === 'both') ? makeAir() : makeNormal(),
                    left: (side === 'left' || side === 'both') ? makeAir() : makeNormal(),
                    gapRight: (side === 'right' || side === 'both') ? gap : 0,
                    gapLeft: (side === 'left' || side === 'both') ? gap : 0
                };
            },
            ages: [15, 55],
            genders: ['Erkek', 'Kadın', 'Çocuk'],
            anamnez: [
                'Kulakta dolgunluk hissi ve tıkanıklık var. Kendi sesini içerden duyuyor. Son birkaç haftadır ÜSYE geçirdi.',
                'Kulak ağrısı ve akıntı şikayetiyle geliyor. İşitme azalmış. Otoskopide TM perforasyonu şüphesi.',
                'Tekrarlayan orta kulak enfeksiyonları öyküsü. Kronik otitis media tanısı almış. Kulak dolgunluğu mevcut.',
                'Yüzme sonrası kulakta su kaçması ve sonrasında işitme kaybı. Kulak ağrısı yok ama tıkalı hissediyor.'
            ]
        },
        // 2: MİKST TİP
        {
            name: 'Mikst Tip Kayıp',
            gen: () => {
                const boneBase = r(15, 35);
                const gap = r(15, 25);
                return {
                    right: { 125: boneBase + gap + r(0, 5), 250: boneBase + gap + r(0, 5), 500: boneBase + gap + r(0, 10), 1000: boneBase + gap + r(0, 10), 2000: boneBase + gap + r(5, 15), 4000: boneBase + gap + r(10, 20), 8000: boneBase + gap + r(10, 25) },
                    left: { 125: boneBase + gap + r(-5, 5), 250: boneBase + gap + r(-5, 5), 500: boneBase + gap + r(0, 5), 1000: boneBase + gap + r(0, 10), 2000: boneBase + gap + r(5, 10), 4000: boneBase + gap + r(5, 15), 8000: boneBase + gap + r(10, 20) },
                    gapRight: gap, gapLeft: gap
                };
            },
            ages: [30, 70],
            genders: ['Erkek', 'Kadın'],
            anamnez: [
                'Hem iletim hem de sensörinöral komponenti olan işitme kaybı. Kronik orta kulak sorunu var, buna ek olarak iç kulak hasarı da eklenmiş.',
                'Otoskleroz operasyonu geçirmiş ama işitme tam düzelmemiş. Hala duyma güçlüğü devam ediyor.',
                'Uzun süredir devam eden kronik otit zemininde, yaşa bağlı iç kulak kaybı da eklenmiş. İşitme cihazı kullanıyor ama yetersiz buluyor.',
                'Kulak cerrahisi öyküsü mevcut. Ameliyat sonrası işitme kısmen düzelmiş ama tizlerde kayıp devam ediyor.'
            ]
        },
        // 3: TEK TARAFLI SNK (Ani İşitme Kaybı)
        {
            name: 'Tek Taraflı SNK',
            gen: () => {
                const b = r(0, 10);
                const loss = r(30, 70);
                const side = pick(['right', 'left']);
                const normal = { 125: b, 250: b + r(0, 5), 500: b + r(0, 5), 1000: b + r(0, 5), 2000: b + r(0, 10), 4000: b + r(0, 10), 8000: b + r(0, 15) };
                const bad = { 125: loss + r(-10, 0), 250: loss + r(-10, 5), 500: loss + r(-5, 10), 1000: loss + r(-5, 10), 2000: loss + r(0, 15), 4000: loss + r(5, 20), 8000: loss + r(5, 25) };
                return {
                    right: side === 'right' ? bad : normal,
                    left: side === 'left' ? bad : normal,
                    gapRight: 0, gapLeft: 0
                };
            },
            ages: [25, 60],
            genders: ['Erkek', 'Kadın'],
            anamnez: [
                'Sabah uyandığında bir kulağında aniden işitme kaybı fark etmiş. Şiddetli tinnitus ve baş dönmesi eşlik ediyor.',
                'Bir gün önce aniden tek kulakta işitme azalması başlamış. Kulak dolgunluğu ve çınlama mevcut. ÜSYE öyküsü yok.',
                'Stres altında çalışırken bir anda sağ/sol kulağında ses kesilmiş. Tinnitus şiddetli. Acil servise başvurmuş.',
                'Telefonda konuşurken bir kulaktan hiç duymadığını fark etmiş. Baş dönmesi ve bulantı eşlik ediyor.'
            ]
        },
        // 4: GÜRÜLTÜYE BAĞLI (Noise-Induced, 4kHz notch)
        {
            name: 'Gürültüye Bağlı Kayıp',
            gen: () => {
                const b = r(5, 15);
                const notch = r(45, 70);
                return {
                    right: { 125: b, 250: b + r(0, 5), 500: b + r(0, 5), 1000: b + r(0, 10), 2000: b + r(5, 15), 4000: notch, 8000: notch - r(10, 20) },
                    left: { 125: b, 250: b + r(0, 5), 500: b + r(0, 5), 1000: b + r(0, 10), 2000: b + r(5, 15), 4000: notch + r(-5, 5), 8000: notch - r(10, 20) },
                    gapRight: 0, gapLeft: 0
                };
            },
            ages: [30, 55],
            genders: ['Erkek'],
            anamnez: [
                'Fabrikada 15 yıldır çalışıyor. Kulaklık kullanmıyor. Son yıllarda konuşmaları anlamakta güçlük ve sürekli çınlama var.',
                'Askerlik sonrası silah sesi nedeniyle işitme kaybı başlamış. Bilateral tinnitus mevcut. Gürültülü ortamlarda iletişim kuramıyor.',
                'İnşaat işçisi. Ağır makine başında yıllarca çalışmış. Kulak koruyucu kullanmamış. Çınlama ve tiz sesleri duymama şikayeti.',
                'DJ olarak 10 yıldır çalışıyor. Yüksek desibelde müzik dinleme öyküsü. Kulaklarda sürekli uğultu ve konuşma anlamada zorluk.'
            ]
        },
        // 5: NORMAL İŞİTME (Tinnitus veya APD şüphesi)
        {
            name: 'Normal İşitme',
            gen: () => {
                const b = r(0, 10);
                return {
                    right: { 125: b + r(0, 5), 250: b + r(0, 5), 500: b + r(0, 5), 1000: b + r(0, 5), 2000: b + r(0, 10), 4000: b + r(0, 10), 8000: b + r(0, 15) },
                    left: { 125: b + r(0, 5), 250: b + r(0, 5), 500: b + r(0, 5), 1000: b + r(0, 5), 2000: b + r(0, 10), 4000: b + r(0, 10), 8000: b + r(0, 15) },
                    gapRight: 0, gapLeft: 0
                };
            },
            ages: [18, 35],
            genders: ['Erkek', 'Kadın'],
            anamnez: [
                'Tinnitus şikayetiyle başvuruyor. Duyma ile ilgili belirgin bir şikayeti yok ama çınlama rahatsız edici seviyelerde.',
                'Gürültülü ortamlarda konuşmaları anlamakta güçlük çekiyor ama sessiz ortamda sorunu yok. İşitsel işlemleme bozukluğu şüphesi.',
                'Ara sıra kulakta dolgunluk ve uğultu hissediyor. Stres dönemlerinde artıyor. Net bir işitme kaybı tariflemiyor.',
                'Rutin check-up için geldi. İşitme ile ilgili spesifik bir şikayeti yok. Kulak burun boğaz muayenesinden yönlendirilmiş.'
            ]
        }
    ];

    // Rastgele vaka tipi seç
    const caseType = pick(caseTypes);
    const generated = caseType.gen();

    const caseData = {
        right: generated.right,
        left: generated.left,
        boneRight: {},
        boneLeft: {}
    };

    // Kemik yolu hesapla
    [500, 1000, 2000, 4000].forEach(f => {
        const gapR = generated.gapRight || 0;
        caseData.boneRight[f] = Math.max(0, caseData.right[f] - gapR - r(0, 5));

        const gapL = generated.gapLeft || 0;
        caseData.boneLeft[f] = Math.max(0, caseData.left[f] - gapL - r(0, 5));
    });

    // dB değerlerini 5'in katına yuvarla
    ['right', 'left', 'boneRight', 'boneLeft'].forEach(key => {
        Object.keys(caseData[key]).forEach(f => {
            caseData[key][f] = Math.round(caseData[key][f] / 5) * 5;
        });
    });

    currentCase = caseData;

    // Hasta bilgileri
    const age = r(caseType.ages[0], caseType.ages[1]);
    const gender = pick(caseType.genders);
    const anamnez = pick(caseType.anamnez);

    const isimlerErkek = ['Ahmet Y.', 'Mehmet K.', 'Ali D.', 'Hasan T.', 'Mustafa B.', 'İbrahim S.', 'Kemal Ö.', 'Osman A.', 'Yusuf E.', 'Emre G.'];
    const isimlerKadin = ['Ayşe K.', 'Fatma D.', 'Zeynep B.', 'Elif S.', 'Merve T.', 'Hatice Y.', 'Esra A.', 'Büşra E.', 'Selin M.', 'Derya Ö.'];
    const isimlerCocuk = ['Efe Y.', 'Yağız K.', 'Beren S.', 'Defne A.', 'Mert T.', 'Ada B.'];

    let patientName;
    if (gender === 'Çocuk') {
        patientName = pick(isimlerCocuk);
    } else if (gender === 'Kadın') {
        patientName = pick(isimlerKadin);
    } else {
        patientName = pick(isimlerErkek);
    }

    // UI Güncelle
    document.getElementById('patient-name').innerText = patientName;
    document.getElementById('patient-age').innerText = age;
    document.getElementById('patient-gender').innerText = gender;
    document.getElementById('patient-anamnesis').innerText = anamnez;
}

function newCase() {
    if (!confirm('Mevcut vakayı bırakıp yeni bir vaka yüklenecek. Emin misiniz?')) return;

    // Tüm verileri sıfırla
    userPoints = {
        right: { air: {}, bone: {} },
        left: { air: {}, bone: {} }
    };
    score = 100;
    usedHint = false;
    currentState.freqIndex = 3;
    currentState.db = 30;
    currentState.ear = 'right';
    currentState.conduction = 'air';
    currentState.masking = false;
    currentState.maskDb = 0;
    currentState.maskEar = 'left';
    maskingLog = [];

    // UI sıfırla
    document.getElementById('odyo-report-area').value = '';
    document.getElementById('hint-box').style.display = 'none';
    document.getElementById('masking-toggle').checked = false;
    document.getElementById('masking-controls').classList.remove('show');
    document.getElementById('mask-db-display').innerText = '0 dB';
    document.getElementById('plateau-log').innerHTML = '<span style="color:#64748b;">Henüz veri yok</span>';
    document.getElementById('plateau-status').innerText = '—';
    document.getElementById('overmasking-warning').style.display = 'none';
    setMaskEar('left');
    document.getElementById('report-modal').style.display = 'none';

    // Kulak ve iletim butonlarını sıfırla
    document.querySelectorAll('.ear-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.ear-btn.right').classList.add('active');
    document.getElementById('btn-air').classList.add('active');
    document.getElementById('btn-bone').classList.remove('active');

    // Yeni vaka üret
    generateRandomCase();
    updateScreen();
    drawAudiogram();
}

function getHint() {
    if (usedHint) return;
    score -= 10;
    usedHint = true;

    const box = document.getElementById('hint-box');
    box.style.display = 'block';

    // Basit ipucu mantığı
    let msg = "Hastanın tiz frekanslarda (ince seslerde) zorlandığı görülüyor.";
    box.innerText = msg;

    // Puanı güncelle (görsel olarak gerekirse)
}

function finishTest() {
    let checkScore = 100;
    if (usedHint) checkScore -= 10;

    let totalError = 0;
    let checkedCount = 0;
    let missingCritical = false;

    // Zorunlu Frekanslar
    const criticalAir = [125, 250, 500, 1000, 2000, 4000, 8000];
    const criticalBone = [500, 1000, 2000, 4000];

    // Doğruluk Kontrolü
    ['right', 'left'].forEach(ear => {
        criticalAir.forEach(freq => {
            const userVal = userPoints[ear].air[freq];
            const realVal = currentCase[ear][freq];

            if (userVal === undefined) {
                missingCritical = true;
            } else {
                const diff = Math.abs(userVal - realVal);
                if (diff > 5) {
                    totalError += (diff - 5);
                }
                checkedCount++;
            }
        });
    });

    // Kemik Yolu Kontrolü
    ['right', 'left'].forEach(ear => {
        criticalBone.forEach(freq => {
            const userVal = userPoints[ear].bone[freq];
            const realVal = (ear === 'right') ? currentCase.boneRight[freq] : currentCase.boneLeft[freq];

            if (realVal !== undefined) {
                if (userVal === undefined) {
                    missingCritical = true;
                } else {
                    const diff = Math.abs(userVal - realVal);
                    if (diff > 5) {
                        totalError += (diff - 5);
                    }
                    checkedCount++;
                }
            }
        });
    });

    if (missingCritical) {
        alert("Eksik frekanslar var! \nHava: 125-8000Hz\nKemik: 500-4000Hz\nTüm zorunlu frekanslara bakmalısın.");
        return;
    }

    // Rapor kontrol
    const reportText = document.getElementById('odyo-report-area').value.trim();
    if (!reportText) {
        alert('Lütfen sonuç raporunu yazınız! Odyogramı yorumlayıp tanınızı belirtmelisiniz.');
        return;
    }

    // Eşik Puan Kırma
    checkScore -= totalError;

    // MASKELEME PUANLAMASI
    const maskResult = evaluateMaskingScore();
    checkScore += maskResult.score; // score negatif gelecek

    if (checkScore < 0) checkScore = 0;
    if (checkScore > 100) checkScore = 100;

    // Maskeleme geri bildirim HTML
    let maskFeedbackHtml = '';
    if (maskResult.needed > 0) {
        maskFeedbackHtml = `
            <hr style="border-color:#334155; margin:15px 0;">
            <h4 style="color:#f59e0b; margin-bottom:8px;"><i class="fas fa-mask"></i> Maskeleme Değerlendirmesi</h4>
            <div style="background:rgba(0,0,0,0.3); padding:12px; border-radius:8px; font-size:0.9rem;">
                <p style="margin:0 0 8px 0; color:#94a3b8;">Maskeleme gereken frekans sayısı: <strong style="color:white;">${maskResult.needed}</strong></p>
                ${maskResult.feedback.length > 0 ? maskResult.feedback.map(f => `<div style="color:#e2e8f0; margin-bottom:4px; font-size:0.85rem;">${f}</div>`).join('') : '<div style="color:#10b981;">✅ Maskeleme doğru uygulandı!</div>'}
                <p style="margin:8px 0 0 0; color:${maskResult.score < 0 ? '#ef4444' : '#10b981'}; font-weight:bold;">Maskeleme Puanı: ${maskResult.score}</p>
            </div>
        `;
    } else {
        maskFeedbackHtml = `
            <hr style="border-color:#334155; margin:15px 0;">
            <div style="background:rgba(16,185,129,0.1); padding:10px; border-radius:8px;">
                <span style="color:#10b981; font-size:0.9rem;"><i class="fas fa-check"></i> Bu vakada maskeleme gerekmiyordu.</span>
            </div>
        `;
    }

    // Sonuç Göster
    const modal = document.getElementById('report-modal');
    modal.style.display = 'block';

    document.getElementById('ai-evaluation-result').innerHTML = `
        <h3><i class="fas fa-trophy"></i> Puanın: ${checkScore}</h3>
        <p>Eşik Hata Payı: ${totalError} dB${usedHint ? ' | İpucu kullanıldı (-10)' : ''}</p>
        <p>${checkScore > 80 ? "Harika iş çıkardın! Tanı doğruya çok yakın." : checkScore > 50 ? "İyi bir başlangıç, ama bazı alanlarda iyileştirme gerekiyor." : "Biraz daha pratik yapmalısın. Eşiklerde ve maskelemede sapmalar var."}</p>
        ${maskFeedbackHtml}
        <hr style="border-color:#334155; margin:15px 0;">
        <h4 style="color:#94a3b8; margin-bottom:8px;"><i class="fas fa-file-medical"></i> Raporunuz</h4>
        <p style="color:#e2e8f0; background:rgba(0,0,0,0.3); padding:12px; border-radius:8px; line-height:1.6;">${reportText}</p>
    `;
}

// Maskeleme
function toggleMasking() {
    const isChecked = document.getElementById('masking-toggle').checked;
    currentState.masking = isChecked;
    const controls = document.getElementById('masking-controls');
    if (isChecked) {
        controls.classList.add('show');
        // Otomatik olarak karşı kulağı seç
        const autoMaskEar = currentState.ear === 'right' ? 'left' : 'right';
        setMaskEar(autoMaskEar);
    } else {
        controls.classList.remove('show');
        document.getElementById('overmasking-warning').style.display = 'none';
    }
}

function changeMaskDb(amount) {
    currentState.maskDb += amount;
    if (currentState.maskDb < 0) currentState.maskDb = 0;
    if (currentState.maskDb > 120) currentState.maskDb = 120;
    document.getElementById('mask-db-display').innerText = currentState.maskDb + " dB";
}
