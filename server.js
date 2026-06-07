const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve frontend assets automatically from the public folder
app.use(express.static('public'));

// Serve uploaded videos publicly from the root uploads folder
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- IN-MEMORY DATABASE ---
// Updated to a Map to store usernames and passwords
const users = new Map([
    ['alice', 'password123'], 
    ['bob', 'password123'], 
    ['charlie', 'password123']
]); 

const databaseVideos = [
    { id: 1, title: 'Fortnite vs Roblox', genre: 'Gaming', url: '/uploads/sample1.mp4' }
];
const userPreferences = {};

// --- MULTER STORAGE CONFIGURATION ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); 
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 * 1024 }, // 10 GB
    fileFilter: (req, file, cb) => {
        const filetypes = /mp4/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        if (mimetype && extname) return cb(null, true);
        cb(new Error('Error: Only .mp4 video formats are permitted!'));
    }
});

// --- API ENDPOINTS ---
app.post('/api/auth', (req, res) => {
    const { username, password } = req.body;
    
    if (!username) return res.status(400).json({ error: 'Username is required' });
    if (!password) return res.status(400).json({ error: 'Password is required' });
    
    const cleanUsername = username.trim().toLowerCase();

    // Check if the user already exists
    if (users.has(cleanUsername)) {
        // Verify password
        if (users.get(cleanUsername) !== password) {
            return res.status(401).json({ error: 'Incorrect password.' });
        }
    } else {
        // Register new user
        users.set(cleanUsername, password);
        if (!userPreferences[cleanUsername]) {
            userPreferences[cleanUsername] = { Comedy: 0, Tech: 0, Music: 0, Gaming: 0, Cooking: 0 };
        }
    }

    res.json({ message: 'Authentication successful', username: cleanUsername });
});

app.post('/api/interact', (req, res) => {
    const { username, genre } = req.body;
    if (!username || !genre) return res.status(400).json({ error: 'Missing telemetry metadata' });
    const cleanUser = username.trim().toLowerCase();
    if (userPreferences[cleanUser] && userPreferences[cleanUser][genre] !== undefined) {
        userPreferences[cleanUser][genre] += 1;
    }
    res.json({ success: true, currentPreferences: userPreferences[cleanUser] });
});

app.get('/api/feed', (req, res) => {
    const username = req.query.username?.trim().toLowerCase();
    if (!username || !userPreferences[username]) return res.json(databaseVideos); 

    const weights = userPreferences[username];
    const algorithmicFeed = [...databaseVideos].sort((a, b) => (weights[b.genre] || 0) - (weights[a.genre] || 0));
    res.json(algorithmicFeed);
});

app.post('/api/upload', upload.single('video'), (req, res) => {
    try {
        const { title, genre, username } = req.body;
        // Verify account exists
        if (!username || !users.has(username.trim().toLowerCase())) {
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(401).json({ error: 'Unauthorized: Account required.' });
        }
        if (!title || !genre || !req.file) {
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'Missing metadata or video payload.' });
        }
        const newVideo = {
           id: Date.now(),
           title: title,
           genre: genre,
           url: `/uploads/${req.file.filename}`, // Changed from http://localhost:5000
           author: username.toLowerCase()
        };
        databaseVideos.unshift(newVideo);
        res.status(201).json({ message: 'Video uploaded!', video: newVideo });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File size exceeds structural limit of 10 GB.' });
    }
    res.status(400).json({ error: err.message });
});

app.listen(PORT, () => {
    console.log(`🚀 ShortsTube app running on http://localhost:${PORT}`);
});