const _menu_console = new class
{
  constructor()
  {
    this.maxLines = 600;
    this.lines = [];
    this.body = null;
  }

  fontSize()
  {
    return document.body && document.body.classList && document.body.classList.contains('mobile-ui') ? 19 : 11;
  }

  create()
  {
    var panel = document.createElement('div');
    panel.id = 'console_menu';
    panel.dataset.mainMenu = 'console';
    panel.style.position = 'fixed';
    panel.style.left = '100px';
    panel.style.top = '50px';
    panel.style.right = '370px';
    panel.style.bottom = '200px';
    panel.style.display = 'none';
    panel.style.zIndex = '4';
    panel.style.backgroundColor = 'rgba(255, 255, 255, 0.25)';
    panel.style.borderRadius = '12px';
    panel.style.boxSizing = 'border-box';
    panel.style.padding = '14px';
    panel.style.overflow = 'hidden';
    panel.style.fontFamily = 'Courier New, monospace';

    var title = document.createElement('div');
    title.textContent = 'AI Console';
    title.style.color = 'darkblue';
    title.style.fontSize = '22px';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '8px';
    panel.appendChild(title);

    var controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.justifyContent = 'space-between';
    controls.style.alignItems = 'center';
    controls.style.marginBottom = '8px';

    var status = document.createElement('span');
    status.id = 'console_status';
    status.textContent = 'Model decisions and applied orders';
    status.style.color = 'rgb(20,40,80)';
    status.style.fontSize = this.fontSize() + 'px';
    controls.appendChild(status);

    var clear = document.createElement('button');
    clear.type = 'button';
    clear.textContent = 'Clear';
    clear.style.fontSize = this.fontSize() + 'px';
    clear.style.padding = '3px 8px';
    clear.addEventListener('click', function(event) {
      event.stopPropagation();
      _menu_console.clear();
    });
    controls.appendChild(clear);
    panel.appendChild(controls);

    var body = document.createElement('pre');
    body.id = 'console_log';
    body.style.margin = '0';
    body.style.height = 'calc(100% - 58px)';
    body.style.overflow = 'auto';
    body.style.whiteSpace = 'pre-wrap';
    body.style.wordBreak = 'break-word';
    body.style.color = 'rgb(10,20,35)';
    body.style.fontSize = this.fontSize() + 'px';
    body.style.lineHeight = '1.3';
    body.style.backgroundColor = 'rgba(255,255,255,0.18)';
    body.style.borderRadius = '6px';
    body.style.padding = '8px';
    body.style.boxSizing = 'border-box';
    panel.appendChild(body);
    this.body = body;

    ['mousedown', 'mouseup', 'click', 'touchstart', 'touchmove', 'touchend'].forEach(function(name) {
      panel.addEventListener(name, function(event) { event.stopPropagation(); }, { passive: false });
    });
    document.body.appendChild(panel);
  }

  append(message)
  {
    var now = new Date();
    var stamp = now.toLocaleTimeString();
    this.lines.push('[' + stamp + '] ' + message);
    if (this.lines.length > this.maxLines) {
      this.lines.splice(0, this.lines.length - this.maxLines);
    }
    this.render();
  }

  clear()
  {
    this.lines = [];
    this.render();
  }

  render()
  {
    if (!this.body) {
      return;
    }
    this.body.style.fontSize = this.fontSize() + 'px';
    this.body.textContent = this.lines.join('\n');
    this.body.scrollTop = this.body.scrollHeight;
  }
}();

function appendConsoleLog(message)
{
  if (typeof _menu_console !== 'undefined') {
    _menu_console.append(message);
  }
}

_menu_console.create();
