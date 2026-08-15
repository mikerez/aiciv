var _auth_application_secret = 'cbc6e026e751525dfcd0e42b9542e5d7817ef925c2d0830427817d0e5f0bd0ca';
var _remembered_login_key = 'aiciv_remembered_login';

var loginError = new URLSearchParams(window.location.search).get('error');
if (loginError) {
    var loginMessages = {
        session_replaced: vocabularyText('auth.session_replaced'),
        session_expired: vocabularyText('auth.session_expired'),
        invalid_session: vocabularyText('auth.invalid_session'),
        authentication_required: vocabularyText('auth.authentication_required'),
        account_unavailable: vocabularyText('auth.account_unavailable')
    };
    document.getElementById('message').textContent = loginMessages[loginError] || loginMessages.invalid_session;
}

function authCookie(name, value, maxAge)
{
    document.cookie = name + '=' + encodeURIComponent(value)
        + '; Path=/; Max-Age=' + maxAge + '; SameSite=Lax; Secure';
}

function authDeviceId()
{
    var cookie = document.cookie.match(/(?:^|;\s*)aiciv_device_id=([^;]+)/);
    var deviceId = cookie ? decodeURIComponent(cookie[1]) : '';
    try {
        deviceId = deviceId || localStorage.getItem('aiciv_device_id') || '';
    } catch (error) {}
    if (!deviceId) {
        deviceId = 'web-' + (crypto.randomUUID
            ? crypto.randomUUID()
            : Array.from(crypto.getRandomValues(new Uint8Array(16)), function(value) {
                return value.toString(16).padStart(2, '0');
            }).join(''));
    }
    try { localStorage.setItem('aiciv_device_id', deviceId); } catch (error) {}
    authCookie('aiciv_device_id', deviceId, 31536000);
    return deviceId;
}

async function authenticatePlayer(login, password, rememberMe)
{
    var response = await fetch('api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({
            action: 'login',
            secret: _auth_application_secret,
            login: login,
            password: password,
            remember_me: !!rememberMe,
            device_id: authDeviceId()
        })
    });
    var result = await response.json();
    if (!response.ok || !result.ok) {
        throw new Error(result.error ? result.error.message : vocabularyText('auth.login_failed'));
    }
    if (!/(?:^|;\s*)aiciv_player_id=\d+/.test(document.cookie)) {
        throw new Error(vocabularyText('auth.cookie_rejected'));
    }
    return result;
}

try {
    var rememberedLogin = localStorage.getItem(_remembered_login_key) || '';
    if (rememberedLogin) {
        document.getElementById('login').value = rememberedLogin;
        document.getElementById('rememberMe').checked = true;
    }
} catch (error) {}

document.getElementById('loginForm').addEventListener('submit', async function(event) {
    event.preventDefault();
    var button = document.getElementById('submitButton');
    var message = document.getElementById('message');
    button.disabled = true;
    message.textContent = '';
    try {
        var login = document.getElementById('login').value.trim();
        var rememberMe = document.getElementById('rememberMe').checked;
        await authenticatePlayer(
            login,
            document.getElementById('password').value,
            rememberMe
        );
        try {
            if (rememberMe) localStorage.setItem(_remembered_login_key, login);
            else localStorage.removeItem(_remembered_login_key);
        } catch (storageError) {}
        window.location.replace('./');
    } catch (error) {
        message.textContent = error.message;
        button.disabled = false;
    }
});
