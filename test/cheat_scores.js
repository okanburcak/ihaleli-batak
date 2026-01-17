
// Using native

async function run() {
    // 1. Get state to find room
    const res = await fetch('http://localhost:3000/api/debug/room1');
    const room = await res.json();

    // Construct new scores
    const newScores = {};
    for (const pid of Object.keys(room.scores)) {
        newScores[pid] = 49;
    }

    await fetch('http://localhost:3000/api/debug/room1/set-scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores: newScores })
    });
    console.log("Scores set to 49.");
}
run();
