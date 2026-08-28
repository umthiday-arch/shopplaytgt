const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// 1. Kết nối Database MongoDB Atlas để sao lưu tài khoản người dùng
// (Thay chuỗi kết nối của bạn vào đây khi đăng ký MongoDB Atlas miễn phí)
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/shopgame";
mongoose.connect(MONGO_URI).then(() => console.log('Đã kết nối Database an toàn')).catch(err => console.log('Dùng lưu trữ tạm thời...'));

// Schema lưu tài khoản người dùng
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  balance: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.models.User || mongoose.model('User', userSchema);

// Dữ liệu mẫu Acc Game có Hình ảnh & Phân loại
let accounts = [
  { id: 101, category: "PlayTogether", title: "Acc PlayTogether VIP - Có Cánh & Xe Rồng", price: 150000, img: "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=500", status: "Sẵn có" },
  { id: 102, category: "PlayTogether", title: "Acc Sơ Sinh - 100K Kẹo Rồng", price: 20000, img: "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=500", status: "Sẵn có" },
  { id: 103, category: "LienQuan", title: "Acc Liên Quân Full Tướng - 120 Skin VIP", price: 250000, img: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=500", status: "Sẵn có" },
  { id: 104, category: "FreeFire", title: "Acc Free Fire Quỷ Dạ Xoa - Full Keo", price: 80000, img: "https://images.unsplash.com/photo-1560253023-3ec5d502959f?w=500", status: "Đã bán" }
];

// API Đăng ký tài khoản
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();
    res.json({ success: true, message: "Đăng ký thành công!" });
  } catch (err) {
    res.status(400).json({ success: false, message: "Tên tài khoản đã tồn tại!" });
  }
});

// API Lấy danh sách tài khoản game
app.get('/api/accounts', (req, res) => res.json(accounts));

// Giao diện Web Chuyên Nghiệp (Tailwind CSS)
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>SHOP ACC GAME VIP - TỰ ĐỘNG 24/7</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-900 text-white font-sans">
      <!-- Header / Thanh Điều Hướng -->
      <nav class="bg-slate-800 border-b border-slate-700 p-4 sticky top-0 z-50">
        <div class="max-w-6xl mx-auto flex justify-between items-center">
          <h1 class="text-2xl font-bold text-yellow-400">🎮 SHOPPLAYTGT</h1>
          <div class="space-x-4">
            <button onclick="openModal('login')" class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-semibold text-sm transition">Đăng Nhập</button>
            <button onclick="openModal('register')" class="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg font-semibold text-sm transition">Đăng Ký</button>
          </div>
        </div>
      </nav>

      <!-- Banner Giới Thiệu -->
      <header class="text-center py-12 bg-gradient-to-r from-purple-900 to-indigo-900">
        <h2 class="text-4xl font-extrabold text-white mb-2">HỆ THỐNG BÁN ACC GAME GIÁ RẺ</h2>
        <p class="text-slate-300">Giao dịch tự động - Uy tín 100% - Bảo hành trọn đời</p>
      </header>

      <!-- Danh Mục & Danh Sách Sản Phẩm -->
      <main class="max-w-6xl mx-auto p-6">
        <div class="flex space-x-2 mb-8 overflow-x-auto pb-2">
          <button onclick="filterGame('All')" class="bg-yellow-500 text-slate-900 font-bold px-5 py-2 rounded-full">Tất Cả Game</button>
          <button onclick="filterGame('PlayTogether')" class="bg-slate-800 hover:bg-slate-700 px-5 py-2 rounded-full border border-slate-700">PlayTogether</button>
          <button onclick="filterGame('LienQuan')" class="bg-slate-800 hover:bg-slate-700 px-5 py-2 rounded-full border border-slate-700">Liên Quân</button>
          <button onclick="filterGame('FreeFire')" class="bg-slate-800 hover:bg-slate-700 px-5 py-2 rounded-full border border-slate-700">Free Fire</button>
        </div>

        <div id="shop-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"></div>
      </main>

      <!-- Modal Đăng Ký / Đăng Nhập -->
      <div id="auth-modal" class="hidden fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
        <div class="bg-slate-800 p-6 rounded-xl w-full max-w-md relative border border-slate-700">
          <button onclick="closeModal()" class="absolute top-3 right-4 text-slate-400 text-xl">&times;</button>
          <h3 id="modal-title" class="text-xl font-bold mb-4 text-yellow-400 text-center">Đăng Ký Tài Khoản</h3>
          <input type="text" id="username" placeholder="Tên tài khoản" class="w-full p-3 mb-3 bg-slate-900 border border-slate-700 rounded-lg text-white">
          <input type="password" id="password" placeholder="Mật khẩu" class="w-full p-3 mb-4 bg-slate-900 border border-slate-700 rounded-lg text-white">
          <button onclick="submitAuth()" class="w-full bg-yellow-500 hover:bg-yellow-600 text-slate-900 font-bold p-3 rounded-lg">Xác Nhận</button>
        </div>
      </div>

      <script>
        let allAccounts = [];
        fetch('/api/accounts').then(r => r.json()).then(data => { allAccounts = data; renderShop(data); });

        function renderShop(list) {
          document.getElementById('shop-grid').innerHTML = list.map(acc => \`
            <div class="bg-slate-800 rounded-xl overflow-hidden border border-slate-700 hover:border-yellow-500 transition shadow-lg">
              <img src="\${acc.img}" class="w-full h-44 object-cover">
              <div class="p-4">
                <span class="text-xs bg-indigo-900 text-indigo-300 font-semibold px-2 py-1 rounded">\${acc.category}</span>
                <h4 class="font-bold my-2 text-sm text-slate-100 line-clamp-2">\${acc.title}</h4>
                <div class="flex justify-between items-center mt-4">
                  <span class="text-red-400 font-extrabold text-lg">\${acc.price.toLocaleString()}đ</span>
                  <button class="px-3 py-1.5 rounded-lg font-bold text-xs \${acc.status === 'Đã bán' ? 'bg-slate-700 text-slate-400' : 'bg-yellow-500 hover:bg-yellow-600 text-slate-900'}" \${acc.status === 'Đã bán' ? 'disabled' : ''}>
                    \${acc.status === 'Đã bán' ? 'ĐÃ BÁN' : 'MUA NGAY'}
                  </button>
                </div>
              </div>
            </div>
          \`).join('');
        }

        function filterGame(cat) {
          if (cat === 'All') renderShop(allAccounts);
          else renderShop(allAccounts.filter(a => a.category === cat));
        }

        function openModal(type) {
          document.getElementById('auth-modal').classList.remove('hidden');
          document.getElementById('modal-title').innerText = type === 'login' ? 'Đăng Nhập Shop' : 'Đăng Ký Tài Khoản';
        }
        function closeModal() { document.getElementById('auth-modal').classList.add('hidden'); }

        async function submitAuth() {
          const u = document.getElementById('username').value;
          const p = document.getElementById('password').value;
          const res = await fetch('/api/register', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ username: u, password: p })
          });
          const data = await res.json();
          alert(data.message);
          if (data.success) closeModal();
        }
      </script>
    </body>
    </html>
  `);
});

app.listen(PORT, () => console.log(`Server chạy tại port ${PORT}`));
