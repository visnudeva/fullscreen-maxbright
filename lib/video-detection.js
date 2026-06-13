export const MEDIA_WINDOW_CLASSES = [
    'vlc', 'mpv', 'celluloid', 'totem', 'smplayer', 'gnome-mpv', 'parole',
    'dragon', 'kaffeine', 'xine', 'mplayer', 'audacious', 'clementine', 'rhythmbox',
    'stremio', 'jellyfin', 'jellyfin-media-player', 'plex', 'plexhometheater',
    'kodi', 'osmc', 'libreelec',
    'firefox', 'chrome', 'chromium', 'brave', 'zen', 'waterfox', 'librewolf', 'floorp',
];

export const VIDEO_TITLE_KEYWORDS = [
    'youtube', 'vimeo', 'netflix', 'prime video', 'disney', 'hulu', 'twitch',
    'video', 'media', 'vlc', 'mpv', 'watch', 'play', 'movie', 'film',
    'stremio', 'jellyfin', 'plex', 'kodi', 'emby', 'plexamp',
    'spotify', 'tidal', 'soundcloud', 'bandcamp',
];

export function shouldActivateVideoMode({isFullscreen, windowClass = '', windowTitle = ''}) {
    const cls = windowClass.toLowerCase();
    const title = windowTitle.toLowerCase();

    const isVideoPlayer = MEDIA_WINDOW_CLASSES.some(c => cls.includes(c));
    const isMediaTitle = VIDEO_TITLE_KEYWORDS.some(keyword => title.includes(keyword));

    return isFullscreen && (isVideoPlayer || isMediaTitle);
}
