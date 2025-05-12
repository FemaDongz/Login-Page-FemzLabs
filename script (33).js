/**
 * Femz Labs Authentication Script
 * Handles login, registration, verification, avatar selection, and password recovery.
 * Fully compatible with provided index.html and optimized for all systems.
 */

// Utility Functions
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    return input.replace(/[<>&;"]/g, match => ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        ';': '&#59;',
        '"': '&quot;'
    }[match])).trim();
}

// Fetch API Wrapper
async function fetchPlayers(action, data = {}) {
    try {
        const response = await fetch('save_players.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, ...data })
        });
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const result = await response.json();
        return result;
    } catch (err) {
        console.error(`Fetch error for ${action}:`, err);
        showNotification('Network error. Please try again.', 3000, null, 'error');
        return { success: false, error: err.message };
    }
}

// Validation Functions
function validateGmailFormat(gmail) {
    return gmail && /^[^\s@]+@gmail\.com$/.test(gmail);
}

async function isGmailUnique(gmail) {
    const cleanGmail = sanitizeInput(gmail);
    const result = await fetchPlayers('check_gmail', { gmail: cleanGmail });
    return result.success && !result.exists;
}

function validatePhoneNumberFormat(phone) {
    return phone && /^\+62\d{9,12}$/.test(phone);
}

async function isPhoneUnique(phone) {
    const cleanPhone = sanitizeInput(phone);
    const result = await fetchPlayers('check_phone', { phone: cleanPhone });
    return result.success && !result.exists;
}

function validateUsernameFormat(username) {
    return username && /^[a-zA-Z0-9._]{5,}$/.test(username);
}

async function isUsernameUnique(username) {
    const cleanUsername = sanitizeInput(username);
    const result = await fetchPlayers('check_username', { username: cleanUsername });
    return result.success && !result.exists;
}

function validatePassword(password) {
    if (!password) {
        return { length: false, uppercase: false, number: false, noSpecial: false };
    }
    return {
        length: password.length >= 8,
        uppercase: /[A-Z]/.test(password),
        number: /\d/.test(password),
        noSpecial: /^[a-zA-Z0-9]*$/.test(password)
    };
}

// Notification System
function showNotification(message, duration, redirectUrl, type = 'success') {
    const notification = document.getElementById('notification');
    const notificationText = document.getElementById('notification-text');
    const loadingBarFill = document.getElementById('loading-bar-fill');
    if (!notification || !notificationText || !loadingBarFill) {
        console.error('Notification elements missing');
        return;
    }
    notificationText.textContent = sanitizeInput(message);
    notification.setAttribute('aria-live', 'assertive');
    notification.className = `notification ${type} show`;
    loadingBarFill.className = 'loading-bar-fill active';
    setTimeout(() => {
        notification.className = 'notification';
        loadingBarFill.className = 'loading-bar-fill';
        notification.removeAttribute('aria-live');
        if (redirectUrl) window.location.href = redirectUrl;
    }, duration);
}

// WhatsApp Verification
function sendWhatsAppVerification(phone, type = 'register') {
    try {
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const message = encodeURIComponent(
            `Your Femz Labs ${type === 'forgot-password' ? 'password recovery' : 'verification'} code is ${code}. Reply with this code to verify.`
        );
        const whatsappUrl = `https://wa.me/${sanitizeInput(phone).replace('+', '')}?text=${message}`;
        localStorage.setItem(`${type}VerificationCode`, code);
        localStorage.setItem(`${type}PendingKey`, sanitizeInput(phone));
        localStorage.setItem(`${type}CodeTimestamp`, Date.now().toString());
        localStorage.setItem(`${type}CsrfToken`, generateUUID());
        window.open(whatsappUrl, '_blank');
        showNotification(`Verification code sent to ${phone}.`, 3000, null, 'success');
        return code;
    } catch (err) {
        console.error('WhatsApp verification error:', err);
        showNotification('Failed to send verification code.', 3000, null, 'error');
        return null;
    }
}

function isValidCode(code, storedCode, timestamp) {
    const codeExpiry = 60 * 1000; // 1 minute
    return code === storedCode && Date.now() - timestamp < codeExpiry;
}

function startVerificationTimer(timerId, codeType) {
    const timerElement = document.getElementById(timerId);
    const codeInput = document.getElementById(codeType === 'register' ? 'verify-code' : 'forgot-password-code');
    const resendLink = document.getElementById(codeType === 'register' ? 'resend-link' : 'forgot-password-resend-link');
    const resendTimer = document.getElementById(codeType === 'register' ? 'resend-timer' : 'forgot-password-resend-timer');
    if (!timerElement || !codeInput || !resendLink || !resendTimer) {
        console.error('Timer elements missing');
        showNotification('Timer initialization failed.', 3000, null, 'error');
        return;
    }

    let timeLeft = 60;
    resendLink.classList.remove('enabled');
    resendTimer.textContent = '01:00';
    codeInput.disabled = false;
    codeInput.placeholder = document.documentElement.lang === 'en' ? 'Enter the 6-digit code' : 'Masukkan kode 6 digit';

    const interval = setInterval(() => {
        if (timeLeft <= 0) {
            clearInterval(interval);
            timerElement.textContent = '00:00';
            codeInput.disabled = true;
            codeInput.placeholder = document.documentElement.lang === 'en' ? 'Code expired' : 'Kode kadaluarsa';
            resendLink.classList.add('enabled');
            resendTimer.textContent = '';
            return;
        }
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        timerElement.textContent = timeStr;
        resendTimer.textContent = timeStr;
        timeLeft--;
    }, 1000);
}

// Form Management
function resetIndicators(formId) {
    const indicators = document.querySelectorAll(`#${formId} .validation-indicator, #${formId} .validation-list`);
    indicators.forEach(ind => ind.classList.remove('show'));
    const dots = document.querySelectorAll(`#${formId} .dot`);
    dots.forEach(dot => dot.className = 'dot');
}

function showForm(formId) {
    const forms = ['login-form', 'register-form', 'verify-form', 'avatar-form', 'forgot-password-form'];
    const footer = document.getElementById('footer');
    forms.forEach(id => {
        const form = document.getElementById(id);
        if (form) {
            form.classList.toggle('form-hidden', id !== formId);
            form.classList.toggle('form-visible', id === formId);
        }
    });
    if (footer) footer.style.display = 'block';
    resetIndicators(formId);

    if (formId === 'login-form') {
        ['login-gmail', 'login-password'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    } else if (formId === 'register-form') {
        ['register-gmail', 'register-phone', 'register-password', 'register-confirm-password'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = id === 'register-phone' ? '+62' : '';
        });
        goToStep1();
    } else if (formId === 'verify-form') {
        const verifyCode = document.getElementById('verify-code');
        const verifyError = document.getElementById('verify-code-error');
        const verifyContent = document.getElementById('verify-content');
        const loading = document.getElementById('loading');
        const csrfToken = document.getElementById('csrf-token');
        if (verifyCode) verifyCode.value = '';
        if (verifyError) verifyError.classList.remove('show');
        if (verifyContent) verifyContent.style.display = 'none';
        if (loading) loading.style.display = 'flex';
        if (csrfToken) csrfToken.value = localStorage.getItem('registerCsrfToken') || '';
        setTimeout(() => {
            if (loading) loading.style.display = 'none';
            if (verifyContent) verifyContent.style.display = 'block';
            startVerificationTimer('verify-timer', 'register');
        }, 2000);
    } else if (formId === 'avatar-form') {
        initializeAvatarSelection();
        const username = document.getElementById('register-username');
        const description = document.getElementById('register-description');
        if (username) username.value = '';
        if (description) description.value = '';
    } else if (formId === 'forgot-password-form') {
        ['forgot-password-gmail', 'forgot-password-phone', 'forgot-password-code', 'forgot-password-new', 'forgot-password-confirm'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = id === 'forgot-password-phone' ? '+62' : '';
        });
        ['forgot-password-input', 'forgot-password-verify', 'forgot-password-reset'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = id === 'forgot-password-input' ? 'block' : 'none';
        });
    }
}

function showLogin() {
    showForm('login-form');
}

function showRegister() {
    showForm('register-form');
}

function showVerify() {
    showForm('verify-form');
}

function showAvatar() {
    showForm('avatar-form');
}

function showForgotPassword() {
    showForm('forgot-password-form');
}

function showForgotPasswordVerify() {
    const input = document.getElementById('forgot-password-input');
    const verify = document.getElementById('forgot-password-verify');
    const reset = document.getElementById('forgot-password-reset');
    const code = document.getElementById('forgot-password-code');
    const csrfToken = document.getElementById('forgot-password-csrf-token');
    if (input) input.style.display = 'none';
    if (verify) verify.style.display = 'block';
    if (reset) reset.style.display = 'none';
    if (code) {
        code.value = '';
        code.disabled = false;
        code.placeholder = document.documentElement.lang === 'en' ? 'Enter the 6-digit code' : 'Masukkan kode 6 digit';
    }
    if (csrfToken) csrfToken.value = localStorage.getItem('forgot-passwordCsrfToken') || '';
    startVerificationTimer('forgot-password-timer', 'forgot-password');
}

function showForgotPasswordReset() {
    const input = document.getElementById('forgot-password-input');
    const verify = document.getElementById('forgot-password-verify');
    const reset = document.getElementById('forgot-password-reset');
    const newPassword = document.getElementById('forgot-password-new');
    const confirmPassword = document.getElementById('forgot-password-confirm');
    if (input) input.style.display = 'none';
    if (verify) verify.style.display = 'none';
    if (reset) reset.style.display = 'block';
    if (newPassword) newPassword.value = '';
    if (confirmPassword) confirmPassword.value = '';
    resetIndicators('forgot-password-form');
}

function goToStep1() {
    const step1 = document.getElementById('register-step1');
    const step2 = document.getElementById('register-step2');
    if (step1 && step2) {
        step1.classList.remove('register-step-hidden');
        step1.classList.add('register-step-visible');
        step2.classList.remove('register-step-visible');
        step2.classList.add('register-step-hidden');
        resetIndicators('register-form');
        ['register-gmail', 'register-phone', 'register-password', 'register-confirm-password'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = id === 'register-phone' ? '+62' : '';
        });
    }
}

async function goToStep2() {
    const gmail = document.getElementById('register-gmail')?.value.trim();
    const phone = document.getElementById('register-phone')?.value.trim();
    const gmailError = document.getElementById('register-gmail-error');
    const phoneError = document.getElementById('register-phone-error');
    if (!gmail || !phone) {
        showNotification(document.documentElement.lang === 'en' ? 'Please fill in all fields.' : 'Harap isi semua kolom.', 3000, null, 'error');
        return;
    }
    const isGmailValid = validateGmailFormat(gmail);
    const isGmailUniqueResult = isGmailValid ? await isGmailUnique(gmail) : false;
    const isPhoneValid = validatePhoneNumberFormat(phone);
    const isPhoneUniqueResult = isPhoneValid ? await isPhoneUnique(phone) : false;
    let hasError = false;
    if (!isGmailValid) {
        if (gmailError) gmailError.classList.add('show');
        showNotification(document.documentElement.lang === 'en' ? 'Invalid Gmail address.' : 'Alamat Gmail tidak valid.', 3000, null, 'error');
        hasError = true;
    } else if (!isGmailUniqueResult) {
        if (gmailError) gmailError.classList.add('show');
        showNotification(document.documentElement.lang === 'en' ? 'Gmail already registered.' : 'Gmail sudah terdaftar.', 3000, null, 'error');
        hasError = true;
    } else {
        if (gmailError) gmailError.classList.remove('show');
    }
    if (!isPhoneValid) {
        if (phoneError) phoneError.classList.add('show');
        showNotification(document.documentElement.lang === 'en' ? 'Invalid phone number.' : 'Nomor telepon tidak valid.', 3000, null, 'error');
        hasError = true;
    } else if (!isPhoneUniqueResult) {
        if (phoneError) phoneError.classList.add('show');
        showNotification(document.documentElement.lang === 'en' ? 'Phone number already registered.' : 'Nomor telepon sudah terdaftar.', 3000, null, 'error');
        hasError = true;
    } else {
        if (phoneError) phoneError.classList.remove('show');
    }
    if (hasError) return;
    const step1 = document.getElementById('register-step1');
    const step2 = document.getElementById('register-step2');
    if (step1 && step2) {
        step1.classList.remove('register-step-visible');
        step1.classList.add('register-step-hidden');
        step2.classList.remove('register-step-hidden');
        step2.classList.add('register-step-visible');
    }
}

// Avatar Selection
function initializeAvatarSelection() {
    const carousel = document.getElementById('avatar-carousel');
    const prevButton = document.getElementById('avatar-prev');
    const nextButton = document.getElementById('avatar-next');
    const stage = document.getElementById('avatar-stage');
    if (!carousel || !prevButton || !nextButton || !stage) {
        console.error('Avatar carousel elements missing');
        showNotification(document.documentElement.lang === 'en' ? 'Failed to load avatar selection.' : 'Gagal memuat pemilihan avatar.', 3000, null, 'error');
        return;
    }

    let currentIndex = 0;
    const avatars = carousel.querySelectorAll('.avatar');
    const totalAvatars = avatars.length;

    // Initialize existing avatars
    avatars.forEach((avatar, index) => {
        avatar.dataset.index = index;
        avatar.onerror = () => {
            avatar.src = 'default.png';
            avatar.alt = document.documentElement.lang === 'en' ? 'Default Avatar' : 'Avatar Default';
        };
        avatar.onclick = () => selectAvatar(index);
    });

    // Set initial selection
    const initialAvatar = avatars[0];
    if (initialAvatar) {
        initialAvatar.classList.add('selected');
        carousel.dataset.currentIndex = '0';
        stage.scrollTo({ left: initialAvatar.offsetLeft - (stage.offsetWidth - initialAvatar.offsetWidth) / 2, behavior: 'smooth' });
    }

    function selectAvatar(index) {
        currentIndex = Math.max(0, Math.min(totalAvatars - 1, index));
        avatars.forEach((avatar, i) => {
            avatar.classList.toggle('selected', i === currentIndex);
        });
        carousel.dataset.currentIndex = currentIndex;

        const avatar = avatars[currentIndex];
        const scrollLeft = avatar.offsetLeft - (stage.offsetWidth - avatar.offsetWidth) / 2;
        stage.scrollTo({ left: scrollLeft, behavior: 'smooth' });
    }

    prevButton.onclick = () => {
        if (currentIndex > 0) selectAvatar(currentIndex - 1);
    };

    nextButton.onclick = () => {
        if (currentIndex < totalAvatars - 1) selectAvatar(currentIndex + 1);
    };

    // Keyboard navigation
    stage.addEventListener('keydown', e => {
        if (e.key === 'ArrowLeft' && currentIndex > 0) {
            selectAvatar(currentIndex - 1);
            e.preventDefault();
        } else if (e.key === 'ArrowRight' && currentIndex < totalAvatars - 1) {
            selectAvatar(currentIndex + 1);
            e.preventDefault();
        }
    });

    // Touch swipe support
    let touchStartX = 0;
    let isSwiping = false;
    stage.addEventListener('touchstart', e => {
        if (isSwiping) return;
        touchStartX = e.touches[0].clientX;
        isSwiping = true;
    }, { passive: true });

    stage.addEventListener('touchend', e => {
        if (!isSwiping) return;
        const touchEndX = e.changedTouches[0].clientX;
        const deltaX = touchEndX - touchStartX;
        if (deltaX > 30 && currentIndex > 0) {
            selectAvatar(currentIndex - 1);
        } else if (deltaX < -30 && currentIndex < totalAvatars - 1) {
            selectAvatar(currentIndex + 1);
        }
        isSwiping = false;
    }, { passive: true });

    stage.addEventListener('touchmove', e => {
        if (isSwiping) e.preventDefault();
    }, { passive: false });

    stage.addEventListener('scroll', () => {
        if (isSwiping) return;
        let closestIndex = currentIndex;
        let minDistance = Infinity;
        avatars.forEach((avatar, index) => {
            const distance = Math.abs(avatar.offsetLeft - stage.scrollLeft - (stage.offsetWidth - avatar.offsetWidth) / 2);
            if (distance < minDistance) {
                minDistance = distance;
                closestIndex = index;
            }
        });
        if (closestIndex !== currentIndex) {
            selectAvatar(closestIndex);
        }
    });

    // Optimize wave animation
    initializeWaveAnimation();
}

function initializeWaveAnimation() {
    const canvas = document.getElementById('wave-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function resizeCanvas() {
        canvas.width = canvas.offsetWidth * window.devicePixelRatio;
        canvas.height = canvas.offsetHeight * window.devicePixelRatio;
        canvas.style.width = `${canvas.offsetWidth}px`;
        canvas.style.height = `${canvas.offsetHeight}px`;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const waves = [
        { amplitude: 12, frequency: 0.02, phase: 0, speed: 0.06 },
        { amplitude: 18, frequency: 0.015, phase: Math.PI / 2, speed: 0.04 },
        { amplitude: 10, frequency: 0.025, phase: Math.PI, speed: 0.03 }
    ];

    let lastTime = 0;
    function animate(timestamp) {
        if (timestamp - lastTime < 16) {
            requestAnimationFrame(animate);
            return;
        }
        lastTime = timestamp;

        ctx.clearRect(0, 0, canvas.width / window.devicePixelRatio, canvas.height / window.devicePixelRatio);
        ctx.fillStyle = 'rgba(0, 123, 255, 0.2)';
        ctx.beginPath();
        for (let x = 0; x < canvas.width / window.devicePixelRatio; x++) {
            let y = (canvas.height / window.devicePixelRatio) / 2;
            waves.forEach(wave => {
                y += wave.amplitude * Math.sin(wave.frequency * x + wave.phase);
            });
            ctx.lineTo(x, y);
        }
        ctx.lineTo(canvas.width / window.devicePixelRatio, canvas.height / window.devicePixelRatio);
        ctx.lineTo(0, canvas.height / window.devicePixelRatio);
        ctx.closePath();
        ctx.fill();

        waves.forEach(wave => {
            wave.phase += wave.speed;
        });

        requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
}

// Input Validation Handlers
async function validateLoginGmail() {
    const gmail = document.getElementById('login-gmail')?.value.trim();
    const dot = document.getElementById('login-gmail-dot');
    const status = document.getElementById('login-gmail-status');
    const indicator = document.getElementById('login-gmail-indicator');
    if (!gmail || !dot || !status || !indicator) return;
    indicator.classList.add('show');
    const isValid = validateGmailFormat(gmail);
    dot.className = isValid ? 'dot valid' : 'dot invalid';
    status.textContent = document.documentElement.lang === 'en' ? 
        (isValid ? 'Valid Gmail' : 'Invalid Gmail address') : 
        (isValid ? 'Gmail Valid' : 'Alamat Gmail tidak valid');
}

async function validateRegisterGmail() {
    const gmail = document.getElementById('register-gmail')?.value.trim();
    const dot = document.getElementById('register-gmail-dot');
    const status = document.getElementById('register-gmail-status');
    const indicator = document.getElementById('register-gmail-indicator');
    if (!gmail || !dot || !status || !indicator) return;
    indicator.classList.add('show');
    const isValid = validateGmailFormat(gmail);
    const isUnique = isValid ? await isGmailUnique(gmail) : false;
    dot.className = isValid && isUnique ? 'dot valid' : 'dot invalid';
    status.textContent = document.documentElement.lang === 'en' ? 
        (isValid ? (isUnique ? 'Valid Gmail' : 'Gmail already registered') : 'Invalid Gmail address') : 
        (isValid ? (isUnique ? 'Gmail Valid' : 'Gmail sudah terdaftar') : 'Alamat Gmail tidak valid');
}

async function validateForgotPasswordGmail() {
    const gmail = document.getElementById('forgot-password-gmail')?.value.trim();
    const dot = document.getElementById('forgot-password-gmail-dot');
    const status = document.getElementById('forgot-password-gmail-status');
    const indicator = document.getElementById('forgot-password-gmail-indicator');
    if (!gmail || !dot || !status || !indicator) return;
    indicator.classList.add('show');
    const isValid = validateGmailFormat(gmail);
    dot.className = isValid ? 'dot valid' : 'dot invalid';
    status.textContent = document.documentElement.lang === 'en' ? 
        (isValid ? 'Valid Gmail' : 'Invalid Gmail address') : 
        (isValid ? 'Gmail Valid' : 'Alamat Gmail tidak valid');
}

async function validatePhoneNumber() {
    const phone = document.getElementById('register-phone')?.value.trim();
    const dot = document.getElementById('register-phone-dot');
    const status = document.getElementById('register-phone-status');
    const indicator = document.getElementById('register-phone-indicator');
    if (!phone || !dot || !status || !indicator) return;
    indicator.classList.add('show');
    const isValid = validatePhoneNumberFormat(phone);
    const isUnique = isValid ? await isPhoneUnique(phone) : false;
    dot.className = isValid && isUnique ? 'dot valid' : 'dot invalid';
    status.textContent = document.documentElement.lang === 'en' ? 
        (isValid ? (isUnique ? 'Valid phone number' : 'Phone number already registered') : 'Invalid phone number') : 
        (isValid ? (isUnique ? 'Nomor telepon valid' : 'Nomor telepon sudah terdaftar') : 'Nomor telepon tidak valid');
}

async function validateForgotPasswordPhone() {
    const phone = document.getElementById('forgot-password-phone')?.value.trim();
    const dot = document.getElementById('forgot-password-phone-dot');
    const status = document.getElementById('forgot-password-phone-status');
    const indicator = document.getElementById('forgot-password-phone-indicator');
    if (!phone || !dot || !status || !indicator) return;
    indicator.classList.add('show');
    const isValid = validatePhoneNumberFormat(phone);
    dot.className = isValid ? 'dot valid' : 'dot invalid';
    status.textContent = document.documentElement.lang === 'en' ? 
        (isValid ? 'Valid phone number' : 'Invalid phone number') : 
        (isValid ? 'Nomor telepon valid' : 'Nomor telepon tidak valid');
}

async function validateRegisterUsername() {
    const username = document.getElementById('register-username')?.value.trim();
    const dot = document.getElementById('register-username-dot');
    const status = document.getElementById('register-username-status');
    const indicator = document.getElementById('register-username-indicator');
    if (!username || !dot || !status || !indicator) return;
    indicator.classList.add('show');
    const isValid = validateUsernameFormat(username);
    const isUnique = isValid ? await isUsernameUnique(username) : false;
    dot.className = isValid && isUnique ? 'dot valid' : 'dot invalid';
    status.textContent = document.documentElement.lang === 'en' ? 
        (isValid ? (isUnique ? 'Valid username' : 'Username already taken') : 'Invalid username format') : 
        (isValid ? (isUnique ? 'Nama pengguna valid' : 'Nama pengguna sudah digunakan') : 'Format nama pengguna tidak valid');
}

function validatePasswordInput() {
    const password = document.getElementById('register-password')?.value;
    const validationList = document.getElementById('password-validation-list');
    if (!password || !validationList) return;
    validationList.classList.add('show');
    const validation = validatePassword(password);
    document.getElementById('password-length').className = validation.length ? 'dot valid' : 'dot invalid';
    document.getElementById('password-uppercase').className = validation.uppercase ? 'dot valid' : 'dot invalid';
    document.getElementById('password-number').className = validation.number ? 'dot valid' : 'dot invalid';
}

function validateConfirmPassword() {
    const password = document.getElementById('register-password')?.value;
    const confirmPassword = document.getElementById('register-confirm-password')?.value;
    const validationList = document.getElementById('confirm-validation-list');
    const matchDot = document.getElementById('confirm-password-match');
    if (!confirmPassword || !validationList || !matchDot) return;
    validationList.classList.add('show');
    matchDot.className = password === confirmPassword && password ? 'dot valid' : 'dot invalid';
}

function validateForgotPasswordNew() {
    const password = document.getElementById('forgot-password-new')?.value;
    const validationList = document.getElementById('forgot-password-new-validation-list');
    if (!password || !validationList) return;
    validationList.classList.add('show');
    const validation = validatePassword(password);
    document.getElementById('forgot-password-new-length').className = validation.length ? 'dot valid' : 'dot invalid';
    document.getElementById('forgot-password-new-uppercase').className = validation.uppercase ? 'dot valid' : 'dot invalid';
    document.getElementById('forgot-password-new-number').className = validation.number ? 'dot valid' : 'dot invalid';
}

function validateForgotPasswordConfirm() {
    const password = document.getElementById('forgot-password-new')?.value;
    const confirmPassword = document.getElementById('forgot-password-confirm')?.value;
    const validationList = document.getElementById('forgot-password-confirm-validation-list');
    const matchDot = document.getElementById('forgot-password-confirm-match');
    if (!confirmPassword || !validationList || !matchDot) return;
    validationList.classList.add('show');
    matchDot.className = password === confirmPassword && password ? 'dot valid' : 'dot invalid';
}

// Form Handlers
async function handleLogin() {
    const gmail = document.getElementById('login-gmail')?.value.trim();
    const password = document.getElementById('login-password')?.value;
    const gmailError = document.getElementById('login-gmail-error');
    if (!gmail || !password) {
        showNotification(document.documentElement.lang === 'en' ? 'Please fill in all fields.' : 'Harap isi semua kolom.', 3000, null, 'error');
        return;
    }
    if (!validateGmailFormat(gmail)) {
        if (gmailError) gmailError.classList.add('show');
        showNotification(document.documentElement.lang === 'en' ? 'Invalid Gmail address.' : 'Alamat Gmail tidak valid.', 3000, null, 'error');
        return;
    }
    if (gmailError) gmailError.classList.remove('show');
    const result = await fetchPlayers('login', { gmail, password });
    if (result.success) {
        localStorage.setItem('currentPlayer', JSON.stringify(result.player));
        showNotification(document.documentElement.lang === 'en' ? 'Login successful!' : 'Login berhasil!', 3000, 'dashboard.html', 'success');
    } else {
        showNotification(result.error || (document.documentElement.lang === 'en' ? 'Invalid Gmail or password.' : 'Gmail atau kata sandi tidak valid.'), 3000, null, 'error');
    }
}

async function handleRegister() {
    const gmail = document.getElementById('register-gmail')?.value.trim();
    const phone = document.getElementById('register-phone')?.value.trim();
    const password = document.getElementById('register-password')?.value;
    const confirmPassword = document.getElementById('register-confirm-password')?.value;
    const gmailError = document.getElementById('register-gmail-error');
    const phoneError = document.getElementById('register-phone-error');
    const passwordError = document.getElementById('register-password-error');
    const confirmPasswordError = document.getElementById('register-confirm-password-error');
    if (!gmail || !phone || !password || !confirmPassword) {
        showNotification(document.documentElement.lang === 'en' ? 'Please fill in all fields.' : 'Harap isi semua kolom.', 3000, null, 'error');
        return;
    }
    const isGmailValid = validateGmailFormat(gmail);
    const isGmailUniqueResult = isGmailValid ? await isGmailUnique(gmail) : false;
    const isPhoneValid = validatePhoneNumberFormat(phone);
    const isPhoneUniqueResult = isPhoneValid ? await isPhoneUnique(phone) : false;
    const passwordValidation = validatePassword(password);
    const passwordsMatch = password === confirmPassword;
    let hasError = false;
    if (!isGmailValid) {
        if (gmailError) gmailError.classList.add('show');
        showNotification(document.documentElement.lang === 'en' ? 'Invalid Gmail address.' : 'Alamat Gmail tidak valid.', 3000, null, 'error');
        hasError = true;
    } else if (!isGmailUniqueResult) {
        if (gmailError) gmailError.classList.add('show');
        showNotification(document.documentElement.lang === 'en' ? 'Gmail already registered.' : 'Gmail sudah terdaftar.', 3000, null, 'error');
        hasError = true;
    } else {
        if (gmailError) gmailError.classList.remove('show');
    }
    if (!isPhoneValid) {
        if (phoneError) phoneError.classList.add('show');
        showNotification(document.documentElement.lang === 'en' ? 'Invalid phone number.' : 'Nomor telepon tidak valid.', 3000, null, 'error');
        hasError = true;
    } else if (!isPhoneUniqueResult) {
        if (phoneError) phoneError.classList.add('show');
        showNotification(document.documentElement.lang === 'en' ? 'Phone number already registered.' : 'Nomor telepon sudah terdaftar.', 3000, null, 'error');
        hasError = true;
    } else {
        if (phoneError) phoneError.classList.remove('show');
    }
    if (!passwordValidation.length || !passwordValidation.uppercase || !passwordValidation.number || !passwordValidation.noSpecial) {
        if (passwordError) passwordError.classList.add('show');
        showNotification(document.documentElement.lang === 'en' ? 'Password must be 8+ characters, with uppercase, numbers, and no special characters.' : 'Kata sandi harus 8+ karakter, dengan huruf besar, angka, dan tanpa karakter khusus.', 3000, null, 'error');
        hasError = true;
    } else {
        if (passwordError) passwordError.classList.remove('show');
    }
    if (!passwordsMatch) {
        if (confirmPasswordError) confirmPasswordError.classList.add('show');
        showNotification(document.documentElement.lang === 'en' ? 'Passwords do not match.' : 'Kata sandi tidak cocok.', 3000, null, 'error');
        hasError = true;
    } else {
        if (confirmPasswordError) confirmPasswordError.classList.remove('show');
    }
    if (hasError) return;
    localStorage.setItem('pendingPlayer', JSON.stringify({ gmail, phone, password }));
    const code = sendWhatsAppVerification(phone, 'register');
    if (code) showVerify();
}

async function handleVerify() {
    const code = document.getElementById('verify-code')?.value.trim();
    const csrfToken = document.getElementById('csrf-token')?.value;
    const storedCode = localStorage.getItem('registerVerificationCode');
    const storedCsrfToken = localStorage.getItem('registerCsrfToken');
    const codeTimestamp = parseInt(localStorage.getItem('registerCodeTimestamp') || '0');
    const verifyError = document.getElementById('verify-code-error');
    if (!code || !csrfToken) {
        if (verifyError) verifyError.classList.add('show');
        showNotification(document.documentElement.lang === 'en' ? 'Please enter the verification code.' : 'Harap masukkan kode verifikasi.', 3000, null, 'error');
        return;
    }
    if (csrfToken !== storedCsrfToken) {
        if (verifyError) verifyError.classList.add('show');
        showNotification(document.documentElement.lang === 'en' ? 'Invalid session. Please try again.' : 'Sesi tidak valid. Silakan coba lagi.', 3000, null, 'error');
        showRegister();
        return;
    }
    if (!isValidCode(code, storedCode, codeTimestamp)) {
        if (verifyError) verifyError.classList.add('show');
        showNotification(document.documentElement.lang === 'en' ? 'Invalid or expired code.' : 'Kode tidak valid atau kadaluarsa.', 3000, null, 'error');
        return;
    }
    if (verifyError) verifyError.classList.remove('show');
    showAvatar();
}

async function handleAvatarSubmit() {
    const username = document.getElementById('register-username')?.value.trim();
    const description = document.getElementById('register-description')?.value.trim().slice(0, 200);
    const usernameError = document.getElementById('register-username-error');
    const carousel = document.getElementById('avatar-carousel');
    const currentIndex = parseInt(carousel?.dataset.currentIndex || '0');
    const avatars = carousel?.querySelectorAll('.avatar');
    let profileImage = '';
    if (avatars && avatars[currentIndex]) {
        profileImage = avatars[currentIndex].src;
    }
    if (!username || !profileImage) {
        showNotification(document.documentElement.lang === 'en' ? 'Please select a username and avatar.' : 'Harap pilih nama pengguna dan avatar.', 3000, null, 'error');
        return;
    }
    const isUsernameValid = validateUsernameFormat(username);
    const isUsernameUniqueResult = isUsernameValid ? await isUsernameUnique(username) : false;
    if (!isUsernameValid) {
        if (usernameError) usernameError.classList.add('show');
        showNotification(document.documentElement.lang === 'en' ? 'Invalid username format.' : 'Format nama pengguna tidak valid.', 3000, null, 'error');
        return;
    } else if (!isUsernameUniqueResult) {
        if (usernameError) usernameError.classList.add('show');
        showNotification(document.documentElement.lang === 'en' ? 'Username already taken.' : 'Nama pengguna sudah digunakan.', 3000, null, 'error');
        return;
    } else {
        if (usernameError) usernameError.classList.remove('show');
    }
    const pendingPlayer = JSON.parse(localStorage.getItem('pendingPlayer') || '{}');
    if (!pendingPlayer.gmail) {
        showNotification(document.documentElement.lang === 'en' ? 'No pending player found. Please register again.' : 'Tidak ada pemain tertunda. Silakan daftar lagi.', 3000, null, 'error');
        showRegister();
        return;
    }
    const player = { ...pendingPlayer, username, profile_image: profileImage, description };
    const result = await fetchPlayers('register', player);
    if (result.success) {
        ['pendingPlayer', 'registerVerificationCode', 'registerPendingKey', 'registerCodeTimestamp', 'registerCsrfToken'].forEach(key => localStorage.removeItem(key));
        showNotification(document.documentElement.lang === 'en' ? 'Registration successful! Please log in.' : 'Pendaftaran berhasil! Silakan masuk.', 3000, null, 'success');
        showLogin();
    } else {
        showNotification(document.documentElement.lang === 'en' ? 'Registration failed. Please try again.' : 'Pendaftaran gagal. Silakan coba lagi.', 3000, null, 'error');
    }
}

async function handleForgotPassword() {
    const gmail = document.getElementById('forgot-password-gmail')?.value.trim();
    const phone = document.getElementById('forgot-password-phone')?.value.trim();
    const gmailError = document.getElementById('forgot-password-gmail-error');
    const phoneError = document.getElementById('forgot-password-phone-error');
    if (!gmail || !phone) {
        showNotification(document.documentElement.lang === 'en' ? 'Please fill in all fields.' : 'Harap isi semua kolom.', 3000, null, 'error');
        return;
    }
    if (!validateGmailFormat(gmail)) {
        if (gmailError) gmailError.classList.add('show');
        showNotification(document.documentElement.lang === 'en' ? 'Invalid Gmail address.' : 'Alamat Gmail tidak valid.', 3000, null, 'error');
        return;
    }
    if (!validatePhoneNumberFormat(phone)) {
        if (phoneError) phoneError.classList.add('show');
        showNotification(document.documentElement.lang === 'en' ? 'Invalid phone number.' : 'Nomor telepon tidak valid.', 3000, null, 'error');
        return;
    }
    if (gmailError) gmailError.classList.remove('show');
    if (phoneError) phoneError.classList.remove('show');
    const result = await fetchPlayers('find_player', { gmail, phone });
    if (!result.success || !result.player) {
        showNotification(document.documentElement.lang === 'en' ? 'No account found with the provided details.' : 'Tidak ada akun ditemukan dengan detail yang diberikan.', 3000, null, 'error');
        return;
    }
    localStorage.setItem('pendingRecovery', JSON.stringify({ gmail, phone }));
    const code = sendWhatsAppVerification(phone, 'forgot-password');
    if (code) showForgotPasswordVerify();
}

async function handleForgotPasswordVerify() {
    const code = document.getElementById('forgot-password-code')?.value.trim();
    const csrfToken = document.getElementById('forgot-password-csrf-token')?.value;
    const storedCode = localStorage.getItem('forgot-passwordVerificationCode');
    const storedCsrfToken = localStorage.getItem('forgot-passwordCsrfToken');
    const codeTimestamp = parseInt(localStorage.getItem('forgot-passwordCodeTimestamp') || '0');
    const verifyError = document.getElementById('forgot-password-code-error');
    if (!code || !csrfToken) {
        if (verifyError) verifyError.classList.add('show');
        showNotification(document.documentElement.lang === 'en' ? 'Please enter the verification code.' : 'Harap masukkan kode verifikasi.', 3000, null, 'error');
        return;
    }
    if (csrfToken !== storedCsrfToken) {
        if (verifyError) verifyError.classList.add('show');
        showNotification(document.documentElement.lang === 'en' ? 'Invalid session. Please try again.' : 'Sesi tidak valid. Silakan coba lagi.', 3000, null, 'error');
        showForgotPassword();
        return;
    }
    if (!isValidCode(code, storedCode, codeTimestamp)) {
        if (verifyError) verifyError.classList.add('show');
        showNotification(document.documentElement.lang === 'en' ? 'Invalid or expired code.' : 'Kode tidak valid atau kadaluarsa.', 3000, null, 'error');
        return;
    }
    if (verifyError) verifyError.classList.remove('show');
    showForgotPasswordReset();
}

async function handlePasswordReset() {
    const password = document.getElementById('forgot-password-new')?.value;
    const confirmPassword = document.getElementById('forgot-password-confirm')?.value;
    const passwordError = document.getElementById('forgot-password-new-error');
    const confirmPasswordError = document.getElementById('forgot-password-confirm-error');
    if (!password || !confirmPassword) {
        showNotification(document.documentElement.lang === 'en' ? 'Please fill in all fields.' : 'Harap isi semua kolom.', 3000, null, 'error');
        return;
    }
    const passwordValidation = validatePassword(password);
    const passwordsMatch = password === confirmPassword;
    let hasError = false;
    if (!passwordValidation.length || !passwordValidation.uppercase || !passwordValidation.number || !passwordValidation.noSpecial) {
        if (passwordError) passwordError.classList.add('show');
        showNotification(document.documentElement.lang === 'en' ? 'Password must be 8+ characters, with uppercase, numbers, and no special characters.' : 'Kata sandi harus 8+ karakter, dengan huruf besar, angka, dan tanpa karakter khusus.', 3000, null, 'error');
        hasError = true;
    } else {
        if (passwordError) passwordError.classList.remove('show');
    }
    if (!passwordsMatch) {
        if (confirmPasswordError) confirmPasswordError.classList.add('show');
        showNotification(document.documentElement.lang === 'en' ? 'Passwords do not match.' : 'Kata sandi tidak cocok.', 3000, null, 'error');
        hasError = true;
    } else {
        if (confirmPasswordError) confirmPasswordError.classList.remove('show');
    }
    if (hasError) return;
    const pendingRecovery = JSON.parse(localStorage.getItem('pendingRecovery') || '{}');
    if (!pendingRecovery.gmail || !pendingRecovery.phone) {
        showNotification(document.documentElement.lang === 'en' ? 'No pending recovery found. Please try again.' : 'Tidak ada pemulihan tertunda. Silakan coba lagi.', 3000, null, 'error');
        showForgotPassword();
        return;
    }
    const result = await fetchPlayers('update_password', {
        gmail: pendingRecovery.gmail,
        phone: pendingRecovery.phone,
        password
    });
    if (result.success) {
        ['pendingRecovery', 'forgot-passwordVerificationCode', 'forgot-passwordPendingKey', 'forgot-passwordCodeTimestamp', 'forgot-passwordCsrfToken'].forEach(key => localStorage.removeItem(key));
        showNotification(document.documentElement.lang === 'en' ? 'Password reset successful! Please log in.' : 'Pengaturan ulang kata sandi berhasil! Silakan masuk.', 3000, null, 'success');
        showLogin();
    } else {
        showNotification(document.documentElement.lang === 'en' ? 'Password reset failed. Please try again.' : 'Pengaturan ulang kata sandi gagal. Silakan coba lagi.', 3000, null, 'error');
    }
}

async function resendCode() {
    const pendingPlayer = JSON.parse(localStorage.getItem('pendingPlayer') || '{}');
    if (!pendingPlayer.phone) {
        showNotification(document.documentElement.lang === 'en' ? 'No pending phone number found. Please register again.' : 'Tidak ada nomor telepon tertunda. Silakan daftar lagi.', 3000, null, 'error');
        showRegister();
        return;
    }
    const code = sendWhatsAppVerification(pendingPlayer.phone, 'register');
    if (code) showVerify();
}

async function resendForgotPasswordCode() {
    const pendingRecovery = JSON.parse(localStorage.getItem('pendingRecovery') || '{}');
    if (!pendingRecovery.phone) {
        showNotification(document.documentElement.lang === 'en' ? 'No pending phone number found. Please try again.' : 'Tidak ada nomor telepon tertunda. Silakan coba lagi.', 3000, null, 'error');
        showForgotPassword();
        return;
    }
    const code = sendWhatsAppVerification(pendingRecovery.phone, 'forgot-password');
    if (code) showForgotPasswordVerify();
}

// Language and Theme Toggling
function toggleLanguage() {
    const langToggle = document.getElementById('lang-toggle');
    const langIcon = document.getElementById('lang-icon');
    const langName = document.querySelector('#lang-toggle [data-i18n="lang-name"]');
    if (!langToggle || !langIcon || !langName) {
        console.error('Language toggle elements missing');
        return;
    }

    const currentLang = document.documentElement.lang === 'en' ? 'en' : 'id';
    const newLang = currentLang === 'en' ? 'id' : 'en';
    document.documentElement.lang = newLang;
    langIcon.textContent = newLang === 'en' ? '🇬🇧' : '🇮🇩';
    langName.textContent = window.translations[newLang]['lang-name'];

    // Update all data-i18n elements
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (window.translations[newLang][key]) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = window.translations[newLang][key];
            } else {
                el.textContent = window.translations[newLang][key];
            }
        }
    });

    // Update data-i18n-placeholder elements
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (window.translations[newLang][key]) {
            el.placeholder = window.translations[newLang][key];
        }
    });

    localStorage.setItem('language', newLang);
}

function toggleTheme() {
    const themeToggle = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-icon');
    const themeName = document.querySelector('#theme-toggle [data-i18n="theme-name"]');
    const body = document.body;
    if (!themeToggle || !themeIcon || !themeName || !body) {
        console.error('Theme toggle elements missing');
        return;
    }

    const currentTheme = body.dataset.theme || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    body.dataset.theme = newTheme;
    themeIcon.textContent = newTheme === 'light' ? '☀️' : '🌙';
    themeName.textContent = newTheme === 'light' ? 
        (document.documentElement.lang === 'en' ? 'Light Mode' : 'Mode Terang') : 
        (document.documentElement.lang === 'en' ? 'Dark Mode' : 'Mode Gelap');
    localStorage.setItem('theme', newTheme);
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    // Restore theme preference
    const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.body.dataset.theme = savedTheme;
    const themeIcon = document.getElementById('theme-icon');
    const themeName = document.querySelector('#theme-toggle [data-i18n="theme-name"]');
    if (themeIcon && themeName) {
        themeIcon.textContent = savedTheme === 'light' ? '☀️' : '🌙';
        themeName.textContent = savedTheme === 'light' ? 
            (document.documentElement.lang === 'en' ? 'Light Mode' : 'Mode Terang') : 
            (document.documentElement.lang === 'en' ? 'Dark Mode' : 'Mode Gelap');
    }

    // Restore language preference
    const savedLang = localStorage.getItem('language') || 'en';
    document.documentElement.lang = savedLang;
    const langIcon = document.getElementById('lang-icon');
    const langName = document.querySelector('#lang-toggle [data-i18n="lang-name"]');
    if (langIcon && langName) {
        langIcon.textContent = savedLang === 'en' ? '🇬🇧' : '🇮🇩';
        langName.textContent = window.translations[savedLang]['lang-name'];
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (window.translations[savedLang][key]) {
                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    el.placeholder = window.translations[savedLang][key];
                } else {
                    el.textContent = window.translations[savedLang][key];
                }
            }
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (window.translations[savedLang][key]) {
                el.placeholder = window.translations[savedLang][key];
            }
        });
    }

    // Input event listeners
    const inputs = {
        'login-gmail': validateLoginGmail,
        'register-gmail': validateRegisterGmail,
        'forgot-password-gmail': validateForgotPasswordGmail,
        'register-phone': validatePhoneNumber,
        'forgot-password-phone': validateForgotPasswordPhone,
        'register-username': validateRegisterUsername,
        'register-password': validatePasswordInput,
        'register-confirm-password': validateConfirmPassword,
        'forgot-password-new': validateForgotPasswordNew,
        'forgot-password-confirm': validateForgotPasswordConfirm
    };
    Object.entries(inputs).forEach(([id, handler]) => {
        const input = document.getElementById(id);
        if (input) input.addEventListener('input', handler);
    });

    // Security: Prevent copy/cut/context menu on sensitive inputs
    const sensitiveInputs = [
        'login-gmail', 'login-password', 'register-gmail', 'register-phone',
        'register-password', 'register-confirm-password', 'register-username',
        'forgot-password-gmail', 'forgot-password-phone', 'forgot-password-code',
        'forgot-password-new', 'forgot-password-confirm', 'verify-code'
    ];
    sensitiveInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('copy', e => e.preventDefault());
            input.addEventListener('cut', e => e.preventDefault());
            input.addEventListener('contextmenu', e => e.preventDefault());
        }
    });

    // Initialize page
    showLogin();
});