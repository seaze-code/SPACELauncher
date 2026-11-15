import { memo, useEffect, useRef, useState } from 'react';
import { createPresetSkinDataUri } from '../../utils/skinRenderer';

export const Icon = memo(function Icon({ d, size = 14, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={d} />
    </svg>
  );
});

export const MicrosoftLogo = memo(function MicrosoftLogo() {
  return (
    <svg width="14" height="14" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
});

export const Toggle = memo(function Toggle({ on, onToggle }) {
  return (
    <div
      className={`toggle-switch ${on ? 'on' : ''}`}
      onClick={onToggle}
      role="switch"
      aria-checked={on}
    >
      <div className="toggle-thumb" />
    </div>
  );
});

export const EmptyState = memo(function EmptyState({
  icon,
  title,
  description,
  actionText,
  onAction,
  actionIcon,
  secondaryText,
  onSecondary,
  children,
}) {
  return (
    <div className="empty-state">
      {icon && (
        <div className="empty-state-icon">
          <Icon d={icon} size={26} />
        </div>
      )}
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-desc">{description}</p>}
      {children}
      {(actionText || secondaryText) && (
        <div className="empty-state-actions">
          {actionText && (
            <button className="btn-primary" onClick={onAction}>
              {actionIcon && <Icon d={actionIcon} size={13} />}
              <span>{actionText}</span>
            </button>
          )}
          {secondaryText && (
            <button className="btn-secondary" onClick={onSecondary}>
              <span>{secondaryText}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
});

export const LogLine = memo(function LogLine({ entry }) {
  const rawLevel = String(entry.level || entry.type || 'info').toLowerCase();
  const levelClass =
    rawLevel === 'error' || rawLevel === 'stderr'
      ? 'log-err'
      : rawLevel === 'warn'
        ? 'log-warn'
        : rawLevel === 'success'
          ? 'log-success'
          : rawLevel === 'game'
            ? 'log-game'
            : 'log-info';

  return (
    <div className={`log-line ${levelClass}`}>
      <span className="log-time">{entry.time}</span>
      <span className={`log-badge ${levelClass}`}>{rawLevel.toUpperCase()}</span>
      <span className="log-msg">{entry.msg}</span>
    </div>
  );
});

export const SkinHeadAvatar = memo(function SkinHeadAvatar({ skinDataUri = '', fallbackUrl = '', alt = 'Player', size = 32, className = '' }) {
  const canvasRef = useRef(null);
  const [resolvedFallbackErr, setResolvedFallbackErr] = useState(false);

  useEffect(() => {
    setResolvedFallbackErr(false);
  }, [fallbackUrl, skinDataUri]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const src = skinDataUri || (resolvedFallbackErr || !fallbackUrl ? createPresetSkinDataUri('steve') : '');
    if (!src) return;

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 8, 8, 8, 8, 0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 40, 8, 8, 8, 0, 0, canvas.width, canvas.height);
    };
    img.src = src;
  }, [skinDataUri, fallbackUrl, resolvedFallbackErr]);

  if (!skinDataUri && fallbackUrl && !resolvedFallbackErr) {
    return (
      <img
        src={fallbackUrl}
        alt={alt}
        className={className}
        style={{ width: '100%', height: '100%', objectFit: 'cover', imageRendering: 'pixelated' }}
        onError={() => setResolvedFallbackErr(true)}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      aria-label={alt}
      className={className}
      style={{ width: '100%', height: '100%', imageRendering: 'pixelated', display: 'block' }}
    />
  );
});

export const Toast = memo(function Toast({ toast, onClose }) {
  if (!toast) return null;
  const tone = toast.tone || toast.type || 'info';
  return (
    <div className={`toast toast-${tone}`} role="status" aria-live="polite">
      <div className={`toast-dot toast-dot-${tone}`} />
      <div className="toast-content">
        {toast.title && <div className="toast-title">{toast.title}</div>}
        {toast.message && <div className="toast-message">{toast.message}</div>}
      </div>
      <button className="toast-close" onClick={onClose} type="button" aria-label="Close notification">
        ×
      </button>
    </div>
  );
});
