import { useState } from 'react';
import {
  AudioWaveform, Heart, ListMusic, SlidersVertical, MicVocal, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume1, Volume2, VolumeX,
} from 'lucide-react';
import { toast } from 'sonner';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toggleLike, useIsLiked } from '@/lib/db';
import { DownloadMenu, DownloadStateIcon } from './DownloadMenu';
import { useNowSource } from '@/player/source';
import { useEq } from '@/player/equalizer';
import { openListenTogether } from './ListenTogether';
import { useLt } from '@/lib/listenTogether';
import { audio, formatTime, seek, useDuration, useTime } from '@/player/audio';
import { useCurrentTrack, usePlayer, useUi } from '@/player/store';
import { cn } from '@/lib/utils';
import { Artwork } from './Artwork';
import { PlayPauseButton } from './PlayPauseButton';
import { CastDeviceIcon } from './CastDialogs';
import { castBridge, openCast, useCast } from '@/lib/cast';
import { ArtistLinks } from './TrackList';

function IconButton({ label, active, className, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={label}
          aria-pressed={active}
          className={cn('grid size-9 place-items-center rounded-full text-text-muted hover:bg-accent hover:text-text disabled:opacity-35 disabled:hover:bg-transparent', active && 'text-seed-soft hover:text-seed-soft', className)}
          {...rest}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function Progress() {
  const time = useTime();
  const duration = useDuration();
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? time;
  return (
    <div className="flex w-full items-center gap-3 text-xs tabular-nums text-text-faint">
      <span className="w-10 text-right">{formatTime(shown)}</span>
      <Slider
        aria-label="Seek"
        value={[duration ? shown : 0]}
        max={duration || 1}
        step={0.5}
        disabled={!duration}
        onValueChange={([v]) => setDrag(v)}
        onValueCommit={([v]) => { seek(v); setDrag(null); }}
        className="flex-1 py-2"
      />
      <span className="w-10">{formatTime(duration)}</span>
    </div>
  );
}

export function PlayerBar() {
  const track = useCurrentTrack();
  const s = usePlayer();
  const { panel, togglePanel, setNowPlaying } = useUi();
  const inJam = useLt((s) => !!s.session);
  const sourceLabel = useNowSource((s) => s.label);
  const eqOn = useEq((s) => s.enabled || s.boost !== 1);
  const liked = useIsLiked(track?.id);
  const VolumeIcon = s.muted || s.volume === 0 ? VolumeX : s.volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="glass relative z-50 mx-3 mb-3 grid h-[84px] grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-4 rounded-[28px] px-3">
      {/* Track */}
      <div className="flex min-w-0 items-center gap-3">
        {track ? (
          <>
            <button onClick={() => setNowPlaying(true)} className="group relative shrink-0" aria-label="Open now playing">
              <Artwork src={track.thumbnail} className="size-14 rounded-2xl" />
              <span className="absolute inset-0 rounded-2xl bg-black/0 group-hover:bg-black/30" />
            </button>
            <div className="min-w-0">
              <button onClick={() => setNowPlaying(true)} className="block max-w-full truncate text-left text-[15px] font-semibold hover:underline">{track.title}</button>
              <ArtistLinks track={track} className="block text-sm text-text-muted" />
              {sourceLabel && sourceLabel !== 'Downloaded' && <span className="mt-0.5 inline-block rounded-md bg-seed/20 px-1.5 text-[10px] font-bold tracking-wide text-seed-soft">{sourceLabel}</span>}
            </div>
            <IconButton
              label={liked ? 'Remove from Liked songs' : 'Add to Liked songs'}
              active={liked}
              onClick={() => toggleLike(track).then((l) => toast(l ? 'Added to Liked songs' : 'Removed from Liked songs'))}
              className="shrink-0"
            >
              <Heart className={cn('size-[18px]', liked && 'fill-seed text-seed')} />
            </IconButton>
          </>
        ) : (
          <p className="px-2 text-sm text-text-faint">Pick something to play</p>
        )}
      </div>

      {/* Transport */}
      <div className="flex flex-col items-center gap-0.5">
        <div className="flex items-center gap-2">
          <IconButton label={s.shuffle ? 'Shuffle on' : 'Shuffle off'} active={s.shuffle} onClick={s.toggleShuffle} disabled={!track}>
            <Shuffle className="size-[18px]" />
          </IconButton>
          <IconButton label="Previous" onClick={() => s.prev(audio.currentTime)} disabled={!track}>
            <SkipBack className="size-5 fill-current" />
          </IconButton>
          <PlayPauseButton playing={s.playing} disabled={!track} onClick={s.togglePlay} size={46} className="mx-1" />
          <IconButton label="Next" onClick={() => s.next()} disabled={!track}>
            <SkipForward className="size-5 fill-current" />
          </IconButton>
          <IconButton
            label={s.repeat === 'off' ? 'Repeat off' : s.repeat === 'all' ? 'Repeat all' : 'Repeat one'}
            active={s.repeat !== 'off'}
            onClick={s.cycleRepeat}
          >
            {s.repeat === 'one' ? <Repeat1 className="size-[18px]" /> : <Repeat className="size-[18px]" />}
          </IconButton>
        </div>
        <Progress />
      </div>

      {/* Extras */}
      <div className="flex items-center justify-end gap-1">
        {track && (
          <DownloadMenu track={track}>
            <button aria-label="Download" className="grid size-9 place-items-center rounded-full text-text-muted hover:bg-accent hover:text-text data-[state=open]:bg-accent data-[state=open]:text-text">
              <DownloadStateIcon track={track} className="size-[18px]" />
            </button>
          </DownloadMenu>
        )}
        <IconButton label="Equalizer" active={eqOn} onClick={() => useEq.getState().set({ open: true })}>
          <SlidersVertical className="size-[18px]" />
        </IconButton>
        <IconButton label="Listen Together" active={inJam} onClick={() => (inJam ? togglePanel('jam') : openListenTogether())}>
          <AudioWaveform className="size-[18px]" />
        </IconButton>
        <CastButton />
        <IconButton label="Lyrics" active={panel === 'lyrics'} onClick={() => togglePanel('lyrics')}>
          <MicVocal className="size-[18px]" />
        </IconButton>
        <IconButton label="Queue" active={panel === 'queue'} onClick={() => togglePanel('queue')}>
          <ListMusic className="size-[18px]" />
        </IconButton>
        <IconButton label={s.muted ? 'Unmute' : 'Mute'} onClick={s.toggleMute}>
          <VolumeIcon className="size-[18px]" />
        </IconButton>
        <Slider aria-label="Volume" value={[s.muted ? 0 : s.volume]} max={1} step={0.01} onValueChange={([v]) => s.setVolume(v)} className="w-24 py-2 xl:w-28" />
      </div>
    </div>
  );
}

/** Cast button (Echo for Android's CastButton): device picker, or the session when casting. */
function CastButton() {
  const status = useCast((s) => s.status);
  if (!castBridge) return null;
  const casting = status.state !== 'idle';
  return (
    <IconButton label={casting ? `Casting to ${status.device?.name ?? 'device'}` : 'Cast'} active={casting} onClick={openCast} className={cn(status.state === 'connecting' && 'animate-pulse')}>
      <CastDeviceIcon kind={casting ? status.device?.kind : undefined} className="size-[18px]" />
    </IconButton>
  );
}
