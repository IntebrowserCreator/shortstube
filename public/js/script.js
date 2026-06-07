let currentUser = localStorage.getItem('tiktok_user') || null;

// --- 1. GLOBAL INTERSECTION OBSERVER FOR SCROLL AUTOPLAY ---
const videoObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        const video = entry.target;
        
        if (entry.isIntersecting) {
            video.play().catch(err => {
                console.log("Autoplay interrupted: Waiting for a user interaction gesture to enable sound.", err);
            });
        } else {
            video.pause();
            video.currentTime = 0;
        }
    });
}, {
    threshold: 0.6 
});


// --- 2. AUTHENTICATION CONTROLS ---
function updateAuthUI() {
    const authBtn = document.getElementById('authBtn');
    const userStatus = document.getElementById('userStatus');
    if (currentUser) {
        authBtn.innerText = 'Log Out';
        authBtn.setAttribute('onclick', 'handleLogout()');
        userStatus.innerText = `@${currentUser}`;
    } else {
        authBtn.innerText = 'Login / Sign Up';
        authBtn.setAttribute('onclick', 'openModal("authModal")');
        userStatus.innerText = '';
    }
}

async function handleAuth() {
    const username = document.getElementById('authUsername').value.trim();
    const password = document.getElementById('authPassword').value;

    if (!username || !password) {
        alert("Please enter both a username and password.");
        return;
    }

    try {
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }) // Now sending the password to the backend
        });
        const data = await response.json();

        if (response.ok) {
            currentUser = data.username;
            localStorage.setItem('tiktok_user', currentUser);
            updateAuthUI();
            closeModal('authModal');
            
            // Clear inputs for security
            document.getElementById('authUsername').value = '';
            document.getElementById('authPassword').value = '';
            
            renderFeed(); 
            alert(`Welcome, @${currentUser}! You can now upload videos.`);
        } else {
            // Displays errors like "Incorrect password"
            alert(data.error || 'Authentication failed');
        }
    } catch (err) {
        console.error('Auth system error:', err);
        alert('Could not connect to the backend server.');
    }
}

function handleLogout() {
    currentUser = null;
    localStorage.removeItem('tiktok_user');
    updateAuthUI();
    renderFeed(); 
    alert('Logged out successfully.');
}

// --- 3. RECOMMENDATION ENGINE ALGORITHM (Backend Sync) ---
async function registerVideoInteraction(genre) {
    if (!currentUser) return; 

    try {
        const response = await fetch('/api/interact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser, genre })
        });
        const data = await response.json();
        
        if (response.ok) {
            const weights = data.currentPreferences;
            const sortedGenres = Object.keys(weights).sort((a, b) => weights[b] - weights[a]);
            document.getElementById('algoToast').innerText = `Algorithm tracking. Top Preference: ${sortedGenres[0]} (+${weights[sortedGenres[0]]})`;
        }
    } catch (err) {
        console.error('Failed to log telemetry data:', err);
    }
}

// --- 4. VIDEO RENDERING AND MANAGEMENT ---
async function renderFeed() {
    const feed = document.getElementById('feedContainer');
    feed.innerHTML = '<p style="color: #888; text-align: center; margin-top: 20px;">Curating your feed...</p>';

    try {
        const endpoint = currentUser ? `/api/feed?username=${currentUser}` : '/api/feed';
        const response = await fetch(endpoint);
        const algorithmicFeed = await response.json();

        feed.innerHTML = '';
        if (algorithmicFeed.length === 0) {
            feed.innerHTML = '<p style="color: #888; text-align: center; margin-top: 20px;">No video streams found.</p>';
            return;
        }

        algorithmicFeed.forEach(video => {
            const container = document.createElement('div');
            container.className = 'video-container';

            const vidElement = document.createElement('video');
            vidElement.src = video.url;
            vidElement.controls = true;
            vidElement.muted = false; 
            vidElement.loop = true;

            vidElement.onplay = () => {
                registerVideoInteraction(video.genre);
            };

            const overlay = document.createElement('div');
            overlay.className = 'video-overlay';
            overlay.innerHTML = `
                <div class="video-title">${escapeHTML(video.title)}</div>
                <div class="video-genre">#${video.genre}</div>
            `;

            container.appendChild(vidElement);
            container.appendChild(overlay);
            feed.appendChild(container);

            videoObserver.observe(vidElement);
        });
    } catch (err) {
        console.error('Error fetching data stream:', err);
        feed.innerHTML = '<p style="color: var(--accent-color); text-align: center; margin-top: 20px;">Failed to reach backend engine feed.</p>';
    }
}

// --- 5. VALIDATIONS & UPLOADS ---
async function handleUpload(event) {
    event.preventDefault();
    const errorDiv = document.getElementById('uploadError');
    errorDiv.style.color = "var(--accent-color)";
    errorDiv.style.display = 'none';

    if (!currentUser) {
        alert('Account required! Please Login or Sign Up to upload files.');
        closeModal('uploadModal');
        openModal('authModal');
        return;
    }

    const title = document.getElementById('videoTitle').value.trim();
    const genre = document.getElementById('videoGenre').value;
    const fileInput = document.getElementById('videoFile');
    const file = fileInput.files[0];

    if (!file) return;

    if (file.type !== "video/mp4" && !file.name.endsWith('.mp4')) {
        errorDiv.innerText = "Error: Invalid format. Only .mp4 file formats are permitted.";
        errorDiv.style.display = 'block';
        return;
    }

    const MAX_SIZE_BYTES = 10 * 1024 * 1024 * 1024; 
    if (file.size > MAX_SIZE_BYTES) {
        errorDiv.innerText = "Error: File sizes cannot exceed a maximum constraint limit of 10 GB.";
        errorDiv.style.display = 'block';
        return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('genre', genre);
    formData.append('username', currentUser);
    formData.append('video', file);

    errorDiv.style.color = "#aaa";
    errorDiv.innerText = "Processing server upload pipelines... Please do not close windows.";
    errorDiv.style.display = 'block';

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData 
        });
        const data = await response.json();

        if (response.ok) {
            document.getElementById('uploadForm').reset();
            closeModal('uploadModal');
            alert('Success! Your video was added to the main content index.');
            await renderFeed(); 
        } else {
            errorDiv.style.color = "var(--accent-color)";
            errorDiv.innerText = data.error || 'Upload configuration rejected.';
        }
    } catch (err) {
        console.error('File transmission pipeline failed:', err);
        errorDiv.style.color = "var(--accent-color)";
        errorDiv.innerText = "Critical error during backend file transmission.";
    }
}

// --- 6. UTILITIES / INTERFACE INITIALIZATION ---
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function escapeHTML(str) { return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)); }

// Start Application Frame
updateAuthUI();
renderFeed();