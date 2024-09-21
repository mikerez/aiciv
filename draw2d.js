const _draw2D = new class
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
}
