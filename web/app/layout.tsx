import type {Metadata} from 'next';
import {Toaster} from '@/components/ui/sonner';
import {ThemeProvider} from '@/components/common/layout/ThemeProvider';
import {AuthProvider} from '@/lib/auth-context';
import {I18nProvider} from '@/lib/i18n/provider';
import {withBasePath} from '@/lib/base-path';
import './globals.css';

// 字体策略：**暂时改为系统字体栈**（globals.css 的 font-sans）。
//
// 原文用的是 next/font/google 在构建期下载并自托管 Inter / Noto Sans SC；但
// Turbopack 会在编译期访问 fonts.gstatic.com，本机网络拿不到时 `next dev`
// 直接 500 —— 表现为「整站打不开」，与业务代码无关，排查很费时（实测连续
// 三次 500，日志里是 Can't resolve '@vercel/turbopack-next/internal/font/google/font'）。
//
// 因此这里去掉 next/font，开发与生产统一走系统字体，断网也能渲染。
// **发布前若要保持原来的自托管字体与排版观感**（中文 Noto Sans SC 与系统
// 字体的字形、字宽略有差异），把这几行加回来即可：
//
//   import {Inter, Noto_Sans_SC} from 'next/font/google';
//   const inter = Inter({variable: '--font-inter', subsets: ['latin'], display: 'swap'});
//   const notoSansSC = Noto_Sans_SC({variable: '--font-noto-sans-sc', subsets: ['latin'],
//                                    display: 'swap', weight: ['300','400','500','600','700']});
//
// 然后把 html / body 的 className 换回 `${inter.variable} ${notoSansSC.variable}`。

export const metadata: Metadata = {
  title: {
    template: '%s - Workbuddy Pro',
    default: 'Workbuddy Pro',
  },
  /**
   * 站点描述用英文：它是构建期写进静态 HTML 的元数据，无法跟随运行时语言切换
   * （管理端本身不做语言路由，见 lib/i18n/config.ts 的说明）。选英文是因为
   * 分享卡片 / 搜索引擎抓取时它面向的受众最广；界面内的文案全部走 i18n。
   */
  description: 'Workbuddy Pro - Tencent CodeBuddy account pool console and OpenAI-compatible gateway',
  // 图标 / 清单的 URL 也要带部署前缀（PR #60 评审补漏）：Next 只给 `_next`
  // 静态资源与 next/link 跳转补 basePath，**不会**改写 metadata 里的这些字符串
  // ——实测子路径部署下产物里仍是 `href="/favicon/..."`，会被请求到域名根（通常是
  // 另一个站点）而 404，表现为「站点图标不见了、PWA 清单取不到」。根路径部署时
  // withBasePath 原样返回，行为不变。
  manifest: withBasePath('/favicon/site.webmanifest'),
  icons: {
    icon: [
      {url: withBasePath('/favicon/favicon-32x32.png') + '?v=liora', sizes: '32x32', type: 'image/png'},
      {url: withBasePath('/favicon/favicon-16x16.png') + '?v=liora', sizes: '16x16', type: 'image/png'},
    ],
    shortcut: withBasePath('/favicon/favicon.ico') + '?v=liora',
    apple: withBasePath('/favicon/apple-touch-icon.png') + '?v=liora',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="hide-scrollbar font-sans"
      suppressHydrationWarning
    >
      <body className="hide-scrollbar font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <I18nProvider>
            <AuthProvider>
              {children}
              <Toaster />
            </AuthProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
