import { toast } from 'sonner';
import type { Track } from '@resona/shared';
import { downloadUrl } from './api';
import { useSettings } from './settings';

/** Saves a song to the computer's Downloads folder in the format chosen in Settings. */
export function downloadTrack(track: Track) {
  const format = useSettings.getState().downloadFormat;
  const a = document.createElement('a');
  a.href = downloadUrl(track, format);
  a.download = '';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  const kind = format === 'mp3' ? 'MP3, 320 kbps' : format === 'opus' ? 'Original .opus' : 'Original .m4a';
  toast(`Downloading "${track.title}"`, { description: `${kind}. It appears in your Downloads in a few seconds.` });
}
