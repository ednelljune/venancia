import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloneSeedPosts } from './content-data.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const publicApiBaseUrl = process.env.PUBLIC_API_BASE_URL || '';
const publicRoot = __dirname;
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '') || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const useSupabase = Boolean(supabaseUrl && supabaseServiceKey);

const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.json': 'application/json; charset=utf-8'
};

function contentHeaders(extra = {}) {
    if (!useSupabase) {
        return extra;
    }

    return {
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
        ...extra
    };
}

function corsHeaders(origin) {
    const allowedOrigins = new Set([
        'https://venancia.onrender.com',
        'https://www.venancia.com.au',
        'https://venancia.com.au'
    ]);

    const resolvedOrigin = origin || '';
    if (!allowedOrigins.has(resolvedOrigin)) {
        return {};
    }

    return {
        'Access-Control-Allow-Origin': resolvedOrigin,
        'Access-Control-Allow-Credentials': 'true',
        Vary: 'Origin'
    };
}

function supabasePath(pathname) {
    return `${supabaseUrl}/rest/v1${pathname}`;
}

async function supabaseRequest(pathname, options = {}) {
    if (!useSupabase) {
        throw new Error('Supabase is not configured.');
    }

    const response = await fetch(supabasePath(pathname), {
        ...options,
        headers: {
            Accept: 'application/json',
            ...contentHeaders(options.headers || {})
        }
    });

    return response;
}

function buildExcerpt(content) {
    const plainText = String(content || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (plainText.length <= 140) {
        return plainText;
    }

    return `${plainText.slice(0, 137).trim()}...`;
}

function rowToPost(row) {
    if (!row) {
        return null;
    }

    return {
        id: row.id,
        title: row.title,
        category: row.category,
        tagClass: row.tag_class || '',
        icon: row.icon || '',
        iconClass: row.icon_class || '',
        date: row.date,
        readTime: row.read_time,
        content: row.content,
        isAnnouncement: Boolean(row.is_announcement),
        sortOrder: row.sort_order ?? 0,
        excerpt: buildExcerpt(row.content)
    };
}

function inferTagClass(category) {
    if (category === 'Student') return 'gold';
    if (category === 'Visa Updates') return 'dark';
    if (category === 'Urgent') return 'gold';
    return '';
}

function inferIcon(category, isAnnouncement) {
    if (isAnnouncement) {
        if (category === 'Urgent') return 'fa-bell';
        if (category === 'New Policy') return 'fa-bolt';
    }

    switch (category) {
        case 'Student':
            return 'fa-graduation-cap';
        case 'Visa Updates':
            return 'fa-passport';
        case 'Work':
        default:
            return 'fa-briefcase';
    }
}

function inferIconClass(category) {
    if (category === 'Visa Updates') return 'dark';
    return '';
}

function normalizePost(input, existing = null) {
    const isAnnouncement = Boolean(input.isAnnouncement ?? input.is_announcement ?? existing?.isAnnouncement ?? existing?.is_announcement);
    const category = String(input.category || existing?.category || 'Work');
    const title = String(input.title || existing?.title || '').trim();
    const id = String(input.id || input.postId || existing?.id || '').trim();
    const date = String(input.date || existing?.date || '').trim();
    const readTime = String(input.readTime || input.read_time || existing?.readTime || existing?.read_time || '').trim();
    const content = String(input.content || existing?.content || '').trim();

    return {
        id,
        title,
        category,
        tagClass: String(input.tagClass || input.tag_class || existing?.tagClass || existing?.tag_class || inferTagClass(category)),
        icon: String(input.icon || existing?.icon || inferIcon(category, isAnnouncement)),
        iconClass: String(input.iconClass || input.icon_class || existing?.iconClass || existing?.icon_class || inferIconClass(category)),
        date,
        readTime,
        content,
        isAnnouncement,
        sortOrder: Number.isFinite(Number(input.sortOrder ?? input.sort_order ?? existing?.sortOrder ?? existing?.sort_order))
            ? Number(input.sortOrder ?? input.sort_order ?? existing?.sortOrder ?? existing?.sort_order)
            : 0
    };
}

function localSeedStore() {
    const posts = cloneSeedPosts();
    const byId = new Map(posts.map((post) => [post.id, { ...post }]));

    const allPosts = () => [...byId.values()].map((post) => ({
        ...post,
        excerpt: buildExcerpt(post.content)
    }));

    return {
        async ensureSeeded() {
            return;
        },
        async listPosts() {
            return allPosts();
        },
        async getPost(id) {
            return byId.get(id) || null;
        },
        async upsertPost(payload, existingId = null) {
            const existing = existingId ? byId.get(existingId) : byId.get(payload.id);
            const merged = normalizePost(payload, existing);
            byId.set(merged.id, merged);
            if (existingId && existingId !== merged.id) {
                byId.delete(existingId);
            }
            return { ...merged, excerpt: buildExcerpt(merged.content) };
        },
        async deletePost(id) {
            return byId.delete(id);
        }
    };
}

function supabaseStore() {
    return {
        async ensureSeeded() {
            const response = await supabaseRequest('/posts?select=id', {
                method: 'GET'
            });

            if (!response.ok) {
                const body = await response.text();
                throw new Error(`Supabase seed check failed: ${response.status} ${body}`);
            }

            const existing = await response.json();
            const existingIds = new Set(Array.isArray(existing) ? existing.map((row) => row.id) : []);
            const missingRows = cloneSeedPosts()
                .filter((post) => !existingIds.has(post.id))
                .map((post) => ({
                    id: post.id,
                    title: post.title,
                    category: post.category,
                    tag_class: post.tagClass || '',
                    icon: post.icon || '',
                    icon_class: post.iconClass || '',
                    date: post.date,
                    read_time: post.readTime,
                    content: post.content.trim(),
                    is_announcement: Boolean(post.isAnnouncement),
                    sort_order: post.sortOrder || 0
                }));

            if (missingRows.length === 0) {
                return;
            }

            const insertResponse = await supabaseRequest('/posts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Prefer: 'return=minimal'
                },
                body: JSON.stringify(missingRows)
            });

            if (!insertResponse.ok) {
                const body = await insertResponse.text();
                throw new Error(`Supabase seed insert failed: ${insertResponse.status} ${body}`);
            }
        },
        async listPosts() {
            const response = await supabaseRequest('/posts?select=*&order=is_announcement.desc,sort_order.asc,title.asc', {
                method: 'GET'
            });

            if (!response.ok) {
                const body = await response.text();
                throw new Error(`Supabase list failed: ${response.status} ${body}`);
            }

            const rows = await response.json();
            return rows.map(rowToPost);
        },
        async getPost(id) {
            const response = await supabaseRequest(`/posts?select=*&id=eq.${encodeURIComponent(id)}`, {
                method: 'GET'
            });

            if (!response.ok) {
                const body = await response.text();
                throw new Error(`Supabase get failed: ${response.status} ${body}`);
            }

            const rows = await response.json();
            return rowToPost(rows[0] || null);
        },
        async upsertPost(payload, existingId = null) {
            const current = existingId ? await this.getPost(existingId) : await this.getPost(payload.id);
            const merged = normalizePost(payload, current);

            if (!merged.id || !merged.title || !merged.content || !merged.date || !merged.readTime) {
                const error = new Error('Missing required post fields.');
                error.statusCode = 400;
                throw error;
            }

            const finalSortOrder = merged.sortOrder || (current?.sortOrder ?? 0);
            const response = await supabaseRequest('/posts?on_conflict=id', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Prefer: 'resolution=merge-duplicates,return=representation'
                },
                body: JSON.stringify([{
                    id: merged.id,
                    title: merged.title,
                    category: merged.category,
                    tag_class: merged.tagClass,
                    icon: merged.icon,
                    icon_class: merged.iconClass,
                    date: merged.date,
                    read_time: merged.readTime,
                    content: merged.content,
                    is_announcement: Boolean(merged.isAnnouncement),
                    sort_order: finalSortOrder
                }])
            });

            if (!response.ok) {
                const body = await response.text();
                throw new Error(`Supabase upsert failed: ${response.status} ${body}`);
            }

            const rows = await response.json();
            return rowToPost(rows[0] || null);
        },
        async deletePost(id) {
            const response = await supabaseRequest(`/posts?id=eq.${encodeURIComponent(id)}`, {
                method: 'DELETE',
                headers: {
                    Prefer: 'return=minimal'
                }
            });

            if (!response.ok) {
                const body = await response.text();
                throw new Error(`Supabase delete failed: ${response.status} ${body}`);
            }

            return true;
        }
    };
}

const store = useSupabase ? supabaseStore() : localSeedStore();

function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify(data));
}

function sendJsContent(res, payload) {
    res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    res.end(`window.VENANCIA_CONTENT = ${JSON.stringify(payload)};`);
}

function serveStatic(req, res, pathname) {
    const relativePath = pathname === '/' ? '/index.html' : pathname;
    const filePath = resolve(join(publicRoot, '.' + relativePath));

    if (!filePath.startsWith(publicRoot)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    if (!existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
    }

    const ext = extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    let data = readFileSync(filePath);

    if ((relativePath === '/admin-login.html' || relativePath === '/admin-dashboard.html') && contentType.includes('text/html')) {
        const injectedConfig = `<script>window.VENANCIA_RUNTIME_CONFIG=${JSON.stringify({
            supabaseUrl,
            supabaseAnonKey,
            authEnabled: Boolean(supabaseUrl && supabaseAnonKey)
        })};</script>`;
        data = Buffer.from(String(data).replace('<head>', `<head>${injectedConfig}`));
    }

    res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store'
    });
    res.end(data);
}

function parseBody(req) {
    return new Promise((resolveBody, rejectBody) => {
        let raw = '';

        req.on('data', (chunk) => {
            raw += chunk;
            if (raw.length > 1_000_000) {
                rejectBody(new Error('Request body too large.'));
                req.destroy();
            }
        });

        req.on('end', () => {
            if (!raw) {
                resolveBody({});
                return;
            }

            try {
                resolveBody(JSON.parse(raw));
            } catch (error) {
                rejectBody(error);
            }
        });

        req.on('error', rejectBody);
    });
}

async function getContentPayload() {
    await store.ensureSeeded();
    const posts = await store.listPosts();

    return {
        posts,
        blogs: posts.filter((post) => !post.isAnnouncement),
        announcements: posts.filter((post) => post.isAnnouncement)
    };
}

const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const origin = req.headers.origin || '';

    try {
        if (req.method === 'OPTIONS') {
            res.writeHead(204, {
                ...corsHeaders(origin),
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, Prefer',
                'Access-Control-Max-Age': '86400'
            });
            res.end();
            return;
        }

        if (url.pathname === '/healthz' && req.method === 'GET') {
            sendJson(res, 200, {
                ok: true,
                supabaseConfigured: Boolean(supabaseUrl && supabaseAnonKey && supabaseServiceKey)
            });
            return;
        }

        if (url.pathname === '/api/config' && req.method === 'GET') {
            res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
                ...corsHeaders(origin)
            });
            res.end(JSON.stringify({
                supabaseUrl,
                supabaseAnonKey,
                authEnabled: Boolean(supabaseUrl && supabaseAnonKey)
            }));
            return;
        }

        if (url.pathname === '/api/content.js' && req.method === 'GET') {
            sendJsContent(res, await getContentPayload());
            return;
        }

        if (url.pathname === '/api/content' && req.method === 'GET') {
            res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
                ...corsHeaders(origin)
            });
            res.end(JSON.stringify(await getContentPayload()));
            return;
        }

        if (url.pathname === '/api/posts' && req.method === 'GET') {
            await store.ensureSeeded();
            res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
                ...corsHeaders(origin)
            });
            res.end(JSON.stringify({ posts: await store.listPosts() }));
            return;
        }

        if (url.pathname.startsWith('/api/posts/')) {
            const id = decodeURIComponent(url.pathname.replace('/api/posts/', ''));

            if (req.method === 'GET') {
                await store.ensureSeeded();
                const post = await store.getPost(id);
                if (!post) {
                res.writeHead(404, {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Cache-Control': 'no-store',
                    ...corsHeaders(origin)
                });
                res.end(JSON.stringify({ error: 'Post not found' }));
                return;
            }

                res.writeHead(200, {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Cache-Control': 'no-store',
                    ...corsHeaders(origin)
                });
                res.end(JSON.stringify({ post }));
                return;
            }

            if (req.method === 'DELETE') {
                await store.ensureSeeded();
                const deleted = await store.deletePost(id);
                if (!deleted) {
                    res.writeHead(404, {
                        'Content-Type': 'application/json; charset=utf-8',
                        'Cache-Control': 'no-store',
                        ...corsHeaders(origin)
                    });
                    res.end(JSON.stringify({ error: 'Post not found' }));
                    return;
                }

                res.writeHead(200, {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Cache-Control': 'no-store',
                    ...corsHeaders(origin)
                });
                res.end(JSON.stringify({ ok: true }));
                return;
            }

            if (req.method === 'PUT') {
                await store.ensureSeeded();
                const body = await parseBody(req);
                const post = await store.upsertPost({ ...body, id }, id);
                res.writeHead(200, {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Cache-Control': 'no-store',
                    ...corsHeaders(origin)
                });
                res.end(JSON.stringify({ post }));
                return;
            }
        }

        if (url.pathname === '/api/posts' && req.method === 'POST') {
            await store.ensureSeeded();
            const body = await parseBody(req);
            const post = await store.upsertPost(body);
            res.writeHead(201, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
                ...corsHeaders(origin)
            });
            res.end(JSON.stringify({ post }));
            return;
        }

        serveStatic(req, res, url.pathname);
    } catch (error) {
        const statusCode = Number(error.statusCode || 500);
        res.writeHead(statusCode, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            ...corsHeaders(origin)
        });
        res.end(JSON.stringify({
            error: error.message || 'Unexpected server error'
        }));
    }
});

server.listen(port, host, () => {
    console.log(`Venancia server running at http://${host}:${port}`);
    if (useSupabase) {
        console.log('Using Supabase for content storage.');
    } else {
        console.log('Supabase is not configured. Running with an in-memory local seed store.');
    }
});
