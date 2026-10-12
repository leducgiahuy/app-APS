import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRoutes from './routes/api.js';

const app = express();
const PORT = process.env.PORT || 5000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, '../../frontend/dist');

// Middleware cấu hình CORS và phân tích JSON
app.use(cors());
app.use(express.json());

// Gắn các đường dẫn API của hệ thống
app.use('/api', apiRoutes);

// Phục vụ giao diện web (bản build của frontend)
app.use(express.static(dist));

// Mọi đường dẫn còn lại trả về index.html (để /hr, /tasks... không bị 404)
app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 APS Vietnam Backend Server đang chạy tại:`);
  console.log(`👉 http://localhost:${PORT}`);
  console.log(`👉 API Endpoint: http://localhost:${PORT}/api`);
  console.log(`=======================================================`);
});