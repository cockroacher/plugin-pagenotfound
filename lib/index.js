import { getLogger } from '@sitespeed.io/log';
import { SitespeedioPlugin } from '@sitespeed.io/plugin';
import { rateResponseStatusCode, rateResponseTitle, rateResponseHeader1, rateCorrectLanguageText } from './ratingCalculator';
import { JSDOM } from 'jsdom';
import { Rating } from 'webperf-sitespeedio-plugin';

const log = getLogger('webperf.plugin.pagenotfound');

export default class PageNotFoundPlugin extends SitespeedioPlugin {
  constructor(options, context, queue) {
    super({ name: 'plugin-pagenotfound', options, context, queue });
  }

  open(context, options) {
    this.filterRegistry = context.filterRegistry;

    const options_ = options.influxdb;
    this.options = options;
    this.timestamp = context.timestamp;
    this.resultUrls = context.resultUrls;
    this.dataGenerator = new DataGenerator(
      options_.includeQueryParams,
      options
    );
    this.messageTypesToFireAnnotations = [];
    this.receivedTypesThatFireAnnotations = {};
    this.make = context.messageMaker('pagenotfound').make;
    this.sendAnnotation = true;
    this.alias = {};
  }

  processMessage(message, queue) {
    const filterRegistry = this.filterRegistry;

    // First catch if we are running Browsertime and/or WebPageTest
    switch (message.type) {
      case 'browsertime.setup': {
        this.messageTypesToFireAnnotations.push('browsertime.pageSummary');
        this.usingBrowsertime = true;

        break;
      }
      case 'browsertime.config': {
        if (message.data.screenshot) {
          this.useScreenshots = message.data.screenshot;
          this.screenshotType = message.data.screenshotType;
        }

        break;
      }
      case 'sitespeedio.setup': {
        // Let other plugins know that the pagenotfound plugin is alive
        queue.postMessage(this.make('pagenotfound.setup'));

        break;
      }
      case 'grafana.setup': {
        this.sendAnnotation = false;

        break;
      }
      // No default
    }

    if (message.type === 'browsertime.alias') {
      this.alias[message.url] = message.data;
    }

    if (
      !(
        message.type.endsWith('.summary') ||
        message.type.endsWith('.pageSummary')
      )
    ) {
      return;
    }

    if (this.messageTypesToFireAnnotations.includes(message.type)) {
      this.receivedTypesThatFireAnnotations[message.url]
        ? this.receivedTypesThatFireAnnotations[message.url]++
        : (this.receivedTypesThatFireAnnotations[message.url] = 1);
    }

    // Let us skip this for a while and concentrate on the real deal
    if (
      /(^largestassets|^slowestassets|^aggregateassets|^domains)/.test(
        message.type
      )
    )
      return;

    // we only sends individual groups to Influx, not the
    // total of all groups (you can calculate that yourself)
    if (message.group === 'total') {
      return;
    }

    message = filterRegistry.filterMessage(message);
    if (isEmpty(message.data)) return;

    let data = this.dataGenerator.dataFromMessage(
      message,
      message.type === 'browsertime.pageSummary'
        ? dayjs(message.runTime)
        : this.timestamp,
      this.alias
    );

    // Get status code of the requested webpage and handle redirects
    if (message.type === 'browsertime.pageSummary' && message.data.requests) {
      let mainRequest = message.data.requests.find(request => request.url === message.url);
      if (!mainRequest) {
        // If the main request is not found, check for redirects
        mainRequest = message.data.requests.find(request => request.initiator === 'redirect');
      }
      if (mainRequest) {
        log.info(`URL: ${mainRequest.url}, Status Code: ${mainRequest.statusCode}`);
        
        // Implement rating logic
        let rating = new Rating(globalTranslation, getConfig('general.review.improve-only'));
        rating += rateResponseStatusCode(globalTranslation, localTranslation, mainRequest.statusCode);

        const resultDict = { statusCode: mainRequest.statusCode };

        const requestText = mainRequest.responseBody || '';
        let hasRequestText = requestText !== '';

        if (hasRequestText) {
          const dom = new JSDOM(requestText);
          const soup = dom.window.document;

          rating += rateResponseTitle(globalTranslation, resultDict, localTranslation, soup);
          rating += rateResponseHeader1(globalTranslation, resultDict, localTranslation, soup);
          rating += rateCorrectLanguageText(soup, requestText, message.url, globalTranslation, localTranslation);
        }

        log.info(`Rating: ${rating}`);
      }
    }
  }
  close() {
    // Cleanup if necessary
  }
}