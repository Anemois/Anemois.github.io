import {hostTabs, joinTabs} from "../net/transport.js";
import {makeJoinCode, answerJoinCode} from "../net/rtc.js";
import {setText} from "../util.js";


// The "Play together" part of the panel.
//
// Hosting: your world opens to others. Tabs on this computer join on their
// own; a friend elsewhere joins by swapping two codes with you (see rtc.js).
// Joining: first looks for a host in another tab, otherwise makes a join
// code to send to a friend who is hosting.
//
// hooks: host() -> the host session (has accept(end)),
//        join(end) -> a guest session over that transport (or null),
//        leave() -> back to playing alone,
//        session() -> the current session
const ROOM = "main";
const TAB_WAIT = 900;           // ms to wait for a host in another tab


export function createCoop(element, hooks){

    element.innerHTML =
        `
        <div class="ac-row ac-coop-head">
            <span>Play together</span>
            <small class="ac-coop-status"></small>
        </div>
        <div class="ac-row ac-coop-buttons">
            <button class="ac-coop-host">Host</button>
            <button class="ac-coop-join">Join</button>
            <button class="ac-coop-invite">Invite with a code</button>
            <button class="ac-coop-leave"></button>
        </div>
        `;

    const $ = selector => element.querySelector(selector);

    const status = $(".ac-coop-status");
    const hostButton = $(".ac-coop-host");
    const joinButton = $(".ac-coop-join");
    const invite = $(".ac-coop-invite");
    const leave = $(".ac-coop-leave");

    let mode = "solo";          // solo | hosting | joining | guest
    let stopTabs = null;
    let note = "";

    hostButton.onclick = startHosting;
    joinButton.onclick = join;
    invite.onclick = inviteWithCode;
    leave.onclick = stop;


    function startHosting(){

        const session = hooks.host();

        stopTabs = hostTabs(ROOM, end => session.accept(end));
        mode = "hosting";
        note = "";

        update();

    }


    async function join(){

        mode = "joining";
        note = "looking for a host on this computer…";

        update();

        // a host in another tab answers within a moment
        const session = hooks.join(joinTabs(ROOM));

        await wait(TAB_WAIT);

        if(session.me !== null){

            mode = "guest";
            note = "";

            return update();

        }

        session.close();

        await joinWithCode();

    }


    async function joinWithCode(){

        note = "making a join code…";

        update();

        try{

            const offer = await makeJoinCode();

            copy(offer.code);

            const sent = prompt("Your join code (already copied). Send it to the friend who is hosting, then press OK.", offer.code);

            if(sent === null)
                return cancel(offer);

            const reply = prompt("Paste the reply code your friend sends back:");

            if(!reply)
                return cancel(offer);

            note = "connecting…";

            update();

            const end = await timeout(offer.finish(reply), 15000);

            hooks.join(end);

            mode = "guest";
            note = "";

        }
        catch(error){

            mode = "solo";
            note = `could not connect: ${error.message}`;

        }

        update();

    }


    function cancel(offer){

        offer.cancel();

        mode = "solo";
        note = "";

        update();

    }


    async function inviteWithCode(){

        const code = prompt("Paste your friend's join code:");

        if(!code)
            return;

        try{

            const answer = await answerJoinCode(code);

            copy(answer.code);

            prompt("Reply code (already copied). Send it back to your friend.", answer.code);

            note = "waiting for your friend…";

            update();

            const end = await timeout(answer.end, 60000);

            hooks.session().accept(end);

            note = "";

        }
        catch(error){

            note = `could not connect: ${error.message}`;

        }

        update();

    }


    function stop(){

        stopTabs?.();
        stopTabs = null;

        mode = "solo";
        note = "";

        hooks.leave();

        update();

    }


    // the host dropped us
    function lost(reason){

        stopTabs?.();
        stopTabs = null;

        mode = "solo";
        note = reason;

        update();

    }


    function update(){

        const players = hooks.session().players ?? 1;

        hostButton.hidden = joinButton.hidden = mode !== "solo";
        invite.hidden = mode !== "hosting";
        leave.hidden = mode === "solo" || mode === "joining";

        setText(leave, mode === "hosting" ? "Stop hosting" : "Leave");

        const text = {
            solo: "alone",
            joining: "joining…",
            hosting: `hosting · ${players} player${players === 1 ? "" : "s"}`,
            guest: `joined · ${players} players`
        }[mode];

        setText(status, note ? `${text} · ${note}` : text);

    }


    return {update, lost, get mode(){ return mode; }};

}


const wait = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

function timeout(promise, ms){

    return Promise.race([promise, wait(ms).then(() => { throw new Error("it took too long"); })]);

}

function copy(text){

    navigator.clipboard?.writeText(text).catch(() => {});

}
