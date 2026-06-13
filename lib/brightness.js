export const VIDEO_BRIGHTNESS = 1.0;
export const BRIGHTNESS_EPSILON = 0.01;

export function shouldSkipBrightnessSet(currentBrightness, targetBrightness) {
    return Math.abs(currentBrightness - targetBrightness) < BRIGHTNESS_EPSILON;
}

export function resolveUserBrightness({lastKnownBrightness, savedBrightness, currentBrightness}) {
    if (lastKnownBrightness >= 0) {
        return lastKnownBrightness;
    }

    if (savedBrightness >= 0) {
        return savedBrightness;
    }

    return currentBrightness;
}

export function shouldSuppressUserBrightnessTracking({
    isVideoActive,
    settingBrightness,
    monotonicNow,
    postResumeGuardUntil,
}) {
    return isVideoActive
        || settingBrightness
        || monotonicNow < postResumeGuardUntil;
}
