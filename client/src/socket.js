import { io } from 'socket.io-client';

// URL determined by VITE_BACKEND_URL env variable
// Local: http://localhost:3000
// Prod: http://95.179.160.29:3000
const URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export const socket = io(URL);
