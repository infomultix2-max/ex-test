(function () {
    const PRIMARY_BASE = 'https://free.kolnovel.com';
    const FALLBACK_BASES = [
        'https://www.kolnovel.com',
        'https://kolnovel.com',
    ];

    async function getWithFallback(pathOrUrl) {
        const isAbsolute = /^https?:\/\//i.test(pathOrUrl || '');
        const candidates = [];
        if (isAbsolute) {
            candidates.push(pathOrUrl);
        } else {
            candidates.push(PRIMARY_BASE + pathOrUrl);
            FALLBACK_BASES.forEach(base => candidates.push(base + pathOrUrl));
        }

        let lastError = null;
        for (const url of candidates) {
            try {
                return await http.get(url);
            } catch (e) {
                lastError = e;
            }
        }
        if (lastError) throw lastError;
        throw new Error('No valid URL candidate');
    }

    function toAbsolute(url) {
        const raw = (url || '').trim();
        if (!raw) return '';
        if (/^https?:\/\//i.test(raw)) return raw;
        if (raw.startsWith('//')) return `https:${raw}`;
        if (raw.startsWith('/')) return `${PRIMARY_BASE}${raw}`;
        return `${PRIMARY_BASE}/${raw}`;
    }

    function _decodeEntities(input) {
        return (input || '')
            .replace(/&amp;/gi, '&')
            .replace(/&#x2F;/gi, '/')
            .replace(/&#47;/gi, '/')
            .replace(/&quot;/gi, '"')
            .replace(/&#39;/gi, "'");
    }

    function _normalizeCoverUrl(raw) {
        let u = _decodeEntities((raw || '').trim());
        if (!u) return '';
        if (u.startsWith('data:')) return '';
        if (u.includes(',')) {
            u = u.split(',')[0].trim().split(/\s+/)[0].trim();
        } else if (/\s\d+w$/.test(u)) {
            u = u.split(/\s+/)[0].trim();
        }
        return toAbsolute(u);
    }

    function _pickImageUrl(node) {
        if (!node) return '';
        const srcset = node.attr('srcset') || node.attr('data-srcset') || '';
        if (srcset) {
            const first = srcset.split(',')[0].trim().split(/\s+/)[0];
            const picked = _normalizeCoverUrl(first);
            if (picked) return picked;
        }
        const candidates = [
            node.attr('content'),
            node.attr('data-src'),
            node.attr('data-lazy-src'),
            node.attr('data-original'),
            node.attr('data-url'),
            node.attr('src'),
        ];
        for (const c of candidates) {
            const picked = _normalizeCoverUrl(c || '');
            if (picked) return picked;
        }
        return '';
    }

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
            '.sharedaddy',
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
                if ('innerHTML' in n) {
                    n.innerHTML = '';
                }
            });
        });
    }

    function _normalizeParagraphText(text) {
        return (text || '')
            // --- Watermark patterns ---
            // Broad pattern: only trigger when a literal * wraps Arabic site-name keywords
            // Removed short fragments (ko/k0/lno/vel) – they are too risky for legitimate text
            .replace(/[^.!?،\n]*\*[^.!?،\n]*(?:روايات|رواياتنا|موقع|\.com)[^.!?،\n]*/gi, ' ')
            .replace(/(?:إ?قرأ|اقرأ)?\s*رواياتنا[\s\S]*?(?:\.com|كوم)?/gi, ' ')
            .replace(/موقع\s*ملوك\s*الروايات[\s\S]*?(?:\.com|كوم)?/gi, ' ')
            .replace(/(^|[\s\u00A0])\.?\s*c\s*o\s*m\.?(?=\s|$)/gi, ' ')
            .replace(/(?:^|[\s\u00A0])\.?\s*c\s*o\s*m\.?\s*(?=[\u0600-\u06FFA-Za-z0-9])/gi, ' ')
            // Fixed: require القرآن to actually be present; do NOT use bare $ which eats the whole paragraph
            .replace(/ترجمة\s*[^\n]*القرآن[^\n]*/gi, ' ')
            .replace(/\[\s*ملاحظة\s*:[\s\S]*?\]/gi, ' ')
            .replace(/window\.pubfuturetag[\s\S]*?(?:\}|\)|;|$)/gi, ' ')
            .replace(/pubfuturetag\.push\([\s\S]*?(?:\}|\)|;|$)/gi, ' ')
            .replace(/pubfuturetag/gi, ' ')
            .replace(/pf-\d+-\d+/gi, ' ')
            .replace(/\*+\s*إ?قرأ\s*\*+/gi, ' ')
            .replace(/ko\*?\s*lno\*?\s*vel(?:\s*\.\s*com)?/gi, ' ')
            .replace(/kolnovel(?:\s*\.\s*com)?/gi, ' ')
            .replace(/ملوك\s*الروايات/gi, ' ')
            .replace(/ترجمة\s*موقع[\s\S]*$/gi, ' ')
            // --- Repeated-digit noise lines (e.g. 222222222, 1111111111) ---
            .replace(/(\d)\1{4,}/g, ' ')
            // --- PHP code injection noise ---
            .replace(/\?>\s*$/gi, ' ')
            .replace(/<\?php\b[\s\S]*?(?:\?>|$)/gi, ' ')
            .replace(/\$\w+\s*=\s*random_bytes\s*\([\s\S]*?\)\s*;/gi, ' ')
            .replace(/echo\s+bin2hex\s*\([\s\S]*?\)\s*;/gi, ' ')
            .replace(/random_bytes\s*\(\d+\)\s*;?/gi, ' ')
            .replace(/bin2hex\s*\([\s\S]*?\)\s*;?/gi, ' ')
            .replace(/\$\w+\s*=\s*[^;]+;/gi, ' ')
            // --- Separator lines ---
            .replace(/---+/g, ' ')
            // --- Cleanup ---
            .replace(/\s+/g, ' ')
            .trim();
    }

    function _canonicalParagraphKey(text) {
        return (text || '')
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s]/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function _isNoiseText(text) {
        const t = _normalizeParagraphText(text);
        if (!t) return true;
        if (t.length <= 2) return true;

        // Pure digits / repeated characters
        if (/^\d+$/.test(t)) return true;
        if (/^(.)\1{4,}$/.test(t)) return true;

        // PHP / code remnants
        if (/random_bytes|bin2hex|\$bytes|\$\w+\s*=|<\?php|\?>/i.test(t)) return true;
        if (/^php\b/i.test(t)) return true;

        // URL / com-only fragments
        if (/^(?:[.\-:|]+\s*)?(?:c\s*o\s*m)\.?$/i.test(t)) return true;
        if (/^(?:[.\-:|]+\s*)?(?:c\s*o\s*m)\b/i.test(t)) return true;
        if (/^(?:\.?\s*com|com\.?)$/i.test(t)) return true;
        if (/^(https?:\/\/|www\.)/i.test(t)) return true;

        // Arabic noise markers
        if (/^\[\s*ملاحظة\s*:/i.test(t)) return true;
        if (/^(chapter|الفصل)\b[:\s\d.-]*$/i.test(t)) return true;
        if (/ترجمة.*(القرآن|الصلوات|لا تنسوا|اوقاتها|أوقاتها)/i.test(t)) return true;

        // pubfuturetag / ad injection remnants
        if (/pubfuturetag|pf-\d+-\d+/i.test(t)) return true;

        // Separator-only lines
        if (/^[-—–=*_\s]+$/.test(t)) return true;

        return false;
    }

    /**
     * Collect paragraphs using first-occurrence deduplication with index sorting.
     *
     * KolNovel intentionally repeats real paragraphs (sometimes 2-3×) mixed with
     * noise paragraphs as an anti-scraping technique.  We track the FIRST position
     * at which each unique paragraph appears (canonical key = stripped text) and
     * sort by that index to preserve narrative order.  When multiple copies exist,
     * we keep the LONGEST text (fewest watermark remnants).
     */
    function _collectCleanParagraphs(node) {
        const all = (node.querySelectorAll('p') || [])
            .map(p => _normalizeParagraphText(p.text || ''))
            .filter(t => t.length > 0);

        // If very few <p> tags found, also try splitting innerHTML on <br> tags
        // (some KolNovel chapters wrap content in <div> blocks with <br> separators)
        let source = all;
        if (all.length < 3) {
            const rawHtml = (node.innerHTML || '');
            const brParts = rawHtml
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<\/p>/gi, '\n')
                .replace(/<[^>]+>/g, '')
                .split('\n')
                .map(t => _normalizeParagraphText(t))
                .filter(t => t.length > 2);
            if (brParts.length > all.length) {
                source = brParts;
            }
        }

        // Map from canonical key → { text, index }
        // Strategy: sort by FIRST occurrence (preserves narrative order even when
        // the site appends watermarked copies of earlier paragraphs at the end).
        // Text is updated to the LONGEST version seen (more content = cleaner copy).
        const seenMap = new Map();
        source.forEach((t, i) => {
            if (_isNoiseText(t)) return;
            const key = _canonicalParagraphKey(t);
            if (!key) return;
            if (!seenMap.has(key)) {
                // First occurrence – record position and text
                seenMap.set(key, { text: t, index: i });
            } else {
                const existing = seenMap.get(key);
                // Keep earliest index for correct narrative order.
                // Prefer the longer text (fewer watermark remnants).
                const betterText = t.length > existing.text.length ? t : existing.text;
                seenMap.set(key, { text: betterText, index: existing.index });
            }
        });

        // Sort by first-seen index to restore narrative order
        const kept = Array.from(seenMap.values())
            .sort((a, b) => a.index - b.index)
            .map(v => v.text);

        return { all: source, kept };
    }

    function _paragraphHtmlFrom(node) {
        if (!node) return '';
        _cleanChapterDom(node);
        const paragraphs = _collectCleanParagraphs(node).kept;
        if (paragraphs.length >= 2) {
            return paragraphs.map(t => `<p>${t}</p>`).join('\n');
        }
        return (node.innerHTML || '').trim();
    }

    function _paragraphStatsFrom(node) {
        if (!node) return { html: '', total: 0, kept: 0, filtered: 0 };
        _cleanChapterDom(node);
        const collected = _collectCleanParagraphs(node);
        const all = collected.all;
        const kept = collected.kept;
        return {
            html: kept.length >= 2 ? kept.map(t => `<p>${t}</p>`).join('\n') : (node.innerHTML || '').trim(),
            total: all.length,
            kept: kept.length,
            filtered: all.length - kept.length,
        };
    }

    async function fetchPopular(page) {
        const path = page === 1 ? '/' : `/page/${page}/`;
        const html = await getWithFallback(path);
        const doc = parseHtml(html);

        const novels = doc.querySelectorAll('.bsx').map(element => {
            const aTag = element.querySelector('a');
            const imgTag = element.querySelector('img');

            if (aTag) {
                const novelUrl = toAbsolute(aTag.attr('href') || '');
                const title = aTag.attr('title') || imgTag.attr('alt') || 'Unknown Title';
                const coverUrl = _pickImageUrl(imgTag);

                return { url: novelUrl, title: title, coverUrl: coverUrl };
            }
            return null;
        }).filter(n => n !== null);

        return { novels: novels, hasNextPage: novels.length > 0 };
    }

    async function fetchLatestUpdates(page) {
        return await fetchPopular(page);
    }

    async function search(query, page) {
        const rawQuery = (query || '').trim();
        const encoded = encodeURIComponent(rawQuery);
        const searchUrlCandidates = page <= 1
            ? [
                `/?s=${rawQuery}`,
                `/search?q=${rawQuery}`,
                `/?s=${encoded}`,
                `/search?q=${encoded}`,
            ]
            : [
                `/page/${page}/?s=${rawQuery}`,
                `/?s=${rawQuery}&page=${page}`,
                `/search?q=${rawQuery}&page=${page}`,
                `/page/${page}/?s=${encoded}`,
                `/?s=${encoded}&page=${page}`,
                `/search?q=${encoded}&page=${page}`,
            ];

        let html = '';
        let lastError = null;
        for (const path of searchUrlCandidates) {
            try {
                html = await getWithFallback(path);
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

        const isLikelyNovelUrl = (href) => {
            const url = (href || '').trim().toLowerCase();
            if (!url || url === '/' || url.includes('#')) return false;
            if (url.includes('/genre/') || url.includes('/tag/') || url.includes('/category/')) return false;
            if (url.includes('/author/') || url.includes('/writer/')) return false;
            if (url.includes('/discord') || url.includes('/contact') || url.includes('/privacy')) return false;
            if (url.includes('/wp-') || url.includes('/feed')) return false;
            return true;
        };

        const resultCandidates = [];
        const addFromContainer = (container) => {
            if (!container) return;
            const headingLink =
                container.querySelector('h2 a') ||
                container.querySelector('h3 a') ||
                container.querySelector('.post-title a') ||
                container.querySelector('a[title]');
            const aTag = headingLink || container.querySelector('a');
            if (!aTag) return;

            const rawHref = aTag.attr('href') || '';
            if (!isLikelyNovelUrl(rawHref)) return;
            const novelUrl = toAbsolute(rawHref);

            const title =
                (aTag.attr('title') || '') ||
                (aTag.text || '') ||
                ((container.querySelector('h2') || container.querySelector('h3') || {}).text || '') ||
                'Unknown Title';
            const trimmedTitle = (title || '').replace(/\s+/g, ' ').trim();
            if (!trimmedTitle || trimmedTitle.length < 2) return;
            if (/الفصل|chapter/i.test(trimmedTitle)) return;

            const imgTag = container.querySelector('img');
            const coverUrl = _pickImageUrl(imgTag);
            resultCandidates.push({
                url: novelUrl,
                title: trimmedTitle,
                coverUrl: coverUrl,
            });
        };

        (doc.querySelectorAll('.listupd .bs, .search-result .item, .post, article, .utao .uta') || [])
            .forEach(addFromContainer);

        if (resultCandidates.length === 0) {
            (doc.querySelectorAll('h2 a, h3 a') || []).forEach(aTag => {
                const rawHref = aTag.attr('href') || '';
                if (!isLikelyNovelUrl(rawHref)) return;
                const title = (aTag.text || '').replace(/\s+/g, ' ').trim();
                if (!title || /الفصل|chapter/i.test(title)) return;
                resultCandidates.push({
                    url: toAbsolute(rawHref),
                    title: title,
                    coverUrl: '',
                });
            });
        }

        const dedup = new Map();
        resultCandidates.forEach(n => {
            if (!dedup.has(n.url)) dedup.set(n.url, n);
        });
        const novels = Array.from(dedup.values());

        return { novels: novels, hasNextPage: novels.length > 0 };
    }

    function _cleanDescriptionText(text) {
        return (text || '')
            .replace(/window\.pubfuturetag[\s\S]*?(?=(نشأ|ومع ذلك|والأسوأ|$))/gi, ' ')
            .replace(/pubfuturetag[\s\S]*?(?=(نشأ|ومع ذلك|والأسوأ|$))/gi, ' ')
            .replace(/(\d)\1{4,}/g, '')
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    async function fetchNovelDetail(novelUrl) {
        const html = await getWithFallback(toAbsolute(novelUrl));
        const doc = parseHtml(html);

        const titleTag = doc.querySelector('h1.entry-title');
        const title = titleTag ? titleTag.text : 'Unknown Title';

        const authorTag = doc.querySelector('a[href*="/writer/"]');
        const author = authorTag ? authorTag.text : 'Unknown Author';

        const statusElement = doc.querySelector('.status');
        const statusText = (statusElement ? statusElement.text : '').toLowerCase();
        let status = 'unknown';
        if (statusText.includes('مستمرة') || statusText.includes('ongoing')) {
            status = 'ongoing';
        } else if (statusText.includes('مكتملة') || statusText.includes('completed')) {
            status = 'completed';
        }

        const genres = doc.querySelectorAll('.genre-info a, .mgen a, .genres-content a').map(a => a.text.trim());
        const synopsisNode =
            doc.querySelector('.sersys.entry-content[itemprop="description"]') ||
            doc.querySelector('.sersys.entry-content') ||
            doc.querySelector('.summary__content') ||
            doc.querySelector('.summary__content p') ||
            doc.querySelector('.description-summary') ||
            doc.querySelector('.post-content_item .summary-content') ||
            doc.querySelector('.entry-content p');
        let description = synopsisNode ? _cleanDescriptionText(synopsisNode.text || '') : '';
        const chapterLikeHits = (description.match(/الفصل|chapter/gi) || []).length;
        if (chapterLikeHits > 6 || description.length > 6000) {
            description = '';
        }
        const coverNode =
            doc.querySelector('meta[property="og:image"]') ||
            doc.querySelector('meta[name="og:image"]') ||
            doc.querySelector('meta[property="twitter:image"]') ||
            doc.querySelector('meta[name="twitter:image"]') ||
            doc.querySelector('.seriestu img') ||
            doc.querySelector('.infomanga .thumb img') ||
            doc.querySelector('.thumb img') ||
            doc.querySelector('.info-image img') ||
            doc.querySelector('.summary_image img') ||
            doc.querySelector('img');
        const coverUrl = _pickImageUrl(coverNode);

        return {
            url: toAbsolute(novelUrl),
            title: title,
            author: author,
            description: description,
            status: status,
            genres: genres,
            coverUrl: coverUrl,
        };
    }

    async function fetchChapterList(novelUrl) {
        const html = await getWithFallback(toAbsolute(novelUrl));
        const doc = parseHtml(html);

        const chapterItems = doc.querySelectorAll('.eplister ul li, .clstyle li, ul.clss li') || [];
        const chapters = chapterItems.map(element => {
            const aTag = element.querySelector('a');
            const numTag = element.querySelector('.epl-num');
            const titleTag = element.querySelector('.epl-title');
            const nameTag = element.querySelector('.chaptername');

            if (aTag) {
                const chapterUrl = toAbsolute(aTag.attr('href') || '');
                const parts = [
                    (numTag ? numTag.text : ''),
                    (titleTag ? titleTag.text : ''),
                    (nameTag ? nameTag.text : ''),
                    (aTag.text || ''),
                ]
                    .map(t => (t || '').replace(/\s+/g, ' ').trim())
                    .filter(Boolean);
                const dedupParts = [];
                parts.forEach(part => {
                    const exists = dedupParts.some(x => x === part || x.includes(part) || part.includes(x));
                    if (!exists) dedupParts.push(part);
                });
                const name = dedupParts.join(' ').replace(/\s+/g, ' ').trim();
                const match = name.match(/\d+(\.\d+)?/);
                const number = match ? parseFloat(match[0]) : null;

                return { url: chapterUrl, name: name, number: number };
            }
            return null;
        }).filter(c => c !== null);

        const dedup = new Map();
        chapters.forEach(c => {
            if (!dedup.has(c.url)) dedup.set(c.url, c);
        });
        return Array.from(dedup.values()).reverse();
    }

    async function fetchChapterContent(chapterUrl) {
        const html = await getWithFallback(toAbsolute(chapterUrl));
        const doc = parseHtml(html);

        const contentElement =
            doc.querySelector('.ep-content') ||
            doc.querySelector('.entry-content') ||
            doc.querySelector('.reading-content') ||
            doc.querySelector('.post-content') ||
            doc.querySelector('#chapter-content') ||
            doc.querySelector('article .content') ||
            doc.querySelector('article') ||
            doc.querySelector('main');
        const primaryStats = _paragraphStatsFrom(contentElement);
        let chapterHtml = primaryStats.html;
        let kept = primaryStats.kept;
        let filtered = primaryStats.filtered;

        if (!chapterHtml || chapterHtml.length < 120) {
            const fallbackAll = (doc.querySelectorAll(
                '.ep-content p, .entry-content p, .reading-content p, .post-content p, article p, main p'
            ) || [])
                .map(p => _normalizeParagraphText(p.text || ''))
                .filter(t => t.length > 0);

            // Same first-occurrence + index-sort logic for the fallback path
            const fallbackMap = new Map();
            fallbackAll.forEach((t, i) => {
                if (_isNoiseText(t)) return;
                const key = _canonicalParagraphKey(t);
                if (!key) return;
                if (!fallbackMap.has(key)) {
                    fallbackMap.set(key, { text: t, index: i });
                } else {
                    const existing = fallbackMap.get(key);
                    const betterText = t.length > existing.text.length ? t : existing.text;
                    fallbackMap.set(key, { text: betterText, index: existing.index });
                }
            });
            const fallbackParagraphs = Array.from(fallbackMap.values())
                .sort((a, b) => a.index - b.index)
                .map(v => v.text);

            filtered += Math.max(0, fallbackAll.filter(t => t.length > 0).length - fallbackParagraphs.length);
            kept += fallbackParagraphs.length;
            if (fallbackParagraphs.length > 0) {
                chapterHtml = fallbackParagraphs.map(t => `<p>${t}</p>`).join('\n');
            }
        }

        console.log(`[KOL] kept ${kept} paragraphs, filtered ${filtered}`);
        return { html: chapterHtml || '' };
    }

    globalThis.fetchPopular = fetchPopular;
    globalThis.fetchLatestUpdates = fetchLatestUpdates;
    globalThis.search = search;
    globalThis.fetchNovelDetail = fetchNovelDetail;
    globalThis.fetchChapterList = fetchChapterList;
    globalThis.fetchChapterContent = fetchChapterContent;

    console.log('[KOL] Extension functions initialized and exported.');
})();