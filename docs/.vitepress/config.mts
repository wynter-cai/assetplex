import { defineConfig } from 'vitepress';

export default defineConfig({
  lang: 'en-US',
  title: 'AssetPlex',
  description:
    'Sync your identity, skills, rules & MCP servers across Claude Code, Codex, TRAE, WorkBuddy and Qoder. One hub, every AI agent. 100% local.',
  base: '/assetplex/',
  head: [
    [
      'meta',
      {
        name: 'keywords',
        content:
          'AI skills sync, MCP unified management, claude code skills sync, sync skills between AI coding tools, share MCP servers across tools, centralize AI agent config',
      },
    ],
    ['meta', { property: 'og:title', content: 'AssetPlex — One hub, every AI agent' }],
    [
      'meta',
      {
        property: 'og:description',
        content:
          'Sync your identity, skills, rules & MCP servers across Claude Code, Codex, TRAE, WorkBuddy and Qoder. 100% local.',
      },
    ],
  ],
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Privacy', link: '/data-and-privacy' },
      { text: 'FAQ', link: '/faq' },
      { text: 'GitHub', link: 'https://github.com/wynter-cai/assetplex' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'Supported Tools', link: '/guide/tools' },
        ],
      },
      { text: 'Data & Privacy', link: '/data-and-privacy' },
      { text: 'FAQ', link: '/faq' },
    ],
    footer: {
      message: 'Released under the MIT License.',
      copyright: '© 2026 Wynter-Cai',
    },
  },
});
