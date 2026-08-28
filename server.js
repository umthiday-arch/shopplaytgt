const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Dữ liệu mẫu danh sách Acc Game (Trong thực tế sẽ lưu vào Database như MongoDB/Supabase)
let accounts = [
  { id: 101, title: "Acc PlayTogether VIP - Có Cánh & Xe VIP", price: 50000, status: "Sẵn có" },
  { id: 102, title: "Acc Liên Quân Full Tướng - 100 Trang Phục", price: 100000, status: "Sẵn có" },
  { id: 103, title: "Acc Free Fire Quỷ Dạ Xoa - Bắn Cực Khét", price: 30000, status: "Đã bán" }
];

// API Lấy danh sách sản phẩm
app.get('/api/accounts', (req, res) => {
  res.json(accounts);
});

// Giao diện HTML Frontend
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>SHOP GAME PLAYTOGETHER - UY TÍN 100%</title>
      <style>
        body { font-family: Arial, sans-serif; background-color: #f4f6f9; margin: 0; padding: 20px; }
        header { background: #343a40; color: white; padding: 15px; text-align: center; border-radius: 8px; }
        .container { display: flex; flex-wrap: wrap; gap: 20px; margin-top: 20px; justify-content: center; }
        .card { background: white; border-radius: 8px; padding: 15px; width: 250px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); text-align: center; }
        .price { color: #e74c3c; font-weight: bold; font-size: 1.2em; }
        .btn { background: #28a745; color: white; border: none; padding: 10px 15px; border-radius: 5px; cursor: pointer; margin-top: 10px; width: 100%; }
        .btn:disabled { background: #6c757d; cursor: not-allowed; }
      </style>
    </head>
    <body>
      <header>
        <h1>SHOP ACC GAME GIÁ RẺ</h1>
        <p>Nạp Kẹo / Mua Tài Khoản Tự Động 24/7</p>
      </header>
      <div class="container" id="shop-list"></div>

      <script>
        fetch('/api/accounts')
          .then(res => res.json())
          .then(data => {
            const container = document.getElementById('shop-list');
            container.innerHTML = data.map(acc => \`
              <div class="card">
                <h3>Mã Số: #\${acc.id}</h3>
                <p>\${acc.title}</p>
                <p class="price">\${acc.price.toLocaleString()} VNĐ</p>
                <button class="btn" \${acc.status === 'Đã bán' ? 'disabled' : ''} onclick="buyAcc(\${acc.id})">
                  \${acc.status === 'Đã bán' ? 'Đã Bán' : 'Mua Ngay'}
                </button>
              </div>
            \`).join('');
          });

        function buyAcc(id) {
          alert('Cảm ơn bạn! Vui lòng nạp tiền vào tài khoản để hoàn tất giao dịch mã acc #' + id);
        }
      </script>
    </body>
    </html>
  `);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
