(function () {

    function _cleanChapterDom(root) {
        if (!root) return;
        const removeSelectors = [
            'script',
            'style',
            'noscript',
            'iframe',
            'form',
            'button',
            '.comments',
            '.comment',
            '.code-block',
            '.ads',
            '.ad',
            '.advert',
            '.banner',
            '.navigation',
            '.nav-links',
            '.post-navigation',
            '.chapter-nav',
            '.nextprev',
            '.prevnext',
        ];
        removeSelectors.forEach(sel => {
            (root.querySelectorAll(sel) || []).forEach(n => {
                if (!n) return;
                if (typeof n.remove === 'function') {
                    n.remove();
                    return;
                }
                // Fallback for parsers that don't expose remove()
                if ('innerHTML' in n) {
                    n.innerHTML = '';
                }
            });
        });
    }

    function _paragraphHtmlFrom(node) {
        if (!node) return '';
        _cleanChapterDom(node);
        const isNoiseText = (text) => {
            const t = (text || '').replace(/\s+/g, ' ').trim();
            if (!t) return true;
            if (t.length <= 260 && /window\.pubfuturetag|pubfuturetag\.push|pf-\d+-\d+|pubfuturetag/i.test(t)) {
                return true;
            }
            if (
                t.length <= 260 &&
                /ko\*?lno\*?vel|kolnovel|kolno\*?vel|kolno-?vel|\.com/i.test(t) &&
                /(رواياتنا|موقع|site|read|اقرأ|إقرأ)/i.test(t)
            ) {
                return true;
            }
            return false;
        };
        const paragraphs = (node.querySelectorAll('p') || [])
            .map(p => (p.text || '').replace(/\s+/g, ' ').trim())
            .filter(t => t.length > 0 && !isNoiseText(t));
        if (paragraphs.length >= 3) {
            return paragraphs.map(t => `<p>${t}</p>`).join('\n');
        }
        return (node.innerHTML || '').trim();
    }

    function _paragraphStatsFrom(node) {
        if (!node) return { html: '', total: 0, kept: 0, filtered: 0 };
        _cleanChapterDom(node);
        const isNoiseText = (text) => {
            const t = (text || '').replace(/\s+/g, ' ').trim();
            if (!t) return true;
            if (t.length <= 260 && /window\.pubfuturetag|pubfuturetag\.push|pf-\d+-\d+|pubfuturetag/i.test(t)) {
                return true;
            }
            if (
                t.length <= 260 &&
                /ko\*?lno\*?vel|kolnovel|kolno\*?vel|kolno-?vel|\.com/i.test(t) &&
                /(رواياتنا|موقع|site|read|اقرأ|إقرأ)/i.test(t)
            ) {
                return true;
            }
            return false;
        };
        const all = (node.querySelectorAll('p') || [])
            .map(p => (p.text || '').replace(/\s+/g, ' ').trim())
            .filter(t => t.length > 0);
        const kept = all.filter(t => !isNoiseText(t));
        return {
            html: kept.length >= 3 ? kept.map(t => `<p>${t}</p>`).join('\n') : (node.innerHTML || '').trim(),
            total: all.length,
            kept: kept.length,
            filtered: all.length - kept.length,
        };
    }

    async function fetchPopular(page) {
        const path = page === 1 ? '/' : `/page/${page}/`;
        const baseUrl = 'https://mtlarabic.com';

        const html = await http.get(baseUrl + path);
        const doc = parseHtml(html);

        const cards = doc.querySelectorAll('.novel-card');
        const novels = cards.map(element => {
            let aTag = element.querySelector('a');
            if (!aTag && element.attr('href')) aTag = element;

            const imgTag = element.querySelector('.novel-card-image img') || element.querySelector('img');
            const titleTag = element.querySelector('h2') || element.querySelector('.title');

            if (aTag) {
                const novelUrl = aTag.attr('href') || '';
                let title = titleTag ? titleTag.text : '';
                if (!title && imgTag) title = imgTag.attr('alt');
                if (!title) title = 'Unknown Title';

                const coverUrl = imgTag ? (imgTag.attr('src') || imgTag.attr('data-src')) : '';

                if (novelUrl && !novelUrl.includes('#')) {
                    return {
                        url: novelUrl,
                        title: title.trim(),
                        coverUrl: coverUrl,
                    };
                }
            }
            return null;
        }).filter(n => n !== null);

        return {
            novels: novels,
            hasNextPage: novels.length > 0
        };
    }

    async function fetchLatestUpdates(page) {
        return await fetchPopular(page);
    }

    async function search(query, page) {
        const baseUrl = 'https://mtlarabic.com';
        const encoded = encodeURIComponent(query);
        const candidates = page <= 1
            ? [
                `${baseUrl}/?s=${encoded}`,
                `${baseUrl}/search?q=${encoded}`,
              ]
            : [
                `${baseUrl}/page/${page}/?s=${encoded}`,
                `${baseUrl}/?s=${encoded}&page=${page}`,
                `${baseUrl}/search?q=${encoded}&page=${page}`,
              ];

        let html = '';
        let lastError = null;
        for (const url of candidates) {
            try {
                html = await http.get(url);
                if (html && html.length > 0) break;
            } catch (e) {
                lastError = e;
            }
        }
        if (!html) {
            if (lastError) throw lastError;
            return { novels: [], hasNextPage: false };
        }
        const doc = parseHtml(html);

        const novels = doc.querySelectorAll('.novel-card').map(element => {
            let aTag = element.querySelector('a');
            if (!aTag && element.attr('href')) aTag = element;

            const imgTag = element.querySelector('.novel-card-image img') || element.querySelector('img');
            const titleTag = element.querySelector('h2') || element.querySelector('.title');

            if (aTag) {
                const novelUrl = aTag.attr('href') || '';
                let title = titleTag ? titleTag.text : '';
                if (!title && imgTag) title = imgTag.attr('alt');

                const coverUrl = imgTag ? imgTag.attr('src') : '';

                if (novelUrl && !novelUrl.includes('#')) {
                    return {
                        url: novelUrl,
                        title: title.trim(),
                        coverUrl: coverUrl,
                    };
                }
            }
            return null;
        }).filter(n => n !== null);

        return {
            novels: novels,
            hasNextPage: novels.length > 0
        };
    }

    async function fetchNovelDetail(novelUrl) {
        const html = await http.get(novelUrl);
        const doc = parseHtml(html);

        const titleTag = doc.querySelector('h1');
        const title = titleTag ? titleTag.text.trim() : 'Unknown Title';

        let status = 'unknown';
        const genres = [];

        const badges = doc.querySelectorAll('.badge') || [];
        badges.forEach(badge => {
            const text = badge.text.trim().toLowerCase();
            if (text.includes('مستمرة') || text.includes('ongoing')) {
                status = 'ongoing';
            } else if (text.includes('مكتملة') || text.includes('completed')) {
                status = 'completed';
            } else if (text !== '') {
                genres.push(text);
            }
        });

        const descTag = doc.querySelector('.description p') || doc.querySelector('.description');
        const description = descTag ? descTag.text.trim() : '';
        const coverTag =
            doc.querySelector('meta[property="og:image"]') ||
            doc.querySelector('.novel-detail-cover img') ||
            doc.querySelector('.novel-cover img') ||
            doc.querySelector('article img') ||
            doc.querySelector('img');
        const coverUrl = coverTag
            ? (coverTag.attr('content') || coverTag.attr('src') || coverTag.attr('data-src') || '')
            : '';

        return {
            url: novelUrl,
            title: title,
            description: description,
            status: status,
            genres: genres,
            coverUrl: coverUrl,
        };
    }

    async function fetchChapterList(novelUrl) {
        const html = await http.get(novelUrl);
        const doc = parseHtml(html);
        const embeddedNovelNode = doc.querySelector('#__NOVEL__');
        if (embeddedNovelNode && embeddedNovelNode.text) {
            try {
                const embeddedNovel = JSON.parse(embeddedNovelNode.text);
                const novelId = embeddedNovel && embeddedNovel.id;
                const totalChapters = Number(embeddedNovel && embeddedNovel.totalChapters) || 0;
                const preloaded = Array.isArray(embeddedNovel && embeddedNovel.chapters)
                    ? embeddedNovel.chapters
                    : [];

                if (novelId) {
                    const baseUrl = 'https://mtlarabic.com';
                    const limit = 100;
                    const merged = new Map();

                    const addApiChapters = (chapters) => {
                        (chapters || []).forEach(ch => {
                            if (!ch || typeof ch.number !== 'number') return;
                            const chapterUrl = `${novelUrl.replace(/\/+$/, '')}/${ch.number}`;
                            const chapterName = `الفصل ${ch.number}: ${(ch.title || '').trim()}`.trim();
                            merged.set(chapterUrl, {
                                url: chapterUrl,
                                name: chapterName,
                                number: ch.number,
                            });
                        });
                    };

                    addApiChapters(preloaded);

                    let page = 1;
                    const maxPages = totalChapters > 0 ? Math.ceil(totalChapters / limit) : 80;
                    while (page <= maxPages) {
                        const apiUrl = `${baseUrl}/api/novels/${novelId}/chapters?page=${page}&limit=${limit}&sort=asc`;
                        const response = await http.get(apiUrl);
                        let parsed;
                        try {
                            parsed = JSON.parse(response);
                        } catch (_) {
                            parsed = null;
                        }
                        if (!parsed || !Array.isArray(parsed.chapters)) break;
                        if (parsed.chapters.length === 0) break;
                        addApiChapters(parsed.chapters);
                        if (parsed.chapters.length < limit) break;
                        page += 1;
                    }

                    if (merged.size > 0) {
                        return Array.from(merged.values()).sort((a, b) => {
                            const an = typeof a.number === 'number' ? a.number : 0;
                            const bn = typeof b.number === 'number' ? b.number : 0;
                            return bn - an;
                        });
                    }
                }
            } catch (_) {
                // Fall back to static chapter list parsing below.
            }
        }

        const chapterLinks = doc.querySelectorAll('.chapter-link') || [];
        const chapters = chapterLinks.map(element => {
            let aTag = element.querySelector('a');
            if (!aTag && element.attr('href')) aTag = element;

            if (aTag) {
                const chapterUrl = aTag.attr('href') || '';
                // Prefer anchor attributes/text over nested span, because span can be "…" on this site.
                const rawName =
                    (aTag.attr('title') || '') ||
                    (aTag.attr('aria-label') || '') ||
                    (aTag.text || '') ||
                    (element.text || '');
                const name = (rawName || '').trim();

                if (chapterUrl && !chapterUrl.includes('#')) {
                    const numberMatchFromUrl = chapterUrl.match(/\/(\d+)(?:\/)?$/);
                    const numberMatchFromName = name.match(/\d+(\.\d+)?/);
                    const match = numberMatchFromUrl || numberMatchFromName;
                    const number = match ? parseFloat(match[0]) : null;

                    return {
                        url: chapterUrl,
                        name: name,
                        number: number,
                    };
                }
            }
            return null;
        }).filter(c => c !== null);

        return chapters.reverse();
    }

    async function fetchChapterContent(chapterUrl) {
        const html = await http.get(chapterUrl);
        const doc = parseHtml(html);

        const contentElement =
            doc.querySelector('#chapterText') ||
            doc.querySelector('.chapter-text-content') ||
            doc.querySelector('.reader-content-inner') ||
            doc.querySelector('.reader-container') ||
            doc.querySelector('.chapter-content') ||
            doc.querySelector('.entry-content') ||
            doc.querySelector('.post-content') ||
            doc.querySelector('article .content') ||
            doc.querySelector('article') ||
            doc.querySelector('main');

        const primaryStats = _paragraphStatsFrom(contentElement);
        let chapterHtml = primaryStats.html;
        let kept = primaryStats.kept;
        let filtered = primaryStats.filtered;

        if (!chapterHtml || chapterHtml.length < 120) {
            const paragraphNodes = doc.querySelectorAll(
                '.reader-content-inner p, .reader-container p, .chapter-content p, .entry-content p, .post-content p, article p, main p'
            ) || [];
            const allParagraphs = paragraphNodes
                .map(node => (node.text || '').replace(/\s+/g, ' ').trim())
                .filter(text => text.length > 0);
            const paragraphs = allParagraphs
                .filter(text =>
                    !/window\.pubfuturetag|pubfuturetag\.push|pf-\d+-\d+/i.test(text) &&
                    !(
                        text.length <= 260 &&
                        /ko\*?lno\*?vel|kolnovel|kolno\*?vel|kolno-?vel|\.com/i.test(text) &&
                        /(رواياتنا|موقع|site|read|اقرأ|إقرأ)/i.test(text)
                    )
                );
            filtered += Math.max(0, allParagraphs.length - paragraphs.length);
            kept += paragraphs.length;
            if (paragraphs.length > 0) {
                chapterHtml = paragraphs.map(text => `<p>${text}</p>`).join('\n');
            }
        }

        console.log(`[MTL] kept ${kept} paragraphs, filtered ${filtered}`);
        return {
            html: chapterHtml || ''
        };
    }

    // Export to global scope
    globalThis.fetchPopular = fetchPopular;
    globalThis.fetchLatestUpdates = fetchLatestUpdates;
    globalThis.search = search;
    globalThis.fetchNovelDetail = fetchNovelDetail;
    globalThis.fetchChapterList = fetchChapterList;
    globalThis.fetchChapterContent = fetchChapterContent;

    console.log('[MTL] Extension functions initialized and exported.');
})();
