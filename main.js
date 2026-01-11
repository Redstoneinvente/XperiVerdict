if (!window.__ENV__) {
    throw new Error("ENV not loaded. Did you include config.js?");
}

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getDatabase, ref, onValue, push, set, get, update, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, createUserWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

const notFound = `./Resources/Images/Devices/not%20found.svg`;

const API_KEY = window.__ENV__.API_KEY;
const APP_ID = window.__ENV__.APP_ID;
const PROJECT_URL = window.__ENV__.PROJECT_URL;

const firebaseConfig = {
    apiKey: API_KEY,
    authDomain: "xperia-tracker.firebaseapp.com",
    databaseURL: PROJECT_URL,
    projectId: "xperia-tracker",
    appId: APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

let state = { devices: [], filteredDevicesTemp: [], currentDeviceIdx: null, currentVariantIdx: null, currentFwId: null, filter: 'all', searchQuery: '', searchQueryDevice: '', userRating: 0, activeReviews: [], deviceFilter: 'all', deviceYearFilter: 'all' };
let userNameL = "";
let userIDL = "";

let ratingID = -1;
let currentVisualScore = 0;

let allReviews = [];

window.copyShareLink = (pageId) => {
    const url = new URL(window.location.href);
    url.searchParams.set('page', pageId);

    if (state.currentDeviceIdx !== null) url.searchParams.set('d', state.currentDeviceIdx);
    if (state.currentVariantIdx !== null) url.searchParams.set('v', state.currentVariantIdx);
    if (state.currentFwId !== null && pageId === 'pageDetail') {
        const fw = state.devices[state.currentDeviceIdx].variants[state.currentVariantIdx].firmwares.find(f => f.ver.replace(/\./g, '_') === state.currentFwId);
        if (fw) url.searchParams.set('fw', fw.ver);
    }

    const shareUrl = url.toString();

    // Clipboard API
    const dummy = document.createElement('input');
    document.body.appendChild(dummy);
    dummy.value = shareUrl;
    dummy.select();
    document.execCommand('copy');
    document.body.removeChild(dummy);

    const toast = document.getElementById('toast');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
};

// Deep Link Handling
function handleDeepLink() {
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');
    const d = params.get('d');
    const v = params.get('v');
    const fw = params.get('fw');

    if (d !== null) state.currentDeviceIdx = parseInt(d);
    if (v !== null) state.currentVariantIdx = parseInt(v);

    if (page === 'pageDetail' && fw) {
        // We need data to be loaded first
        const checkData = setInterval(() => {
            if (state.devices.length > 0) {
                const dev = state.devices[state.currentDeviceIdx];
                const variant = dev.variants[state.currentVariantIdx];
                const targetFw = variant.firmwares.find(f => f.ver === fw);
                if (targetFw) {
                    showDetail(targetFw.ver, targetFw.date, targetFw.changelog);
                    clearInterval(checkData);
                }
            }
        }, 100);
    } else if (page === 'pageFirmwares' && v !== null) {
        const checkData = setInterval(() => {
            if (state.devices.length > 0) {
                selectVariant(parseInt(v));
                clearInterval(checkData);
            }
        }, 100);
    } else if (page === 'pageDevices') {
        nav('pageDevices');
    }
}

// --- AUTH LOGIC ---
window.handleLogin = () => {
    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPass').value;

    if (!email || !pass) {
        alert("Please fill in all fields");
        return;
    }

    signInWithEmailAndPassword(auth, email, pass)
        .catch(err => alert("Login Failed: " + err.message));
};

window.handleForgotPassword = () => {
    const email = document.getElementById('loginEmail').value;

    if (!email) {
        alert("Please enter your email address first so we can send a reset link.");
        return;
    }

    sendPasswordResetEmail(auth, email)
        .then(() => {
            alert("Password reset email sent! Check your inbox (and spam folder).");
        })
        .catch((error) => {
            const errorCode = error.code;
            const errorMessage = error.message;

            if (errorCode === 'auth/user-not-found') {
                alert("No account found with this email.");
            } else {
                alert("Error: " + errorMessage);
            }
        });
};

// Ensure 'window.' is present so the HTML onclick can "see" it
window.handleLogout = () => {
    signOut(auth)
        .then(() => {
            toggleModal(false); // Close the dropdown
            console.log("User signed out");
        })
        .catch((error) => {
            console.error("Sign out error:", error);
            alert("Error signing out: " + error.message);
        });
};

onAuthStateChanged(auth, user => {
    if (user) {
        // 1. Data Prep: Use displayName if it exists, otherwise fallback to email
        const initial = user.displayName ? user.displayName[0].toUpperCase() : (user.email ? user.email[0].toUpperCase() : 'U');
        const userName = user.displayName || (user.email ? user.email.split('@')[0] : 'User');

        userNameL = userName;
        userIDL = user.uid;

        // 2. Update Top Bar (The Circle)
        const profileButtons = document.querySelectorAll('.profileBtn');

        profileButtons.forEach(profileBtn => {
            if (profileBtn) profileBtn.innerText = initial;
        });

        //const profileBtn = document.getElementById('profileBtn');

        // 3. Update Dropdown Content
        const compAvatar = document.getElementById('compAvatar');
        const compName = document.getElementById('compUserName');
        const compEmail = document.getElementById('compUserEmail');

        if (compAvatar) compAvatar.innerText = initial;
        if (compName) compName.innerText = userName;
        if (compEmail) compEmail.innerText = user.email;

        nav('pageDevices');
        loadData();
        handleDeepLink();
    } else {
        nav('pageLogin');
    }
});

window.logout = () => signOut(auth);

window.toggleModal = (show) => {
    const menu = document.getElementById('profileDropdown');
    if (menu) {
        menu.style.display = show ? 'block' : 'none';
    }
};

let isRegisterMode = false;

window.toggleAuthMode = () => {
    isRegisterMode = !isRegisterMode;
    const title = document.getElementById('authTitle');
    const mainBtn = document.getElementById('mainAuthBtn');
    const toggleBtn = document.getElementById('toggleAuthBtn');

    if (isRegisterMode) {
        title.innerText = "Join XperiVerdict";
        mainBtn.innerText = "Create Account";
        mainBtn.onclick = window.handleRegister;
        toggleBtn.innerText = "Already have an account? Sign In";
    } else {
        title.innerText = "XperiVerdict";
        mainBtn.innerText = "Sign In";
        mainBtn.onclick = window.handleLogin;
        toggleBtn.innerText = "Create an account";
    }
};

window.handleRegister = () => {
    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPass').value;

    if (pass.length < 6) {
        alert("Password should be at least 6 characters.");
        return;
    }

    createUserWithEmailAndPassword(auth, email, pass)
        .then((userCredential) => {
            console.log("Registered:", userCredential.user);
            // onAuthStateChanged will automatically handle the nav to pageDevices
        })
        .catch((error) => {
            alert("Registration Error: " + error.message);
        });
};

// Close dropdown if user clicks anywhere else on the screen
document.addEventListener('click', (e) => {
    const menu = document.getElementById('profileDropdown');
    const buttons = document.querySelectorAll('.profileBtn');

    if (!menu || menu.style.display !== 'block') return;

    // Check if click was on ANY profile button
    const clickedOnButton = [...buttons].some(btn => btn.contains(e.target));

    if (!menu.contains(e.target) && !clickedOnButton) {
        toggleModal(false);
    }
});


// --- NAVIGATION ---
window.nav = (id) => {
    document.querySelectorAll('.page').forEach(p => p.classList.add('page-hidden'));
    document.getElementById(id).classList.remove('page-hidden');
};

// --- DATA LOADING ---
function loadData() {
    onValue(ref(db, 'devices'), snap => {
        state.devices = snap.val() || [];
        renderTier1();
    });
}

window.toggleModalSuggestion = function (show) {
    const modal = document.getElementById('modalOverlaySuggestion');
    if (!modal) return;
    if (show) {
        modal.style.display = 'flex';
        modal.classList.add('show');   // triggers animation
    } else {
        modal.style.display = 'none';
        modal.classList.remove('show');
    }
}

toggleModalSuggestion(false);

document.getElementById('modalOverlaySuggestion').addEventListener('click', (e) => {
    const modalContent = e.currentTarget.querySelector('.modal-content');
    if (!modalContent.contains(e.target)) {
        toggleModalSuggestion(false);
    }
});

window.submitSuggestion = async function (e) {
    e.preventDefault();

    const model1 = document.getElementById('suggestModel').value;
    const email1 = document.getElementById('suggestEmail').value;
    const change1 = document.getElementById('suggestChange').value;
    const errorDiv = document.getElementById('suggestionError');

    const scriptURL = "https://script.google.com/macros/s/AKfycbxKuPju90YVtchM3uKhJT0XOhlDtGfFpniuFqM0OGvou84pTn8mF6_pbVpfirweU_mv/exec";

    try {
        await fetch(scriptURL, {
            method: 'POST',
            body: JSON.stringify({ model: model1, email: email1, change: change1 }),
            mode: 'no-cors'
        });

        // On success: hide modal & show success card
        const overlay = document.getElementById('modalOverlaySuggestion');
        overlay.style.display = 'none';

        const successCard = document.createElement('div');
        successCard.className = 'success-card';
        successCard.innerHTML = `
                    <h2>Request Received!</h2>
                    <p>A verification email has been sent to <strong>${email1}</strong>.<br>We will review your suggestion shortly.</p>
                    <button onclick="location.reload()" class="send-btn" style="margin-top:20px;">Back to Home</button>
                `;
        document.body.appendChild(successCard);

    } catch (error) {
        // Show error toast
        errorDiv.textContent = "Failed to send suggestion!";
        errorDiv.style.display = 'block';
        setTimeout(() => { errorDiv.style.display = 'none'; }, 4000);
    }
}


/*
mask: url('./Resources/Images/Devices/${encodeURIComponent(d.name)}.svg') no-repeat center;
                        -webkit-mask: url('./Resources/Images/Devices/${encodeURIComponent(d.name)}.svg') no-repeat center;
*/

// 1. MAIN LIST (WITH DESCRIPTION)
function renderTier1() {

    const list = state.devices || [];

    const filtered = list.filter(f => {
        if (!f) return false;
        const searchMatch = f.name.toLowerCase().includes(state.searchQueryDevice.toLowerCase());

        if (state.deviceFilter === 'all') {
            return searchMatch;
        }

        let filterMatch = false;

        let deviceNameMatch = f.name.toLowerCase().includes(state.deviceFilter.toLowerCase());

        if (deviceNameMatch) {
            filterMatch = true;
        }

        return searchMatch && filterMatch;
    });

    state.filteredDevicesTemp = filtered;

    document.getElementById('deviceList').innerHTML = filtered.map((d, i) => `
                <div class="m3-card" onclick="selectDevice(${list.indexOf(d)})">
                    <div style="display:flex; align-items:center; gap:16px;">
                        <div style="width:72px; height:72px; background:var(--m3-p-c); border-radius:12px; display:grid; place-items:center;">
                            <div class="device-mask" style="
                                width: 90%;
                                height: 90%;
                                background-color: var(--m3-on-p-c);
                                mask: url('./Resources/Images/Devices/not%20found.svg') no-repeat center;
                                -webkit-mask: url('./Resources/Images/Devices/not%20found.svg') no-repeat center;
                                mask-size: 95% 95%;">
                            </div>
                        </div>
                        <div style="flex:1">
                            <h3 style="margin:0; font-size: 1.1rem;">${d.name}</h3>
                            <div style="font-size: 0.8rem; color: var(--m3-out); margin-top: 4px;">${d.description || d.desc || 'Xperia Device'}</div>
                        </div>
                    </div>
                </div>
            `).join('') + `<button onclick="logout()" style="width:100%; background:none; border:1px solid var(--m3-out-var); padding:12px; border-radius:12px; color:var(--m3-out); margin-top:20px;">Sign Out</button>`;

    updateMasks();
}

function toggleDeviceChips(show) {
    const el = document.getElementById('deviceYearChip');
    el.style.display = show ? 'flex' : 'none';
}

function checkFileExists(url) {
    return new Promise(resolve => {
        const img = new Image();
        img.src = url;
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
    });
}

async function updateMasks() {
    const masks = document.querySelectorAll('#deviceList .device-mask');

    for (let i = 0; i < state.filteredDevicesTemp.length; i++) {
        let index = state.devices.indexOf(state.filteredDevicesTemp[i]);

        const d = state.devices[index];
        const maskDiv = masks[i];

        const fileName = encodeURIComponent(d.name);
        const url = `./Resources/Images/Devices/${fileName}.svg`;
        const fallback = notFound; // optional

        const exists = checkFileExists(url).then(exists => {
            const maskFile = exists ? url : fallback;
            maskDiv.style.maskImage = `url('${maskFile}')`;
            maskDiv.style.webkitMaskImage = `url('${maskFile}')`;
        });
    }
}

// --- TIER 2 & 3 (Rest of your functions: selectDevice, selectVariant, renderTier3, etc.) ---
// Ensure renderTier3 includes the safety checks we discussed previously!

function renderTier3() {
    const v = state.devices[state.currentDeviceIdx].variants[state.currentVariantIdx];
    const list = v.firmwares || [];

    const filtered = list.filter(f => {
        if (!f || !f.ver) return false;
        const searchMatch = f.ver.toLowerCase().includes(state.searchQuery.toLowerCase());

        if (state.filter === 'all') {
            return searchMatch;
        }

        let filterMatch = false;

        if (state.filter === 'Android' && f.type === 'os') {
            filterMatch = true;
        }

        if (state.filter === 'Security' && f.type === 'security') {
            filterMatch = true;
        }

        return searchMatch && filterMatch;
    });

    const fwListEl = document.getElementById('fwList');
    fwListEl.innerHTML = filtered.length > 0 ? filtered.map(f => `
                <div class="m3-card" onclick="showDetail('${f.ver}', '${f.date || 'Unknown'}', '${(f.changelog || f.log || 'Pending.').replace(/'/g, "\\'")}')">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div style="font-weight:700;">${f.ver}</div>
                            <div style="font-size:0.75rem; color:var(--m3-out);">Android ${f.android || 'N/A'} • ${f.date || 'Recent'}</div>
                        </div>
                        <span class="material-symbols-rounded" style="color:var(--m3-p)">arrow_forward</span>
                    </div>
                </div>
            `).join('') : `<p style="text-align:center; color:var(--m3-out); margin-top:40px;">No updates found.</p>`;
}

// (Add remaining selectDevice, selectVariant, showDetail, loadCommunityData, setFilter, submitStarOnly, submitTextReport functions here)

window.selectDevice = (idx) => {
    state.currentDeviceIdx = idx;
    const d = state.devices[idx];

    document.getElementById('currentDeviceName2').innerText = d.name;
    document.getElementById('currentDeviceDesc2').innerText = d.description || d.desc || "Performance tracking enabled.";

    const newSrc = `./Resources/Images/Devices/${encodeURIComponent(d.name)}.svg`;
    const el = document.getElementById("deviceIconVisual1");

    const img = new Image();
    img.src = newSrc;

    img.onerror = () => {
        el.innerHTML = `
                <div id="deviceIconVisual1"
                style="
                    width: 8rem;
                    height: 8rem;
                    background-color: var(--m3-on-p-c);

                    mask-image: url('${notFound}');
                    mask-repeat: no-repeat;
                    mask-position: center;
                    mask-size: 95% 95%;

                    -webkit-mask-image: url('${notFound}');
                    -webkit-mask-repeat: no-repeat;
                    -webkit-mask-position: center;
                    -webkit-mask-size: 96% 96%;
                ">
            </div>
                `;
    };

    el.innerHTML = `
            <div id="deviceIconVisual1"
                style="
                    width: 8rem;
                    height: 8rem;
                    background-color: var(--m3-on-p-c);

                    mask-image: url('./Resources/Images/Devices/${encodeURIComponent(d.name)}.svg');
                    mask-repeat: no-repeat;
                    mask-position: center;
                    mask-size: 95% 95%;

                    -webkit-mask-image: url('./Resources/Images/Devices/${encodeURIComponent(d.name)}.svg');
                    -webkit-mask-repeat: no-repeat;
                    -webkit-mask-position: center;
                    -webkit-mask-size: 96% 96%;
                ">
            </div>
            `;

    document.getElementById('variantTitle').innerText = d.name;
    document.getElementById('variantList').innerHTML = (d.variants || []).map((v, i) => `
                <div class="m3-card" onclick="selectVariant(${i})">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div style="font-weight:700;">${v.model}</div>
                            <div style="font-size:0.8rem; color:var(--m3-out);">${v.region}</div>
                        </div>
                        <span class="material-symbols-rounded">chevron_right</span>
                    </div>
                </div>
            `).join('');
    nav('pageVariants');
};

// 2. ADDED DESCRIPTION TO FIRMWARE HEADER
window.selectVariant = (vIdx) => {
    state.currentVariantIdx = vIdx;
    const d = state.devices[state.currentDeviceIdx];
    const v = d.variants[vIdx];
    document.getElementById('modelCodeHeader').innerText = v.model;
    document.getElementById('currentDeviceName').innerText = d.name;
    document.getElementById('currentDeviceDesc').innerText = d.description || d.desc || "Performance tracking enabled.";

    let newSrc = `./Resources/Images/Devices/${encodeURIComponent(d.name)}.svg`;
    const el = document.getElementById("deviceIconVisual2");

    const img = new Image();
    img.src = newSrc;

    img.onerror = () => {
        el.innerHTML = `
                <div id="deviceIconVisual2"
                    style="
                        width: 8rem;
                        height: 8rem;
                        background-color: var(--m3-on-p-c);

                        mask-image: url('${notFound}');
                        mask-repeat: no-repeat;
                        mask-position: center;
                        mask-size: 95% 95%;

                        -webkit-mask-image: url('${notFound}');
                        -webkit-mask-repeat: no-repeat;
                        -webkit-mask-position: center;
                        -webkit-mask-size: 96% 96%;
                    ">
                </div>
                `;
    };

    el.innerHTML = `
            <div id="deviceIconVisual2"
                style="
                    width: 8rem;
                    height: 8rem;
                    background-color: var(--m3-on-p-c);

                    mask-image: url('./Resources/Images/Devices/${encodeURIComponent(d.name)}.svg');
                    mask-repeat: no-repeat;
                    mask-position: center;
                    mask-size: 95% 95%;

                    -webkit-mask-image: url('./Resources/Images/Devices/${encodeURIComponent(d.name)}.svg');
                    -webkit-mask-repeat: no-repeat;
                    -webkit-mask-position: center;
                    -webkit-mask-size: 96% 96%;
                ">
            </div>
            `;

    renderTier3();
    nav('pageFirmwares');
};

window.setFilter = (type, el) => {
    state.filter = type;

    // UI Update
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');

    renderTier3();
};

window.setDeviceFilter = (type, el) => {
    state.deviceFilter = type;

    // UI Update
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');

    renderTier1();
};

window.setDeviceYearFilter = (type, el) => {
    state.deviceYearFilter = type;

    // UI Update
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');

    renderTier1();
};

window.showDetail = (ver, date, log) => {
    state.currentFwId = ver.replace(/\./g, '_');
    document.getElementById('detVer').innerText = ver;
    document.getElementById('detMeta').innerText = `Official Deployment: ${date}`;
    document.getElementById('detChangelog').innerText = log;

    state.userRating = 0;
    document.querySelectorAll('#starSelector span').forEach(s => s.classList.remove('active'));

    loadCommunityData(state.currentFwId);
    nav('pageDetail');
};

function loadCommunityData(fwId) {
    const currentDeviceName = state.devices[state.currentDeviceIdx]?.name;
    const modelCode = state.devices[state.currentDeviceIdx]?.variants[state.currentVariantIdx]?.model;

    onValue(ref(db, `feedback/${currentDeviceName}/${modelCode}/${fwId}`), snap => {
        const data = snap.val() || {};
        let bugs = [], imps = [], totalRating = 0, count = 0;

        Object.values(data).forEach(entry => {
            //if(entry.rating) { totalRating += entry.rating; count++; }
            if (entry.type === 'bug' && entry.comment) bugs.push(entry);
            if (entry.type === 'improvement' && entry.comment) imps.push(entry);

            allReviews.push(entry);
        });

        //document.getElementById('avgRatingScore').innerText = count > 0 ? (totalRating / count).toFixed(1) : "No Ratings";

        // Injecting Bugs logic
        const bugContainer = document.getElementById('bugContainer');
        if (bugs.length > 0) {
            bugContainer.innerHTML = bugs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
                .slice(0, 3)
                .map(b => createReviewCard(b))
                .join('');
        } else {
            bugContainer.innerHTML = '<div style="padding:20px; color:var(--m3-out); font-size:0.8rem;">No critical issues reported.</div>';
        }

        // Injecting Improvements logic
        const impContainer = document.getElementById('improvementContainer');
        if (imps.length > 0) {
            impContainer.innerHTML = imps.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
                .slice(0, 3)
                .map(i => createReviewCard(i))
                .join('');
        } else {
            impContainer.innerHTML = '<div style="padding:20px; color:var(--m3-out); font-size:0.8rem;">Stable performance reported.</div>';
        }
    });

    onValue(ref(db, `ratings/${currentDeviceName}/${modelCode}/${state.currentFwId}`), snap => {
        const data = snap.val() || {};
        let totalRating = 0, count = 0;

        Object.values(data).forEach(entry => {
            totalRating += entry.rating;

            if (entry.userId === userIDL) {
                showRating(entry.rating);
                ratingID = count;
            }

            count++;
        });

        let finalScore = (totalRating / count).toFixed(1);

        document.getElementById('avgRatingScore').innerText = count > 0 ? finalScore : "No Ratings";
        animateScore(finalScore);
    });
}

function showRating(starRating) {
    document.querySelectorAll('#starSelector span').forEach((s, i) => {
        s.classList.toggle('active', i < starRating);
    });
}

function animateScore(targetValue) {
    const el = document.getElementById('avgRatingScore');
    const startValue = currentVisualScore;
    const duration = 1600;
    const startTime = performance.now();

    function update(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease Out Expo
        const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);

        const currentValue = startValue + (targetValue - startValue) * easeProgress;
        el.innerText = currentValue.toFixed(1);
        currentVisualScore = currentValue;

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            el.innerText = targetValue.toFixed(1);
            currentVisualScore = targetValue;
        }
    }
    requestAnimationFrame(update);
}

function formatDate(timestamp) {
    if (!timestamp) return "Recently";
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function createReviewCard(entry) {
    const userEmail = entry.userName || "Anonymous";
    const initial = entry.userName[0].toUpperCase();
    const time = formatDate(entry.timestamp);

    return `
                <div class="review-card">
                    <div class="review-avatar">${initial}</div>
                    <div class="review-content">
                        <div class="review-header">
                            <span class="review-user">${userEmail.split('@')[0]}</span>
                            <span class="review-time">${time}</span>
                        </div>
                        <div class="review-text">${entry.comment}</div>
                    </div>
                </div>
            `;
}

window.setFilter = (type, el) => {
    state.filter = type;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    renderTier3();
};

document.getElementById('fwSearchInput').addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderTier3();
});

document.getElementById('deviceSearchInput').addEventListener('input', (e) => {
    state.searchQueryDevice = e.target.value;
    renderTier1();
});

window.submitStarOnly = async () => {
    const user = auth.currentUser;
    if (!user) return alert("You must be signed in.");
    if (!state.userRating) return alert("Select stars!");

    const currentDeviceName = state.devices[state.currentDeviceIdx]?.name;
    const modelCode = state.devices[state.currentDeviceIdx]?.variants[state.currentVariantIdx]?.model;

    if (!currentDeviceName || !modelCode) return alert("Error determining device.");

    const ratingRef = ref(db, `ratings/${currentDeviceName}/${modelCode}/${state.currentFwId}`);

    try {
        // Fetch existing ratings at this path to see if user has already voted
        const snapshot = await get(ratingRef);
        const data = snapshot.val() || {};

        // Find existing key for this user
        let existingKey = null;
        Object.keys(data).forEach(key => {
            if (data[key].userId === user.uid) existingKey = key;
        });

        const payload = {
            rating: state.userRating,
            userId: user.uid,
            userName: user.displayName || user.email.split('@')[0],
            userEmail: user.email,
            timestamp: Date.now()
        };

        if (existingKey) {
            // UPDATE existing vote
            await update(ref(db, `ratings/${currentDeviceName}/${modelCode}/${state.currentFwId}/${existingKey}`), payload);
        } else {
            // PUSH new vote
            await push(ratingRef, payload);
        }
    } catch (err) {
        alert("Error: " + err.message);
    }
};

window.submitTextReport = () => {
    const user = auth.currentUser;
    if (!user) return alert("You must be signed in.");
    const comment = document.getElementById('contributionText').value.trim();
    const type = document.getElementById('contributionType').value;
    if (!comment) return alert("Please enter details.");

    const currentDeviceName = state.devices[state.currentDeviceIdx]?.name;
    const modelCode = state.devices[state.currentDeviceIdx]?.variants[state.currentVariantIdx]?.model;

    push(ref(db, `feedback/${currentDeviceName}/${modelCode}/${state.currentFwId}`), {
        comment,
        type,
        userId: user.uid,
        userName: userNameL,
        userEmail: user.email,
        timestamp: Date.now()
    });

    document.getElementById('contributionText').value = "";
};

document.querySelectorAll('#starSelector span').forEach(star => {
    star.onclick = () => {
        state.userRating = parseInt(star.dataset.v);
        document.querySelectorAll('#starSelector span').forEach((s, i) => {
            s.classList.toggle('active', i < state.userRating);
        });
    };
});

// UI Injection for specific review categories
window.openReviewCategory = (type) => {
    const title = type === 'bug' ? 'Reported Issues' : 'Improvements & Pros';
    document.getElementById('reviewTitle').innerText = title;

    const listEl = document.getElementById('fullReviewList');
    const filtered = allReviews.filter(r => r.type === type);

    listEl.innerHTML = "";

    if (filtered.length === 0) {
        listEl.innerHTML = `<div style="padding:40px; text-align:center; color:gray;">No feedback submitted yet.</div>`;
    } else {
        listEl.innerHTML = filtered.map(r => `
                    <div class="full-review-item" style="display:flex; gap:10px; align-items:flex-start;">
                    
                    <!-- Profile Picture -->
                    <div class="review-avatar">${r.userName[0].toUpperCase()}</div>

                    <!-- Review Content -->
                    <div style="flex:1;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
                            
                            <!-- Username + Date -->
                            <div>
                                <div style="font-size:0.85rem; font-weight:600;">
                                    ${r.userName || 'Anonymous'}
                                </div>
                                <span class="label-meta" style="font-size:0.65rem;">
                                    ${new Date(r.timestamp).toLocaleDateString()}
                                </span>
                            </div>

                            <!-- Verified Badge -->
                            <span style="color: var(--m3-p); font-size: 0.8rem; font-weight:600;">
                                Verified User
                            </span>
                        </div>

                        <!-- Comment -->
                        <div style="font-size: 0.95rem; line-height:1.4;">
                            ${r.comment}
                        </div>
                    </div>
                </div>
                `).join('');
    }

    nav('pageReviews');
};

// Footer Injection for all pages
// Run this once to inject the footer into all pages
document.querySelectorAll('.page').forEach(page => {
    const footer = document.createElement('footer');
    footer.className = 'legal-footer';
    footer.innerHTML = `
                <div class="legal-text">
                    <p><strong>XperiVerdict</strong> is an independent community resource.</p>
                    <p>This platform is <strong>not affiliated with, authorized, or endorsed by Sony Group Corporation</strong> or its subsidiaries.</p>
                    <p>SONY and Xperia are registered trademarks of Sony Group Corporation. All other product names, logos, and brands are property of their respective owners.</p>
                    <p>© 2026 XperiVerdict • <a href="terms-and-service.html" class="legal-link">Terms of Service</a></p>
                </div>
            `;
    page.appendChild(footer);
});