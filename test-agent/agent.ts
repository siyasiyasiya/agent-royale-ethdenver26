/**
 * Test Agent for Agent Arena
 *
 * This agent:
 * 1. Registers with the API
 * 2. Joins the matchmaking queue
 * 3. Waits to be paired with opponent
 * 4. Signals ready when browser is launched
 * 5. Waits for match to start
 * 6. Streams screenshots via CDP
 * 7. Clicks links to navigate toward the target
 * 8. Claims victory when it reaches the target
 */

import { chromium, Browser, Page, CDPSession } from 'playwright'

const API_BASE = process.env.API_BASE || 'http://localhost:3000'
const AGENT_NAME = process.env.AGENT_NAME || `TestAgent_${Date.now()}`

interface RegistrationResponse {
  agent_id: string
  api_key: string
  name: string
}

interface QueueResponse {
  status: string // 'queued' | 'paired'
  match_id?: string
  match_status?: string
  start_article?: string
  target_article?: string
  time_limit_seconds?: number
  message?: string
}

class WikiSpeedrunAgent {
  private browser: Browser | null = null
  private page: Page | null = null
  private cdp: CDPSession | null = null
  private agentId: string = ''
  private apiKey: string = ''
  private matchId: string = ''
  private startArticle: string = ''
  private targetArticle: string = ''
  private clickCount: number = 0
  private streaming: boolean = false
  private lastFrameTime: number = 0

  async run() {
    try {
      // 1. Register
      console.log(`[${AGENT_NAME}] Registering...`)
      await this.register()
      console.log(`[${AGENT_NAME}] Registered as ${this.agentId}`)

      // 2. Join queue and wait to be paired
      console.log(`[${AGENT_NAME}] Joining matchmaking queue...`)
      const queueResult = await this.joinQueueAndWaitForPairing()
      this.matchId = queueResult.match_id!
      this.startArticle = queueResult.start_article!
      this.targetArticle = queueResult.target_article!
      console.log(`[${AGENT_NAME}] Paired! Match: ${this.matchId}`)
      console.log(`[${AGENT_NAME}] Start: ${this.startArticle}`)
      console.log(`[${AGENT_NAME}] Target: ${this.targetArticle}`)

      // 3. Launch browser and navigate to start
      console.log(`[${AGENT_NAME}] Launching browser...`)
      await this.launchBrowser()
      await this.page!.goto(this.startArticle)
      console.log(`[${AGENT_NAME}] Browser ready at start article`)

      // 4. Signal ready
      console.log(`[${AGENT_NAME}] Signaling ready...`)
      await this.signalReady()

      // 5. Wait for match to start (both agents ready)
      console.log(`[${AGENT_NAME}] Waiting for match to start...`)
      await this.waitForMatchStart()

      // 6. Start streaming
      console.log(`[${AGENT_NAME}] Starting screen stream...`)
      await this.startStreaming()

      // 7. Navigate toward target
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

  private async joinQueueAndWaitForPairing(): Promise<QueueResponse> {
    // Join queue
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

    const result: QueueResponse = await res.json()

    // If immediately paired, return
    if (result.status === 'paired') {
      return result
    }

    // Otherwise poll until paired
    console.log(`[${AGENT_NAME}] In queue, waiting for opponent...`)
    while (true) {
      await new Promise(r => setTimeout(r, 1000))

      const checkRes = await fetch(`${API_BASE}/api/matches/queue`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      })

      const checkResult: QueueResponse = await checkRes.json()

      if (checkResult.status === 'paired') {
        this.matchId = checkResult.match_id!
        // Fetch full match details
        const matchRes = await fetch(`${API_BASE}/api/matches/${this.matchId}`, {
          headers: { 'Authorization': `Bearer ${this.apiKey}` },
        })
        const match = await matchRes.json()
        return {
          status: 'paired',
          match_id: match.match_id,
          start_article: match.start_article,
          target_article: match.target_article,
          time_limit_seconds: match.time_limit_seconds,
        }
      }
    }
  }

  private async signalReady(): Promise<void> {
    const res = await fetch(`${API_BASE}/api/matches/${this.matchId}/ready`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ agent_id: this.agentId }),
    })

    const result = await res.json()
    console.log(`[${AGENT_NAME}] Ready signal:`, result.message || result.status)
  }

  private async waitForMatchStart(): Promise<void> {
    // Poll until match is active
    while (true) {
      const res = await fetch(`${API_BASE}/api/matches/${this.matchId}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      })
      const match = await res.json()

      if (match.status === 'active') {
        console.log(`[${AGENT_NAME}] Match started!`)
        return
      }

      await new Promise(r => setTimeout(r, 500))
    }
  }

  private async launchBrowser(): Promise<void> {
    this.browser = await chromium.launch({ headless: false })
    const context = await this.browser.newContext({
      viewport: { width: 960, height: 540 },
    })
    this.page = await context.newPage()
    this.cdp = await this.page.context().newCDPSession(this.page)
  }

  private async startStreaming(): Promise<void> {
    if (!this.cdp) return

    // Enable CDP screencast
    await this.cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 40,
      everyNthFrame: 10,
    })

    this.streaming = true

    // Handle screencast frames
    this.cdp.on('Page.screencastFrame', async (event) => {
      if (!this.streaming) return

      // Acknowledge frame always (required by CDP)
      await this.cdp!.send('Page.screencastFrameAck', {
        sessionId: event.sessionId,
      })

      // Throttle: skip if last frame was < 200ms ago (~5fps max)
      const now = Date.now()
      if (now - this.lastFrameTime < 200) return
      this.lastFrameTime = now

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
    let consecutiveFailures = 0

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
        consecutiveFailures++
        console.log(`[${AGENT_NAME}] Navigation failed, retrying... (${consecutiveFailures}/5)`)
        if (consecutiveFailures >= 5) {
          console.log(`[${AGENT_NAME}] Too many consecutive failures, stopping`)
          break
        }
        continue
      }

      consecutiveFailures = 0
      this.clickCount++
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
      // Get all links in the article content
      const links = await this.page.$$eval(
        '#mw-content-text a[href^="/wiki/"]:not([href*=":"]):not([href*="#"])',
        (elements) => {
          return elements
            .map((el) => ({
              href: el.getAttribute('href') || '',
              text: el.textContent?.trim() || '',
            }))
            .filter((l) => l.text.length > 0 && l.text.length < 50)
            .slice(0, 20) // Limit to first 20 links
        }
      )

      if (links.length === 0) return false

      // Simple strategy: pick a link that might lead toward the target
      // In a real agent, this would use LLM reasoning
      const targetLower = this.targetArticle.toLowerCase()

      // Prefer links that contain words from the target
      let bestLink = links.find(l =>
        targetLower.includes(l.text.toLowerCase()) ||
        l.text.toLowerCase().includes(targetLower)
      )

      // Otherwise pick a "good" looking link (longer, not a date/number)
      if (!bestLink) {
        const goodLinks = links.filter(l =>
          l.text.length > 3 &&
          !/^\d+$/.test(l.text) &&
          !l.text.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)/)
        )
        bestLink = goodLinks[Math.floor(Math.random() * Math.min(5, goodLinks.length))]
      }

      if (!bestLink) {
        bestLink = links[0]
      }

      console.log(`[${AGENT_NAME}] Navigating to: ${bestLink.text}`)

      // Use goto() directly — more reliable than DOM click (no visibility/scroll issues)
      const fullUrl = `https://en.wikipedia.org${bestLink.href}`
      await this.page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })

      return true
    } catch (error) {
      console.error(`[${AGENT_NAME}] Navigation error:`, (error as Error).message?.split('\n')[0])
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
