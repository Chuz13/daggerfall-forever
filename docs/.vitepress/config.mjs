import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Daggerfall Forever',
  description: 'Official Wiki and Guides for Daggerfall Forever',
  base: '/daggerfall-forever/',
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Modding Manual', link: '/MODDING_MANUAL' }
    ],
    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Welcome', link: '/' },
          { text: 'Modding Manual', link: '/MODDING_MANUAL' }
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
      message: 'Released under open-source license.',
      copyright: 'Copyright © Daggerfall Forever Team'
    }
  }
})

