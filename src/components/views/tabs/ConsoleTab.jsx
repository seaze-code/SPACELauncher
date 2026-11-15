import { useMemo, useState } from 'react';
import { ICONS } from '../../../constants/icons';
import { Icon, LogLine } from '../../common/CommonComponents';
import { useI18n } from '../../../context/I18nContext';

function classifyLevel(entry) {
  const level = String(entry?.level || '').toLowerCase();
  const msg = String(entry?.msg || '');
  if (level === 'error' || /\b(ERROR|FATAL|Exception)\b/.test(msg)) return 'error';
  if (level === 'warn' || /\bWARN\b/.test(msg)) return 'warn';
  return 'info';
}

export function ConsoleTab({
  active,
  gameState,
  runPid,
  logFilter,
  setLogFilter,
  autoScroll,
  setAutoScroll,
  handleCopyConsole,
  handleClearConsole,
  consoleRef,
  logs = [],
}) {
  const { t } = useI18n();
  const [logSearch, setLogSearch] = useState('');

  const levelCounts = useMemo(() => {
    const counts = { all: logs.length, info: 0, warn: 0, error: 0 };
    for (const entry of logs) {
      counts[classifyLevel(entry)] += 1;
    }
    return counts;
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    return logs.filter(entry => {
      const cls = classifyLevel(entry);
      if (logFilter !== 'all' && cls !== logFilter) return false;
      if (q && !String(entry.msg || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [logs, logFilter, logSearch]);

  return (
    <div className="tab-panel" style={{ display: active ? 'flex' : 'none' }}>
      <div className="console-wrapper">
        <div className="console-header">
          <div className="console-title">
            <div className={`console-indicator ${gameState === 'running' ? 'running' : ''}`} />
            <span>{t('console.outputLog')}</span>
            {gameState === 'running' && runPid && (
              <span className="console-pid-pill">
                {t('console.runningWithPid', { pid: runPid })}
              </span>
            )}
          </div>

          <div className="console-actions">
            <div className="console-search-box">
              <Icon d={ICONS.search} size={12} />
              <input
                type="text"
                className="console-search-input"
                placeholder={t('console.searchPlaceholder')}
                value={logSearch}
                onChange={e => setLogSearch(e.target.value)}
              />
              {logSearch && (
                <button className="search-clear-btn" onClick={() => setLogSearch('')}>
                  <Icon d={ICONS.x} size={10} />
                </button>
              )}
            </div>

            <div className="segmented-pills">
              {['all', 'info', 'warn', 'error'].map(lvl => (
                <button
                  key={lvl}
                  className={`segmented-pill ${logFilter === lvl ? 'active' : ''} pill-${lvl}`}
                  onClick={() => setLogFilter(lvl)}
                >
                  <span>{t(`console.level.${lvl}`)}</span>
                  <span className="segmented-count">{levelCounts[lvl]}</span>
                </button>
              ))}
            </div>

            <button
              className={`btn-secondary btn-icon-square ${autoScroll ? 'is-toggled' : ''}`}
              onClick={() => setAutoScroll(prev => !prev)}
              title={t('console.autoScroll')}
            >
              <Icon d={autoScroll ? ICONS.play : ICONS.stop} size={11} />
            </button>
            <button className="btn-secondary btn-icon-square" onClick={handleCopyConsole} title={t('console.copy')}>
              <Icon d={ICONS.copy} size={11} />
            </button>
            <button className="btn-secondary btn-icon-square" onClick={handleClearConsole} title={t('console.clear')}>
              <Icon d={ICONS.clear} size={11} />
            </button>
          </div>
        </div>

        <div className="console-body" ref={consoleRef}>
          {logs.length === 0 ? (
            <div className="console-empty-box">
              <Icon d={ICONS.console} size={28} />
              <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{t('console.noLogsYet')}</span>
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{t('console.noLogsYetSub')}</span>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="console-empty-box">
              <Icon d={ICONS.search} size={24} />
              <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                {t('console.noLogsWithFilter', { filter: logSearch || logFilter })}
              </span>
            </div>
          ) : (
            filteredLogs.map((entry, i) => <LogLine key={i} entry={entry} />)
          )}
        </div>
      </div>
    </div>
  );
}
