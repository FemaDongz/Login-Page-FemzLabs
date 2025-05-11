function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function generateCsrfToken() {
  return generateUUID();
}

async function fetchUsers() {
  try {
    const response = await fetch('save_users.php', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) {
      if (response.status === 404) return [];
      throw new Error('Failed to fetch users');
    }
    return await response.json();
  } catch (err) {
    console.error('Fetch users error:', err);
    return [];
  }
}

async function saveUsers(users) {
  try {
    const response = await fetch('save_users.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(users)
    });
    if (!response.ok) throw new Error('Failed to save users');
  } catch (err) {
    console.error('Save users error:', err);
  }
}

function validateUsernameFormat(username) {
  if (!username) return false;
  const cleanUsername = username.startsWith('@') ? username.slice(1) : username;
  const regex = /^[a-zA-Z0-9._]+$/;
  const isValidFormat = regex.test(cleanUsername);
  const isLongEnough = username.startsWith('@') || cleanUsername.length >= 5;
  return isValidFormat && isLongEnough;
}

async function isUsernameUnique(username) {
  if (!username) return false;
  const cleanUsername = username.startsWith('@') ? username.slice(1) : username;
  const users = await fetchUsers();
  return !users.some(u => u.username === cleanUsername);
}

async function doesUsernameExist(username) {
  if (!username) return false;
  const cleanUsername = username.startsWith('@') ? username.slice(1) : username;
  const users = await fetchUsers();
  return users.some(u => u.username === cleanUsername);
}

async function isPhoneUnique(phone) {
  if (!phone) return false;
  const users = await fetchUsers();
  return !users.some(u => u.phone === phone);
}

function validatePhoneNumberFormat(phone) {
  if (!phone) return false;
  const regex = /^\+[1-9]\d{9,14}$/;
  return regex.test(phone);
}

async function isGmailUnique(gmail) {
  if (!gmail) return false;
  const users = await fetchUsers();
  return !users.some(u => u.gmail === gmail);
}

function validateGmailFormat(gmail) {
  if (!gmail) return false;
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(gmail);
}

function canSendAttempt(key, type) {
  const attempts = JSON.parse(localStorage.getItem(`${type}Attempts`) || '{}');
  const attemptData = attempts[key] || { count: 0, timestamp: 0 };
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  if (now - attemptData.timestamp > oneDay) {
    attemptData.count = 0;
    attemptData.timestamp = now;
  }
  return attemptData.count < 3;
}

function logAttempt(key, status, type) {
  const logs = JSON.parse(localStorage.getItem(`${type}Logs`) || '[]');
  logs.push({ key, status, timestamp: Date.now() });
  localStorage.setItem(`${type}Logs`, JSON.stringify(logs));
  console.log(`${type} attempt:`, { key, status, timestamp: Date.now() });
}

function updateAttempt(key, type) {
  const attempts = JSON.parse(localStorage.getItem(`${type}Attempts`) || '{}');
  const attemptData = attempts[key] || { count: 0, timestamp: 0 };
  attemptData.count = (attemptData.count || 0) + 1;
  attemptData.timestamp = Date.now();
  attempts[key] = attemptData;
  localStorage.setItem(`${type}Attempts`, JSON.stringify(attempts));
}

function sendWhatsAppVerification(phone, username, type = 'register') {
  if (!canSendAttempt(phone, type)) {
    logAttempt(phone, `failed: attempt limit reached`, type);
    return null;
  }
  const adminNumber = '+6285722086285';
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const message = encodeURIComponent(`Your Femz Labs ${type === 'forgot-id' ? 'ID recovery' : 'verification'} code is ${code}. Reply with this code to verify.`);
  const whatsappUrl = `https://wa.me/${phone.replace('+', '')}?text=${message}`;
  localStorage.setItem(`${type}VerificationCode`, code);
  localStorage.setItem(`${type}PendingKey`, phone);
  localStorage.setItem(`${type}CodeTimestamp`, Date.now());
  localStorage.setItem(`${type}CsrfToken`, generateCsrfToken());
  localStorage.setItem(`${type}LastAttemptTime`, Date.now());
  updateAttempt(phone, type);
  logAttempt(phone, 'sent', type);
  window.open(whatsappUrl, '_blank');
  return code;
}

function sendGmailOTP(gmail, type = 'forgot-username') {
  if (!canSendAttempt(gmail, type)) {
    logAttempt(gmail, `failed: attempt limit reached`, type);
    return null;
  }
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  console.log(`OTP for ${gmail}: ${code}`);
  localStorage.setItem(`${type}VerificationCode`, code);
  localStorage.setItem(`${type}PendingKey`, gmail);
  localStorage.setItem(`${type}CodeTimestamp`, Date.now());
  localStorage.setItem(`${type}CsrfToken`, generateCsrfToken());
  localStorage.setItem(`${type}LastAttemptTime`, Date.now());
  updateAttempt(gmail, type);
  logAttempt(gmail, 'sent', type);
  return code;
}

function isValidCode(code, storedCode, timestamp) {
  const codeExpiry = 5 * 60 * 1000;
  const now = Date.now();
  return code === storedCode && (now - timestamp) < codeExpiry;
}

function validatePassword(password) {
  if (!password) return { length: false, uppercase: false, number: false, noSpecial: false };
  return {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /\d/.test(password),
    noSpecial: /^[a-zA-Z0-9]*$/.test(password)
  };
}

function togglePassword(inputId, icon) {
  const input = document.getElementById(inputId);
  if (!input || !icon) return;
  if (input.type === 'password') {
    input.type = 'text';
    icon.innerHTML = '<path d="M12 7c2.76 0 5 2.24 5 5s-2.24 5-5 5-5-2.24-5-5 2.24-5 5-5m0-2.5C7 2.5 2.73 5.61 1 10c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5z"/>';
  } else {
    input.type = 'password';
    icon.innerHTML = '<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>';
  }
}

function toggleVisibility(idElementId, iconSelector) {
  const idElement = document.getElementById(idElementId);
  const icon = document.querySelector(iconSelector);
  if (!idElement || !icon) return;
  if (idElement.style.filter === 'blur(4px)') {
    idElement.style.filter = 'none';
    icon.innerHTML = '<path d="M12 7c2.76 0 5 2.24 5 5s-2.24 5-5 5-5-2.24-5-5 2.24-5 5-5m0-2.5C7 2.5 2.73 5.61 1 10c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5z"/>';
  } else {
    idElement.style.filter = 'blur(4px)';
    icon.innerHTML = '<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>';
  }
}

function toggleIdVisibility() {
  toggleVisibility('user-id', '#success-content .id-toggle');
}

function toggleForgotIdVisibility() {
  toggleVisibility('forgot-id-user-id', '#forgot-id-success .id-toggle');
}

function toggleForgotUsernameVisibility() {
  toggleVisibility('forgot-username-result', '#forgot-username-success .id-toggle');
}

function copyText(text, buttonId, successMessage) {
  const button = document.getElementById(buttonId);
  if (!text || !button) {
    showNotification('No text to copy.', 3000, null, 'error');
    return;
  }
  if (navigator.clipboard && navigator.clipboard.write) {
    navigator.clipboard.write(text).then(() => {
      showNotification(successMessage, 3000, null, 'success');
      startCopyCooldown(button);
    }).catch(err => {
      console.error('Clipboard error:', err);
      fallbackCopy(text, button, successMessage);
    });
  } else {
    fallbackCopy(text, button, successMessage);
  }
}

function fallbackCopy(text, button, successMessage) {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showNotification(successMessage, 3000, null, 'success');
    startCopyCooldown(button);
  } catch (err) {
    console.error('Fallback copy error:', err);
    showNotification('Failed to copy. Please copy manually.', 3000, null, 'error');
  }
}

function startCopyCooldown(button) {
  let cooldown = 4;
  button.disabled = true;
  button.textContent = `Copy (${cooldown}s)`;
  const interval = setInterval(() => {
    cooldown--;
    button.textContent = `Copy (${cooldown}s)`;
    if (cooldown <= 0) {
      clearInterval(interval);
      button.disabled = false;
      button.textContent = 'Copy';
    }
  }, 1000);
}

function copyId() {
  const idElement = document.getElementById('user-id');
  const id = idElement?.textContent;
  copyText(id, 'copy-id-button', 'ID copied to clipboard!');
}

function copyForgotId() {
  const idElement = document.getElementById('forgot-id-user-id');
  const id = idElement?.textContent;
  copyText(id, 'copy-forgot-id-button', 'ID copied to clipboard!');
}

function copyForgotUsername() {
  const usernameElement = document.getElementById('forgot-username-result');
  const username = usernameElement?.textContent;
  copyText(username, 'copy-forgot-username-button', 'Username copied to clipboard!');
}

function showNotification(message, duration, redirectUrl, type = 'success') {
  const notification = document.getElementById('notification');
  const notificationText = document.getElementById('notification-text');
  const loadingBarFill = document.getElementById('loading-bar-fill');
  if (!notification || !notificationText || !loadingBarFill) return;
  notificationText.textContent = message;
  notification.className = 'notification';
  notification.classList.add('show', type);
  loadingBarFill.classList.add('active');
  setTimeout(() => {
    notification.classList.remove('show', type);
    loadingBarFill.classList.remove('active');
    if (redirectUrl) window.location.href = redirectUrl;
  }, duration);
}

function startVerificationTimer(timerId, codeType) {
  let timeLeft = 5 * 60;
  const timerElement = document.getElementById(timerId);
  const codeInput = document.getElementById(codeType === 'register' ? 'verify-code' : codeType === 'forgot-id' ? 'forgot-id-code' : 'forgot-username-code');
  if (!timerElement || !codeInput) return;
  const updateTimer = () => {
    if (timeLeft <= 0) {
      timerElement.textContent = '00:00';
      codeInput.disabled = true;
      codeInput.placeholder = 'Code expired';
      return;
    }
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    timeLeft--;
    setTimeout(updateTimer, 1000);
  };
  updateTimer();
}

function resetIndicators(formId) {
  const indicators = document.querySelectorAll(`#${formId} .validation-indicator, #${formId} .validation-list`);
  indicators.forEach(ind => ind.classList.remove('show'));
  const dots = document.querySelectorAll(`#${formId} .dot`);
  dots.forEach(dot => dot.className = 'dot');
}

function validateLoginUsername() {
  const username = document.getElementById('login-username')?.value.trim();
  const dot = document.getElementById('login-username-dot');
  const status = document.getElementById('login-username-status');
  const indicator = document.getElementById('login-username-indicator');
  if (!username || !dot || !status || !indicator) {
    indicator?.classList.remove('show');
    return;
  }
  indicator.classList.add('show');
  const isFormatValid = validateUsernameFormat(username);
  dot.className = isFormatValid ? 'dot valid' : 'dot invalid';
  status.textContent = isFormatValid ? 'Valid username' : 'Invalid username format or too short';
}

async function validateRegisterUsername() {
  const username = document.getElementById('register-username')?.value.trim();
  const dot = document.getElementById('register-username-dot');
  const status = document.getElementById('register-username-status');
  const indicator = document.getElementById('register-username-indicator');
  if (!username || !dot || !status || !indicator) {
    indicator?.classList.remove('show');
    return;
  }
  indicator.classList.add('show');
  const isFormatValid = validateUsernameFormat(username);
  const isUnique = await isUsernameUnique(username);
  dot.className = isFormatValid && isUnique ? 'dot valid' : 'dot invalid';
  status.textContent = isFormatValid ? (isUnique ? 'Valid username' : 'Username already taken') : 'Invalid username format or too short';
}

async function validateForgotIdUsername() {
  const username = document.getElementById('forgot-id-username')?.value.trim();
  const dot = document.getElementById('forgot-id-username-dot');
  const status = document.getElementById('forgot-id-username-status');
  const indicator = document.getElementById('forgot-id-username-indicator');
  if (!username || !dot || !status || !indicator) {
    indicator?.classList.remove('show');
    return;
  }
  indicator.classList.add('show');
  const isFormatValid = validateUsernameFormat(username);
  const exists = await doesUsernameExist(username);
  dot.className = isFormatValid && exists ? 'dot valid' : 'dot invalid';
  status.textContent = isFormatValid ? (exists ? 'Username found' : 'Username not found') : 'Invalid username format or too short';
}

async function validatePhoneNumber() {
  const phone = document.getElementById('register-phone')?.value.trim();
  const dot = document.getElementById('register-phone-dot');
  const status = document.getElementById('register-phone-status');
  const indicator = document.getElementById('register-phone-indicator');
  if (!phone || !dot || !status || !indicator) {
    indicator?.classList.remove('show');
    return;
  }
  indicator.classList.add('show');
  const isValid = validatePhoneNumberFormat(phone);
  const isUnique = await isPhoneUnique(phone);
  dot.className = isValid && isUnique ? 'dot valid' : 'dot invalid';
  status.textContent = isValid ? (isUnique ? 'Valid phone number' : 'Phone number already registered') : 'Invalid phone number';
}

function validateForgotIdPhone() {
  const phone = document.getElementById('forgot-id-phone')?.value.trim();
  const dot = document.getElementById('forgot-id-phone-dot');
  const status = document.getElementById('forgot-id-phone-status');
  const indicator = document.getElementById('forgot-id-phone-indicator');
  if (!phone || !dot || !status || !indicator) {
    indicator?.classList.remove('show');
    return;
  }
  indicator.classList.add('show');
  const isValid = validatePhoneNumberFormat(phone);
  dot.className = isValid ? 'dot valid' : 'dot invalid';
  status.textContent = isValid ? 'Valid phone number' : 'Invalid phone number';
}

async function validateGmail() {
  const gmail = document.getElementById('register-gmail')?.value.trim();
  const dot = document.getElementById('register-gmail-dot');
  const status = document.getElementById('register-gmail-status');
  const indicator = document.getElementById('register-gmail-indicator');
  if (!gmail || !dot || !status || !indicator) {
    indicator?.classList.remove('show');
    return;
  }
  indicator.classList.add('show');
  const isValid = validateGmailFormat(gmail);
  const isUnique = await isGmailUnique(gmail);
  dot.className = isValid && isUnique ? 'dot valid' : 'dot invalid';
  status.textContent = isValid ? (isUnique ? 'Valid Gmail' : 'Gmail already registered') : 'Invalid Gmail address';
}

function validateForgotUsernameGmail() {
  const gmail = document.getElementById('forgot-username-gmail')?.value.trim();
  const dot = document.getElementById('forgot-username-gmail-dot');
  const status = document.getElementById('forgot-username-gmail-status');
  const indicator = document.getElementById('forgot-username-gmail-indicator');
  if (!gmail || !dot || !status || !indicator) {
    indicator?.classList.remove('show');
    return;
  }
  indicator.classList.add('show');
  const isValid = validateGmailFormat(gmail);
  dot.className = isValid ? 'dot valid' : 'dot invalid';
  status.textContent = isValid ? 'Valid Gmail' : 'Invalid Gmail address';
}

function validatePasswordInput() {
  const password = document.getElementById('register-password')?.value;
  const validationList = document.getElementById('password-validation-list');
  if (!password || !validationList) {
    validationList?.classList.remove('show');
    return;
  }
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
  if (!confirmPassword || !validationList || !matchDot) {
    validationList?.classList.remove('show');
    return;
  }
  validationList.classList.add('show');
  matchDot.className = password === confirmPassword && password ? 'dot valid' : 'dot invalid';
}

async function saveUser(user) {
  try {
    const users = await fetchUsers();
    users.push(user);
    await saveUsers(users);
    logAttempt(user.phone, 'success: user saved', 'register');
  } catch (err) {
    console.error('Error saving user:', err);
    logAttempt(user.phone, 'failed: save error', 'register');
  }
}

function showForm(formId) {
  const forms = ['login-form', 'register-form', 'verify-form', 'forgot-id-form', 'forgot-username-form'];
  const footer = document.getElementById('footer');
  forms.forEach(id => {
    const form = document.getElementById(id);
    if (!form) return;
    form.classList.toggle('form-hidden', id !== formId);
    form.classList.toggle('form-visible', id === formId);
  });
  if (footer) footer.style.display = ['login-form', 'register-form'].includes(formId) ? 'block' : 'none';
  resetIndicators(formId);
  if (formId === 'login-form') {
    ['login-username', 'login-id'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  } else if (formId === 'register-form') {
    ['register-username', 'register-phone', 'register-gmail', 'register-password', 'register-confirm-password'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  } else if (formId === 'verify-form') {
    const verifyCode = document.getElementById('verify-code');
    const verifyError = document.getElementById('verify-code-error');
    const verifyContent = document.getElementById('verify-content');
    const successContent = document.getElementById('success-content');
    if (verifyCode) verifyCode.value = '';
    if (verifyError) verifyError.classList.remove('show');
    if (verifyContent) verifyContent.style.display = 'none';
    if (successContent) successContent.style.display = 'none';
  } else if (formId === 'forgot-id-form') {
    ['forgot-id-username', 'forgot-id-phone', 'forgot-id-code'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    ['forgot-id-input', 'forgot-id-verify', 'forgot-id-success'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = id === 'forgot-id-input' ? 'block' : 'none';
    });
  } else if (formId === 'forgot-username-form') {
    ['forgot-username-gmail', 'forgot-username-code'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    ['forgot-username-input', 'forgot-username-verify', 'forgot-username-success'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = id === 'forgot-username-input' ? 'block' : 'none';
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
  const pendingUser = JSON.parse(localStorage.getItem('pendingUser') || '{}');
  const username = pendingUser.username || 'user';
  const loadingUsername = document.getElementById('loading-username');
  const loading = document.getElementById('loading');
  const verifyContent = document.getElementById('verify-content');
  const successContent = document.getElementById('success-content');
  const csrfToken = document.getElementById('csrf-token');
  const verifyCode = document.getElementById('verify-code');
  if (loadingUsername) loadingUsername.textContent = username;
  if (loading) loading.style.display = 'flex';
  if (verifyContent) verifyContent.style.display = 'none';
  if (successContent) successContent.style.display = 'none';
  if (csrfToken) csrfToken.value = localStorage.getItem('registerCsrfToken') || '';
  if (verifyCode) {
    verifyCode.disabled = false;
    verifyCode.placeholder = 'Enter the 6-digit code';
  }
  setTimeout(() => {
    if (loading) loading.style.display = 'none';
    if (verifyContent) verifyContent.style.display = 'block';
    startVerificationTimer('verify-timer', 'register');
    updateCooldown('register');
  }, 10000);
}

function showSuccess(userId) {
  const verifyContent = document.getElementById('verify-content');
  const successContent = document.getElementById('success-content');
  const userIdElement = document.getElementById('user-id');
  const copyButton = document.getElementById('copy-id-button');
  if (verifyContent) verifyContent.style.display = 'none';
  if (successContent) successContent.style.display = 'block';
  if (userIdElement) userIdElement.textContent = userId;
  if (copyButton) {
    copyButton.disabled = false;
    copyButton.textContent = 'Copy ID';
  }
}

function showForgotId() {
  showForm('forgot-id-form');
}

function showForgotIdVerify() {
  const forgotIdInput = document.getElementById('forgot-id-input');
  const forgotIdVerify = document.getElementById('forgot-id-verify');
  const forgotIdSuccess = document.getElementById('forgot-id-success');
  const forgotIdCode = document.getElementById('forgot-id-code');
  const csrfToken = document.getElementById('forgot-id-csrf-token');
  if (forgotIdInput) forgotIdInput.style.display = 'none';
  if (forgotIdVerify) forgotIdVerify.style.display = 'block';
  if (forgotIdSuccess) forgotIdSuccess.style.display = 'none';
  if (forgotIdCode) {
    forgotIdCode.value = '';
    forgotIdCode.disabled = false;
    forgotIdCode.placeholder = 'Enter the 6-digit code';
  }
  if (csrfToken) csrfToken.value = localStorage.getItem('forgot-idCsrfToken') || '';
  startVerificationTimer('forgot-id-timer', 'forgot-id');
  updateCooldown('forgot-id');
}

function showForgotIdSuccess(userId) {
  const forgotIdInput = document.getElementById('forgot-id-input');
  const forgotIdVerify = document.getElementById('forgot-id-verify');
  const forgotIdSuccess = document.getElementById('forgot-id-success');
  const forgotIdUserId = document.getElementById('forgot-id-user-id');
  const copyButton = document.getElementById('copy-forgot-id-button');
  if (forgotIdInput) forgotIdInput.style.display = 'none';
  if (forgotIdVerify) forgotIdVerify.style.display = 'none';
  if (forgotIdSuccess) forgotIdSuccess.style.display = 'block';
  if (forgotIdUserId) forgotIdUserId.textContent = userId;
  if (copyButton) {
    copyButton.disabled = false;
    copyButton.textContent = 'Copy ID';
  }
}

function showForgotUsername() {
  showForm('forgot-username-form');
}

function showForgotUsernameVerify() {
  const forgotUsernameInput = document.getElementById('forgot-username-input');
  const forgotUsernameVerify = document.getElementById('forgot-username-verify');
  const forgotUsernameSuccess = document.getElementById('forgot-username-success');
  const forgotUsernameCode = document.getElementById('forgot-username-code');
  const csrfToken = document.getElementById('forgot-username-csrf-token');
  if (forgotUsernameInput) forgotUsernameInput.style.display = 'none';
  if (forgotUsernameVerify) forgotUsernameVerify.style.display = 'block';
  if (forgotUsernameSuccess) forgotUsernameSuccess.style.display = 'none';
  if (forgotUsernameCode) {
    forgotUsernameCode.value = '';
    forgotUsernameCode.disabled = false;
    forgotUsernameCode.placeholder = 'Enter the 6-digit OTP';
  }
  if (csrfToken) csrfToken.value = localStorage.getItem('forgot-usernameCsrfToken') || '';
  startVerificationTimer('forgot-username-timer', 'forgot-username');
  updateCooldown('forgot-username');
}

function showForgotUsernameSuccess(username) {
  const forgotUsernameInput = document.getElementById('forgot-username-input');
  const forgotUsernameVerify = document.getElementById('forgot-username-verify');
  const forgotUsernameSuccess = document.getElementById('forgot-username-success');
  const forgotUsernameResult = document.getElementById('forgot-username-result');
  const copyButton = document.getElementById('copy-forgot-username-button');
  if (forgotUsernameInput) forgotUsernameInput.style.display = 'none';
  if (forgotUsernameVerify) forgotUsernameVerify.style.display = 'none';
  if (forgotUsernameSuccess) forgotUsernameSuccess.style.display = 'block';
  if (forgotUsernameResult) forgotUsernameResult.textContent = username;
  if (copyButton) {
    copyButton.disabled = false;
    copyButton.textContent = 'Copy Username';
  }
}

function updateCooldown(type = 'register') {
  const lastAttemptTime = parseInt(localStorage.getItem(`${type}LastAttemptTime`) || '0');
  const cooldownDuration = 60 * 1000;
  const timeElapsed = Date.now() - lastAttemptTime;
  const timeLeft = Math.max(0, cooldownDuration - timeElapsed);
  const cooldownText = document.getElementById(`${type === 'register' ? 'cooldown-text' : `${type}-cooldown-text`}`);
  const resendLink = document.getElementById(`${type === 'register' ? 'resend-link' : `${type}-resend-link`}`);
  if (!cooldownText || !resendLink) return;
  if (timeLeft > 0) {
    const seconds = Math.ceil(timeLeft / 1000);
    cooldownText.textContent = `Please wait ${seconds} seconds to resend.`;
    resendLink.style.pointerEvents = 'none';
    resendLink.style.color = '#999';
    setTimeout(() => updateCooldown(type), 1000);
  } else {
    cooldownText.textContent = '';
    resendLink.style.pointerEvents = 'auto';
    resendLink.style.color = '#007bff';
  }
}

function resendCode() {
  const pendingUser = JSON.parse(localStorage.getItem('pendingUser') || '{}');
  if (!pendingUser.phone) {
    showNotification('No phone number found. Please register again.', 3000, null, 'error');
    logAttempt('', 'failed: no phone', 'register');
    showRegister();
    return;
  }
  const code = sendWhatsAppVerification(pendingUser.phone, pendingUser.username, 'register');
  if (!code) {
    showNotification('Verification attempt limit reached. Try again in 24 hours.', 3000, null, 'error');
    return;
  }
  showVerify();
}

function resendForgotIdCode() {
  const pendingRecovery = JSON.parse(localStorage.getItem('pendingRecovery') || '{}');
  if (!pendingRecovery.phone) {
    showNotification('No phone number found. Please start recovery again.', 3000, null, 'error');
    logAttempt('', 'failed: no phone', 'forgot-id');
    showForgotId();
    return;
  }
  const code = sendWhatsAppVerification(pendingRecovery.phone, pendingRecovery.username, 'forgot-id');
  if (!code) {
    showNotification('Recovery attempt limit reached. Try again in 24 hours.', 3000, null, 'error');
    return;
  }
  showForgotIdVerify();
}

function resendForgotUsernameCode() {
  const pendingRecovery = JSON.parse(localStorage.getItem('pendingUsernameRecovery') || '{}');
  if (!pendingRecovery.gmail) {
    showNotification('No Gmail found. Please start recovery again.', 3000, null, 'error');
    logAttempt('', 'failed: no gmail', 'forgot-username');
    showForgotUsername();
    return;
  }
  const code = sendGmailOTP(pendingRecovery.gmail, 'forgot-username');
  if (!code) {
    showNotification('OTP attempt limit reached. Try again in 24 hours.', 3000, null, 'error');
    return;
  }
  showForgotUsernameVerify();
}

async function handleLogin() {
  const username = document.getElementById('login-username')?.value.trim();
  const id = document.getElementById('login-id')?.value.trim();
  const usernameError = document.getElementById('login-username-error');
  if (!username || !id) {
    showNotification('Please fill in all fields.', 3000, null, 'error');
    return;
  }
  if (!validateUsernameFormat(username)) {
    if (usernameError) usernameError.classList.add('show');
    showNotification('Invalid username format.', 3000, null, 'error');
    return;
  } else {
    if (usernameError) usernameError.classList.remove('show');
  }
  const cleanUsername = username.startsWith('@') ? username.slice(1) : username;
  const users = await fetchUsers();
  const user = users.find(u => u.username === cleanUsername && u.id === id);
  if (user) {
    localStorage.setItem('currentUser', JSON.stringify(user));
    showNotification('Login successful!', 3000, 'dashboard.html', 'success');
  } else {
    showNotification('Invalid username or ID.', 3000, null, 'error');
  }
}

async function handleRegister() {
  const username = document.getElementById('register-username')?.value.trim();
  const phone = document.getElementById('register-phone')?.value.trim();
  const gmail = document.getElementById('register-gmail')?.value.trim();
  const password = document.getElementById('register-password')?.value;
  const confirmPassword = document.getElementById('register-confirm-password')?.value;
  const usernameError = document.getElementById('register-username-error');
  const phoneError = document.getElementById('register-phone-error');
  const gmailError = document.getElementById('register-gmail-error');
  const passwordError = document.getElementById('register-password-error');
  const confirmPasswordError = document.getElementById('register-confirm-password-error');
  if (!username || !phone || !gmail || !password || !confirmPassword) {
    showNotification('Please fill in all fields.', 3000, null, 'error');
    return;
  }
  const isUsernameValid = validateUsernameFormat(username);
  const isUsernameUniqueResult = await isUsernameUnique(username);
  const isPhoneValid = validatePhoneNumberFormat(phone);
  const isPhoneUniqueResult = await isPhoneUnique(phone);
  const isGmailValid = validateGmailFormat(gmail);
  const isGmailUniqueResult = await isGmailUnique(gmail);
  const passwordValidation = validatePassword(password);
  const passwordsMatch = password === confirmPassword;
  let hasError = false;
  if (!isUsernameValid) {
    if (usernameError) usernameError.classList.add('show');
    showNotification('Invalid username format.', 3000, null, 'error');
    hasError = true;
  } else if (!isUsernameUniqueResult) {
    if (usernameError) usernameError.classList.add('show');
    showNotification('Username already taken.', 3000, null, 'error');
    hasError = true;
  } else {
    if (usernameError) usernameError.classList.remove('show');
  }
  if (!isPhoneValid) {
    if (phoneError) phoneError.classList.add('show');
    showNotification('Invalid phone number.', 3000, null, 'error');
    hasError = true;
  } else if (!isPhoneUniqueResult) {
    if (phoneError) phoneError.classList.add('show');
    showNotification('Phone number already registered.', 3000, null, 'error');
    hasError = true;
  } else {
    if (phoneError) phoneError.classList.remove('show');
  }
  if (!isGmailValid) {
    if (gmailError) gmailError.classList.add('show');
    showNotification('Invalid Gmail address.', 3000, null, 'error');
    hasError = true;
  } else if (!isGmailUniqueResult) {
    if (gmailError) gmailError.classList.add('show');
    showNotification('Gmail already registered.', 3000, null, 'error');
    hasError = true;
  } else {
    if (gmailError) gmailError.classList.remove('show');
  }
  if (!passwordValidation.length || !passwordValidation.uppercase || !passwordValidation.number || !passwordValidation.noSpecial) {
    if (passwordError) passwordError.classList.add('show');
    showNotification('Password must be 8+ characters, with uppercase, lowercase, and numbers, no special characters.', 3000, null, 'error');
    hasError = true;
  } else {
    if (passwordError) passwordError.classList.remove('show');
  }
  if (!passwordsMatch) {
    if (confirmPasswordError) confirmPasswordError.classList.add('show');
    showNotification('Passwords do not match.', 3000, null, 'error');
    hasError = true;
  } else {
    if (confirmPasswordError) confirmPasswordError.classList.remove('show');
  }
  if (hasError) return;
  const cleanUsername = username.startsWith('@') ? username.slice(1) : username;
  const user = {
    id: generateUUID(),
    username: cleanUsername,
    phone,
    gmail,
    profileImage: `assets/images/image00${Math.floor(Math.random() * 5) + 1}.png`
  };
  localStorage.setItem('pendingUser', JSON.stringify(user));
  const code = sendWhatsAppVerification(phone, username, 'register');
  if (!code) {
    showNotification('Verification attempt limit reached. Try again in 24 hours.', 3000, null, 'error');
    return;
  }
  showVerify();
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
    showNotification('Please enter the verification code.', 3000, null, 'error');
    return;
  }
  if (csrfToken !== storedCsrfToken) {
    if (verifyError) verifyError.classList.add('show');
    showNotification('Invalid session. Please try again.', 3000, null, 'error');
    logAttempt('', 'failed: invalid csrf', 'register');
    showRegister();
    return;
  }
  if (!isValidCode(code, storedCode, codeTimestamp)) {
    if (verifyError) verifyError.classList.add('show');
    showNotification('Invalid or expired code.', 3000, null, 'error');
    logAttempt(localStorage.getItem('registerPendingKey') || '', 'failed: invalid code', 'register');
    return;
  }
  if (verifyError) verifyError.classList.remove('show');
  const pendingUser = JSON.parse(localStorage.getItem('pendingUser') || '{}');
  if (!pendingUser.id) {
    showNotification('No pending user found. Please register again.', 3000, null, 'error');
    logAttempt('', 'failed: no pending user', 'register');
    showRegister();
    return;
  }
  await saveUser(pendingUser);
  localStorage.removeItem('pendingUser');
  localStorage.removeItem('registerVerificationCode');
  localStorage.removeItem('registerPendingKey');
  localStorage.removeItem('registerCodeTimestamp');
  localStorage.removeItem('registerCsrfToken');
  localStorage.removeItem('registerLastAttemptTime');
  showSuccess(pendingUser.id);
}

async function handleForgotId() {
  const username = document.getElementById('forgot-id-username')?.value.trim();
  const phone = document.getElementById('forgot-id-phone')?.value.trim();
  const usernameError = document.getElementById('forgot-id-username-error');
  const phoneError = document.getElementById('forgot-id-phone-error');
  if (!phone) {
    if (phoneError) phoneError.classList.add('show');
    showNotification('Please enter a phone number.', 3000, null, 'error');
    return;
  }
  if (!validatePhoneNumberFormat(phone)) {
    if (phoneError) phoneError.classList.add('show');
    showNotification('Invalid phone number.', 3000, null, 'error');
    return;
  } else {
    if (phoneError) phoneError.classList.remove('show');
  }
  if (username && !validateUsernameFormat(username)) {
    if (usernameError) usernameError.classList.add('show');
    showNotification('Invalid username format.', 3000, null, 'error');
    return;
  } else {
    if (usernameError) usernameError.classList.remove('show');
  }
  const users = await fetchUsers();
  const cleanUsername = username ? username.startsWith('@') ? username.slice(1) : username : null;
  const user = users.find(u => u.phone === phone && (!cleanUsername || u.username === cleanUsername));
  if (!user) {
    showNotification('No account found with the provided details.', 3000, null, 'error');
    return;
  }
  localStorage.setItem('pendingRecovery', JSON.stringify({ phone, username: cleanUsername || user.username, id: user.id }));
  const code = sendWhatsAppVerification(phone, user.username, 'forgot-id');
  if (!code) {
    showNotification('Recovery attempt limit reached. Try again in 24 hours.', 3000, null, 'error');
    return;
  }
  showForgotIdVerify();
}

async function handleForgotIdVerify() {
  const code = document.getElementById('forgot-id-code')?.value.trim();
  const csrfToken = document.getElementById('forgot-id-csrf-token')?.value;
  const storedCode = localStorage.getItem('forgot-idVerificationCode');
  const storedCsrfToken = localStorage.getItem('forgot-idCsrfToken');
  const codeTimestamp = parseInt(localStorage.getItem('forgot-idCodeTimestamp') || '0');
  const verifyError = document.getElementById('forgot-id-code-error');
  if (!code || !csrfToken) {
    if (verifyError) verifyError.classList.add('show');
    showNotification('Please enter the recovery code.', 3000, null, 'error');
    return;
  }
  if (csrfToken !== storedCsrfToken) {
    if (verifyError) verifyError.classList.add('show');
    showNotification('Invalid session. Please try again.', 3000, null, 'error');
    logAttempt('', 'failed: invalid csrf', 'forgot-id');
    showForgotId();
    return;
  }
  if (!isValidCode(code, storedCode, codeTimestamp)) {
    if (verifyError) verifyError.classList.add('show');
    showNotification('Invalid or expired code.', 3000, null, 'error');
    logAttempt(localStorage.getItem('forgot-idPendingKey') || '', 'failed: invalid code', 'forgot-id');
    return;
  }
  if (verifyError) verifyError.classList.remove('show');
  const pendingRecovery = JSON.parse(localStorage.getItem('pendingRecovery') || '{}');
  if (!pendingRecovery.id) {
    showNotification('No recovery data found. Please start again.', 3000, null, 'error');
    logAttempt('', 'failed: no recovery data', 'forgot-id');
    showForgotId();
    return;
  }
  localStorage.removeItem('pendingRecovery');
  localStorage.removeItem('forgot-idVerificationCode');
  localStorage.removeItem('forgot-idPendingKey');
  localStorage.removeItem('forgot-idCodeTimestamp');
  localStorage.removeItem('forgot-idCsrfToken');
  localStorage.removeItem('forgot-idLastAttemptTime');
  showForgotIdSuccess(pendingRecovery.id);
}

async function handleForgotUsername() {
  const gmail = document.getElementById('forgot-username-gmail')?.value.trim();
  const gmailError = document.getElementById('forgot-username-gmail-error');
  if (!gmail) {
    if (gmailError) gmailError.classList.add('show');
    showNotification('Please enter a Gmail address.', 3000, null, 'error');
    return;
  }
  if (!validateGmailFormat(gmail)) {
    if (gmailError) gmailError.classList.add('show');
    showNotification('Invalid Gmail address.', 3000, null, 'error');
    return;
  } else {
    if (gmailError) gmailError.classList.remove('show');
  }
  const users = await fetchUsers();
  const user = users.find(u => u.gmail === gmail);
  if (!user) {
    showNotification('No account found with this Gmail address.', 3000, null, 'error');
    return;
  }
  localStorage.setItem('pendingUsernameRecovery', JSON.stringify({ gmail, username: user.username }));
  const code = sendGmailOTP(gmail, 'forgot-username');
  if (!code) {
    showNotification('OTP attempt limit reached. Try again in 24 hours.', 3000, null, 'error');
    return;
  }
  showForgotUsernameVerify();
}

async function handleForgotUsernameVerify() {
  const code = document.getElementById('forgot-username-code')?.value.trim();
  const csrfToken = document.getElementById('forgot-username-csrf-token')?.value;
  const storedCode = localStorage.getItem('forgot-usernameVerificationCode');
  const storedCsrfToken = localStorage.getItem('forgot-usernameCsrfToken');
  const codeTimestamp = parseInt(localStorage.getItem('forgot-usernameCodeTimestamp') || '0');
  const verifyError = document.getElementById('forgot-username-code-error');
  if (!code || !csrfToken) {
    if (verifyError) verifyError.classList.add('show');
    showNotification('Please enter the OTP code.', 3000, null, 'error');
    return;
  }
  if (csrfToken !== storedCsrfToken) {
    if (verifyError) verifyError.classList.add('show');
    showNotification('Invalid session. Please try again.', 3000, null, 'error');
    logAttempt('', 'failed: invalid csrf', 'forgot-username');
    showForgotUsername();
    return;
  }
  if (!isValidCode(code, storedCode, codeTimestamp)) {
    if (verifyError) verifyError.classList.add('show');
    showNotification('Invalid or expired OTP.', 3000, null, 'error');
    logAttempt(localStorage.getItem('forgot-usernamePendingKey') || '', 'failed: invalid code', 'forgot-username');
    return;
  }
  if (verifyError) verifyError.classList.remove('show');
  const pendingRecovery = JSON.parse(localStorage.getItem('pendingUsernameRecovery') || '{}');
  if (!pendingRecovery.username) {
    showNotification('No recovery data found. Please start again.', 3000, null, 'error');
    logAttempt('', 'failed: no recovery data', 'forgot-username');
    showForgotUsername();
    return;
  }
  localStorage.removeItem('pendingUsernameRecovery');
  localStorage.removeItem('forgot-usernameVerificationCode');
  localStorage.removeItem('forgot-usernamePendingKey');
  localStorage.removeItem('forgot-usernameCodeTimestamp');
  localStorage.removeItem('forgot-usernameCsrfToken');
  localStorage.removeItem('forgot-usernameLastAttemptTime');
  showForgotUsernameSuccess(pendingRecovery.username);
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  ['login-username'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', validateLoginUsername);
  });
  ['register-username'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', validateRegisterUsername);
  });
  ['forgot-id-username'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', validateForgotIdUsername);
  });
  ['register-phone'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', validatePhoneNumber);
  });
  ['forgot-id-phone'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', validateForgotIdPhone);
  });
  ['register-gmail'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', validateGmail);
  });
  ['forgot-username-gmail'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', validateForgotUsernameGmail);
  });
  ['register-password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', validatePasswordInput);
  });
  ['register-confirm-password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', validateConfirmPassword);
  });
});
