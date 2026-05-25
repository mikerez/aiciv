function hereDoc(f) {
  return f.toString().
      replace(/^[^\/]+\/\*!?/, '').
      replace(/\*\/[^\/]+$/, '');
}

var tennysonQuote = hereDoc(function() {/*!
<div data-menu-option="city_production_status" style="display:none;color:darkblue;font:bold 15px 'Courier New';margin-bottom:8px;"></div>
<div data-menu-option="city_production_options" style="display:none;color:darkblue;font:15px 'Courier New';margin-bottom:12px;"></div>
<center><font size="5" color="darkblue" face="Courier New">Action options:</font></center>
<font size="5" color="darkblue" face="Courier New">
<span data-menu-option="goto"><a data-menu-command="goto" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><span class="unit-command-key">G</span> Goto</a><br></span>
<span data-menu-option="fortificate"><a data-menu-command="fortificate" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><span class="unit-command-key">F</span> Fortificate</a><br></span>
<span data-menu-option="fortification"><a data-menu-command="fortification" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><span class="unit-command-key">F</span> Fortification</a><br></span>
<span data-menu-option="road"><a data-menu-command="road" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><span class="unit-command-key">R</span> Road</a><br></span>
<span data-menu-option="pasture"><a data-menu-command="pasture" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><span class="unit-command-key">P</span> Pasture</a><br></span>
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
<div data-menu-option="buildings">
<font size="3" color="white" face="Courier New" style="background-color: rgb(50,50,50)">Buildings:</font><br>
<div data-menu-option="build_city_hall" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><img src="images/city.png" width="100" style="vertical-align:middle"> <font size="4">City hall</text></div>
<div data-menu-option="build_fabric" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><img src="images/factory.png" width="100" style="vertical-align:middle"> <font size="4">Fabric</text></div>
<div data-menu-option="build_tank" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><img src="images/big.png" width="100" style="vertical-align:middle"> <font size="4">Tank!!!!</text></div>
<div data-menu-option="build_city_2" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><img src="images/city.png" width="100" style="vertical-align:middle"> <font size="4">City hall</text></div>
<div data-menu-option="build_fabric_2" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><img src="images/factory.png" width="100" style="vertical-align:middle"> <font size="4">Fabric</text></div>
<div data-menu-option="build_tank_2" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"><img src="images/big.png" width="100" style="vertical-align:middle"> <font size="4">Tank!!!!</text></div>
</div>
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
    if (typeof drawScene === 'function') {
      _fulldraw = 1;
      drawScene(0);
    }
  }
});
