import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
    BRIGHTNESS_EPSILON,
    resolveUserBrightness,
    shouldSkipBrightnessSet,
    shouldSuppressUserBrightnessTracking,
    VIDEO_BRIGHTNESS,
} from '../lib/brightness.js';

describe('shouldSkipBrightnessSet', () => {
    it('skips when brightness is within epsilon', () => {
        assert.equal(shouldSkipBrightnessSet(0.5, 0.5), true);
        assert.equal(shouldSkipBrightnessSet(0.5, 0.5 + BRIGHTNESS_EPSILON / 2), true);
    });

    it('does not skip when brightness differs beyond epsilon', () => {
        assert.equal(shouldSkipBrightnessSet(0.5, 1.0), false);
        assert.equal(shouldSkipBrightnessSet(0.5, 0.5 + BRIGHTNESS_EPSILON * 2), false);
    });
});

describe('resolveUserBrightness', () => {
    it('prefers last known brightness', () => {
        assert.equal(resolveUserBrightness({
            lastKnownBrightness: 0.7,
            savedBrightness: 0.5,
            currentBrightness: 0.3,
        }), 0.7);
    });

    it('falls back to saved brightness', () => {
        assert.equal(resolveUserBrightness({
            lastKnownBrightness: -1,
            savedBrightness: 0.5,
            currentBrightness: 0.3,
        }), 0.5);
    });

    it('falls back to current brightness', () => {
        assert.equal(resolveUserBrightness({
            lastKnownBrightness: -1,
            savedBrightness: -1,
            currentBrightness: 0.3,
        }), 0.3);
    });
});

describe('shouldSuppressUserBrightnessTracking', () => {
    it('suppresses during video mode', () => {
        assert.equal(shouldSuppressUserBrightnessTracking({
            isVideoActive: true,
            settingBrightness: false,
            monotonicNow: 1000,
            postResumeGuardUntil: 0,
        }), true);
    });

    it('suppresses while setting brightness', () => {
        assert.equal(shouldSuppressUserBrightnessTracking({
            isVideoActive: false,
            settingBrightness: true,
            monotonicNow: 1000,
            postResumeGuardUntil: 0,
        }), true);
    });

    it('suppresses during post-resume guard window', () => {
        assert.equal(shouldSuppressUserBrightnessTracking({
            isVideoActive: false,
            settingBrightness: false,
            monotonicNow: 1000,
            postResumeGuardUntil: 2000,
        }), true);
    });

    it('allows tracking when idle', () => {
        assert.equal(shouldSuppressUserBrightnessTracking({
            isVideoActive: false,
            settingBrightness: false,
            monotonicNow: 3000,
            postResumeGuardUntil: 2000,
        }), false);
    });
});

describe('constants', () => {
    it('uses full brightness for video mode', () => {
        assert.equal(VIDEO_BRIGHTNESS, 1.0);
    });
});
