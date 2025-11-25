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
const { type } = require('os');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

const app = express();
const port = 3000;

// 2. MIDDLEWARE (ARA YAZILIMLAR)
app.use(express.json());
app.use(cors());
app.use(express.static('.')); // Mevcut klasördeki dosyaları sun
app.use('/uploads', express.static('uploads')); // Resim klasörünü aç

// Uploads klasörü yoksa oluştur
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}

// 3. MULTER (RESİM YÜKLEME) AYARLARI
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/') 
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// 4. MONGODB BAĞLANTISI
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB veritabanına bağlandı.'))
  .catch((err) => console.error('❌ MongoDB Hatası:', err));

// 5. ŞEMALAR (VERİTABANI PLANLARI)

// Kullanıcı Şeması
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isAdmin: { type: Boolean, default: false } // Admin yetkisi
});
const UserModel = mongoose.models.User || mongoose.model("User", UserSchema);

// Vaka Şeması
const VakaSchema = new mongoose.Schema({
    vakaNo: { type: Number, unique: true },
    baslik: { type: String, required: true },
    gizliTani: { type: String },
    icerik: { type: String, required: true },
    zorluk: { type: String, enum: ['Kolay', 'Orta', 'Zor'], default: 'Orta' },
    resimUrl: { type: String },
    yas: {type: Number},
    cinsiyet: {type: String},
    sikayet: {type: String}
});
const VakaModel = mongoose.models.Vaka || mongoose.model("Vaka", VakaSchema);

// Rapor Şeması
const RaporSchema = new mongoose.Schema({
    raporMetni: { type: String, required: true },
    alinanPuan: { type: Number, default: 0 },
    aiYorumu: { type: String },
    kullaniciAdi: { type: String },
    vakaID: { type: Number },
    olusturulmaTarihi: { type: Date, default: Date.now }
});
const RaporModel = mongoose.models.Rapor || mongoose.model("Rapor", RaporSchema);

// 6. GÜVENLİK (TOKEN KONTROL) FONKSİYONU
const verifyToken = (req, res, next) => {
    const token = req.headers["authorization"];
    if (!token) return res.status(403).json({ success: false, message: "Giriş yapmanız gerekiyor!" });

    try {
        const decoded = jwt.verify(token, "GIZLI_KELIME");
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: "Geçersiz Token!" });
    }
};

// ================= ROTALAR (API) =================

// --- HTML SAYFALARINI SUNMA ---
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/register.html', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/profil.html', (req, res) => res.sendFile(path.join(__dirname, 'profil.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// --- KAYIT OL ---
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    
    // İsmi Türkçe karakterlere uygun küçült ve kenar boşluklarını sil
    const cleanUsername = username.toLocaleLowerCase('tr-TR').trim();

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // cleanUsername olarak kaydediyoruz
        const newUser = new UserModel({ 
            username: cleanUsername, 
            password: hashedPassword 
        });
        
        await newUser.save();
        res.json({ success: true, message: "Kayıt başarılı!" });
    } catch (error) {
        res.json({ success: false, message: "Bu isimle zaten bir kayıt var." });
    }
});

// --- GİRİŞ YAP ---
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    // Giriş yaparken de yazılanı küçültüp öyle arıyoruz
    const cleanUsername = username.toLocaleLowerCase('tr-TR').trim();

    try {
        const user = await UserModel.findOne({ username: cleanUsername });
        
        if (!user) return res.status(400).json({ success: false, message: "Kullanıcı bulunamadı!" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ success: false, message: "Şifre hatalı!" });

        const token = jwt.sign({ id: user._id, username: user.username }, "GIZLI_KELIME", { expiresIn: "1h" });

        res.json({ 
            success: true, 
            message: "Giriş başarılı!", 
            token: token, 
            username: user.username, // Front-end'e küçük harfli gidecek ama CSS düzeltecek
            isAdmin: user.isAdmin 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Sunucu hatası." });
    }
});

// --- VAKA EKLEME (ADMİN) ---
// --- VAKA EKLEME (GÜNCELLENMİŞ - HATA AYIKLAMALI) ---
app.post('/admin/add-case', upload.single('vakaResmi'), async (req, res) => {
    
    // Resim yolunu al
    const resimYolu = req.file ? '/uploads/' + req.file.filename : null;
    
    // Formdan gelen verileri al
    const { yas, cinsiyet, sikayet, gizliTani, icerik, zorluk } = req.body;

    console.log("Gelen Veriler:", req.body); // Terminale yazdırıp kontrol et

    try {
        // En son vaka numarasını bul
        const sonVaka = await VakaModel.findOne().sort({ vakaNo: -1 });
        let yeniVakaNo = 101; 
        if (sonVaka) yeniVakaNo = sonVaka.vakaNo + 1;

        // Başlığı otomatik oluştur
        const baslikMetni = `${yas || '?'} Yaş, ${cinsiyet || '?'} - ${sikayet || 'Belirtilmedi'}`;

        const yeniVaka = new VakaModel({
            vakaNo: yeniVakaNo,
            yas: yas,
            cinsiyet: cinsiyet,
            sikayet: sikayet,
            baslik: baslikMetni,
            gizliTani: gizliTani,
            icerik: icerik,
            zorluk: zorluk,
            resimUrl: resimYolu
        });

        await yeniVaka.save();
        res.json({ success: true, message: `Vaka ${yeniVakaNo} eklendi!` });

    } catch (error) {
        console.error("Vaka Ekleme Hatası:", error); // Hatayı terminale bas
        res.status(500).json({ success: false, message: "Sunucu Hatası: " + error.message });
    }
});

// --- VAKA SİLME (ADMİN) ---
app.delete('/admin/delete-case/:no', async (req, res) => {
    try {
        const silinen = await VakaModel.findOneAndDelete({ vakaNo: req.params.no });
        if (silinen) res.json({ success: true, message: "Silindi." });
        else res.status(404).json({ success: false, message: "Bulunamadı." });
    } catch (error) {
        res.status(500).json({ success: false, message: "Hata." });
    }
});

// --- VAKALARI LİSTELEME ---
app.get('/cases', async (req, res) => {
    try {
        const vakalar = await VakaModel.find().select('-gizliTani');
        res.json(vakalar);
    } catch (error) {
        res.status(500).json({ error: "Hata." });
    }
});

// --- RAPOR GÖNDERME & GEMINI ---
// --- RAPOR GÖNDERME & GEMINI (GÜÇLENDİRİLMİŞ VERSİYON) ---
app.post('/submit-report', verifyToken, async (req, res) => {
    const { rapor, vakaID } = req.body;
    const raporuGonderen = req.user.username;

    try {
        // 1. KONTROL: Daha önce çözdü mü?
        const eskiRapor = await RaporModel.findOne({ kullaniciAdi: raporuGonderen, vakaID: vakaID });
        if (eskiRapor) {
            return res.json({ success: false, message: "Bu vakayı daha önce çözdünüz!" });
        }

        const vaka = await VakaModel.findOne({ vakaNo: vakaID });
        if (!vaka) return res.status(404).json({ success: false, message: "Vaka bulunamadı!" });

        // 2. GEMINI PROMPT (Daha Kesin Emirler)
        const prompt = `
            Sen Odyoloji Profesörüsün. Öğrenci sınav kağıdını okuyorsun.
            
            VAKA BİLGİSİ: ${vaka.baslik} - ${vaka.icerik}
            DOĞRU TANI: ${vaka.gizliTani}
            ÖĞRENCİ CEVABI: "${rapor}"
            ZORLUK: ${vaka.zorluk}

            GÖREVİN:
            Öğrencinin cevabını doğru tanı ile karşılaştır.
            
            ÇIKTI FORMATI:
            Sadece ve sadece geçerli bir JSON objesi döndür. Başka hiçbir kelime, açıklama veya markdown işareti kullanma.
            Format tam olarak şöyle olmalı:
            { "puan": 0-100 arası sayı, "yorum": "kısa eğitici geri bildirim" }
        `;

        console.log("🤖 Gemini'ye gönderiliyor...");

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        console.log("📩 Gemini Cevabı:", text); // Terminalde cevabı gör

        // 3. AKILLI JSON TEMİZLEME (Kurşun Geçirmez Kısım)
        let aiResult;
        try {
            // Cevabın içindeki ilk '{' ve son '}' işaretini bulup arasını alıyoruz
            const jsonBaslangic = text.indexOf('{');
            const jsonBitis = text.lastIndexOf('}');
            
            if (jsonBaslangic !== -1 && jsonBitis !== -1) {
                const temizJsonString = text.substring(jsonBaslangic, jsonBitis + 1);
                aiResult = JSON.parse(temizJsonString);
            } else {
                throw new Error("JSON parantezleri bulunamadı");
            }
        } catch (e) { 
            console.error("⚠️ JSON Parse Hatası! Gemini saçmaladı, manuel moda geçiliyor.");
            // Eğer AI bozuk cevap verirse sistem çökmesin, varsayılan puan verelim
            aiResult = { puan: 50, yorum: "AI analizi yapılamadı (Bağlantı sorunu), ancak raporunuz kaydedildi." };
        }

        // 4. ZORLUK ÇARPANI
        let carpan = 1;
        if (vaka.zorluk === 'Orta') carpan = 1.25;
        if (vaka.zorluk === 'Zor') carpan = 1.5;
        let finalPuan = Math.round(aiResult.puan * carpan);

        // 5. KAYDET
        const yeniRapor = new RaporModel({
            raporMetni: rapor,
            alinanPuan: finalPuan,
            aiYorumu: aiResult.yorum,
            kullaniciAdi: raporuGonderen,
            vakaID: vakaID
        });
        await yeniRapor.save();

        res.json({ success: true, message: aiResult.yorum, puan: finalPuan });

    } catch (error) {
        console.error("❌ KRİTİK HATA:", error); // Terminalde hatayı oku!
        
        // Hata API Key kaynaklıysa kullanıcıya söyle
        if(error.message.includes("API key")) {
            res.status(500).json({ success: false, message: "Sistem Hatası: API Anahtarı Geçersiz." });
        } else {
            res.status(500).json({ success: false, message: "Yapay zeka servisine ulaşılamadı." });
        }
    }
});

// --- LİDERLİK TABLOSU ---
app.get('/leaderboard', async (req, res) => {
    try {
        const siralama = await RaporModel.aggregate([
            { $group: { _id: "$kullaniciAdi", toplamPuan: { $sum: "$alinanPuan" }, cozulenVakaSayisi: { $sum: 1 } } },
            { $sort: { toplamPuan: -1 } },
            { $limit: 10 }
        ]);
        res.json(siralama);
    } catch (error) { res.status(500).json({ error: "Hata." }); }
});

// --- ÖĞRENCİ PROFİLİ ---
app.get('/my-reports', verifyToken, async (req, res) => {
    try {
        const raporlar = await RaporModel.find({ kullaniciAdi: req.user.username }).sort({ olusturulmaTarihi: -1 });
        res.json(raporlar);
    } catch (error) { res.status(500).json({ error: "Hata." }); }
});

// SUNUCUYU BAŞLAT
app.listen(port, () => {
    console.log(`🚀 Sunucu çalışıyor: http://localhost:${port}`);
    console.log(`👉 Giriş Sayfası: http://localhost:${port}/login.html`);
});