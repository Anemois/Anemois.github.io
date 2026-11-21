// Sound effects made in code with the Web Audio API: no sound files.
//
//   const sound = createSound({groups: ["fx", "ui"]});
//   sound.unlock();                         // after a click or key (browsers insist)
//   sound.play(v => {                       // v: helpers that make one sound
//       v.noise({time: 0.08, freq: 2000, to: 600, gain: 0.3});
//       v.tone({type: "square", freq: 220, to: 90, time: 0.06, gain: 0.15});
//   }, {group: "fx", pan: -0.3, gain: 0.8, key: "shot", gap: 0.03});
//   const hum = sound.loop(v => v.tone({type: "sawtooth", freq: 110, gain: 0.05}));
//   hum.set(1.5);  hum.stop();              // pitch, and stop
//   sound.setVolume("master", 0.5);         // or a group's own volume
//
// A sound is a few oscillators and filtered noise with short envelopes,
// which is plenty for game blips, shots and booms. Sounds go through their
// group's volume, a master volume and a limiter, so many at once never
// clip. Too many at once, or the same key again within `gap` seconds, and
// the extra ones are skipped.

const MAX_VOICES = 40;


export function createSound({groups = ["fx", "ui"], context = null} = {}){

    let ctx = context;
    let master = null;
    let out = null;                     // master -> limiter -> speakers
    let noiseBuffer = null;
    let voices = 0;

    const volumes = {master: 1};
    const gains = {};
    const last = new Map();             // key -> when it last played

    for(const name of groups)
        volumes[name] = 1;


    // builds the graph the first time it is needed (or right away when a
    // context was given, e.g. for rendering offline)
    function ready(){

        if(!ctx){

            const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;

            if(!Context)
                return false;

            ctx = new Context();

        }

        if(!master){

            const limiter = ctx.createDynamicsCompressor();

            limiter.threshold.value = -10;
            limiter.knee.value = 6;
            limiter.ratio.value = 12;
            limiter.attack.value = 0.002;
            limiter.release.value = 0.15;

            master = ctx.createGain();
            master.gain.value = volumes.master;
            master.connect(limiter);
            limiter.connect(ctx.destination);

            for(const name of groups){

                gains[name] = ctx.createGain();
                gains[name].gain.value = volumes[name];
                gains[name].connect(master);

            }

            // a second of white noise, reused by every noisy sound
            noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);

            const data = noiseBuffer.getChannelData(0);

            for(let i = 0; i < data.length; i++)
                data[i] = Math.random() * 2 - 1;

            out = master;

        }

        return true;

    }


    // call from a click or key press: browsers keep audio off until then
    function unlock(){

        if(ready() && ctx.state === "suspended")
            ctx.resume?.();

    }


    function setVolume(name, value){

        volumes[name] = Math.max(0, Math.min(1, value));

        const node = name === "master" ? master : gains[name];

        if(node)
            node.gain.setTargetAtTime(volumes[name], ctx.currentTime, 0.02);

    }


    // pause everything (a hidden tab) and carry on
    const suspend = () => ctx?.suspend?.();
    const resume = () => ctx?.state === "suspended" && ctx.resume?.();


    // the helpers one sound is made with, all starting at `start` (plus
    // their own delay) and going into `into`
    function helpers(into, start){

        let end = start;

        const envelope = (param, peak, at, attack, time, curve = "exp") => {

            param.setValueAtTime(0.0001, at);
            param.linearRampToValueAtTime(peak, at + attack);

            if(curve === "exp")
                param.exponentialRampToValueAtTime(0.0001, at + attack + time);
            else
                param.linearRampToValueAtTime(0, at + attack + time);

        };

        const slide = (param, from, to, at, time) => {

            param.setValueAtTime(from, at);

            if(to !== undefined && to !== from)
                param.exponentialRampToValueAtTime(Math.max(1, to), at + time);

        };

        const v = {

            // an oscillator: type sine/square/sawtooth/triangle, freq sliding
            // to `to` over the sound; vibrato {rate, depth}; filter {type, freq, q}
            tone({type = "sine", freq = 440, to, time = 0.1, attack = 0.003, gain = 0.2, delay = 0, vibrato = null, filter = null, curve} = {}){

                const at = start + delay;
                const osc = ctx.createOscillator();
                const amp = ctx.createGain();

                osc.type = type;
                slide(osc.frequency, freq, to, at, attack + time);

                if(vibrato){

                    const lfo = ctx.createOscillator();
                    const depth = ctx.createGain();

                    lfo.frequency.value = vibrato.rate;
                    depth.gain.value = vibrato.depth;
                    lfo.connect(depth);
                    depth.connect(osc.frequency);
                    lfo.start(at);
                    lfo.stop(at + attack + time + 0.05);

                }

                envelope(amp.gain, gain, at, attack, time, curve);

                let node = osc;

                if(filter){

                    const f = ctx.createBiquadFilter();

                    f.type = filter.type ?? "lowpass";
                    f.frequency.value = filter.freq;
                    f.Q.value = filter.q ?? 0.7;
                    osc.connect(f);
                    node = f;

                }

                node.connect(amp);
                amp.connect(into);

                osc.start(at);
                osc.stop(at + attack + time + 0.05);

                end = Math.max(end, at + attack + time + 0.05);

                return v;

            },

            // filtered noise: type lowpass/highpass/bandpass, its frequency
            // sliding from freq to `to`
            noise({type = "bandpass", freq = 1000, to, q = 1, time = 0.1, attack = 0.002, gain = 0.2, delay = 0, curve} = {}){

                const at = start + delay;
                const source = ctx.createBufferSource();
                const filter = ctx.createBiquadFilter();
                const amp = ctx.createGain();

                source.buffer = noiseBuffer;
                source.loop = true;
                filter.type = type;
                filter.Q.value = q;
                slide(filter.frequency, freq, to, at, attack + time);
                envelope(amp.gain, gain, at, attack, time, curve);

                source.connect(filter);
                filter.connect(amp);
                amp.connect(into);

                // (a random spot in the noise, so repeats differ)
                source.start(at, Math.random() * 0.9);
                source.stop(at + attack + time + 0.05);

                end = Math.max(end, at + attack + time + 0.05);

                return v;

            },

            get end(){ return end; }

        };

        return v;

    }


    // one sound; build(v) makes it with the helpers. Options: group, gain,
    // pan (-1 left .. 1 right), key + gap (skip repeats closer than gap s)
    function play(build, {group = "fx", gain = 1, pan = 0, key = null, gap = 0.03} = {}){

        if(gain <= 0.001 || volumes.master <= 0 || volumes[group] <= 0 || !ready() || ctx.state === "closed")
            return;

        const now = ctx.currentTime;

        if(key !== null){

            if(now - (last.get(key) ?? -1) < gap)
                return;

            last.set(key, now);

        }

        if(voices >= MAX_VOICES)
            return;

        const amp = ctx.createGain();

        amp.gain.value = gain;

        let into = amp;

        if(pan && ctx.createStereoPanner){

            const panner = ctx.createStereoPanner();

            panner.pan.value = Math.max(-1, Math.min(1, pan));
            panner.connect(amp);
            into = panner;

        }

        amp.connect(gains[group] ?? out);

        const v = helpers(into, now + 0.005);

        build(v);

        voices++;

        // let go of it when it is done
        const left = Math.max(0.05, v.end - now) * 1000 + 50;

        setTimeout(() => {

            voices--;
            amp.disconnect();

        }, left);

    }


    // A sound that keeps going until stopped (a hum, a whirr). build(v) uses
    // tone() without a time; set(k) multiplies its pitch; level(k) its volume.
    function loop(build, {group = "fx", gain = 1} = {}){

        if(!ready())
            return {set(){}, level(){}, stop(){}};

        const now = ctx.currentTime;
        const amp = ctx.createGain();
        const oscillators = [];

        amp.gain.setValueAtTime(0, now);
        amp.gain.linearRampToValueAtTime(gain, now + 0.08);
        amp.connect(gains[group] ?? out);

        build({

            tone({type = "sine", freq = 220, gain: g = 0.1, filter = null} = {}){

                const osc = ctx.createOscillator();
                const level = ctx.createGain();

                osc.type = type;
                osc.frequency.value = freq;
                level.gain.value = g;

                let node = osc;

                if(filter){

                    const f = ctx.createBiquadFilter();

                    f.type = filter.type ?? "lowpass";
                    f.frequency.value = filter.freq;
                    f.Q.value = filter.q ?? 0.7;
                    osc.connect(f);
                    node = f;

                }

                node.connect(level);
                level.connect(amp);
                osc.start(now);

                oscillators.push({osc, freq});

            }

        });

        let stopped = false;

        return {

            set(k){

                for(const {osc, freq} of oscillators)
                    osc.frequency.setTargetAtTime(freq * k, ctx.currentTime, 0.03);

            },

            level(k){

                if(!stopped)
                    amp.gain.setTargetAtTime(gain * k, ctx.currentTime, 0.03);

            },

            stop(){

                if(stopped)
                    return;

                stopped = true;

                const t = ctx.currentTime;

                amp.gain.cancelScheduledValues(t);
                amp.gain.setTargetAtTime(0, t, 0.04);

                for(const {osc} of oscillators)
                    osc.stop(t + 0.3);

                setTimeout(() => amp.disconnect(), 400);

            }

        };

    }


    return {
        play, loop, unlock, setVolume, suspend, resume,
        volume: name => volumes[name],
        get context(){ return ctx; }
    };

}
