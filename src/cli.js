#!/usr/bin/env node
const url = require("url");
const Scraper = require("./scraper");

var argv = require("yargs")
  .usage("Usage: $0 [options] <url>")
  .alias("c", "concurrency")
  .describe("c", "Amount of concurrently running tabs")
  .default("c", 2)
  .alias("w", "wait")
  .describe("w", "Wait for page load (milliseconds)")
  .default("w", 2500)
  .alias("n", "navigation-timeout")
  .describe("n", "Navigation timeout (milliseconds)")
  .default("n", 30000)
  .alias("l", "levels")
  .describe("l", "Path levels to follow. Set 0 for all levels.")
  .default("l", 0)
  .boolean("json")
  .describe("json", "Return array in JSON format")
  .alias("h", "help")
  .help("h").argv;

try {
  const parsed = url.parse(argv._[0]);
  if (!parsed.hostname) {
    throw new Exception();
  }
} catch (_) {
  console.error("Invalid URL");
  process.exit(1);
}

(async () => {
  const scraper = new Scraper({
    levels: argv.levels,
    concurrency: argv.concurrency,
    waitForPageLoad: argv.wait,
    navigationTimeout: argv.navigationTimeout
  });
  const emails = await scraper.scrape(argv._[0]);

  if (argv.json) {
    console.log(JSON.stringify(emails));
  } else {
    emails.forEach(email => console.log(email));
  }
})();
