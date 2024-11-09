

_screen.loadTexture('settler.png', 256);
_screen.loadTexture('worker.png', 257);
_screen.loadTexture('warrior.png', 258);
_screen.loadTexture('city.png', 259);

// game settings
_start_game_settlers = 2;
_start_game_workers = 2;
_start_game_point = new Coord(0,0);
// game state


_city = new Unit(3, 256+3);
_city.can_move = false;

const _game_prehistory = new class
{


    makeTurn()
    {
        _game.makeTurn();
    }

    startGame()
    {
        _start_game_point = _game.random_point();

        for(var k=0; k < _start_game_settlers; k++) {
            var point = _game.random_point(0, _start_game_point.add(-5,-5), _start_game_point.add(5,5));
            _game.add_unit(new Unit(0, 256+0, point));
        }
        for(var k=0; k < _start_game_workers; k++) {
            var point = _game.random_point(0, _start_game_point.add(-5,-5), _start_game_point.add(5,5));
            _game.add_unit(new Unit(1, 256+1, point));
        }

        _screenOffsetX = ijtox(_start_game_point.i,_start_game_point.j)/2;
        _screenOffsetY = ijtoy(_start_game_point.i,_start_game_point.j)/2;

        _game.makeTurn();
    }

    doCommand(command)
    {
        if (command == 'b') {
            if (_selection != -1 && _units[_selection].type == 0) {
                _game.make_unit(_city, _units[_selection].coord);
                _game.del_unit(_selection);
                _selection = -1;
            }
        }
    }
}

