import { NavLink } from 'react-router';
import { AudioWaveform, Compass, HardDriveDownload, Heart, History, Home, Library, ListMusic, Plus, Search, Settings } from 'lucide-react';
import { useSettings } from '@/lib/settings';
import { useLt } from '@/lib/listenTogether';
import { openListenTogether } from './ListenTogether';
import { usePlaylists } from '@/lib/db';
import { cn } from '@/lib/utils';
import logo from '@/logo.png';
import { openNewPlaylist } from './NewPlaylistDialog';

const link = ({ isActive }: { isActive: boolean }) =>
  cn('flex h-10 items-center gap-3 rounded-xl px-3 text-[15px] font-medium text-text-muted hover:bg-accent hover:text-text', isActive && 'bg-accent text-text');

export function Sidebar() {
  const playlists = usePlaylists();
  const jamCode = useLt((s) => s.session?.roomCode ?? null);
  return (
    <nav className="flex w-60 shrink-0 flex-col gap-1 overflow-hidden rounded-[24px] bg-glass p-3" aria-label="Main">
      <div className="drag-area sidebar-brand mb-3 flex items-center gap-2.5 px-2 pt-1">
        <img src={logo} alt="" className="size-8" />
        <span className="font-display text-xl font-extrabold tracking-tight">Echo</span>
      </div>
      <NavLink to="/" end className={link}><Home className="size-5" />Home</NavLink>
      <NavLink to="/search" className={link}><Search className="size-5" />Search</NavLink>
      <NavLink to="/explore" className={link}><Compass className="size-5" />Explore</NavLink>
      <NavLink to="/library" end className={link}><Library className="size-5" />Library</NavLink>
      <button onClick={openListenTogether} className={cn(link({ isActive: false }), jamCode && 'bg-seed/20 text-text')}>
        <AudioWaveform className="size-5 shrink-0" /><span className="min-w-0 truncate whitespace-nowrap">Listen Together</span>
        {jamCode && <span className="ml-auto size-2 shrink-0 animate-pulse rounded-full bg-seed" title={`In room ${jamCode}`} aria-label={`In room ${jamCode}`} />}
      </button>

      <div className="mt-5 mb-1 flex items-center justify-between px-3">
        <span className="text-sm font-semibold text-text-faint">Your music</span>
        <button onClick={() => openNewPlaylist()} className="grid size-7 place-items-center rounded-full text-text-muted hover:bg-accent hover:text-text" aria-label="New playlist">
          <Plus className="size-4" />
        </button>
      </div>
      <div className="scrollbar-thin -mx-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1">
        <NavLink to="/library/liked" className={link}><Heart className="size-5" />Liked songs</NavLink>
        <NavLink to="/library/history" className={link}><History className="size-5" />Recently played</NavLink>
        <NavLink to="/library/downloads" className={link}><HardDriveDownload className="size-5" />Downloads</NavLink>
        {playlists.map((p) => (
          <NavLink key={p.id} to={`/library/playlist/${p.id}`} className={link}>
            <ListMusic className="size-5 shrink-0" /><span className="truncate">{p.name}</span>
          </NavLink>
        ))}
      </div>
      <button onClick={() => useSettings.getState().setSettingsOpen(true)} className={link({ isActive: false })}>
        <Settings className="size-5" />Settings
      </button>
      <p className="px-3 pt-1 text-[11px] text-text-faint">Developed by Praveen Kumar</p>
    </nav>
  );
}
