import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

const SIGNALING_SERVER_URL = 'http://localhost:3000'; // Adjust if deployed

const VoiceChat = ({ roomId, myPlayerId }) => {
    const [peers, setPeers] = useState([]); // [{ userId, stream }]
    const [isMuted, setIsMuted] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const socketRef = useRef();
    const localStreamRef = useRef();
    const peersRef = useRef({}); // { userId: { connection, stream } }
    const myPlayerIdRef = useRef(myPlayerId);

    useEffect(() => {
        myPlayerIdRef.current = myPlayerId;
    }, [myPlayerId]);

    useEffect(() => {
        const init = async () => {
            // 1. Get Local Stream
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                localStreamRef.current = stream;
            } catch (err) {
                console.error("Failed to get local stream", err);
                return;
            }

            // 2. Connect Socket
            socketRef.current = io(SIGNALING_SERVER_URL);

            socketRef.current.on('connect', () => {
                console.log("Socket connected for Voice Chat");
                setIsConnected(true);
                socketRef.current.emit('join-room', roomId, myPlayerId);
            });

            // 3. Handle Signaling
            socketRef.current.on('user-connected', (userId) => {
                console.log("User connected:", userId);
                if (userId === myPlayerId) return;
                // Initiate call
                createPeer(userId, socketRef.current, localStreamRef.current);
            });

            socketRef.current.on('signal', async (data) => {
                // data: { to, from, signal, roomId }
                if (data.to !== myPlayerId) return;

                const { from, signal } = data;
                const peer = peersRef.current[from];

                if (peer) {
                    // Existing peer, handle signal
                    try {
                        if (signal.type === 'offer') {
                            await peer.connection.setRemoteDescription(new RTCSessionDescription(signal));
                            const answer = await peer.connection.createAnswer();
                            await peer.connection.setLocalDescription(answer);
                            socketRef.current.emit('signal', {
                                roomId,
                                to: from,
                                from: myPlayerId,
                                signal: peer.connection.localDescription
                            });
                        } else if (signal.type === 'answer') {
                            await peer.connection.setRemoteDescription(new RTCSessionDescription(signal));
                        } else if (signal.candidate) {
                            await peer.connection.addIceCandidate(new RTCIceCandidate(signal));
                        }
                    } catch (e) {
                        console.error("Error handling signal", e);
                    }
                } else {
                    // Incoming call (we didn't initiate, but received an offer)
                    // Wait, if we receive an offer, we should create a peer to handle it if it doesn't exist
                    // usually 'user-connected' triggers the initiator. 
                    // If we are the receiver, we might get an offer before we know they connected if the event order is loose,
                    // but usually 'signal' implies we need a peer.
                    // However, in this simple mesh, let's assume 'user-connected' fires for existing users? 
                    // Socket.io 'join-room' only notifies *others* already in room.
                    // So if I join later, I don't get 'user-connected' for them. They get it for me.
                    // So THEY initiate connections to ME.

                    // So if I receive an offer from someone I don't know, I should accept it.
                    if (signal.type === 'offer') {
                        const newPeer = addPeer(from, socketRef.current, localStreamRef.current, false); // false = not initiator (conceptually, though WebRTC requires handling)
                        // Actually addPeer logic below handles initialization. 
                        // But here we need to specifically handle the offer.

                        // Let's refactor:
                        // 1. If we join, we don't know who is there. 
                        //    Standard pattern: "I am new, hello everyone". 
                        //    Existing users see "New user", they call me.
                        //    So I wait for offers.

                        // 2. What if I am the first one? No one calls me.

                        // 3. What if I am the second one? The first one sees me, calls me.

                        // So the initiator is always the ALREADY PRESENT user.
                        // But wait, `socket.broadast.to(room)` only sends to others.
                        // So the new user receives nothing.
                        // The existing users receive "user-connected".
                        // So existing users initiate calls to the new user.

                        // So:
                        // A (in room)
                        // B joins.
                        // A receives 'user-connected' (B). A creates Peer(B) and sends Offer to B.
                        // B receives 'signal' (Offer) from A. B creates Peer(A), sets Remote, sends Answer.

                        await newPeer.connection.setRemoteDescription(new RTCSessionDescription(signal));
                        const answer = await newPeer.connection.createAnswer();
                        await newPeer.connection.setLocalDescription(answer);
                        socketRef.current.emit('signal', {
                            roomId,
                            to: from,
                            from: myPlayerId,
                            signal: newPeer.connection.localDescription
                        });
                    }
                }
            });

            socketRef.current.on('user-disconnected', (userId) => {
                if (peersRef.current[userId]) {
                    peersRef.current[userId].connection.close();
                    delete peersRef.current[userId];
                    setPeers(prev => prev.filter(p => p.userId !== userId));
                }
            });
        };

        init();

        return () => {
            if (socketRef.current) socketRef.current.disconnect();
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => track.stop());
            }
            Object.values(peersRef.current).forEach(p => p.connection.close());
        };
    }, [roomId, myPlayerId]);

    const addPeer = (userId, socket, stream, initiator) => {
        const connection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478' }
            ]
        });

        // Add local tracks
        stream.getTracks().forEach(track => connection.addTrack(track, stream));

        // Handle ICE candidates
        connection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('signal', {
                    roomId,
                    to: userId,
                    from: myPlayerId,
                    signal: event.candidate
                });
            }
        };

        // Handle incoming stream
        connection.ontrack = (event) => {
            console.log("Received remote stream from", userId);
            setPeers(prev => {
                if (prev.find(p => p.userId === userId)) return prev;
                return [...prev, { userId, stream: event.streams[0] }];
            });
        };

        peersRef.current[userId] = { connection };
        return { connection };
    };

    const createPeer = async (userId, socket, stream) => {
        const { connection } = addPeer(userId, socket, stream, true);
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        socket.emit('signal', {
            roomId,
            to: userId,
            from: myPlayerId,
            signal: connection.localDescription
        });
    };

    const toggleMute = () => {
        if (localStreamRef.current) {
            const audioTrack = localStreamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsMuted(!audioTrack.enabled);
            }
        }
    };

    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2 pointer-events-none">
            {/* Controls */}
            <div className="bg-stone-800/90 p-2 rounded-lg pointer-events-auto flex items-center gap-2 border border-stone-600">
                <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} title={isConnected ? "Connected" : "Disconnected"}></div>
                <button
                    onClick={toggleMute}
                    className={`p-2 rounded-full ${isMuted ? 'bg-red-600 text-white' : 'bg-gray-600 text-white'} hover:opacity-80 transition`}
                >
                    {isMuted ? '🔇' : '🎙️'}
                </button>
            </div>

            {/* Audio Elements (Hidden) */}
            <div>
                {peers.map(peer => (
                    <AudioPlayer key={peer.userId} stream={peer.stream} />
                ))}
            </div>
        </div>
    );
};

const AudioPlayer = ({ stream }) => {
    const audioRef = useRef();

    useEffect(() => {
        if (audioRef.current && stream) {
            audioRef.current.srcObject = stream;
        }
    }, [stream]);

    return <audio ref={audioRef} autoPlay playsInline controls={false} />;
};

export default VoiceChat;
