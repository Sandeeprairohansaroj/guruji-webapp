require('dotenv').config();
const express = require('express');
const OpenAI = require('openai');
const path = require('path');
const { exec } = require('child_process');
const multer = require('multer');
const os = require('os');
const fs = require('fs');
const https = require('https');

const app = express();
app.use(express.json({ limit: '50mb' }));

// Serve static frontend files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Initialize OpenAI client with Azure AI Foundry endpoint
// keepAlive agent reuses TLS connections between requests
const azureAgent = new https.Agent({ keepAlive: true });
const client = new OpenAI({
    baseURL: process.env.AZURE_ENDPOINT,
    apiKey: process.env.AZURE_API_KEY,
    httpAgent: azureAgent
});

const DEPLOYMENT_NAME = process.env.AZURE_DEPLOYMENT_NAME || 'Kimi-K2.6';

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Configure multer for file uploads
const upload = multer({ 
    dest: uploadsDir,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// File upload endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const filePath = req.file.path;
        const mimeType = req.file.mimetype;
        const originalName = req.file.originalname;

        // Handle text-based files
        const textExtensions = ['.txt', '.js', '.py', '.json', '.md', '.csv', '.html', '.css', '.xml', '.yaml', '.yml', '.log', '.sql', '.java', '.cpp', '.c', '.h', '.ts', '.jsx', '.tsx', '.sh', '.bat', '.ps1'];
        const isTextFile = mimeType.startsWith('text/') || textExtensions.some(ext => originalName.toLowerCase().endsWith(ext));

        if (isTextFile) {
            const content = fs.readFileSync(filePath, 'utf-8');
            fs.unlinkSync(filePath); // Clean up
            return res.json({ 
                type: 'text', 
                name: originalName, 
                content: content 
            });
        }

        // Handle images
        if (mimeType.startsWith('image/')) {
            const buffer = fs.readFileSync(filePath);
            const base64 = buffer.toString('base64');
            fs.unlinkSync(filePath); // Clean up
            return res.json({ 
                type: 'image', 
                name: originalName, 
                mimeType: mimeType,
                base64: `data:${mimeType};base64,${base64}`
            });
        }

        fs.unlinkSync(filePath); // Clean up unsupported
        return res.status(400).json({ error: 'Unsupported file type. Please upload text or image files.' });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Non-streaming chat endpoint (backward compatibility)
app.post('/api/chat', async (req, res) => {
    try {
        const { messages } = req.body;
        
        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'No messages provided' });
        }

        const completion = await client.chat.completions.create({
            model: DEPLOYMENT_NAME,
            messages: messages,
            temperature: 0.7,
            max_tokens: 2000
        });

        const reply = completion.choices[0].message.content;
        res.json({ response: reply });
    } catch (error) {
        console.error('Error calling Azure Foundry:', error);
        res.status(500).json({ error: error.message });
    }
});

// Streaming chat endpoint (NDJSON format)
app.post('/api/chat/stream', async (req, res) => {
    try {
        const { messages } = req.body;
        
        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'No messages provided' });
        }

        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const stream = await client.chat.completions.create({
            model: DEPLOYMENT_NAME,
            messages: messages,
            temperature: 0.7,
            max_tokens: 2000,
            stream: true
        });

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                res.write(JSON.stringify({ content }) + '\n');
            }
        }

        res.write(JSON.stringify({ done: true }) + '\n');
        res.end();
    } catch (error) {
        console.error('Streaming error:', error);
        res.write(JSON.stringify({ error: error.message }) + '\n');
        res.end();
    }
});

const PORT = process.env.PORT || 5000;

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

app.listen(PORT, '0.0.0.0', () => {
    const localIP = getLocalIP();
    console.log(`Guruji Web App with Streaming & File Upload is running!`);
    console.log(`Local:   http://localhost:${PORT}`);
    console.log(`Network: http://${localIP}:${PORT}`);
    
    // Auto-open browser only in local development
    if (process.env.NODE_ENV !== 'production') {
        const startCmd = process.platform === 'win32' ? `start http://localhost:${PORT}` : `open http://localhost:${PORT}`;
        exec(startCmd, (err) => {
            if (err) console.log('Could not auto-open browser. Please open manually.');
        });
    }
});
