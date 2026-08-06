const _phone_ui = new class
{
    constructor()
    {
        this.isPhone = false;
        this.resizeTimer = null;
    }

    detectPhone()
    {
        var screenWidth = Math.max(1, Number(window.screen && window.screen.width) || window.innerWidth || 1);
        var screenHeight = Math.max(1, Number(window.screen && window.screen.height) || window.innerHeight || 1);
        var shortSide = Math.min(screenWidth, screenHeight);
        var longSide = Math.max(screenWidth, screenHeight);
        var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        var phoneAgent = /Android.*Mobile|iPhone|iPod|Windows Phone|Mobile/i.test(navigator.userAgent || '');
        return (coarse || phoneAgent) && shortSide <= 600 && longSide <= 1200;
    }

    viewportSize()
    {
        var viewport = window.visualViewport;
        return {
            width: Math.max(240, Math.round(viewport ? viewport.width : (window.innerWidth || window.screen.width))),
            height: Math.max(320, Math.round(viewport ? viewport.height : (window.innerHeight || window.screen.height))),
        };
    }

    apply()
    {
        this.isPhone = this.detectPhone();
        document.body.classList.toggle('phone-ui', this.isPhone);
        if (!this.isPhone) return;

        document.body.classList.add('mobile-ui');
        var actionMenu = document.getElementById('foreground');
        if (actionMenu && !actionMenu.dataset.phoneVisibilityInitialized) {
            actionMenu.style.display = 'none';
            actionMenu.dataset.phoneVisibilityInitialized = 'true';
        }
        var viewport = this.viewportSize();
        // The former phone controls assumed roughly a 720x1280 surface.
        // The tighter current dimension controls the scale after rotation.
        var widthScale = viewport.width / 720;
        var heightScale = viewport.height / 1280;
        var scale = Math.max(0.45, Math.min(0.62, Math.min(widthScale, heightScale)));
        var buttonCount = typeof _main_menu_buttons == 'undefined' ? 5 : _main_menu_buttons.length;
        var gap = Math.max(4, Math.round(10 * scale));
        var available = viewport.width - 20 - gap * Math.max(0, buttonCount - 1);
        var scaledButtonSize = Math.round(44 * scale);
        var buttonSize = Math.max(24, Math.min(30, scaledButtonSize, Math.floor(available / buttonCount)));
        var fontSize = Math.max(12, Math.min(16, Math.round(28 * scale)));
        var availablePanelHeight = Math.max(1, viewport.height - buttonSize - 66);
        var actionMenuHeight = Math.max(120, Math.floor(availablePanelHeight / 2));
        actionMenuHeight = Math.min(actionMenuHeight, availablePanelHeight);
        var statisticsY = buttonSize + 33;
        var unitStackY = statisticsY + 24;
        var unitStackAvailableHeight = Math.max(120, viewport.height - unitStackY - 52);
        var unitStackHeight = Math.max(120, Math.min(360, Math.floor(viewport.height * 0.42), unitStackAvailableHeight));
        var root = document.documentElement;
        root.style.setProperty('--phone-vw', viewport.width + 'px');
        root.style.setProperty('--phone-vh', viewport.height + 'px');
        root.style.setProperty('--phone-ui-scale', scale.toFixed(3));
        root.style.setProperty('--phone-button-size', buttonSize + 'px');
        root.style.setProperty('--phone-button-gap', gap + 'px');
        root.style.setProperty('--phone-font-size', fontSize + 'px');
        root.style.setProperty('--phone-action-menu-height', actionMenuHeight + 'px');
        root.style.setProperty('--phone-statistics-y', statisticsY + 'px');
        root.style.setProperty('--phone-unit-stack-y', unitStackY + 'px');
        root.style.setProperty('--phone-unit-stack-height', unitStackHeight + 'px');
        root.dataset.phoneScreenWidth = String(window.screen.width || viewport.width);
        root.dataset.phoneScreenHeight = String(window.screen.height || viewport.height);
        root.dataset.phoneViewportWidth = String(viewport.width);
        root.dataset.phoneViewportHeight = String(viewport.height);
    }

    scheduleApply()
    {
        clearTimeout(this.resizeTimer);
        var self = this;
        this.resizeTimer = setTimeout(function() {
            self.apply();
        }, 80);
    }

    init()
    {
        this.apply();
        var self = this;
        window.addEventListener('resize', function() { self.scheduleApply(); });
        window.addEventListener('orientationchange', function() { self.scheduleApply(); });
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', function() { self.scheduleApply(); });
        }
    }
}();

_phone_ui.init();
