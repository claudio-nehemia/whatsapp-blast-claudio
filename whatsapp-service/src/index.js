import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import { connectToWhatsApp, getConnectionStatus, logout } from './connection.js';
import { startBlast, pauseBlast, resumeBlast, cancelBlast, getQueueStatus, setRustBackendUrl } from './queue.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const rustBackendUrl = process.env.RUST_BACKEND_URL || 'http://127.0.0.1:8000';

setRustBackendUrl(rustBackendUrl);

app.use(cors());
app.use(express.json());

// Callback to send events to the Rust backend
async function sendRustCallback(endpoint, data) {
  try {
    await axios.post(`${rustBackendUrl}${endpoint}`, data);
  } catch (error) {
    console.error(`Callback to Rust backend failed (${endpoint}):`, error.message);
  }
}

// Handler for WhatsApp connection state changes
function handleWhatsAppEvent(sessionId, event) {
  console.log(`WhatsApp connection event for session ${sessionId}:`, event);
  sendRustCallback('/api/internal/whatsapp-status', { sessionId, ...event });
}

// Endpoint: Check status
app.get('/api/status', (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId query parameter is required' });
  }
  res.json(getConnectionStatus(sessionId));
});

// Endpoint: Trigger WhatsApp connection (returns current status)
app.post('/api/connect', async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required in body' });
  }
  const current = getConnectionStatus(sessionId);
  if (current.status === 'connected') {
    return res.json({ success: true, status: 'connected', message: 'Already connected' });
  }

  // Connect async
  connectToWhatsApp(sessionId, handleWhatsAppEvent);
  res.json({ success: true, status: 'connecting', message: 'Connection sequence initiated' });
});

// Endpoint: Disconnect
app.post('/api/disconnect', (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required in body' });
  }
  logout(sessionId);
  res.json({ success: true, status: 'disconnected', message: 'Disconnected successfully' });
});

// Endpoint: Start Blast
app.post('/api/blast', (req, res) => {
  const { blastId, sessionId, recipients, templateText, imagePath, settings } = req.body;

  if (!blastId || !sessionId || !recipients || !Array.isArray(recipients)) {
    return res.status(400).json({ error: 'blastId, sessionId, and recipients array are required' });
  }

  try {
    const result = startBlast({ blastId, sessionId, recipients, templateText, imagePath, settings });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Endpoint: Pause Blast
app.post('/api/blast/pause', (req, res) => {
  res.json(pauseBlast());
});

// Endpoint: Resume Blast
app.post('/api/blast/resume', (req, res) => {
  res.json(resumeBlast());
});

// Endpoint: Cancel Blast
app.post('/api/blast/cancel', (req, res) => {
  res.json(cancelBlast());
});

// Endpoint: Active Blast Status
app.get('/api/blast/status', (req, res) => {
  res.json(getQueueStatus());
});

app.listen(port, () => {
  console.log(`WhatsApp Service running on port ${port}`);
  console.log(`Rust Backend callback URL set to: ${rustBackendUrl}`);

  // Auto-connect all sessions on startup
  import('fs').then((fs) => {
    import('path').then((path) => {
      import('url').then(({ fileURLToPath }) => {
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const rootSessionDir = path.join(__dirname, '../storage/session');
        if (fs.existsSync(rootSessionDir)) {
          const sessions = fs.readdirSync(rootSessionDir).filter(f => {
            return fs.statSync(path.join(rootSessionDir, f)).isDirectory() && fs.existsSync(path.join(rootSessionDir, f, 'creds.json'));
          });
          console.log(`Found ${sessions.length} saved sessions:`, sessions);
          sessions.forEach(sessionId => {
            console.log(`Auto-connecting session: ${sessionId}...`);
            connectToWhatsApp(sessionId, handleWhatsAppEvent);
          });
        }
      });
    });
  });
});
