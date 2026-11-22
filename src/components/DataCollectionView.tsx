import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileUp,
  Loader2,
  MessageCircle,
  PlusCircle,
  Search,
  ShieldAlert,
  Upload,
  X,
} from 'lucide-react';
import { CsvPreviewRow, DuplicateAttempt, Lead, User } from '../types';
import {
  filterTodayDuplicateAttempts,
  filterTodayLeads,
  findDuplicateLead,
  formatBdPhoneDisplay,
  formatDateTime,
  formatShortDate,
  getLocalDateString,
  normalizeBdPhone,
  openWhatsAppChat,
  parseCsvLeads,
} from '../utils/leadLogic';
import { StatusBadge } from './StatusBadge';

interface DataCollectionViewProps {
  currentUser: User;
  allLeads: Lead[];
  duplicateAttempts: DuplicateAttempt[];
  autoAssignEnabled: boolean;
  onCheckPhoneDuplicate?: (rawPhone: string) => Promise<{
    ok: boolean;
    isDuplicate: boolean;
    duplicate?: { lead: Lead; matchedBy: 'phone' | 'facebook' };
    error?: string;
  }>;
  onAddSingleLead: (input: {
    customerName: string;
    rawPhone: string;
    facebookLink: string;
    notes: string;
  }) => Promise<{
    ok: boolean;
    error?: string;
    duplicate?: { lead: Lead; matchedBy: 'phone' | 'facebook' };
  }>;
  onImportBulkLeads: (validRows: CsvPreviewRow[]) => Promise<void> | void;
  onRecordDuplicateAttempt: (attempt: Omit<DuplicateAttempt, 'id' | 'timestamp'>) => void;
}

export function DataCollectionView({
  currentUser,
  allLeads,
  duplicateAttempts,
  autoAssignEnabled,
  onCheckPhoneDuplicate,
  onAddSingleLead,
  onImportBulkLeads,
  onRecordDuplicateAttempt,
}: DataCollectionViewProps) {
  const [activeMode, setActiveMode] = useState<'single' | 'bulk'>('single');
  const [customerName, setCustomerName] = useState('');
  const [rawPhone, setRawPhone] = useState('');
  const [facebookLink, setFacebookLink] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [importingCsv, setImportingCsv] = useState(false);
  const [duplicateModal, setDuplicateModal] = useState<{
    matchedBy: 'phone' | 'facebook';
    existingLead: Lead;
  } | null>(null);
  const [sheetDuplicate, setSheetDuplicate] = useState<{
    matchedBy: 'phone' | 'facebook';
    lead: Lead;
  } | null>(null);
  const [phoneCheck, setPhoneCheck] = useState<{
    status: 'idle' | 'checking' | 'available' | 'duplicate' | 'error';
    phone: string;
    message?: string;
  }>({ status: 'idle', phone: '' });
  const phoneCheckReqRef = useRef(0);
  const inFlightPhoneRef = useRef('');
  const recordedDupPhoneRef = useRef('');
  const submitBtnRef = useRef<HTMLButtonElement>(null);

  // Bulk CSV state
  const [csvFileName, setCsvFileName] = useState('');
  const [csvPreview, setCsvPreview] = useState<CsvPreviewRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Real-time normalization & duplicate detection
  const normalizedPhone = useMemo(() => normalizeBdPhone(rawPhone), [rawPhone]);
  const liveDuplicate = useMemo(() => {
    if (!rawPhone.trim() && !facebookLink.trim()) return null;
    return findDuplicateLead(allLeads, rawPhone, facebookLink);
  }, [allLeads, rawPhone, facebookLink]);
  const activeDuplicate = liveDuplicate ?? sheetDuplicate;

  const todayStr = getLocalDateString();

  // Strictly display ONLY leads collected Today (YYYY-MM-DD) for all roles (Collectors & Admin)
  const mySubmissions = useMemo(() => {
    const todayLeads = filterTodayLeads(allLeads);
    const list =
      currentUser.role === 'admin'
        ? todayLeads
        : todayLeads.filter((l) => l.collectorId === currentUser.id);
    return [...list].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [allLeads, currentUser]);

  const myDuplicates = useMemo(() => {
    const todayDups = filterTodayDuplicateAttempts(duplicateAttempts);
    const list =
      currentUser.role === 'admin'
        ? todayDups
        : todayDups.filter((d) => d.collectorId === currentUser.id);
    return [...list].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [duplicateAttempts, currentUser]);

  const flagDuplicateFound = (
    dup: { matchedBy: 'phone' | 'facebook'; lead: Lead },
    checkedPhone: string
  ) => {
    setSheetDuplicate(dup);
    setPhoneCheck({
      status: 'duplicate',
      phone: checkedPhone,
      message: `Duplicate found — already registered to ${dup.lead.customerName}.`,
    });
    if (recordedDupPhoneRef.current !== checkedPhone) {
      recordedDupPhoneRef.current = checkedPhone;
      onRecordDuplicateAttempt({
        collectorId: currentUser.id,
        collectorName: currentUser.name,
        attemptedName: customerName.trim(),
        attemptedPhone: rawPhone.trim(),
        attemptedFacebook: facebookLink.trim(),
        matchedBy: dup.matchedBy,
        existingCollectorName: dup.lead.collectorName,
        existingDate: dup.lead.createdAt,
      });
    }
    setDuplicateModal({
      matchedBy: dup.matchedBy,
      existingLead: dup.lead,
    });
    setFormError(
      `Duplicate Found: ${dup.lead.customerName} · Agent: ${
        dup.lead.assignedAgentName ?? 'Unassigned'
      } · Status: ${dup.lead.status} · Collector: ${
        dup.lead.collectorName
      } (${formatShortDate(dup.lead.createdAt)})`
    );
  };

  const runEarlyPhoneCheck = async (trigger: 'blur' | 'button') => {
    const targetPhone = normalizeBdPhone(rawPhone);
    if (!targetPhone) {
      if (trigger === 'button') {
        setPhoneCheck({
          status: 'error',
          phone: rawPhone.trim(),
          message:
            'Enter a valid Bangladeshi phone number (e.g. 01712345678) before checking.',
        });
      }
      return;
    }

    if (inFlightPhoneRef.current === targetPhone) {
      return;
    }

    if (
      trigger === 'blur' &&
      phoneCheck.phone === targetPhone &&
      phoneCheck.status !== 'idle'
    ) {
      return;
    }

    if (
      trigger === 'button' &&
      phoneCheck.phone === targetPhone &&
      phoneCheck.status === 'duplicate' &&
      activeDuplicate
    ) {
      setDuplicateModal({
        matchedBy: activeDuplicate.matchedBy,
        existingLead: activeDuplicate.lead,
      });
      return;
    }

    const localPhoneDup = findDuplicateLead(allLeads, targetPhone, '');
    if (localPhoneDup) {
      flagDuplicateFound(localPhoneDup, targetPhone);
      return;
    }

    if (!onCheckPhoneDuplicate) {
      return;
    }

    const reqId = ++phoneCheckReqRef.current;
    inFlightPhoneRef.current = targetPhone;
    setPhoneCheck({
      status: 'checking',
      phone: targetPhone,
      message: 'Checking Sheet...',
    });

    try {
      const res = await onCheckPhoneDuplicate(rawPhone);
      if (phoneCheckReqRef.current !== reqId) return;

      if (!res.ok) {
        setPhoneCheck({
          status: 'error',
          phone: targetPhone,
          message:
            res.error ??
            'Could not verify number with Google Sheets. Number was not marked available.',
        });
        return;
      }

      if (res.isDuplicate && res.duplicate) {
        flagDuplicateFound(res.duplicate, targetPhone);
        return;
      }

      setSheetDuplicate(null);
      setPhoneCheck({
        status: 'available',
        phone: targetPhone,
        message: 'Available — Not a duplicate in Sheet',
      });
    } catch (err) {
      if (phoneCheckReqRef.current !== reqId) return;
      setPhoneCheck({
        status: 'error',
        phone: targetPhone,
        message:
          err instanceof Error && err.message
            ? err.message
            : 'Could not verify number with Google Sheets.',
      });
    } finally {
      if (inFlightPhoneRef.current === targetPhone) {
        inFlightPhoneRef.current = '';
      }
    }
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    phoneCheckReqRef.current += 1;
    inFlightPhoneRef.current = '';
    setFormError('');

    if (!customerName.trim()) {
      setFormError('Customer Name is required.');
      return;
    }

    if (!normalizedPhone) {
      setFormError(
        'Enter a valid Bangladeshi phone number (e.g. 01712345678, 8801712345678, or +8801712345678).'
      );
      return;
    }

    if (activeDuplicate) {
      onRecordDuplicateAttempt({
        collectorId: currentUser.id,
        collectorName: currentUser.name,
        attemptedName: customerName.trim(),
        attemptedPhone: rawPhone.trim(),
        attemptedFacebook: facebookLink.trim(),
        matchedBy: activeDuplicate.matchedBy,
        existingCollectorName: activeDuplicate.lead.collectorName,
        existingDate: activeDuplicate.lead.createdAt,
      });
      setDuplicateModal({
        matchedBy: activeDuplicate.matchedBy,
        existingLead: activeDuplicate.lead,
      });
      setFormError(
        `Duplicate Found: ${activeDuplicate.lead.customerName} · Agent: ${
          activeDuplicate.lead.assignedAgentName ?? 'Unassigned'
        } · Status: ${activeDuplicate.lead.status} · Collector: ${
          activeDuplicate.lead.collectorName
        } (${formatShortDate(activeDuplicate.lead.createdAt)})`
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await onAddSingleLead({
        customerName: customerName.trim(),
        rawPhone: rawPhone.trim(),
        facebookLink: facebookLink.trim(),
        notes: notes.trim(),
      });

      if (!res.ok) {
        if (res.duplicate) {
          setSheetDuplicate(res.duplicate);
          setDuplicateModal({
            matchedBy: res.duplicate.matchedBy,
            existingLead: res.duplicate.lead,
          });
        }
        setFormError(res.error ?? 'Could not add lead.');
        return;
      }

      phoneCheckReqRef.current += 1;
      inFlightPhoneRef.current = '';
      recordedDupPhoneRef.current = '';
      setPhoneCheck({ status: 'idle', phone: '' });
      setSheetDuplicate(null);
      setCustomerName('');
      setRawPhone('');
      setFacebookLink('');
      setNotes('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = String(ev.target?.result ?? '');
      const parsed = parseCsvLeads(content, allLeads);
      setCsvPreview(parsed);
    };
    reader.readAsText(file);
  };

  const handleDownloadSampleCsv = () => {
    const sample = [
      'Name,Phone,Facebook_Link',
      'Customer Name 1,+8801700000001,https://facebook.com/example.profile1',
      'Customer Name 2,01800000002,https://facebook.com/example.profile2',
    ].join('\n');
    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'runbd_sample_leads.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const validCsvRows = useMemo(
    () => csvPreview.filter((r) => r.status === 'valid'),
    [csvPreview]
  );
  const dupCsvCount = useMemo(
    () => csvPreview.filter((r) => r.status === 'duplicate').length,
    [csvPreview]
  );
  const invalidCsvCount = useMemo(
    () => csvPreview.filter((r) => r.status === 'invalid').length,
    [csvPreview]
  );

  const handleConfirmImport = async () => {
    if (validCsvRows.length === 0 || importingCsv) return;
    setImportingCsv(true);
    try {
      await onImportBulkLeads(validCsvRows);
      setCsvPreview([]);
      setCsvFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
      setImportingCsv(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Mode Switch */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Data Collection Workspace
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time BD phone normalization, duplicate blocking, and{' '}
            {autoAssignEnabled ? 'Round-Robin auto-assignment' : 'manual queue staging'}.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Lead entry mode"
          className="inline-flex p-1 rounded-lg bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 self-start"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeMode === 'single'}
            onClick={() => setActiveMode('single')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              activeMode === 'single'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Single Lead Entry
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeMode === 'bulk'}
            onClick={() => setActiveMode('bulk')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              activeMode === 'bulk'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Bulk CSV Upload
          </button>
        </div>
      </div>

      {/* Today-only Collector Stats (Historical rows remain in Google Sheets) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="glass-panel rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Collected Today ({todayStr})
            </p>
            <p
              data-testid="collector-today-count"
              className="mt-1 text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400"
            >
              {mySubmissions.length}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Resets to 0 daily &middot; Live Sheet duplicate check active on submit
            </p>
          </div>
        </div>
        <div className="glass-panel rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Blocked Duplicates Today
            </p>
            <p
              data-testid="collector-dup-today-count"
              className="mt-1 text-2xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400"
            >
              {myDuplicates.length}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Checked directly against full Google Sheets Master_Data
            </p>
          </div>
        </div>
      </div>

      {/* Entry Form or Bulk CSV */}
      {activeMode === 'single' ? (
        <section className="glass-panel rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Add New Customer Lead
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Auto-Assign:{' '}
              <strong className={autoAssignEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                {autoAssignEnabled ? 'Round-Robin ON' : 'Manual Queue'}
              </strong>
            </span>
          </div>

          {activeDuplicate && (
            <div
              role="alert"
              data-testid="duplicate-warning-banner"
              className="mt-4 flex items-start gap-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/40 px-4 py-3 text-amber-900 dark:text-amber-200"
            >
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-sm space-y-1">
                <p className="font-semibold">
                  Duplicate Found ({activeDuplicate.matchedBy === 'phone' ? 'Phone Number' : 'Facebook Link'}): Submission Blocked
                </p>
                <p className="text-xs text-amber-800/90 dark:text-amber-200/90">
                  Customer: <strong>{activeDuplicate.lead.customerName}</strong> · Assigned Agent:{' '}
                  <strong>{activeDuplicate.lead.assignedAgentName ?? 'Unassigned'}</strong> · Status:{' '}
                  <strong>{activeDuplicate.lead.status}</strong> · Collector:{' '}
                  <strong>{activeDuplicate.lead.collectorName}</strong> ({formatShortDate(activeDuplicate.lead.createdAt)})
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleSingleSubmit} className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4" noValidate>
            <div>
              <label
                htmlFor="lead-name"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Customer Name *
              </label>
              <input
                id="lead-name"
                type="text"
                placeholder="e.g. ShiMul"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="lead-phone"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Phone Number (BD) *
                </label>
                {rawPhone.trim() && (
                  <span
                    className={`text-[11px] font-mono ${
                      normalizedPhone
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {normalizedPhone ? `Normalized: ${normalizedPhone}` : 'Invalid BD format'}
                  </span>
                )}
              </div>
              <div className="flex flex-col sm:flex-row sm:items-stretch gap-2">
                <input
                  id="lead-phone"
                  type="tel"
                  placeholder="+8801712345678 or 01712345678"
                  value={rawPhone}
                  onChange={(e) => {
                    phoneCheckReqRef.current += 1;
                    inFlightPhoneRef.current = '';
                    recordedDupPhoneRef.current = '';
                    setRawPhone(e.target.value);
                    setSheetDuplicate(null);
                    setPhoneCheck({ status: 'idle', phone: '' });
                    setFormError('');
                  }}
                  onBlur={(e) => {
                    if (e.relatedTarget === submitBtnRef.current) return;
                    void runEarlyPhoneCheck('blur');
                  }}
                  className="min-w-0 flex-1 px-3.5 py-2.5 text-sm font-mono rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                />
                <button
                  type="button"
                  data-testid="check-phone-button"
                  disabled={phoneCheck.status === 'checking' || submitting}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void runEarlyPhoneCheck('button')}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 cursor-pointer"
                >
                  {phoneCheck.status === 'checking' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600 dark:text-emerald-400" />
                      <span>Checking Sheet...</span>
                    </>
                  ) : (
                    <>
                      <Search className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                      <span>Check Number</span>
                    </>
                  )}
                </button>
              </div>

              {phoneCheck.status === 'checking' && (
                <p
                  data-testid="phone-check-loading"
                  className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300"
                >
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Checking Sheet for existing leads...</span>
                </p>
              )}

              {phoneCheck.status === 'available' && !activeDuplicate && (
                <p
                  data-testid="phone-check-available"
                  className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{phoneCheck.message ?? 'Available — Not a duplicate in Sheet'}</span>
                </p>
              )}

              {phoneCheck.status === 'error' && (
                <p
                  role="alert"
                  data-testid="phone-check-error"
                  className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400"
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{phoneCheck.message}</span>
                </p>
              )}

              {phoneCheck.status === 'duplicate' && activeDuplicate && (
                <p
                  data-testid="phone-check-duplicate"
                  className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400"
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    Duplicate found in Sheet/database ({activeDuplicate.lead.customerName}) — submission blocked.
                  </span>
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="lead-facebook"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Facebook Profile / Page Link
              </label>
              <input
                id="lead-facebook"
                type="url"
                placeholder="https://facebook.com/username"
                value={facebookLink}
                onChange={(e) => {
                  setFacebookLink(e.target.value);
                  setSheetDuplicate((prev) =>
                    prev?.matchedBy === 'facebook' ? null : prev
                  );
                  setFormError('');
                }}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
              />
            </div>

            <div>
              <label
                htmlFor="lead-notes"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Optional Notes
              </label>
              <input
                id="lead-notes"
                type="text"
                placeholder="Campaign source, product inquiry, or city..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
              />
            </div>

            {formError && !activeDuplicate && (
              <div
                role="alert"
                data-testid="lead-form-error"
                className="md:col-span-2 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300"
              >
                {formError}
              </div>
            )}

            <div className="md:col-span-2 flex items-center justify-end pt-2">
              <button
                ref={submitBtnRef}
                type="submit"
                disabled={submitting}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-semibold transition-colors disabled:opacity-60 cursor-pointer ${
                  activeDuplicate
                    ? 'bg-amber-600 hover:bg-amber-500'
                    : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                <PlusCircle className="w-4 h-4" />
                <span>
                  {submitting
                    ? 'Checking Google Sheets...'
                    : activeDuplicate
                    ? 'Submission Blocked (Duplicate)'
                    : 'Submit Lead'}
                </span>
              </button>
            </div>
          </form>
        </section>
      ) : (
        <section className="glass-panel rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Bulk CSV Lead Upload
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Upload a <code className="font-mono">.csv</code> file with columns:{' '}
                <code className="font-mono">Name, Phone, Facebook_Link</code>
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownloadSampleCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors self-start cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Sample CSV</span>
            </button>
          </div>

          <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-6 text-center bg-slate-50/50 dark:bg-slate-950/40">
            <FileUp className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {csvFileName ? `Loaded: ${csvFileName}` : 'Choose a CSV file to validate and preview'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Every row is normalized and checked live against Google Sheets Master_Data before import.
            </p>
            <input
              ref={fileInputRef}
              id="csv-upload-input"
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="sr-only"
            />
            <label
              htmlFor="csv-upload-input"
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Select CSV File</span>
            </label>
          </div>

          {csvPreview.length > 0 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-4 text-xs font-medium">
                  <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">
                    Valid: <strong>{validCsvRows.length}</strong>
                  </span>
                  <span className="text-amber-600 dark:text-amber-400 tabular-nums">
                    Duplicates: <strong>{dupCsvCount}</strong>
                  </span>
                  <span className="text-rose-600 dark:text-rose-400 tabular-nums">
                    Invalid: <strong>{invalidCsvCount}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  disabled={validCsvRows.length === 0 || importingCsv}
                  onClick={handleConfirmImport}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {importingCsv
                      ? 'Checking Sheets & Importing...'
                      : `Import ${validCsvRows.length} Valid Lead${validCsvRows.length === 1 ? '' : 's'}`}
                  </span>
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100/80 dark:bg-slate-900/90 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                      <th className="py-2.5 px-3 font-semibold">Row</th>
                      <th className="py-2.5 px-3 font-semibold">Customer Name</th>
                      <th className="py-2.5 px-3 font-semibold">Normalized Phone</th>
                      <th className="py-2.5 px-3 font-semibold">Validation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {csvPreview.map((row) => (
                      <tr key={row.rowNumber} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 font-mono tabular-nums text-slate-500">
                          #{row.rowNumber}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-slate-100">
                          {row.customerName || '—'}
                        </td>
                        <td className="py-2.5 px-3 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {row.normalizedPhone ?? row.rawPhone ?? '—'}
                        </td>
                        <td className="py-2.5 px-3">
                          {row.status === 'valid' ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              Ready to import
                            </span>
                          ) : row.status === 'duplicate' ? (
                            <span className="text-amber-600 dark:text-amber-400 font-medium">
                              {row.reason}
                            </span>
                          ) : (
                            <span className="text-rose-600 dark:text-rose-400 font-medium">
                              {row.reason}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Submission History & Duplicate Alerts Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Submission History */}
        <section className="xl:col-span-2 glass-panel rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {currentUser.role === 'admin'
                  ? "Today's Collected Leads (All Collectors)"
                  : "My Today's Submissions"}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                {mySubmissions.length} valid lead{mySubmissions.length === 1 ? '' : 's'} recorded today ({todayStr})
              </p>
            </div>
          </div>

          {mySubmissions.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No leads submitted today ({todayStr}) yet. Use the form above to add a lead.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <th className="py-3 px-4 font-semibold">Customer</th>
                    <th className="py-3 px-4 font-semibold">Phone</th>
                    <th className="py-3 px-4 font-semibold">Assigned Agent</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold">Added</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {mySubmissions.slice(0, 15).map((lead) => (
                    <tr
                      key={lead.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {lead.customerName}
                        </div>
                        {lead.facebookLink && (
                          <a
                            href={
                              lead.facebookLink.startsWith('http')
                                ? lead.facebookLink
                                : `https://${lead.facebookLink}`
                            }
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400 hover:underline mt-0.5"
                          >
                            <span>Facebook Profile</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {formatBdPhoneDisplay(lead.phone)}
                          </span>
                          <button
                            type="button"
                            onClick={() => openWhatsAppChat(lead.phone)}
                            aria-label={`WhatsApp ${lead.customerName}`}
                            className="p-1 rounded bg-slate-200/80 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white transition-colors cursor-pointer"
                          >
                            <MessageCircle className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {lead.assignedAgentName ?? (
                          <span className="text-slate-400">Unassigned</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={lead.status} compact />
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                        {formatShortDate(lead.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Duplicate Alerts Log */}
        <section className="glass-panel rounded-2xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Duplicate Alerts
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                {myDuplicates.length} blocked submission{myDuplicates.length === 1 ? '' : 's'}
              </p>
            </div>
            <ShieldAlert className="w-4 h-4 text-amber-500" />
          </div>

          {myDuplicates.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
              No duplicate attempts blocked yet.
            </div>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[420px] overflow-y-auto">
              {myDuplicates.map((dup) => (
                <li key={dup.id} className="p-4 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {dup.attemptedName || 'Unnamed Entry'}
                    </span>
                    <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 whitespace-nowrap">
                      {dup.matchedBy === 'phone' ? 'Phone Match' : 'FB Match'}
                    </span>
                  </div>
                  <p className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    {dup.attemptedPhone}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Originally added by <strong>{dup.existingCollectorName}</strong> on{' '}
                    {formatShortDate(dup.existingDate)}
                  </p>
                  <p className="text-[11px] text-slate-400 tabular-nums">
                    Blocked {formatDateTime(dup.timestamp)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Prominent Duplicate Blocked Error Modal */}
      {duplicateModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="duplicate-blocked-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-500/40 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-rose-50 dark:bg-rose-500/10 border-b border-rose-200 dark:border-rose-500/30 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
                <h3
                  id="duplicate-blocked-modal-title"
                  className="text-base font-bold text-rose-900 dark:text-rose-200"
                >
                  Duplicate Lead Blocked
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDuplicateModal(null)}
                aria-label="Close duplicate warning modal"
                className="p-1 rounded-lg text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-500/20 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm">
              <p className="text-slate-700 dark:text-slate-200 leading-relaxed">
                This lead cannot be submitted because a matching{' '}
                <strong>
                  {duplicateModal.matchedBy === 'phone' ? 'Phone Number' : 'Facebook Link'}
                </strong>{' '}
                already exists in the RunBD database.
              </p>

              <div className="rounded-xl p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Customer Name</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {duplicateModal.existingLead.customerName}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Assigned Agent</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {duplicateModal.existingLead.assignedAgentName ?? 'Unassigned'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Status</span>
                  <StatusBadge status={duplicateModal.existingLead.status} compact />
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Collector</span>
                  <span className="font-semibold text-amber-700 dark:text-amber-300">
                    {duplicateModal.existingLead.collectorName}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Normalized Phone</span>
                  <span className="font-mono text-slate-900 dark:text-slate-100">
                    {formatBdPhoneDisplay(duplicateModal.existingLead.phone)}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Added On</span>
                  <span className="font-mono text-slate-900 dark:text-slate-100">
                    {formatDateTime(duplicateModal.existingLead.createdAt)}
                  </span>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setDuplicateModal(null)}
                  className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Understood
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
