#!/usr/bin/env node

// node index.js -i "Ethernet 2" -m "Microsoft GS Wavetable Synth 0"

const link = require("@dmxjs/prolink-connect");
const os = require("os");
const midi = require("easymidi");
const NanoTimer = require("nanotimer");
const timer = new NanoTimer();
const program = require("commander");

program
    .name("djlink2midi")
    .version("1.0.3")
    .option("-i, --interface <iface>", "Network interface to use")
    .option("-m, --midi <midi>", "Midi interface to use")
    .option(
        "-r, --resolution <resolution>",
        "Midi clock resolution",
        parseInt,
        24
    )
    .option(
        "-c, --correction <percent>",
        "BPM correction in percent",
        parseFloat,
        0
    )
    .parse(process.argv);

if (!program.interface) {
    console.log("Please specify network interface with -i option from:");
    Object.keys(os.networkInterfaces()).forEach((iface) =>
        console.log("\t'" + iface + "'")
    );
    console.log();
}

if (!program.midi) {
    console.log("Please specify MIDI interface to with -m option from:");
    midi.getOutputs().forEach((iface) => console.log("\t'" + iface + "'"));
    console.log();
}

if (!program.midi || !program.interface) {
    process.exit(1);
}

async function main() {
    const clockOutput = new midi.Output(program.midi);

    const network = await link.bringOnline();

    network.deviceManager.on("connected", (device) => {
        console.log("New device on network:", device.name)
    });

    console.info("Auto configuring the network");
    await network.autoconfigFromPeers();

    console.info("Connecting to the network");
    network.connect();

    let currentBpm = 0;
    let currentIsPlaying = false;
    let currentBeatInMeasure = 1;
    let device1Status
    let device2Status

    const playingStates = [3, 4, 7, 9]

    console.log("Program started");
    console.log("Using network interface: " + program.interface);
    console.log("Using MIDI interface:    " + program.midi);
    console.log("Waiting for players to report tempo...");

    function updateTempo(bpm) {
        if (currentBpm) {
            timer.clearInterval();
        } else {
            console.log("Starting timer");
        }
        currentBpm = bpm;
        timer.setInterval(
            () => clockOutput.send("clock"),
            "",
            60 / (bpm + (program.correction / 100) * bpm) / program.resolution +
                "s"
        );
        console.log(
            "Setting bpm to: " +
                (program.correction !== 0
                    ? bpm + " + " + program.correction + "%"
                    : bpm)
        );
    }

    function updateIsPlaying(isPlaying) {
        const message = isPlaying ? "start" : "stop";
        currentIsPlaying = isPlaying;
        clockOutput.send(message);
        console.log("Sent " + message.toUpperCase() + " message");
    }

    network.statusEmitter.on("status", status => {
        const { isMaster, beatInMeasure } = status
        if (isMaster) {
            
            // BPM
            const bpm = (status.trackBPM * (100 + status.sliderPitch)) / 100
            if(currentBpm !== bpm) {
                updateTempo(bpm)
            }
            // Beat
            if (beatInMeasure === 1 && currentBeatInMeasure !== 1) {
                // console.log("Beat")
            }
            currentBeatInMeasure = beatInMeasure
        }
        if (status.deviceId == 1) {
            device1Status = status
        }
        if (status.deviceId == 2) {
            device2Status = status
        }
        const devices = [device1Status, device2Status]
        const isPlaying = devices.some(status => status != null && playingStates.includes(status.playState))
        if (currentIsPlaying !== isPlaying) {
            updateIsPlaying(isPlaying)
        }
    })
}

main();
