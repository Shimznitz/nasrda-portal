// src/components/Avatar.tsx

import { useState } from 'react';

interface AvatarProps {
  name?: string;
  avatarUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZES = {
  xs: { wh: 24,  font: 9,   border: 1 },
  sm: { wh: 32,  font: 11,  border: 1 },
  md: { wh: 40,  font: 13,  border: 2 },
  lg: { wh: 56,  font: 18,  border: 2 },
  xl: { wh: 110, font: 32,  border: 3 },
};

function getInitials(name?: string) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

export default function Avatar({ name, avatarUrl, size = 'md', className = '' }: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const { wh, font, border } = SIZES[size];

  const showImage = avatarUrl && !imgError;

  return (
    <div
      className={`avatar-root ${className}`}
      style={{
        width: wh,
        height: wh,
        minWidth: wh,
        borderRadius: '50%',
        border: `${border}px solid var(--gold)`,
        background: showImage ? 'transparent' : 'var(--gold-dim)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {showImage ? (
        <img
          src={avatarUrl}
          alt={name || ''}
          onError={() => setImgError(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: '50%',
            display: 'block',
          }}
        />
      ) : (
        <span
          style={{
            fontSize: font,
            fontWeight: 700,
            color: 'var(--gold)',
            fontFamily: "'IBM Plex Mono', monospace",
            userSelect: 'none',
            letterSpacing: '0.02em',
          }}
        >
          {getInitials(name)}
        </span>
      )}
    </div>
  );
}