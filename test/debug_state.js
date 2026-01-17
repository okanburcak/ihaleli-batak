
// Using native
const ARG = process.argv[2];

async function run() {
    try {
        // Need a token to see private state? Or just use public state?
        // Public state shows `currentTurn` and trick.
        const res = await fetch('http://localhost:3000/api/debug/room1');
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(e);
    }
}
run();
