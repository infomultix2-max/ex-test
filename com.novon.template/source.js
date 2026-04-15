(function () {
    const BASE_URL = 'https://example.com';

    function toAbsolute(url) {
        const raw = (url || '').trim();
        if (!raw) return '';
        if (/^https?:\/\//i.test(raw)) return raw;
        if (raw.startsWith('//')) return `https:${raw}`;
        return `${BASE_URL}${raw.startsWith('/') ? '' : '/'}${raw}`;
    }

    async function fetchPopular(page) {
        const path = page === 1 ? '/' : `/page/${page}/`;
        const html = await http.get(toAbsolute(path));
        const doc = parseHtml(html);

        const novels = doc.querySelectorAll('.novel-item').map(element => {
            const aTag = element.querySelector('a');
            const imgTag = element.querySelector('img');
            return {
                url: toAbsolute(aTag.attr('href')),
                title: aTag.text.trim(),
                coverUrl: toAbsolute(imgTag.attr('src'))
            };
        });

        return { novels, hasNextPage: novels.length > 0 };
    }

    async function fetchLatestUpdates(page) {
        return await fetchPopular(page);
    }

    async function search(query, page) {
        const url = `${BASE_URL}/search?q=${encodeURIComponent(query)}&page=${page}`;
        const html = await http.get(url);
        const doc = parseHtml(html);

        const novels = doc.querySelectorAll('.search-item').map(element => {
            const aTag = element.querySelector('a');
            const imgTag = element.querySelector('img');
            return {
                url: toAbsolute(aTag.attr('href')),
                title: aTag.text.trim(),
                coverUrl: toAbsolute(imgTag ? imgTag.attr('src') : '')
            };
        });

        return { novels, hasNextPage: novels.length > 0 };
    }

    async function fetchNovelDetail(novelUrl) {
        const html = await http.get(toAbsolute(novelUrl));
        const doc = parseHtml(html);

        return {
            url: toAbsolute(novelUrl),
            title: doc.querySelector('h1').text.trim(),
            author: doc.querySelector('.author').text.trim(),
            description: doc.querySelector('.summary').text.trim(),
            status: 'unknown',
            genres: doc.querySelectorAll('.genre').map(g => g.text.trim()),
            coverUrl: toAbsolute(doc.querySelector('.cover').attr('src'))
        };
    }

    async function fetchChapterList(novelUrl) {
        const html = await http.get(toAbsolute(novelUrl));
        const doc = parseHtml(html);

        return doc.querySelectorAll('.chapter-item a').map((a, index) => ({
            url: toAbsolute(a.attr('href')),
            name: a.text.trim(),
            number: index + 1
        })).reverse();
    }

    async function fetchChapterContent(chapterUrl) {
        const html = await http.get(toAbsolute(chapterUrl));
        const doc = parseHtml(html);
        const content = doc.querySelector('.content');

        return {
            html: content ? content.innerHTML.trim() : ''
        };
    }

    globalThis.fetchPopular = fetchPopular;
    globalThis.fetchLatestUpdates = fetchLatestUpdates;
    globalThis.search = search;
    globalThis.fetchNovelDetail = fetchNovelDetail;
    globalThis.fetchChapterList = fetchChapterList;
    globalThis.fetchChapterContent = fetchChapterContent;
})();
