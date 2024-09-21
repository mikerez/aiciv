function hereDoc(f) {
  return f.toString().
      replace(/^[^\/]+\/\*!?/, '').
      replace(/\*\/[^\/]+$/, '');
}

var tennysonQuote = hereDoc(function() {/*!
<center><font size="5" color="darkblue" face="Courier New">Action options:</font></center>
<font size="5" color="darkblue" face="Courier New">
<a onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"">Goto (G)</a><br>
<a onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"">Fortificate (F)</a><br>
<a onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"">Destroy (D)</a><br>
<a onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"">Wait (W)</a><br>
<a onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"">Irrigate (I)</a><br>
<a onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"">Chop forrest (C)</a><br>
<a onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"">Explore (E)</a><br>
<a onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"">Patrol (P)</a><br>
<a onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';"">Automate (A)</a><br>
</font>
<font size="3" color="white" face="Courier New" style="background-color: rgb(50,50,50)">Buildings:</font><br>
<div onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';""><img src="images/city.png" width="100" style="vertical-align:middle"> <font size="4">City hall</text></div>
<div onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';""><img src="images/bbb.jpg" width="100" style="vertical-align:middle"> <font size="4">Fabric</text></div>
<div onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';""><img src="images/big.png" width="100" style="vertical-align:middle"> <font size="4">Tank!!!!</text></div>
<div onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';""><img src="images/aaa.jpg" width="100" style="vertical-align:middle"> <font size="4">City hall</text></div>
<div onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';""><img src="images/bbb.jpg" width="100" style="vertical-align:middle"> <font size="4">Fabric</text></div>
<div onmouseover="this.style.backgroundColor='orange';" onmouseout="this.style.backgroundColor='';""><img src="images/big.png" width="100" style="vertical-align:middle"> <font size="4">Tank!!!!</text></div>
*/});

document.getElementById('foreground').innerHTML += tennysonQuote;
