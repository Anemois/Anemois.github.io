const MAX_TRIPS = 8;    // orbs one seeker can collect in a single update


export function createSeekers(field, orbs){

    const seekers = [];     // {el, x, y}
    const claimed = new Set();


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


    // Moves every seeker `speed * dt` pixels along its trips, collecting orbs on
    // the way. Works for any dt, so while the card is collapsed (animate = false)
    // the game can step it coarsely without drawing and earn the same income.
    // dt in seconds, speed in px/s
    function update(dt, speed, animate){

        if(!seekers.length || !field.clientWidth)
            return;

        // seekers spread out over different orbs when there are several
        claimed.clear();

        for(const seeker of seekers){

            let budget = speed * dt;
            let angle = 0;

            for(let trip = 0; budget > 0 && trip < MAX_TRIPS; trip++){

                const target = orbs.nearest(seeker.x, seeker.y, claimed);

                if(!target)
                    break;

                claimed.add(target);

                const dx = target.x - seeker.x;
                const dy = target.y - seeker.y;
                const distance = Math.hypot(dx, dy);

                angle = Math.atan2(dy, dx);

                if(distance <= target.r + budget){

                    budget -= distance;

                    seeker.x = target.x;
                    seeker.y = target.y;

                    orbs.collect(target);

                }
                else{

                    seeker.x += dx / distance * budget;
                    seeker.y += dy / distance * budget;

                    budget = 0;

                }

            }

            if(animate)
                draw(seeker, angle);

        }

    }


    return {setCount, update};

}
