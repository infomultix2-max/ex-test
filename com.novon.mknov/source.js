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
        if (!html) return null;
        
        const nextDataRegex = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;
        const nextDataMatch = html.match(nextDataRegex);
        if (nextDataMatch && nextDataMatch[1]) {
            try { return JSON.parse(nextDataMatch[1]); } catch (e) {}
        }

        try {
            const flightRegex = /self\.__next_f\.push\(\[\d+,\s*\"((?:[^\"\\]|\\.)*)\"\]\)/g;
            let match;
            let combinedData = '';
            while ((match = flightRegex.exec(html)) !== null) {
                let part = match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                combinedData += part;
            }
            
            const keys = ["id", "chapter", "chapters", "novel", "novels", "works", "searchResults", "work", "latestWorks", "mostReadWorks", "results"];
            
            for (const key of keys) {
                const markers = [`"${key}":`, `\\"${key}\\":`];
                for (const marker of markers) {
                    let lastIdx = 0;
                    while ((lastIdx = combinedData.indexOf(marker, lastIdx)) !== -1) {
                        let braceStart = combinedData.lastIndexOf('{', lastIdx);
                        if (braceStart === -1 || (combinedData.lastIndexOf('[', lastIdx) > braceStart)) {
                            braceStart = combinedData.lastIndexOf('[', lastIdx);
                        }
                        
                        if (braceStart !== -1) {
                            const chunk = combinedData.substring(braceStart);
                            let open = 0;
                            let started = false;
                            for (let j = 0; j < Math.min(chunk.length, 100000); j++) {
                                if (chunk[j] === '{' || chunk[j] === '[') { open++; started = true; }
                                else if (chunk[j] === '}' || chunk[j] === ']') { open--; }
                                if (started && open === 0) {
                                    try {
                                        const sub = chunk.substring(0, j + 1);
                                        const parsed = JSON.parse(sub);
                                        // If it's the right object, it should have the key or be the array itself
                                        if (parsed.hasOwnProperty(key)) return parsed;
                                        if (Array.isArray(parsed) && marker.includes("chapters")) return parsed;
                                    } catch (e) {}
                                }
                            }
                        }
                        lastIdx += marker.length;
                    }
                }
            }
        } catch (e) {}
        return null;
    }

    function extractNovelId(url) {
        const match = (url || '').match(/\/novel\/(\d+)/);
        return match ? match[1] : null;
    }

    async function fetchPopular(page) {
        const path = page === 1 ? '/' : `/?page=${page}`;
        const html = await getWithFallback(path);
        const data = extractData(html);
        
        let novels = [];
        let hasNextPage = false;

        if (data) {
            const novelsData = data.novels || data.works || data.latestWorks || data.mostReadWorks;
            if (novelsData && Array.isArray(novelsData.data || novelsData)) {
                const list = novelsData.data || novelsData;
                novels = list.map(item => ({
                    url: toAbsolute(`/novel/${item.id}/${item.slug || ''}`),
                    title: item.title || item.name,
                    coverUrl: item.cover || item.image_url ? toAbsolute(item.cover || item.image_url) : ''
                }));
                hasNextPage = novelsData.next_page_url !== undefined ? novelsData.next_page_url !== null : false;
            }
        } 
        
        if (novels.length === 0) {
            const doc = parseHtml(html);
            novels = doc.querySelectorAll("a[href^='/novel/']").map(element => {
                const href = element.attr('href') || '';
                if (href.includes('/chapter/')) return null;
                const titleTag = element.querySelector('h3') || element.querySelector('h2') || element.querySelector('b');
                const imgTag = element.querySelector('img');
                if (titleTag || imgTag) {
                    return {
                        url: toAbsolute(href),
                        title: (titleTag ? titleTag.text : (imgTag ? imgTag.attr('alt') : 'Unknown')).trim(),
                        coverUrl: _pickImageUrl(imgTag)
                    };
                }
                return null;
            }).filter(n => n && n.title && n.title !== 'الرئيسية');
            
            const seen = new Set();
            novels = novels.filter(n => {
                const k = n.url;
                if (seen.has(k)) return false;
                seen.add(k);
                return true;
            });
            hasNextPage = novels.length > 0 && page < 20;
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

        if (data) {
            const novelsData = data.searchResults || data.novels || data.works || data.results || data.searchResultsBlock;
            if (novelsData) {
                const list = Array.isArray(novelsData.data) ? novelsData.data : (Array.isArray(novelsData) ? novelsData : null);
                if (list) {
                    novels = list.map(item => ({
                        url: toAbsolute(`/novel/${item.id}/${item.slug || ''}`),
                        title: item.title || item.name,
                        coverUrl: (item.cover || item.image_url) ? toAbsolute(item.cover || item.image_url) : ''
                    }));
                    
                    const meta = novelsData.meta || {};
                    const lastPage = meta.last_page || meta.lastPage || 0;
                    const currentPage = meta.current_page || meta.currentPage || page;
                    hasNextPage = lastPage > currentPage;
                    
                    if (novelsData.next_page_url) hasNextPage = true;
                }
            }
        } 
        
        if (novels.length === 0) {
            const doc = parseHtml(html);
            const resultLinks = doc.querySelectorAll("a[href*='/novel/']");
            novels = resultLinks.map(element => {
                const href = element.attr('href') || '';
                if (href.includes('/chapter/')) return null;
                
                const titleNode = element.querySelector('h3, h2, b, strong, .title');
                const title = (titleNode ? titleNode.text : element.text).trim();
                if (!title || title === 'الرئيسية' || title.length < 2) return null;

                const imgTag = element.querySelector('img');
                return {
                    url: toAbsolute(href),
                    title: title,
                    coverUrl: _pickImageUrl(imgTag)
                };
            }).filter(n => n && n.title);
            
            const seen = new Set();
            novels = novels.filter(n => {
                const k = n.url;
                if (seen.has(k)) return false;
                seen.add(k);
                return true;
            });
            hasNextPage = novels.length > 0;
        }

        return { novels, hasNextPage };
    }

    async function fetchNovelDetail(novelUrl) {
        const id = extractNovelId(novelUrl);
        
        // Primary: Use clean API provided by user
        if (id) {
            try {
                const apiResult = await http.get(`${PRIMARY_BASE}/api/novels/${id}`);
                const json = JSON.parse(apiResult);
                if (json.success && json.data) {
                    const novel = json.data;
                    return {
                        url: toAbsolute(novelUrl),
                        title: novel.name || novel.title,
                        author: novel.author || 'Unknown',
                        description: (novel.story || novel.description || '').trim(),
                        status: (novel.status || '').toLowerCase() === 'ongoing' ? 'ongoing' : ((novel.status || '').toLowerCase() === 'completed' ? 'completed' : 'unknown'),
                        genres: Array.isArray(novel.tags) ? novel.tags : ((novel.categories || []).map(c => c.name)),
                        coverUrl: (novel.image_url || novel.cover) ? toAbsolute(novel.image_url || novel.cover) : ''
                    };
                }
            } catch (e) {
                console.log('[MKNOV] API Novel Detail failed: ' + e);
            }
        }

        // Secondary: Extract from page data (RSC)
        const html = await getWithFallback(novelUrl);
        const data = extractData(html);
        if (data && (data.novel || data.work)) {
            const novel = data.novel || data.work;
            return {
                url: toAbsolute(novelUrl),
                title: novel.title || novel.name,
                author: novel.author || 'Unknown',
                description: (novel.description || novel.summary || '').trim(),
                status: (novel.status || '').includes('مستمرة') ? 'ongoing' : ((novel.status || '').includes('مكتملة') ? 'completed' : 'unknown'),
                genres: (novel.categories || []).map(c => c.name),
                coverUrl: (novel.cover || novel.image_url) ? toAbsolute(novel.cover || novel.image_url) : ''
            };
        } 
        
        // Final fallback: DOM parsing
        const doc = parseHtml(html);
        const titleNode = doc.querySelector('h1') || doc.querySelector('h2');
        const authorNode = doc.querySelector('.author') || doc.querySelector('a[href*="/writer/"]');
        const descNode = doc.querySelector('.description') || doc.querySelector('.summary') || doc.querySelector('.entry-content');
        const coverNode = doc.querySelector('.thumb img') || doc.querySelector('.novel-cover img') || doc.querySelector('img[src*="/uploads/"]');
        
        return {
            url: toAbsolute(novelUrl),
            title: (titleNode ? titleNode.text : 'Unknown').trim(),
            author: (authorNode ? authorNode.text : 'Unknown').trim(),
            description: (descNode ? descNode.text : '').trim(),
            status: 'unknown',
            genres: doc.querySelectorAll('.genre a, .categories a, .mgen a').map(a => a.text.trim()),
            coverUrl: _pickImageUrl(coverNode)
        };
    }

    async function fetchChapterList(novelUrl) {
        const id = extractNovelId(novelUrl);
        if (!id) throw new Error('Invalid novel URL');

        // Primary: Attempt /api/novels/{id} as it contains chapters too
        try {
            const apiResult = await http.get(`${PRIMARY_BASE}/api/novels/${id}`);
            const json = JSON.parse(apiResult);
            if (json.success && json.data && json.data.chapters) {
                return json.data.chapters.map(item => ({
                    url: toAbsolute(`/novel/${id}/chapter/${item.id}`),
                    name: (item.volume_title ? `${item.volume_title} : ` : '') + (item.chapter_title || 'فصل ' + item.chapter_number),
                    number: item.chapter_number
                })).sort((a, b) => (a.number || 0) - (b.number || 0));
            }
        } catch (e) {}

        // Secondary: Use specific chapters API
        try {
            const apiUrl = `${PRIMARY_BASE}/api/works/${id}/chapters`;
            const jsonStr = await http.get(apiUrl);
            const response = JSON.parse(jsonStr);
            if (response && response.success && response.data) {
                return response.data.map(item => ({
                    url: toAbsolute(`/novel/${id}/chapter/${item.id}`),
                    name: (item.volume_title ? `${item.volume_title} : ` : '') + (item.chapter_title || 'فصل ' + item.chapter_number),
                    number: item.chapter_number
                })).sort((a, b) => (a.number || 0) - (b.number || 0));
            }
        } catch (e) {}

        // Tertiary: Extract from RSC page data
        const html = await getWithFallback(novelUrl);
        const data = extractData(html);
        if (data && (data.chapters || (data.work && data.work.chapters))) {
            const chaptersData = data.chapters || data.work.chapters;
            return chaptersData.map(item => ({
                url: toAbsolute(`/novel/${id}/chapter/${item.id}`),
                name: (item.volume_title ? `${item.volume_title} : ` : '') + (item.chapter_title || 'فصل ' + item.chapter_number),
                number: item.chapter_number
            })).sort((a, b) => (a.number || 0) - (b.number || 0));
        }

        return [];
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
            const contentElement = doc.querySelector('.reading-content') || doc.querySelector('#chapter-content') || doc.querySelector('article') || doc.querySelector('.entry-content');
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

    console.log('[MKNOV] Extension initialized with API-first detail fetching.');
})();
