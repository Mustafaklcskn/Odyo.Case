// 1. KÜTÜPHANELER
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// GEMINI AYARLARI
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const app = express();
const port = 3000;

// 2. MIDDLEWARE
app.use(express.json());
app.use(cors());
app.use(express.static('.'));
app.use('/uploads', express.static('uploads'));

const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)){ fs.mkdirSync(uploadDir); }

// 3. MULTER
const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, 'uploads/') },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// 4. MONGODB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Bağlandı.'))
  .catch((err) => console.error('❌ MongoDB Hatası:', err));

// ================= 5. ŞEMALAR =================

// KULLANICI ŞEMASI
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isAdmin: { type: Boolean, default: false },
    school: {type: String}
});
const UserModel = mongoose.models.User || mongoose.model("User", UserSchema);

// KLASİK VAKA ŞEMASI (MEVCUT SİSTEM)
const VakaSchema = new mongoose.Schema({
    vakaNo: { type: Number, unique: true },
    baslik: { type: String, required: true },
    yas: { type: Number, required: true },
    cinsiyet: { type: String, required: true },
    gizliTani: { type: String },
    icerik: { type: String, required: true },
    zorluk: { type: String, enum: ['Kolay', 'Orta', 'Zor'], default: 'Orta' },
    resimUrl: { type: String }
});
const VakaModel = mongoose.models.Vaka || mongoose.model("Vaka", VakaSchema);

// --- KLİNİK SİMÜLASYON ŞEMASI (GENİŞLETİLMİŞ BATARYA) ---
const SimulasyonSchema = new mongoose.Schema({
    simNo: { type: Number, unique: true }, 
    baslik: { type: String, required: true },
    yas: { type: Number, required: true },
    cinsiyet: { type: String, required: true },
    sikayet: { type: String, required: true },
    
    // TEMEL TESTLER
    anamnez: { type: String, default: "Bilgi yok." },
    otoskopi: { type: String, default: "Normal." },
    safSes: { type: String, default: "Normal." },
    timpanometri: { type: String, default: "Tip A" },
    refleks: { type: String, default: "Alındı." },
    konusma: { type: String, default: "SDS: %100" },

    // İLERİ TESTLER (YENİ EKLENENLER)
    yuksekFrekans: { type: String, default: "Yapılmadı." },
    toneDecay: { type: String, default: "Negatif." },
    sisi: { type: String, default: "Negatif." },
    ablb: { type: String, default: "Rekruitment yok." },
    
    dpoae: { type: String, default: "Geçti." },
    teoae: { type: String, default: "Geçti." },
    
    abr: { type: String, default: "Normal latanslar." },
    assr: { type: String, default: "Eşikler uyumlu." },
    ecochg: { type: String, default: "SP/AP oranı normal." },
    caep: { type: String, default: "P1-N1-P2 dalgaları mevcut." },
    
    // AI DEĞERLENDİRME
    gercekTani: { type: String, required: true },
    gereksizTestler: { type: String },
    
    eklenmeTarihi: { type: Date, default: Date.now }
});
const SimulasyonModel = mongoose.models.Simulasyon || mongoose.model("Simulasyon", SimulasyonSchema);


// DİĞER ŞEMALAR (FEEDBACK, RAPOR, AYARLAR)
const FeedbackSchema = new mongoose.Schema({
    kullaniciAdi: { type: String, required: true },
    mesaj: { type: String, required: true },
    tarih: { type: Date, default: Date.now },
    okundu: { type: Boolean, default: false }
});
const FeedbackModel = mongoose.models.Feedback || mongoose.model("Feedback", FeedbackSchema);

const RaporSchema = new mongoose.Schema({
    raporMetni: { type: String, required: true }, // Veya Simülasyon Tanısı
    alinanPuan: { type: Number, default: 0 },
    aiYorumu: { type: String },
    kullaniciAdi: { type: String },
    vakaID: { type: Number },
    tip: { type: String, default: 'klasik' }, // 'klasik' veya 'simulasyon'
    olusturulmaTarihi: { type: Date, default: Date.now },
    aiDogruCevap: {type: String}
});
const RaporModel = mongoose.models.Rapor || mongoose.model("Rapor", RaporSchema);

const SettingSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: String, required: true }
});
const SettingModel = mongoose.models.Setting || mongoose.model("Setting", SettingSchema);

// --- YARDIMCI FONKSİYONLAR ---
async function triggerSiteUpdate(mesaj) {
    try {
        const yeniVersiyon = "v_" + Date.now();
        await SettingModel.findOneAndUpdate({ key: "site_version" }, { value: yeniVersiyon }, { upsert: true });
        const updateMsg = mesaj || "Sistem güncellendi.";
        await SettingModel.findOneAndUpdate({ key: "update_message" }, { value: updateMsg }, { upsert: true });
        console.log("🔔 Site güncellendi:", updateMsg);
    } catch (e) { console.error("Güncelleme hatası", e); }
}

// 6. GÜVENLİK
const verifyToken = (req, res, next) => {
    const token = req.headers["authorization"];
    if (!token) return res.status(403).json({ success: false, message: "Giriş yapmanız gerekiyor!" });
    try {
        const decoded = jwt.verify(token, "GIZLI_KELIME");
        req.user = decoded;
        next();
    } catch (error) { return res.status(401).json({ success: false, message: "Geçersiz Token!" }); }
};

// ================= ROTALAR =================

app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/register.html', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/profil.html', (req, res) => res.sendFile(path.join(__dirname, 'profil.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
// Yeni Simülasyon Sayfası için route (Henüz oluşturmadık ama hazır olsun)
app.get('/simulasyon.html', (req, res) => res.sendFile(path.join(__dirname, 'simulasyon.html'))); 

app.get('/check-version', async (req, res) => {
    try {
        const vSetting = await SettingModel.findOne({ key: "site_version" });
        const mSetting = await SettingModel.findOne({ key: "update_message" });
        res.json({ version: vSetting ? vSetting.value : "v_baslangic", message: mSetting ? mSetting.value : "Yeni içerikler!" });
    } catch (error) { res.status(500).json({ error: "Hata" }); }
});

// AUTH
app.post('/register', async (req, res) => {
    const { username, password, phone, school } = req.body;
    try {
        const temizKadi = username.toLowerCase().trim(); 
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new UserModel({ username: temizKadi, password: hashedPassword, phone: phone, school: school });
        await newUser.save();
        res.json({ success: true, message: "Kayıt başarılı!" });
    } catch (error) { res.status(500).json({ success: false, message: "Kayıt hatası." }); }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const temizKadi = username.toLowerCase().trim();
        const user = await UserModel.findOne({ username: temizKadi });
        if (!user) return res.status(400).json({ success: false, message: "Kullanıcı bulunamadı!" });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ success: false, message: "Şifre hatalı!" });
        const token = jwt.sign({ id: user._id, username: user.username }, "GIZLI_KELIME", { expiresIn: "1h" });
        res.json({ success: true, message: "Giriş başarılı!", token: token, username: user.username, school: user.school, isAdmin: user.isAdmin });
    } catch (error) { res.status(500).json({ success: false, message: "Sunucu hatası." }); }
});

// --- KLASİK VAKA İŞLEMLERİ (MEVCUT) ---
app.post('/admin/add-case', upload.single('vakaResmi'), async (req, res) => {
    const resimYolu = req.file ? '/uploads/' + req.file.filename : null;
    const { baslik, yas, cinsiyet, gizliTani, icerik, zorluk } = req.body;
    try {
        const sonVaka = await VakaModel.findOne().sort({ vakaNo: -1 });
        let yeniVakaNo = 101; 
        if (sonVaka) yeniVakaNo = sonVaka.vakaNo + 1;
        const yeniVaka = new VakaModel({ vakaNo: yeniVakaNo, baslik, yas, cinsiyet, gizliTani, icerik, zorluk, resimUrl: resimYolu });
        await yeniVaka.save();
        await triggerSiteUpdate(`🆕 Yeni Vaka Eklendi: ${baslik}`);
        res.json({ success: true, message: `Vaka ${yeniVakaNo} eklendi!` });
    } catch (error) { res.status(500).json({ success: false, message: "Hata oluştu." }); }
});

app.delete('/admin/delete-case/:no', async (req, res) => {
    try {
        const silinen = await VakaModel.findOneAndDelete({ vakaNo: req.params.no });
        if (silinen) {
            await triggerSiteUpdate(`🗑️ Vaka #${req.params.no} silindi.`);
            res.json({ success: true, message: "Silindi." });
        } else res.status(404).json({ success: false, message: "Bulunamadı." });
    } catch (error) { res.status(500).json({ success: false, message: "Hata." }); }
});

app.get('/cases', async (req, res) => {
    try { const vakalar = await VakaModel.find().select('-gizliTani'); res.json(vakalar); } catch (error) { res.status(500).json({ error: "Hata." }); }
});

app.get('/admin/case/:no', async (req, res) => {
    try { const vaka = await VakaModel.findOne({ vakaNo: req.params.no }); res.json({ success: true, vaka }); } catch (error) { res.status(500).json({ error: "Hata." }); }
});

app.put('/admin/update-case/:no', upload.single('vakaResmi'), async (req, res) => {
    const { baslik, yas, cinsiyet, gizliTani, icerik, zorluk } = req.body;
    const resimYolu = req.file ? '/uploads/' + req.file.filename : undefined;
    try {
        const veri = { baslik, yas, cinsiyet, gizliTani, icerik, zorluk };
        if (resimYolu) veri.resimUrl = resimYolu;
        const updated = await VakaModel.findOneAndUpdate({ vakaNo: req.params.no }, veri, { new: true });
        if (updated) {
            await triggerSiteUpdate(`✏️ Vaka #${req.params.no} güncellendi.`);
            res.json({ success: true, message: "Güncellendi." });
        } else res.status(404).json({ success: false });
    } catch (error) { res.status(500).json({ success: false }); }
});

// --- YENİ: SİMÜLASYON İŞLEMLERİ ---

// 1. Simülasyon Ekle (Admin)
app.post('/admin/add-simulation', async (req, res) => {
    // Tüm alanları body'den alıyoruz (req.body içindeki her şeyi modele gönderir)
    // Bu yöntem (spread operator) daha pratiktir, tek tek yazmaya gerek kalmaz.
    try {
        const sonSim = await SimulasyonModel.findOne().sort({ simNo: -1 });
        let yeniSimNo = 201; 
        if (sonSim) yeniSimNo = sonSim.simNo + 1;

        // req.body içindeki tüm alanları al, simNo ekle
        const yeniSim = new SimulasyonModel({
            simNo: yeniSimNo,
            ...req.body 
        });

        await yeniSim.save();
        await triggerSiteUpdate(`🏥 Yeni Simülasyon Eklendi: ${req.body.baslik}`);
        res.json({ success: true, message: `Simülasyon ${yeniSimNo} eklendi!` });

    } catch (error) { res.status(500).json({ success: false, message: "Hata oluştu." }); }
});

// 2. Simülasyonları Listele (Öğrenci/Admin)
app.get('/simulations', async (req, res) => {
    try {
        // Öğrenciye gizli verileri (Tanı, Anamnez detayı vb.) gönderme!
        const simler = await SimulasyonModel.find().select('simNo baslik yas cinsiyet sikayet zorluk'); 
        res.json(simler);
    } catch (error) { res.status(500).json({ error: "Hata." }); }
});

// 3. Tek Simülasyonu Getir (Oyun Başladığında)
app.get('/simulation/:no', async (req, res) => {
    try {
        // Burada tüm veriyi dönüyoruz çünkü oyun içinde parça parça JS ile göstereceğiz.
        // Güvenlik notu: İdealde her adım için ayrı istek atılır ama şimdilik "Frontend'de gizle" mantığıyla gidelim.
        const sim = await SimulasyonModel.findOne({ simNo: req.params.no });
        if(sim) res.json({ success: true, sim });
        else res.status(404).json({ success: false, message: "Bulunamadı." });
    } catch (error) { res.status(500).json({ error: "Hata." }); }
});

// 4. Simülasyonu Değerlendir (AI Yargıcı)
app.post('/evaluate-simulation', verifyToken, async (req, res) => {
    const { simNo, islemGecmisi, tani } = req.body;
    const kullaniciAdi = req.user.username;

    try {
        const sim = await SimulasyonModel.findOne({ simNo: simNo });
        if (!sim) return res.status(404).json({ success: false, message: "Simülasyon bulunamadı." });

        // 1. KONTROL: Daha önce çözmüş mü?
        const eskiRapor = await RaporModel.findOne({ 
            kullaniciAdi: kullaniciAdi, 
            vakaID: simNo, 
            tip: 'simulasyon' 
        });

        // 2. AI DEĞERLENDİRMESİ (Her durumda çalışsın, yorum yapsın)
        const prompt = `
            Sen Odyoloji Hocasısın.
            HASTA: ${sim.gercekTani}, ŞİKAYET: ${sim.sikayet}
            YASAK TESTLER: ${sim.gereksizTestler}
            
            ÖĞRENCİNİN İŞLEMLERİ: ${islemGecmisi.join(' -> ')}
            ÖĞRENCİNİN TANISI: "${tani}"

            Puanla (0-100) ve yorumla. Sıralama hatası ve gereksiz test varsa puan kır.
            JSON ÇIKTI: { "puan": 0, "yorum": "...", "dogruYol": "..." }
        `;

        const result = await model.generateContent(prompt);
        let text = result.response.text();
        // JSON Temizleme
        const jsonBas = text.indexOf('{');
        const jsonSon = text.lastIndexOf('}');
        let aiResult = { puan: 0, yorum: "Hata", dogruYol: "-" };
        
        if (jsonBas !== -1 && jsonSon !== -1) {
            try {
                aiResult = JSON.parse(text.substring(jsonBas, jsonSon + 1));
            } catch(e) { console.error("JSON Parse Hatası"); }
        }

        // 3. PUAN AYARLAMASI (Eğer çözdüyse puanı sıfırla)
        let kaydedilecekPuan = aiResult.puan;
        let ekMesaj = "";

        if (eskiRapor) {
            kaydedilecekPuan = 0; // Puanı iptal et
            ekMesaj = " (Daha önce çözüldüğü için puan eklenmedi - Pratik Modu)";
            aiResult.yorum += ekMesaj; // Yorumun sonuna ekle ki öğrenci görsün
        }

        // 4. RAPORU KAYDET (Her deneme kaydedilir ama puanı ayarlanmış olarak)
        const yeniRapor = new RaporModel({
            raporMetni: `[SİM] Tanı: ${tani} | İşlemler: ${islemGecmisi.join(', ')}`,
            alinanPuan: kaydedilecekPuan, 
            aiYorumu: aiResult.yorum, 
            aiDogruCevap: aiResult.dogruYol,
            kullaniciAdi: kullaniciAdi, 
            vakaID: simNo, 
            tip: 'simulasyon'
        });
        await yeniRapor.save();

        // 5. SONUCU DÖNDÜR (Ekranda puan yine de görünsün ama veritabanına 0 gitti)
        // İsteğe bağlı: Ekranda da "0 (Pratik)" yazsın istersen aiResult.puan'ı da güncelleyebiliriz.
        // Ama genelde "90 aldın ama sayılmadı" demek daha eğitici olur.
        
        res.json({ success: true, result: aiResult });

    } catch (error) { 
        console.error(error);
        res.status(500).json({ success: false, message: "AI Hatası" }); 
    }
});


// --- DİĞER ROTALAR (KLASİK) ---
app.post('/submit-report', verifyToken, async (req, res) => {
    const { rapor, vakaID, kalanSure } = req.body;
    const raporuGonderen = req.user.username;
    try {
        const eskiRapor = await RaporModel.findOne({ kullaniciAdi: raporuGonderen, vakaID: vakaID });
        if (eskiRapor) return res.json({ success: false, message: "Zaten çözüldü." });
        const vaka = await VakaModel.findOne({ vakaNo: vakaID });
        if (!vaka) return res.status(404).json({ success: false });

        const prompt = `VAKA: ${vaka.baslik}, TANI: ${vaka.gizliTani}, RAPOR: "${rapor}". Puanla (0-100) ve yorumla. JSON: { "puan": 0, "yorum": "", "idealCevap": "" }`;
        const result = await model.generateContent(prompt);
        let aiResult = JSON.parse(result.response.text().match(/\{[\s\S]*\}/)[0]);

        let hizBonusu = kalanSure > 0 ? Math.floor(kalanSure/30)*5 : 0;
        if(hizBonusu > 20) hizBonusu = 20;
        let finalPuan = Math.min(100, Math.round(aiResult.puan * (vaka.zorluk=='Zor'?1.5:1.25)) + hizBonusu);

        const yeniRapor = new RaporModel({
            raporMetni: rapor, alinanPuan: finalPuan, aiYorumu: aiResult.yorum + (hizBonusu?` (+${hizBonusu} Hız)`:""),
            aiDogruCevap: aiResult.idealCevap, kullaniciAdi: raporuGonderen, vakaID: vakaID, tip: 'klasik'
        });
        await yeniRapor.save();
        res.json({ success: true, message: aiResult.yorum, puan: finalPuan, dogruCevap: aiResult.idealCevap });
    } catch (error) { res.status(500).json({ success: false, message: "Hata." }); }
});

app.get('/leaderboard', async (req, res) => {
    try {
        const siralama = await RaporModel.aggregate([
            { $group: { _id: "$kullaniciAdi", toplamPuan: { $sum: "$alinanPuan" }, cozulenVakaSayisi: { $sum: 1 } } },
            { $sort: { toplamPuan: -1 } }, { $limit: 5 }
        ]);
        res.json(siralama);
    } catch (error) { res.status(500).json({ error: "Hata." }); }
});

app.get('/my-reports', verifyToken, async (req, res) => {
    try { const raporlar = await RaporModel.find({ kullaniciAdi: req.user.username }).sort({ olusturulmaTarihi: -1 }); res.json(raporlar); } catch (error) { res.status(500).json({ error: "Hata." }); }
});

app.post('/submit-feedback', verifyToken, async (req, res) => {
    try {
        const { mesaj } = req.body;
        if(!mesaj.trim()) return res.json({ success: false });
        await new FeedbackModel({ kullaniciAdi: req.user.username, mesaj: mesaj }).save();
        res.json({ success: true, message: "İletildi." });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.get('/admin/feedbacks', async (req, res) => { try { const f = await FeedbackModel.find().sort({ tarih: -1 }); res.json(f); } catch (e) { res.status(500).json({}); } });
app.put('/admin/toggle-feedback/:id', async (req, res) => { try { const f = await FeedbackModel.findById(req.params.id); f.okundu = !f.okundu; await f.save(); res.json({ success: true, yeniDurum: f.okundu }); } catch (e) { res.status(500).json({ success: false }); } });
app.delete('/admin/delete-feedback/:id', async (req, res) => { try { await FeedbackModel.findByIdAndDelete(req.params.id); res.json({ success: true }); } catch (e) { res.status(500).json({ success: false }); } });

// --- YENİ: SİMÜLASYON GÜNCELLEME (ADMİN İÇİN) ---
app.put('/admin/update-simulation/:no', async (req, res) => {
    try {
        const updated = await SimulasyonModel.findOneAndUpdate(
            { simNo: req.params.no },
            req.body, // Gelen tüm veriyi güncelle
            { new: true }
        );
        if (updated) {
            await triggerSiteUpdate(`✏️ Simülasyon #${req.params.no} güncellendi.`);
            res.json({ success: true, message: "Güncellendi." });
        } else res.status(404).json({ success: false });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.listen(port, () => { console.log(`🚀 Sunucu çalışıyor: http://localhost:${port}`); });