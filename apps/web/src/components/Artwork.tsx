import { useState } from 'react';
import { Music2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOffline } from '@/lib/offline';

export function Artwork({ src, alt = '', className, round, style }: { src?: string; alt?: string; className?: string; round?: boolean; style?: React.CSSProperties }) {
  const [failed, setFailed] = useState(false);
  const local = useOffline((s) => (src ? s.art[src] : undefined));
  src = local ?? src;
  return (
    <div style={style} className={cn('relative shrink-0 overflow-hidden bg-surface-high', round ? 'rounded-full' : 'rounded-xl', className)}>
      {src && !failed ? (
        <img src={src} alt={alt} loading="lazy" decoding="async" draggable={false} referrerPolicy="no-referrer"
          onError={() => setFailed(true)} className="size-full object-cover" />
      ) : (
        <div className="grid size-full place-items-center text-text-faint"><Music2 className="size-1/3" aria-hidden /></div>
      )}
    </div>
  );
}
