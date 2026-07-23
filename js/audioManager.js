class AudioManager {
    constructor() {
        this.sounds = {
            attack: new Audio('https://actions.google.com/sounds/v1/foley/whoosh_heavy.ogg'),
            heal: new Audio('https://actions.google.com/sounds/v1/bells/toll_cluster.ogg'),
            error: new Audio('https://actions.google.com/sounds/v1/ui/navigation_cancel.ogg'),
            draw: new Audio('https://actions.google.com/sounds/v1/water/wood_block_drop.ogg'),
            click: new Audio('https://actions.google.com/sounds/v1/ui/pop.ogg'),
        };
    }
    play(name) {
        const sound = this.sounds[name];
        if (sound) {
            const clone = sound.cloneNode(true);
            clone.volume = (name === 'click') ? 0.3 : 0.5;
            clone.play().catch(err => {
                console.warn('Audio play blocked by browser policy:', err);
            });
        }
    }
}
export const audioManager = new AudioManager();
