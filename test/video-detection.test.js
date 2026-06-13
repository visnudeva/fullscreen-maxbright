import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {shouldActivateVideoMode} from '../lib/video-detection.js';

describe('shouldActivateVideoMode', () => {
    it('activates for fullscreen video players', () => {
        assert.equal(shouldActivateVideoMode({
            isFullscreen: true,
            windowClass: 'vlc',
            windowTitle: 'Movie.mkv',
        }), true);

        assert.equal(shouldActivateVideoMode({
            isFullscreen: true,
            windowClass: 'mpv',
            windowTitle: 'clip.mp4',
        }), true);
    });

    it('activates for fullscreen windows with media titles', () => {
        assert.equal(shouldActivateVideoMode({
            isFullscreen: true,
            windowClass: 'SomeApp',
            windowTitle: 'YouTube - Mozilla Firefox',
        }), true);

        assert.equal(shouldActivateVideoMode({
            isFullscreen: true,
            windowClass: 'Totem',
            windowTitle: 'Playing media',
        }), true);
    });

    it('activates for fullscreen browser windows with video titles', () => {
        assert.equal(shouldActivateVideoMode({
            isFullscreen: true,
            windowClass: 'Firefox',
            windowTitle: 'Netflix',
        }), true);

        assert.equal(shouldActivateVideoMode({
            isFullscreen: true,
            windowClass: 'Google-chrome',
            windowTitle: 'Twitch - Streamer',
        }), true);

        assert.equal(shouldActivateVideoMode({
            isFullscreen: true,
            windowClass: 'Microsoft-edge',
            windowTitle: 'Netflix',
        }), true);
    });

    it('does not activate when not fullscreen', () => {
        assert.equal(shouldActivateVideoMode({
            isFullscreen: false,
            windowClass: 'vlc',
            windowTitle: 'Movie.mkv',
        }), false);

        assert.equal(shouldActivateVideoMode({
            isFullscreen: false,
            windowClass: 'Firefox',
            windowTitle: 'YouTube',
        }), false);
    });

    it('does not activate for unrelated fullscreen windows', () => {
        assert.equal(shouldActivateVideoMode({
            isFullscreen: true,
            windowClass: 'Gnome-terminal',
            windowTitle: 'bash',
        }), false);

        assert.equal(shouldActivateVideoMode({
            isFullscreen: true,
            windowClass: 'Nautilus',
            windowTitle: 'Documents',
        }), false);
    });

    it('activates for fullscreen known media apps even without video title', () => {
        assert.equal(shouldActivateVideoMode({
            isFullscreen: true,
            windowClass: 'Firefox',
            windowTitle: 'GitHub',
        }), true);
    });

    it('handles missing class and title', () => {
        assert.equal(shouldActivateVideoMode({
            isFullscreen: true,
            windowClass: '',
            windowTitle: '',
        }), false);
    });
});
