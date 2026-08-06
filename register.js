var _register_application_secret = 'cbc6e026e751525dfcd0e42b9542e5d7817ef925c2d0830427817d0e5f0bd0ca';

function registerCookie(name, value, maxAge)
{
    document.cookie = name + '=' + encodeURIComponent(value)
        + '; Path=/game/; Max-Age=' + maxAge + '; SameSite=Lax; Secure';
}

function registerDeviceId()
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
    registerCookie('aiciv_device_id', deviceId, 31536000);
    return deviceId;
}

async function apiRequest(payload)
{
    payload.secret = _register_application_secret;
    var response = await fetch('api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify(payload)
    });
    var result = await response.json();
    if (!response.ok || !result.ok) {
        throw new Error(result.error ? result.error.message : 'Registration failed.');
    }
    return result;
}

document.getElementById('registerForm').addEventListener('submit', async function(event) {
    event.preventDefault();
    var button = document.getElementById('submitButton');
    var message = document.getElementById('message');
    var login = document.getElementById('login').value.trim();
    var password = document.getElementById('password').value;
    button.disabled = true;
    message.textContent = '';
    try {
        await apiRequest({
            action: 'register',
            login: login,
            email: document.getElementById('email').value.trim(),
            password: password
        });
        var session = await apiRequest({
            action: 'login',
            login: login,
            password: password,
            device_id: registerDeviceId()
        });
        registerCookie('aiciv_player_id', session.user.id, 86400);
        if (!/(?:^|;\s*)aiciv_player_id=\d+/.test(document.cookie)) {
            throw new Error('The browser rejected the game session cookie. Enable cookies for this site.');
        }
        window.location.replace('./');
    } catch (error) {
        message.textContent = error.message;
        button.disabled = false;
    }
});
