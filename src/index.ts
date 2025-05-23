import puppeteer from 'npm:puppeteer@24.9.0';
import { extract, toMarkdown } from 'npm:@mizchi/readability@0.5.8';
import { join } from 'https://deno.land/std@0.205.0/path/mod.ts';
import { parse as parseXml } from 'https://deno.land/x/xml@2.1.1/mod.ts';

async function fetchSitemapUrls(sitemapUrl: string): Promise<string[]> {
  try {
    console.log(`Fetching sitemap: ${sitemapUrl}`);
    const response = await fetch(sitemapUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch sitemap: ${response.statusText}`);
    }
    const xmlString = await response.text();
    const doc = parseXml(xmlString);

    // deno-lint-ignore no-explicit-any
    const urlset = doc.urlset as any;
    if (!urlset || !urlset.url) {
      // Check for sitemap index file
      // deno-lint-ignore no-explicit-any
      const sitemapindex = doc.sitemapindex as any;
      if (sitemapindex && sitemapindex.sitemap) {
        const sitemaps = Array.isArray(sitemapindex.sitemap)
          ? sitemapindex.sitemap
          : [sitemapindex.sitemap];
        let urls: string[] = [];
        for (const sm of sitemaps) {
          if (sm.loc && typeof sm.loc === 'string') {
            const nestedUrls = await fetchSitemapUrls(sm.loc);
            urls = urls.concat(nestedUrls);
          } else if (sm.loc && typeof (sm.loc as any)['#text'] === 'string') { // Handle cases where loc is an object
            const nestedUrls = await fetchSitemapUrls((sm.loc as any)['#text']);
            urls = urls.concat(nestedUrls);
          }
        }
        return urls;
      }
      throw new Error(
        'Invalid sitemap format. No <urlset> or <sitemapindex> found.',
      );
    }

    const urls = Array.isArray(urlset.url) ? urlset.url : [urlset.url];
    // deno-lint-ignore no-explicit-any
    return urls.map((u: any) => {
      if (u.loc && typeof u.loc === 'string') {
        return u.loc;
      } else if (u.loc && typeof (u.loc as any)['#text'] === 'string') { // Handle cases where loc is an object
        return (u.loc as any)['#text'];
      }
      return null;
    }).filter((u: string | null) => u !== null) as string[];
  } catch (error) {
    console.error(
      `Error fetching or parsing sitemap: ${(error as Error).message}`,
    );
    return [];
  }
}

async function fetchPageHtml(pageUrl: string): Promise<string | null> {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  try {
    await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    const html = await page.content();
    return html;
  } catch (error) {
    console.error(
      `Error fetching page ${pageUrl}: ${(error as Error).message}`,
    );
    return null;
  } finally {
    await browser.close();
  }
}

function sanitizeUrlToFileName(url: string): string {
  let fileName: string = url.replace(/^https?:\/\//, '');
  fileName = fileName.replace(/\//g, '_').replace('.', '_').replace(
    /[^a-zA-Z0-9_.-]/g,
    '',
  );
  if (fileName.length > 100) {
    fileName = fileName.substring(0, 100);
  }
  // Ensure it doesn't end with a dot or underscore if it's not the only char
  if (
    fileName.length > 1 && (fileName.endsWith('.') || fileName.endsWith('_'))
  ) {
    fileName = fileName.slice(0, -1);
  }
  // Ensure it's not empty
  if (!fileName) {
    return 'default_page_name';
  }
  return fileName + '.md';
}

async function main() {
  if (Deno.args.length === 0) {
    console.error('Please provide a sitemap.xml URL as an argument.');
    console.log(
      'Usage: deno run --allow-net --allow-read --allow-write --allow-env --allow-run --unstable src/index.ts <sitemap_url>',
    );
    Deno.exit(1);
  }
  const sitemapUrl = Deno.args[0];

  console.log(`Sitemap URL: ${sitemapUrl}`);

  const urls = await fetchSitemapUrls(sitemapUrl);
  if (urls.length === 0) {
    console.log(
      'No URLs found in the sitemap or failed to fetch/parse sitemap.',
    );
    return;
  }
  console.log(`Found ${urls.length} URLs in sitemap.`);

  await Deno.mkdir('docs', { recursive: true });

  for (const [index, pageUrl] of urls) {
    console.log(`\nProcessing URL: ${pageUrl} ()${index + 1}/${urls.length})`);
    const baseFileName = sanitizeUrlToFileName(pageUrl);

    const html = await fetchPageHtml(pageUrl);
    if (!html) {
      console.warn(`Skipping ${pageUrl} due to fetch error.`);
      continue;
    }

    const extracted = extract(html, { charThreshold: 100 });
    const markdown = toMarkdown(extracted.root);

    const path = join('docs', baseFileName);
    console.log(`Writing to file: ${path}`);
    await Deno.writeTextFile(path, markdown);
  }

  console.log('\nAll processing finished.');
}

if (import.meta.main) {
  main();
}
