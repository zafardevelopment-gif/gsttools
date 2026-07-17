const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto("http://localhost:3000/signup", { waitUntil: "networkidle" });

  const email = `realtest${Date.now()}@gmail.com`;
  await page.fill('#email', email);
  await page.fill('#password', 'testpass123');
  await page.fill('#confirmPassword', 'testpass123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  console.log("URL after signup:", page.url());
  console.log("Body:", (await page.locator("body").innerText()).slice(0, 500));
  await page.screenshot({ path: "verify-real-signup.png", fullPage: true });

  console.log("Console errors:", errors);
  await browser.close();
})();
