const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const JWT_SECRET = process.env.JWT_SECRET || "shopplaytgt_super_secret_key_2026";
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/shopgame";

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Đã kết nối MongoDB thành công!'))
  .catch(err => console.error('❌ Lỗi kết nối MongoDB:', err));

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
  method: { type: String, default: 'ATM/Momo' },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const GameAccount = mongoose.model('GameAccount', AccountSchema);
const Deposit = mongoose.model('Deposit', DepositSchema);

function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ success: false, message: 'Chưa cung cấp Token!' });
  const token = authHeader.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ success: false, message: 'Token hết hạn hoặc không hợp lệ!' });
    req.user = decoded; 
    next();
  });
}

app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'Vui lòng điền đủ thông tin!' });
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ success: false, message: 'Tài khoản đã tồn tại!' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword, balance: 100000, role: 'user' });
    await newUser.save();
    res.json({ success: true, message: 'Đăng ký thành công! Tặng 100.000đ trải nghiệm.' });
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
    if (!isMatch) return res.status(400).json({ success: false, message: 'Mật khẩu sai!' });

    const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ success: true, token, user: { id: user._id, username: user.username, balance: user.balance, role: user.role } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi đăng nhập!' });
  }
});

app.get('/api/user/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id, '-password');
    if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy user!' });
    res.json({ success: true, user: { id: user._id, username: user.username, balance: user.balance, role: user.role } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server!' });
  }
});

app.get('/api/accounts', async (req, res) => {
  try {
    const accounts = await GameAccount.find({}, '-accUser -accPass');
    res.json(accounts);
  } catch (err) {
    res.status(500).send('Lỗi lấy acc');
  }
});

app.post('/api/buy', verifyToken, async (req, res) => {
  try {
    const { accId } = req.body;
    const user = await User.findById(req.user.id);
    const account = await GameAccount.findById(accId);

    if (!account || account.status === 'sold') return res.status(400).json({ success: false, message: 'Acc đã bán hoặc không tồn tại!' });
    if (user.balance < account.price) return res.status(400).json({ success: false, message: 'Số dư không đủ!' });

    user.balance -= account.price;
    account.status = 'sold';
    account.buyer = user._id;
    account.soldAt = new Date();

    await user.save();
    await account.save();

    res.json({ success: true, message: 'Mua thành công!', accUser: account.accUser, accPass: account.accPass, newBalance: user.balance });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Giao dịch thất bại!' });
  }
});

app.post('/api/deposit', verifyToken, async (req, res) => {
  try {
    const { amount, method } = req.body;
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) return res.status(400).json({ success: false, message: 'Số tiền không hợp lệ!' });

    const user = await User.findById(req.user.id);
    if (user) {
      user.balance += numAmount;
      await user.save();
      await new Deposit({ userId: user._id, amount: numAmount, method: method || 'Nạp tiền' }).save();
      res.json({ success: true, newBalance: user.balance });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi nạp tiền!' });
  }
});

app.get('/api/user/profile', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id, '-password');
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
    const user = await User.findById(req.user.id);
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) return res.status(400).json({ success: false, message: 'Mật khẩu cũ không đúng!' });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ success: true, message: 'Đổi mật khẩu thành công!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi!' });
  }
});

app.post('/api/admin/add-account', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Không có quyền!' });
    const { title, category, price, accUser, accPass, image } = req.body;
    await new GameAccount({ title, category, price, accUser, accPass, image }).save();
    res.json({ success: true, message: 'Đã thêm Acc thành công!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi thêm acc!' });
  }
});

app.get('/api/admin/users', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Từ chối truy cập!' });
    const users = await User.find({}, '-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi lấy user' });
  }
});

app.post('/api/admin/users/update', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Từ chối truy cập!' });
    const { userId, balance, role } = req.body;
    await User.findByIdAndUpdate(userId, { balance, role: role.toLowerCase() });
    res.json({ success: true, message: 'Cập nhật thành công!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi cập nhật!' });
  }
});

app.post('/api/admin/users/delete', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Từ chối truy cập!' });
    const { userId } = req.body;
    await User.findByIdAndDelete(userId);
    res.json({ success: true, message: 'Đã xóa tài khoản!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi xóa!' });
  }
});

// Giao diện Web
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
      body { 
        background-color: #0f172a; 
        background-image: url('https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2070&auto=format&fit=crop'); 
        background-size: cover; background-attachment: fixed; background-position: center; color: #f8fafc; position: relative;
      }
      #snow-container { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 999; overflow: hidden; }
      .snowflake { position: absolute; background: #ffffff; border-radius: 50%; opacity: 0.8; animation: fall linear infinite; box-shadow: 0 0 6px #38bdf8; }
      @keyframes fall { 0% { transform: translateY(-10px) translateX(0); } 100% { transform: translateY(105vh) translateX(30px); } }

      header { 
        background: rgba(30, 41, 59, 0.85); backdrop-filter: blur(12px); padding: 15px 5%; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #38bdf8; flex-wrap: wrap; gap: 10px; position: sticky; top: 0; z-index: 50;
      }
      .logo { font-size: 24px; font-weight: 900; color: #fff; text-shadow: 0 0 10px #38bdf8; }
      .btn { background: linear-gradient(45deg, #2563eb, #38bdf8); color: white; border: none; padding: 10px 18px; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 14px; transition: 0.3s; box-shadow: 0 4px 15px rgba(37,99,235,0.4); }
      .btn:hover { transform: translateY(-2px); }
      .btn-admin { background: linear-gradient(45deg, #d97706, #f59e0b); }
      .btn-profile { background: linear-gradient(45deg, #7c3aed, #a78bfa); }
      .btn-danger { background: linear-gradient(45deg, #e11d48, #fb7185); }
      .user-info { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .badge-admin { background: #f59e0b; color: #000; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 12px; }
      .btn-sm { padding: 5px 10px; font-size: 12px; }
      .container { max-width: 1200px; margin: 30px auto; padding: 0 15px; position: relative; z-index: 2; }
      
      .deposit-banner-box {
        background: rgba(18, 24, 36, 0.95); backdrop-filter: blur(12px); border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); display: grid; grid-template-columns: 380px 1fr; gap: 20px; padding: 20px; margin-bottom: 35px; box-shadow: 0 15px 40px rgba(0,0,0,0.7);
      }
      @media (max-width: 900px) { .deposit-banner-box { grid-template-columns: 1fr; } }
      .deposit-tabs { display: flex; background: #0b0f17; border-radius: 8px; padding: 4px; margin-bottom: 15px; }
      .deposit-tab-btn { flex: 1; background: transparent; border: none; color: #94a3b8; padding: 10px; font-weight: bold; cursor: pointer; border-radius: 6px; text-align: center; font-size: 14px; }
      .deposit-tab-btn.active { background: #1e293b; color: #ef4444; }
      .deposit-form-content { display: none; }
      .deposit-form-content.active { display: block; }
      .deposit-field { margin-bottom: 12px; }
      .deposit-field select, .deposit-field input { width: 100%; padding: 11px 12px; background: #0b0f17; border: 1px solid #334155; color: #fff; border-radius: 8px; font-size: 14px; outline: none; }
      .btn-nap-ngay { background: #ef4444; color: white; border: none; width: 100%; padding: 12px; border-radius: 8px; font-weight: bold; font-size: 15px; cursor: pointer; margin-top: 5px; }
      
      .banner-right-side { position: relative; border-radius: 12px; overflow: hidden; background: url('https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2070&auto=format&fit=crop') center/cover; display: flex; align-items: center; justify-content: center; min-height: 280px; border: 1px solid rgba(255,255,255,0.1); }
      .banner-right-side::before { content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.55); }
      .banner-content-inner { position: relative; z-index: 2; text-align: center; padding: 20px; }
      .banner-content-inner h3 { font-size: 22px; color: #fff; margin-bottom: 10px; }
      .banner-content-inner p { color: #cbd5e1; font-size: 14px; margin-bottom: 15px; }
      .play-btn-circle { width: 60px; height: 60px; background: #ef4444; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; color: white; font-size: 24px; cursor: pointer; }

      .categories { display: flex; gap: 12px; margin-bottom: 30px; flex-wrap: wrap; justify-content: center; }
      .cat-btn { background: rgba(51, 65, 85, 0.8); color: white; padding: 12px 25px; border-radius: 30px; border: 1px solid #475569; cursor: pointer; font-weight: 600; }
      .cat-btn.active { background: #38bdf8; color: #0f172a; border: none; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 25px; }
      
      .card { background: rgba(30, 41, 59, 0.85); backdrop-filter: blur(10px); border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
      .card img { width: 100%; height: 180px; object-fit: cover; border-bottom: 2px solid #334155; }
      .card-body { padding: 20px; }
      .price { color: #4ade80; font-size: 22px; font-weight: 900; margin: 12px 0; }
      .status { display: inline-block; padding: 5px 10px; border-radius: 6px; font-size: 11px; font-weight: bold; margin-bottom: 10px; background: rgba(22, 101, 52, 0.8); color: #86efac; }
      
      .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.9); backdrop-filter: blur(8px); justify-content: center; align-items: center; z-index: 1000; padding: 10px; }
      .modal-content { background: #1e293b; padding: 30px; border-radius: 16px; width: 100%; max-width: 450px; max-height: 90vh; overflow-y: auto; border: 1px solid #38bdf8; }
      .modal-content input, .modal-content select { width: 100%; padding: 12px; margin: 10px 0; border-radius: 8px; border: 1px solid #475569; background: #0f172a; color: white; }
      
      .profile-tabs { display: flex; gap: 5px; margin-bottom: 20px; border-bottom: 2px solid #334155; }
      .tab-btn { background: transparent; color: #94a3b8; border: none; padding: 10px 15px; cursor: pointer; font-weight: bold; }
      .tab-btn.active { color: #38bdf8; border-bottom: 3px solid #38bdf8; }
      .tab-content { display: none; }
      .tab-content.active { display: block; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px; }
      th, td { padding: 12px; text-align: left; border-bottom: 1px solid #334155; }
      th { background: rgba(15, 23, 42, 0.5); color: #38bdf8; }
      .acc-box { background: rgba(0,0,0,0.3); padding: 10px; border-radius: 6px; font-family: monospace; font-size: 13px; margin-top: 5px; word-break: break-all; }
    </style>
  </head>
  <body>

    <div id="snow-container"></div>

    <header>
      <div class="logo">🎮 SHOP GAME VIP</div>
      <div class="user-info" id="userArea">
        <button class="btn" onclick="openModal('loginModal')">Đăng Nhập</button>
        <button class="btn" onclick="openModal('registerModal')">Đăng Ký</button>
      </div>
    </header>

    <div class="container">
      <div class="deposit-banner-box">
        <div>
          <div class="deposit-tabs">
            <button class="deposit-tab-btn active" onclick="switchDepositTab('cardTab', this)">NẠP THẺ</button>
            <button class="deposit-tab-btn" onclick="switchDepositTab('atmTab', this)">NẠP ATM</button>
          </div>

          <div class="deposit-form-content active" id="cardTab">
            <div class="deposit-field">
              <select id="cardType">
                <option value="" disabled selected>✨ Loại Thẻ ✨</option>
                <option value="Viettel">Viettel</option>
                <option value="Vinaphone">Vinaphone</option>
                <option value="Mobifone">Mobifone</option>
              </select>
            </div>
            <div class="deposit-field">
              <select id="cardPrice">
                <option value="" disabled selected>⚡ Chọn mệnh giá ⚡</option>
                <option value="10000">10.000đ</option>
                <option value="50000">50.000đ</option>
                <option value="100000">100.000đ</option>
                <option value="200000">200.000đ</option>
                <option value="500000">500.000đ</option>
              </select>
            </div>
            <div class="deposit-field"><input type="text" id="cardCode" placeholder="Mã số thẻ"></div>
            <div class="deposit-field"><input type="text" id="cardSerial" placeholder="Số serial"></div>
            <button class="btn-nap-ngay" onclick="submitCardDeposit()">NẠP NGAY</button>
            <p style="font-size: 11px; color: #94a3b8; text-align: center; margin-top: 8px;">Hãy chọn đúng mệnh giá. Sai mất thẻ.</p>
          </div>

          <div class="deposit-form-content" id="atmTab">
            <div style="background: #0b0f17; padding: 12px; border-radius: 8px; border: 1px dashed #334155; font-size: 13px; line-height: 1.6; color: #cbd5e1; margin-bottom: 12px;">
              <p>🏦 <b>Ngân hàng:</b> MB Bank</p>
              <p>💳 <b>Số TK:</b> <span style="color: #4ade80; font-weight: bold;">1234567890123</span></p>
              <p>📝 <b>Nội dung:</b> <span style="color: #38bdf8;" id="transferSyntax">naptien [username]</span></p>
            </div>
            <button class="btn-nap-ngay" style="background: #2563eb;" onclick="simulateAtmDeposit()">XÁC NHẬN ĐÃ CHUYỂN KHOẢN</button>
          </div>
        </div>

        <div class="banner-right-side">
          <div class="banner-content-inner">
            <h3>SÔP NÀY CÓ UY TÍN NHƯ LỜI ĐỒN?</h3>
            <p>Khám phá kho acc game giá rẻ bên dưới!</p>
            <div class="play-btn-circle" onclick="alert('Xem video review uy tín trên Youtube!')">▶</div>
          </div>
        </div>
      </div>

      <div class="categories">
        <button class="cat-btn active" onclick="filterCat('all', event)">Tất Cả Acc</button>
        <button class="cat-btn" onclick="filterCat('playtogether', event)">PlayTogether</button>
        <button class="cat-btn" onclick="filterCat('lienquan', event)">Liên Quân VIP</button>
        <button class="cat-btn" onclick="filterCat('freefire', event)">Free Fire</button>
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
          <button class="tab-btn" onclick="switchTab('tabPurchases', this)">Lịch Sử Mua</button>
          <button class="tab-btn" onclick="switchTab('tabDeposits', this)">Lịch Sử Nạp</button>
        </div>
        
        <div class="tab-content active" id="tabOverview">
          <div id="profileOverview" style="line-height: 1.8; margin-bottom: 15px;"></div>
          <hr style="border-color: #334155; margin: 15px 0;">
          <h4>🔑 Đổi Mật Khẩu</h4>
          <input type="password" id="oldPass" placeholder="Mật khẩu hiện tại">
          <input type="password" id="newPass" placeholder="Mật khẩu mới">
          <button class="btn" style="width:100%; margin-top: 5px;" onclick="changePassword()">Cập Nhật</button>
        </div>

        <div class="tab-content" id="tabPurchases">
          <table>
            <thead><tr><th>Acc</th><th>Giá</th><th>Thông tin</th><th>Ngày mua</th></tr></thead>
            <tbody id="purchaseTableBody"></tbody>
          </table>
        </div>

        <div class="tab-content" id="tabDeposits">
          <table>
            <thead><tr><th>Số tiền</th><th>Hình thức</th><th>Trạng thái</th><th>Thời gian</th></tr></thead>
            <tbody id="depositTableBody"></tbody>
          </table>
        </div>

        <button class="btn btn-danger" style="width:100%; margin-top:15px;" onclick="closeModal('profileModal')">Đóng</button>
      </div>
    </div>

    <div class="modal" id="adminModal">
      <div class="modal-content">
        <h3>Đăng Bán Acc (ADMIN)</h3>
        <input type="text" id="accTitle" placeholder="Tiêu đề Acc">
        <select id="accCat">
          <option value="playtogether">PlayTogether</option>
          <option value="lienquan">Liên Quân VIP</option>
          <option value="freefire">Free Fire</option>
        </select>
        <input type="number" id="accPrice" placeholder="Giá (VNĐ)">
        <input type="text" id="accGameUser" placeholder="Tài khoản game">
        <input type="text" id="accGamePass" placeholder="Mật khẩu game">
        <input type="text" id="accImage" placeholder="Link ảnh">
        <button class="btn btn-admin" style="width:100%" onclick="addAccount()">Đăng Lên Shop</button>
        <button class="btn btn-danger" style="width:100%; margin-top:5px;" onclick="closeModal('adminModal')">Đóng</button>
      </div>
    </div>

    <div class="modal" id="adminUsersModal">
      <div class="modal-content" style="max-width: 800px;">
        <h3 style="color: #f59e0b;">👑 Quản Lý Người Dùng</h3>
        <table>
          <thead><tr><th>User</th><th>Số dư</th><th>Quyền</th><th>Thao tác</th></tr></thead>
          <tbody id="userListBody"></tbody>
        </table>
        <button class="btn btn-danger" style="width: 100%; margin-top: 20px;" onclick="closeModal('adminUsersModal')">Đóng</button>
      </div>
    </div>

    <script>
      let token = localStorage.getItem('token') || null;
      let currentUser = null;
      let allAccounts = [];

      function initSnowEffect() {
        const snowContainer = document.getElementById('snow-container');
        if(!snowContainer) return;
        for (let i = 0; i < 30; i++) {
          const snowflake = document.createElement('div');
          snowflake.classList.add('snowflake');
          const size = Math.random() * 4 + 2;
          snowflake.style.width = size + 'px';
          snowflake.style.height = size + 'px';
          snowflake.style.left = (Math.random() * 100) + '%';
          snowflake.style.animationDuration = (Math.random() * 6 + 4) + 's';
          snowflake.style.animationDelay = (Math.random() * 5) + 's';
          snowContainer.appendChild(snowflake);
        }
      }
      initSnowEffect();

      function switchDepositTab(tabId, btn) {
        document.querySelectorAll('.deposit-form-content').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.deposit-tab-btn').forEach(b => b.classList.remove('active'));
        const target = document.getElementById(tabId);
        if(target) target.classList.add('active');
        if(btn) btn.classList.add('active');
      }

      function openModal(id) {
        const modal = document.getElementById(id);
        if(modal) modal.style.display = 'flex';
      }

      function closeModal(id) {
        const modal = document.getElementById(id);
        if(modal) modal.style.display = 'none';
      }

      async function checkAuth() {
        if (!token) { currentUser = null; updateHeader(); return; }
        try {
          const res = await fetch('/api/user/me', { headers: { 'Authorization': 'Bearer ' + token } });
          const data = await res.json();
          if (data.success) {
            currentUser = data.user;
            const syntax = document.getElementById('transferSyntax');
            if(syntax) syntax.innerText = 'naptien ' + currentUser.username;
          } else { logout(); }
        } catch (e) { logout(); }
        updateHeader();
      }

      function updateHeader() {
        const userArea = document.getElementById('userArea');
        if (!userArea) return;
        if (currentUser) {
          const isAdmin = currentUser.role === 'admin';
          userArea.innerHTML = \`
            <span>👤 <b>\${currentUser.username}</b> \${isAdmin ? '<span class="badge-admin">ADMIN</span>' : ''} | Số dư: <b style="color:#4ade80">\${currentUser.balance.toLocaleString()}đ</b></span>
            \${isAdmin ? '<button class="btn btn-admin btn-sm" onclick="openAdminUsers()">👑 QL User</button>' : ''}
            <button class="btn btn-profile btn-sm" onclick="openProfile()">👤 Hồ Sơ</button>
            \${isAdmin ? '<button class="btn btn-admin btn-sm" onclick="openModal(\\'adminModal\\')">+ Đăng Acc</button>' : ''}
            <button class="btn btn-danger btn-sm" onclick="logout()">Đăng Xuất</button>
          \`;
        } else {
          userArea.innerHTML = \`
            <button class="btn" onclick="openModal('loginModal')">Đăng Nhập</button>
            <button class="btn" onclick="openModal('registerModal')">Đăng Ký</button>
          \`;
        }
      }

      async function fetchAccounts() {
        try {
          const res = await fetch('/api/accounts');
          allAccounts = await res.json();
          renderAccounts('all');
        } catch(e) { console.error(e); }
      }

      function renderAccounts(category) {
        const grid = document.getElementById('accountGrid');
        if(!grid) return;
        grid.innerHTML = '';
        const available = allAccounts.filter(a => a.status !== 'sold');
        const filtered = category === 'all' ? available : available.filter(a => a.category === category);

        if(filtered.length === 0) {
          grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #94a3b8; padding: 40px 0;">Chưa có tài khoản nào.</p>';
          return;
        }

        filtered.forEach(acc => {
          grid.innerHTML += \`
            <div class="card">
              <img src="\${acc.image}" alt="Acc">
              <div class="card-body">
                <span class="status">SẴN HÀNG</span>
                <h4>\${acc.title}</h4>
                <div class="price">\${acc.price.toLocaleString()} VNĐ</div>
                <button class="btn" style="width:100%" onclick="buyAccount('\${acc._id}')">Mua Ngay</button>
              </div>
            </div>
          \`;
        });
      }

      function filterCat(cat, evt) {
        document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
        if(evt && evt.target) evt.target.classList.add('active');
        renderAccounts(cat);
      }

      async function register() {
        const username = document.getElementById('regUser').value;
        const password = document.getElementById('regPass').value;
        const res = await fetch('/api/register', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
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
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if(data.success) {
          token = data.token;
          currentUser = data.user;
          localStorage.setItem('token', token);
          updateHeader();
          closeModal('loginModal');
        } else { alert(data.message); }
      }

      function logout() {
        localStorage.removeItem('token');
        token = null;
        currentUser = null;
        updateHeader();
      }

      async function submitCardDeposit() {
        if(!currentUser) return alert('Vui lòng đăng nhập!');
        const cardType = document.getElementById('cardType').value;
        const cardPrice = document.getElementById('cardPrice').value;
        const cardCode = document.getElementById('cardCode').value;
        const cardSerial = document.getElementById('cardSerial').value;
        if(!cardType || !cardPrice || !cardCode || !cardSerial) return alert('Điền đủ thông tin thẻ!');

        const res = await fetch('/api/deposit', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ amount: cardPrice, method: 'Thẻ ' + cardType })
        });
        const data = await res.json();
        if(data.success) {
          alert('🎉 Nạp thành công ' + Number(cardPrice).toLocaleString() + 'đ!');
          document.getElementById('cardCode').value = '';
          document.getElementById('cardSerial').value = '';
          await checkAuth();
        } else { alert(data.message); }
      }

      async function simulateAtmDeposit() {
        if(!currentUser) return alert('Vui lòng đăng nhập!');
        const amount = prompt('Nhập số tiền đã chuyển khoản (VNĐ):', '100000');
        if(amount && Number(amount) > 0) {
          const res = await fetch('/api/deposit', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ amount: Number(amount), method: 'ATM / MoMo' })
          });
          const data = await res.json();
          if(data.success) {
            alert('🎉 Đã cộng ' + Number(amount).toLocaleString() + 'đ!');
            await checkAuth();
          }
        }
      }

      async function buyAccount(accId) {
        if(!currentUser) return alert('Vui lòng đăng nhập!');
        if(!confirm('Xác nhận mua tài khoản này?')) return;
        const res = await fetch('/api/buy', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ accId })
        });
        const data = await res.json();
        if(data.success) {
          alert('🎉 MUA THÀNH CÔNG!\nTK: ' + data.accUser + '\nMK: ' + data.accPass);
          await checkAuth(); fetchAccounts();
        } else { alert(data.message); }
      }

      async function openProfile() {
        if(!currentUser) return;
        openModal('profileModal');
        const res = await fetch('/api/user/profile', { headers: { 'Authorization': 'Bearer ' + token } });
        const data = await res.json();
        if(data.success) {
          const { user, purchases, deposits } = data;
          const totalDep = deposits.reduce((s, d) => s + d.amount, 0);
          document.getElementById('profileOverview').innerHTML = \`
            <p>Tài khoản: <b>\${user.username}</b></p>
            <p>Số dư: <b style="color:#4ade80">\${user.balance.toLocaleString()} VNĐ</b></p>
            <p>Đã nạp: <b>\${totalDep.toLocaleString()} VNĐ</b></p>
            <p>Đã mua: <b>\${purchases.length} Acc</b></p>
          \`;

          const pBody = document.getElementById('purchaseTableBody');
          pBody.innerHTML = purchases.length ? '' : '<tr><td colspan="4" style="text-align:center;">Chưa có đơn hàng</td></tr>';
          purchases.forEach(p => {
            const accInfo = 'TK: ' + p.accUser + ' | MK: ' + p.accPass;
            pBody.innerHTML += \`<tr>
              <td><b>\${p.title}</b></td>
              <td style="color:#4ade80">\${p.price.toLocaleString()}đ</td>
              <td>
                <div class="acc-box">\${accInfo}</div>
                <button class="btn btn-sm" onclick="copyAccInfo('\${p.accUser}', '\${p.accPass}')">📋 Copy</button>
              </td>
              <td>\${new Date(p.soldAt).toLocaleDateString()}</td>
            </tr>\`;
          });

          const dBody = document.getElementById('depositTableBody');
          dBody.innerHTML = deposits.length ? '' : '<tr><td colspan="4" style="text-align:center;">Chưa có lịch sử nạp</td></tr>';
          deposits.forEach(d => {
            dBody.innerHTML += \`<tr><td style="color:#4ade80">+\${d.amount.toLocaleString()}đ</td><td>\${d.method}</td><td>Thành công</td><td>\${new Date(d.createdAt).toLocaleDateString()}</td></tr>\`;
          });
        }
      }

      function copyAccInfo(user, pass) {
        const text = 'TK: ' + user + ' | MK: ' + pass;
        navigator.clipboard.writeText(text);
        alert('Đã sao chép thông tin Acc!');
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
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ oldPassword, newPassword })
        });
        const data = await res.json();
        alert(data.message);
      }

      async function addAccount() {
        const title = document.getElementById('accTitle').value;
        const category = document.getElementById('accCat').value;
        const price = document.getElementById('accPrice').value;
        const accUser = document.getElementById('accGameUser').value;
        const accPass = document.getElementById('accGamePass').value;
        const image = document.getElementById('accImage').value || 'https://via.placeholder.com/300x180';

        const res = await fetch('/api/admin/add-account', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ title, category, price, accUser, accPass, image })
        });
        const data = await res.json();
        alert(data.message);
        if(data.success) { closeModal('adminModal'); fetchAccounts(); }
      }

      async function openAdminUsers() {
        openModal('adminUsersModal');
        const tbody = document.getElementById('userListBody');
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Đang tải...</td></tr>';
        try {
          const res = await fetch('/api/admin/users', { headers: { 'Authorization': 'Bearer ' + token } });
          const users = await res.json();
          tbody.innerHTML = '';
          users.forEach(u => {
            tbody.innerHTML += \`<tr>
              <td>\${u.username}</td>
              <td><input type="number" id="bal_\${u._id}" value="\${u.balance}" style="width:80px;background:#0b0f17;color:#4ade80;border:1px solid #475569;padding:4px;"></td>
              <td><select id="role_\${u._id}" style="background:#0b0f17;color:#fff;border:1px solid #475569;padding:4px;"><option value="user" \${u.role==='user'?'selected':''}>User</option><option value="admin" \${u.role==='admin'?'selected':''}>Admin</option></select></td>
              <td>
                <button class="btn btn-sm" style="background:#10b981;" onclick="updateUser('\${u._id}')">Lưu</button>
                <button class="btn btn-sm btn-danger" onclick="deleteUser('\${u._id}')">Xóa</button>
              </td>
            </tr>\`;
          });
        } catch(e) { tbody.innerHTML = '<tr><td colspan="4" style="color:red;text-align:center;">Lỗi tải dữ liệu</td></tr>'; }
      }

      async function updateUser(id) {
        const balance = document.getElementById('bal_' + id).value;
        const role = document.getElementById('role_' + id).value;
        const res = await fetch('/api/admin/users/update', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ userId: id, balance: Number(balance), role })
        });
        const data = await res.json();
        alert(data.message);
      }

      async function deleteUser(id) {
        if(!confirm('Xóa tài khoản này?')) return;
        const res = await fetch('/api/admin/users/delete', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ userId: id })
        });
        const data = await res.json();
        alert(data.message);
        if(data.success) openAdminUsers();
      }

      checkAuth();
      fetchAccounts();
    </script>
  </body>
  </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server chạy tại http://localhost:${PORT}`));
