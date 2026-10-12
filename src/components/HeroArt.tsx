/**
 * Clay-style stand-in illustrations. The design calls for commissioned 3D claymation art;
 * until those exist, soft radial gradients on chunky shapes give a similar "squishy" read.
 * Swap these for real renders by dropping an <img> into .hero-art.
 */
function Defs() {
  return (
    <defs>
      {(
        [
          ['pink', '#ff8fb5', '#ff4d8b', '#d42c68'],
          ['peach', '#ffd2b5', '#ffb084', '#e88a5a'],
          ['ochre', '#f6d98a', '#e8b94a', '#c09125'],
          ['lavender', '#d8cbf7', '#b8a4ed', '#8f78d4'],
          ['mint', '#cfeae1', '#a4d4c5', '#77b3a1'],
          ['teal', '#3d6060', '#1a3a3a', '#0a1a1a'],
          ['cream', '#ffffff', '#f5f0e0', '#ddd5bd'],
        ] as const
      ).map(([id, hi, mid, lo]) => (
        <radialGradient key={id} id={`clay-${id}`} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor={hi} />
          <stop offset="55%" stopColor={mid} />
          <stop offset="100%" stopColor={lo} />
        </radialGradient>
      ))}
      <filter id="clay-shadow" x="-100%" y="-100%" width="300%" height="300%">
        <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#5a4a2a" floodOpacity="0.18" />
      </filter>
    </defs>
  );
}

function WeddingArt() {
  return (
    <svg viewBox="0 0 400 320" role="img" aria-label="Two clay wedding rings on a peach hill">
      <Defs />
      <ellipse cx="200" cy="300" rx="230" ry="90" fill="url(#clay-peach)" />
      <ellipse cx="70" cy="290" rx="120" ry="60" fill="url(#clay-mint)" />
      <g filter="url(#clay-shadow)">
        <circle cx="165" cy="160" r="66" fill="none" stroke="url(#clay-ochre)" strokeWidth="26" />
        <circle cx="240" cy="160" r="66" fill="none" stroke="url(#clay-pink)" strokeWidth="26" />
        <circle cx="240" cy="78" r="18" fill="url(#clay-lavender)" />
      </g>
      <circle cx="330" cy="70" r="12" fill="url(#clay-cream)" filter="url(#clay-shadow)" />
      <circle cx="60" cy="90" r="8" fill="url(#clay-pink)" />
      <circle cx="350" cy="220" r="16" fill="url(#clay-lavender)" filter="url(#clay-shadow)" />
    </svg>
  );
}

function CafeArt() {
  return (
    <svg viewBox="0 0 400 320" role="img" aria-label="A clay coffee cup with a cake on a mint hill">
      <Defs />
      <ellipse cx="200" cy="300" rx="230" ry="90" fill="url(#clay-mint)" />
      <ellipse cx="340" cy="290" rx="110" ry="55" fill="url(#clay-ochre)" />
      <g filter="url(#clay-shadow)">
        <ellipse cx="180" cy="232" rx="110" ry="22" fill="url(#clay-cream)" />
        <path d="M 110 130 h 140 v 60 a 70 50 0 0 1 -140 0 z" fill="url(#clay-pink)" />
        <ellipse cx="180" cy="130" rx="70" ry="16" fill="url(#clay-teal)" />
        <path d="M 248 150 c 40 -4 44 50 0 52" fill="none" stroke="url(#clay-pink)" strokeWidth="16" strokeLinecap="round" />
      </g>
      <g fill="none" stroke="url(#clay-lavender)" strokeWidth="10" strokeLinecap="round">
        <path d="M 160 100 c -12 -18 12 -26 0 -46" />
        <path d="M 200 100 c -12 -18 12 -26 0 -46" />
      </g>
      <g filter="url(#clay-shadow)">
        <path d="M 290 230 l 70 0 l -10 -50 z" fill="url(#clay-peach)" />
        <circle cx="352" cy="172" r="12" fill="url(#clay-pink)" />
      </g>
      <circle cx="60" cy="80" r="14" fill="url(#clay-ochre)" filter="url(#clay-shadow)" />
    </svg>
  );
}

export function HeroArt({ categoryId }: { categoryId: string }) {
  return <div className="hero-art">{categoryId === 'cafe' ? <CafeArt /> : <WeddingArt />}</div>;
}
