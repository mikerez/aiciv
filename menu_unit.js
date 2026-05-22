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
<span data-menu-option="goto"><a data-menu-command="goto" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"">Goto (G)</a><br></span>
<span data-menu-option="fortificate"><a data-menu-command="fortificate" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"">Fortificate (F)</a><br></span>
<span data-menu-option="road"><a data-menu-command="road" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"">Road (R)</a><br></span>
<span data-menu-option="destroy"><a data-menu-command="destroy" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"">Destroy (D)</a><br></span>
<span data-menu-option="wait"><a data-menu-command="wait" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"">Wait (W)</a><br></span>
<span data-menu-option="irrigate"><a data-menu-command="irrigate" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"">Irrigate (I)</a><br></span>
<span data-menu-option="chop_forest"><a data-menu-command="chop_forest" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"">Chop forrest (C)</a><br></span>
<span data-menu-option="build_city"><a data-menu-command="build_city" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"">Build City (B)</a><br></span>
<span data-menu-option="explore"><a data-menu-command="explore" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"">Explore (E)</a><br></span>
<span data-menu-option="patrol"><a data-menu-command="patrol" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"">Patrol (P)</a><br></span>
<span data-menu-option="automate"><a data-menu-command="automate" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"">Automate (A)</a><br></span>
</font>
<div data-menu-option="buildings">
<font size="3" color="white" face="Courier New" style="background-color: rgb(50,50,50)">Buildings:</font><br>
<div data-menu-option="build_city_hall" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';""><img src="images/city.png" width="100" style="vertical-align:middle"> <font size="4">City hall</text></div>
<div data-menu-option="build_fabric" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';""><img src="images/factory.png" width="100" style="vertical-align:middle"> <font size="4">Fabric</text></div>
<div data-menu-option="build_tank" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';""><img src="images/big.png" width="100" style="vertical-align:middle"> <font size="4">Tank!!!!</text></div>
<div data-menu-option="build_city_2" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';""><img src="images/city.png" width="100" style="vertical-align:middle"> <font size="4">City hall</text></div>
<div data-menu-option="build_fabric_2" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';""><img src="images/factory.png" width="100" style="vertical-align:middle"> <font size="4">Fabric</text></div>
<div data-menu-option="build_tank_2" onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';""><img src="images/big.png" width="100" style="vertical-align:middle"> <font size="4">Tank!!!!</text></div>
</div>
*/});

var foreground = document.getElementById('foreground');
foreground.style.backgroundColor = 'rgba(255, 255, 255, 0.5)';
foreground.style.borderRadius = '12px';
foreground.style.padding = '12px';
foreground.style.boxSizing = 'border-box';
foreground.innerHTML += tennysonQuote;
foreground.addEventListener('mousedown', function(event) { event.stopPropagation(); });
foreground.addEventListener('click', function(event) {
  event.stopPropagation();
  var commandElement = event.target.closest('[data-menu-command]');
  var command = commandElement ? commandElement.getAttribute('data-menu-command') : null;
  if (command && typeof _current_game !== 'undefined') {
    _current_game.doCommand(command);
  }
});
