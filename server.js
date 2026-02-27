// 1. KÜTÜPHANELER
const dns = require("node:dns/promises");
dns.setServers(["1.1.1.1"]);
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Resend } = require('resend');
require('dotenv').config();

// --- E-POSTA AYARLARI (RESEND) ---
const resend = new Resend(process.env.RESEND_API_KEY);

// Tüm kullanıcılara toplu e-posta gönder
async function sendEmailToAll(subject, htmlContent) {
    try {
        const users = await UserModel.find({ email: { $ne: null, $exists: true } }).select('email');
        const emails = users.map(u => u.email).filter(Boolean);

        if (emails.length === 0) {
            console.log('📧 Gönderilecek e-posta adresi bulunamadı.');
            return { success: false, message: 'Kayıtlı e-posta adresi yok.' };
        }

        // Resend ile gönder
        const { data, error } = await resend.emails.send({
            from: 'OdyoCase <noreply@odyocase.com.tr>',
            to: emails,
            subject: subject,
            html: `
                <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #e2e8f0; border-radius: 16px; overflow: hidden;">
                    <div style="background: linear-gradient(135deg, #3b82f6, #1e40af); padding: 30px; text-align: center;">
                        <h1 style="margin: 0; color: white; font-size: 1.8rem;">OdyoCase</h1>
                    </div>
                    <div style="padding: 30px; color: #cbd5e1; line-height: 1.6;">
                        ${htmlContent}
                    </div>
                    <div style="padding: 20px; text-align: center; color: #64748b; font-size: 0.8rem; border-top: 1px solid rgba(255,255,255,0.1);">
                        OdyoCase Ekibi | <a href="https://www.odyocase.com.tr" style="color: #3b82f6; text-decoration: none;">Sitemizi Ziyaret Edin</a>
                    </div>
                </div>
            `
        });

        if (error) {
            console.error('📧 E-posta gönderim hatası:', error);
            return { success: false, message: error.message };
        }

        console.log(`📧 ${emails.length} kullanıcıya e-posta gönderildi. ID: ${data.id}`);
        return { success: true, count: emails.length };

    } catch (error) {
        console.error('📧 E-posta gönderim hatası:', error);
        return { success: false, message: error.message };
    }
}

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
if (!fs.existsSync(uploadDir)) { fs.mkdirSync(uploadDir); }

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
    email: { type: String, unique: true, sparse: true }, // E-posta ile giriş
    password: { type: String, required: true },
    isAdmin: { type: Boolean, default: false },
    school: { type: String },
    // YENİ ALANLAR
    profilePicture: { type: String, default: '' },
    badges: [{ type: String }], // ['first_case', 'perfect_score', ...]
    favorites: [{ type: Number }], // [101, 102, ...]
    notes: [{
        vakaID: { type: Number },
        vakaType: { type: String, default: 'klasik' }, // 'klasik' veya 'simulasyon'
        text: { type: String },
        updatedAt: { type: Date, default: Date.now }
    }],
    referralCode: { type: String, unique: true, sparse: true },
    referredBy: { type: String },
    createdAt: { type: Date, default: Date.now }
});
const UserModel = mongoose.models.User || mongoose.model("User", UserSchema);

// ROZET ŞEMASI
const BadgeSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String },
    icon: { type: String, default: 'fa-medal' },
    color: { type: String, default: '#f59e0b' }
});
const BadgeModel = mongoose.models.Badge || mongoose.model("Badge", BadgeSchema);

// VAKA TARTIŞMA ŞEMASI
const DiscussionSchema = new mongoose.Schema({
    vakaID: { type: Number, required: true },
    vakaType: { type: String, default: 'klasik' }, // 'klasik' veya 'simulasyon'
    username: { type: String, required: true },
    text: { type: String, required: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Discussion', default: null }, // Yanıt için
    likes: [{ type: String }], // Beğenen kullanıcı adları
    createdAt: { type: Date, default: Date.now }
});
const DiscussionModel = mongoose.models.Discussion || mongoose.model("Discussion", DiscussionSchema);

// KLASİK VAKA ŞEMASI (MEVCUT SİSTEM)
const VakaSchema = new mongoose.Schema({
    vakaNo: { type: Number, unique: true },
    baslik: { type: String, required: true },
    yas: { type: Number, required: true },
    cinsiyet: { type: String, required: true },
    gizliTani: { type: String },
    icerik: { type: String, required: true },
    zorluk: { type: String, enum: ['Kolay', 'Orta', 'Zor'], default: 'Orta' },
    resimUrl: { type: String },
    ipucu: { type: String, default: '' } // İpucu sistemi için
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
    ipucu: { type: String, default: '' }, // İpucu sistemi için

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
    aiDogruCevap: { type: String }
});
const RaporModel = mongoose.models.Rapor || mongoose.model("Rapor", RaporSchema);

const SettingSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: String, required: true }
});
const SettingModel = mongoose.models.Setting || mongoose.model("Setting", SettingSchema);

// BİLDİRİM ŞEMASI
const NotificationSchema = new mongoose.Schema({
    username: { type: String, required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});
const NotificationModel = mongoose.models.Notification || mongoose.model("Notification", NotificationSchema);

// --- YARDIMCI FONKSİYONLAR ---
async function triggerSiteUpdate(mesaj) {
    try {
        const yeniVersiyon = "v_" + Date.now();
        await SettingModel.findOneAndUpdate({ key: "site_version" }, { value: yeniVersiyon }, { upsert: true });
        const updateMsg = mesaj || "Sistem güncellendi.";
        await SettingModel.findOneAndUpdate({ key: "update_message" }, { value: updateMsg }, { upsert: true });
        console.log("🔔 Site güncellendi:", updateMsg);

        // Tüm kullanıcılara bildirim oluştur
        try {
            const users = await UserModel.find({}).select('username');
            const notifs = users.map(u => ({ username: u.username, message: updateMsg }));
            if (notifs.length > 0) await NotificationModel.insertMany(notifs);
        } catch (ne) { console.error('Bildirim oluşturma hatası:', ne); }
    } catch (e) { console.error("Güncelleme hatası", e); }
}

// 6. GÜVENLİK
const verifyToken = (req, res, next) => {
    const token = req.headers["authorization"];
    if (!token) return res.status(403).json({ success: false, message: "Giriş yapmanız gerekiyor!" });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) { return res.status(401).json({ success: false, message: "Geçersiz Token!" }); }
};

// Admin yetki kontrolü middleware
const verifyAdmin = async (req, res, next) => {
    try {
        const user = await UserModel.findOne({ username: req.user.username });
        if (!user || !user.isAdmin) {
            return res.status(403).json({ success: false, message: "Yetkiniz yok!" });
        }
        next();
    } catch (error) { return res.status(500).json({ success: false, message: "Sunucu hatası." }); }
};

// ================= ROTALAR =================

app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/register.html', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/profil.html', (req, res) => res.sendFile(path.join(__dirname, 'profil.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

app.get('/check-version', async (req, res) => {
    try {
        const vSetting = await SettingModel.findOne({ key: "site_version" });
        const mSetting = await SettingModel.findOne({ key: "update_message" });
        res.json({ version: vSetting ? vSetting.value : "v_baslangic", message: mSetting ? mSetting.value : "Yeni içerikler!" });
    } catch (error) { res.status(500).json({ error: "Hata" }); }
});

// AUTH
app.post('/register', async (req, res) => {
    const { username, password, email, phone, school } = req.body;
    try {
        const temizKadi = username.toLowerCase().trim();

        // E-posta zorunlu
        if (!email || !email.trim()) {
            return res.status(400).json({ success: false, message: "E-posta adresi zorunludur!" });
        }
        const temizEmail = email.toLowerCase().trim();

        // E-posta format kontrolü
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(temizEmail)) {
            return res.status(400).json({ success: false, message: "Geçerli bir e-posta adresi girin!" });
        }

        // E-posta benzersizlik kontrolü
        const mevcutEmail = await UserModel.findOne({ email: temizEmail });
        if (mevcutEmail) return res.status(400).json({ success: false, message: "Bu e-posta zaten kayıtlı!" });

        const hashedPassword = await bcrypt.hash(password, 10);
        const userData = { username: temizKadi, password: hashedPassword, school: school, email: temizEmail };

        const newUser = new UserModel(userData);
        await newUser.save();
        res.json({ success: true, message: "Kayıt başarılı!" });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: "Bu kullanıcı adı zaten alınmış!" });
        }
        res.status(500).json({ success: false, message: "Kayıt hatası." });
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const temizGiris = username.toLowerCase().trim();

        // E-posta veya kullanıcı adıyla ara
        const user = await UserModel.findOne({
            $or: [
                { username: temizGiris },
                { email: temizGiris }
            ]
        });
        if (!user) return res.status(400).json({ success: false, message: "Kullanıcı bulunamadı!" });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ success: false, message: "Şifre hatalı!" });
        const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: "24h" });
        res.json({ success: true, message: "Giriş başarılı!", token: token, username: user.username, school: user.school, isAdmin: user.isAdmin });
    } catch (error) { res.status(500).json({ success: false, message: "Sunucu hatası." }); }
});

// --- ŞİFRE SIFIRLAMA: ADIM 1 - KİMLİK DOĞRULAMA ---
app.post('/verify-reset', async (req, res) => {
    const { username, email } = req.body;
    try {
        const temizKadi = username.toLowerCase().trim();
        const temizEmail = email.toLowerCase().trim();

        const user = await UserModel.findOne({ username: temizKadi, email: temizEmail });
        if (!user) {
            return res.status(400).json({ success: false, message: "İsim ve e-posta eşleşmiyor veya kayıtlı değil!" });
        }
        res.json({ success: true, message: "Hesap doğrulandı." });
    } catch (error) { res.status(500).json({ success: false, message: "Sunucu hatası." }); }
});

// --- ŞİFRE SIFIRLAMA: ADIM 2 - YENİ ŞİFRE ---
app.post('/reset-password', async (req, res) => {
    const { username, newPassword } = req.body;
    try {
        if (!newPassword || newPassword.length < 4) {
            return res.status(400).json({ success: false, message: "Şifre en az 4 karakter olmalı." });
        }

        const temizKadi = username.toLowerCase().trim();
        const user = await UserModel.findOne({ username: temizKadi });
        if (!user) return res.status(400).json({ success: false, message: "Kullanıcı bulunamadı." });

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        res.json({ success: true, message: "Şifre başarıyla güncellendi!" });
    } catch (error) { res.status(500).json({ success: false, message: "Sunucu hatası." }); }
});

// --- KLASİK VAKA İŞLEMLERİ (MEVCUT) ---
app.post('/admin/add-case', verifyToken, verifyAdmin, upload.single('vakaResmi'), async (req, res) => {
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

app.delete('/admin/delete-case/:no', verifyToken, verifyAdmin, async (req, res) => {
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

app.get('/admin/case/:no', verifyToken, verifyAdmin, async (req, res) => {
    try { const vaka = await VakaModel.findOne({ vakaNo: req.params.no }); res.json({ success: true, vaka }); } catch (error) { res.status(500).json({ error: "Hata." }); }
});

app.put('/admin/update-case/:no', verifyToken, verifyAdmin, upload.single('vakaResmi'), async (req, res) => {
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
app.post('/admin/add-simulation', verifyToken, verifyAdmin, async (req, res) => {
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
        if (sim) res.json({ success: true, sim });
        else res.status(404).json({ success: false, message: "Bulunamadı." });
    } catch (error) { res.status(500).json({ error: "Hata." }); }
});

// 4. Simülasyonu Değerlendir (AI Yargıcı)
app.post('/evaluate-simulation', verifyToken, async (req, res) => {
    // 1. Gelen veriyi kontrol et (Terminalde görelim)
    console.log("--- AI Değerlendirme İsteği Geldi ---");
    console.log("Kullanıcı:", req.user.username);
    console.log("Gelen Body:", req.body);

    const { simNo, islemGecmisi, tani } = req.body;
    const kullaniciAdi = req.user.username;

    // Basit doğrulama
    if (!simNo) return res.status(400).json({ success: false, message: "Simülasyon No (simNo) eksik!" });

    try {
        const sim = await SimulasyonModel.findOne({ simNo: simNo });
        if (!sim) {
            console.log("HATA: Simülasyon veritabanında bulunamadı:", simNo);
            return res.status(404).json({ success: false, message: "Simülasyon bulunamadı." });
        }

        // Daha önce çözmüş mü kontrolü
        const eskiRapor = await RaporModel.findOne({
            kullaniciAdi: kullaniciAdi,
            vakaID: simNo,
            tip: 'simulasyon'
        });

        // Prompt Hazırlama (Garanti JSON isteme)
        const prompt = `Sen kıdemli bir Odyoloji Hocasısın. Bir öğrencinin klinik simülasyondaki performansını değerlendiriyorsun.

HASTA GERÇEK DURUMU: ${sim.gercekTani}
YASAK/GEREKSİZ TESTLER: ${sim.gereksizTestler}

ÖĞRENCİNİN YAPTIĞI İŞLEMLER (SIRASIYLA): ${Array.isArray(islemGecmisi) ? islemGecmisi.join(' -> ') : 'İşlem yok'}
ÖĞRENCİNİN KOYDUĞU TANI: "${tani}"

DEĞERLENDİRME KRİTERLERİ:
1. Öğrenci sadece hastalık adı yazarsa (detaylı klinik açıklama yoksa) MAX 25 PUAN ver.
2. İyi bir tanı raporu şu formatta olmalıdır:
   - Yapılan testlerin bulgularını referans vermeli (örn: "Yapılan saf ses odyometride ... bulguları görülmüştür")
   - Her testin sonucunu klinik olarak yorumlamalı
   - Bulgulara dayanarak tanıya nasıl ulaştığını açıklamalı
   - Son olarak kesin tanıyı belirtmeli
3. Sıralama hatası, eksik test veya gereksiz test varsa puan kır (vestibüler testleri değerlendirme dışında tut).
4. Yanlış tanı varsa puanı ciddi kır.
5. Doğru tanı + detaylı bulgu açıklaması = 80-100 puan
6. Doğru tanı + kısmen detaylı = 50-79 puan
7. Doğru tanı + sadece tanı adı = 10-25 puan
8. Yanlış tanı = 0-15 puan

ÖNEMLİ: Cevabı SADECE ve SADECE aşağıdaki JSON formatında ver. Başka hiçbir yazı, açıklama veya markdown kullanma.
{
    "puan": 0,
    "yorum": "Buraya hoca yorumunu yaz...",
    "dogruYol": "Doğru test sırası ve tanı şuydu..."
}`;

        // AI İsteği
        const result = await model.generateContent(prompt);
        let text = result.response.text();

        console.log("AI HAM CEVAP:", text); // Terminalde AI ne demiş bakalım

        // --- JSON TEMİZLEME VE AYIKLAMA (KRİTİK BÖLÜM) ---
        // Markdown tırnaklarını temizle
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();

        // Süslü parantezleri bul
        const jsonBas = text.indexOf('{');
        const jsonSon = text.lastIndexOf('}');

        let aiResult = { puan: 0, yorum: "AI yanıtı okunamadı.", dogruYol: "-" };

        if (jsonBas !== -1 && jsonSon !== -1) {
            try {
                const temizJson = text.substring(jsonBas, jsonSon + 1);
                aiResult = JSON.parse(temizJson);
            } catch (e) {
                console.error("JSON Parse Hatası:", e);
                // Manuel bir şeyler kurtarmaya çalışalım veya hata dönelim
                aiResult.yorum = "Hocam sistem yoğun, puanlama yapılamadı ama raporunuz kaydedildi.";
            }
        } else {
            console.error("AI JSON formatında cevap vermedi!");
        }

        // Puan Mantığı (Pratik Modu)
        let kaydedilecekPuan = aiResult.puan;
        if (eskiRapor) {
            kaydedilecekPuan = 0;
            aiResult.yorum += " (Not: Bu vakayı daha önce çözdüğün için puan tabloya işlenmedi - Pratik Modu)";
        }

        // Kaydet
        const yeniRapor = new RaporModel({
            raporMetni: `[SİM] Tanı: ${tani} | İşlemler: ${Array.isArray(islemGecmisi) ? islemGecmisi.join(', ') : ''}`,
            alinanPuan: kaydedilecekPuan,
            aiYorumu: aiResult.yorum,
            aiDogruCevap: aiResult.dogruYol,
            kullaniciAdi: kullaniciAdi,
            vakaID: simNo,
            tip: 'simulasyon'
        });

        await yeniRapor.save();
        console.log("Rapor başarıyla kaydedildi.");

        res.json({ success: true, result: aiResult });

    } catch (error) {
        console.error("GENEL SUNUCU HATASI:", error);
        res.status(500).json({ success: false, message: "Sunucu hatası: " + error.message });
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

        const prompt = `Sen kıdemli bir Odyoloji Hocasısın. Bir öğrencinin vakaya verdiği klinik raporu değerlendiriyorsun.

VAKA BİLGİLERİ:
- Başlık: ${vaka.baslik}
- İçerik: ${vaka.icerik}
- Doğru Tanı: ${vaka.gizliTani}

ÖĞRENCİNİN RAPORU: "${rapor}"

DEĞERLENDİRME KRİTERLERİ (ÇOK ÖNEMLİ):
1. Öğrenci sadece hastalık adı veya kısa bir tanı yazarsa (örneğin sadece "otoskleroz" veya "iletim tipi kayıp") MAX 20 PUAN ver. Bu kabul edilemez.
2. İyi bir rapor şu formatta olmalıdır:
   - Hangi testlerin yapıldığını ve bulgularını belirtmeli (örn: "Yapılan saf ses odyometride ... bulguları tespit edilmiştir")
   - Her testin sonucunu klinik olarak yorumlamalı
   - Bulgulara dayanarak tanıya ulaşma sürecini açıklamalı
   - Son olarak kesin tanıyı belirtmeli (örn: "Hastada ... varlığı tanılanmıştır")
3. Rapor ne kadar detaylı ve klinik dil ile yazılmışsa o kadar yüksek puan ver.
4. Test bulgusu referans etmeden direkt tanı yazan öğrenciye KESİNLİKLE yüksek puan verme.
5. Doğru tanı + detaylı klinik rapor = 80-100 puan
6. Doğru tanı + kısmen detaylı rapor = 50-79 puan  
7. Doğru tanı + sadece tanı adı (detaysız) = 10-25 puan
8. Yanlış tanı = 0-15 puan

ÖNEMLİ: Cevabı SADECE aşağıdaki JSON formatında ver. Başka hiçbir yazı ekleme.
{ "puan": 0, "yorum": "Yapıcı değerlendirme yorumun...", "idealCevap": "İdeal klinik rapor örneği..." }`;
        const result = await model.generateContent(prompt);
        let aiResult = JSON.parse(result.response.text().match(/\{[\s\S]*\}/)[0]);

        let hizBonusu = kalanSure > 0 ? Math.floor(kalanSure / 30) * 5 : 0;
        if (hizBonusu > 20) hizBonusu = 20;
        let finalPuan = Math.min(100, Math.round(aiResult.puan * (vaka.zorluk == 'Zor' ? 1.5 : 1.25)) + hizBonusu);

        const yeniRapor = new RaporModel({
            raporMetni: rapor, alinanPuan: finalPuan, aiYorumu: aiResult.yorum + (hizBonusu ? ` (+${hizBonusu} Hız)` : ""),
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
        if (!mesaj.trim()) return res.json({ success: false });
        await new FeedbackModel({ kullaniciAdi: req.user.username, mesaj: mesaj }).save();
        res.json({ success: true, message: "İletildi." });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.get('/admin/feedbacks', verifyToken, verifyAdmin, async (req, res) => { try { const f = await FeedbackModel.find().sort({ tarih: -1 }); res.json(f); } catch (e) { res.status(500).json({}); } });
app.put('/admin/toggle-feedback/:id', verifyToken, verifyAdmin, async (req, res) => { try { const f = await FeedbackModel.findById(req.params.id); f.okundu = !f.okundu; await f.save(); res.json({ success: true, yeniDurum: f.okundu }); } catch (e) { res.status(500).json({ success: false }); } });
app.delete('/admin/delete-feedback/:id', verifyToken, verifyAdmin, async (req, res) => { try { await FeedbackModel.findByIdAndDelete(req.params.id); res.json({ success: true }); } catch (e) { res.status(500).json({ success: false }); } });

// --- YENİ: SİMÜLASYON GÜNCELLEME (ADMİN İÇİN) ---
app.put('/admin/update-simulation/:no', verifyToken, verifyAdmin, async (req, res) => {
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

// --- SİMÜLASYON SİLME (ADMİN İÇİN) ---
app.delete('/admin/delete-simulation/:no', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const silinen = await SimulasyonModel.findOneAndDelete({ simNo: req.params.no });
        if (silinen) {
            await triggerSiteUpdate(`🗑️ Simülasyon #${req.params.no} silindi.`);
            res.json({ success: true, message: "Simülasyon silindi." });
        } else {
            res.status(404).json({ success: false, message: "Simülasyon bulunamadı." });
        }
    } catch (error) { res.status(500).json({ success: false, message: "Hata oluştu." }); }
});

// ================= YENİ ÖZELLİKLER =================

// --- ROZET SİSTEMİ ---
// Varsayılan rozetleri oluştur
const varsayilanRozetler = [
    { code: 'first_case', name: 'İlk Adım', description: 'İlk vakayı çözdün!', icon: 'fa-star', color: '#10b981' },
    { code: 'five_cases', name: 'Deneyimli', description: '5 vaka çözdün!', icon: 'fa-medal', color: '#3b82f6' },
    { code: 'ten_cases', name: 'Uzman Aday', description: '10 vaka çözdün!', icon: 'fa-award', color: '#8b5cf6' },
    { code: 'perfect_score', name: 'Mükemmeliyetçi', description: '100 puan aldın!', icon: 'fa-crown', color: '#f59e0b' },
    { code: 'speed_demon', name: 'Hız Şeytanı', description: 'Vakayı 2 dakikada çözdün!', icon: 'fa-bolt', color: '#ef4444' },
    { code: 'first_sim', name: 'Klinik Başlangıç', description: 'İlk simülasyonu tamamladın!', icon: 'fa-user-md', color: '#06b6d4' },
    { code: 'streak_3', name: 'Seri Çözücü', description: 'Arka arkaya 3 vaka çözdün!', icon: 'fa-fire', color: '#f97316' },
    { code: 'high_scorer', name: 'Yüksek Skor', description: 'Ortalama puanın 80 üstü!', icon: 'fa-chart-line', color: '#22c55e' },
    { code: 'social_butterfly', name: 'Sosyal Kelebek', description: 'Bir arkadaşını davet ettin!', icon: 'fa-user-plus', color: '#ec4899' }
];

// Sunucu başladığında rozetleri kontrol et ve eksikleri ekle
async function initBadges() {
    for (const rozet of varsayilanRozetler) {
        await BadgeModel.findOneAndUpdate(
            { code: rozet.code },
            rozet,
            { upsert: true, new: true }
        );
    }
    console.log('✅ Rozetler hazır.');
}
mongoose.connection.once('open', initBadges);

// Tüm rozetleri getir
app.get('/badges', async (req, res) => {
    try {
        const rozetler = await BadgeModel.find();
        res.json(rozetler);
    } catch (error) { res.status(500).json({ error: "Hata" }); }
});

// Kullanıcının rozetlerini getir
app.get('/my-badges', verifyToken, async (req, res) => {
    try {
        const user = await UserModel.findOne({ username: req.user.username });
        const tumRozetler = await BadgeModel.find();
        const kazanilanKodlar = user.badges || [];

        const sonuc = tumRozetler.map(r => ({
            ...r.toObject(),
            kazanildi: kazanilanKodlar.includes(r.code)
        }));

        res.json(sonuc);
    } catch (error) { res.status(500).json({ error: "Hata" }); }
});

// Rozet kazanım kontrolü
app.post('/check-badges', verifyToken, async (req, res) => {
    try {
        const user = await UserModel.findOne({ username: req.user.username });
        const raporlar = await RaporModel.find({ kullaniciAdi: req.user.username });

        let yeniRozetler = [];
        const mevcutRozetler = user.badges || [];

        // İlk vaka rozeti
        if (raporlar.length >= 1 && !mevcutRozetler.includes('first_case')) {
            yeniRozetler.push('first_case');
        }
        // 5 vaka rozeti
        if (raporlar.length >= 5 && !mevcutRozetler.includes('five_cases')) {
            yeniRozetler.push('five_cases');
        }
        // 10 vaka rozeti
        if (raporlar.length >= 10 && !mevcutRozetler.includes('ten_cases')) {
            yeniRozetler.push('ten_cases');
        }
        // Mükemmel skor rozeti
        if (raporlar.some(r => r.alinanPuan === 100) && !mevcutRozetler.includes('perfect_score')) {
            yeniRozetler.push('perfect_score');
        }
        // İlk simülasyon rozeti
        if (raporlar.some(r => r.tip === 'simulasyon') && !mevcutRozetler.includes('first_sim')) {
            yeniRozetler.push('first_sim');
        }
        // Yüksek skor rozeti (ortalama 80+)
        if (raporlar.length >= 3) {
            const ortalama = raporlar.reduce((a, b) => a + b.alinanPuan, 0) / raporlar.length;
            if (ortalama >= 80 && !mevcutRozetler.includes('high_scorer')) {
                yeniRozetler.push('high_scorer');
            }
        }

        if (yeniRozetler.length > 0) {
            await UserModel.findOneAndUpdate(
                { username: req.user.username },
                { $push: { badges: { $each: yeniRozetler } } }
            );
        }

        res.json({ success: true, yeniRozetler });
    } catch (error) { res.status(500).json({ error: "Hata" }); }
});

// --- FAVORİ SİSTEMİ ---
app.post('/favorites/add', verifyToken, async (req, res) => {
    try {
        const { vakaID } = req.body;
        await UserModel.findOneAndUpdate(
            { username: req.user.username },
            { $addToSet: { favorites: vakaID } }
        );
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.delete('/favorites/remove/:id', verifyToken, async (req, res) => {
    try {
        await UserModel.findOneAndUpdate(
            { username: req.user.username },
            { $pull: { favorites: parseInt(req.params.id) } }
        );
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.get('/my-favorites', verifyToken, async (req, res) => {
    try {
        const user = await UserModel.findOne({ username: req.user.username });
        res.json(user.favorites || []);
    } catch (error) { res.status(500).json({ error: "Hata" }); }
});

// --- NOT SİSTEMİ ---
app.post('/notes/save', verifyToken, async (req, res) => {
    try {
        const { vakaID, vakaType, text } = req.body;
        const user = await UserModel.findOne({ username: req.user.username });

        // Mevcut notu bul veya yeni ekle
        const notIndex = user.notes.findIndex(n => n.vakaID === vakaID && n.vakaType === vakaType);

        if (notIndex > -1) {
            user.notes[notIndex].text = text;
            user.notes[notIndex].updatedAt = new Date();
        } else {
            user.notes.push({ vakaID, vakaType, text, updatedAt: new Date() });
        }

        await user.save();
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.get('/notes/:vakaID', verifyToken, async (req, res) => {
    try {
        const user = await UserModel.findOne({ username: req.user.username });
        const vakaType = req.query.type || 'klasik';
        const not = user.notes.find(n => n.vakaID === parseInt(req.params.vakaID) && n.vakaType === vakaType);
        res.json({ text: not ? not.text : '' });
    } catch (error) { res.status(500).json({ error: "Hata" }); }
});

// --- VAKA TARTIŞMA SİSTEMİ ---
app.post('/discussions/add', verifyToken, async (req, res) => {
    try {
        const { vakaID, vakaType, text, parentId } = req.body;
        if (!text || !text.trim()) return res.status(400).json({ success: false, message: "Boş mesaj gönderilemez." });

        const yeniYorum = new DiscussionModel({
            vakaID,
            vakaType: vakaType || 'klasik',
            username: req.user.username,
            text: text.trim(),
            parentId: parentId || null
        });
        await yeniYorum.save();
        res.json({ success: true, yorum: yeniYorum });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.get('/discussions/:vakaID', async (req, res) => {
    try {
        const vakaType = req.query.type || 'klasik';
        // Sadece ana yorumları getir (parentId null olanlar)
        // En çok beğenileni üstte göster, sonra tarihe göre
        const yorumlar = await DiscussionModel.find({
            vakaID: parseInt(req.params.vakaID),
            vakaType,
            parentId: null
        }).sort({ createdAt: -1 }).limit(50);

        // Beğeni sayısına göre sırala (çoktan aza)
        const siraliYorumlar = yorumlar.sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0));

        // Her yorum için yanıtları da getir
        const yorumlarWithReplies = await Promise.all(siraliYorumlar.map(async (yorum) => {
            const yanitlar = await DiscussionModel.find({
                parentId: yorum._id
            }).sort({ createdAt: 1 }).limit(20);

            return {
                ...yorum.toObject(),
                likeCount: yorum.likes?.length || 0,
                replies: yanitlar
            };
        }));

        res.json(yorumlarWithReplies);
    } catch (error) { res.status(500).json({ error: "Hata" }); }
});

// --- YORUM BEĞENİ SİSTEMİ ---
app.post('/discussions/like/:id', verifyToken, async (req, res) => {
    try {
        const yorum = await DiscussionModel.findById(req.params.id);
        if (!yorum) return res.status(404).json({ success: false });

        const username = req.user.username;
        const index = yorum.likes.indexOf(username);

        if (index > -1) {
            // Beğeniyi geri al
            yorum.likes.splice(index, 1);
        } else {
            // Beğen
            yorum.likes.push(username);
        }

        await yorum.save();
        res.json({ success: true, likeCount: yorum.likes.length, liked: index === -1 });
    } catch (error) { res.status(500).json({ success: false }); }
});


// --- İSTATİSTİKLER ---
app.get('/my-stats', verifyToken, async (req, res) => {
    try {
        const raporlar = await RaporModel.find({ kullaniciAdi: req.user.username }).sort({ olusturulmaTarihi: 1 });

        // Son 7 günlük veri
        const sonYediGun = [];
        for (let i = 6; i >= 0; i--) {
            const tarih = new Date();
            tarih.setDate(tarih.getDate() - i);
            tarih.setHours(0, 0, 0, 0);

            const ertesiGun = new Date(tarih);
            ertesiGun.setDate(ertesiGun.getDate() + 1);

            const gunlukRaporlar = raporlar.filter(r => {
                const rTarih = new Date(r.olusturulmaTarihi);
                return rTarih >= tarih && rTarih < ertesiGun;
            });

            sonYediGun.push({
                tarih: tarih.toLocaleDateString('tr-TR', { weekday: 'short' }),
                vakaSayisi: gunlukRaporlar.length,
                toplamPuan: gunlukRaporlar.reduce((a, b) => a + b.alinanPuan, 0)
            });
        }

        res.json({ haftalik: sonYediGun });
    } catch (error) { res.status(500).json({ error: "Hata" }); }
});

app.get('/class-stats', verifyToken, async (req, res) => {
    try {
        const user = await UserModel.findOne({ username: req.user.username });
        const okul = user.school;

        if (!okul) return res.json({ okulOrtalamasi: 0, siralama: 0 });

        // Aynı okuldaki kullanıcılar
        const okulKullanicilari = await UserModel.find({ school: okul }).select('username');
        const okulKadilar = okulKullanicilari.map(u => u.username);

        // Tüm raporlar
        const tumRaporlar = await RaporModel.aggregate([
            { $match: { kullaniciAdi: { $in: okulKadilar } } },
            { $group: { _id: "$kullaniciAdi", toplamPuan: { $sum: "$alinanPuan" } } },
            { $sort: { toplamPuan: -1 } }
        ]);

        const okulOrtalamasi = tumRaporlar.length > 0
            ? Math.round(tumRaporlar.reduce((a, b) => a + b.toplamPuan, 0) / tumRaporlar.length)
            : 0;

        const siralama = tumRaporlar.findIndex(r => r._id === req.user.username) + 1;

        res.json({ okulOrtalamasi, siralama, toplamKisi: tumRaporlar.length });
    } catch (error) { res.status(500).json({ error: "Hata" }); }
});

// --- PROFİL FOTOĞRAFI ---
app.post('/upload-profile-pic', verifyToken, upload.single('profilePic'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "Dosya yok." });

        const resimYolu = '/uploads/' + req.file.filename;
        await UserModel.findOneAndUpdate(
            { username: req.user.username },
            { profilePicture: resimYolu }
        );

        res.json({ success: true, url: resimYolu });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.get('/my-profile', verifyToken, async (req, res) => {
    try {
        const user = await UserModel.findOne({ username: req.user.username })
            .select('username school profilePicture badges referralCode createdAt');
        res.json(user);
    } catch (error) { res.status(500).json({ error: "Hata" }); }
});

// --- DAVET SİSTEMİ ---
function generateReferralCode() {
    return 'ODYO' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

app.get('/my-referral-code', verifyToken, async (req, res) => {
    try {
        let user = await UserModel.findOne({ username: req.user.username });

        if (!user.referralCode) {
            user.referralCode = generateReferralCode();
            await user.save();
        }

        res.json({ code: user.referralCode });
    } catch (error) { res.status(500).json({ error: "Hata" }); }
});

app.post('/apply-referral', async (req, res) => {
    try {
        const { code, username } = req.body;

        const referrer = await UserModel.findOne({ referralCode: code });
        if (!referrer) return res.status(400).json({ success: false, message: "Geçersiz kod." });
        if (referrer.username === username) return res.status(400).json({ success: false, message: "Kendi kodunu kullanamazsın." });

        // Davet edilen kullanıcıyı güncelle
        await UserModel.findOneAndUpdate({ username }, { referredBy: referrer.username });

        // Davet eden kullanıcıya "Sosyal Kelebek" rozetini ver (eğer yoksa)
        if (!referrer.badges || !referrer.badges.includes('social_butterfly')) {
            await UserModel.findOneAndUpdate(
                { username: referrer.username },
                { $addToSet: { badges: 'social_butterfly' } }
            );
        }

        res.json({ success: true, message: "Referans kodu uygulandı!" });
    } catch (error) { res.status(500).json({ success: false }); }
});

// --- RASTGELE AI VAKA ---
app.get('/random-case', verifyToken, async (req, res) => {
    try {
        const prompt = `Sen bir odyoloji eğitmenisin. Rastgele bir odyoloji vaka senaryosu oluştur. 
Vaka gerçekçi olmalı ve odyoloji öğrencileri için eğitici olmalı.

JSON formatında yanıt ver:
{
  "baslik": "Kısa ve açıklayıcı başlık",
  "icerik": "Detaylı hasta hikayesi ve bulgular (en az 3-4 paragraf). Şikayet, aile öyküsü, muayene bulguları, odyometri sonuçları dahil.",
  "yas": "Hasta yaşı (sayı)",
  "cinsiyet": "Kadın veya Erkek",
  "zorluk": "Kolay, Orta veya Zor (rastgele seç)",
  "gizliTani": "Doğru tanı ve tedavi yaklaşımı"
}`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('AI yanıtı parse edilemedi');

        const aiVaka = JSON.parse(jsonMatch[0]);

        res.json({
            success: true,
            aiGenerated: true,
            vaka: {
                vakaNo: 'AI-' + Date.now(),
                baslik: aiVaka.baslik,
                icerik: aiVaka.icerik,
                yas: aiVaka.yas,
                cinsiyet: aiVaka.cinsiyet,
                zorluk: aiVaka.zorluk,
                gizliTani: aiVaka.gizliTani
            }
        });
    } catch (error) {
        console.error('AI Vaka hatası:', error);
        res.status(500).json({ success: false, message: "AI vaka oluşturulamadı." });
    }
});
// --- AI VAKA DEĞERLENDİRME (PUAN KAYDETMEZ) ---
app.post('/ai-evaluate', verifyToken, async (req, res) => {
    try {
        const { rapor, gizliTani } = req.body;
        if (!rapor || !gizliTani) return res.json({ success: false, message: "Eksik veri." });

        const prompt = `Sen kıdemli bir Odyoloji Hocasısın. Bir öğrencinin AI tarafından oluşturulan pratik vakasına verdiği klinik raporu değerlendiriyorsun.

DOĞRU TANI: ${gizliTani}
ÖĞRENCİ RAPORU: "${rapor}"

DEĞERLENDİRME KRİTERLERİ (ÇOK ÖNEMLİ):
1. Öğrenci sadece hastalık adı yazarsa (detaylı klinik açıklama yoksa) MAX 20 PUAN ver.
2. İyi bir rapor şu formatta olmalıdır:
   - Vakadaki test bulgularını referans göstermeli (örn: "Yapılan ... testine göre ... bulguları tespit edilmiştir")
   - Bulguları klinik olarak yorumlamalı
   - Bulgulara dayanarak tanıya ulaşım sürecini açıklamalı
   - Kesin tanıyı belirtmeli (örn: "Hastada ... varlığı tanılanmıştır")
3. Rapor ne kadar detaylı ve klinik dil ile yazılmışsa o kadar yüksek puan ver.
4. Doğru tanı + detaylı klinik rapor = 80-100 puan
5. Doğru tanı + kısmen detaylı rapor = 50-79 puan
6. Doğru tanı + sadece tanı adı = 10-25 puan
7. Yanlış tanı = 0-15 puan

ÖNEMLİ: Cevabı SADECE aşağıdaki JSON formatında ver.
{ "puan": 0, "yorum": "Yapıcı değerlendirme...", "idealCevap": "İdeal klinik rapor örneği..." }`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('AI yanıtı parse edilemedi');

        const aiResult = JSON.parse(jsonMatch[0]);
        // NOT: Veritabanına kaydetmiyoruz - pratik modu
        res.json({ success: true, puan: aiResult.puan, yorum: aiResult.yorum, idealCevap: aiResult.idealCevap });
    } catch (error) {
        console.error('AI Değerlendirme hatası:', error);
        res.status(500).json({ success: false, message: "Değerlendirme yapılamadı." });
    }
});

// --- GELİŞMİŞ VAKA ARAMA & FİLTRELEME ---
app.get('/cases-search', async (req, res) => {
    try {
        const { search, zorluk, sort } = req.query;
        let query = {};

        // Arama filtresi
        if (search && search.trim()) {
            query.baslik = { $regex: search.trim(), $options: 'i' };
        }

        // Zorluk filtresi
        if (zorluk && zorluk !== 'Tümü') {
            query.zorluk = zorluk;
        }

        // Sıralama
        let sortOption = { vakaNo: -1 }; // Varsayılan: en yeni
        if (sort === 'eski') sortOption = { vakaNo: 1 };
        if (sort === 'az') sortOption = { baslik: 1 };

        const vakalar = await VakaModel.find(query).select('-gizliTani').sort(sortOption);
        res.json(vakalar);
    } catch (error) { res.status(500).json({ error: "Hata" }); }
});

// --- İPUCU GETİRME ---
app.get('/ipucu/:type/:id', verifyToken, async (req, res) => {
    try {
        const { type, id } = req.params;
        let ipucu = '';

        if (type === 'vaka') {
            const vaka = await VakaModel.findOne({ vakaNo: parseInt(id) });
            ipucu = vaka?.ipucu || 'Bu vaka için ipucu eklenmemiş.';
        } else {
            const sim = await SimulasyonModel.findOne({ simNo: parseInt(id) });
            ipucu = sim?.ipucu || 'Bu simülasyon için ipucu eklenmemiş.';
        }

        res.json({ ipucu });
    } catch (error) { res.status(500).json({ error: "Hata" }); }
});

// --- MOTİVASYON SÖZLERİ ---
const motivasyonSozleri = [
    "Her vaka, seni daha iyi bir odyolog yapıyor! 🎧",
    "Bugün öğrendiğin, yarın bir hastanın hayatını değiştirebilir! 💪",
    "Hata yapmaktan korkma, öğrenmek için buradasın! 📚",
    "Azim başarının anahtarıdır. Devam et! 🔑",
    "Her uzman bir zamanlar öğrenciydi. Yolun açık olsun! 🌟",
    "Pratik mükemmelleştirir. Bir vaka daha çöz! ✨",
    "Bilgi paylaştıkça çoğalır. Arkadaşlarını da davet et! 🤝",
    "Bugün yapabileceklerini yarına bırakma! ⏰"
];

app.get('/motivasyon', (req, res) => {
    const rastgele = motivasyonSozleri[Math.floor(Math.random() * motivasyonSozleri.length)];
    res.json({ soz: rastgele });
});

// --- KULLANICI TOPLAM VAKALARİ (İlerleme için) ---
app.get('/toplam-vaka-sayisi', async (req, res) => {
    try {
        const klasikSayisi = await VakaModel.countDocuments();
        const simSayisi = await SimulasyonModel.countDocuments();
        res.json({ klasik: klasikSayisi, simulasyon: simSayisi, toplam: klasikSayisi + simSayisi });
    } catch (error) { res.status(500).json({ error: "Hata" }); }
});

// --- TOKEN YENİLEME ---
app.post('/refresh-token', verifyToken, async (req, res) => {
    try {
        // Mevcut token geçerliyse yeni token üret
        const newToken = jwt.sign(
            { id: req.user.id, username: req.user.username },
            process.env.JWT_SECRET,
            { expiresIn: "24h" } // 24 saat
        );
        res.json({ success: true, token: newToken });
    } catch (error) {
        res.status(500).json({ success: false, message: "Token yenilenemedi." });
    }
});

// --- ADMİN BİLDİRİM GÖNDERİMİ ---
app.post('/admin/send-notification', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { subject, message } = req.body;
        if (!subject || !message) {
            return res.status(400).json({ success: false, message: 'Konu ve mesaj zorunludur.' });
        }

        const htmlContent = `
            <h2 style="color: #3b82f6; margin-top: 0;">${subject}</h2>
            <p style="font-size: 1rem; line-height: 1.8; color: #cbd5e1;">${message.replace(/\n/g, '<br>')}</p>
            <div style="margin-top: 20px; text-align: center;">
                <a href="https://odyocase.com" style="display: inline-block; background: linear-gradient(135deg, #3b82f6, #1e40af); color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: 600;">OdyoCase'e Git</a>
            </div>
        `;

        const result = await sendEmailToAll(subject, htmlContent);
        if (result.success) {
            res.json({ success: true, message: `${result.count} kullanıcıya bildirim gönderildi!` });
        } else {
            res.status(500).json({ success: false, message: result.message || 'Gönderim başarısız.' });
        }
    } catch (error) {
        console.error('Bildirim hatası:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası.' });
    }
});

// --- BİLDİRİM SİSTEMİ API ---
app.get('/my-notifications', verifyToken, async (req, res) => {
    try {
        const notifs = await NotificationModel.find({ username: req.user.username })
            .sort({ createdAt: -1 })
            .limit(30);
        res.json(notifs);
    } catch (e) {
        res.status(500).json({ success: false, message: 'Bildirimler alınamadı.' });
    }
});

app.put('/notifications/read-all', verifyToken, async (req, res) => {
    try {
        await NotificationModel.updateMany(
            { username: req.user.username, read: false },
            { $set: { read: true } }
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

app.put('/notifications/read/:id', verifyToken, async (req, res) => {
    try {
        await NotificationModel.findOneAndUpdate(
            { _id: req.params.id, username: req.user.username },
            { $set: { read: true } }
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

// --- GLOBAL ERROR HANDLER ---
app.use((err, req, res, next) => {
    console.error('🔴 Sunucu Hatası:', err.stack);
    res.status(500).json({
        success: false,
        message: 'Sunucu hatası oluştu. Lütfen daha sonra tekrar deneyin.'
    });
});

// Unhandled Promise Rejection Handler
process.on('unhandledRejection', (reason, promise) => {
    console.error('🔴 Unhandled Rejection:', reason);
});

// Uncaught Exception Handler
process.on('uncaughtException', (error) => {
    console.error('🔴 Uncaught Exception:', error);
});

app.listen(port, () => { console.log(`🚀 Sunucu çalışıyor: http://localhost:${port}`); });