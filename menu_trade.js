function createTradeMenu()
{
  var panel = document.createElement('div');
  panel.id = 'trade_menu';
  panel.dataset.mainMenu = 'trade';
  panel.style.position = 'fixed';
  panel.style.left = '100px';
  panel.style.top = '50px';
  panel.style.right = '370px';
  panel.style.bottom = '200px';
  panel.style.display = 'none';
  panel.style.zIndex = '4';
  panel.style.backgroundColor = 'rgba(255, 255, 255, 0.5)';
  panel.style.borderRadius = '12px';
  panel.style.boxSizing = 'border-box';
  panel.style.padding = '14px';
  panel.style.overflow = 'auto';
  panel.style.fontFamily = 'Courier New, monospace';
  panel.innerHTML = '<div style="color:darkblue;font-size:22px;font-weight:bold;">Trade</div>';
  panel.addEventListener('mousedown', function(event) { event.stopPropagation(); });
  panel.addEventListener('click', function(event) { event.stopPropagation(); });
  document.body.appendChild(panel);
}

createTradeMenu();
