// Dependencies
const BatchJobs = require("batch-jobs");
const puppeteer = require("puppeteer");
const url = require("url");

// Constants
const EMAIL_REGEX = /([a-zA-Z0-9._-]+@[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,})/gi;
const OPTIONS = {
  levels: 0,
  concurrency: 2,
  waitForPageLoad: 500,
  navigationTimeout: 30000,
  puppeteer: {}
};

// Class
module.exports = class Scraper {
  constructor(options) {
    this._options = Object.assign({}, OPTIONS, options);
    this._links = new Set();
    this._batchJobs = new BatchJobs(this._options.concurrency);
  }

  _waitForBatchJobs() {
    return new Promise(resolve => {
      this._batchJobs.on("end", data => {
        const emails = [].concat.apply([], data).filter((v, i, a) => {
          return a.indexOf(v) === i && !!v;
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

  _shouldAbortRequest(request) {
    return (
      ["stylesheet", "image", "media", "font", "websocket"].indexOf(
        request.resourceType()
      ) >= 0
    );
  }

  async _addPageInterception(page) {
    await page.setRequestInterception(true);
    page.on("request", request => {
      this._shouldAbortRequest(request) ? request.abort() : request.continue();
    });
  }

  async _fetchUrl(link, callback) {
    let page, data;

    try {
      page = await this._browser.newPage();
      await this._addPageInterception(page);
      await page.goto(link, {
        waitUntil: ["load", "domcontentloaded"],
        timeout: this._options.navigationTimeout
      });
      await page.waitFor(this._options.waitForPageLoad);

      data = await page.evaluate(
        regex => {
          regex = new RegExp(regex.source, regex.flags);
          return {
            origin: window.location.origin,
            emails: [].slice
              .call(document.querySelectorAll('a[href^="mailto:"]'))
              .map(element => {
                return element.pathname;
              })
              .concat(document.documentElement.outerHTML.match(regex) || []),
            links: Array.from(document.getElementsByTagName("a"))
              .filter(element => {
                return (
                  element.hostname === window.location.hostname &&
                  (element.protocol === "http:" ||
                    element.protocol === "https:") &&
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
        },
        {
          source: EMAIL_REGEX.source,
          flags: EMAIL_REGEX.flags
        }
      );
    } catch (_) {
      callback(null);
      return;
    } finally {
      try {
        await page.close();
      } catch (_) {}
    }

    data.links.forEach(link => {
      if (
        this._options.levels > 0 &&
        link.split("/").filter(path => !!path).length > this._options.levels
      ) {
        return;
      }

      if (!this._links.has(link)) {
        this._links.add(link);
        this._batchJobs.push(done =>
          this._fetchUrl(url.resolve(data.origin, link), done)
        );
      }
    });

    callback(data.emails);
  }

  async scrape(link) {
    await this._initBrowser();

    const result = this._waitForBatchJobs();
    this._batchJobs.push(done => this._fetchUrl(link, done));
    this._batchJobs.start();

    return await result;
  }
};
