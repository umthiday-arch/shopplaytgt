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
      body { background: #0f172a; color: #f8fafc; }
      header { background: #1e293b; padding: 15px 5%; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #3b82f6; flex-wrap: wrap; gap: 10px; }
      .logo { font-size: 22px; font-weight: bold; color: #38bdf8; }
      .user-info { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .badge-admin { background: #f59e0b; color: #000; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 12px; }
      .btn { background: #2563eb; color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px; }
      .btn:hover { background: #1d4ed8; }
      .btn-admin { background: #d97706; }
      .btn-admin:hover { background: #b45309; }
      .btn-profile { background: #8b5cf6; }
      .btn-profile:hover { background: #7c3aed; }
      .btn-danger { background: #ef4444; }
      .btn-sm { padding: 4px 8px; font-size: 12px; }
      .container { max-width: 1200px; margin: 20px auto; padding: 0 15px; }
      .categories { display: flex; gap: 10px; margin-bottom: 25px; flex-wrap: wrap; }
      .cat-btn { background: #334155; color: white; padding: 10px 20px; border-radius: 20px; border: none; cursor: pointer; }
      .cat-btn.active { background: #38bdf8; color: #0f172a; font-weight: bold; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px; }
      .card { background: #1e293b; border-radius: 10px; overflow: hidden; border: 1px solid #334155; }
      .card img { width: 100%; height: 160px; object-fit: cover; }
      .card-body { padding: 15px; }
      .price { color: #4ade80; font-size: 18px; font-weight: bold; margin: 10px 0; }
      .status { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 12px; margin-bottom: 10px; }
      .status-available { background: #166534; color: #86efac; }
      .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); justify-content: center; align-items: center; z-index: 100; padding: 10px; }
      .modal-content { background: #1e293b; padding: 25px; border-radius: 10px; width: 100%; max-width: 450px; max-height: 90vh; overflow-y: auto; }
      .modal-content input, .modal-content select { width: 100%; padding: 10px; margin: 8px 0; border-radius: 5px; border: 1px solid #334155; background: #0f172a; color: white; }
      
      .profile-tabs { display: flex; gap: 5px; margin-bottom: 15px; border-bottom: 1px solid #334155; }
      .tab-btn { background: transparent; color: #94a3b8; border: none; padding: 8px 12px; cursor: pointer; font-weight: 600; }
      .tab-btn.active { color: #38bdf8; border-bottom: 2px solid #38bdf8; }
      .tab-content { display: none; }
      .tab-content.active { display: block; }
      .table-responsive { width: 100%; overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
      th, td { padding: 10px; text-align: left; border-bottom: 1px solid #334155; }
      th { background: #0f172a; color: #38bdf8; }
      .acc-box { background: #0f172a; padding: 6px; border-radius: 4px; font-family: monospace; font-size: 12px; margin-top: 4px; word-break: break-all; }
      .rank-badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; background: #38bdf8; color: #000; }
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
  </body>
  </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
