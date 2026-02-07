import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

const SoundContext = createContext();

export const useSound = () => useContext(SoundContext);

export const SoundProvider = ({ children }) => {
    const audioRefs = useRef({});
    const [isMuted, setIsMuted] = useState(false);

    const sounds = {
        click: '/sounds/click.ogg',
        play: '/sounds/play.ogg',
        turn: '/sounds/turn.ogg',
        win: '/sounds/win.ogg',
        hurry: '/sounds/hurry.mp4',
        hadi: '/sounds/hadi.ogg',
        shame: '/sounds/shame.mp4',
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

        let target = name;
        if (name === 'hurry') {
            // Randomly choose between hurry and hadi
            target = Math.random() < 0.5 ? 'hurry' : 'hadi';
        }

        const audio = audioRefs.current[target];
        if (audio) {
            audio.currentTime = 0; // Reset to start
            audio.play().catch(e => console.log("Audio play failed (interaction needed?):", e));
        }
    };

    const toggleMute = () => setIsMuted(prev => !prev);

    return (
        <SoundContext.Provider value={{ playSound, isMuted, toggleMute }}>
            {children}
        </SoundContext.Provider>
    );
};
