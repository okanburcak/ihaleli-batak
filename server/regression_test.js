// Native fetch in Node 18+

const BASE_URL = 'http://localhost:3000';

async function runTest() {
    try {
        console.log("1. Creating Room...");
        const createRes = await fetch(`${BASE_URL}/api/rooms`, { method: 'POST' });
        const createData = await createRes.json();
        const roomId = createData.roomId;
        console.log("   Room Created: " + roomId);

        console.log("2. Checking Room List (Lobby)...");
        const listRes = await fetch(`${BASE_URL}/api/rooms`);
        const listData = await listRes.json();
        const roomInList = listData.find(r => r.id === roomId);
        if (!roomInList) throw new Error("Room not found in list!");
        console.log("   Room found in list.");

        console.log("3. Joining Seat 0 (Admin)...");
        const joinRes = await fetch(`${BASE_URL}/api/rooms/${roomId}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'RegTester', seatIndex: 0 })
        });
        const joinData = await joinRes.json();
        if (!joinData.success) throw new Error("Join failed: " + joinData.message);
        console.log("   Joined successfully. Token: " + joinData.token);

        console.log("4. Verifying State...");
        const stateRes = await fetch(`${BASE_URL}/api/rooms/${roomId}/state`, {
            headers: { 'x-player-id': joinData.token }
        });
        const stateData = await stateRes.json();
        if (stateData.me.seatIndex !== 0) throw new Error("Wrong seat index!");
        if (stateData.me.isAdmin !== true) throw new Error("Not admin!");
        console.log("   State verified correctly.");

        console.log("SUCCESS: Regression Test Passed.");
    } catch (e) {
        console.error("FAILURE: " + e.message);
        process.exit(1);
    }
}

runTest();
