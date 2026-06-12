import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {
    resolveUserBrightness,
    shouldSkipBrightnessSet,
    shouldSuppressUserBrightnessTracking,
    VIDEO_BRIGHTNESS,
} from './lib/brightness.js';
import {shouldActivateVideoMode} from './lib/video-detection.js';

const SETTINGS_SCHEMA_ID = 'org.gnome.shell.extensions.fullscreen-maxbright';
const SETTINGS_SCHEMA_PATH = '/org/gnome/shell/extensions/fullscreen-maxbright/';

const SETTLE_DELAY_MS = 1000;
const POST_RESUME_GUARD_MS = 5000;
const RESUME_RESTORE_DELAYS_MS = [0, 1000, 2500, 4500];
const MONITOR_INTERVAL_SEC = 1;

export default class VideoBrightnessExtension extends Extension {
    _brightnessProxy = null;
    _settings = null;
    _isVideoActive = false;
    _lastKnownBrightness = -1;
    _timeoutId = null;
    _monitorTimeoutId = null;
    _windowFocusId = null;
    _workspaceId = null;
    _brightnessChangedId = null;
    _sleepSignalId = null;
    _brightnessBeforeSleep = -1;
    _resumeRestoreTimeouts = [];
    _postResumeGuardUntil = 0;
    _settingBrightness = false;

    enable() {
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

        this._clearResumeRestoreTimeouts();

        this._stopMonitoring();
        this._disconnectBrightnessMonitor();
        this._disconnectSleepMonitor();
        this._restoreBrightness();

        this._brightnessProxy = null;
        this._settings = null;
        this._isVideoActive = false;
        this._lastKnownBrightness = -1;
        this._postResumeGuardUntil = 0;
        this._settingBrightness = false;
    }

    _clearResumeRestoreTimeouts() {
        for (const id of this._resumeRestoreTimeouts) {
            GLib.source_remove(id);
        }
        this._resumeRestoreTimeouts = [];
    }

    _suppressUserBrightnessTracking() {
        return shouldSuppressUserBrightnessTracking({
            isVideoActive: this._isVideoActive,
            settingBrightness: this._settingBrightness,
            monotonicNow: GLib.get_monotonic_time(),
            postResumeGuardUntil: this._postResumeGuardUntil,
        });
    }

    _loadSettings() {
        try {
            const schemaDir = this.dir.get_child('schemas')?.get_path();
            if (!schemaDir)
                return null;

            const source = Gio.SettingsSchemaSource.new_from_directory(
                schemaDir,
                Gio.SettingsSchemaSource.get_default(),
                false
            );
            const schema = source.lookup(SETTINGS_SCHEMA_ID, false);
            if (!schema)
                return null;

            return new Gio.Settings({
                settings_schema: schema,
                path: SETTINGS_SCHEMA_PATH,
            });
        } catch (err) {
            console.error('[Fullscreen MaxBright] settings unavailable:', err);
            return null;
        }
    }

    _initialize() {
        const brightnessManager = Main.brightnessManager;
        if (!brightnessManager?.globalScale) {
            return;
        }

        this._settings = this._loadSettings();
        this._brightnessProxy = brightnessManager.globalScale;

        const savedBrightness = this._settings?.get_double('saved-brightness') ?? -1;
        if (savedBrightness >= 0) {
            this._lastKnownBrightness = savedBrightness;
            this._scheduleBrightnessRestore(savedBrightness);
        } else {
            const currentBrightness = this._getBrightness();
            if (currentBrightness >= 0) {
                this._lastKnownBrightness = currentBrightness;
            }
        }

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

    _resolveUserBrightness() {
        return resolveUserBrightness({
            lastKnownBrightness: this._lastKnownBrightness,
            savedBrightness: this._settings?.get_double('saved-brightness') ?? -1,
            currentBrightness: this._getBrightness(),
        });
    }

    _onPrepareForSleep() {
        const snapshot = this._resolveUserBrightness();
        this._brightnessBeforeSleep = snapshot;
        if (snapshot >= 0) {
            this._persistBrightness(snapshot);
        }
    }

    _onResumeFromSleep() {
        let snapshot = this._brightnessBeforeSleep;
        this._brightnessBeforeSleep = -1;

        if (snapshot < 0) {
            snapshot = this._resolveUserBrightness();
        }

        if (snapshot < 0) {
            return;
        }

        if (!this._isVideoActive) {
            this._lastKnownBrightness = snapshot;
            this._persistBrightness(snapshot);
        }

        this._scheduleBrightnessRestore(snapshot);
    }

    _scheduleBrightnessRestore(targetBrightness) {
        this._clearResumeRestoreTimeouts();

        if (targetBrightness < 0) {
            return;
        }

        this._postResumeGuardUntil = GLib.get_monotonic_time()
            + POST_RESUME_GUARD_MS * 1000;

        for (const delayMs of RESUME_RESTORE_DELAYS_MS) {
            const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delayMs, () => {
                const index = this._resumeRestoreTimeouts.indexOf(timeoutId);
                if (index >= 0) {
                    this._resumeRestoreTimeouts.splice(index, 1);
                }

                if (!this._isVideoActive) {
                    this._lastKnownBrightness = targetBrightness;
                    this._setBrightness(targetBrightness);
                }

                return GLib.SOURCE_REMOVE;
            });
            this._resumeRestoreTimeouts.push(timeoutId);
        }
    }

    _persistBrightness(value) {
        if (value < 0 || !this._settings) {
            return;
        }

        this._settings.set_double('saved-brightness', value);
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
        if (this._suppressUserBrightnessTracking()) {
            return;
        }

        const currentBrightness = this._getBrightness();
        if (currentBrightness >= 0) {
            this._lastKnownBrightness = currentBrightness;
            this._persistBrightness(currentBrightness);
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

        const shouldActivate = shouldActivateVideoMode({
            isFullscreen: focusWindow.is_fullscreen(),
            windowClass: focusWindow.get_wm_class() ?? '',
            windowTitle: focusWindow.get_title() ?? '',
        });

        if (shouldActivate && !this._isVideoActive) {
            this._enterVideoMode();
        } else if (!shouldActivate && this._isVideoActive) {
            this._exitVideoMode();
        }
    }

    _enterVideoMode() {
        this._clearResumeRestoreTimeouts();

        const currentBrightness = this._getBrightness();
        if (currentBrightness >= 0) {
            this._lastKnownBrightness = currentBrightness;
            this._persistBrightness(currentBrightness);
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
        if (shouldSkipBrightnessSet(currentBrightness, targetFloat)) {
            return;
        }

        this._settingBrightness = true;
        this._brightnessProxy.value = targetFloat;
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._settingBrightness = false;
            return GLib.SOURCE_REMOVE;
        });
    }
}
