import { toast } from 'sonner';
import type { Track } from '@echo/shared';
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
  toast(`Downloading "${track.title}"`, { description: format === 'opus' ? 'Best quality .opus. It appears in your Downloads in a few seconds.' : '.m4a. It appears in your Downloads in a few seconds.' });
}
