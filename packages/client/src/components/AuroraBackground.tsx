interface AuroraBackgroundProps {
  variant?: 'default' | 'subtle';
}

export default function AuroraBackground({ variant = 'default' }: AuroraBackgroundProps) {
  return (
    <div
      className={variant === 'subtle' ? 'aurora-root aurora-subtle' : 'aurora-root'}
      aria-hidden="true"
    >
      <div className="aurora-blob aurora-blob-1" />
      <div className="aurora-blob aurora-blob-2" />
      <div className="aurora-blob aurora-blob-3" />
      <div className="aurora-blob aurora-blob-4" />
      <div className="aurora-stars" />
    </div>
  );
}
