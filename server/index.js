// ===== server/index.js — Express API server =====
import express from 'express';
import cors from 'cors';
import { loadAll, saveAll, close } from './db.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const UPLOADS_DIR = join(__dirname, '..', 'uploads');
if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ---- API Routes ----

/** GET /api/data — returns all data */
app.get('/api/data', (_req, res) => {
    try {
        const data = loadAll();
        res.json(data);
    } catch (err) {
        console.error('Error loading data:', err);
        res.status(500).json({ error: 'Failed to load data' });
    }
});

/** PUT /api/data — replaces all data */
app.put('/api/data', (req, res) => {
    try {
        const data = req.body;
        if (!data || !Array.isArray(data.projects) || !Array.isArray(data.tasks) || !Array.isArray(data.timeEntries)) {
            return res.status(400).json({ error: 'Invalid data format' });
        }
        saveAll(data);
        res.json({ ok: true });
    } catch (err) {
        console.error('Error saving data:', err);
        res.status(500).json({ error: 'Failed to save data' });
    }
});

/** POST /api/upload — upload a file (base64 encoded in JSON body) */
app.post('/api/upload', express.json({ limit: '50mb' }), (req, res) => {
    try {
        const { fileName, data: base64Data } = req.body;
        if (!fileName || !base64Data) {
            return res.status(400).json({ error: 'Missing fileName or data' });
        }
        // Generate unique stored filename
        const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '';
        const storedName = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8) + ext;

        const buffer = Buffer.from(base64Data, 'base64');
        const filePath = join(UPLOADS_DIR, storedName);
        writeFileSync(filePath, buffer);

        res.json({ storedName, size: buffer.length });
    } catch (err) {
        console.error('Error uploading file:', err);
        res.status(500).json({ error: 'Failed to upload file' });
    }
});

/** GET /api/files/:name — download a file */
app.get('/api/files/:name', (req, res) => {
    try {
        const filePath = join(UPLOADS_DIR, req.params.name);
        if (!existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }
        res.sendFile(filePath);
    } catch (err) {
        console.error('Error serving file:', err);
        res.status(500).json({ error: 'Failed to serve file' });
    }
});

/** DELETE /api/files/:name — delete a file */
app.delete('/api/files/:name', (req, res) => {
    try {
        const filePath = join(UPLOADS_DIR, req.params.name);
        if (existsSync(filePath)) {
            unlinkSync(filePath);
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('Error deleting file:', err);
        res.status(500).json({ error: 'Failed to delete file' });
    }
});

// ---- Start ----

app.listen(PORT, () => {
    console.log(`✅ Worclaw API server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    close();
    process.exit(0);
});
