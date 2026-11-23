import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { getCopyablePhoneNumber } from '../utils/leadLogic';

interface CopyPhoneButtonProps {
  phone: string;
  customerName?: string;
  onCopied?: (cleanPhone: string) => void;
  showLabel?: boolean;
  className?: string;
}

async function writePhoneToClipboard(text: string): Promise<boolean> {
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand fallback
    }
  }
  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch {
      document.body.removeChild(textarea);
      return false;
    }
  }
  return false;
}

export function CopyPhoneButton({
  phone,
  customerName,
  onCopied,
  showLabel = false,
  className = '',
}: CopyPhoneButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const cleanPhone = getCopyablePhoneNumber(phone);
  if (!cleanPhone) return null;

  const handleCopy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const ok = await writePhoneToClipboard(cleanPhone);
    if (!ok) return;

    setCopied(true);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setCopied(false);
    }, 1800);

    onCopied?.(cleanPhone);
  };

  const labelTarget = customerName ? `Copy phone number for ${customerName}` : `Copy ${cleanPhone}`;

  return (
    <button
      type="button"
      onClick={(e) => void handleCopy(e)}
      onMouseDown={(e) => e.stopPropagation()}
      aria-label={copied ? `Copied ${cleanPhone}` : labelTarget}
      title={copied ? 'Copied!' : `Copy ${cleanPhone}`}
      data-testid="copy-phone-btn"
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px] font-medium transition-colors shrink-0 cursor-pointer ${
        copied
          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
          : 'border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
      } ${className}`}
    >
      {copied ? (
        <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
      ) : (
        <Copy className="w-3 h-3 shrink-0" />
      )}
      {showLabel && <span>{copied ? 'Copied' : 'Copy'}</span>}
    </button>
  );
}
