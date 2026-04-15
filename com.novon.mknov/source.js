(function () {
    const BASE_URL = 'https://mknov.com';

    function toAbsolute(url) {
        const raw = (url || '').trim();
        if (!raw) return '';
        if (/^https?:\/\//i.test(raw)) return raw;
        if (raw.startsWith('//')) return `https:${raw}`;
        return `${BASE_URL}${raw.startsWith('/') ? '' : '/'}${raw}`;
    }

    /**
     * Extracts JSON data from Next.js App Router Flight signals (self.__next_f.push)
     * or standard __NEXT_DATA__ script tags.
     */
    function extractData(html) {
        // Try __NEXT_DATA__ first
        const nextDataRegex = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;
        const nextDataMatch = html.match(nextDataRegex);
        if (nextDataMatch && nextDataMatch[1]) {
            try {
                return JSON.parse(nextDataMatch[1]);
            } catch (e) {}
        }

        // Try to find JSON strings in App Router flight data
        try {
            const flightRegex = /self\.__next_f\.push\(\[1, \"(.*?)\"\]\)/g;
            let match;
            let combinedData = '';
            while ((match = flightRegex.exec(html)) !== null) {
                // Unescape the string content
                let part = match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                combinedData += part;
            }

            // Look for patterns like {"chapter":...} or {"novel":...}
            // Flight data is often split, so we search for the specific sub-JSON
            const jsonRegex = /(\{(?:\"id\"|\"chapter\"|\"novel\"|\"novels\"):[\s\S]*?\})(?=\]|$)/g;
            let jsonMatch;
            while ((jsonMatch = jsonRegex.exec(combinedData)) !== null) {
                try {
                    const parsed = JSON.parse(jsonMatch[1]);
                    // Return the first one that looks like our data
                    if (parsed.chapter || parsed.novel || parsed.novels) return parsed;
                } catch (e) {}
            }
        } catch (e) {
            console.log('Error extracting Flight data: ' + e);
        }
        return null;
    }

    function extractNovelId(url) {
        const match = url.match(/\/novel\/(\d+)/);
        return match ? match[1] : null;
    }

    async function fetchPopular(page) {
        const path = page === 1 ? '/' : `/?page=${page}`;
        const html = await http.get(toAbsolute(path));
        const data = extractData(html);
        
        // Fallback to DOM scraping if JSON extraction fails
        if (!data || !data.novels) {
            // DOM scraping logic (simplified for brevity, can be expanded)
            return { novels: [], hasNextPage: false };
        }

        const novelsData = data.novels;
        const novels = (novelsData.data || []).map(item => ({
            url: toAbsolute(`/novel/${item.id}/${item.slug || ''}`),
            title: item.title,
            coverUrl: item.cover ? toAbsolute(item.cover) : ''
        }));

        return { 
            novels, 
            hasNextPage: novelsData.next_page_url !== null 
        };
    }

    async function fetchLatestUpdates(page) {
        return await fetchPopular(page);
    }

    async function search(query, page) {
        const url = `${BASE_URL}/search?query=${encodeURIComponent(query)}&page=${page}`;
        const html = await http.get(url);
        const data = extractData(html);

        if (!data || !data.novels) {
            return { novels: [], hasNextPage: false };
        }

        const novelsData = data.novels;
        const novels = (novelsData.data || []).map(item => ({
            url: toAbsolute(`/novel/${item.id}/${item.slug || ''}`),
            title: item.title,
            coverUrl: item.cover ? toAbsolute(item.cover) : ''
        }));

        return { 
            novels, 
            hasNextPage: novelsData.next_page_url !== null 
        };
    }

    async function fetchNovelDetail(novelUrl) {
        const html = await http.get(toAbsolute(novelUrl));
        const data = extractData(html);

        if (!data || !data.novel) {
            throw new Error('Could not fetch novel details');
        }

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
    }

    async function fetchChapterList(novelUrl) {
        const id = extractNovelId(novelUrl);
        if (!id) throw new Error('Invalid novel URL');

        const apiUrl = `${BASE_URL}/api/works/${id}/chapters`;
        const jsonStr = await http.get(apiUrl);
        const response = JSON.parse(jsonStr);

        if (!response || !response.success || !response.data) {
            return [];
        }

        return response.data.map(item => {
            const volTitle = item.volume_title ? `${item.volume_title} : ` : '';
            return {
                url: toAbsolute(`/novel/${id}/chapter/${item.id}`),
                name: `${volTitle}${item.chapter_title || 'فصل ' + item.chapter_number}`,
                number: item.chapter_number
            };
        }).reverse();
    }

    async function fetchChapterContent(chapterUrl) {
        const html = await http.get(toAbsolute(chapterUrl));
        const data = extractData(html);

        if (!data || !data.chapter) {
            // Fallback to DOM if JSON extraction fails
            const contentMatch = html.match(/<div class=\"reading-content[\s\S]*?\">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/);
            if (contentMatch) {
                return { html: contentMatch[1].trim() };
            }
            return { html: '' };
        }

        const chapter = data.chapter;
        let content = chapter.content || '';

        // Wrap lines in <p> tags if it contains newlines but no tags
        if (!content.includes('<p>') && content.includes('\n')) {
            content = content.split('\n').map(line => line.trim() ? `<p>${line}</p>` : '').join('');
        }

        return {
            html: content.trim()
        };
    }

    globalThis.fetchPopular = fetchPopular;
    globalThis.fetchLatestUpdates = fetchLatestUpdates;
    globalThis.search = search;
    globalThis.fetchNovelDetail = fetchNovelDetail;
    globalThis.fetchChapterList = fetchChapterList;
    globalThis.fetchChapterContent = fetchChapterContent;
})();
