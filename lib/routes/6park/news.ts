import { Route } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { load } from 'cheerio';
import timezone from '@/utils/timezone';
import { parseDate } from '@/utils/parse-date';

export const route: Route = {
    path: '/news/:site?/:id?/:keyword?',
    radar: [
        {
            source: ['club.6parkbbs.com/:id/index.php', 'club.6parkbbs.com/'],
            target: '/:id?',
        },
    ],
    name: '新闻栏目',
    maintainers: ['nczitzk', 'cscnk52'],
    parameters: {
        site: '分站，可选newspark、local，默认为 newspark',
        id: '栏目 id，可选，默认为空',
        keyword: '关键词，可选，默认为空',
    },
    description: `::: tip 提示
若订阅 [时政](https://www.6parknews.com/newspark/index.php?type=1)，其网址为 <https://www.6parknews.com/newspark/index.php?type=1>，其中 \`newspark\` 为分站，\`1\` 为栏目 id。
若订阅 [美国](https://local.6parknews.com/index.php?type_id=1)，其网址为 <https://local.6parknews.com/index.php?type_id=1>，其中 \`local\` 为分站，\`1\` 为栏目 id。
:::`,
    handler,
};

async function handler(ctx) {
    const site = ctx.req.param('site') ?? 'newspark';
    const id = ctx.req.param('id') ?? '';
    const keyword = ctx.req.param('keyword') ?? '';

    const limit = ctx.req.query('limit') ? Number.parseInt(ctx.req.query('limit')) : 50;

    const isLocal = site === 'local';

    const rootUrl = `https://${isLocal ? site : 'www'}.6parknews.com`;
    const indexUrl = `${rootUrl}${isLocal ? '' : '/newspark'}/index.php`;
    const currentUrl = `${indexUrl}${keyword ? `?act=newssearch&app=news&keywords=${keyword}&submit=查询` : id ? (Number.isNaN(id) ? `?act=${id}` : isLocal ? `?type_id=${id}` : `?type=${id}`) : ''}`;

    const response = await got({
        method: 'get',
        url: currentUrl,
    });

    const $ = load(response.data);

    let items = $('#d_list ul li, #thread_list li, .t_l .t_subject')
        .toArray()
        .slice(0, limit)
        .map((item) => {
            item = $(item);

            const a = item.find('a').first();
            const link = a.attr('href');

            return {
                title: a.text(),
                link: link.startsWith('http') ? link : `${rootUrl}/${link.startsWith('view') ? `newspark/${link}` : link}`,
            };
        });

    items = await Promise.all(
        items
            .filter((item) => /6parknews\.com/.test(item.link))
            .map((item) =>
                cache.tryGet(item.link, async () => {
                    try {
                        const detailResponse = await got({
                            method: 'get',
                            url: item.link,
                        });

                        const content = load(detailResponse.data);

                        const matches = detailResponse.data.match(/新闻来源:(.*?)于.*(\d{4}(?:-\d{2}){2} (?:\d{1,2}:){2}\d{1,2})/);

                        item.title = content('h2').text();
                        item.author = matches[1].trim();
                        item.pubDate = timezone(parseDate(matches[2], 'YYYY-MM-DD h:m'), +8);
                        item.description = content('#shownewsc').html().replaceAll('<p></p>', '');
                    } catch {
                        // no-empty
                    }

                    return item;
                })
            )
    );

    return {
        title: $('title').text(),
        link: currentUrl,
        item: items,
    };
}
