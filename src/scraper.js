// Dependencies
const BatchJobs = require("batch-jobs");
const puppeteer = require("puppeteer");
const url = require("url");

// Constants
const EMAIL_REGEX = /([a-zA-Z0-9._-]+@[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,})/gi;
const OPTIONS = {
  concurrency: 2,
  waitForPageLoad: 2500,
  puppeteer: {}
};

// Class
module.exports = class Scraper {
  constructor(options) {
    this._options = Object.assign({}, OPTIONS, options);
    this._links = new Set();
    this._batchJobs = new BatchJobs(this._options.concurrency);
    this._lastPageLoad = 0;
  }

  _parseUrl(link) {
    const parse = url.parse(link);

    return {
      uri: `${parse.protocol}//${parse.host}`,
      pathname: parse.pathname
    };
  }

  _waitForBatchJobs() {
    return new Promise(resolve => {
      this._batchJobs.on("end", data => {
        const emails = [].concat.apply([], data).filter((v, i, a) => {
          return a.indexOf(v) === i;
        });

        this._browser.close().then(() => resolve(emails));
      });
    });
  }

  async _initBrowser() {
    if (!this._browser) {
      this._browser = await puppeteer.launch(this._options.puppeteer);
    }
  }

  async _fetchUrl(pathname, callback) {
    const page = await this._browser.newPage();
    await page.goto(this._uri + pathname);
    await page.waitFor(this._options.waitForPageLoad);

    const data = await page.evaluate(() => {
      return {
        mailto: [].slice
          .call(document.querySelectorAll('a[href^="mailto:"]'))
          .map(element => {
            return element.pathname;
          }),
        html: document.documentElement.outerHTML,
        links: Array.from(document.getElementsByTagName("a"))
          .filter(element => {
            return (
              element.hostname === window.location.hostname &&
              (element.protocol === "http:" || element.protocol === "https:") &&
              element.pathname
            );
          })
          .map(element => {
            return element.pathname;
          })
          .filter((v, i, a) => {
            return a.indexOf(v) === i;
          })
      };
    });

    data.links.forEach(link => {
      if (!this._links.has(link)) {
        this._links.add(link);
        this._batchJobs.push(done => this._fetchUrl(link, done));
      }
    });

    const emails = [...data.mailto, ...(data.html.match(EMAIL_REGEX) || [])];

    await page.close();
    callback(emails);
  }

  async scrape(link) {
    const { uri, pathname } = this._parseUrl(link);

    this._uri = uri;
    this._links.add(pathname);

    await this._initBrowser();

    const result = this._waitForBatchJobs();
    this._batchJobs.push(done => this._fetchUrl(pathname, done));
    this._batchJobs.start();

    return await result;
  }
};
