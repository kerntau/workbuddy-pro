'use client';

import {useEffect, useRef, useState} from 'react';
import {copyText} from '@/lib/format';
import {useT} from '@/lib/i18n/provider';
import {notify} from '@/lib/toast';

/** Click the identifier itself to copy; no repeated copy icon in every row. */
export function AccountUid({uid}: {uid: string}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    const ok = await copyText(uid).catch(() => false);
    if (!ok) {
      notify.err(t('common.copyFailed'), t('common.manualCopy'));
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    setCopied(true);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      aria-label={t('accounts.copyUid')}
      title={`${uid} · ${t('accounts.copyUid')}`}
      disabled={!uid}
      onClick={copy}
      className={`rounded-sm text-left font-mono text-[11px] transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-1 ${copied ? 'text-emerald-500' : 'text-muted-foreground'}`}
    >
      {copied ? t('common.copied') : uid.length > 16 ? `${uid.slice(0, 8)}…${uid.slice(-4)}` : uid}
    </button>
  );
}
