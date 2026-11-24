import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  ExternalLink,
  Globe,
  Instagram,
  Link2,
  PlusCircle,
  Search,
  Share2,
  Twitter,
  Video,
  X,
} from 'lucide-react';
import { ContentPost, PostLinkField } from '../types';
import {
  computeKawsarPostStats,
  filterTodayPosts,
  findDuplicatePost,
  formatDateTime,
  getLocalDateString,
  isValidPostUrl,
  normalizePostUrl,
} from '../utils/leadLogic';

interface KawsarPostsViewProps {
  posts: ContentPost[];
  todayOnly?: boolean;
  canSubmit?: boolean;
  compact?: boolean;
  onAddPost?: (input: {
    facebookLink: string;
    websiteLink: string;
    tiktokLink: string;
    instagramLink: string;
    twitterLink: string;
    note: string;
  }) =>
    | Promise<{
        ok: boolean;
        error?: string;
        duplicate?: { post: ContentPost; matchedField: PostLinkField };
      }>
    | {
        ok: boolean;
        error?: string;
        duplicate?: { post: ContentPost; matchedField: PostLinkField };
      };
}

type LinkFilter =
  | 'ALL'
  | 'FACEBOOK'
  | 'WEBSITE'
  | 'TIKTOK'
  | 'INSTAGRAM'
  | 'TWITTER'
  | 'MULTI';

function getMatchedLinkFromPost(post: ContentPost, field: PostLinkField): string {
  switch (field) {
    case 'Facebook Link':
      return post.facebookLink || '';
    case 'Website Link':
      return post.websiteLink || '';
    case 'TikTok Link':
      return post.tiktokLink || '';
    case 'Instagram Link':
      return post.instagramLink || '';
    case 'Twitter Link':
      return post.twitterLink || '';
  }
}

function withHttps(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function KawsarPostsView({
  posts,
  todayOnly = false,
  canSubmit = true,
  compact = false,
  onAddPost,
}: KawsarPostsViewProps) {
  const [facebookLink, setFacebookLink] = useState('');
  const [websiteLink, setWebsiteLink] = useState('');
  const [tiktokLink, setTiktokLink] = useState('');
  const [instagramLink, setInstagramLink] = useState('');
  const [twitterLink, setTwitterLink] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [duplicateModal, setDuplicateModal] = useState<{
    post: ContentPost;
    matchedField: PostLinkField;
  } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [linkFilter, setLinkFilter] = useState<LinkFilter>('ALL');

  const todayStr = getLocalDateString();
  const scopedPosts = useMemo(
    () => (todayOnly ? filterTodayPosts(posts) : posts),
    [posts, todayOnly]
  );

  const stats = useMemo(() => computeKawsarPostStats(scopedPosts), [scopedPosts]);

  const liveDuplicate = useMemo(() => {
    if (
      !facebookLink.trim() &&
      !websiteLink.trim() &&
      !tiktokLink.trim() &&
      !instagramLink.trim() &&
      !twitterLink.trim()
    ) {
      return null;
    }
    return findDuplicatePost(
      posts,
      facebookLink,
      websiteLink,
      tiktokLink,
      instagramLink,
      twitterLink
    );
  }, [posts, facebookLink, websiteLink, tiktokLink, instagramLink, twitterLink]);

  const filteredPosts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return scopedPosts.filter((p) => {
      const hasFb = Boolean(p.facebookLink && p.facebookLink.trim());
      const hasWeb = Boolean(p.websiteLink && p.websiteLink.trim());
      const hasTt = Boolean(p.tiktokLink && p.tiktokLink.trim());
      const hasIg = Boolean(p.instagramLink && p.instagramLink.trim());
      const hasTw = Boolean(p.twitterLink && p.twitterLink.trim());
      const linkCount = [hasFb, hasWeb, hasTt, hasIg, hasTw].filter(Boolean).length;

      if (linkFilter === 'FACEBOOK' && !hasFb) return false;
      if (linkFilter === 'WEBSITE' && !hasWeb) return false;
      if (linkFilter === 'TIKTOK' && !hasTt) return false;
      if (linkFilter === 'INSTAGRAM' && !hasIg) return false;
      if (linkFilter === 'TWITTER' && !hasTw) return false;
      if (linkFilter === 'MULTI' && linkCount < 2) return false;

      if (!q) return true;
      return (
        (p.note || '').toLowerCase().includes(q) ||
        (p.facebookLink || '').toLowerCase().includes(q) ||
        (p.websiteLink || '').toLowerCase().includes(q) ||
        (p.tiktokLink || '').toLowerCase().includes(q) ||
        (p.instagramLink || '').toLowerCase().includes(q) ||
        (p.twitterLink || '').toLowerCase().includes(q)
      );
    });
  }, [scopedPosts, searchQuery, linkFilter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAddPost || submitting) return;
    setFormError('');

    const trimmedFb = facebookLink.trim();
    const trimmedWeb = websiteLink.trim();
    const trimmedTt = tiktokLink.trim();
    const trimmedIg = instagramLink.trim();
    const trimmedTw = twitterLink.trim();

    if (!trimmedFb && !trimmedWeb && !trimmedTt && !trimmedIg && !trimmedTw) {
      setFormError(
        'Please enter at least one link (Facebook, Website, TikTok, Instagram, or Twitter).'
      );
      return;
    }

    const fields: Array<{ label: PostLinkField; value: string; example: string }> = [
      { label: 'Facebook Link', value: trimmedFb, example: 'https://facebook.com/...' },
      { label: 'Website Link', value: trimmedWeb, example: 'https://runbd.com/...' },
      { label: 'TikTok Link', value: trimmedTt, example: 'https://www.tiktok.com/@runbd/video/...' },
      { label: 'Instagram Link', value: trimmedIg, example: 'https://www.instagram.com/p/...' },
      { label: 'Twitter Link', value: trimmedTw, example: 'https://x.com/runbd/status/...' },
    ];

    for (const field of fields) {
      if (field.value && !isValidPostUrl(field.value)) {
        setFormError(`Please enter a valid ${field.label} URL (e.g. ${field.example}).`);
        return;
      }
    }

    // Prevent submitting the exact same normalized URL across two different fields
    const seenInSubmission = new Map<string, PostLinkField>();
    for (const field of fields) {
      if (!field.value) continue;
      const norm = normalizePostUrl(field.value);
      const prevField = seenInSubmission.get(norm);
      if (prevField) {
        setFormError(`${prevField} and ${field.label} cannot be the exact same URL.`);
        return;
      }
      seenInSubmission.set(norm, field.label);
    }

    const dup = findDuplicatePost(
      posts,
      trimmedFb,
      trimmedWeb,
      trimmedTt,
      trimmedIg,
      trimmedTw
    );
    if (dup) {
      setDuplicateModal(dup);
      return;
    }

    setSubmitting(true);
    try {
      const res = await onAddPost({
        facebookLink: withHttps(trimmedFb),
        websiteLink: withHttps(trimmedWeb),
        tiktokLink: withHttps(trimmedTt),
        instagramLink: withHttps(trimmedIg),
        twitterLink: withHttps(trimmedTw),
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
      setTiktokLink('');
      setInstagramLink('');
      setTwitterLink('');
      setNote('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {!compact && (
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Kawsar&apos;s Content &amp; Link Tracker
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Submit Facebook, Website, TikTok, Instagram, and Twitter post links in one entry with
            automatic duplicate URL prevention and live Google Sheets sync.
          </p>
        </div>
      )}

      {/* Live Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3.5">
        <div className="glass-panel rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total Entries Today
            </span>
            <CalendarClock className="w-4 h-4 text-emerald-500 shrink-0" />
          </div>
          <p
            data-testid="kawsar-posts-today"
            className="mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400"
          >
            {stats.todayCount}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {todayOnly
              ? `Today (${todayStr})`
              : `${stats.totalCount} total entries`}
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {todayOnly ? 'Facebook Today' : 'Facebook Links'}
            </span>
            <Share2 className="w-4 h-4 text-sky-500 shrink-0" />
          </div>
          <p
            data-testid="kawsar-fb-links"
            className="mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-sky-600 dark:text-sky-400"
          >
            {todayOnly ? stats.todayFacebookCount : stats.facebookCount}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {todayOnly ? 'Submitted today' : 'Total logged'}
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {todayOnly ? 'Website Today' : 'Website Links'}
            </span>
            <Globe className="w-4 h-4 text-amber-500 shrink-0" />
          </div>
          <p
            data-testid="kawsar-web-links"
            className="mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400"
          >
            {todayOnly ? stats.todayWebsiteCount : stats.websiteCount}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {todayOnly ? 'Submitted today' : 'Total logged'}
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {todayOnly ? 'TikTok Today' : 'TikTok Links'}
            </span>
            <Video className="w-4 h-4 text-rose-500 shrink-0" />
          </div>
          <p
            data-testid="kawsar-tiktok-links"
            className="mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400"
          >
            {todayOnly ? stats.todayTiktokCount : stats.tiktokCount}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {todayOnly ? 'Submitted today' : 'Total logged'}
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {todayOnly ? 'Instagram Today' : 'Instagram Links'}
            </span>
            <Instagram className="w-4 h-4 text-fuchsia-500 shrink-0" />
          </div>
          <p
            data-testid="kawsar-instagram-links"
            className="mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-fuchsia-600 dark:text-fuchsia-400"
          >
            {todayOnly ? stats.todayInstagramCount : stats.instagramCount}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {todayOnly ? 'Submitted today' : 'Total logged'}
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {todayOnly ? 'Twitter Today' : 'Twitter Links'}
            </span>
            <Twitter className="w-4 h-4 text-cyan-500 shrink-0" />
          </div>
          <p
            data-testid="kawsar-twitter-links"
            className="mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-cyan-600 dark:text-cyan-400"
          >
            {todayOnly ? stats.todayTwitterCount : stats.twitterCount}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {todayOnly ? 'Submitted today' : 'Total logged'}
          </p>
        </div>
      </div>

      {/* Multi-Platform Link Entry Form */}
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
                  Enter any single link or combine Facebook, Website, TikTok, Instagram, and Twitter
                  links — syncs to Kawsar_Posts_Log.
                </p>
              </div>
            </div>
          </div>

          {liveDuplicate && (
            <div
              role="alert"
              data-testid="kawsar-duplicate-warning"
              className="mt-4 flex items-start gap-3 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 text-amber-900 dark:text-amber-200"
            >
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed">
                <p className="font-semibold">
                  Duplicate {liveDuplicate.matchedField} Found: Already submitted by{' '}
                  {liveDuplicate.post.posterName} on {formatDateTime(liveDuplicate.post.createdAt)}.
                </p>
                <p className="mt-0.5 text-amber-800/80 dark:text-amber-300/80 break-all">
                  {liveDuplicate.post.note ? `${liveDuplicate.post.note} · ` : ''}
                  {getMatchedLinkFromPost(liveDuplicate.post, liveDuplicate.matchedField)}
                </p>
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

            <div className="md:col-span-4">
              <label
                htmlFor="kawsar-tiktok-url"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                TikTok Link (URL)
              </label>
              <input
                id="kawsar-tiktok-url"
                type="url"
                placeholder="https://www.tiktok.com/@runbd/video/..."
                value={tiktokLink}
                onChange={(e) => {
                  setTiktokLink(e.target.value);
                  setFormError('');
                }}
                className={`w-full px-3 py-2.5 text-sm font-mono rounded-lg bg-slate-50 dark:bg-slate-950 border text-slate-900 dark:text-slate-100 placeholder:text-slate-400 placeholder:font-sans focus:outline-none focus:ring-2 transition-colors ${
                  liveDuplicate?.matchedField === 'TikTok Link'
                    ? 'border-amber-500 focus:ring-amber-500/30'
                    : 'border-slate-300 dark:border-slate-800 focus:ring-emerald-500/40 focus:border-emerald-500'
                }`}
              />
            </div>

            <div className="md:col-span-4">
              <label
                htmlFor="kawsar-instagram-url"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Instagram Link (URL)
              </label>
              <input
                id="kawsar-instagram-url"
                type="url"
                placeholder="https://www.instagram.com/p/..."
                value={instagramLink}
                onChange={(e) => {
                  setInstagramLink(e.target.value);
                  setFormError('');
                }}
                className={`w-full px-3 py-2.5 text-sm font-mono rounded-lg bg-slate-50 dark:bg-slate-950 border text-slate-900 dark:text-slate-100 placeholder:text-slate-400 placeholder:font-sans focus:outline-none focus:ring-2 transition-colors ${
                  liveDuplicate?.matchedField === 'Instagram Link'
                    ? 'border-amber-500 focus:ring-amber-500/30'
                    : 'border-slate-300 dark:border-slate-800 focus:ring-emerald-500/40 focus:border-emerald-500'
                }`}
              />
            </div>

            <div className="md:col-span-4">
              <label
                htmlFor="kawsar-twitter-url"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Twitter Link (URL)
              </label>
              <input
                id="kawsar-twitter-url"
                type="url"
                placeholder="https://x.com/runbd/status/..."
                value={twitterLink}
                onChange={(e) => {
                  setTwitterLink(e.target.value);
                  setFormError('');
                }}
                className={`w-full px-3 py-2.5 text-sm font-mono rounded-lg bg-slate-50 dark:bg-slate-950 border text-slate-900 dark:text-slate-100 placeholder:text-slate-400 placeholder:font-sans focus:outline-none focus:ring-2 transition-colors ${
                  liveDuplicate?.matchedField === 'Twitter Link'
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
                disabled={submitting}
                className={`w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60 cursor-pointer ${
                  liveDuplicate
                    ? 'bg-amber-600/90 hover:bg-amber-600 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                <PlusCircle className="w-4 h-4 shrink-0" />
                <span>
                  {submitting
                    ? 'Checking & Saving...'
                    : liveDuplicate
                    ? 'Blocked (Duplicate)'
                    : 'Submit Entry'}
                </span>
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
              {compact
                ? "Kawsar's Submitted Post Links"
                : todayOnly
                ? "Today's Submitted Links"
                : 'Submitted Links History'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Showing {filteredPosts.length} of {scopedPosts.length}{' '}
              {todayOnly ? `entries today (${todayStr})` : 'submitted entries'}
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
              <option value="TIKTOK">Has TikTok Link</option>
              <option value="INSTAGRAM">Has Instagram Link</option>
              <option value="TWITTER">Has Twitter Link</option>
              <option value="MULTI">Multiple Links (2+)</option>
            </select>
          </div>
        </div>

        {/* Mobile Card View (< md) — clean readable rows without multi-line character wrapping */}
        <div className="md:hidden divide-y divide-slate-200 dark:divide-slate-800">
          {filteredPosts.length === 0 ? (
            <div className="py-10 px-4 text-center text-xs text-slate-500 dark:text-slate-400">
              {scopedPosts.length === 0
                ? todayOnly
                  ? 'No post links submitted today yet. Use the form above to log your Facebook, Website, TikTok, Instagram, or Twitter links.'
                  : 'No post links submitted yet. Use the form above to log your Facebook, Website, TikTok, Instagram, or Twitter links.'
                : 'No entries match your search filter.'}
            </div>
          ) : (
            filteredPosts.map((post) => {
              const items = [
                {
                  label: 'Facebook',
                  url: post.facebookLink,
                  icon: <Share2 className="w-3.5 h-3.5 text-sky-500 shrink-0" />,
                  color: 'text-sky-600 dark:text-sky-400',
                },
                {
                  label: 'Website',
                  url: post.websiteLink,
                  icon: <Globe className="w-3.5 h-3.5 text-emerald-500 shrink-0" />,
                  color: 'text-emerald-700 dark:text-emerald-400',
                },
                {
                  label: 'TikTok',
                  url: post.tiktokLink,
                  icon: <Video className="w-3.5 h-3.5 text-rose-500 shrink-0" />,
                  color: 'text-rose-600 dark:text-rose-400',
                },
                {
                  label: 'Instagram',
                  url: post.instagramLink,
                  icon: <Instagram className="w-3.5 h-3.5 text-fuchsia-500 shrink-0" />,
                  color: 'text-fuchsia-600 dark:text-fuchsia-400',
                },
                {
                  label: 'Twitter',
                  url: post.twitterLink,
                  icon: <Twitter className="w-3.5 h-3.5 text-cyan-500 shrink-0" />,
                  color: 'text-cyan-600 dark:text-cyan-400',
                },
              ].filter((item) => Boolean(item.url && item.url.trim()));

              return (
                <div key={post.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {post.note || <span className="text-slate-400 font-normal">Untitled Entry</span>}
                    </p>
                    <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                      {formatDateTime(post.createdAt)}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {items.map((item) => (
                      <a
                        key={item.label}
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-xs rounded-lg px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80"
                      >
                        {item.icon}
                        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 shrink-0">
                          {item.label}:
                        </span>
                        <span className={`font-mono truncate flex-1 min-w-0 ${item.color}`}>
                          {item.url}
                        </span>
                        <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Table View (md+) — crisp single-line truncated links with full URL hover title */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <th className="py-3 px-4 font-semibold whitespace-nowrap">Title / Note</th>
                <th className="py-3 px-3.5 font-semibold whitespace-nowrap">Facebook Link</th>
                <th className="py-3 px-3.5 font-semibold whitespace-nowrap">Website Link</th>
                <th className="py-3 px-3.5 font-semibold whitespace-nowrap">TikTok Link</th>
                <th className="py-3 px-3.5 font-semibold whitespace-nowrap">Instagram Link</th>
                <th className="py-3 px-3.5 font-semibold whitespace-nowrap">Twitter Link</th>
                <th className="py-3 px-4 font-semibold text-right whitespace-nowrap">Submitted At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredPosts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 px-4 text-center text-xs text-slate-500 dark:text-slate-400">
                    {scopedPosts.length === 0
                      ? todayOnly
                        ? 'No post links submitted today yet. Use the form above to log your Facebook, Website, TikTok, Instagram, or Twitter links.'
                        : 'No post links submitted yet. Use the form above to log your Facebook, Website, TikTok, Instagram, or Twitter links.'
                      : 'No entries match your search filter.'}
                  </td>
                </tr>
              ) : (
                filteredPosts.map((post) => (
                  <tr
                    key={post.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td
                      title={post.note || 'Untitled Entry'}
                      className="py-3.5 px-4 text-xs font-medium text-slate-900 dark:text-slate-100 max-w-[160px] truncate"
                    >
                      {post.note || <span className="text-slate-400 font-normal">Untitled Entry</span>}
                    </td>
                    <td className="py-3.5 px-3.5 max-w-[165px]">
                      {post.facebookLink ? (
                        <a
                          href={post.facebookLink}
                          title={post.facebookLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-mono text-sky-600 dark:text-sky-400 hover:underline max-w-full"
                        >
                          <Share2 className="w-3 h-3 shrink-0" />
                          <span className="truncate">{post.facebookLink}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-3.5 max-w-[165px]">
                      {post.websiteLink ? (
                        <a
                          href={post.websiteLink}
                          title={post.websiteLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-mono text-emerald-700 dark:text-emerald-400 hover:underline max-w-full"
                        >
                          <Globe className="w-3 h-3 shrink-0" />
                          <span className="truncate">{post.websiteLink}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-3.5 max-w-[155px]">
                      {post.tiktokLink ? (
                        <a
                          href={post.tiktokLink}
                          title={post.tiktokLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-mono text-rose-600 dark:text-rose-400 hover:underline max-w-full"
                        >
                          <Video className="w-3 h-3 shrink-0" />
                          <span className="truncate">{post.tiktokLink}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-3.5 max-w-[155px]">
                      {post.instagramLink ? (
                        <a
                          href={post.instagramLink}
                          title={post.instagramLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-mono text-fuchsia-600 dark:text-fuchsia-400 hover:underline max-w-full"
                        >
                          <Instagram className="w-3 h-3 shrink-0" />
                          <span className="truncate">{post.instagramLink}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-3.5 max-w-[155px]">
                      {post.twitterLink ? (
                        <a
                          href={post.twitterLink}
                          title={post.twitterLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-mono text-cyan-600 dark:text-cyan-400 hover:underline max-w-full"
                        >
                          <Twitter className="w-3 h-3 shrink-0" />
                          <span className="truncate">{post.twitterLink}</span>
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
              {getMatchedLinkFromPost(duplicateModal.post, duplicateModal.matchedField) && (
                <div className="pt-1 border-t border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400 block mb-0.5">
                    Existing URL
                  </span>
                  <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300 break-all">
                    {getMatchedLinkFromPost(duplicateModal.post, duplicateModal.matchedField)}
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
