import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../context/I18nContext';
import { ICONS } from '../../constants/icons';
import { Icon } from '../common/CommonComponents';

export function CommandPaletteModal({
  open,
  onClose,
  commands = [],
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(cmd =>
      String(cmd.title || '').toLowerCase().includes(q) ||
      String(cmd.subtitle || '').toLowerCase().includes(q) ||
      String(cmd.group || '').toLowerCase().includes(q) ||
      String(cmd.keywords || '').toLowerCase().includes(q)
    );
  }, [commands, query]);

  const activeIndex = filtered.length > 0 ? Math.min(selectedIndex, filtered.length - 1) : 0;

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 10);
    return () => clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filtered.length > 0) {
        setSelectedIndex((activeIndex + 1) % filtered.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filtered.length > 0) {
        setSelectedIndex((activeIndex - 1 + filtered.length) % filtered.length);
      }
    } else if (e.key === 'Enter' && filtered[activeIndex]) {
      e.preventDefault();
      const target = filtered[activeIndex];
      onClose();
      target.action?.();
    }
  };

  return (
    <div className="modal-backdrop cmd-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cmd-palette" role="dialog" aria-modal="true" aria-label={t('cmd.placeholder')}>
        <div className="cmd-search-bar">
          <Icon d={ICONS.search} size={15} />
          <input
            ref={inputRef}
            type="text"
            className="cmd-search-input"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t('cmd.placeholder')}
          />
          <kbd className="cmd-kbd">ESC</kbd>
        </div>

        <div className="cmd-results-list">
          {filtered.length === 0 ? (
            <div className="cmd-empty">{t('cmd.noResults')}</div>
          ) : (
            filtered.map((cmd, idx) => (
              <button
                key={cmd.id}
                type="button"
                className={`cmd-item ${idx === activeIndex ? 'is-selected' : ''}`}
                onMouseEnter={() => setSelectedIndex(idx)}
                onClick={() => {
                  onClose();
                  cmd.action?.();
                }}
              >
                <span className="cmd-item-icon">
                  {cmd.imageSrc ? (
                    <img src={cmd.imageSrc} alt="" className="cmd-item-thumb" />
                  ) : (
                    <Icon d={cmd.icon || ICONS.zap} size={14} />
                  )}
                </span>
                <span className="cmd-item-copy">
                  <span className="cmd-item-title">{cmd.title}</span>
                  {cmd.subtitle && <span className="cmd-item-sub">{cmd.subtitle}</span>}
                </span>
                <span className="cmd-item-group">{cmd.group}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
