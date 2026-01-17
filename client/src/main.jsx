import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { SoundProvider } from './contexts/SoundContext'

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <SoundProvider>
            <App />
        </SoundProvider>
    </StrictMode>,
)
