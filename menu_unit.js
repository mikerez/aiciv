function hereDoc(f) {
  return f.toString().
      replace(/^[^\/]+\/\*!?/, '').
      replace(/\*\/[^\/]+$/, '');
}

var tennysonQuote = hereDoc(function() {/*!
<div data-menu-option="city_production_status" style="display:none;color:darkblue;font:bold 15px 'Courier New';margin-bottom:8px;"></div>
<div data-menu-option="city_production_options" style="display:none;color:darkblue;font:15px 'Courier New';margin-bottom:12px;"></div>
<div data-menu-option="unit_identity" style="display:none;color:darkblue;font:13px 'Courier New';margin:5px 0 4px 0;text-align:center;"></div>
<div data-menu-option="unit_features" style="display:none;color:darkblue;font:bold 15px 'Courier New';margin:6px 0 8px 0;"></div>
<font size="5" color="darkblue" face="Courier New">
<span data-menu-option="goto"><a data-menu-command="goto"><span data-command-label="goto"></span></a><br></span>
<span data-menu-option="fortificate"><a data-menu-command="fortificate"><span data-command-label="fortificate"></span></a><br></span>
<span data-menu-option="fortification"><a data-menu-command="fortification"><span data-command-label="fortification"></span></a><br></span>
<span data-menu-option="road"><a data-menu-command="road"><span data-command-label="road"></span></a><br></span>
<span data-menu-option="road_to"><a data-menu-command="road_to"><span data-command-label="road_to"></span></a><br></span>
<span data-menu-option="pasture"><a data-menu-command="pasture"><span data-command-label="pasture"></span></a><br></span>
<span data-menu-option="farm"><a data-menu-command="farm"><span data-command-label="farm"></span></a><br></span>
<span data-menu-option="plantation"><a data-menu-command="plantation"><span data-command-label="plantation"></span></a><br></span>
<span data-menu-option="camp"><a data-menu-command="camp"><span data-command-label="camp"></span></a><br></span>
<span data-menu-option="fishing_boats"><a data-menu-command="fishing_boats"><span data-command-label="fishing_boats"></span></a><br></span>
<span data-menu-option="network"><a data-menu-command="network"><span data-command-label="network"></span></a><br></span>
<span data-menu-option="quarry"><a data-menu-command="quarry"><span data-command-label="quarry"></span></a><br></span>
<span data-menu-option="winery"><a data-menu-command="winery"><span data-command-label="winery"></span></a><br></span>
<span data-menu-option="cottage"><a data-menu-command="cottage"><span data-command-label="cottage"></span></a><br></span>
<span data-menu-option="workshop"><a data-menu-command="workshop"><span data-command-label="workshop"></span></a><br></span>
<span data-menu-option="mine"><a data-menu-command="mine"><span data-command-label="mine"></span></a><br></span>
<span data-menu-option="disband"><a data-menu-command="disband"><span data-command-label="disband"></span></a><br></span>
<span data-menu-option="wait"><a data-menu-command="wait"><span data-command-label="wait"></span></a><br></span>
<span data-menu-option="irrigate"><a data-menu-command="irrigate"><span data-command-label="irrigate"></span></a><br></span>
<span data-menu-option="chop_forest"><a data-menu-command="chop_forest"><span data-command-label="chop_forest"></span></a><br></span>
<span data-menu-option="build_city"><a data-menu-command="build_city"><span data-command-label="build_city"></span></a><br></span>
<span data-menu-option="explore"><a data-menu-command="explore"><span data-command-label="explore"></span></a><br></span>
<span data-menu-option="patrol"><a data-menu-command="patrol"><span data-command-label="patrol"></span></a><br></span>
<span data-menu-option="automate"><a data-menu-command="automate"><span data-command-label="automate"></span></a><br></span>
</font>
<div data-menu-option="city_optimization" style="display:none;color:darkblue;font:15px 'Courier New';margin-top:12px;">
<a data-menu-command="optimize_city:food" data-vocabulary="command.optimize_food"></a><br>
<a data-menu-command="optimize_city:production" data-vocabulary="command.optimize_production"></a><br>
<a data-menu-command="optimize_city:gold" data-vocabulary="command.optimize_gold"></a><br>
<a data-menu-command="optimize_city:balanced" data-vocabulary="command.optimize_balanced"></a><br>
</div>
<div data-menu-option="city_production_queue" style="display:none;color:darkblue;font:14px 'Courier New';margin-top:12px;"></div>
<div data-menu-option="city_built_buildings" style="display:none;color:darkblue;font:14px 'Courier New';margin-top:12px;"></div>
*/});


var _unit_action_icon_version = '20260814a';
var _unit_action_icon_files = {
  goto: 'goto', fortificate: 'fortificate', fortification: 'fortification',
  road: 'road', road_to: 'road_to', pasture: 'pasture', farm: 'farm',
  plantation: 'plantation', camp: 'camp', fishing_boats: 'fishing_boats',
  network: 'network', quarry: 'quarry', winery: 'winery', cottage: 'cottage',
  workshop: 'workshop', mine: 'mine', disband: 'disband', wait: 'wait',
  irrigate: 'irrigate', chop_forest: 'chop_forest', build_city: 'build_city',
  explore: 'explore', patrol: 'patrol', automate: 'automate',
  'optimize_city:food': 'optimize_food',
  'optimize_city:production': 'optimize_production',
  'optimize_city:gold': 'optimize_gold',
  'optimize_city:balanced': 'optimize_balanced',
  'produce_unit:none': 'clear'
};

function unitActionIconUrl(command) {
  if (command && command.indexOf('produce_unit:') == 0 && command != 'produce_unit:none') {
    var unitTypeId = command.substring('produce_unit:'.length);
    if (typeof prehistoryUnitSpriteUrl === 'function') return prehistoryUnitSpriteUrl(unitTypeId);
  }
  var filename = _unit_action_icon_files[command];
  return filename ? 'images/action_' + filename + '.png?v=' + _unit_action_icon_version : null;
}

function createUnitActionIcon(command, title) {
  var source = unitActionIconUrl(command);
  if (!source) return null;
  var icon = document.createElement('img');
  icon.className = 'unit-action-icon';
  icon.src = source;
  icon.alt = '';
  icon.setAttribute('aria-hidden', 'true');
  if (title) icon.title = title;
  return icon;
}

function decorateUnitActionMenu(root) {
  if (!root || !root.querySelectorAll) return;
  var commands = root.querySelectorAll('[data-menu-command]');
  for (var index=0; index < commands.length; index++) {
    var element = commands[index];
    if (element.querySelector && element.querySelector('.unit-action-icon')) continue;
    var command = element.getAttribute('data-menu-command');
    var icon = createUnitActionIcon(command, command);
    if (!icon) continue;
    element.classList.add('unit-action-command');
    element.insertBefore(icon, element.firstChild);
  }
}

var unitCommandKeyStyle = document.createElement('style');
unitCommandKeyStyle.textContent = [
  '#foreground [data-menu-command]:hover{background-color:orange;}',
  '#foreground .unit-action-scroll{width:100%;height:100%;box-sizing:border-box;overflow-y:auto;padding:8px;}',
  '#foreground .unit-action-command{display:inline-flex;align-items:center;gap:7px;min-height:30px;}',
  '#foreground .unit-action-icon{width:28px;height:28px;object-fit:contain;flex:0 0 28px;}',
  'body.phone-ui #foreground .unit-action-icon{width:36px;height:36px;flex-basis:36px;}'
].join('');
document.head.appendChild(unitCommandKeyStyle);

var foreground = document.getElementById('foreground');
foreground.style.backgroundColor = 'transparent';
foreground.style.backgroundImage = "url('images/menu.png?v=20260815a')";
foreground.style.backgroundPosition = 'center';
foreground.style.backgroundRepeat = 'no-repeat';
foreground.style.backgroundSize = '100% 100%';
foreground.style.borderRadius = '0';
foreground.style.padding = '30px 10px';
foreground.style.boxSizing = 'border-box';
foreground.style.overflow = 'hidden';
var foregroundScroll = document.createElement('div');
foregroundScroll.className = 'unit-action-scroll';
foregroundScroll.innerHTML = tennysonQuote;
foreground.appendChild(foregroundScroll);
_game_vocabulary.apply(foreground);
var commandLabels = foreground.querySelectorAll('[data-command-label]');
for (var commandLabelIndex=0; commandLabelIndex < commandLabels.length; commandLabelIndex++) {
  var commandLabel = commandLabels[commandLabelIndex];
  commandLabel.textContent = vocabularyCommandName(commandLabel.getAttribute('data-command-label'));
}
decorateUnitActionMenu(foreground);
foreground.addEventListener('mousedown', function(event) { event.stopPropagation(); });
foreground.addEventListener('click', function(event) {
  event.preventDefault();
  event.stopPropagation();
  var commandElement = event.target.closest('[data-menu-command]');
  var command = commandElement ? commandElement.getAttribute('data-menu-command') : null;
  if (command && typeof _current_game !== 'undefined') {
    _current_game.doCommand(command);
    if (_current_game.dismissActionMenu && command != 'disband'
        && command.indexOf('produce_unit:') != 0
        && command.indexOf('optimize_city:') != 0) {
      _current_game.dismissActionMenu();
    }
    if (typeof drawScene === 'function') {
      _fulldraw = 1;
      drawScene(0);
    }
  }
});
