import { io } from 'socket.io-client';

// Dev: localhost:3000, Prod: relative
const ALLOWED_ORIGIN = location.hostname === 'localhost' ? 'http://localhost:3000' : '/';

export const socket = io(ALLOWED_ORIGIN);
