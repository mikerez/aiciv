function hereDoc(f) {
  return f.toString().
      replace(/^[^\/]+\/\*!?/, '').
      replace(/\*\/[^\/]+$/, '');
}

var tennysonQuote = hereDoc(function() {/*!
<div data-menu-option="city_production_status" style="display:none;color:darkblue;font:bold 15px 'Courier New';margin-bottom:8px;"></div>
<div data-menu-option="city_production_options" style="display:none;color:darkblue;font:15px 'Courier New';margin-bottom:12px;"></div>
<center><font size="5" color="darkblue" face="Courier New">Action options:</font></center>
<div data-menu-option="unit_identity" style="display:none;color:darkblue;font:13px 'Courier New';margin:5px 0 4px 0;"></div>
<div data-menu-option="unit_features" style="display:none;color:darkblue;font:bold 15px 'Courier New';margin:6px 0 8px 0;"></div>
<font size="5" color="darkblue" face="Courier New">
<span data-menu-option="goto"><a data-menu-command="goto" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><span class="unit-command-key">G</span> Goto</a><br></span>
<span data-menu-option="fortificate"><a data-menu-command="fortificate" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><span class="unit-command-key">F</span> Fortificate</a><br></span>
<span data-menu-option="fortification"><a data-menu-command="fortification" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><span class="unit-command-key">F</span> Fortification</a><br></span>
<span data-menu-option="road"><a data-menu-command="road" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><span class="unit-command-key">R</span> Road</a><br></span>
<span data-menu-option="road_to"><a data-menu-command="road_to" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><span class="unit-command-key">J</span> Road-to</a><br></span>
<span data-menu-option="pasture"><a data-menu-command="pasture" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><span class="unit-command-key">P</span> Pasture</a><br></span>
<span data-menu-option="farm"><a data-menu-command="farm" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><span class="unit-command-key">Y</span> Farm</a><br></span>
<span data-menu-option="plantation"><a data-menu-command="plantation" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><span class="unit-command-key">N</span> Plantation</a><br></span>
<span data-menu-option="camp"><a data-menu-command="camp" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><span class="unit-command-key">K</span> Camp</a><br></span>
<span data-menu-option="fishing_boats"><a data-menu-command="fishing_boats" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><span class="unit-command-key">O</span> Fishing Boats</a><br></span>
<span data-menu-option="network"><a data-menu-command="network" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><span class="unit-command-key">X</span> Network</a><br></span>
<span data-menu-option="quarry"><a data-menu-command="quarry" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><span class="unit-command-key">Q</span> Quarry</a><br></span>
<span data-menu-option="winery"><a data-menu-command="winery" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><span class="unit-command-key">V</span> Winery</a><br></span>
<span data-menu-option="cottage"><a data-menu-command="cottage" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><span class="unit-command-key">T</span> Cottage</a><br></span>
<span data-menu-option="workshop"><a data-menu-command="workshop" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><span class="unit-command-key">S</span> Workshop</a><br></span>
<span data-menu-option="mine"><a data-menu-command="mine" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><span class="unit-command-key">M</span> Mine</a><br></span>
<span data-menu-option="destroy"><a data-menu-command="destroy" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><span class="unit-command-key">D</span> Destroy</a><br></span>
<span data-menu-option="wait"><a data-menu-command="wait" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><span class="unit-command-key">W</span> Wait</a><br></span>
<span data-menu-option="irrigate"><a data-menu-command="irrigate" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><span class="unit-command-key">I</span> Irrigate</a><br></span>
<span data-menu-option="chop_forest"><a data-menu-command="chop_forest" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><span class="unit-command-key">C</span> Chop forrest</a><br></span>
<span data-menu-option="build_city"><a data-menu-command="build_city" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><span class="unit-command-key">B</span> Build City</a><br></span>
<span data-menu-option="explore"><a data-menu-command="explore" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><span class="unit-command-key">E</span> Explore</a><br></span>
<span data-menu-option="patrol"><a data-menu-command="patrol" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><span class="unit-command-key">L</span> Patrol</a><br></span>
<span data-menu-option="automate"><a data-menu-command="automate" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><span class="unit-command-key">A</span> Automate</a><br></span>
</font>
<div data-menu-option="city_production_queue" style="display:none;color:darkblue;font:14px 'Courier New';margin-top:12px;"></div>
*/});


var unitCommandKeyStyle = document.createElement('style');
unitCommandKeyStyle.textContent = '.unit-command-key{display:inline-flex;align-items:center;justify-content:center;width:1.4em;height:1.4em;margin-right:0.35em;border:1px solid rgba(20,40,80,0.65);border-radius:4px;background:rgba(255,255,255,0.65);font:bold 0.78em Courier New;color:darkblue;box-sizing:border-box;}';
document.head.appendChild(unitCommandKeyStyle);

var foreground = document.getElementById('foreground');
foreground.style.backgroundColor = 'rgba(255, 255, 255, 0.5)';
foreground.style.borderRadius = '12px';
foreground.style.padding = '12px';
foreground.style.boxSizing = 'border-box';
foreground.innerHTML += tennysonQuote;
foreground.addEventListener('mousedown', function(event) { event.stopPropagation(); });
foreground.addEventListener('click', function(event) {
  event.preventDefault();
  event.stopPropagation();
  var commandElement = event.target.closest('[data-menu-command]');
  var command = commandElement ? commandElement.getAttribute('data-menu-command') : null;
  if (command && typeof _current_game !== 'undefined') {
    _current_game.doCommand(command);
    if (_current_game.dismissActionMenu && command.indexOf('produce_unit:') != 0) {
      _current_game.dismissActionMenu();
    }
    if (typeof drawScene === 'function') {
      _fulldraw = 1;
      drawScene(0);
    }
  }
});
