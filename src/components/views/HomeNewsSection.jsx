import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ICONS } from '../../constants/icons';
import { Icon } from '../common/CommonComponents';
import { launcher } from '../../services/launcherClient';
import { fetchHomeFeed, fetchPatchNoteDetail } from '../../lib/mojangNews';
import { useI18n } from '../../context/I18nContext';

function formatFeedDate(rawDate, language = 'en') {
  if (!rawDate) return '';
  const ts = Date.parse(rawDate);
  if (!Number.isFinite(ts)) return String(rawDate);
  try {
    return new Intl.DateTimeFormat(language === 'th' ? 'th-TH' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(ts));
  } catch {
    return String(rawDate).slice(0, 10);
  }
}

function openExternalUrl(url) {
  if (!url) return;
  if (typeof launcher?.openExternal === 'function') {
    launcher.openExternal(url).catch(() => {});
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

function renderSafeHtmlNode(node, keyPrefix) {
  if (!node) return null;
  if (node.nodeType === 3) {
    return node.textContent;
  }
  if (node.nodeType !== 1) return null;

  const tag = node.tagName.toLowerCase();
  if (tag === 'script' || tag === 'style' || tag === 'iframe') return null;

  const children = Array.from(node.childNodes)
    .map((child, idx) => renderSafeHtmlNode(child, `${keyPrefix}-${idx}`))
    .filter(c => c !== null && c !== '');

  switch (tag) {
    case 'br':
      return <br key={keyPrefix} />;
    case 'p':
    case 'div':
      return children.length > 0 ? <p key={keyPrefix}>{children}</p> : null;
    case 'h1':
      return <h3 key={keyPrefix}>{children}</h3>;
    case 'h2':
    case 'h3':
    case 'h4':
      return <h4 key={keyPrefix}>{children}</h4>;
    case 'ul':
      return <ul key={keyPrefix}>{children}</ul>;
    case 'ol':
      return <ol key={keyPrefix}>{children}</ol>;
    case 'li':
      return <li key={keyPrefix}>{children}</li>;
    case 'strong':
    case 'b':
      return <strong key={keyPrefix}>{children}</strong>;
    case 'em':
    case 'i':
      return <em key={keyPrefix}>{children}</em>;
    case 'code':
      return <code key={keyPrefix}>{children}</code>;
    case 'blockquote':
      return <blockquote key={keyPrefix}>{children}</blockquote>;
    case 'a': {
      const href = node.getAttribute('href') || '';
      if (!/^https?:\/\//i.test(href)) {
        return <span key={keyPrefix}>{children}</span>;
      }
      return (
        <a
          key={keyPrefix}
          href={href}
          onClick={(e) => {
            e.preventDefault();
            openExternalUrl(href);
          }}
        >
          {children}
        </a>
      );
    }
    default:
      return children.length > 0 ? <span key={keyPrefix}>{children}</span> : null;
  }
}

function SafePatchNoteBody({ html }) {
  const rendered = useMemo(() => {
    if (!html) return null;
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    return Array.from(doc.body.childNodes).map((node, idx) =>
      renderSafeHtmlNode(node, `pn-${idx}`)
    );
  }, [html]);

  return <div className="feed-reader-html">{rendered}</div>;
}

export function HomeNewsSection({ isOnline = true, onCreateInstanceForVersion }) {
  const { t, language } = useI18n();
  const [filter, setFilter] = useState('all'); // 'all' | 'patch' | 'news'
  const [news, setNews] = useState([]);
  const [patchNotes, setPatchNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  const [selectedItem, setSelectedItem] = useState(null);
  const [detailBody, setDetailBody] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const activeDetailIdRef = useRef(null);

  const requestFeed = useCallback(async (forceRefresh = false) => {
    if (typeof launcher?.minecraftGetHomeFeed === 'function') {
      const ipcRes = await launcher.minecraftGetHomeFeed({ forceRefresh });
      if (ipcRes && (ipcRes.news?.length > 0 || ipcRes.patchNotes?.length > 0)) {
        return ipcRes;
      }
      if (ipcRes?.error) {
        return fetchHomeFeed({ forceRefresh }).catch(() => ipcRes);
      }
    }
    return fetchHomeFeed({ forceRefresh });
  }, []);

  useEffect(() => {
    let cancelled = false;
    requestFeed(false)
      .then((res) => {
        if (cancelled) return;
        if (res?.ok === false && res.news?.length === 0 && res.patchNotes?.length === 0) {
          setError(res.message || 'Failed to load feed');
        } else {
          setError('');
        }
        setNews(Array.isArray(res?.news) ? res.news : []);
        setPatchNotes(Array.isArray(res?.patchNotes) ? res.patchNotes : []);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message || 'Failed to load feed');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [requestFeed]);

  const handleRefresh = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await requestFeed(true);
      setNews(Array.isArray(res?.news) ? res.news : []);
      setPatchNotes(Array.isArray(res?.patchNotes) ? res.patchNotes : []);
      if (res?.ok === false && res.news?.length === 0 && res.patchNotes?.length === 0) {
        setError(res.message || 'Failed to load feed');
      }
    } catch (err) {
      setError(err?.message || 'Failed to load feed');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenItem = async (item) => {
    activeDetailIdRef.current = item.id;
    setSelectedItem(item);
    setDetailBody('');

    if (item.kind !== 'patch' || !item.contentPath) {
      setDetailLoading(false);
      return;
    }

    setDetailLoading(true);
    try {
      const res = typeof launcher?.minecraftGetPatchNoteDetail === 'function'
        ? await launcher.minecraftGetPatchNoteDetail(item.contentPath)
        : await fetchPatchNoteDetail(item.contentPath);
      if (activeDetailIdRef.current === item.id && res?.body) {
        setDetailBody(res.body);
      }
    } catch {
      // Fallback to item.excerpt if full detail fails to load
    } finally {
      if (activeDetailIdRef.current === item.id) {
        setDetailLoading(false);
      }
    }
  };

  const handleCloseModal = () => {
    activeDetailIdRef.current = null;
    setSelectedItem(null);
    setDetailBody('');
    setDetailLoading(false);
  };

  const visibleItems = useMemo(() => {
    let items;
    if (filter === 'patch') {
      items = patchNotes;
    } else if (filter === 'news') {
      items = news;
    } else {
      items = [...patchNotes, ...news].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }
    return expanded ? items.slice(0, 18) : items.slice(0, 6);
  }, [filter, news, patchNotes, expanded]);

  const totalMatching = filter === 'patch'
    ? patchNotes.length
    : filter === 'news'
      ? news.length
      : (patchNotes.length + news.length);

  return (
    <div className="play-feed-block">
      <div className="play-section-head">
        <span className="play-section-title">{t('home.newsTitle')}</span>

        <div className="play-feed-controls">
          <div className="segmented-pills">
            {[
              { id: 'all', label: t('home.feedAll') },
              { id: 'patch', label: t('home.feedPatchNotes') },
              { id: 'news', label: t('home.feedNews') },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                className={`segmented-pill ${filter === tab.id ? 'active' : ''}`}
                onClick={() => {
                  setFilter(tab.id);
                  setExpanded(false);
                }}
              >
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn-secondary btn-icon-square"
            onClick={handleRefresh}
            disabled={loading || !isOnline}
            title={t('instances.refreshCatalog')}
          >
            <span className={loading ? 'spinning' : ''}>
              <Icon d={ICONS.refresh} size={12} />
            </span>
          </button>
        </div>
      </div>

      {loading && visibleItems.length === 0 ? (
        <div className="play-feed-grid">
          {[0, 1, 2, 3, 4, 5].map(idx => (
            <div key={idx} className="play-feed-card play-feed-skeleton">
              <div className="play-feed-thumb" />
              <div className="play-feed-body">
                <div className="skeleton-line short" />
                <div className="skeleton-line" />
                <div className="skeleton-line" />
              </div>
            </div>
          ))}
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="play-feed-empty">
          <span>{!isOnline ? t('offline.badge') : (error || t('home.noNewsAvailable'))}</span>
          {isOnline && (
            <button type="button" className="btn-secondary btn-sm" onClick={handleRefresh}>
              {t('common.retry')}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="play-feed-grid">
            {visibleItems.map(item => {
              const badgeLabel = item.kind === 'patch'
                ? (item.patchType === 'release' ? 'Release' : 'Snapshot')
                : (item.category || 'News');
              return (
                <button
                  key={item.id}
                  type="button"
                  className="play-feed-card"
                  onClick={() => handleOpenItem(item)}
                >
                  <div className="play-feed-thumb">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.title} loading="lazy" />
                    ) : (
                      <div className="play-feed-thumb-fallback">
                        <Icon d={ICONS.news} size={20} />
                      </div>
                    )}
                  </div>
                  <div className="play-feed-body">
                    <div className="play-feed-meta">
                      <span className="play-feed-tag">{badgeLabel}</span>
                      <span className="play-feed-date">{formatFeedDate(item.date, language)}</span>
                    </div>
                    <div className="play-feed-card-title">{item.title}</div>
                    {item.excerpt && (
                      <div className="play-feed-excerpt">{item.excerpt}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {totalMatching > 6 && (
            <div className="play-feed-more-row">
              <button
                type="button"
                className="play-section-link"
                onClick={() => setExpanded(prev => !prev)}
              >
                {expanded ? t('home.showLessNews') : t('home.showMoreNews')}
              </button>
            </div>
          )}
        </>
      )}

      {selectedItem && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && handleCloseModal()}>
          <div className="modal feed-reader-modal" style={{ maxWidth: 660 }}>
            {selectedItem.imageUrl && (
              <div className="feed-reader-banner">
                <img src={selectedItem.imageUrl} alt={selectedItem.title} />
              </div>
            )}

            <div className="feed-reader-meta">
              <span className="play-feed-tag">
                {selectedItem.kind === 'patch'
                  ? (selectedItem.patchType === 'release' ? 'Java Release' : 'Java Snapshot')
                  : (selectedItem.category || 'Minecraft News')}
              </span>
              {selectedItem.date && (
                <span className="play-feed-date">{formatFeedDate(selectedItem.date, language)}</span>
              )}
            </div>

            <div className="modal-title" style={{ marginBottom: 12 }}>{selectedItem.title}</div>

            <div className="feed-reader-content">
              {detailLoading ? (
                <div className="feed-reader-loading">
                  <span className="spinning"><Icon d={ICONS.spinner} size={15} /></span>
                  <span>{t('home.loadingArticle')}</span>
                </div>
              ) : detailBody ? (
                <SafePatchNoteBody html={detailBody} />
              ) : (
                <p className="feed-reader-excerpt">{selectedItem.excerpt}</p>
              )}
            </div>

            <div className="modal-actions" style={{ marginTop: 16 }}>
              {selectedItem.kind === 'patch' && selectedItem.version && onCreateInstanceForVersion && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    const ver = selectedItem.version;
                    const isSnap = selectedItem.patchType === 'snapshot';
                    handleCloseModal();
                    onCreateInstanceForVersion(ver, isSnap);
                  }}
                >
                  <Icon d={ICONS.plus} size={13} />
                  <span>{t('home.createVersionInstance', { version: selectedItem.version })}</span>
                </button>
              )}
              {selectedItem.readMoreLink && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => openExternalUrl(selectedItem.readMoreLink)}
                >
                  <Icon d={ICONS.external} size={13} />
                  <span>{t('home.readOnMinecraftNet')}</span>
                </button>
              )}
              <button type="button" className="btn-primary" onClick={handleCloseModal}>
                {t('common.close') || 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
