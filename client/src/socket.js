import { io } from 'socket.io-client';

// Dev: localhost:3000, Prod: relative
const ALLOWED_ORIGIN = 'http://95.179.160.29:3000';

export const socket = io(ALLOWED_ORIGIN);
