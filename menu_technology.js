const _technology_tree = [
  { id: 'Mining', sprite: 'images/tech_mining.png', x: 0, y: 0, prerequired: [] },
  { id: 'Pottery', sprite: 'images/tech_pottery.png', x: 0, y: 1, prerequired: [] },
  { id: 'Animal Husbandry', sprite: 'images/tech_animal_husbandry.png', x: 0, y: 2, prerequired: [] },
  { id: 'Sailing', sprite: 'images/tech_sailing.png', x: 0, y: 3, prerequired: [] },
  { id: 'Masonry', sprite: 'images/tech_masonry.png', x: 1, y: 0, prerequired: ['Mining'] },
  { id: 'Bronze Working', sprite: 'images/tech_bronze_working.png', x: 1, y: 1, prerequired: ['Mining'] },
  { id: 'Irrigation', sprite: 'images/tech_irrigation.png', x: 1, y: 2, prerequired: ['Pottery'] },
  { id: 'Writing', sprite: 'images/tech_writing.png', x: 1, y: 3, prerequired: ['Pottery'] },
  { id: 'Archery', sprite: 'images/tech_archery.png', x: 1, y: 4, prerequired: ['Animal Husbandry'] },
  { id: 'Wheel', sprite: 'images/tech_wheel.png', x: 1, y: 5, prerequired: ['Animal Husbandry'] },
  { id: 'Astronomy', sprite: 'images/tech_astronomy.png', x: 2, y: 0, prerequired: ['Sailing', 'Writing'] },
  { id: 'Currency', sprite: 'images/tech_currency.png', x: 2, y: 1, prerequired: ['Writing'] },
  { id: 'Horseback Riding', sprite: 'images/tech_horseback_riding.png', x: 2, y: 2, prerequired: ['Animal Husbandry', 'Wheel'] },
  { id: 'Iron Working', sprite: 'images/tech_iron_working.png', x: 2, y: 3, prerequired: ['Bronze Working'] },
  { id: 'Shipbuilding', sprite: 'images/tech_shipbuilding.png', x: 2, y: 4, prerequired: ['Sailing', 'Bronze Working'] },
  { id: 'Mathematics', sprite: 'images/tech_mathematics.png', x: 2, y: 5, prerequired: ['Writing'] },
  { id: 'Navigation', sprite: 'images/tech_navigation.png', x: 3, y: 0, prerequired: ['Sailing', 'Astronomy'] },
  { id: 'Construction', sprite: 'images/tech_construction.png', x: 3, y: 3, prerequired: ['Masonry', 'Mathematics'] },
  { id: 'Engineering', sprite: 'images/tech_engineering.png', x: 4, y: 3, prerequired: ['Construction', 'Iron Working'] },
];

function createTechnologyMenu()
{
  var panel = document.createElement('div');
  panel.id = 'technology_menu';
  panel.dataset.mainMenu = 'technology';
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

  var title = document.createElement('div');
  title.textContent = 'Technology';
  title.style.color = 'darkblue';
  title.style.fontSize = '22px';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '10px';
  panel.appendChild(title);

  var controls = document.createElement('div');
  controls.style.display = 'flex';
  controls.style.alignItems = 'center';
  controls.style.gap = '10px';
  controls.style.color = 'darkblue';
  controls.style.fontSize = '14px';
  controls.style.marginBottom = '10px';

  var rateLabel = document.createElement('span');
  rateLabel.id = 'technology_science_rate_label';
  controls.appendChild(rateLabel);

  var slider = document.createElement('input');
  slider.id = 'technology_science_rate';
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.step = '10';
  slider.value = (typeof _game_state !== 'undefined') ? _game_state.scienceRate : 0;
  slider.style.width = '180px';
  slider.addEventListener('input', function(event) {
    if (typeof _game_state !== 'undefined') {
      _game_state.setScienceRate(parseInt(event.target.value, 10));
    }
  });
  controls.appendChild(slider);

  var status = document.createElement('span');
  status.id = 'technology_research_status';
  controls.appendChild(status);
  panel.appendChild(controls);

  var map = document.createElement('div');
  map.style.position = 'relative';
  map.style.width = '980px';
  map.style.height = '650px';
  panel.appendChild(map);

  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '980');
  svg.setAttribute('height', '650');
  svg.style.position = 'absolute';
  svg.style.left = '0';
  svg.style.top = '0';
  svg.style.pointerEvents = 'none';
  map.appendChild(svg);

  var positions = {};
  var cellW = 205;
  var cellH = 98;
  var spriteW = 126;
  var spriteH = 95;
  var originX = 18;
  var originY = 18;

  _technology_tree.forEach(function(technology) {
    positions[technology.id] = {
      x: originX + technology.x * cellW,
      y: originY + technology.y * cellH
    };
  });

  _technology_tree.forEach(function(technology) {
    technology.prerequired.forEach(function(prerequired) {
      var from = positions[prerequired];
      var to = positions[technology.id];
      if (!from || !to) {
        return;
      }
      var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', from.x + spriteW);
      line.setAttribute('y1', from.y + spriteH/2);
      line.setAttribute('x2', to.x);
      line.setAttribute('y2', to.y + spriteH/2);
      line.setAttribute('stroke', 'rgba(20,40,80,0.45)');
      line.setAttribute('stroke-width', '3');
      line.setAttribute('stroke-linecap', 'round');
      svg.appendChild(line);
    });
  });

  _technology_tree.forEach(function(technology) {
    var position = positions[technology.id];
    var item = document.createElement('div');
    item.title = technology.id;
    item.dataset.technologyId = technology.id;
    item.style.position = 'absolute';
    item.style.left = position.x + 'px';
    item.style.top = position.y + 'px';
    item.style.width = spriteW + 'px';
    item.style.height = spriteH + 'px';
    item.style.cursor = 'pointer';
    item.style.border = '2px solid transparent';
    item.style.borderRadius = '6px';
    item.style.boxSizing = 'border-box';
    item.style.backgroundColor = 'rgba(255,255,255,0.15)';

    var img = document.createElement('img');
    img.src = technology.sprite;
    img.alt = technology.id;
    img.style.width = spriteW + 'px';
    img.style.height = spriteH + 'px';
    img.style.display = 'block';
    img.dataset.technologyImage = technology.id;
    item.appendChild(img);

    var progress = document.createElement('div');
    progress.dataset.technologyProgress = technology.id;
    progress.style.position = 'absolute';
    progress.style.left = '0';
    progress.style.right = '0';
    progress.style.bottom = '0';
    progress.style.backgroundColor = 'rgba(255,255,255,0.7)';
    progress.style.color = 'darkblue';
    progress.style.fontSize = '12px';
    progress.style.textAlign = 'center';
    progress.style.padding = '1px 0';
    item.appendChild(progress);

    item.addEventListener('click', function(event) {
      event.stopPropagation();
      if (typeof _game_state !== 'undefined') {
        if (_game_state.setResearch(technology.id) && typeof hideMainMenus === 'function') {
          hideMainMenus();
        }
      }
    });
    map.appendChild(item);
  });

  panel.addEventListener('mousedown', function(event) { event.stopPropagation(); });
  panel.addEventListener('click', function(event) { event.stopPropagation(); });
  document.body.appendChild(panel);
  updateTechnologyMenu();
}

function updateTechnologyMenu()
{
  var panel = document.getElementById('technology_menu');
  if (!panel || typeof _game_state === 'undefined') {
    return;
  }

  var slider = document.getElementById('technology_science_rate');
  if (slider && parseInt(slider.value, 10) != _game_state.scienceRate) {
    slider.value = _game_state.scienceRate;
  }

  var rateLabel = document.getElementById('technology_science_rate_label');
  if (rateLabel) {
    rateLabel.textContent = 'Science: ' + _game_state.scienceRate + '%';
  }

  var status = document.getElementById('technology_research_status');
  if (status) {
    if (_game_state.currentResearch) {
      var current = _game_state.currentResearch;
      status.textContent = current + ' ' + _game_state.technologyProgressValue(current) + '/' + _game_state.technologyCost(current)
        + ' +' + _game_state.lastScienceIncome + '/turn';
    }
    else {
      status.textContent = 'Choose technology. Science total: ' + _game_state.science;
    }
  }

  _technology_tree.forEach(function(technology) {
    var item = panel.querySelector('[data-technology-id="' + technology.id + '"]');
    var img = panel.querySelector('[data-technology-image="' + technology.id + '"]');
    var progress = panel.querySelector('[data-technology-progress="' + technology.id + '"]');
    var isOpen = _game_state.isTechnologyOpen(technology.id);
    var canResearch = _game_state.canResearch(technology.id);
    var isCurrent = _game_state.currentResearch == technology.id;
    var cost = _game_state.technologyCost(technology.id);
    var done = Math.min(cost, _game_state.technologyProgressValue(technology.id));

    if (img) {
      img.style.opacity = isOpen ? '1' : (canResearch || isCurrent ? '0.75' : '0.35');
      img.style.filter = isOpen ? '' : 'grayscale(40%)';
    }
    if (item) {
      item.style.borderColor = isCurrent ? 'orange' : (isOpen ? 'rgba(0,120,0,0.8)' : 'transparent');
      item.style.cursor = canResearch ? 'pointer' : 'default';
    }
    if (progress) {
      if (isOpen) {
        progress.textContent = 'Open';
      }
      else {
        progress.textContent = done + '/' + cost;
      }
    }
  });
}

createTechnologyMenu();
