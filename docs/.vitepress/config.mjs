import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Daggerfall Forever',
  description: 'Official Documentation & Guides for Daggerfall Forever',
  base: '/daggerfall-forever/',
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Living Tamriel', link: '/living-tamriel/' },
      { text: 'Necromancy', link: '/necromancy/' },
      { text: 'Features & Settings', link: '/features/global-changes' },
      { text: 'Modding', link: '/modding/' },
      { text: 'Console', link: '/reference/console-commands' }
    ],
    sidebar: [
      {
        text: 'Overview',
        items: [
          { text: 'Welcome & Project Overview', link: '/' }
        ]
      },
      {
        text: 'Gameplay Systems',
        items: [
          { text: 'Living Tamriel', link: '/living-tamriel/' },
          { text: 'Necromancy & Lichdom', link: '/necromancy/' }
        ]
      },
      {
        text: 'Features & Settings',
        items: [
          { text: 'Global Non-LT Changes', link: '/features/global-changes' },
          { text: 'Settings Outside DFF Tab', link: '/features/settings-reference' }
        ]
      },
      {
        text: 'Modding',
        items: [
          { text: 'Overview & Capabilities', link: '/modding/' },
          { text: 'How to Start Modding', link: '/modding/getting-started' },
          { text: 'Example Mods', link: '/modding/examples' }
        ]
      },
      {
        text: 'Reference',
        items: [
          { text: 'Console Commands', link: '/reference/console-commands' }
        ]
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/Chuz13/daggerfall-forever' }
    ],
    search: {
      provider: 'local'
    },
    footer: {
      message: 'Open-source, non-commercial fan project.',
      copyright: 'Daggerfall Forever'
    }
  }
})
