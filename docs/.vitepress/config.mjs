import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Daggerfall Forever',
  description: 'Official Documentation & Guides for Daggerfall Forever',
  base: '/daggerfall-forever/',
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Apotheosis', link: '/apotheosis/' },
      { text: 'Living Tamriel', link: '/living-tamriel/' },
      { text: 'Necromancy', link: '/necromancy/' },
      { text: 'Races', link: '/racial-overhaul/' },
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
        text: 'Apotheosis: Path of CHIM',
        items: [
          { text: 'Overview, Fate Weight & Ascension', link: '/apotheosis/' },
          { text: 'Faith, Portfolios & Scroll of Aurbis', link: '/apotheosis/faith-and-aurbis' },
          { text: 'Pantheon 4X, Cults, Shrines & Wars', link: '/apotheosis/pantheon-cult-wars' }
        ]
      },
      {
        text: 'Gameplay Systems',
        items: [
          { text: 'Living Tamriel', link: '/living-tamriel/' },
          { text: 'Necromancy & Lichdom', link: '/necromancy/' },
          { text: 'Racial Overhaul', link: '/racial-overhaul/' }
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
      { icon: 'github', link: 'https://github.com/Chuz13/daggerfall-forever' },
      { icon: 'discord', link: 'https://discord.gg/HVGrJFmYa' }
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
