// A transport carries messages between two players' machines. Whatever is
// underneath, each end looks the same:
//
//   end.send(message)          any JSON-like object
//   end.onMessage = fn         called with each message from the other end
//   end.onClose = fn           the other end went away
//   end.close()
//
// The game plays over the game server (relay.js). This file has an
// in-memory pair with the same shape, for testing without any network.


function makeEnd(deliver, shut){

    const end = {
        open: true,
        onMessage: null,
        onClose: null,

        send(message){

            if(end.open)
                deliver(message);

        },

        close(){

            if(!end.open)
                return;

            end.open = false;

            shut();

        }
    };

    return end;

}


// Two ends wired to each other in memory. With a delay, messages wait in a
// queue until advance(ms) has moved time far enough: the tests use that to
// play with lag.
export function loopbackPair({delay = 0, jitter = 0, random = Math.random} = {}){

    const queue = [];

    let now = 0;
    let a = null;
    let b = null;

    const post = to => message => {

        // through JSON, like a real wire: nothing is shared by accident
        const copy = JSON.parse(JSON.stringify(message));

        if(delay <= 0 && jitter <= 0){

            to().onMessage?.(copy);

            return;

        }

        queue.push({at: now + delay + random() * jitter, to, copy});

    };

    const shut = other => () => {

        const end = other();

        if(end.open){

            end.open = false;
            end.onClose?.();

        }

    };

    a = makeEnd(post(() => b), shut(() => b));
    b = makeEnd(post(() => a), shut(() => a));

    function advance(ms){

        now += ms;

        queue.sort((x, y) => x.at - y.at);

        while(queue.length && queue[0].at <= now){

            const {to, copy} = queue.shift();

            if(to().open)
                to().onMessage?.(copy);

        }

    }

    return {a, b, advance};

}
