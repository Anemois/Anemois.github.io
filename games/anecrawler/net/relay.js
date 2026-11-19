import {direct} from "./p2p.js";


// Playing together, introduced by the game server (server/server.js).
//
// The host opens a room and gets a short code; friends join with the code.
// The server then introduces each guest's browser to the host's, and they
// open a direct line (p2p.js); the game itself goes over that line. Until
// it is open, or if a network will not let one through, the server passes
// the game's messages along instead. Either way, each guest looks to the
// game like one line to the host: an "end" with
//
//   end.send(message)     end.onMessage = fn     end.onClose = fn     end.close()
//
// (the same shape transport.js uses for its in-memory test pair).
//
// Through the server, game messages travel as ">ID json" (host to guest ID)
// and "^json" (guest to host), and arrive as "<json" / ".ID json"; the
// server passes them on without reading them.

const ATTEMPT_MS = 12000;        // one connection attempt
const WAKE_MS = 75000;          // a sleeping free server takes about a minute to wake
const RETRY_MS = 2500;
const KEEP_ALIVE_MS = 60000;    // a word now and then, so the connection stays open
const WAKE_EVERY_MS = 8 * 60000;    // a free server sleeps after 15 quiet minutes: a host's room keeps it up
const BUSY = 256 * 1024;        // bytes waiting to go out before the line counts as busy


// The server's plain web address (for waking it up): wss://x/ws -> https://x/health
const healthURL = url =>
    url.replace(/^ws/, "http").replace(/\/ws$/, "/health");


// Nudges a server that may be asleep, without waiting for it. Cheap enough
// to do whenever someone might be about to play.
export function wake(url){

    fetch(healthURL(url), {mode: "no-cors", cache: "no-store"}).catch(() => {});

}


function attempt(url){

    return new Promise((resolve, reject) => {

        let socket;

        try{

            socket = new WebSocket(url);

        }
        catch{

            reject(new Error("can't reach the game server"));

            return;

        }

        const timer = setTimeout(() => {

            socket.onopen = socket.onerror = null;
            socket.close();

            reject(new Error("the game server did not answer"));

        }, ATTEMPT_MS);

        socket.onopen = () => {

            clearTimeout(timer);

            resolve(socket);

        };

        socket.onerror = () => {

            clearTimeout(timer);

            reject(new Error("can't reach the game server"));

        };

    });

}


// Connects, and if the server is asleep keeps trying while it wakes up.
// onWaiting() is called once if the first try fails.
async function connect(url, onWaiting){

    const deadline = Date.now() + WAKE_MS;

    let told = false;

    for(;;){

        try{

            return await attempt(url);

        }
        catch(error){

            if(Date.now() + RETRY_MS > deadline)
                throw error;

            if(!told){

                told = true;

                wake(url);
                onWaiting?.();

            }

            await new Promise(resolve => setTimeout(resolve, RETRY_MS));

        }

    }

}


// keeps the connection (and a free server) awake while nobody is playing
function keepAlive(socket){

    const timer = setInterval(() => say(socket, {t: "hi"}), KEEP_ALIVE_MS);

    socket.addEventListener("close", () => clearInterval(timer));

}


// a message from the server; anything unreadable is ignored
function read(text){

    try{

        return JSON.parse(text);

    }
    catch{

        return null;

    }

}


const say = (socket, message) => {

    if(socket.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify(message));

};


// The first answer to our first message: resolves on `want`, fails on an
// error or a closed connection.
function answer(socket, want){

    return new Promise((resolve, reject) => {

        socket.onmessage = ({data}) => {

            const message = read(data);

            if(message?.t === want)
                resolve(message);
            else if(message?.t === "error")
                reject(new Error(message.reason));

        };

        socket.onclose = event => reject(new Error(event.reason || "the game server closed the connection"));

    });

}


function makeEnd(socket, post, hangUp){

    const end = {
        open: true,
        onMessage: null,
        onClose: null,

        get busy(){

            return socket.bufferedAmount > BUSY;

        },

        send(message){

            if(end.open)
                post(message);

        },

        close(){

            if(!end.open)
                return;

            end.open = false;

            hangUp();

        }
    };

    return end;

}


// The other side went away (or we lost the server): tell whoever uses the end.
function lost(end){

    if(!end.open)
        return;

    end.open = false;

    end.onClose?.();

}


/* ---------------- Host ---------------- */

// Opens a room. onGuest(end) is called for each player who joins;
// onClose(reason) if the connection to the server is lost (guests on a
// direct line stay; nobody new can join); onWaiting() if the server has to
// wake up first. Resolves to {code, close()}.
export async function hostRoom(url, {game, onGuest, onClose, onWaiting}){

    const socket = await connect(url, onWaiting);
    const ends = new Map();         // guest id -> end

    say(socket, {t: "host", game, v: 2});

    const {code} = await answer(socket, "room");

    keepAlive(socket);

    // a sleeping server would forget the room: keep it awake while it is open
    const awake = setInterval(() => wake(url), WAKE_EVERY_MS);

    socket.addEventListener("close", () => clearInterval(awake));

    socket.onmessage = ({data}) => {

        // a guest's game message: ".ID json"
        if(data[0] === "."){

            const space = data.indexOf(" ");

            const message = read(data.slice(space + 1));

            if(message)
                ends.get(data.slice(1, space))?.onMessage?.(message);

            return;

        }

        const message = read(data);

        switch(message?.t){

            case "guest": {

                const id = message.id;

                const end = makeEnd(
                    socket,
                    m => {

                        if(socket.readyState === WebSocket.OPEN)
                            socket.send(">" + id + " " + JSON.stringify(m));

                    },
                    () => {

                        ends.delete(id);

                        say(socket, {t: "kick", id});

                    }
                );

                ends.set(id, end);

                onGuest(direct(end, {starts: true}));

                break;

            }

            case "left": {

                const end = ends.get(message.id);

                ends.delete(message.id);

                if(end)
                    lost(end);

                break;

            }

        }

    };

    let closing = false;

    socket.onclose = event => {

        for(const end of ends.values())
            lost(end);

        ends.clear();

        if(!closing)
            onClose?.(event.reason || "lost the connection to the game server");

    };

    return {
        code,

        close(){

            closing = true;

            socket.close(1000, "host stopped");

        }
    };

}


/* ---------------- Guest ---------------- */

// Joins the room with this code. Resolves to the end that talks to its host
// (directly once it can); rejects with a reason anyone can read ("no game
// with that code"...).
export async function joinRoom(url, code, {onWaiting} = {}){

    const socket = await connect(url, onWaiting);

    say(socket, {t: "join", code, v: 2});

    await answer(socket, "joined");

    keepAlive(socket);

    const end = makeEnd(
        socket,
        m => {

            if(socket.readyState === WebSocket.OPEN)
                socket.send("^" + JSON.stringify(m));

        },
        () => socket.close(1000, "left")
    );

    // the host's game messages: "<json"
    socket.onmessage = ({data}) => {

        if(data[0] !== "<")
            return;

        const message = read(data.slice(1));

        if(message)
            end.onMessage?.(message);

    };

    socket.onclose = () => lost(end);

    return direct(end, {starts: false});

}
