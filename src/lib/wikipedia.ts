// Fetch a random Wikipedia article using the API
export async function getRandomArticle(): Promise<{ path: string; title: string }> {
  try {
    const res = await fetch(
      'https://en.wikipedia.org/api/rest_v1/page/random/summary'
    )
    const data = await res.json()
    return {
      path: `/wiki/${data.title.replace(/ /g, '_')}`,
      title: data.title,
    }
  } catch (error) {
    // Fallback to a default if API fails
    return {
      path: '/wiki/Philosophy',
      title: 'Philosophy',
    }
  }
}

// Get random start and target articles (ensuring they're different)
export async function getRandomMatchArticles(): Promise<{
  startPath: string
  startTitle: string
  targetTitle: string
}> {
  const start = await getRandomArticle()
  let target = await getRandomArticle()

  // Make sure they're different
  while (target.title === start.title) {
    target = await getRandomArticle()
  }

  return {
    startPath: start.path,
    startTitle: start.title,
    targetTitle: target.title,
  }
}

// For backwards compatibility
export const TARGET_ARTICLE = 'Philosophy'

export function getRandomStartArticle(): string {
  return '/wiki/Capybara' // Fallback, use getRandomMatchArticles instead
}

export function extractArticleTitle(url: string): string | null {
  // Extract title from URL like "/wiki/Some_Article" or full URL
  const match = url.match(/\/wiki\/([^#?]+)/)
  if (match) {
    return decodeURIComponent(match[1].replace(/_/g, ' '))
  }
  return null
}
