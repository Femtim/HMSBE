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

const allowedOrigins = [
  process.env.CLIENT_URL,
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
};

const io = new SocketServer(server, {
  cors: corsOptions,
});

app.set('io', io);

io.on('connection', (socket) => {
  socket.on('join:department', (department) => {
    if (department) {
      socket.join(department.toUpperCase());
    }
  });
});

app.use(cors(corsOptions));
app.use(express.json());

app.get('/', (req, res) => {
  res.status(200).json({ message: 'HAQMS Backend & Socket.io Server is Live 🚀' });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.use('/api/v1', apiRoutes);

const PORT = process.env.PORT;
const MONGO_URI = process.env.MONGO_URI;

mongoose
  .connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB');
    await bootstrapSuperAdmin();
    server.listen(PORT, () => {
      console.log(`🚀 Server & WebSocket running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });