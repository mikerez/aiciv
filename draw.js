const _draw = new class
{
    clear()
    {
        const canvas2D = document.getElementById("canvas2D");
        const ctx = canvas2D.getContext("2d");

// Set text properties
//ctx.font = "48px Arial";
//ctx.fillStyle = "white";
//ctx.fillText("Hello, WebGL!", 10, 50);  // Draws the text on the canvas
//        console.log("::: " + x + "," + y + " => " + " " + xy1toi(x,y) + ":" + xy1toj(x,y))
        ctx.clearRect(0, 0, canvas2D.width, canvas2D.height);
        return ctx;
    }

    drawArrow(ctx, fromX, fromY, toX, toY)
    {
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        const headLength = 15;
        const angle = Math.atan2(toY - fromY, toX - fromX);
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.lineTo(
            toX - headLength * Math.cos(angle - Math.PI / 6),
            toY - headLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(toX, toY);
        ctx.lineTo(
            toX - headLength * Math.cos(angle + Math.PI / 6),
            toY - headLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
    }

    drawStroke(ctx, in_i, in_j, mark)
    {
        if (in_i-1 < 0 || in_i+1 >= _map_size || in_j-1 < 0 || in_j+1 >= _map_size) {
            return;
        }
        var out_i = -1, out_j = -1;
        if ((_map_terrain_bit[in_i-1][in_j]&0x400) == 0) {
            out_i = in_i-1; out_j = in_j;
        }
        if ((_map_terrain_bit[in_i+1][in_j]&0x400) == 0) {
            out_i = in_i+1; out_j = in_j;
        }
        if ((_map_terrain_bit[in_i][in_j-1]&0x400) == 0) {
            out_i = in_i; out_j = in_j-1;
        }
        if ((_map_terrain_bit[in_i][in_j+1]&0x400) == 0) {
            out_i = in_i; out_j = in_j+1;
        }
        if (out_i == -1 || out_j == -1) {
            return;
        }
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(0,150,0,0.3)';
        var i = 0, j = 0;
        var start_i = out_i;
        var start_j = out_j;
        var limit = 0;
        while ((_map_terrain_bit[out_i+i][out_j+j]>>16 != mark || (out_i+i==start_i && out_j+j == start_j)) && ++limit < 5000) {
            _map_terrain_bit[out_i+i][out_j+j] &= 0x0000FFFF;
            _map_terrain_bit[out_i+i][out_j+j] |= mark<<16;

            ctx.beginPath();
            ctx.moveTo(x1toX(ijtox1(out_i,out_j)), y1toY(ijtoy1(out_i,out_j)));
            ctx.lineTo(x1toX(ijtox1(out_i+i,out_j+j)), y1toY(ijtoy1(out_i+i,out_j+j)));
            ctx.stroke();
            out_i = out_i+i;
            out_j = out_j+j;

            var found = 0;
            // try to continue same direction if possible
            if ((i != 0 || j != 0) && in_i+i >= 0 && in_i+i < _map_size && in_j+j >= 0 && in_j+j < _map_size) {
                if ((_map_terrain_bit[out_i+i][out_j+j]&0x400) == 0) {
                    if ((_map_terrain_bit[in_i+i][in_j+j]&0x400) == 0) {
                       _map_terrain_bit[out_i+i][out_j+j] &= 0x0000FFFF;
                       _map_terrain_bit[out_i+i][out_j+j] |= mark<<16;
                    }
                    else {
                        in_i = in_i+i;
                        in_j = in_j+j;
                        found = 1;
                    }
                }
            }

            if (found) {
                continue;
            }

            found = 0;
            // find a straight direction
            for(i=-1; i < 2; i = i + 1) {
                for(j=-1; j < 2; j = j + 1) {
                    if ((i == 0 && j == 0) || in_i+i < 0 || in_i+i >= _map_size || in_j+j < 0 || in_j+j >= _map_size) {
                        continue;
                    }
                    if ((_map_terrain_bit[in_i+i][in_j+j]&0x400) != 0
                        && (_map_terrain_bit[out_i+i][out_j+j]&0x400) == 0
                        && (_map_terrain_bit[out_i+i][out_j+j]>>16 != mark || (limit > 4 && out_i+i==start_i && out_j+j == start_j))) {

                        in_i = in_i+i;
                        in_j = in_j+j;

                        found = 1;
                        break;
                    }
                }
                if (found) break;
            }

            if (found) {
                continue;
            }

            found = 0;
            // try to turn right or left (in_ij keeps same)
            for(i=-1; i < 2; i = i + 1) {
                for(j=-1; j < 2; j = j + 1) {
                    if ((i == 0 && j == 0) || in_i+i < 0 || in_i+i >= _map_size || in_j+j < 0 || in_j+j >= _map_size) {
                        continue;
                    }
                    if (out_i+i >= in_i - 1 && out_i+i <= in_i + 1 && out_j+j >= in_j - 1 && out_j+j <= in_j + 1
                        && (_map_terrain_bit[out_i+i][out_j+j]&0x400) == 0
                        && (_map_terrain_bit[out_i+i][out_j+j]>>16 != mark || (limit > 4 && out_i+i==start_i && out_j+j == start_j))) {

                        in_i = in_i;
                        in_j = in_j;
                        found = 1;
                        break;
                    }
                }
                if (found) break;
            }
            if (!found) {
                break;
            }
        };
    }
}
