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

// 5. ŞEMALAR

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isAdmin: { type: Boolean, default: false },
    school: {type: String}
});
const UserModel = mongoose.models.User || mongoose.model("User", UserSchema);

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

const FeedbackSchema = new mongoose.Schema({
    kullaniciAdi: { type: String, required: true },
    mesaj: { type: String, required: true },
    tarih: { type: Date, default: Date.now },
    okundu: { type: Boolean, default: false }
});
const FeedbackModel = mongoose.models.Feedback || mongoose.model("Feedback", FeedbackSchema);

const RaporSchema = new mongoose.Schema({
    raporMetni: { type: String, required: true },
    alinanPuan: { type: Number, default: 0 },
    aiYorumu: { type: String },
    kullaniciAdi: { type: String },
    vakaID: { type: Number },
    olusturulmaTarihi: { type: Date, default: Date.now },
    aiDogruCevap: {type: String}
});
const RaporModel = mongoose.models.Rapor || mongoose.model("Rapor", RaporSchema);

// --- AYARLAR ŞEMASI ---
const SettingSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: String, required: true }
});
const SettingModel = mongoose.models.Setting || mongoose.model("Setting", SettingSchema);

// --- YARDIMCI FONKSİYON: SÜRÜM VE MESAJ GÜNCELLE ---
async function triggerSiteUpdate(mesaj) {
    try {
        const yeniVersiyon = "v_" + Date.now();
        
        // 1. Versiyonu Güncelle
        await SettingModel.findOneAndUpdate(
            { key: "site_version" },
            { value: yeniVersiyon },
            { upsert: true, new: true }
        );

        // 2. Mesajı Güncelle
        const updateMsg = mesaj || "Sistem güncellemeleri yapıldı.";
        
        await SettingModel.findOneAndUpdate(
            { key: "update_message" },
            { value: updateMsg },
            { upsert: true, new: true }
        );

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

// --- VERSİYON KONTROL ---
app.get('/check-version', async (req, res) => {
    try {
        const vSetting = await SettingModel.findOne({ key: "site_version" });
        const mSetting = await SettingModel.findOne({ key: "update_message" });
        
        res.json({ 
            version: vSetting ? vSetting.value : "v_baslangic",
            message: mSetting ? mSetting.value : "Yeni içerikler eklendi!" 
        });
    } catch (error) { res.status(500).json({ error: "Hata" }); }
});

// --- KAYIT & GİRİŞ ---
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

// --- VAKA İŞLEMLERİ ---

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
        }
        else res.status(404).json({ success: false, message: "Bulunamadı." });
    } catch (error) { res.status(500).json({ success: false, message: "Hata." }); }
});

app.get('/cases', async (req, res) => {
    try {
        const vakalar = await VakaModel.find().select('-gizliTani');
        res.json(vakalar);
    } catch (error) { res.status(500).json({ error: "Hata." }); }
});

app.get('/admin/case/:no', async (req, res) => {
    try {
        const vaka = await VakaModel.findOne({ vakaNo: req.params.no });
        if(vaka) res.json({ success: true, vaka });
        else res.status(404).json({ success: false, message: "Vaka bulunamadı." });
    } catch (error) { res.status(500).json({ error: "Hata oluştu." }); }
});

app.put('/admin/update-case/:no', upload.single('vakaResmi'), async (req, res) => {
    const { baslik, yas, cinsiyet, gizliTani, icerik, zorluk } = req.body;
    const resimYolu = req.file ? '/uploads/' + req.file.filename : undefined;
    try {
        const guncellenecekVeri = { baslik, yas, cinsiyet, gizliTani, icerik, zorluk };
        if (resimYolu) guncellenecekVeri.resimUrl = resimYolu;
        const updatedVaka = await VakaModel.findOneAndUpdate({ vakaNo: req.params.no }, guncellenecekVeri, { new: true });
        
        if (updatedVaka) {
            await triggerSiteUpdate(`✏️ Vaka #${req.params.no} güncellendi: ${baslik}`);
            res.json({ success: true, message: "Vaka güncellendi!" });
        }
        else res.status(404).json({ success: false, message: "Bulunamadı." });
    } catch (error) { res.status(500).json({ success: false, message: "Hata." }); }
});

// --- RAPOR & FEEDBACK ---
app.post('/submit-report', verifyToken, async (req, res) => {
    const { rapor, vakaID, kalanSure } = req.body;
    const raporuGonderen = req.user.username;
    try {
        const eskiRapor = await RaporModel.findOne({ kullaniciAdi: raporuGonderen, vakaID: vakaID });
        if (eskiRapor) return res.json({ success: false, message: "Bu vakayı daha önce çözdünüz!" });
        const vaka = await VakaModel.findOne({ vakaNo: vakaID });
        if (!vaka) return res.status(404).json({ success: false, message: "Vaka bulunamadı!" });

        const prompt = `
            Sen Odyoloji Profesörüsün. Öğrenci sınav kağıdını okuyorsun.
            VAKA: ${vaka.baslik} (Yaş: ${vaka.yas}, Cinsiyet: ${vaka.cinsiyet})
            HİKAYE: ${vaka.icerik}
            GERÇEK TANI (Gizli): ${vaka.gizliTani}
            ÖĞRENCİ RAPORU: "${rapor}"
            ZORLUK: ${vaka.zorluk}
            GÖREVLERİN:
            1. Öğrenciye puan ver ve eksiklerini söyle (Yorum).
            2. Bu vaka için "ALTIN STANDART" bir rapor yaz (IdealCevap).
            ÇIKTI FORMATI (SADECE JSON):
            { "puan": 0-100, "yorum": "...", "idealCevap": "..." }
        `;
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        let aiResult = { puan: 50, yorum: "Hata", idealCevap: "Oluşturulamadı." };
        try {
            const jsonBas = text.indexOf('{');
            const jsonSon = text.lastIndexOf('}');
            if (jsonBas !== -1 && jsonSon !== -1) aiResult = JSON.parse(text.substring(jsonBas, jsonSon + 1));
        } catch (e) { console.error("JSON Hatası"); }

        // PUANLAMA MANTIĞI
        let carpan = 1;
        if (vaka.zorluk === 'Orta') carpan = 1.25;
        if (vaka.zorluk === 'Zor') carpan = 1.5;
        
        let hamPuan = Math.round(aiResult.puan * carpan);

        // HIZ BONUSU
        let hizBonusu = 0;
        if (kalanSure > 0) {
            hizBonusu = Math.floor(kalanSure / 30) * 5;
            if(hizBonusu > 20) hizBonusu = 20; 
        }

        let finalPuan = hamPuan + hizBonusu;
        if (finalPuan > 100) finalPuan = 100;

        let bonusMesaj = hizBonusu > 0 ? ` (Hız Bonusu: +${hizBonusu} puan)` : "";

        // EKSİK OLAN KISIMLAR BURASIYDI:
        const yeniRapor = new RaporModel({
            raporMetni: rapor,
            alinanPuan: finalPuan,
            aiYorumu: aiResult.yorum + bonusMesaj,
            aiDogruCevap: aiResult.idealCevap,
            kullaniciAdi: raporuGonderen,
            vakaID: vakaID
        });
        
        await yeniRapor.save(); // Kaydetmeyi unutmuştuk
        
        res.json({ 
            success: true, 
            message: aiResult.yorum + bonusMesaj, 
            puan: finalPuan, 
            dogruCevap: aiResult.idealCevap 
        }); // Cevap dönmeyi unutmuştuk

    } catch (error) { 
        console.error("Rapor Hatası:", error);
        res.status(500).json({ success: false, message: "Sunucu hatası." }); 
    }
});

app.get('/leaderboard', async (req, res) => {
    try {
        const siralama = await RaporModel.aggregate([
            { $group: { _id: "$kullaniciAdi", toplamPuan: { $sum: "$alinanPuan" }, cozulenVakaSayisi: { $sum: 1 } } },
            { $sort: { toplamPuan: -1 } },
            { $limit: 5 }
        ]);
        res.json(siralama);
    } catch (error) { res.status(500).json({ error: "Hata." }); }
});

app.get('/my-reports', verifyToken, async (req, res) => {
    try {
        const raporlar = await RaporModel.find({ kullaniciAdi: req.user.username }).sort({ olusturulmaTarihi: -1 });
        res.json(raporlar);
    } catch (error) { res.status(500).json({ error: "Hata." }); }
});

app.post('/submit-feedback', verifyToken, async (req, res) => {
    try {
        const { mesaj } = req.body;
        if(!mesaj.trim()) return res.json({ success: false, message: "Boş mesaj." });
        const yeniFeedback = new FeedbackModel({ kullaniciAdi: req.user.username, mesaj: mesaj });
        await yeniFeedback.save();
        res.json({ success: true, message: "İletildi." });
    } catch (error) { res.status(500).json({ success: false, message: "Hata." }); }
});

app.get('/admin/feedbacks', async (req, res) => {
    try { const feedbacks = await FeedbackModel.find().sort({ tarih: -1 }); res.json(feedbacks); } catch (error) { res.status(500).json({ error: "Hata." }); }
});

app.put('/admin/toggle-feedback/:id', async (req, res) => {
    try {
        const feedback = await FeedbackModel.findById(req.params.id);
        if (!feedback) return res.status(404).json({ success: false });
        feedback.okundu = !feedback.okundu;
        await feedback.save();
        res.json({ success: true, yeniDurum: feedback.okundu });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.delete('/admin/delete-feedback/:id', async (req, res) => {
    try {
        const silinen = await FeedbackModel.findByIdAndDelete(req.params.id);
        if (silinen) res.json({ success: true, message: "Silindi." });
        else res.status(404).json({ success: false });
    } catch (error) { res.status(500).json({ success: false }); }
});

// SUNUCUYU BAŞLAT
app.listen(port, () => { console.log(`🚀 Sunucu çalışıyor: http://localhost:${port}`); });