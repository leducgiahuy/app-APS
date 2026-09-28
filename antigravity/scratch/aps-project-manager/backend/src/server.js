import express from 'express';
import cors from 'cors';
import apiRoutes from './routes/api.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware cấu hình CORS và phân tích JSON
app.use(cors());
app.use(express.json());

// Gắn các đường dẫn API của hệ thống
app.use('/api', apiRoutes);

// Trang kiểm tra trạng thái máy chủ (Health check)
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    system: 'APS Vietnam Construction & HR Portal Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 APS Vietnam Backend Server đang chạy tại:`);
  console.log(`👉 http://localhost:${PORT}`);
  console.log(`👉 API Endpoint: http://localhost:${PORT}/api`);
  console.log(`=======================================================`);
});
