import {floorName} from "../sim/loot.js";
import {setText} from "../util.js";


// The bar at the top of the field while the group decides whether to go
// through a portal (or start or give up a run). See travel() in sim.js:
// all ready = go now; nobody says "not yet" in 10 seconds = go anyway.
//
// answer(agree) sends this player's answer.

const TRIPS = {
    run: vote => `start a run from ${floorName(vote.floor ?? 1)}`,
    next: () => "go to the next floor",
    home: () => "go home",
    quit: () => "give up the run"
};


export function createVoteBar(element, {answer}){

    element.innerHTML =
        `
        <span class="ac-vote-text"></span>
        <span class="ac-vote-count"></span>
        <button class="ac-vote-yes">Ready <kbd>Y</kbd></button>
        <button class="ac-vote-no"></button>
        `;

    const $ = selector => element.querySelector(selector);

    const text = $(".ac-vote-text");
    const count = $(".ac-vote-count");
    const yes = $(".ac-vote-yes");
    const no = $(".ac-vote-no");

    let vote = null;

    element.hidden = true;

    yes.onclick = () => answer(true);
    no.onclick = () => answer(false);


    // each frame: show, hide or refresh the bar
    function update(state, me){

        vote = state.vote;

        element.hidden = !vote;

        if(!vote)
            return;

        const from = state.players.find(p => p.id === vote.from);
        const asked = vote.from === me;
        const ready = vote.ready.includes(me);
        const trip = TRIPS[vote.travel?.to ?? vote.to](vote.travel ?? vote);

        setText(text, asked ? `You want to ${trip}` : `${from?.name ?? "Someone"} wants to ${trip}`);
        setText(count, `${vote.ready.length}/${state.players.length} ready · going in ${Math.max(0, Math.ceil(vote.left))}s`);

        yes.hidden = ready;

        no.innerHTML = asked ? "Cancel <kbd>N</kbd>" : "Not yet <kbd>N</kbd>";

    }


    // Y and N while a vote is on; returns true if it used the key
    function key(event){

        if(!vote)
            return false;

        if(event.code === "KeyY"){

            answer(true);

            return true;

        }

        if(event.code === "KeyN"){

            answer(false);

            return true;

        }

        return false;

    }


    return {update, key};

}
