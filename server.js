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
    isAdmin: { type: Boolean, default: false }
});
const UserModel = mongoose.models.User || mongoose.model("User", UserSchema);

// VAKA ŞEMASI (GÜNCELLENDİ: Yas ve Cinsiyet Eklendi)
const VakaSchema = new mongoose.Schema({
    vakaNo: { type: Number, unique: true },
    baslik: { type: String, required: true },
    yas: { type: Number, required: true },      // YENİ
    cinsiyet: { type: String, required: true }, // YENİ
    gizliTani: { type: String },
    icerik: { type: String, required: true },
    zorluk: { type: String, enum: ['Kolay', 'Orta', 'Zor'], default: 'Orta' },
    resimUrl: { type: String }
});
const VakaModel = mongoose.models.Vaka || mongoose.model("Vaka", VakaSchema);

// GERİ BİLDİRİM ŞEMASI
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
    olusturulmaTarihi: { type: Date, default: Date.now }
});
const RaporModel = mongoose.models.Rapor || mongoose.model("Rapor", RaporSchema);

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

app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new UserModel({ username, password: hashedPassword });
        await newUser.save();
        res.json({ success: true, message: "Kayıt başarılı!" });
    } catch (error) { res.json({ success: false, message: "Kullanıcı adı alınmış." }); }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await UserModel.findOne({ username });
        if (!user) return res.status(400).json({ success: false, message: "Kullanıcı bulunamadı!" });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ success: false, message: "Şifre hatalı!" });
        const token = jwt.sign({ id: user._id, username: user.username }, "GIZLI_KELIME", { expiresIn: "1h" });
        res.json({ success: true, message: "Giriş başarılı!", token: token, username: user.username, isAdmin: user.isAdmin });
    } catch (error) { res.status(500).json({ success: false, message: "Hata." }); }
});

// --- VAKA EKLEME (GÜNCELLENDİ) ---
app.post('/admin/add-case', upload.single('vakaResmi'), async (req, res) => {
    const resimYolu = req.file ? '/uploads/' + req.file.filename : null;
    // YENİ: yas ve cinsiyet verilerini al
    const { baslik, yas, cinsiyet, gizliTani, icerik, zorluk } = req.body;

    try {
        const sonVaka = await VakaModel.findOne().sort({ vakaNo: -1 });
        let yeniVakaNo = 101; 
        if (sonVaka) yeniVakaNo = sonVaka.vakaNo + 1;

        const yeniVaka = new VakaModel({
            vakaNo: yeniVakaNo,
            baslik, 
            yas,        // KAYDET
            cinsiyet,   // KAYDET
            gizliTani, 
            icerik, 
            zorluk,
            resimUrl: resimYolu
        });

        await yeniVaka.save();
        res.json({ success: true, message: `Vaka ${yeniVakaNo} eklendi!` });
    } catch (error) { res.status(500).json({ success: false, message: "Hata oluştu." }); }
});

app.delete('/admin/delete-case/:no', async (req, res) => {
    try {
        const silinen = await VakaModel.findOneAndDelete({ vakaNo: req.params.no });
        if (silinen) res.json({ success: true, message: "Silindi." });
        else res.status(404).json({ success: false, message: "Bulunamadı." });
    } catch (error) { res.status(500).json({ success: false, message: "Hata." }); }
});

app.get('/cases', async (req, res) => {
    try {
        const vakalar = await VakaModel.find().select('-gizliTani');
        res.json(vakalar);
    } catch (error) { res.status(500).json({ error: "Hata." }); }
});

app.post('/submit-report', verifyToken, async (req, res) => {
    const { rapor, vakaID } = req.body;
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
            DOĞRU TANI: ${vaka.gizliTani}
            ÖĞRENCİ RAPORU: "${rapor}"
            ZORLUK: ${vaka.zorluk}

            PUANLAMA:
            - Tanı + Testler + Beklenen Bulgular varsa yüksek puan ver.
            - Sadece tanı yazarsa en fazla 40 ver.
            
            ÇIKTI (SADECE JSON): { "puan": (0-100), "yorum": "Kısa geri bildirim" }
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        let aiResult = { puan: 50, yorum: "Analiz edilemedi." };
        try {
            const jsonBas = text.indexOf('{');
            const jsonSon = text.lastIndexOf('}');
            if (jsonBas !== -1 && jsonSon !== -1) {
                aiResult = JSON.parse(text.substring(jsonBas, jsonSon + 1));
            }
        } catch (e) { console.error("JSON Hatası"); }

        let carpan = 1;
        if (vaka.zorluk === 'Orta') carpan = 1.25;
        if (vaka.zorluk === 'Zor') carpan = 1.5;
        let finalPuan = Math.round(aiResult.puan * carpan);

        const yeniRapor = new RaporModel({
            raporMetni: rapor,
            alinanPuan: finalPuan,
            aiYorumu: aiResult.yorum,
            kullaniciAdi: raporuGonderen,
            vakaID: vakaID
        });
        await yeniRapor.save();

        res.json({ success: true, message: aiResult.yorum, puan: finalPuan });

    } catch (error) { res.status(500).json({ success: false, message: "AI Hatası." }); }
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

// --- GERİ BİLDİRİM GÖNDER (ÖĞRENCİ) ---
app.post('/submit-feedback', verifyToken, async (req, res) => {
    try {
        const { mesaj } = req.body;
        if(!mesaj.trim()) return res.json({ success: false, message: "Boş mesaj gönderilemez." });

        const yeniFeedback = new FeedbackModel({
            kullaniciAdi: req.user.username,
            mesaj: mesaj
        });
        await yeniFeedback.save();
        res.json({ success: true, message: "Geri bildiriminiz iletildi. Teşekkürler!" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Sunucu hatası." });
    }
});

// --- GERİ BİLDİRİMLERİ OKU (ADMİN) ---
app.get('/admin/feedbacks', async (req, res) => {
    try {
        // En yeniden eskiye sırala
        const feedbacks = await FeedbackModel.find().sort({ tarih: -1 });
        res.json(feedbacks);
    } catch (error) {
        res.status(500).json({ error: "Veri çekilemedi." });
    }
});

app.put('/admin/toggle-feedback/:id', async (req, res) => {
    try {
        const feedback = await FeedbackModel.findById(req.params.id);
        if (!feedback) return res.status(404).json({ success: false, message: "Bulunamadı" });

        // Durumu tersine çevir (True ise False, False ise True yap)
        feedback.okundu = !feedback.okundu;
        await feedback.save();

        res.json({ success: true, yeniDurum: feedback.okundu });
    } catch (error) {
        res.status(500).json({ success: false, message: "Hata." });
    }
});

// --- GERİ BİLDİRİM SİL (ADMİN) ---
app.delete('/admin/delete-feedback/:id', async (req, res) => {
    try {
        const silinen = await FeedbackModel.findByIdAndDelete(req.params.id);
        if (silinen) {
            res.json({ success: true, message: "Mesaj silindi." });
        } else {
            res.status(404).json({ success: false, message: "Mesaj bulunamadı." });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "Hata." });
    }
});

app.listen(port, () => { console.log(`🚀 Sunucu çalışıyor: http://localhost:${port}`); });