// Random Wikipedia starting articles (good variety, not too obscure)
const STARTING_ARTICLES = [
  '/wiki/Capybara',
  '/wiki/Pizza',
  '/wiki/Solar_System',
  '/wiki/Mount_Everest',
  '/wiki/Leonardo_da_Vinci',
  '/wiki/Olympic_Games',
  '/wiki/Bitcoin',
  '/wiki/Dinosaur',
  '/wiki/Coffee',
  '/wiki/Jazz',
  '/wiki/Amazon_rainforest',
  '/wiki/Albert_Einstein',
  '/wiki/Chocolate',
  '/wiki/Moon',
  '/wiki/Video_game',
]

// Target is always Philosophy (classic Wikipedia game)
export const TARGET_ARTICLE = 'Philosophy'

export function getRandomStartArticle(): string {
  return STARTING_ARTICLES[Math.floor(Math.random() * STARTING_ARTICLES.length)]
}

export function extractArticleTitle(url: string): string | null {
  // Extract title from URL like "/wiki/Some_Article" or full URL
  const match = url.match(/\/wiki\/([^#?]+)/)
  if (match) {
    return decodeURIComponent(match[1].replace(/_/g, ' '))
  }
  return null
}
