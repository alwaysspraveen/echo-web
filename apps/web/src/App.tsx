import { useEffect, useRef } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { PlayerBar } from '@/components/PlayerBar';
import { SidePanel } from '@/components/SidePanel';
import { NowPlaying } from '@/components/NowPlaying';
import { NewPlaylistDialog } from '@/components/NewPlaylistDialog';
import { PlayerEngine } from '@/player/PlayerEngine';
import HomePage from '@/pages/Home';
import SearchPage from '@/pages/Search';
import { AlbumPage, ArtistPage, LocalPlaylistPage, PlaylistPage } from '@/pages/Collections';
import { HistoryPage, LibraryPage, LikedPage } from '@/pages/Library';

export default function App() {
  const main = useRef<HTMLElement>(null);
  const { pathname, search } = useLocation();
  useEffect(() => { main.current?.scrollTo({ top: 0 }); }, [pathname, search]);

  return (
    <TooltipProvider delayDuration={500}>
      <div className="flex h-full flex-col">
        <div className="flex min-h-0 flex-1 gap-3 p-3 pb-3">
          <Sidebar />
          <main ref={main} className="scrollbar-thin relative min-w-0 flex-1 overflow-y-auto rounded-[24px] bg-surface/60">
            <div className="sticky top-0 z-20 bg-gradient-to-b from-surface via-surface/85 to-transparent">
              <TopBar />
            </div>
            <div className="px-6 pb-12">
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/album/:id" element={<AlbumPage />} />
                <Route path="/artist/:id" element={<ArtistPage />} />
                <Route path="/playlist/:id" element={<PlaylistPage />} />
                <Route path="/library" element={<LibraryPage />} />
                <Route path="/library/liked" element={<LikedPage />} />
                <Route path="/library/history" element={<HistoryPage />} />
                <Route path="/library/playlist/:id" element={<LocalPlaylistPage />} />
                <Route path="*" element={<p className="px-2.5 pt-16 text-text-muted">This page doesn't exist.</p>} />
              </Routes>
            </div>
          </main>
          <SidePanel />
        </div>
        <PlayerBar />
      </div>
      <NowPlaying />
      <NewPlaylistDialog />
      <PlayerEngine />
      <Toaster position="top-center" />
    </TooltipProvider>
  );
}
