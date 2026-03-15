# Fullscreen MaxBright

A GNOME Shell extension that automatically sets your display brightness to maximum when watching fullscreen videos and restores your previous setting when exiting.

## Features

- **Automatic Detection**: Detects fullscreen video playback instantly
- **Max Brightness**: Sets brightness to 100% during video playback for optimal viewing
- **Seamless Restoration**: Restores your previous brightness when exiting fullscreen
- **Wide Compatibility**: Works with all major video players and streaming services
- **No Configuration Needed**: Works out of the box

### Supported Applications

- **Video Players**: VLC, MPV, Celluloid, Totem, SMPlayer, Rhythmbox, Clementine, Audacious
- **Browsers**: Firefox, Chrome, Chromium, Brave, Edge, Zen, Waterfox, LibreWolf, Floorp
- **Streaming Services**: YouTube, Netflix, Prime Video, Disney+, Hulu, Twitch
- **Media Centers**: Jellyfin, Plex, Kodi, Stremio, Emby, Plexamp
- **Music Services**: Spotify, Tidal, SoundCloud, Bandcamp

## Installation

### From GNOME Extensions (Recommended)

Once published, install directly from [extensions.gnome.org](https://extensions.gnome.org/).

### Manual Installation

```bash
# Copy to local extensions directory
cp -r fullscreen-maxbright@visnudeva.github.io ~/.local/share/gnome-shell/extensions/

# Enable the extension
gnome-extensions enable fullscreen-maxbright@visnudeva.github.io

# Restart GNOME Shell (Wayland: log out and back in, X11: Alt+F2, type 'r')
```

## How It Works

1. Monitors the active window for fullscreen video playback
2. Stores your current brightness when entering fullscreen video
3. Sets brightness to maximum (100%)
4. Restores your previous brightness when exiting fullscreen

## Configuration

The extension works out of the box with no configuration needed. Brightness is set to 100% by default.

## Troubleshooting

**Extension not working?**
- Ensure the extension is enabled: `gnome-extensions list --enabled`
- Check logs: `journalctl -f | grep -i "fullscreen"`
- Restart GNOME Shell after installation

**Brightness not restoring?**
- The extension only stores brightness if it was below 99% when entering fullscreen
- Manually adjust brightness before entering a video if issues persist

## Requirements

- GNOME Shell 45–49
- Software brightness control (standard on most laptops)

## License

GNU General Public License v2.0 or later. See the [LICENSE](LICENSE) file for details.

## Contributing

Issues and pull requests welcome at [GitHub](https://github.com/visnudeva/fullscreen-maxbright).
