async function run() {
  const { chromium: pwExtraChromium } = await import('playwright-extra')
  const stealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default
  pwExtraChromium.use(stealthPlugin())
  const browser = await pwExtraChromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.goto('https://bot.sannysoft.com/')
  const html = await page.content()
  console.log(html.includes('WebDriver') ? 'WebDriver present' : 'WebDriver hidden')
  await browser.close()
}
run()
