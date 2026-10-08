export function createSeekers(field, orbs){

    const seekers = [];     // {el, x, y}


    function add(){

        const el = document.createElement("div");

        el.className = "seeker";

        field.appendChild(el);

        const seeker = {
            el,
            x: field.clientWidth / 2,
            y: field.clientHeight / 2
        };

        draw(seeker, 0);

        seekers.push(seeker);

    }


    function setCount(count){

        while(seekers.length < count)
            add();

        while(seekers.length > count)
            seekers.pop().el.remove();

    }


    function draw(seeker, angle){

        seeker.el.style.transform =
            `translate(${seeker.x}px, ${seeker.y}px) rotate(${angle}rad)`;

    }


    // dt in seconds, speed in px/s
    function update(dt, speed){

        if(!field.clientWidth)
            return;

        // seekers spread out over different orbs when there are several
        const claimed = new Set();

        for(const seeker of seekers){

            const target = orbs.nearest(seeker.x, seeker.y, claimed);

            if(!target)
                continue;

            claimed.add(target);

            const dx = target.x - seeker.x;
            const dy = target.y - seeker.y;
            const distance = Math.hypot(dx, dy);
            const step = speed * dt;

            if(distance <= target.r + step){

                seeker.x = target.x;
                seeker.y = target.y;

                orbs.collect(target);

            }
            else{

                seeker.x += dx / distance * step;
                seeker.y += dy / distance * step;

            }

            draw(seeker, Math.atan2(dy, dx));

        }

    }


    return {setCount, update};

}
