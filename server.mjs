import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloneSeedPosts } from './content-data.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

function loadEnvFile(filePath) {
    if (!existsSync(filePath)) {
        return;
    }

    const raw = readFileSync(filePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }

        const equalsIndex = trimmed.indexOf('=');
        if (equalsIndex === -1) {
            continue;
        }

        const key = trimmed.slice(0, equalsIndex).trim();
        if (!key || process.env[key] !== undefined) {
            continue;
        }

        let value = trimmed.slice(equalsIndex + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }

        process.env[key] = value;
    }
}

loadEnvFile(resolve(__dirname, '.env.local'));
loadEnvFile(resolve(__dirname, '.env'));

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const publicApiBaseUrl = process.env.PUBLIC_API_BASE_URL || '';
const publicSiteUrl = process.env.PUBLIC_SITE_URL || 'https://venancia.com.au';
const resendApiKey = process.env.RESEND_API_KEY || '';
const resendFromEmail = process.env.RESEND_FROM_EMAIL || 'Venancia Consultancy <info@venancia.com.au>';
const publicRoot = __dirname;
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '') || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const useSupabase = Boolean(supabaseUrl && supabaseServiceKey);
const contentCacheTtlMs = Number(process.env.CONTENT_CACHE_TTL_MS || 30000);

let cachedContentPayload = null;
let cachedContentAt = 0;

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

function invalidateContentCache() {
    cachedContentPayload = null;
    cachedContentAt = 0;
}

function createPostId() {
    return randomUUID();
}

function isMissingPostsTableError(body) {
    return String(body || '').includes('PGRST205');
}

function isMissingSubscribersTableError(body) {
    return String(body || '').includes('public.subscribers') || String(body || '').includes('PGRST205');
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function normalizeSubscriberRecord(row = {}) {
    return {
        email: normalizeEmail(row?.email),
        unsubscribeToken: String(row?.unsubscribeToken || row?.unsubscribe_token || '').trim(),
        createdAt: String(row?.createdAt || row?.created_at || '').trim(),
        updatedAt: String(row?.updatedAt || row?.updated_at || '').trim()
    };
}

function sortSubscriberRecords(list = []) {
    return [...list].sort((a, b) => {
        const aTime = Date.parse(a?.createdAt || a?.updatedAt || '');
        const bTime = Date.parse(b?.createdAt || b?.updatedAt || '');

        if (!Number.isNaN(aTime) && !Number.isNaN(bTime) && aTime !== bTime) {
            return bTime - aTime;
        }

        return String(a?.email || '').localeCompare(String(b?.email || ''));
    });
}

function buildUnsubscribeUrl(value = '') {
    const baseUrl = publicSiteUrl.replace(/\/$/, '');
    const tokenOrEmail = String(value || '').trim();
    if (!tokenOrEmail) {
        return `${baseUrl}/unsubscribe.html`;
    }
    if (tokenOrEmail.includes('@')) {
        return `${baseUrl}/unsubscribe.html?email=${encodeURIComponent(tokenOrEmail)}`;
    }
    return `${baseUrl}/unsubscribe.html?token=${encodeURIComponent(tokenOrEmail)}`;
}

function buildPostUrl(post) {
    return `${publicSiteUrl.replace(/\/$/, '')}/article.html?post=${encodeURIComponent(post.id)}`;
}

function buildPostSummary(post) {
    const excerpt = buildExcerpt(post.content);
    return `
        <p style="margin: 0 0 30px; color: #e0e0e0; font-size: 16px; line-height: 1.6; max-width: 400px; margin-left: auto; margin-right: auto;">${escapeHtml(excerpt)}</p>
        <table border="0" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
            <tr>
                <td align="center" style="border-radius: 8px; background-color: #FF8A00; background: linear-gradient(135deg, #FFB800, #FF8A00);">
                    <a href="${escapeHtml(buildPostUrl(post))}" target="_blank" style="font-size: 16px; font-family: 'Outfit', Helvetica, Arial, sans-serif; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 8px; padding: 16px 36px; display: inline-block; box-shadow: 0 4px 15px rgba(255, 138, 0, 0.3);">Read on Venancia</a>
                </td>
            </tr>
        </table>
    `;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function sendResendEmail({ to, subject, html, bcc = [] }) {
    if (!resendApiKey) {
        return { skipped: true };
    }

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${resendApiKey}`
        },
        body: JSON.stringify({
            from: resendFromEmail,
            to,
            bcc,
            subject,
            html
        })
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Resend send failed: ${response.status} ${body}`);
    }

    return response.json();
}

async function sendSubscriptionConfirmation(subscriber) {
    if (!resendApiKey) {
        return { skipped: true };
    }

    const email = normalizeEmail(subscriber?.email);
    const unsubscribeUrl = subscriber?.unsubscribeToken
        ? buildUnsubscribeUrl(subscriber.unsubscribeToken)
        : buildUnsubscribeUrl(email);

    const subject = 'Thanks for subscribing to Venancia updates';
    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Subscription Confirmed</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: 'Inter', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f5f5f5; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #1A1A1A; border-radius: 16px; overflow: hidden; box-shadow: 0 15px 40px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td align="center" style="padding: 40px 40px 20px;">
                            <h2 style="margin: 0; color: #ffffff; font-family: 'Outfit', Helvetica, Arial, sans-serif; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
                                <span style="color: #FFB800;">Venancia</span> Consultancy
                            </h2>
                        </td>
                    </tr>
                    <!-- Body -->
                    <tr>
                        <td align="center" style="padding: 20px 40px 40px;">
                            <div style="background-color: rgba(255, 184, 0, 0.1); width: 64px; height: 64px; border-radius: 50%; display: inline-block; margin-bottom: 24px;">
                                <table width="100%" height="100%" border="0" cellspacing="0" cellpadding="0">
                                    <tr><td align="center" valign="middle" style="color: #FF8A00; font-size: 32px; line-height: 1;">✓</td></tr>
                                </table>
                            </div>
                            <h1 style="margin: 0 0 16px; color: #ffffff; font-family: 'Outfit', Helvetica, Arial, sans-serif; font-size: 26px; font-weight: 700;">Thanks for Subscribing!</h1>
                            <p style="margin: 0 0 30px; color: #e0e0e0; font-size: 16px; line-height: 1.6; max-width: 400px;">
                                You’re now officially on the list. We'll send you our latest news, visa updates, and announcements directly to your inbox.
                            </p>
                            
                            <table border="0" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                                <tr>
                                    <td align="center" style="border-radius: 8px; background-color: #FF8A00; background: linear-gradient(135deg, #FFB800, #FF8A00);">
                                        <a href="${escapeHtml(publicSiteUrl.replace(/\/$/, ''))}" target="_blank" style="font-size: 16px; font-family: 'Outfit', Helvetica, Arial, sans-serif; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 8px; padding: 16px 36px; display: inline-block; box-shadow: 0 4px 15px rgba(255, 138, 0, 0.3);">Visit Venancia</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td align="center" style="padding: 30px 40px; background-color: #222222; border-top: 1px solid #333333;">
                            <p style="margin: 0 0 8px; color: #888888; font-size: 14px;">
                                © ${new Date().getFullYear()} Venancia Consultancy. All rights reserved.
                            </p>
                            <p style="margin: 0; color: #666666; font-size: 12px;">
                                You received this email because you subscribed to updates on our website.
                            </p>
                            <p style="margin: 8px 0 0; color: #666666; font-size: 12px;">
                                <a href="${escapeHtml(unsubscribeUrl)}" style="color: #FFB800; text-decoration: none;">Unsubscribe</a>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;

    return sendResendEmail({
        to: email,
        subject,
        html
    });
}

async function resendPostToSubscribers(post) {
    return notifySubscribers(post);
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
    const subscribers = new Map();

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

            if (!merged.id) {
                merged.id = createPostId();
            }

            byId.set(merged.id, merged);
            if (existingId && existingId !== merged.id) {
                byId.delete(existingId);
            }
            return { ...merged, excerpt: buildExcerpt(merged.content) };
        },
        async deletePost(id) {
            return byId.delete(id);
        },
        async getSubscriberByEmail(email) {
            return subscribers.get(normalizeEmail(email)) || null;
        },
        async addSubscriber(email) {
            const normalizedEmail = normalizeEmail(email);
            const existing = subscribers.get(normalizedEmail);
            if (existing) {
                return { ...existing, created: false };
            }

            const subscriber = {
                email: normalizedEmail,
                unsubscribeToken: createPostId(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            subscribers.set(normalizedEmail, subscriber);
            return { ...subscriber, created: true };
        },
        async removeSubscriberByEmail(email) {
            return subscribers.delete(normalizeEmail(email));
        },
        async removeSubscriberByToken(token) {
            const normalizedToken = String(token || '').trim();
            if (!normalizedToken) return false;

            for (const [email, subscriber] of subscribers.entries()) {
                if (subscriber.unsubscribeToken === normalizedToken) {
                    subscribers.delete(email);
                    return true;
                }
            }
            return false;
        },
        async listSubscribers() {
            return sortSubscriberRecords([...subscribers.values()].map((subscriber) => normalizeSubscriberRecord(subscriber)));
        }
    };
}

function supabaseStore() {
    const fallbackSubscribers = new Map();

    return {
        async ensureSeeded() {
            const response = await supabaseRequest('/posts?select=id', {
                method: 'GET'
            });

            if (!response.ok) {
                const body = await response.text();
                if (response.status === 404 && isMissingPostsTableError(body)) {
                    const error = new Error(
                        'Supabase cannot see public.posts. Apply supabase-schema.sql in the Supabase SQL editor, then refresh the schema cache in Supabase Dashboard and restart the server.'
                    );
                    error.statusCode = 500;
                    throw error;
                }
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
                if (response.status === 404 && isMissingPostsTableError(body)) {
                    const error = new Error(
                        'Supabase cannot see public.posts. Apply supabase-schema.sql in the Supabase SQL editor, then refresh the schema cache in Supabase Dashboard and restart the server.'
                    );
                    error.statusCode = 500;
                    throw error;
                }
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
                if (response.status === 404 && isMissingPostsTableError(body)) {
                    const error = new Error(
                        'Supabase cannot see public.posts. Apply supabase-schema.sql in the Supabase SQL editor, then refresh the schema cache in Supabase Dashboard and restart the server.'
                    );
                    error.statusCode = 500;
                    throw error;
                }
                throw new Error(`Supabase get failed: ${response.status} ${body}`);
            }

            const rows = await response.json();
            return rowToPost(rows[0] || null);
        },
        async upsertPost(payload, existingId = null) {
            const current = existingId ? await this.getPost(existingId) : null;
            const merged = normalizePost(payload, current);

            if (!merged.title || !merged.content || !merged.date || !merged.readTime) {
                const error = new Error('Missing required post fields.');
                error.statusCode = 400;
                throw error;
            }

            const finalSortOrder = merged.sortOrder || (current?.sortOrder ?? 0);
            const insertRow = {
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
            };

            if (merged.id) {
                insertRow.id = merged.id;
            }

            const isUpsert = Boolean(merged.id);
            const response = await supabaseRequest(isUpsert ? '/posts?on_conflict=id' : '/posts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Prefer: isUpsert ? 'resolution=merge-duplicates,return=representation' : 'return=representation'
                },
                body: JSON.stringify([insertRow])
            });

            if (!response.ok) {
                const body = await response.text();
                if (response.status === 404 && isMissingPostsTableError(body)) {
                    const error = new Error(
                        'Supabase cannot see public.posts. Apply supabase-schema.sql in the Supabase SQL editor, then refresh the schema cache in Supabase Dashboard and restart the server.'
                    );
                    error.statusCode = 500;
                    throw error;
                }
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
                if (response.status === 404 && isMissingPostsTableError(body)) {
                    const error = new Error(
                        'Supabase cannot see public.posts. Apply supabase-schema.sql in the Supabase SQL editor, then refresh the schema cache in Supabase Dashboard and restart the server.'
                    );
                    error.statusCode = 500;
                    throw error;
                }
                throw new Error(`Supabase delete failed: ${response.status} ${body}`);
            }

            return true;
        },
        async getSubscriberByEmail(email) {
            const normalizedEmail = normalizeEmail(email);
            const response = await supabaseRequest(`/subscribers?select=email,unsubscribe_token,created_at,updated_at&email=eq.${encodeURIComponent(normalizedEmail)}`, {
                method: 'GET'
            });

            if (!response.ok) {
                const body = await response.text();
                if (response.status === 404 && isMissingSubscribersTableError(body)) {
                    return fallbackSubscribers.get(normalizedEmail) || null;
                }
                throw new Error(`Supabase subscriber lookup failed: ${response.status} ${body}`);
            }

            const rows = await response.json();
            const row = Array.isArray(rows) ? rows[0] : rows;
            if (!row) {
                const fallbackSubscriber = fallbackSubscribers.get(normalizedEmail) || null;
                return fallbackSubscriber ? normalizeSubscriberRecord(fallbackSubscriber) : null;
            }

            return normalizeSubscriberRecord(row);
        },
        async addSubscriber(email) {
            const normalizedEmail = normalizeEmail(email);
            const existing = await this.getSubscriberByEmail(normalizedEmail);
            if (existing) {
                return { ...existing, created: false };
            }

            const response = await supabaseRequest('/subscribers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Prefer: 'return=representation'
                },
                body: JSON.stringify([{
                    email: normalizedEmail
                }])
            });

            if (!response.ok) {
                const body = await response.text();
                if (response.status === 404 && isMissingSubscribersTableError(body)) {
                    const subscriber = {
                        email: normalizedEmail,
                        unsubscribeToken: createPostId(),
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    };
                    fallbackSubscribers.set(normalizedEmail, subscriber);
                    return { ...subscriber, created: true };
                }
                if (response.status === 409) {
                    const existing = await this.getSubscriberByEmail(normalizedEmail);
                    if (existing) {
                        return { ...existing, created: false };
                    }
                }
                throw new Error(`Supabase subscribe failed: ${response.status} ${body}`);
            }

            const rows = await response.json();
            const row = Array.isArray(rows) ? rows[0] : rows;
            const subscriber = {
                email: normalizeEmail(row?.email || normalizedEmail),
                unsubscribeToken: String(row?.unsubscribe_token || '').trim() || createPostId(),
                createdAt: String(row?.created_at || '').trim() || new Date().toISOString(),
                updatedAt: String(row?.updated_at || '').trim() || new Date().toISOString(),
                created: true
            };
            fallbackSubscribers.set(subscriber.email, subscriber);
            return subscriber;
        },
        async removeSubscriberByEmail(email) {
            const normalizedEmail = normalizeEmail(email);
            const response = await supabaseRequest(`/subscribers?email=eq.${encodeURIComponent(normalizedEmail)}`, {
                method: 'DELETE',
                headers: {
                    Prefer: 'return=minimal'
                }
            });

            if (!response.ok) {
                const body = await response.text();
                if (response.status === 404 && isMissingSubscribersTableError(body)) {
                    return fallbackSubscribers.delete(normalizedEmail);
                }
                throw new Error(`Supabase unsubscribe failed: ${response.status} ${body}`);
            }

            fallbackSubscribers.delete(normalizedEmail);
            return true;
        },
        async removeSubscriberByToken(token) {
            const normalizedToken = String(token || '').trim();
            if (!normalizedToken) return false;

            const response = await supabaseRequest(`/subscribers?unsubscribe_token=eq.${encodeURIComponent(normalizedToken)}`, {
                method: 'DELETE',
                headers: {
                    Prefer: 'return=minimal'
                }
            });

            if (!response.ok) {
                const body = await response.text();
                if (response.status === 404 && isMissingSubscribersTableError(body)) {
                    for (const [email, subscriber] of fallbackSubscribers.entries()) {
                        if (subscriber.unsubscribeToken === normalizedToken) {
                            fallbackSubscribers.delete(email);
                            return true;
                        }
                    }
                    return false;
                }
                throw new Error(`Supabase unsubscribe by token failed: ${response.status} ${body}`);
            }

            for (const [email, subscriber] of fallbackSubscribers.entries()) {
                if (subscriber.unsubscribeToken === normalizedToken) {
                    fallbackSubscribers.delete(email);
                    break;
                }
            }
            return true;
        },
        async listSubscribers() {
            const response = await supabaseRequest('/subscribers?select=email,unsubscribe_token,created_at,updated_at', {
                method: 'GET'
            });

            if (!response.ok) {
                const body = await response.text();
                if (response.status === 404 && isMissingSubscribersTableError(body)) {
                    return [...fallbackSubscribers.values()].map((subscriber) => ({ ...subscriber }));
                }
                throw new Error(`Supabase subscribers list failed: ${response.status} ${body}`);
            }

            const rows = await response.json();
            const dbRows = Array.isArray(rows) ? rows : [];
            const merged = new Map();
            for (const row of dbRows) {
                const normalized = normalizeSubscriberRecord(row);
                if (normalized.email) {
                    merged.set(normalized.email, normalized);
                }
            }
            for (const subscriber of fallbackSubscribers.values()) {
                const normalized = normalizeSubscriberRecord(subscriber);
                if (normalized.email) {
                    merged.set(normalized.email, normalized);
                }
            }
            return sortSubscriberRecords([...merged.values()]);
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

    if (contentType.includes('text/html')) {
        const runtimeConfig = {
            apiBaseUrl: publicApiBaseUrl || ''
        };

        if (relativePath === '/admin-login.html' || relativePath === '/admin-dashboard.html') {
            runtimeConfig.supabaseUrl = supabaseUrl;
            runtimeConfig.supabaseAnonKey = supabaseAnonKey;
            runtimeConfig.authEnabled = Boolean(supabaseUrl && supabaseAnonKey);
        }

        const injectedConfig = `<script>window.VENANCIA_RUNTIME_CONFIG=${JSON.stringify(runtimeConfig)};</script>`;
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
    if (cachedContentPayload && (Date.now() - cachedContentAt) < contentCacheTtlMs) {
        return cachedContentPayload;
    }

    await store.ensureSeeded();
    const posts = await store.listPosts();

    cachedContentPayload = {
        posts,
        blogs: posts.filter((post) => !post.isAnnouncement),
        announcements: posts.filter((post) => post.isAnnouncement)
    };
    cachedContentAt = Date.now();
    return cachedContentPayload;
}

async function notifySubscribers(post) {
    const subscribers = await store.listSubscribers().catch(() => []);
    const emails = subscribers.map((row) => normalizeEmail(row.email)).filter(Boolean);

    if (emails.length === 0 || !resendApiKey) {
        return { skipped: true, recipientCount: emails.length };
    }

    const subject = post.isAnnouncement
        ? `New announcement: ${post.title}`
        : `New blog post: ${post.title}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(post.title)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: 'Inter', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f5f5f5; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #1A1A1A; border-radius: 16px; overflow: hidden; box-shadow: 0 15px 40px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td align="center" style="padding: 40px 40px 20px;">
                            <h2 style="margin: 0; color: #ffffff; font-family: 'Outfit', Helvetica, Arial, sans-serif; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
                                <span style="color: #FFB800;">Venancia</span> Consultancy
                            </h2>
                        </td>
                    </tr>
                    <!-- Body -->
                    <tr>
                        <td align="center" style="padding: 20px 40px 40px;">
                            <div style="background-color: rgba(255, 184, 0, 0.1); padding: 8px 16px; border-radius: 50px; display: inline-block; margin-bottom: 24px;">
                                <span style="color: #FFB800; font-size: 14px; font-weight: 600; font-family: 'Inter', Helvetica, Arial, sans-serif; text-transform: uppercase; letter-spacing: 1px;">
                                    New ${post.isAnnouncement ? 'Announcement' : 'Blog Post'}
                                </span>
                            </div>
                            <h1 style="margin: 0 0 16px; color: #ffffff; font-family: 'Outfit', Helvetica, Arial, sans-serif; font-size: 26px; font-weight: 700; line-height: 1.3;">${escapeHtml(post.title)}</h1>
                            <p style="margin: 0 0 24px; color: #888888; font-size: 14px; font-weight: 500;">
                                ${escapeHtml(post.category)} &nbsp;•&nbsp; ${escapeHtml(post.date)}
                            </p>
                            ${buildPostSummary(post)}
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td align="center" style="padding: 30px 40px; background-color: #222222; border-top: 1px solid #333333;">
                            <p style="margin: 0 0 8px; color: #888888; font-size: 14px;">
                                © ${new Date().getFullYear()} Venancia Consultancy. All rights reserved.
                            </p>
                            <p style="margin: 0; color: #666666; font-size: 12px;">
                                You received this email because you subscribed to updates on our website.
                            </p>
                            <p style="margin: 8px 0 0; color: #666666; font-size: 12px;">
                                <a href="${escapeHtml(buildUnsubscribeUrl())}" style="color: #FFB800; text-decoration: none;">Unsubscribe</a>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;

    const batches = [];
    for (let i = 0; i < emails.length; i += 49) {
        batches.push(emails.slice(i, i + 49));
    }

    const results = [];
    for (const batch of batches) {
        const result = await sendResendEmail({
            to: resendFromEmail,
            bcc: batch,
            subject,
            html
        });
        results.push(result);
    }

    return { sent: true, recipientCount: emails.length, batches: results.length };
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

        if (url.pathname === '/api/subscribe' && req.method === 'POST') {
            const body = await parseBody(req);
            const email = normalizeEmail(body.email);

            if (!email || !email.includes('@')) {
                res.writeHead(400, {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Cache-Control': 'no-store',
                    ...corsHeaders(origin)
                });
                res.end(JSON.stringify({ error: 'A valid email address is required.' }));
                return;
            }

            const subscriber = await store.addSubscriber(email);
            if (!subscriber.created) {
                res.writeHead(409, {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Cache-Control': 'no-store',
                    ...corsHeaders(origin)
                });
                res.end(JSON.stringify({
                    error: 'This email is already subscribed.',
                    alreadySubscribed: true
                }));
                return;
            }

            let confirmation = { skipped: true };
            try {
                confirmation = await sendSubscriptionConfirmation(subscriber);
            } catch (error) {
                console.error('Subscription confirmation failed:', error);
                confirmation = { sent: false, error: error.message || 'Confirmation email failed.' };
            }

            res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
                ...corsHeaders(origin)
            });
            res.end(JSON.stringify({
                ok: true,
                confirmationEmail: confirmation
            }));
            return;
        }

        if (url.pathname === '/api/unsubscribe' && req.method === 'POST') {
            const body = await parseBody(req);
            const email = normalizeEmail(body.email);
            const token = String(body.token || '').trim();

            let removed = false;
            if (token) {
                removed = await store.removeSubscriberByToken(token);
            } else if (email) {
                removed = await store.removeSubscriberByEmail(email);
            }

            res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
                ...corsHeaders(origin)
            });
            res.end(JSON.stringify({
                ok: true,
                unsubscribed: removed
            }));
            return;
        }

        if (url.pathname === '/api/subscribers' && req.method === 'GET') {
            await store.ensureSeeded?.();
            res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
                ...corsHeaders(origin)
            });
            res.end(JSON.stringify({ subscribers: await store.listSubscribers() }));
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

        if (url.pathname.startsWith('/api/posts/') && url.pathname.endsWith('/resend') && req.method === 'POST') {
            await store.ensureSeeded();
            const id = decodeURIComponent(url.pathname.replace('/api/posts/', '').replace('/resend', ''));
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

            const result = await resendPostToSubscribers(post);
            res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
                ...corsHeaders(origin)
            });
            res.end(JSON.stringify({
                ok: true,
                recipientCount: result?.recipientCount || 0,
                skipped: Boolean(result?.skipped)
            }));
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

                invalidateContentCache();
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
                invalidateContentCache();
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
            invalidateContentCache();
            notifySubscribers(post).catch((error) => {
                console.error('Subscriber notification failed:', error);
            });
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
        if (res.headersSent) {
            if (!res.writableEnded) {
                res.end();
            }
            return;
        }

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
