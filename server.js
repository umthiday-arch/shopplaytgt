const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Khóa bí mật JWT (Mã hóa token)
const JWT_SECRET = process.env.JWT_SECRET || "shopplaytgt_super_secret_key_2026";

// Kết nối Database
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/shopgame";
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Đã kết nối MongoDB thành công!'))
  .catch(err => console.error('❌ Lỗi kết nối MongoDB:', err));

// 1. Schemas (Mô hình dữ liệu)
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  balance: { type: Number, default: 0 },
  role: { type: String, default: 'user' }
});

const AccountSchema = new mongoose.Schema({
  title: { type: String, required: true },
  category: { type: String, required: true }, 
  price: { type: Number, required: true },
  accUser: { type: String, required: true }, 
  accPass: { type: String, required: true }, 
  image: { type: String, default: 'https://via.placeholder.com/300x180?text=Acc+Game' },
  status: { type: String, default: 'available' }, 
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  soldAt: { type: Date, default: null }
});

const DepositSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const GameAccount = mongoose.model('GameAccount', AccountSchema);
const Deposit = mongoose.model('Deposit', DepositSchema);

// Middleware xác thực Token (Bảo mật tuyệt đối)
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ success: false, message: 'Chưa cung cấp Token xác thực!' });
  
  const token = authHeader.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn!' });
    req.user = decoded; // Lưu thông tin user đã giải mã vào request
    next();
  });
}

// 2. API Đăng Ký & Đăng Nhập
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ thông tin!' });

    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ success: false, message: 'Tên tài khoản đã tồn tại!' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword, balance: 100000, role: 'user' });

    await newUser.save();
    res.json({ success: true, message: 'Đăng ký thành công! Đã nhận 100.000đ trải nghiệm.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi máy chủ!' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ success: false, message: 'Tài khoản không tồn tại!' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ success: false, message: 'Mật khẩu không chính xác!' });

    // Tạo Token có thời hạn 1 ngày
    const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '1d' });

    res.json({
      success: true,
      token,
      user: { id: user._id, username: user.username, balance: user.balance, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi đăng nhập!' });
  }
});

// API Lấy thông tin mới nhất của User (Đồng bộ chống F12 giả mạo)
app.get('/api/user/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id, '-password');
    if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng!' });
    res.json({ success: true, user: { id: user._id, username: user.username, balance: user.balance, role: user.role } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi máy chủ!' });
  }
});

// 3. API Quản Lý Acc, Mua Bán & Nạp Tiền
app.get('/api/accounts', async (req, res) => {
  try {
    const accounts = await GameAccount.find({}, '-accUser -accPass');
    res.json(accounts);
  } catch (err) {
    res.status(500).send('Lỗi lấy danh sách Acc');
  }
});

app.post('/api/buy', verifyToken, async (req, res) => {
  try {
    const { accId } = req.body;
    const user = await User.findById(req.user.id);
    const account = await GameAccount.findById(accId);

    if (!account || account.status === 'sold') {
      return res.status(400).json({ success: false, message: 'Acc này đã được bán hoặc không tồn tại!' });
    }
    if (user.balance < account.price) {
      return res.status(400).json({ success: false, message: 'Số dư không đủ! Vui lòng nạp thêm.' });
    }

    user.balance -= account.price;
    account.status = 'sold';
    account.buyer = user._id;
    account.soldAt = new Date();

    await user.save();
    await account.save();

    res.json({
      success: true,
      message: 'Mua thành công!',
      accUser: account.accUser,
      accPass: account.accPass,
      newBalance: user.balance
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Giao dịch thất bại!' });
  }
});

app.post('/api/deposit', verifyToken, async (req, res) => {
  try {
    const { amount } = req.body;
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) return res.status(400).json({ success: false, message: 'Số tiền không hợp lệ!' });

    const user = await User.findById(req.user.id);
    if (user) {
      user.balance += numAmount;
      await user.save();
      await new Deposit({ userId: user._id, amount: numAmount }).save();
      res.json({ success: true, newBalance: user.balance });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi nạp tiền!' });
  }
});

// 4. API Hồ Sơ Cá Nhân & Đổi Mật Khẩu
app.get('/api/user/profile', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id, '-password');
    if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng!' });

    const purchases = await GameAccount.find({ buyer: req.user.id }).sort({ soldAt: -1 });
    const deposits = await Deposit.find({ userId: req.user.id }).sort({ createdAt: -1 });

    res.json({ success: true, user, purchases, deposits });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi tải hồ sơ!' });
  }
});

app.post('/api/user/change-password', verifyToken, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ success: false, message: 'Vui lòng điền đủ thông tin!' });

    const user = await User.findById(req.user.id);
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) return res.status(400).json({ success: false, message: 'Mật khẩu cũ không chính xác!' });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ success: true, message: 'Đổi mật khẩu thành công!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi đổi mật khẩu!' });
  }
});

app.post('/api/admin/add-account', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Không có quyền Admin!' });
    }

    const { title, category, price, accUser, accPass, image } = req.body;
    const newAcc = new GameAccount({ title, category, price, accUser, accPass, image });
    await newAcc.save();
    res.json({ success: true, message: 'Đã thêm Acc game mới thành công!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi thêm Acc!' });
  }
});

// 5. Giao diện Web
app.get('/', (req, res) => {
  res.send(`
  <!DOCTYPE html>
  <html lang="vi">
  <head>
    <meta charset="UTF-8">
    <title>SHOP GAME PLAYTOGETHER & VIP ACC</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      * { box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; }
      
      /* 1. ĐỔI HÌNH NỀN TOÀN WEB TẠI ĐÂY */
      body { 
        background-color: #0f172a; 
        /* Link ảnh nền (bạn có thể thay link ảnh Play Together của bạn vào giữa 2 dấu ngoặc đơn) */
        background-image: url('https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2070&auto=format&fit=crop'); 
        background-size: cover;
        background-attachment: fixed;
        background-position: center;
        color: #f8fafc; 
      }

      /* 2. HIỆU ỨNG KÍNH MỜ (GLASSMORPHISM) CHO THANH MENU VÀ THẺ ACC */
      header { 
        background: rgba(30, 41, 59, 0.85); /* Trong suốt 85% */
        backdrop-filter: blur(12px); /* Làm mờ cảnh phía sau */
        padding: 15px 5%; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #38bdf8; flex-wrap: wrap; gap: 10px; 
        position: sticky; top: 0; z-index: 50;
      }
      .card { 
        background: rgba(30, 41, 59, 0.85); 
        backdrop-filter: blur(10px); 
        border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); 
        box-shadow: 0 10px 30px rgba(0,0,0,0.5); transition: 0.3s; 
      }
      
      /* 3. HIỆU ỨNG 3D VÀ PHÁT SÁNG KHI DI CHUỘT (HOVER) */
      .card:hover { transform: translateY(-10px); border-color: #38bdf8; box-shadow: 0 15px 40px rgba(56,189,248,0.4); }
      .logo { font-size: 24px; font-weight: 900; color: #fff; text-shadow: 0 0 10px #38bdf8, 0 0 20px #38bdf8; }
      
      /* 4. LÀM ĐẸP NÚT BẤM VỚI MÀU GRADIENT (CHUYỂN MÀU) */
      .btn { background: linear-gradient(45deg, #2563eb, #38bdf8); color: white; border: none; padding: 10px 18px; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 14px; transition: 0.3s; box-shadow: 0 4px 15px rgba(37,99,235,0.4); }
      .btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(56,189,248,0.6); }
      .btn-admin { background: linear-gradient(45deg, #d97706, #f59e0b); box-shadow: 0 4px 15px rgba(217,119,6,0.4); }
      .btn-profile { background: linear-gradient(45deg, #7c3aed, #a78bfa); box-shadow: 0 4px 15px rgba(124,58,237,0.4); }
      .btn-danger { background: linear-gradient(45deg, #e11d48, #fb7185); box-shadow: 0 4px 15px rgba(225,29,72,0.4); }
      .cat-btn { background: rgba(51, 65, 85, 0.8); backdrop-filter: blur(5px); color: white; padding: 12px 25px; border-radius: 30px; border: 1px solid #475569; cursor: pointer; transition: 0.3s; font-weight: 600;}
      .cat-btn:hover { background: #38bdf8; color: #0f172a; transform: scale(1.05); }
      .cat-btn.active { background: #38bdf8; color: #0f172a; box-shadow: 0 0 15px #38bdf8; border: none; }
      
      /* CÁC THÀNH PHẦN KHÁC (Giữ nguyên cấu trúc, thêm hiệu ứng) */
      .user-info { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .badge-admin { background: #f59e0b; color: #000; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 12px; }
      .btn-sm { padding: 5px 10px; font-size: 12px; }
      .container { max-width: 1200px; margin: 30px auto; padding: 0 15px; }
      .categories { display: flex; gap: 12px; margin-bottom: 30px; flex-wrap: wrap; justify-content: center;}
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 25px; }
      .card img { width: 100%; height: 180px; object-fit: cover; border-bottom: 2px solid #334155; }
      .card-body { padding: 20px; }
      .price { color: #4ade80; font-size: 22px; font-weight: 900; margin: 12px 0; text-shadow: 0 0 10px rgba(74,222,128,0.5); }
      .status { display: inline-block; padding: 5px 10px; border-radius: 6px; font-size: 11px; font-weight: bold; margin-bottom: 10px; letter-spacing: 1px;}
      .status-available { background: rgba(22, 101, 52, 0.8); color: #86efac; border: 1px solid #4ade80; }
      
      /* Bảng Modal (Bảng Đăng nhập / Hồ sơ) */
      .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.9); backdrop-filter: blur(8px); justify-content: center; align-items: center; z-index: 100; padding: 10px; }
      .modal-content { background: #1e293b; padding: 30px; border-radius: 16px; width: 100%; max-width: 450px; max-height: 90vh; overflow-y: auto; border: 1px solid #38bdf8; box-shadow: 0 0 30px rgba(56,189,248,0.2); }
      .modal-content h3 { margin-bottom: 20px; text-align: center; color: #38bdf8; font-size: 22px; }
      .modal-content input, .modal-content select { width: 100%; padding: 12px; margin: 10px 0; border-radius: 8px; border: 1px solid #475569; background: #0f172a; color: white; transition: 0.3s; }
      .modal-content input:focus { outline: none; border-color: #38bdf8; box-shadow: 0 0 10px rgba(56,189,248,0.5); }
      
      /* Tabs Hồ Sơ */
      .profile-tabs { display: flex; gap: 5px; margin-bottom: 20px; border-bottom: 2px solid #334155; }
      .tab-btn { background: transparent; color: #94a3b8; border: none; padding: 10px 15px; cursor: pointer; font-weight: bold; transition: 0.3s; }
      .tab-btn:hover { color: white; }
      .tab-btn.active { color: #38bdf8; border-bottom: 3px solid #38bdf8; }
      .tab-content { display: none; }
      .tab-content.active { display: block; animation: fadeIn 0.4s; }
      @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      .table-responsive { width: 100%; overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px; }
      th, td { padding: 12px; text-align: left; border-bottom: 1px solid #334155; }
      th { background: rgba(15, 23, 42, 0.5); color: #38bdf8; font-weight: bold; }
      .acc-box { background: rgba(0,0,0,0.3); padding: 10px; border-radius: 6px; font-family: monospace; font-size: 13px; margin-top: 5px; word-break: break-all; border: 1px dashed #475569; }
      .rank-badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 900; background: linear-gradient(45deg, #fbbf24, #d97706); color: #000; box-shadow: 0 0 10px rgba(251,191,36,0.5); }
    </style>
  </head>
  <body>

    <header>
      <div class="logo">🎮 SHOP GAME VIP</div>
      <div class="user-info" id="userArea">
        <button class="btn" onclick="openModal('loginModal')">Đăng Nhập</button>
        <button class="btn" onclick="openModal('registerModal')">Đăng Ký</button>
      </div>
    </header>

    <div class="container">
      <div class="categories">
        <button class="cat-btn active" onclick="filterCat('all')">Tất Cả Acc</button>
        <button class="cat-btn" onclick="filterCat('playtogether')">PlayTogether</button>
        <button class="cat-btn" onclick="filterCat('lienquan')">Liên Quân VIP</button>
        <button class="cat-btn" onclick="filterCat('freefire')">Free Fire</button>
        <button class="cat-btn" onclick="filterCat('random')">Acc Random Giá Rẻ</button>
      </div>

      <div class="grid" id="accountGrid"></div>
    </div>

    <!-- Modals -->
    <div class="modal" id="loginModal">
      <div class="modal-content">
        <h3>Đăng Nhập</h3>
        <input type="text" id="loginUser" placeholder="Tên tài khoản">
        <input type="password" id="loginPass" placeholder="Mật khẩu">
        <button class="btn" style="width:100%" onclick="login()">Xác Nhận</button>
        <button class="btn btn-danger" style="width:100%; margin-top:5px;" onclick="closeModal('loginModal')">Đóng</button>
      </div>
    </div>

    <div class="modal" id="registerModal">
      <div class="modal-content">
        <h3>Đăng Ký Tài Khoản</h3>
        <input type="text" id="regUser" placeholder="Tên tài khoản">
        <input type="password" id="regPass" placeholder="Mật khẩu">
        <button class="btn" style="width:100%" onclick="register()">Tạo Tài Khoản</button>
        <button class="btn btn-danger" style="width:100%; margin-top:5px;" onclick="closeModal('registerModal')">Đóng</button>
      </div>
    </div>

    <div class="modal" id="profileModal">
      <div class="modal-content" style="max-width: 650px;">
        <h3>Hồ Sơ Cá Nhân</h3>
        <div class="profile-tabs">
          <button class="tab-btn active" onclick="switchTab('tabOverview', this)">Thông Tin</button>
          <button class="tab-btn" onclick="switchTab('tabPurchases', this)">Lịch Sử Mua Acc</button>
          <button class="tab-btn" onclick="switchTab('tabDeposits', this)">Lịch Sử Nạp Tiền</button>
        </div>

        <div class="tab-content active" id="tabOverview">
          <div id="profileOverview" style="line-height: 1.8; margin-bottom: 15px;"></div>
          <hr style="border-color: #334155; margin: 15px 0;">
          <h4>🔑 Đổi Mật Khẩu</h4>
          <input type="password" id="oldPass" placeholder="Mật khẩu hiện tại">
          <input type="password" id="newPass" placeholder="Mật khẩu mới">
          <button class="btn" style="width:100%; margin-top: 5px;" onclick="changePassword()">Cập Nhật Mật Khẩu</button>
        </div>

        <div class="tab-content" id="tabPurchases">
          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Acc đã mua</th>
                  <th>Giá</th>
                  <th>Thông tin bàn giao</th>
                  <th>Ngày mua</th>
                </tr>
              </thead>
              <tbody id="purchaseTableBody"></tbody>
            </table>
          </div>
        </div>

        <div class="tab-content" id="tabDeposits">
          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Số tiền</th>
                  <th>Trạng thái</th>
                  <th>Thời gian</th>
                </tr>
              </thead>
              <tbody id="depositTableBody"></tbody>
            </table>
          </div>
        </div>

        <button class="btn btn-danger" style="width:100%; margin-top:15px;" onclick="closeModal('profileModal')">Đóng</button>
      </div>
    </div>

    <div class="modal" id="adminModal">
      <div class="modal-content">
        <h3>Đăng Bán Acc Game Mới (ADMIN)</h3>
        <input type="text" id="accTitle" placeholder="Tiêu đề (VD: Acc PlayTogether Full Nhà)">
        <select id="accCat">
          <option value="playtogether">PlayTogether</option>
          <option value="lienquan">Liên Quân VIP</option>
          <option value="freefire">Free Fire</option>
          <option value="random">Acc Random</option>
        </select>
        <input type="number" id="accPrice" placeholder="Giá bán (VNĐ)">
        <input type="text" id="accGameUser" placeholder="Tài khoản game bàn giao">
        <input type="text" id="accGamePass" placeholder="Mật khẩu game bàn giao">
        <input type="text" id="accImage" placeholder="Link ảnh minh họa">
        <button class="btn btn-admin" style="width:100%" onclick="addAccount()">Đăng Lên Shop</button>
        <button class="btn btn-danger" style="width:100%; margin-top:5px;" onclick="closeModal('adminModal')">Đóng</button>
      </div>
    </div>

    <script>
      let token = localStorage.getItem('token') || null;
      let currentUser = null;
      let allAccounts = [];

      async function checkAuth() {
        if (!token) {
          currentUser = null;
          updateHeader();
          return;
        }
        try {
          const res = await fetch('/api/user/me', {
            headers: { 'Authorization': \`Bearer \${token}\` }
          });
          const data = await res.json();
          if (data.success) {
            currentUser = data.user;
          } else {
            logout();
          }
        } catch (e) {
          logout();
        }
        updateHeader();
      }

      function updateHeader() {
        const userArea = document.getElementById('userArea');
        if (currentUser) {
          const isAdmin = currentUser.role === 'admin';
          userArea.innerHTML = \`
            <span>👤 <b>\${currentUser.username}</b> \${isAdmin ? '<span class="badge-admin">ADMIN</span>' : ''} | Số dư: <b style="color:#4ade80">\${currentUser.balance.toLocaleString()}đ</b></span>
            <button class="btn btn-profile" onclick="openProfile()">👤 Hồ Sơ</button>
            <button class="btn" onclick="depositMoney()">+ Nạp Tiền</button>
            \${isAdmin ? '<button class="btn btn-admin" onclick="openModal(\\'adminModal\\')">+ Đăng Acc</button>' : ''}
            <button class="btn btn-danger" onclick="logout()">Đăng Xuất</button>
          \`;
        } else {
          userArea.innerHTML = \`
            <button class="btn" onclick="openModal('loginModal')">Đăng Nhập</button>
            <button class="btn" onclick="openModal('registerModal')">Đăng Ký</button>
          \`;
        }
      }

      async function fetchAccounts() {
        const res = await fetch('/api/accounts');
        allAccounts = await res.json();
        renderAccounts('all');
      }

      function renderAccounts(category) {
        const grid = document.getElementById('accountGrid');
        grid.innerHTML = '';
        const availableAccounts = allAccounts.filter(a => a.status !== 'sold');
        const filtered = category === 'all' ? availableAccounts : availableAccounts.filter(a => a.category === category);

        if(filtered.length === 0) {
          grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #94a3b8; padding: 40px 0;">Hiện chưa có Acc nào khả dụng trong danh mục này.</p>';
          return;
        }

        filtered.forEach(acc => {
          grid.innerHTML += \`
            <div class="card">
              <img src="\${acc.image}" alt="Acc Game">
              <div class="card-body">
                <span class="status status-available">SẴN HÀNG</span>
                <h4>\${acc.title}</h4>
                <div class="price">\${acc.price.toLocaleString()} VNĐ</div>
                <button class="btn" style="width:100%" onclick="buyAccount('\${acc._id}')">Mua Ngay</button>
              </div>
            </div>
          \`;
        });
      }

      function filterCat(cat) {
        document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
        event.target.classList.add('active');
        renderAccounts(cat);
      }

      async function register() {
        const username = document.getElementById('regUser').value;
        const password = document.getElementById('regPass').value;
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        alert(data.message);
        if(data.success) closeModal('registerModal');
      }

      async function login() {
        const username = document.getElementById('loginUser').value;
        const password = document.getElementById('loginPass').value;
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if(data.success) {
          token = data.token;
          currentUser = data.user;
          localStorage.setItem('token', token);
          updateHeader();
          closeModal('loginModal');
        } else {
          alert(data.message);
        }
      }

      function logout() {
        localStorage.removeItem('token');
        token = null;
        currentUser = null;
        updateHeader();
      }

      async function buyAccount(accId) {
        if(!currentUser) return alert('Vui lòng đăng nhập để mua hàng!');
        if(!confirm('Xác nhận mua Acc này?')) return;

        const res = await fetch('/api/buy', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': \`Bearer \${token}\`
          },
          body: JSON.stringify({ accId })
        });
        const data = await res.json();
        if(data.success) {
          alert(\`🎉 MUA THÀNH CÔNG!\\n\\nTài khoản: \${data.accUser}\\nMật khẩu: \${data.accPass}\\n\\n(Bạn có thể xem lại trong mục Hồ Sơ Cá Nhân)\`);
          await checkAuth(); // Đồng bộ lại số dư mới nhất từ server
          fetchAccounts();
        } else {
          alert(data.message);
        }
      }

      async function depositMoney() {
        const amount = prompt('Nhập số tiền muốn nạp giả lập (VNĐ):', '50000');
        if(amount) {
          const res = await fetch('/api/deposit', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': \`Bearer \${token}\`
            },
            body: JSON.stringify({ amount })
          });
          const data = await res.json();
          if(data.success) {
            await checkAuth(); // Đồng bộ lại số dư thật từ server
            alert('Nạp tiền thành công!');
          }
        }
      }

      async function openProfile() {
        if(!currentUser) return;
        openModal('profileModal');
        
        const res = await fetch('/api/user/profile', {
          headers: { 'Authorization': \`Bearer \${token}\` }
        });
        const data = await res.json();

        if(data.success) {
          const { user, purchases, deposits } = data;
          
          const totalDeposited = deposits.reduce((sum, d) => sum + d.amount, 0);
          let rank = 'Thành Viên Mới';
          if(totalDeposited >= 1000000) rank = 'VIP Kim Cương 💎';
          else if(totalDeposited >= 500000) rank = 'VIP Vàng 🥇';
          else if(totalDeposited >= 200000) rank = 'VIP Bạc 🥈';
          else if(totalDeposited >= 100000) rank = 'VIP Đồng 🥉';

          document.getElementById('profileOverview').innerHTML = \`
            <p>Tên tài khoản: <b>\${user.username}</b></p>
            <p>Cấp độ: <span class="rank-badge">\${rank}</span></p>
            <p>Số dư hiện tại: <b style="color:#4ade80">\${user.balance.toLocaleString()} VNĐ</b></p>
            <p>Tổng tiền đã nạp: <b>\${totalDeposited.toLocaleString()} VNĐ</b></p>
            <p>Acc đã mua: <b>\${purchases.length} Acc</b></p>
          \`;

          const purchaseBody = document.getElementById('purchaseTableBody');
          purchaseBody.innerHTML = purchases.length === 0 ? '<tr><td colspan="4" style="text-align:center;">Chưa mua Acc nào</td></tr>' : '';
          purchases.forEach(p => {
            const dateStr = p.soldAt ? new Date(p.soldAt).toLocaleString('vi-VN') : 'Không rõ';
            const accInfoStr = \`TK: \${p.accUser} | MK: \${p.accPass}\`;
            purchaseBody.innerHTML += \`
              <tr>
                <td><b>\${p.title}</b></td>
                <td style="color:#4ade80">\${p.price.toLocaleString()}đ</td>
                <td>
                  <div class="acc-box">\${accInfoStr}</div>
                  <button class="btn btn-sm" style="margin-top:3px;" onclick="copyText('\${accInfoStr}')">📋 Copy</button>
                </td>
                <td>\${dateStr}</td>
              </tr>
            \`;
          });

          const depositBody = document.getElementById('depositTableBody');
          depositBody.innerHTML = deposits.length === 0 ? '<tr><td colspan="3" style="text-align:center;">Chưa có lịch sử nạp</td></tr>' : '';
          deposits.forEach(d => {
            depositBody.innerHTML += \`
              <tr>
                <td style="color:#4ade80">+ \${d.amount.toLocaleString()} VNĐ</td>
                <td><span style="color:#86efac">Thành công</span></td>
                <td>\${new Date(d.createdAt).toLocaleString('vi-VN')}</td>
              </tr>
            \`;
          });
        }
      }

      function switchTab(tabId, btn) {
        document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(tb => tb.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
        btn.classList.add('active');
      }

      async function changePassword() {
        const oldPassword = document.getElementById('oldPass').value;
        const newPassword = document.getElementById('newPass').value;

        const res = await fetch('/api/user/change-password', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': \`Bearer \${token}\`
          },
          body: JSON.stringify({ oldPassword, newPassword })
        });
        const data = await res.json();
        alert(data.message);
        if(data.success) {
          document.getElementById('oldPass').value = '';
          document.getElementById('newPass').value = '';
        }
      }

      function copyText(text) {
        navigator.clipboard.writeText(text);
        alert('Đã sao chép thông tin Acc!');
      }

      async function addAccount() {
        if(!currentUser || currentUser.role !== 'admin') return alert('Bạn không có quyền thực hiện!');
        const title = document.getElementById('accTitle').value;
        const category = document.getElementById('accCat').value;
        const price = document.getElementById('accPrice').value;
        const accUser = document.getElementById('accGameUser').value;
        const accPass = document.getElementById('accGamePass').value;
        const image = document.getElementById('accImage').value || 'https://via.placeholder.com/300x180?text=Acc+Game';

        if(!title || !price || !accUser || !accPass) return alert('Vui lòng nhập đầy đủ thông tin Acc!');

        const res = await fetch('/api/admin/add-account', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': \`Bearer \${token}\`
          },
          body: JSON.stringify({ title, category, price, accUser, accPass, image })
        });
        const data = await res.json();
        alert(data.message);
        if(data.success) {
          closeModal('adminModal');
          fetchAccounts();
        }
      }

      function openModal(id) { document.getElementById(id).style.display = 'flex'; }
      function closeModal(id) { document.getElementById(id).style.display = 'none'; }

      // Khởi động chạy kiểm tra xác thực
      checkAuth();
      fetchAccounts();
    </script>
<!-- CHÂN TRANG (FOOTER) -->
    <footer style="background: rgba(15, 23, 42, 0.9); backdrop-filter: blur(12px); border-top: 1px solid rgba(255,255,255,0.1); color: #94a3b8; padding: 40px 20px 20px; margin-top: 50px; font-size: 14px;">
      <div style="max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 30px; margin-bottom: 30px;">
        
        <!-- Cột 1: Thông tin Shop -->
        <div>
          <div class="logo" style="margin-bottom: 12px; font-size: 20px;">🎮 SHOP GAME VIP</div>
          <p style="line-height: 1.6; margin-bottom: 15px;">Hệ thống chuyên cung cấp tài khoản game uy tín, giá rẻ, giao dịch tự động nhanh chóng và bảo mật 24/7.</p>
          <div style="display: flex; gap: 10px;">
            <span style="background: rgba(56,189,248,0.1); color: #38bdf8; padding: 5px 10px; border-radius: 6px; font-size: 12px; font-weight: bold;">Giao dịch tự động</span>
            <span style="background: rgba(74,222,128,0.1); color: #4ade80; padding: 5px 10px; border-radius: 6px; font-size: 12px; font-weight: bold;">Uy tín 100%</span>
          </div>
        </div>

        <!-- Cột 2: Hỗ trợ khách hàng (Đã bấm vào hiện bảng thông tin) -->
        <div>
          <h4 style="color: #f8fafc; margin-bottom: 15px; font-size: 16px;">HỖ TRỢ KHÁCH HÀNG</h4>
          <ul style="list-style: none; display: flex; flex-direction: column; gap: 10px;">
            <li><a href="javascript:void(0)" onclick="openModal('guideModal')" style="color: #94a3b8; text-decoration: none; transition: 0.3s;" onmouseover="this.style.color='#38bdf8'" onmouseout="this.style.color='#94a3b8'">📖 Hướng dẫn mua hàng / Nạp tiền</a></li>
            <li><a href="javascript:void(0)" onclick="openModal('warrantyModal')" style="color: #94a3b8; text-decoration: none; transition: 0.3s;" onmouseover="this.style.color='#38bdf8'" onmouseout="this.style.color='#94a3b8'">🛡️ Chính sách bảo hành tài khoản</a></li>
            <li><a href="javascript:void(0)" onclick="openModal('checkModal')" style="color: #94a3b8; text-decoration: none; transition: 0.3s;" onmouseover="this.style.color='#38bdf8'" onmouseout="this.style.color='#94a3b8'">🔍 Kiểm tra tình trạng đơn hàng</a></li>
          </ul>
        </div>

 <!-- Cột 3: Kết nối với chúng tôi -->
        <div>
          <h4 style="color: #f8fafc; margin-bottom: 15px; font-size: 16px;">KẾT NỐI VỚI CHÚNG TÔI</h4>
          <p style="margin-bottom: 10px;">Hotline / Zalo: <strong style="color: #38bdf8;">0123.456.789</strong></p>
          <p style="margin-bottom: 15px;">Fanpage hỗ trợ: <a href="#" style="color: #38bdf8; text-decoration: none;">fb.com/shopcuaban</a></p>
          
          <div style="display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap;">
            <!-- Khối Logo MoMo -->
            <div style="width: 75px; height: 75px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 5px;">
              <img src="https://cdn.haitrieu.com/wp-content/uploads/2022/10/Logo-MoMo-Square.png" alt="MoMo" style="width: 35px; height: 35px; object-fit: contain; margin-bottom: 6px;">
              <span style="font-size: 12px; color: #cbd5e1; font-weight: bold;">MoMo</span>
            </div>

            <!-- Khối Logo Napas (ATM) -->
            <div style="width: 75px; height: 75px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 5px;">
              <img src="https://cdn.haitrieu.com/wp-content/uploads/2022/10/Logo-Napas.png" alt="Napas" style="width: 50px; height: 25px; object-fit: contain; margin-bottom: 10px; margin-top: 6px;">
              <span style="font-size: 12px; color: #cbd5e1; font-weight: bold;">Napas</span>
            </div>

            <!-- Khối Logo Thẻ Cào -->
            <div style="width: 75px; height: 75px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 5px;">
              <div style="display: flex; gap: 4px; margin-bottom: 6px; margin-top: 5px;">
                <img src="https://cdn.haitrieu.com/wp-content/uploads/2021/11/Logo-Viettel-Transparent.png" alt="Viettel" style="width: 18px; height: 18px; object-fit: contain;">
                <img src="https://cdn.haitrieu.com/wp-content/uploads/2021/11/Logo-VNPT-Vinaphone.png" alt="Vinaphone" style="width: 18px; height: 18px; object-fit: contain;">
                <img src="https://cdn.haitrieu.com/wp-content/uploads/2021/11/Logo-Mobifone-V.png" alt="Mobifone" style="width: 18px; height: 18px; object-fit: contain;">
              </div>
              <span style="font-size: 12px; color: #cbd5e1; font-weight: bold;">Thẻ Cào</span>
            </div>
          </div>
        </div>

      </div>

      <!-- Dòng bản quyền phía dưới cùng -->
      <div style="text-align: center; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 20px; font-size: 13px;">
        <p>© 2026 <strong>Shop Game VIP</strong>. All rights reserved. Thiết kế tối ưu cho game thủ.</p>
      </div>
    </footer>

    <!-- BẢNG MODAL HIỂN THỊ NỘI DUNG HƯỚNG DẪN MUA HÀNG -->
    <div id="guideModal" class="modal">
      <div class="modal-content">
        <h3>📖 Hướng Dẫn Mua Hàng</h3>
        <div style="color: #cbd5e1; line-height: 1.6; font-size: 14px; display: flex; flex-direction: column; gap: 10px;">
          <p><strong>Bước 1:</strong> Đăng ký / Đăng nhập tài khoản trên website của shop.</p>
          <p><strong>Bước 2:</strong> Nạp tiền vào tài khoản thông qua QR Code MoMo hoặc chuyển khoản ngân hàng.</p>
          <p><strong>Bước 3:</strong> Chọn tài khoản game bạn thích tại trang chủ và bấm nút mua.</p>
          <p><strong>Bước 4:</strong> Hệ thống tự động trừ tiền và gửi thông tin tài khoản (Tài khoản & Mật khẩu) ngay lập tức vào mục <em>Lịch sử giao dịch</em> hoặc <em>Tài khoản của tôi</em>.</p>
        </div>
        <button class="btn btn-danger" style="width: 100%; margin-top: 20px;" onclick="closeModal('guideModal')">Đóng lại</button>
      </div>
    </div>

    <!-- BẢNG MODAL CHÍNH SÁCH BẢO HÀNH -->
    <div id="warrantyModal" class="modal">
      <div class="modal-content">
        <h3>🛡️ Chính Sách Bảo Hành</h3>
        <div style="color: #cbd5e1; line-height: 1.6; font-size: 14px; display: flex; flex-direction: column; gap: 10px;">
          <p>✅ <strong>Bảo hành đúng thông tin:</strong> Acc đúng như hình ảnh và mô tả trên web.</p>
          <p>🔒 <strong>Lưu ý quan trọng:</strong> Ngay sau khi nhận được tài khoản, quý khách vui lòng tiến hành đổi mật khẩu và liên kết thông tin cá nhân (Email/SĐT) để bảo mật tuyệt đối.</p>
          <p>❌ <strong>Từ chối bảo hành:</strong> Các trường hợp tự ý chia sẻ tài khoản cho người khác hoặc bị khóa do vi phạm nội quy game.</p>
        </div>
        <button class="btn btn-danger" style="width: 100%; margin-top: 20px;" onclick="closeModal('warrantyModal')">Đóng lại</button>
      </div>
    </div>

    <!-- BẢNG MODAL KIỂM TRA ĐƠN HÀNG -->
    <div id="checkModal" class="modal">
      <div class="modal-content">
        <h3>🔍 Kiểm Tra Đơn Hàng</h3>
        <div style="color: #cbd5e1; line-height: 1.6; font-size: 14px; display: flex; flex-direction: column; gap: 10px;">
          <p>Để kiểm tra lại toàn bộ các tài khoản game bạn đã mua trước đó:</p>
          <p>👉 Bạn hãy bấm vào nút <strong>Hồ Sơ</strong> ở góc trên bên phải màn hình -> Chọn tab <strong>Lịch sử mua hàng</strong> để xem lại toàn bộ thông tin tài khoản đã giao dịch thành công.</p>
        </div>
        <button class="btn btn-danger" style="width: 100%; margin-top: 20px;" onclick="closeModal('checkModal')">Đóng lại</button>
      </div>
    </div>
  </body>
  </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
