import { chromium } from "playwright";

const API_KEY = process.env.OPENROUTER_API_KEY;
if (!API_KEY) { console.error("Set OPENROUTER_API_KEY first"); process.exit(1); }

const TARGET_ARTICLE = "Philosophy";
const MAX_CLICKS = 30;
const TIME_LIMIT_MS = 5 * 60 * 1000;

const AGENTS = [
  {
    id: "racer1", name: "WikiRacer1", color: "\x1b[36m",
    personality: "You are WikiRacer1. Strategy: prefer links to broad, abstract, high-connectivity topics (Science, Philosophy, History, Mathematics, countries). These act as hubs. Avoid obscure specifics or lists. Be fast and decisive.",
  },
  {
    id: "racer2", name: "WikiRacer2", color: "\x1b[33m",
    personality: "You are WikiRacer2. Strategy: look for geographic, historical, or cultural bridges. Trace connections through civilizations, languages, and regions. Read carefully before choosing. Be methodical.",
  },
];
const RESET = "\x1b[0m";

async function askAgent(agent, currentArticle, targetArticle, links, clickPath) {
  const prompt = `You are playing Wikipedia Speedrun. You are on "${currentArticle}". Target: "${targetArticle}".
Path so far: ${clickPath.join(" -> ") || "(start)"}
Clicks: ${clickPath.length}/${MAX_CLICKS}

Clickable links on this page:
${links.map((l, i) => `${i + 1}. ${l}`).join("\n")}

Pick ONE link that gets you closest to "${targetArticle}". Reply with ONLY the exact link text. Nothing else.`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://agentarena.xyz",
      "X-Title": "Agent Arena Wikipedia Speedrun",
    },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash-001",
      max_tokens: 100,
      temperature: 0.3,
      messages: [
        { role: "system", content: agent.personality },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

async function getArticleTitle(page) {
  await page.waitForSelector("#firstHeading", { timeout: 10000 });
  return page.evaluate(() => {
    const h1 = document.querySelector("#firstHeading");
    return h1 ? h1.textContent.trim() : "";
  });
}

async function getArticleLinks(page) {
  return page.evaluate(() => {
    const content = document.querySelector("#mw-content-text .mw-parser-output");
    if (!content) return [];
    const links = [], seen = new Set();
    const anchors = content.querySelectorAll("p a[href^='/wiki/'], li a[href^='/wiki/'], td a[href^='/wiki/']");
    for (const a of anchors) {
      const href = a.getAttribute("href");
      if (href.includes(":") || href.includes("#") || href.startsWith("/wiki/Main_Page")) continue;
      const text = a.textContent.trim();
      if (text && !seen.has(text) && text.length > 1) { seen.add(text); links.push(text); }
    }
    return links;
  });
}

async function clickWikiLink(page, linkText) {
  const href = await page.evaluate((text) => {
    const content = document.querySelector("#mw-content-text .mw-parser-output");
    if (!content) return null;
    const anchors = content.querySelectorAll("p a[href^='/wiki/'], li a[href^='/wiki/'], td a[href^='/wiki/']");
    const lower = text.toLowerCase();
    for (const a of anchors) { if (a.textContent.trim() === text) return a.getAttribute("href"); }
    for (const a of anchors) { if (a.textContent.trim().toLowerCase() === lower) return a.getAttribute("href"); }
    for (const a of anchors) {
      const t = a.textContent.trim().toLowerCase();
      if (t.includes(lower) || lower.includes(t)) return a.getAttribute("href");
    }
    return null;
  }, linkText);

  if (href) {
    await page.goto(`https://en.wikipedia.org${href}`, { waitUntil: "domcontentloaded" });
    return true;
  }
  return false;
}

function log(agent, msg) {
  console.log(`${agent.color}[${new Date().toLocaleTimeString()}] [${agent.name}]${RESET} ${msg}`);
}
function logSystem(msg) { console.log(`\x1b[35m[SYSTEM]${RESET} ${msg}`); }

async function agentTurn(agent, page, clickPath) {
  const currentTitle = await getArticleTitle(page);
  if (currentTitle.toLowerCase() === TARGET_ARTICLE.toLowerCase()) return { won: true, title: currentTitle };

  const links = await getArticleLinks(page);
  if (links.length === 0) {
    log(agent, "No links! Going random...");
    await page.goto("https://en.wikipedia.org/wiki/Special:Random", { waitUntil: "domcontentloaded" });
    return { won: false, title: await getArticleTitle(page) };
  }

  const directMatch = links.find((l) => l.toLowerCase() === TARGET_ARTICLE.toLowerCase());
  if (directMatch) {
    log(agent, `TARGET found in links! Clicking "${directMatch}"!`);
    await clickWikiLink(page, directMatch);
    return { won: true, title: TARGET_ARTICLE };
  }

  const trimmedLinks = links.slice(0, 120);
  log(agent, `On "${currentTitle}" - ${links.length} links. Thinking...`);

  let choice;
  try {
    choice = await askAgent(agent, currentTitle, TARGET_ARTICLE, trimmedLinks, clickPath);
  } catch (err) {
    log(agent, `AI error: ${err.message}. Random pick.`);
    choice = links[Math.floor(Math.random() * Math.min(links.length, 20))];
  }

  log(agent, `Chose: "${choice}"`);
  const clicked = await clickWikiLink(page, choice);
  if (!clicked) {
    log(agent, `Not found. Fallback: "${links[0]}"`);
    await clickWikiLink(page, links[0]);
  }
  const newTitle = await getArticleTitle(page);
  return { won: newTitle.toLowerCase() === TARGET_ARTICLE.toLowerCase(), title: newTitle };
}

async function main() {
  logSystem("WIKIPEDIA SPEEDRUN - Agent Arena");
  logSystem(`Target: "${TARGET_ARTICLE}" | Max clicks: ${MAX_CLICKS} | Time: ${TIME_LIMIT_MS / 1000}s\n`);

  const browser1 = await chromium.launch({ headless: false });
  const browser2 = await chromium.launch({ headless: false });
  const page1 = await browser1.newPage();
  const page2 = await browser2.newPage();

  logSystem("Getting random starting article...");
  await page1.goto("https://en.wikipedia.org/wiki/Special:Random", { waitUntil: "domcontentloaded" });
  await page1.waitForSelector("#firstHeading");
  const startTitle = await getArticleTitle(page1);
  const startUrl = page1.url();
  logSystem(`Starting: "${startTitle}" - ${startUrl}\n`);
  await page2.goto(startUrl, { waitUntil: "domcontentloaded" });

  const state = [
    { agent: AGENTS[0], page: page1, clickPath: [startTitle], done: false, won: false },
    { agent: AGENTS[1], page: page2, clickPath: [startTitle], done: false, won: false },
  ];

  const startTime = Date.now();
  logSystem("RACE START!\n");

  for (let turn = 1; turn <= MAX_CLICKS; turn++) {
    if (Date.now() - startTime > TIME_LIMIT_MS) { logSystem("TIME'S UP!"); break; }
    logSystem(`-- Turn ${turn} --`);

    for (const s of state) {
      if (s.done) continue;
      const result = await agentTurn(s.agent, s.page, s.clickPath);
      s.clickPath.push(result.title);
      if (result.won) {
        s.won = true; s.done = true;
        log(s.agent, `REACHED "${TARGET_ARTICLE}" in ${s.clickPath.length - 1} clicks!`);
      }
    }

    const winner = state.find((s) => s.won);
    if (winner) {
      logSystem("\n====================================================");
      logSystem(`WINNER: ${winner.agent.name} in ${winner.clickPath.length - 1} clicks!`);
      logSystem("Path: " + winner.clickPath.join(" -> "));
      const loser = state.find((s) => s !== winner);
      logSystem(`${loser.agent.name} path: ${loser.clickPath.join(" -> ")}`);
      logSystem("====================================================");
      break;
    }
    console.log("");
  }

  if (!state.some((s) => s.won)) {
    logSystem("\nNO WINNER");
    for (const s of state) logSystem(`${s.agent.name}: ${s.clickPath.length - 1} clicks, path: ${s.clickPath.join(" -> ")}`);
  }

  logSystem("\nBrowsers open 30s...");
  await new Promise((r) => setTimeout(r, 30000));
  await browser1.close();
  await browser2.close();
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
