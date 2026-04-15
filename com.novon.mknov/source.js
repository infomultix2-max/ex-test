(function () {
    const PRIMARY_BASE = 'https://mknov.com';
    const FALLBACK_BASES = [
        'https://www.mknov.com',
    ];

    async function getWithFallback(pathOrUrl) {
        const isAbsolute = /^https?:\/\//i.test(pathOrUrl || '');
        const candidates = [];
        if (isAbsolute) {
            candidates.push(pathOrUrl);
        } else {
            candidates.push(PRIMARY_BASE + (pathOrUrl.startsWith('/') ? '' : '/') + pathOrUrl);
            FALLBACK_BASES.forEach(base => candidates.push(base + (pathOrUrl.startsWith('/') ? '' : '/') + pathOrUrl));
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
            'script', 'style', 'noscript', 'iframe', 'form', 'button',
            '.comments', '.comment', '.sharedaddy', '.code-block',
            '.ads', '.ad', '.advert', '.banner', '.navigation',
            '.nav-links', '.post-navigation', '.chapter-nav',
            '.nextprev', '.prevnext',
        ];
        removeSelectors.forEach(sel => {
            (root.querySelectorAll(sel) || []).forEach(n => {
                if (!n) return;
                if (typeof n.remove === 'function') {
                    n.remove();
                    return;
                }
                if ('innerHTML' in n) n.innerHTML = '';
            });
        });
    }

    function _normalizeParagraphText(text) {
        return (text || '')
            .replace(/[^.!?،\n]*\*[^.!?،\n]*(?:روايات|مملكة|مملكه|mknov|\.com)[^.!?،\n]*/gi, ' ')
            .replace(/(^|[\s\u00A0])\.?\s*c\s*o\s*m\.?(?=\s|$)/gi, ' ')
            .replace(/\[\s*ملاحظة\s*:[\s\S]*?\]/gi, ' ')
            .replace(/window\.pubfuturetag[\s\S]*?(?:\}|;|$)/gi, ' ')
            .replace(/pubfuturetag\.push\([\s\S]*?(?:\}|;|$)/gi, ' ')
            .replace(/(\d)\1{4,}/g, ' ')
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
        if (!t || t.length <= 2) return true;
        if (/^\d+$/.test(t)) return true;
        if (/^(.)\1{4,}$/.test(t)) return true;
        if (/pubfuturetag|pf-\d+-\d+/i.test(t)) return true;
        if (/^[-—–=*_\s]+$/.test(t)) return true;
        return false;
    }

    function _collectCleanParagraphs(node) {
        const all = (node.querySelectorAll('p') || [])
            .map(p => _normalizeParagraphText(p.text || ''))
            .filter(t => t.length > 0);

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
            if (brParts.length > all.length) source = brParts;
        }

        const seenMap = new Map();
        source.forEach((t, i) => {
            if (_isNoiseText(t)) return;
            const key = _canonicalParagraphKey(t);
            if (!key) return;
            if (!seenMap.has(key)) {
                seenMap.set(key, { text: t, index: i });
            } else {
                const existing = seenMap.get(key);
                const betterText = t.length > existing.text.length ? t : existing.text;
                seenMap.set(key, { text: betterText, index: existing.index });
            }
        });

        return Array.from(seenMap.values())
            .sort((a, b) => a.index - b.index)
            .map(v => v.text);
    }

    function _paragraphHtmlFrom(node) {
        if (!node) return '';
        _cleanChapterDom(node);
        const paragraphs = _collectCleanParagraphs(node);
        if (paragraphs.length >= 2) {
            return paragraphs.map(t => `<p>${t}</p>`).join('\n');
        }
        return (node.innerHTML || '').trim();
    }

    function extractData(html) {
        // Handle standard __NEXT_DATA__
        const nextDataRegex = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;
        const nextDataMatch = html.match(nextDataRegex);
        if (nextDataMatch && nextDataMatch[1]) {
            try {
                return JSON.parse(nextDataMatch[1]);
            } catch (e) {}
        }

        // Handle streaming flight data signals
        try {
            const flightRegex = /self\.__next_f\.push\(\[1, \"(.*?)\"\]\)/g;
            let match;
            let combinedData = '';
            while ((match = flightRegex.exec(html)) !== null) {
                // Unescape strings (QuickJS environment safe unescape)
                let part = match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                combinedData += part;
            }
            
            // Broaden search to include various React Server Component data keys
            const jsonRegex = /(\{(?:\"id\"|\"chapter\"|\"novel\"|\"novels\"|\"works\"|\"searchResults\"):[\s\S]*?\})(?=\]|$)/g;
            let jsonMatch;
            while ((jsonMatch = jsonRegex.exec(combinedData)) !== null) {
                try {
                    const parsed = JSON.parse(jsonMatch[1]);
                    if (parsed.chapter || parsed.novel || parsed.novels || parsed.works || parsed.searchResults) return parsed;
                } catch (e) {}
            }
        } catch (e) {}
        return null;
    }

    function extractNovelId(url) {
        const match = url.match(/\/novel\/(\d+)/);
        return match ? match[1] : null;
    }

    async function fetchPopular(page) {
        const path = page === 1 ? '/' : `/?page=${page}`;
        const html = await getWithFallback(path);
        const data = extractData(html);
        
        let novels = [];
        let hasNextPage = false;

        // Try JSON extraction first
        if (data && (data.novels || data.works)) {
            const novelsData = data.novels || data.works;
            novels = (novelsData.data || []).map(item => ({
                url: toAbsolute(`/novel/${item.id}/${item.slug || ''}`),
                title: item.title,
                coverUrl: item.cover ? toAbsolute(item.cover) : ''
            }));
            hasNextPage = novelsData.next_page_url !== null;
        } 
        
        // Fallback to DOM parsing if JSON failed or returned nothing
        if (novels.length === 0) {
            const doc = parseHtml(html);
            // Updated selector based on recent site inspection
            novels = doc.querySelectorAll("a.block[href^='/novel/']").map(element => {
                const imgTag = element.querySelector('img');
                const titleTag = element.querySelector('h3') || element.querySelector('h2');
                const href = element.attr('href') || '';
                
                if (href) {
                    return {
                        url: toAbsolute(href),
                        title: (titleTag ? titleTag.text : (imgTag ? imgTag.attr('alt') : 'Unknown Title')).trim(),
                        coverUrl: _pickImageUrl(imgTag)
                    };
                }
                return null;
            }).filter(Boolean);
            hasNextPage = novels.length > 0;
        }

        return { novels, hasNextPage };
    }

    async function fetchLatestUpdates(page) {
        return await fetchPopular(page);
    }

    async function search(query, page) {
        const url = `/search?query=${encodeURIComponent(query)}&page=${page}`;
        const html = await getWithFallback(url);
        const data = extractData(html);

        let novels = [];
        let hasNextPage = false;

        if (data && (data.novels || data.searchResults || data.works)) {
            const novelsData = data.novels || data.searchResults || data.works;
            novels = (novelsData.data || []).map(item => ({
                url: toAbsolute(`/novel/${item.id}/${item.slug || ''}`),
                title: item.title,
                coverUrl: item.cover ? toAbsolute(item.cover) : ''
            }));
            hasNextPage = novelsData.next_page_url !== null;
        } 
        
        if (novels.length === 0) {
            const doc = parseHtml(html);
            novels = doc.querySelectorAll("a.block[href^='/novel/']").map(element => {
                const imgTag = element.querySelector('img');
                const titleTag = element.querySelector('h3') || element.querySelector('h2');
                const href = element.attr('href') || '';
                
                if (href) {
                    return {
                        url: toAbsolute(href),
                        title: (titleTag ? titleTag.text : (imgTag ? imgTag.attr('alt') : 'Unknown Title')).trim(),
                        coverUrl: _pickImageUrl(imgTag)
                    };
                }
                return null;
            }).filter(Boolean);
            hasNextPage = novels.length > 0;
        }

        return { novels, hasNextPage };
    }

    async function fetchNovelDetail(novelUrl) {
        const html = await getWithFallback(novelUrl);
        const data = extractData(html);

        if (data && data.novel) {
            const novel = data.novel;
            return {
                url: toAbsolute(novelUrl),
                title: novel.title,
                author: novel.author || 'Unknown',
                description: novel.description || '',
                status: (novel.status || '').includes('مستمرة') ? 'ongoing' : 'completed',
                genres: (novel.categories || []).map(c => c.name),
                coverUrl: novel.cover ? toAbsolute(novel.cover) : ''
            };
        } else {
            const doc = parseHtml(html);
            const title = (doc.querySelector('h1') || {}).text || 'Unknown Title';
            const author = (doc.querySelector('.author') || doc.querySelector('a[href*="/writer/"]') || {}).text || 'Unknown Author';
            const description = (doc.querySelector('.description') || doc.querySelector('.summary') || doc.querySelector('.entry-content') || {}).text || '';
            const genres = doc.querySelectorAll('.genre a, .categories a, .mgen a').map(a => a.text.trim());
            const coverNode = doc.querySelector('.thumb img') || doc.querySelector('.novel-cover img') || doc.querySelector('img');
            
            return {
                url: toAbsolute(novelUrl),
                title: title.trim(),
                author: author.trim(),
                description: description.trim(),
                status: 'unknown',
                genres,
                coverUrl: _pickImageUrl(coverNode)
            };
        }
    }

    async function fetchChapterList(novelUrl) {
        const id = extractNovelId(novelUrl);
        if (!id) throw new Error('Invalid novel URL');

        const apiUrl = `${PRIMARY_BASE}/api/works/${id}/chapters`;
        const jsonStr = await http.get(apiUrl);
        const response = JSON.parse(jsonStr);

        if (!response || !response.success || !response.data) return [];

        const chapters = response.data.map(item => {
            const volTitle = item.volume_title ? `${item.volume_title} : ` : '';
            return {
                url: toAbsolute(`/novel/${id}/chapter/${item.id}`),
                name: `${volTitle}${item.chapter_title || 'فصل ' + item.chapter_number}`,
                number: item.chapter_number
            };
        });

        return chapters.sort((a, b) => (a.number || 0) - (b.number || 0));
    }

    async function fetchChapterContent(chapterUrl) {
        const html = await getWithFallback(chapterUrl);
        const data = extractData(html);

        let chapterHtml = '';

        if (data && data.chapter) {
            const content = data.chapter.content || '';
            if (!content.includes('<p>') && content.includes('\n')) {
                chapterHtml = content.split('\n').map(l => l.trim() ? `<p>${l}</p>` : '').join('');
            } else {
                chapterHtml = content;
            }
        } else {
            const doc = parseHtml(html);
            const contentElement = doc.querySelector('.reading-content') || doc.querySelector('#chapter-content') || doc.querySelector('article');
            chapterHtml = _paragraphHtmlFrom(contentElement);
        }

        return { html: chapterHtml || '' };
    }

    globalThis.fetchPopular = fetchPopular;
    globalThis.fetchLatestUpdates = fetchLatestUpdates;
    globalThis.search = search;
    globalThis.fetchNovelDetail = fetchNovelDetail;
    globalThis.fetchChapterList = fetchChapterList;
    globalThis.fetchChapterContent = fetchChapterContent;

    console.log('[MKNOV] Extension initialized with fixed selectors and RSC data support.');
})();
