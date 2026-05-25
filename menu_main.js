const _main_menu_buttons = [
  {
    id: 'technology',
    title: 'Technology',
    icon: '<path d="M5 3h10v3H5zM4 8h12v9H4zM7 10h6M7 13h6"/>'
  },
  {
    id: 'politics',
    title: 'Politics',
    icon: '<path d="M10 3l7 4H3zM5 8v7M10 8v7M15 8v7M3 17h14"/>'
  },
  {
    id: 'finance',
    title: 'Finance',
    icon: '<circle cx="10" cy="10" r="7"/><path d="M10 6v8M7.5 8h3.5a2 2 0 0 1 0 4H9"/>'
  },
  {
    id: 'trade',
    title: 'Trade',
    icon: '<path d="M4 7h10l-2-2M14 7l-2 2M16 13H6l2 2M6 13l2-2"/>'
  }
];

function hideMainMenus()
{
  document.querySelectorAll('[data-main-menu]').forEach(function(menu) {
    menu.style.display = 'none';
  });
  document.querySelectorAll('[data-main-menu-button]').forEach(function(button) {
    button.style.backgroundColor = 'rgba(255,255,255,0.7)';
  });
}

function showMainMenu(id)
{
  var menu = document.querySelector('[data-main-menu="' + id + '"]');
  if (!menu) {
    return;
  }
  hideMainMenus();
  menu.style.display = 'block';
  var button = document.querySelector('[data-main-menu-button="' + id + '"]');
  if (button) {
    button.style.backgroundColor = 'rgba(210,225,255,0.9)';
  }
}

function toggleMainMenu(id)
{
  var menu = document.querySelector('[data-main-menu="' + id + '"]');
  if (!menu) {
    return;
  }
  var wasVisible = menu.style.display != 'none';
  hideMainMenus();
  if (!wasVisible) {
    showMainMenu(id);
  }
}

function createMainMenuButtons()
{
  var bar = document.createElement('div');
  bar.id = 'main_menu_buttons';
  bar.style.position = 'fixed';
  bar.style.top = '10px';
  bar.style.left = '50%';
  bar.style.transform = 'translateX(-50%)';
  bar.style.display = 'flex';
  bar.style.gap = '8px';
  bar.style.zIndex = '8';

  _main_menu_buttons.forEach(function(config) {
    var button = document.createElement('button');
    button.type = 'button';
    button.title = config.title;
    button.dataset.mainMenuButton = config.id;
    button.style.width = document.body.classList.contains('mobile-ui') ? '40px' : '20px';
    button.style.height = document.body.classList.contains('mobile-ui') ? '40px' : '20px';
    button.style.padding = '0';
    button.style.border = '1px solid rgba(20,40,80,0.75)';
    button.style.borderRadius = '4px';
    button.style.backgroundColor = 'rgba(255,255,255,0.7)';
    button.style.display = 'flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.cursor = 'pointer';
    var iconSize = document.body.classList.contains('mobile-ui') ? '32' : '16';
    button.innerHTML = '<svg viewBox="0 0 20 20" width="' + iconSize + '" height="' + iconSize + '" fill="none" stroke="rgb(20,40,80)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + config.icon + '</svg>';
    button.addEventListener('mousedown', function(event) { event.stopPropagation(); });
    button.addEventListener('click', function(event) {
      event.stopPropagation();
      toggleMainMenu(config.id);
    });
    bar.appendChild(button);
  });

  document.body.appendChild(bar);
  hideMainMenus();
}

createMainMenuButtons();
