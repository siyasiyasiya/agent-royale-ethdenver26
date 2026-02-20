/**
 * Test Agent for Agent Arena
 *
 * This agent:
 * 1. Registers with the API
 * 2. Joins the matchmaking queue
 * 3. Opens the starting Wikipedia article
 * 4. Streams screenshots via CDP
 * 5. Clicks links to navigate toward the target
 * 6. Claims victory when it reaches the target
 */

import { chromium, Browser, Page, CDPSession } from 'playwright'

const API_BASE = process.env.API_BASE || 'http://localhost:3000'
const AGENT_NAME = process.env.AGENT_NAME || `TestAgent_${Date.now()}`

interface RegistrationResponse {
  agent_id: string
  api_key: string
  name: string
}

interface MatchResponse {
  match_id: string
  status: string
  start_article: string
  target_article: string
  time_limit_seconds: number
  message?: string
}

class WikiSpeedrunAgent {
  private browser: Browser | null = null
  private page: Page | null = null
  private cdp: CDPSession | null = null
  private agentId: string = ''
  private apiKey: string = ''
  private matchId: string = ''
  private targetArticle: string = ''
  private clickCount: number = 0
  private streaming: boolean = false

  async run() {
    try {
      // 1. Register
      console.log(`[${AGENT_NAME}] Registering...`)
      await this.register()
      console.log(`[${AGENT_NAME}] Registered as ${this.agentId}`)

      // Small delay to ensure DB commit
      await new Promise(r => setTimeout(r, 500))

      // 2. Join queue
      console.log(`[${AGENT_NAME}] Joining matchmaking queue...`)
      const match = await this.joinQueue()
      this.matchId = match.match_id
      this.targetArticle = match.target_article
      console.log(`[${AGENT_NAME}] Match: ${this.matchId}`)
      console.log(`[${AGENT_NAME}] Target: ${this.targetArticle}`)

      // 3. Wait for match to start if needed
      if (match.status === 'waiting_for_opponent') {
        console.log(`[${AGENT_NAME}] Waiting for opponent...`)
        await this.waitForMatchStart()
      }

      // 4. Launch browser and navigate to start
      console.log(`[${AGENT_NAME}] Launching browser...`)
      await this.launchBrowser()
      await this.page!.goto(match.start_article)
      console.log(`[${AGENT_NAME}] Starting at: ${match.start_article}`)

      // 5. Start streaming
      console.log(`[${AGENT_NAME}] Starting screen stream...`)
      await this.startStreaming()

      // 6. Navigate toward target
      console.log(`[${AGENT_NAME}] Racing to ${this.targetArticle}...`)
      await this.navigateToTarget()

    } catch (error) {
      console.error(`[${AGENT_NAME}] Error:`, error)
    } finally {
      await this.cleanup()
    }
  }

  private async register(): Promise<void> {
    const res = await fetch(`${API_BASE}/api/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: AGENT_NAME,
        owner_wallet: '0x' + Math.random().toString(16).slice(2, 42),
      }),
    })

    if (!res.ok) {
      throw new Error(`Registration failed: ${await res.text()}`)
    }

    const data: RegistrationResponse = await res.json()
    this.agentId = data.agent_id
    this.apiKey = data.api_key
  }

  private async joinQueue(): Promise<MatchResponse> {
    const res = await fetch(`${API_BASE}/api/matches/queue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ agent_id: this.agentId }),
    })

    if (!res.ok) {
      throw new Error(`Join queue failed: ${await res.text()}`)
    }

    return res.json()
  }

  private async waitForMatchStart(): Promise<void> {
    // Poll until match is active (with timeout)
    const maxWait = 60 // 60 seconds max
    let waited = 0

    while (waited < maxWait) {
      const res = await fetch(`${API_BASE}/api/matches/${this.matchId}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      })
      const match = await res.json()

      if (match.status === 'active') {
        console.log(`[${AGENT_NAME}] Match started!`)
        return
      }

      console.log(`[${AGENT_NAME}] Still waiting... (${waited}s)`)
      await new Promise(r => setTimeout(r, 2000))
      waited += 2
    }

    throw new Error('Timeout waiting for opponent')
  }

  private async launchBrowser(): Promise<void> {
    this.browser = await chromium.launch({ headless: false })
    const context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
    })
    this.page = await context.newPage()
    this.cdp = await this.page.context().newCDPSession(this.page)
  }

  private async startStreaming(): Promise<void> {
    if (!this.cdp) return

    // Enable CDP screencast
    await this.cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 60,
      everyNthFrame: 3,
    })

    this.streaming = true

    // Handle screencast frames
    this.cdp.on('Page.screencastFrame', async (event) => {
      if (!this.streaming) return

      // Acknowledge frame
      await this.cdp!.send('Page.screencastFrameAck', {
        sessionId: event.sessionId,
      })

      // Push frame to API
      await this.pushFrame(event.data)
    })
  }

  private async pushFrame(base64Data: string): Promise<void> {
    try {
      await fetch(`${API_BASE}/api/matches/${this.matchId}/frames`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          agent_id: this.agentId,
          frame: base64Data,
          current_url: this.page?.url() || '',
          click_count: this.clickCount,
        }),
      })
    } catch (e) {
      // Ignore frame push errors
    }
  }

  private async navigateToTarget(): Promise<void> {
    const maxClicks = 50

    while (this.clickCount < maxClicks) {
      // Check if we reached the target
      const currentTitle = await this.getCurrentArticleTitle()
      console.log(`[${AGENT_NAME}] On: ${currentTitle} (${this.clickCount} clicks)`)

      if (this.isTargetReached(currentTitle)) {
        console.log(`[${AGENT_NAME}] TARGET REACHED! Claiming victory...`)
        await this.claimVictory()
        return
      }

      // Find and click a link
      const clicked = await this.clickBestLink()
      if (!clicked) {
        console.log(`[${AGENT_NAME}] No links found, stuck!`)
        break
      }

      this.clickCount++

      // Small delay to let page load
      await new Promise(r => setTimeout(r, 500))
    }
  }

  private async getCurrentArticleTitle(): Promise<string> {
    if (!this.page) return ''

    try {
      // Get the article title from the h1
      const title = await this.page.$eval(
        '#firstHeading',
        (el) => el.textContent?.trim() || ''
      )
      return title
    } catch {
      return ''
    }
  }

  private isTargetReached(currentTitle: string): boolean {
    // Normalize and compare
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
    return normalize(currentTitle) === normalize(this.targetArticle)
  }

  private async clickBestLink(): Promise<boolean> {
    if (!this.page) return false

    try {
      // Wait for content to be ready
      await this.page.waitForSelector('#mw-content-text', { timeout: 5000 })

      // Get all links in the article content (filter out bad links)
      const links = await this.page.$$eval(
        '#mw-content-text p a[href^="/wiki/"]:not([href*=":"]):not([href*="#"])',
        (elements) => {
          return elements
            .map((el) => ({
              href: el.getAttribute('href') || '',
              text: el.textContent?.trim() || '',
            }))
            .filter((l) => {
              // Must have reasonable length
              if (l.text.length < 3 || l.text.length > 50) return false
              // No single letters or numbers
              if (/^[a-zA-Z0-9]$/.test(l.text)) return false
              // No disambiguation pages
              if (l.href.includes('disambiguation') || l.href.includes('_(disambiguation)')) return false
              // No "Main article" type links
              if (l.text.toLowerCase().includes('main article')) return false
              // No citation/reference links
              if (/^\[\d+\]$/.test(l.text)) return false
              // No edit links
              if (l.text.toLowerCase() === 'edit') return false
              return true
            })
        }
      )

      if (links.length === 0) {
        console.log(`[${AGENT_NAME}] No valid links found on page`)
        return false
      }

      // Simple strategy: pick a link that might lead toward the target
      const targetLower = this.targetArticle.toLowerCase()

      // Prefer links that contain words from the target
      let bestLink = links.find(l =>
        targetLower.includes(l.text.toLowerCase()) ||
        l.text.toLowerCase().includes(targetLower)
      )

      // Otherwise pick a random link from the first 10 good ones
      if (!bestLink) {
        const goodLinks = links.filter(l =>
          l.text.length > 3 &&
          !/^\d+$/.test(l.text) &&
          !l.text.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)/)
        )
        const pool = goodLinks.length > 0 ? goodLinks.slice(0, 10) : links.slice(0, 10)
        bestLink = pool[Math.floor(Math.random() * pool.length)]
      }

      if (!bestLink) {
        bestLink = links[0]
      }

      console.log(`[${AGENT_NAME}] Clicking: ${bestLink.text}`)

      // Find and click the link element directly
      const linkElement = await this.page.$(`#mw-content-text a[href="${bestLink.href}"]`)
      if (!linkElement) {
        console.log(`[${AGENT_NAME}] Could not find link element, trying next`)
        return false
      }

      // Scroll into view and click
      await linkElement.scrollIntoViewIfNeeded()
      await linkElement.click()

      // Wait for navigation
      await this.page.waitForLoadState('domcontentloaded', { timeout: 10000 })
      await new Promise(r => setTimeout(r, 300)) // Small extra delay

      return true
    } catch (error) {
      console.error(`[${AGENT_NAME}] Click error:`, error)
      // Try to recover by going back and trying again
      try {
        await this.page.goBack()
        await this.page.waitForLoadState('domcontentloaded')
      } catch {}
      return false
    }
  }

  private async claimVictory(): Promise<void> {
    const res = await fetch(`${API_BASE}/api/matches/${this.matchId}/claim-victory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ agent_id: this.agentId }),
    })

    const result = await res.json()
    console.log(`[${AGENT_NAME}] Victory claim result:`, result)
  }

  private async cleanup(): Promise<void> {
    this.streaming = false

    if (this.cdp) {
      try {
        await this.cdp.send('Page.stopScreencast')
      } catch {}
    }

    if (this.browser) {
      await this.browser.close()
    }
  }
}

// Run the agent
const agent = new WikiSpeedrunAgent()
agent.run()
