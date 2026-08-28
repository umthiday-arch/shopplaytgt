const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
  role: { type: String, default: 'user' } // 'user' hoặc 'admin'
});

const AccountSchema = new mongoose.Schema({
  title: { type: String, required: true },
  category: { type: String, required: true }, // 'playtogether', 'lienquan', 'freefire', 'random'
  price: { type: Number, required: true },
  accUser: { type: String, required: true }, // Tài khoản game bàn giao
  accPass: { type: String, required: true }, // Mật khẩu game bàn giao
  image: { type: String, default: 'https://via.placeholder.com/300x180?text=Acc+Game' },
  status: { type: String, default: 'available' }, // 'available' (còn hàng) hoặc 'sold' (đã bán)
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
});

const User = mongoose.model('User', UserSchema);
const GameAccount = mongoose.model('GameAccount', AccountSchema);

// 2. API Đăng Ký & Đăng Nhập
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ thông tin!' });

    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ success: false, message: 'Tên tài khoản đã tồn tại!' });

    const hashedPassword = await bcrypt.hash(password, 10);

    // Mặc định tất cả mọi người đăng ký đều là 'user' thường
    const newUser = new User({ 
      username, 
      password: hashedPassword, 
      balance: 100000, // Tặng 100k trải nghiệm
      role: 'user'
    });

    await newUser.save();
    res.json({ 
      success: true, 
      message: 'Đăng ký thành công! Đã nhận 100.000đ trải nghiệm.' 
    });
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

    res.json({
      success: true,
      user: { id: user._id, username: user.username, balance: user.balance, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi đăng nhập!' });
  }
});

// 3. API Quản Lý Acc Game & Mua Bán
app.get('/api/accounts', async (req, res) => {
  try {
    const accounts = await GameAccount.find({}, '-accUser -accPass');
    res.json(accounts);
  } catch (err) {
    res.status(500).send('Lỗi lấy danh sách Acc');
  }
});

app.post('/api/buy', async (req, res) => {
  try {
    const { userId, accId } = req.body;
    const user = await User.findById(userId);
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

app.post('/api/deposit', async (req, res) => {
  const { userId, amount } = req.body;
  const user = await User.findById(userId);
  if (user) {
    user.balance += Number(amount);
    await user.save();
    res.json({ success: true, newBalance: user.balance });
  }
});

// API Admin Thêm Acc Game Mới (Chỉ tài khoản role = 'admin' mới gọi được)
app.post('/api/admin/add-account', async (req, res) => {
  try {
    const { userId, title, category, price, accUser, accPass, image } = req.body;

    const user = await User.findById(userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Bạn không phải Admin! Không có quyền đăng bán Acc.' });
    }

    const newAcc = new GameAccount({ title, category, price, accUser, accPass, image });
    await newAcc.save();
    res.json({ success: true, message: 'Đã thêm Acc game mới lên Shop thành công!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi thêm Acc!' });
  }
});

// 4. Giao diện Web
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
      .user-info { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
      .badge-admin { background: #f59e0b; color: #000; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 12px; }
      .btn { background: #2563eb; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; }
      .btn:hover { background: #1d4ed8; }
      .btn-admin { background: #d97706; }
      .btn-admin:hover { background: #b45309; }
      .btn-danger { background: #ef4444; }
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
      .status-sold { background: #991b1b; color: #fca5a5; }
      .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); justify-content: center; align-items: center; z-index: 100; }
      .modal-content { background: #1e293b; padding: 25px; border-radius: 10px; width: 340px; }
      .modal-content input, .modal-content select { width: 100%; padding: 10px; margin: 8px 0; border-radius: 5px; border: 1px solid #334155; background: #0f172a; color: white; }
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

    <div class="modal" id="adminModal">
      <div class="modal-content" style="width: 400px;">
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
      let currentUser = JSON.parse(localStorage.getItem('user')) || null;
      let allAccounts = [];

      function updateHeader() {
        const userArea = document.getElementById('userArea');
        if (currentUser) {
          const isAdmin = currentUser.role === 'admin';
          userArea.innerHTML = \`
            <span>👤 <b>\${currentUser.username}</b> \${isAdmin ? '<span class="badge-admin">ADMIN</span>' : ''} | Số dư: <b style="color:#4ade80">\${currentUser.balance.toLocaleString()}đ</b></span>
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
        const filtered = category === 'all' ? allAccounts : allAccounts.filter(a => a.category === category);

        if(filtered.length === 0) {
          grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #94a3b8; padding: 40px 0;">Chưa có Acc nào trong danh mục này.</p>';
          return;
        }

        filtered.forEach(acc => {
          const isSold = acc.status === 'sold';
          grid.innerHTML += \`
            <div class="card">
              <img src="\${acc.image}" alt="Acc Game">
              <div class="card-body">
                <span class="status \${isSold ? 'status-sold' : 'status-available'}">
                  \${isSold ? 'ĐÃ BÁN' : 'CÒN HÀNG'}
                </span>
                <h4>\${acc.title}</h4>
                <div class="price">\${acc.price.toLocaleString()} VNĐ</div>
                <button class="btn" style="width:100%" \${isSold ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''} onclick="buyAccount('\${acc._id}')">
                  \${isSold ? 'Hết Hàng' : 'Mua Ngay'}
                </button>
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
          currentUser = data.user;
          localStorage.setItem('user', JSON.stringify(currentUser));
          updateHeader();
          closeModal('loginModal');
        } else {
          alert(data.message);
        }
      }

      function logout() {
        localStorage.removeItem('user');
        currentUser = null;
        updateHeader();
      }

      async function buyAccount(accId) {
        if(!currentUser) return alert('Vui lòng đăng nhập để mua hàng!');
        if(!confirm('Xác nhận mua Acc này?')) return;

        const res = await fetch('/api/buy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser.id, accId })
        });
        const data = await res.json();
        if(data.success) {
          alert(\`🎉 MUA THÀNH CÔNG!\\n\\nTài khoản: \${data.accUser}\\nMật khẩu: \${data.accPass}\\n\\n(Hãy lưu lại thông tin này ngay!)\`);
          currentUser.balance = data.newBalance;
          localStorage.setItem('user', JSON.stringify(currentUser));
          updateHeader();
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, amount })
          });
          const data = await res.json();
          currentUser.balance = data.newBalance;
          localStorage.setItem('user', JSON.stringify(currentUser));
          updateHeader();
          alert('Nạp tiền thành công!');
        }
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser.id, title, category, price, accUser, accPass, image })
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

      updateHeader();
      fetchAccounts();
    </script>
  </body>
  </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
