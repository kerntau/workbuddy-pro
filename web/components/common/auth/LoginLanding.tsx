'use client';

import {useEffect, useRef, useState} from 'react';
import {useRouter} from 'next/navigation';
import Image from 'next/image';
import {motion} from 'motion/react';
import {Loader2, LogIn} from 'lucide-react';
import {errText} from '@/lib/api';
import {withBasePath} from '@/lib/base-path';
import {useAuth} from '@/lib/auth-context';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/animate-ui/radix/dialog';
import {LanguageToggle} from '@/components/common/layout/LanguageToggle';
import {useT} from '@/lib/i18n/provider';

export default function LoginLanding() {
  const {me, loading, login} = useAuth();
  const router = useRouter();
  const t = useT();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const logoClicks = useRef(0);
  const logoButton = useRef<HTMLButtonElement>(null);
  // 会话过期跳转（`api.ts` 的 401 拦截器会带 `?expired=1`）。读
  // `window.location.search` 而不是 `useSearchParams`：静态导出下后者必须包一层
  // Suspense，为一行提示不值得改整页结构。
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!loading && me) router.replace('/dashboard');
  }, [loading, me, router]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setExpired(new URLSearchParams(window.location.search).get('expired') === '1');
  }, []);

  function handleLogoClick() {
    logoClicks.current += 1;
    if (logoClicks.current === 10) {
      logoClicks.current = 0;
      setLoginOpen(true);
    }
  }

  function handleLoginOpenChange(open: boolean) {
    setLoginOpen(open);
    if (!open) {
      logoClicks.current = 0;
      setPassword('');
      setError('');
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError('');

    // 提交值以**表单元素的实际值**为准，而不是 React state。
    //
    // 为什么必须这样：浏览器自动填充是**直接改写 DOM 的 value、不派发 `input`
    // 事件**，而受控组件的 `onChange` 依赖 `input` 事件——于是 state 始终是空串，
    // 提交出去的就是空密码。界面显示有值（来自 DOM）、服务端收到的却是空值，
    // 用户只看到「用户名或密码错误」，会以为是自己记错了密码，反复重试直到
    // 触发登录锁定（实测复现：DOM 里 13 位密码，请求体是
    // `{"username":"","password":""}`）。
    //
    // 从 DOM 读值同时覆盖三种情况：手输（state 与 DOM 一致）、自动填充（只有
    // DOM 有值）、密码管理器注入——都不依赖事件是否派发。
    const form = e.currentTarget as HTMLFormElement;
    const domUser = (form.elements.namedItem('username') as HTMLInputElement | null)?.value ?? '';
    const domPass = (form.elements.namedItem('password') as HTMLInputElement | null)?.value ?? '';
    const finalUser = (domUser || username).trim();
    const finalPass = domPass || password;

    // 读不到值：给一条**指向真正原因**的提示。落到后端只会得到
    // 「用户名或密码错误」，把「填充没被识别」误报成「密码错」，用户无从下手。
    if (!finalUser || !finalPass) {
      setError(t('login.emptySubmit'));
      return;
    }

    setBusy(true);
    try {
      await login(finalUser, finalPass);
      router.replace('/dashboard');
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-background relative flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      {/* 未登录也要能换语言：看不懂当前语言的人得先能切过去 */}
      <div className="absolute right-4 top-4">
        <LanguageToggle />
      </div>
      <motion.div
        initial={{opacity: 0, y: 12}}
        animate={{opacity: 1, y: 0}}
        transition={{duration: 0.35}}
        className="w-full max-w-sm"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <button
            ref={logoButton}
            type="button"
            onClick={handleLogoClick}
            aria-label="Workbuddy Pro"
            className="rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4"
          >
            <Image
              src={withBasePath('/liora-icon.png')}
              alt="Workbuddy Pro"
              width={56}
              height={56}
              priority
              draggable={false}
              className="h-14 w-14 select-none object-contain"
            />
          </button>
          <div className="space-y-1">
            <h1 className="text-lg font-semibold tracking-[-0.01em]">Workbuddy Pro</h1>
            <p className="text-xs text-muted-foreground">
              {t('login.subtitle')}
            </p>
          </div>
        </div>

        <Dialog open={loginOpen} onOpenChange={handleLoginOpenChange}>
          <DialogContent
            className="max-w-[380px]"
            showCloseButton={false}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              logoButton.current?.focus();
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('login.submit')}</DialogTitle>
              <DialogDescription>{t('login.subtitle')}</DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="flex min-h-0 flex-col">
              <DialogBody className="max-h-[min(400px,calc(100dvh-14rem))]">
                <div className="space-y-4 px-6 pb-2 pt-1">
                  <div className="space-y-1.5">
                    <Label htmlFor="username" className="text-[11px] text-muted-foreground">
                      {t('login.username')}
                    </Label>
                    <Input
                      id="username"
                      name="username"
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="admin"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-[11px] text-muted-foreground">
                      {t('login.password')}
                    </Label>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t('login.passwordPlaceholder')}
                    />
                  </div>

                  {expired && !error && (
                    <p className="text-xs text-amber-600 dark:text-amber-500">{t('login.expiredHint')}</p>
                  )}

                  {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

                  {/* 登录失败时提示初始密码文件的位置，帮助用户取回密码。 */}
                  {error && (
                    <p className="text-xs text-muted-foreground">{t('login.initialPwdHint')}</p>
                  )}
                </div>
              </DialogBody>
              <DialogFooter>
                <Button type="submit" disabled={busy} className="w-full rounded-full">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                  {t('login.submit')}
                </Button>
              </DialogFooter>
            </form>

            <p className="px-6 pb-5 text-center text-[11px] leading-relaxed text-muted-foreground">
              {t('login.legal')}
            </p>
          </DialogContent>
        </Dialog>
      </motion.div>
    </div>
  );
}
