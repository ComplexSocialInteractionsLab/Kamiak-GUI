'use server';

import { SSHCredentials } from '../lib/ssh';

export interface SearchResult {
    title: string;
    link: string;
    snippet: string;
}

export async function searchWeb(query: string): Promise<{ success: boolean; results: SearchResult[]; error?: string }> {
    try {
        // Use a privacy-friendly public instance or direct DDG HTML scraping
        // Note: Direct scraping of DDG html is fragile but works without API keys for low volume.
        // We will strictly parse the HTML response from html.duckduckgo.com

        const params = new URLSearchParams({ q: query });
        const res = await fetch(`https://html.duckduckgo.com/html?${params}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (!res.ok) {
            throw new Error(`Search failed: ${res.statusText}`);
        }

        const html = await res.text();

        const results: SearchResult[] = [];

        // Split by result__body using Regex to handle variations (extra classes etc)
        const rawParts = html.split(/class="[^"]*result__body[^"]*"/);

        // Skip the first part (header/pre-intro)
        for (let i = 1; i < rawParts.length; i++) {
            if (results.length >= 5) break;

            const block = rawParts[i];

            // Extract Title & Link
            const linkMatch = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(block);

            // Extract Snippet
            // Look for any element matching the class. Capture until the closing </a> tag to include nested tags (like <b>).
            const snippetMatch = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(block);

            if (linkMatch) {
                let link = linkMatch[1];

                // Filter out Ads (y.js)
                if (link.includes('duckduckgo.com/y.js')) {
                    continue;
                }

                // Try to decode real URL from DDG tracking link (u or uddg parameter)
                if (link.includes('uddg=')) {
                    const uMatch = /[?&]uddg=([^&]+)/.exec(link);
                    if (uMatch) link = decodeURIComponent(uMatch[1]);
                } else if (link.includes('?u=')) {
                    const uMatch = /[?&]u=([^&]+)/.exec(link);
                    if (uMatch) link = decodeURIComponent(uMatch[1]);
                }

                // Clean title (remove HTML tags if any)
                const title = linkMatch[2].replace(/<[^>]+>/g, '').trim();
                const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '';

                // Ensure we have a valid link and title
                if (link && title) {
                    results.push({ title, link, snippet });
                }
            }
        }

        return { success: true, results };

    } catch (error) {
        console.error("Web Search Error:", error);
        return { success: false, error: (error as Error).message, results: [] };
    }
}

