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

        console.log("   State verified correctly.");

        console.log("5. Testing Admin Dashboard API...");
        const adminRes = await fetch(`${BASE_URL}/api/admin/rooms`);
        const adminData = await adminRes.json();
        const adminRoom = adminData.find(r => r.id === roomId);
        if (!adminRoom) throw new Error("Room not found in Admin API!");
        if (adminRoom.players.length !== 1) throw new Error("Wrong player count in Admin API!");
        console.log("   Admin API verified.");

        console.log("   Admin API verified.");

        console.log("6. Joining Player 2...");
        // No need to fetch code anymore
        const joinP2Res = await fetch(`${BASE_URL}/api/rooms/${roomId}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Player2', seatIndex: 1 })
        });
        const joinP2Data = await joinP2Res.json();
        if (!joinP2Data.success) throw new Error("Player 2 failed to join: " + joinP2Data.message);
        console.log("   Player 2 joined successfully.");

        console.log("   Player 2 joined successfully.");

        console.log("7. Starting Game...");
        // Admin is in seat 0, token is joinData.token
        const startRes = await fetch(`${BASE_URL}/api/rooms/${roomId}/start`, {
            method: 'POST',
            headers: { 'x-player-id': joinData.token }
        });
        const startData = await startRes.json();
        if (!startData.success) throw new Error("Failed to start game: " + (startData.error || 'Unknown error'));

        const gameStateRes = await fetch(`${BASE_URL}/api/rooms/${roomId}/state`, {
            headers: { 'x-player-id': joinData.token }
        });
        const gameState = await gameStateRes.json();
        if (gameState.state !== 'BIDDING') throw new Error("Game did not switch to BIDDING state! State is: " + gameState.state);
        console.log("   Game started. State is BIDDING.");

        console.log("   Game started. State is BIDDING.");

        console.log("8. Player 2 Leaves...");
        const leaveRes = await fetch(`${BASE_URL}/api/rooms/${roomId}/leave`, {
            method: 'POST',
            headers: { 'x-player-id': joinP2Data.token }
        });
        const leaveData = await leaveRes.json();
        if (!leaveData.success) throw new Error("Failed to leave: " + leaveData.message);

        // Check state to ensure seat is empty
        const postLeaveStateRes = await fetch(`${BASE_URL}/api/rooms/${roomId}/state`, {
            headers: { 'x-player-id': joinData.token } // Admin checks
        });
        const postLeaveState = await postLeaveStateRes.json();
        // Seat 1 should be null or empty
        if (postLeaveState.players[1]) throw new Error("Seat 1 should be empty after leave, but found: " + JSON.stringify(postLeaveState.players[1]));
        console.log("   Player 2 left. Seat 1 is empty.");

        console.log("SUCCESS: Regression Test Passed.");
    } catch (e) {
        console.error("FAILURE: " + e.message);
        process.exit(1);
    }
}

runTest();
