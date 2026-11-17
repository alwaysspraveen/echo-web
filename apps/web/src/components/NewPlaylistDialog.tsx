import { useState } from 'react';
import { useNavigate } from 'react-router';
import { create } from 'zustand';
import { toast } from 'sonner';
import type { Track } from '@echo/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { createPlaylist } from '@/lib/db';

const useNewPlaylist = create<{ open: boolean; tracks: Track[] }>(() => ({ open: false, tracks: [] }));

/** Opens the "New playlist" dialog, optionally seeding it with tracks. */
export const openNewPlaylist = (tracks: Track[] = []) => useNewPlaylist.setState({ open: true, tracks });

/** Mounted once in the app shell so menus can open it after they close. */
export function NewPlaylistDialog() {
  const { open, tracks } = useNewPlaylist();
  const [name, setName] = useState('');
  const navigate = useNavigate();

  const close = () => { useNewPlaylist.setState({ open: false }); setName(''); };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = await createPlaylist(name, tracks);
    toast(tracks.length ? `Created "${name.trim() || 'New playlist'}" with ${tracks.length} song${tracks.length > 1 ? 's' : ''}` : 'Playlist created');
    close();
    navigate(`/library/playlist/${id}`);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-sm">
        <DialogTitle className="font-display text-xl font-bold">New playlist</DialogTitle>
        <DialogDescription className="sr-only">Name your playlist</DialogDescription>
        <form onSubmit={submit} className="grid gap-4">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Playlist name"
            maxLength={100}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
            <Button type="submit">Create</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
