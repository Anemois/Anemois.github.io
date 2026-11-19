import http from "node:http";
import {attach} from "./websocket.js";


// The game server for the site's multiplayer games.
//
// It does not run any game. One player (the host) runs the game in their
// browser; this server gives the host a short room code and passes messages
// between the host and the players who join with that code. Everyone only
// ever talks to this server, so it works on any network.
//
//   node server.js                 (Node 18 or newer, nothing to install)
//
// Settings, all optional, as environment variables:
//   PORT              where to listen (default 8787)
//   ALLOWED_ORIGINS   comma-separated websites allowed to connect, e.g.
//                     "https://www.csie.ntu.edu.tw,https://example.com";
//                     unset = any website may connect
//
// Messages are JSON text. From a client:
//   {t: "host", game}                  open a room; answered {t: "room", code}
//   {t: "join", code}                  join one; answered {t: "joined"} or {t: "error", reason}
//   host:  {t: "to", id, m}            send m to one guest
//          {t: "kick", id}             send a guest away
//   guest: {t: "up", m}                send m to the host
// From the server, besides the answers above:
//   to the host:  {t: "guest", id}     someone joined
//                 {t: "from", id, m}   a guest sent something
//                 {t: "left", id}      a guest went away
//   to a guest:   {t: "down", m}       the host sent something
// When the host goes, the room closes and its guests are disconnected.

const PORT = Number(process.env.PORT ?? 8787);

const ALLOWED = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map(origin => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);

const MAX_ROOMS = 200;
const MAX_GUESTS = 3;                   // four players in all
const MAX_MESSAGE = 256 * 1024;         // bytes
const MAX_BACKLOG = 2 * 1024 * 1024;    // bytes queued for one slow connection before we drop it
const RATE = 200;                       // messages a second one connection may send
const ROOM_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // no 0/O or 1/I mix-ups
const CODE_LENGTH = 4;

const rooms = new Map();                // code -> {code, game, host, guests: Map(id -> conn), next}


/* ---------------- Rooms ---------------- */

function newCode(){

    for(let tries = 0; tries < 50; tries++){

        let code = "";

        for(let i = 0; i < CODE_LENGTH; i++)
            code += ROOM_LETTERS[Math.floor(Math.random() * ROOM_LETTERS.length)];

        if(!rooms.has(code))
            return code;

    }

    return null;

}


function send(conn, message){

    if(conn.socket.backlog > MAX_BACKLOG){

        conn.socket.close(1008, "connection too slow");

        return;

    }

    conn.socket.send(JSON.stringify(message));

}


function openRoom(conn, game){

    if(rooms.size >= MAX_ROOMS)
        return refuse(conn, "the server is full, try again later");

    const code = newCode();

    if(!code)
        return refuse(conn, "the server is full, try again later");

    const room = {code, game: String(game ?? "").slice(0, 32), host: conn, guests: new Map(), next: 1};

    rooms.set(code, room);

    conn.role = "host";
    conn.room = room;

    send(conn, {t: "room", code});

    log(`room ${code} opened (${room.game}), ${rooms.size} open`);

}


function joinRoom(conn, rawCode){

    const code = String(rawCode ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const room = rooms.get(code);

    if(!room)
        return refuse(conn, "no game with that code");

    if(room.guests.size >= MAX_GUESTS)
        return refuse(conn, "that game is full");

    const id = `g${room.next++}`;

    conn.role = "guest";
    conn.room = room;
    conn.id = id;

    room.guests.set(id, conn);

    send(conn, {t: "joined"});
    send(room.host, {t: "guest", id});

}


function refuse(conn, reason){

    send(conn, {t: "error", reason});

    conn.socket.close(1000, reason);

}


function leave(conn){

    const room = conn.room;

    if(!room)
        return;

    conn.room = null;

    if(conn.role === "host"){

        rooms.delete(room.code);

        for(const guest of room.guests.values()){

            guest.room = null;
            guest.socket.close(1000, "the host left");

        }

        log(`room ${room.code} closed, ${rooms.size} open`);

        return;

    }

    room.guests.delete(conn.id);

    send(room.host, {t: "left", id: conn.id});

}


/* ---------------- Messages ---------------- */

function receive(conn, text){

    // a simple speed limit: count messages per second
    const now = Date.now();

    if(now - conn.windowStart > 1000){

        conn.windowStart = now;
        conn.count = 0;

    }

    if(++conn.count > RATE)
        return;

    let message;

    try{

        message = JSON.parse(text);

    }
    catch{

        return conn.socket.close(1007, "not JSON");

    }

    if(!message || typeof message !== "object")
        return;

    const room = conn.room;

    switch(message.t){

        case "host":

            if(!room)
                openRoom(conn, message.game);

            return;

        case "join":

            if(!room)
                joinRoom(conn, message.code);

            return;

        case "to": {

            const guest = conn.role === "host" ? room?.guests.get(message.id) : null;

            if(guest)
                send(guest, {t: "down", m: message.m});

            return;

        }

        case "kick": {

            const guest = conn.role === "host" ? room?.guests.get(message.id) : null;

            if(guest){

                leave(guest);

                guest.socket.close(1000, "removed by the host");

            }

            return;

        }

        case "up":

            if(conn.role === "guest" && room)
                send(room.host, {t: "from", id: conn.id, m: message.m});

            return;

    }

}


/* ---------------- Server ---------------- */

function allowOrigin(origin){

    return ALLOWED.length === 0 || ALLOWED.includes(origin.replace(/\/$/, ""));

}


const server = http.createServer((request, response) => {

    // a page to check the server is up
    if(request.url === "/" || request.url === "/health"){

        response.writeHead(200, {"Content-Type": "text/plain; charset=utf-8"});
        response.end(`game server ok · ${rooms.size} rooms open\n`);

        return;

    }

    response.writeHead(404, {"Content-Type": "text/plain; charset=utf-8"});
    response.end("not found\n");

});


const sockets = attach(server, {
    path: "/ws",
    maxMessage: MAX_MESSAGE,
    allowOrigin,

    onConnection(socket){

        const conn = {socket, role: null, room: null, id: null, windowStart: Date.now(), count: 0};

        socket.onMessage = text => receive(conn, text);
        socket.onClose = () => leave(conn);

    }
});


function log(text){

    console.log(`${new Date().toISOString()}  ${text}`);

}


server.listen(PORT, () => {

    log(`game server listening on port ${PORT}${ALLOWED.length ? `, for ${ALLOWED.join(", ")}` : ""}`);

});


for(const signal of ["SIGINT", "SIGTERM"]){

    process.on(signal, () => {

        sockets.close();
        server.close(() => process.exit(0));

        setTimeout(() => process.exit(0), 2000).unref();

    });

}
