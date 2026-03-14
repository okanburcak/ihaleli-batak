import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

const SoundContext = createContext();

export const useSound = () => useContext(SoundContext);

export const SoundProvider = ({ children }) => {
    const audioRefs = useRef({});
    const [isMuted, setIsMuted] = useState(() => localStorage.getItem('batak_muted') === 'true');

    const sounds = {
        click: 'https://assets.okanburcak.com/sounds/click.ogg',
        play: 'https://assets.okanburcak.com/sounds/play.ogg',
        turn: 'https://assets.okanburcak.com/sounds/turn.ogg',
        win: 'https://assets.okanburcak.com/sounds/win.ogg',
        hurry: 'https://assets.okanburcak.com/sounds/hurry.mp4',
        hadi: 'https://assets.okanburcak.com/sounds/hadi.ogg',
        shame: 'https://assets.okanburcak.com/sounds/shame.mp4',
    };

    useEffect(() => {
        // Preload sounds
        Object.entries(sounds).forEach(([key, src]) => {
            const audio = new Audio(src);
            audio.volume = 0.5;
            audioRefs.current[key] = audio;
        });
    }, []);

    const playSound = (name) => {
        if (isMuted) return;

        const audio = audioRefs.current[name];
        if (audio) {
            audio.currentTime = 0; // Reset to start
            audio.play().catch(e => console.log("Audio play failed (interaction needed?):", e));
        }
    };

    const toggleMute = () => setIsMuted(prev => {
        localStorage.setItem('batak_muted', !prev);
        return !prev;
    });

    return (
        <SoundContext.Provider value={{ playSound, isMuted, toggleMute }}>
            {children}
        </SoundContext.Provider>
    );
};
