import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  ExternalLink,
  Globe,
  Link2,
  PlusCircle,
  Search,
  Share2,
  X,
} from 'lucide-react';
import { ContentPost } from '../types';
import {
  computeKawsarPostStats,
  findDuplicatePost,
  formatDateTime,
  isValidPostUrl,
  normalizePostUrl,
} from '../utils/leadLogic';

interface KawsarPostsViewProps {
  posts: ContentPost[];
  canSubmit?: boolean;
  compact?: boolean;
  onAddPost?: (input: {
    facebookLink: string;
    websiteLink: string;
    note: string;
  }) => {
    ok: boolean;
    error?: string;
    duplicate?: { post: ContentPost; matchedField: 'Facebook Link' | 'Website Link' };
  };
}

type LinkFilter = 'ALL' | 'FACEBOOK' | 'WEBSITE' | 'BOTH';

export function KawsarPostsView({
  posts,
  canSubmit = true,
  compact = false,
  onAddPost,
}: KawsarPostsViewProps) {
  const [facebookLink, setFacebookLink] = useState('');
  const [websiteLink, setWebsiteLink] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');
  const [duplicateModal, setDuplicateModal] = useState<{
    post: ContentPost;
    matchedField: 'Facebook Link' | 'Website Link';
  } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [linkFilter, setLinkFilter] = useState<LinkFilter>('ALL');

  const stats = useMemo(() => computeKawsarPostStats(posts), [posts]);

  const liveDuplicate = useMemo(() => {
    if (!facebookLink.trim() && !websiteLink.trim()) return null;
    return findDuplicatePost(posts, facebookLink, websiteLink);
  }, [posts, facebookLink, websiteLink]);

  const filteredPosts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return posts.filter((p) => {
      const hasFb = Boolean(p.facebookLink && p.facebookLink.trim());
      const hasWeb = Boolean(p.websiteLink && p.websiteLink.trim());
      if (linkFilter === 'FACEBOOK' && !hasFb) return false;
      if (linkFilter === 'WEBSITE' && !hasWeb) return false;
      if (linkFilter === 'BOTH' && !(hasFb && hasWeb)) return false;

      if (!q) return true;
      return (
        (p.note || '').toLowerCase().includes(q) ||
        (p.facebookLink || '').toLowerCase().includes(q) ||
        (p.websiteLink || '').toLowerCase().includes(q)
      );
    });
  }, [posts, searchQuery, linkFilter]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAddPost) return;
    setFormError('');

    const trimmedFb = facebookLink.trim();
    const trimmedWeb = websiteLink.trim();

    if (!trimmedFb && !trimmedWeb) {
      setFormError('Please enter at least one link (Facebook Post Link or Website Link).');
      return;
    }

    if (trimmedFb && !isValidPostUrl(trimmedFb)) {
      setFormError('Please enter a valid Facebook Post URL (e.g. https://facebook.com/...).');
      return;
    }

    if (trimmedWeb && !isValidPostUrl(trimmedWeb)) {
      setFormError('Please enter a valid Website URL (e.g. https://runbd.com/...).');
      return;
    }

    if (trimmedFb && trimmedWeb && normalizePostUrl(trimmedFb) === normalizePostUrl(trimmedWeb)) {
      setFormError('Facebook Link and Website Link cannot be the exact same URL.');
      return;
    }

    const dup = findDuplicatePost(posts, trimmedFb, trimmedWeb);
    if (dup) {
      setDuplicateModal(dup);
      return;
    }

    const res = onAddPost({
      facebookLink: trimmedFb
        ? /^https?:\/\//i.test(trimmedFb)
          ? trimmedFb
          : `https://${trimmedFb}`
        : '',
      websiteLink: trimmedWeb
        ? /^https?:\/\//i.test(trimmedWeb)
          ? trimmedWeb
          : `https://${trimmedWeb}`
        : '',
      note: note.trim(),
    });

    if (!res.ok) {
      if (res.duplicate) {
        setDuplicateModal(res.duplicate);
      } else if (res.error) {
        setFormError(res.error);
      }
      return;
    }

    setFacebookLink('');
    setWebsiteLink('');
    setNote('');
  };

  return (
    <div className="space-y-6">
      {!compact && (
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Kawsar&apos;s Content &amp; Link Tracker
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Submit Facebook and Website post links together in one entry with automatic duplicate
            URL prevention and live Google Sheets sync.
          </p>
        </div>
      )}

      {/* Live Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-panel rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total Entries Today
            </span>
            <CalendarClock className="w-4 h-4 text-emerald-500" />
          </div>
          <p
            data-testid="kawsar-posts-today"
            className="mt-2.5 text-3xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400"
          >
            {stats.todayCount}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {stats.totalCount} total entries submitted all time
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total Facebook Links
            </span>
            <Share2 className="w-4 h-4 text-sky-500" />
          </div>
          <p
            data-testid="kawsar-fb-links"
            className="mt-2.5 text-3xl font-bold font-mono tabular-nums text-sky-600 dark:text-sky-400"
          >
            {stats.facebookCount}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Non-empty Facebook links logged
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total Website Links
            </span>
            <Globe className="w-4 h-4 text-amber-500" />
          </div>
          <p
            data-testid="kawsar-web-links"
            className="mt-2.5 text-3xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400"
          >
            {stats.websiteCount}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Non-empty Website links logged
          </p>
        </div>
      </div>

      {/* Dual-Link Entry Form */}
      {canSubmit && onAddPost && (
        <section className="glass-panel rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <Link2 className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Submit New Post Link
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Enter a Facebook Link, a Website Link, or both together — syncs to Kawsar_Posts_Log.
                </p>
              </div>
            </div>
          </div>

          {liveDuplicate && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-3 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 text-amber-900 dark:text-amber-200"
            >
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed">
                <p className="font-semibold">
                  Duplicate {liveDuplicate.matchedField} Found: Already submitted on{' '}
                  {formatDateTime(liveDuplicate.post.createdAt)}.
                </p>
                {liveDuplicate.post.note && (
                  <p className="mt-0.5 text-amber-800/80 dark:text-amber-300/80">
                    Existing Entry: {liveDuplicate.post.note}
                  </p>
                )}
              </div>
            </div>
          )}

          {formError && (
            <div
              role="alert"
              className="mt-4 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300"
            >
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 grid grid-cols-1 md:grid-cols-12 gap-4" noValidate>
            <div className="md:col-span-6">
              <label
                htmlFor="kawsar-facebook-url"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Facebook Post Link (URL)
              </label>
              <input
                id="kawsar-facebook-url"
                type="url"
                placeholder="https://facebook.com/runbd/posts/..."
                value={facebookLink}
                onChange={(e) => {
                  setFacebookLink(e.target.value);
                  setFormError('');
                }}
                className={`w-full px-3 py-2.5 text-sm font-mono rounded-lg bg-slate-50 dark:bg-slate-950 border text-slate-900 dark:text-slate-100 placeholder:text-slate-400 placeholder:font-sans focus:outline-none focus:ring-2 transition-colors ${
                  liveDuplicate?.matchedField === 'Facebook Link'
                    ? 'border-amber-500 focus:ring-amber-500/30'
                    : 'border-slate-300 dark:border-slate-800 focus:ring-emerald-500/40 focus:border-emerald-500'
                }`}
              />
            </div>

            <div className="md:col-span-6">
              <label
                htmlFor="kawsar-website-url"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Website Post / Product Link (URL)
              </label>
              <input
                id="kawsar-website-url"
                type="url"
                placeholder="https://runbd.com/products/..."
                value={websiteLink}
                onChange={(e) => {
                  setWebsiteLink(e.target.value);
                  setFormError('');
                }}
                className={`w-full px-3 py-2.5 text-sm font-mono rounded-lg bg-slate-50 dark:bg-slate-950 border text-slate-900 dark:text-slate-100 placeholder:text-slate-400 placeholder:font-sans focus:outline-none focus:ring-2 transition-colors ${
                  liveDuplicate?.matchedField === 'Website Link'
                    ? 'border-amber-500 focus:ring-amber-500/30'
                    : 'border-slate-300 dark:border-slate-800 focus:ring-emerald-500/40 focus:border-emerald-500'
                }`}
              />
            </div>

            <div className="md:col-span-9">
              <label
                htmlFor="kawsar-note"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Short Note / Title (Optional)
              </label>
              <input
                id="kawsar-note"
                type="text"
                placeholder="e.g. Winter Hoodie Launch Campaign or Product Name"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
              />
            </div>

            <div className="md:col-span-3 flex items-end">
              <button
                type="submit"
                className={`w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                  liveDuplicate
                    ? 'bg-amber-600/90 hover:bg-amber-600 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                <PlusCircle className="w-4 h-4 shrink-0" />
                <span>{liveDuplicate ? 'Blocked (Duplicate)' : 'Submit Entry'}</span>
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Searchable Submitted Links History Table */}
      <section className="glass-panel rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              {compact ? "Kawsar's Submitted Post Links" : 'Submitted Links History'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Showing {filteredPosts.length} of {posts.length} submitted entries
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:flex-none">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search title or URL..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-56 pl-8 pr-3 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>

            <select
              aria-label="Filter entries"
              value={linkFilter}
              onChange={(e) => setLinkFilter(e.target.value as LinkFilter)}
              className="px-3 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              <option value="ALL">All Entries</option>
              <option value="FACEBOOK">Has Facebook Link</option>
              <option value="WEBSITE">Has Website Link</option>
              <option value="BOTH">Both Links</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <th className="py-3 px-4 font-semibold">Title / Note</th>
                <th className="py-3 px-4 font-semibold">Facebook Link</th>
                <th className="py-3 px-4 font-semibold">Website Link</th>
                <th className="py-3 px-4 font-semibold text-right">Submitted At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredPosts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-10 px-4 text-center text-xs text-slate-500 dark:text-slate-400">
                    {posts.length === 0
                      ? 'No post links submitted yet. Use the form above to log your Facebook and/or Website post links.'
                      : 'No entries match your search filter.'}
                  </td>
                </tr>
              ) : (
                filteredPosts.map((post) => (
                  <tr
                    key={post.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3.5 px-4 text-xs font-medium text-slate-900 dark:text-slate-100 max-w-xs">
                      {post.note || <span className="text-slate-400 font-normal">Untitled Entry</span>}
                    </td>
                    <td className="py-3.5 px-4 max-w-xs">
                      {post.facebookLink ? (
                        <a
                          href={post.facebookLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-mono text-sky-600 dark:text-sky-400 hover:underline break-all"
                        >
                          <Share2 className="w-3 h-3 shrink-0" />
                          <span>{post.facebookLink}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 max-w-xs">
                      {post.websiteLink ? (
                        <a
                          href={post.websiteLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-mono text-emerald-700 dark:text-emerald-400 hover:underline break-all"
                        >
                          <Globe className="w-3 h-3 shrink-0" />
                          <span>{post.websiteLink}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {formatDateTime(post.createdAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Duplicate Link Blocked Modal */}
      {duplicateModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="dup-post-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-rose-500/40 shadow-2xl p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
                <h3
                  id="dup-post-modal-title"
                  className="text-base font-bold text-rose-600 dark:text-rose-400"
                >
                  Duplicate Link Blocked
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDuplicateModal(null)}
                aria-label="Close duplicate warning"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              This <strong>{duplicateModal.matchedField}</strong> has already been submitted and
              cannot be logged twice.
            </p>

            <div className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500 dark:text-slate-400">Matched Field</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {duplicateModal.matchedField}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500 dark:text-slate-400">Submitted By</span>
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  {duplicateModal.post.posterName}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500 dark:text-slate-400">Submitted On</span>
                <span className="font-mono text-slate-800 dark:text-slate-200">
                  {formatDateTime(duplicateModal.post.createdAt)}
                </span>
              </div>
              {duplicateModal.post.note && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500 dark:text-slate-400">Title / Note</span>
                  <span className="text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
                    {duplicateModal.post.note}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setDuplicateModal(null)}
                className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
