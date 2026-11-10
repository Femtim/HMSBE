const express = require('express');
const http = require('http');
const { Server: SocketServer } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

const apiRoutes = require('./routes/index');
const { bootstrapSuperAdmin } = require('./utils/bootstrapAdmin');

dotenv.config();

const app = express();
const server = http.createServer(app);

const allowedOrigins = ['http://localhost:5173', process.env.CLIENT_URL].filter(Boolean);
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error('CORS blocked'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
};

const io = new SocketServer(server, { cors: corsOptions });
app.set('io', io);

io.on('connection', (socket) => {
  socket.on('join:department', (dept) => {
    if (dept) socket.join(dept.toUpperCase());
  });
});

app.use(cors(corsOptions));
app.use(express.json());

app.get('/', (req, res) => res.status(200).json({ message: 'HAQMS Backend Active' }));
app.get('/health', (req, res) => res.status(200).json({ status: 'OK' }));
app.use('/api/v1', apiRoutes);

const PORT = process.env.PORT || 5000;
mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    await bootstrapSuperAdmin();
    server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Database connection error:', err.message);
    process.exit(1);
  });