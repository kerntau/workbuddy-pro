import type {Metadata} from 'next';
import {withBasePath} from '@/lib/base-path';

export {default} from '@/components/common/auth/LoginLanding';

// 根路径是一张「站点维护中」的静态页，静态 HTML 里的 title / description 也必须
// 跟着变：Next 的静态导出会把 layout 的 metadata 写进 HTML，扫描器读一眼 <title>
// 就能认出这是哪个面板，伪装页本身就没意义了。
// title 用 absolute 绕过 layout 的「%s - Workbuddy Pro」模板，否则会拼上真名。
export const metadata: Metadata = {
  title: {absolute: '系统维护中'},
  description: '本站正在进行例行维护，稍后恢复访问。',
  // 维护页没有索引价值，顺带别让它出现在搜索结果里
  robots: {index: false, follow: false},
  // 图标也换成中性齿轮：默认图标是面板自己的，浏览器标签上直接暴露身份
  icons: {
    icon: [{url: withBasePath('/favicon/status.svg'), type: 'image/svg+xml'}],
  },
};
