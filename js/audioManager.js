class AudioManager {
    constructor() {
        this.sounds = {
            attack: new Audio('https://actions.google.com/sounds/v1/foley/whoosh_heavy.ogg'),
            heal: new Audio('https://actions.google.com/sounds/v1/bells/toll_cluster.ogg'),
            error: new Audio('https://actions.google.com/sounds/v1/ui/navigation_cancel.ogg'),
            draw: new Audio('https://actions.google.com/sounds/v1/water/wood_block_drop.ogg'),
            click: new Audio('https://actions.google.com/sounds/v1/ui/pop.ogg'),
            select: new Audio('https://actions.google.com/sounds/v1/foley/movement_whoosh.ogg'),
            shield: new Audio('https://actions.google.com/sounds/v1/science_fiction/metallic_clink.ogg'),
            joker: new Audio('https://actions.google.com/sounds/v1/cartoon/cartoon_boing.ogg'),
        };
    }
    play(name) {
        const sound = this.sounds[name];
        if (sound) {
            const clone = sound.cloneNode(true);
            const volMap = { click: 0.3, select: 0.4, error: 0.5 };
            clone.volume = volMap[name] ?? 0.5;
            clone.play().catch(err => {
                console.warn('Audio play blocked by browser policy:', err);
            });
        }
    }
}
export const audioManager = new AudioManager();
