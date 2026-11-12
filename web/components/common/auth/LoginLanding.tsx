'use client';

import {useEffect, useRef, useState} from 'react';
import Image from 'next/image';
import {useRouter} from 'next/navigation';
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
import {useT} from '@/lib/i18n/provider';

/**
 * 根路径的伪装页：对外是一张「站点正在维护」的公告。
 *
 * 设计意图（别当成排版改掉）：
 * - 页面上**不能出现**面板名、账号池、网关、管理端这类字样，也不能放语言切换器
 *   —— 那些都是「这是个面板」的指纹，伪装就白做了。Logo 是自家图形，保留。
 * - 极简：只有 Logo、一句话、一行状态、一个出口。没有卡片、没有边框容器、
 *   没有进度条 —— 维护公告本来就不该抢注意力，信息越少越像真的。
 * - 不加动效：静态页在慢网络 / 低端设备上也不会跳动，且维护页不需要
 *   「正在进行」的暗示（那反而像在演）。
 * - 深浅色跟随系统（全部走主题变量，没有写死色值）。
 * - 登录入口藏在 Logo 上：连点 3 次才弹窗，4 秒内没继续点就归零 —— 访客不会
 *   闲着去连点一个 logo，顺手点歪也碰不到登录框。
 * - 弹窗内部与登录提交逻辑保持原样（含从 DOM 读值以兼容密码管理器自动填充）。
 */
export default function LoginLanding() {
  const {me, loading, login} = useAuth();
  const router = useRouter();
  const t = useT();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const secretClicks = useRef(0);
  const secretTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoRef = useRef<HTMLButtonElement>(null);
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

  useEffect(() => () => {
    if (secretTimer.current) clearTimeout(secretTimer.current);
  }, []);

  // 隐藏入口：Logo 连点 3 次。4 秒没有继续点就从头数。
  function handleSecretClick() {
    if (secretTimer.current) clearTimeout(secretTimer.current);
    secretClicks.current += 1;
    if (secretClicks.current >= 3) {
      secretClicks.current = 0;
      setLoginOpen(true);
      return;
    }
    secretTimer.current = setTimeout(() => {
      secretClicks.current = 0;
    }, 4000);
  }

  function handleLoginOpenChange(open: boolean) {
    setLoginOpen(open);
    if (!open) {
      secretClicks.current = 0;
      setPassword('');
      setError('');
      // 关闭后把焦点还给 Logo。原先靠 DialogContent 的 onCloseAutoFocus，
      // 但那个 prop 会被透传到 DOM 上（控制台报 Unknown event handler property），
      // 实际不生效 —— 这里显式还原，键盘用户才不会丢焦点。
      requestAnimationFrame(() => logoRef.current?.focus());
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
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-16 text-foreground">
      <main className="flex w-full max-w-[24rem] flex-col items-center text-center">
        {/* Logo 同时是隐藏入口：连点 3 次 */}
        <button
          ref={logoRef}
          type="button"
          onClick={handleSecretClick}
          aria-label="站点图标"
          className="rounded-xl outline-none transition-opacity duration-150 hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
        >
          <Image
            src={withBasePath('/liora-icon.png')}
            alt=""
            width={40}
            height={40}
            priority
            draggable={false}
            className="size-10 select-none object-contain"
          />
        </button>

        <h1 className="mt-8 text-balance text-2xl font-semibold sm:text-3xl">
          站点正在维护
        </h1>

        <p className="mt-3.5 text-pretty text-[13px] leading-6 text-muted-foreground">
          我们正在做例行升级，站点暂时不可用，已保存的数据不受影响。
        </p>

        <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-amber-500" />
          <span className="tabular-nums">维护进行中 · 预计 30 分钟内恢复</span>
        </p>

        <div className="mt-10 flex flex-col items-center gap-2.5">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md text-xs text-foreground/70 underline-offset-4 outline-none transition-colors duration-150 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            刷新页面
          </button>
          <p className="text-[11px] text-muted-foreground/70 tabular-nums">
            © 2026 · 服务维护公告
          </p>
        </div>
      </main>

      {/* 真实登录入口：默认关闭，只在连点 Logo 3 次后出现 */}
      <Dialog open={loginOpen} onOpenChange={handleLoginOpenChange}>
        <DialogContent className="max-w-[380px]" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="text-center">{t('login.submit')}</DialogTitle>
            <DialogDescription className="text-center">{t('login.subtitle')}</DialogDescription>
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
                {busy ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
                {t('login.submit')}
              </Button>
            </DialogFooter>
          </form>

          <p className="px-6 pb-5 text-center text-[11px] leading-relaxed text-muted-foreground">
            {t('login.legal')}
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
