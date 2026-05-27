import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const MEDIA_WINDOW_CLASSES = [
    // Desktop video players
    'vlc', 'mpv', 'celluloid', 'totem', 'smplayer', 'gnome-mpv', 'parole',
    'dragon', 'kaffeine', 'xine', 'mplayer', 'audacious', 'clementine', 'rhythmbox',
    // Streaming apps
    'stremio', 'jellyfin', 'jellyfin-media-player', 'plex', 'plexhometheater',
    'kodi', 'osmc', 'libreelec',
    // Browsers
    'firefox', 'chrome', 'chromium', 'brave', 'zen', 'waterfox', 'librewolf', 'floorp',
];

const VIDEO_TITLE_KEYWORDS = [
    'youtube', 'vimeo', 'netflix', 'prime video', 'disney', 'hulu', 'twitch',
    'video', 'media', 'vlc', 'mpv', 'watch', 'play', 'movie', 'film',
    'stremio', 'jellyfin', 'plex', 'kodi', 'emby', 'plexamp',
    'spotify', 'tidal', 'soundcloud', 'bandcamp',
];

const BROWSER_VIDEO_SERVICES = ['youtube', 'vimeo', 'netflix', 'twitch', 'prime', 'disney', 'hulu'];

const BROWSER_CLASSES = ['firefox', 'chrome', 'chromium', 'brave', 'edge'];

const VIDEO_BRIGHTNESS = 1.0;
const SETTLE_DELAY_MS = 1000;
const MONITOR_INTERVAL_SEC = 1;
const BRIGHTNESS_EPSILON = 0.01;

export default class VideoBrightnessExtension extends Extension {
    _brightnessProxy = null;
    _isVideoActive = false;
    _lastKnownBrightness = -1;
    _timeoutId = null;
    _monitorTimeoutId = null;
    _windowFocusId = null;
    _workspaceId = null;
    _brightnessChangedId = null;
    _sleepSignalId = null;
    _brightnessBeforeSleep = -1;

    enable() {
        // Remove any existing timeout before creating a new one
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }
        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SETTLE_DELAY_MS, () => {
            this._initialize();
            this._timeoutId = null;
            return GLib.SOURCE_REMOVE;
        });
    }

    disable() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }

        this._stopMonitoring();
        this._disconnectBrightnessMonitor();
        this._disconnectSleepMonitor();
        this._restoreBrightness();

        this._brightnessProxy = null;
        this._isVideoActive = false;
        this._lastKnownBrightness = -1;
    }

    _initialize() {
        const brightnessManager = Main.brightnessManager;
        if (!brightnessManager?.globalScale) {
            return;
        }

        this._brightnessProxy = brightnessManager.globalScale;
        this._lastKnownBrightness = this._getBrightness();
        this._startMonitoring();
        this._checkFullscreenVideo();
        this._connectBrightnessMonitor();
        this._connectSleepMonitor();
    }

    _connectSleepMonitor() {
        this._sleepSignalId = Gio.DBus.system.signal_subscribe(
            'org.freedesktop.login1',
            'org.freedesktop.login1.Manager',
            'PrepareForSleep',
            '/org/freedesktop/login1',
            null,
            Gio.DBusSignalFlags.NONE,
            (_connection, _sender, _path, _iface, _signal, params) => {
                const [sleeping] = params.deepUnpack();
                if (sleeping) {
                    this._onPrepareForSleep();
                } else {
                    this._onResumeFromSleep();
                }
            }
        );
    }

    _disconnectSleepMonitor() {
        if (this._sleepSignalId !== null) {
            Gio.DBus.system.signal_unsubscribe(this._sleepSignalId);
            this._sleepSignalId = null;
        }
    }

    _onPrepareForSleep() {
        // Snapshot the user's brightness before the system can reset it on wake
        this._brightnessBeforeSleep = this._isVideoActive
            ? this._lastKnownBrightness
            : this._getBrightness();
    }

    _onResumeFromSleep() {
        // Hardware and compositor need a moment to settle after resume
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, SETTLE_DELAY_MS, () => {
            if (this._brightnessBeforeSleep >= 0) {
                // Temporarily suppress _onBrightnessChanged so the hardware-reset
                // value doesn't overwrite the snapshot we took before sleep.
                const snapshot = this._brightnessBeforeSleep;
                this._brightnessBeforeSleep = -1;

                if (!this._isVideoActive) {
                    this._lastKnownBrightness = snapshot;
                    this._setBrightness(snapshot);
                }
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _connectBrightnessMonitor() {
        this._brightnessChangedId = this._brightnessProxy.connect('notify::value', () => {
            this._onBrightnessChanged();
        });
    }

    _disconnectBrightnessMonitor() {
        if (this._brightnessChangedId && this._brightnessProxy) {
            this._brightnessProxy.disconnect(this._brightnessChangedId);
            this._brightnessChangedId = null;
        }
    }

    _onBrightnessChanged() {
        if (!this._isVideoActive) {
            const currentBrightness = this._getBrightness();
            if (currentBrightness >= 0) {
                this._lastKnownBrightness = currentBrightness;
            }
        }
    }

    _startMonitoring() {
        this._windowFocusId = global.display.connect('notify::focus-window', () => {
            this._checkFullscreenVideo();
        });

        this._workspaceId = global.workspace_manager.connect('active-workspace-changed', () => {
            this._checkFullscreenVideo();
        });

        this._monitorTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, MONITOR_INTERVAL_SEC, () => {
            this._checkFullscreenVideo();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopMonitoring() {
        if (this._windowFocusId) {
            global.display.disconnect(this._windowFocusId);
            this._windowFocusId = null;
        }

        if (this._workspaceId) {
            global.workspace_manager.disconnect(this._workspaceId);
            this._workspaceId = null;
        }

        if (this._monitorTimeoutId) {
            GLib.source_remove(this._monitorTimeoutId);
            this._monitorTimeoutId = null;
        }
    }

    _checkFullscreenVideo() {
        if (!this._brightnessProxy) {
            return;
        }

        const focusWindow = global.display.focus_window;
        if (!focusWindow) {
            this._exitVideoMode();
            return;
        }

        const isFullscreen = focusWindow.is_fullscreen();
        const windowClass = focusWindow.get_wm_class()?.toLowerCase() ?? '';
        const windowTitle = focusWindow.get_title()?.toLowerCase() ?? '';

        const isVideoPlayer = MEDIA_WINDOW_CLASSES.some(cls => windowClass.includes(cls));
        const isMediaTitle = VIDEO_TITLE_KEYWORDS.some(keyword => windowTitle.includes(keyword));
        const isBrowserVideo = BROWSER_CLASSES.some(browser => windowClass.includes(browser))
            && BROWSER_VIDEO_SERVICES.some(service => windowTitle.includes(service));

        const shouldActivateVideo = isFullscreen && (isVideoPlayer || isMediaTitle || isBrowserVideo);

        if (shouldActivateVideo && !this._isVideoActive) {
            this._enterVideoMode();
        } else if (!shouldActivateVideo && this._isVideoActive) {
            this._exitVideoMode();
        }
    }

    _enterVideoMode() {
        const currentBrightness = this._getBrightness();
        if (currentBrightness >= 0) {
            this._lastKnownBrightness = currentBrightness;
        }
        this._isVideoActive = true;
        this._setBrightness(VIDEO_BRIGHTNESS);
    }

    _exitVideoMode() {
        this._isVideoActive = false;
        this._restoreBrightness();
    }

    _restoreBrightness() {
        if (this._lastKnownBrightness >= 0) {
            this._setBrightness(this._lastKnownBrightness);
        }
    }

    _getBrightness() {
        return this._brightnessProxy?.value ?? -1;
    }

    _setBrightness(targetFloat) {
        if (!this._brightnessProxy) {
            return;
        }

        const currentBrightness = this._getBrightness();
        if (Math.abs(currentBrightness - targetFloat) < BRIGHTNESS_EPSILON) {
            return;
        }

        this._brightnessProxy.value = targetFloat;
    }
}
