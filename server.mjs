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
const assessmentAutoReplyFromEmail = process.env.ASSESSMENT_AUTO_REPLY_FROM_EMAIL || 'Venancia Consultancy Office <donotreply@venancia.com.au>';
const publicRoot = __dirname;
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '') || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const adminEmailAllowlist = new Set(
    String(process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || 'admin@venancia.com.au')
        .split(',')
        .map((value) => normalizeEmail(value))
        .filter(Boolean)
);
const useSupabase = Boolean(supabaseUrl && supabaseServiceKey);
const supabaseAuthEnabled = Boolean(supabaseUrl && supabaseAnonKey);
const contentCacheTtlMs = Number(process.env.CONTENT_CACHE_TTL_MS || 30000);
const excludedSubscriberEmails = new Set([
    'donotreply@venancia.com.au'
]);

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

function extractBearerToken(req) {
    const header = String(req.headers.authorization || '');
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : '';
}

async function verifyAdminSession(req) {
    if (!useSupabase || !supabaseAuthEnabled) {
        return { bypassed: true };
    }

    const token = extractBearerToken(req);
    if (!token) {
        const error = new Error('Authentication required.');
        error.statusCode = 401;
        throw error;
    }

    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${token}`
        }
    });

    if (!response.ok) {
        const error = new Error('Authentication required.');
        error.statusCode = 401;
        throw error;
    }

    const user = await response.json().catch(() => null);
    const email = normalizeEmail(user?.email || '');
    if (adminEmailAllowlist.size && !adminEmailAllowlist.has(email)) {
        const error = new Error('You do not have access to this resource.');
        error.statusCode = 403;
        throw error;
    }

    return { user, token };
}

async function requireAdminAuth(req, res) {
    try {
        return await verifyAdminSession(req);
    } catch (error) {
        res.writeHead(error.statusCode || 401, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify({ error: error.message || 'Authentication required.' }));
        return null;
    }
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

function isMissingSubscriberStatusColumnError(body) {
    const message = String(body || '');
    return message.includes('PGRST204') || (message.includes('status') && message.includes('does not exist'));
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function normalizeSubscriberStatus(status) {
    const normalized = String(status || 'active').trim().toLowerCase();
    if (normalized === 'unsubscribed' || normalized === 'inactive' || normalized === 'disabled') {
        return 'unsubscribed';
    }

    return 'active';
}

function isActiveSubscriber(subscriber) {
    return normalizeSubscriberStatus(subscriber?.status) === 'active';
}

function extractEmailAddress(value = '') {
    const match = String(value || '').match(/<([^>]+)>/);
    if (match?.[1]) {
        return normalizeEmail(match[1]);
    }

    return normalizeEmail(value);
}

function isExcludedSubscriberEmail(email) {
    return excludedSubscriberEmails.has(normalizeEmail(email));
}

function normalizeSubscriberRecord(row = {}) {
    return {
        email: normalizeEmail(row?.email),
        unsubscribeToken: String(row?.unsubscribeToken || row?.unsubscribe_token || '').trim(),
        createdAt: String(row?.createdAt || row?.created_at || '').trim(),
        updatedAt: String(row?.updatedAt || row?.updated_at || '').trim(),
        status: normalizeSubscriberStatus(row?.status)
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
        <p style="margin: 0 0 30px; color: #333333; font-size: 16px; line-height: 1.6; max-width: 400px; margin-left: auto; margin-right: auto;">${escapeHtml(excerpt)}</p>
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

async function sendResendEmail({ to, subject, html, bcc = [], attachments = [], from = resendFromEmail, replyTo = undefined }) {
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
            from,
            to,
            bcc,
            attachments,
            reply_to: replyTo,
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
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@400;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; background-color: #F8F9FB; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F8F9FB; padding: 60px 20px;">
        <tr>
            <td align="center">
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 720px; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.04); border: 1px solid #E5E7EB;">
                    <!-- Header -->
                    <tr>
                        <td align="center" style="padding: 50px 40px 30px;">
                            <div style="font-family: 'Outfit', sans-serif; font-size: 32px; font-weight: 700; color: #111827; letter-spacing: -1px;">
                                <span style="color: #FFB800;">Venancia</span> Consultancy Pty Ltd
                            </div>
                        </td>
                    </tr>
                    <!-- Body -->
                    <tr>
                        <td align="center" style="padding: 0 60px 50px;">
                            <div style="background-color: rgba(255, 184, 0, 0.08); width: 80px; height: 80px; border-radius: 50%; display: inline-block; margin-bottom: 30px;">
                                <table width="100%" height="100%" border="0" cellspacing="0" cellpadding="0">
                                    <tr><td align="center" valign="middle" style="color: #FF8A00; font-size: 40px; line-height: 1;">✓</td></tr>
                                </table>
                            </div>
                            <h1 style="margin: 0 0 16px; color: #111827; font-family: 'Outfit', sans-serif; font-size: 32px; font-weight: 700; line-height: 1.2;">Welcome to the Community!</h1>
                            <p style="margin: 0 0 40px; color: #4B5563; font-size: 18px; line-height: 1.6; max-width: 500px;">
                                You’re now subscribed to Venancia updates. We’re excited to share the latest news, visa updates, and pathways with you.
                            </p>
                            
                            <table border="0" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                                <tr>
                                    <td align="center" style="border-radius: 12px; background-color: #FF8A00; background: linear-gradient(135deg, #FFB800, #FF8A00);">
                                        <a href="${escapeHtml(publicSiteUrl.replace(/\/$/, ''))}" target="_blank" style="font-size: 18px; font-family: 'Outfit', sans-serif; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 12px; padding: 18px 48px; display: inline-block; box-shadow: 0 8px 20px rgba(255, 138, 0, 0.25);">Visit Website</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td align="center" style="padding: 40px; background-color: #F9FAFB; border-top: 1px solid #F3F4F6;">
                            <p style="margin: 0 0 10px; color: #6B7280; font-size: 14px; font-weight: 500;">
                                © ${new Date().getFullYear()} Venancia Consultancy. All rights reserved.
                            </p>
                            <p style="margin: 0; color: #9CA3AF; font-size: 12px; line-height: 1.5;">
                                You received this email because you subscribed on our website.<br>
                                <a href="${escapeHtml(unsubscribeUrl)}" style="color: #FF8A00; text-decoration: none; font-weight: 600;">Unsubscribe from updates</a>
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

function decodeMultipartText(value = '') {
    return Buffer.from(String(value), 'latin1').toString('utf8');
}

async function parseMultipartFormData(req) {
    const contentType = String(req.headers['content-type'] || '');
    const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
    if (!boundaryMatch?.[1]) {
        throw new Error('Missing multipart boundary.');
    }

    const boundary = boundaryMatch[1].replace(/^"|"$/g, '');
    const rawBody = await new Promise((resolveBody, rejectBody) => {
        const chunks = [];
        let total = 0;

        req.on('data', (chunk) => {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            total += buffer.length;
            if (total > 15 * 1024 * 1024) {
                rejectBody(new Error('Request body too large.'));
                req.destroy();
                return;
            }
            chunks.push(buffer);
        });

        req.on('end', () => resolveBody(Buffer.concat(chunks)));
        req.on('error', rejectBody);
    });

    const boundaryToken = `--${boundary}`;
    const raw = rawBody.toString('latin1');
    const segments = raw.split(boundaryToken);
    const fields = {};
    const files = [];

    for (let segment of segments) {
        if (!segment) continue;
        if (segment === '--' || segment === '--\r\n') continue;
        if (segment.startsWith('\r\n')) segment = segment.slice(2);
        if (segment.endsWith('\r\n')) segment = segment.slice(0, -2);
        if (!segment || segment === '--') continue;

        const headerEnd = segment.indexOf('\r\n\r\n');
        if (headerEnd === -1) continue;

        const headerText = segment.slice(0, headerEnd);
        const bodyText = segment.slice(headerEnd + 4);
        const dispositionMatch = headerText.match(/name="([^"]+)"(?:;\s*filename="([^"]*)")?/i);
        if (!dispositionMatch?.[1]) continue;

        const fieldName = dispositionMatch[1];
        const filename = dispositionMatch[2] ? dispositionMatch[2].trim() : '';
        const valueBuffer = Buffer.from(bodyText, 'latin1');

        if (filename) {
            files.push({
                fieldName,
                filename,
                contentType: (headerText.match(/Content-Type:\s*([^\r\n]+)/i)?.[1] || 'application/octet-stream').trim(),
                size: valueBuffer.length,
                buffer: valueBuffer
            });
        } else {
            fields[fieldName] = valueBuffer.toString('utf8');
        }
    }

    return { fields, files };
}

async function parseAssessmentSubmission(req) {
    const contentType = String(req.headers['content-type'] || '');
    const body = contentType.includes('multipart/form-data')
        ? await parseMultipartFormData(req)
        : { fields: await parseBody(req), files: [] };
    const fields = body.fields || {};
    const files = Array.isArray(body.files) ? body.files : [];

    const submission = {
        name: String(fields.name || '').trim(),
        email: normalizeEmail(fields.email),
        phone: String(fields.phone || '').trim(),
        country: String(fields.country || '').trim(),
        interest: String(fields.interest || '').trim(),
        referred: String(fields.Referred || fields.referred || '').trim(),
        submittedAtAu: String(fields['Submitted at (Australia/Melbourne)'] || fields.submittedAtAu || '').trim(),
        subject: String(fields._subject || fields.subject || 'Request for Assessment').trim(),
        cvFilename: String(files.find((file) => file.fieldName === 'attachment' || file.fieldName === 'cv')?.filename || '').trim(),
        attachments: []
    };

    const cvFile = files.find((file) => (file.fieldName === 'attachment' || file.fieldName === 'cv') && file.buffer?.length);
    if (cvFile) {
        submission.attachments.push({
            filename: cvFile.filename || 'cv',
            content: cvFile.buffer.toString('base64')
        });
    }

    return submission;
}

async function sendAssessmentNotificationEmail(submission) {
    if (!resendApiKey) {
        return { skipped: true };
    }

    const subject = `New Eligibility Assessment Request - ${String(submission?.name || 'Unknown').trim()}`;
    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Eligibility Assessment</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: 'Inter', Helvetica, Arial, sans-serif;">
    <div style="max-width: 680px; margin: 0 auto; padding: 40px 20px;">
        <div style="background: #ffffff; border-radius: 16px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.06);">
            <h1 style="margin: 0 0 18px; font-family: 'Outfit', Helvetica, Arial, sans-serif; color: #1A1A1A;">New Eligibility Assessment Request</h1>
            <table style="width: 100%; border-collapse: collapse; font-size: 15px; color: #333333;">
                <tr><td style="padding: 8px 0; font-weight: 700;">Name</td><td style="padding: 8px 0;">${escapeHtml(submission?.name || '')}</td></tr>
                <tr><td style="padding: 8px 0; font-weight: 700;">Email</td><td style="padding: 8px 0;">${escapeHtml(submission?.email || '')}</td></tr>
                <tr><td style="padding: 8px 0; font-weight: 700;">Phone</td><td style="padding: 8px 0;">${escapeHtml(submission?.phone || '')}</td></tr>
                <tr><td style="padding: 8px 0; font-weight: 700;">Country</td><td style="padding: 8px 0;">${escapeHtml(submission?.country || '')}</td></tr>
                <tr><td style="padding: 8px 0; font-weight: 700;">Interest</td><td style="padding: 8px 0;">${escapeHtml(submission?.interest || '')}</td></tr>
                <tr><td style="padding: 8px 0; font-weight: 700;">Referred</td><td style="padding: 8px 0;">${escapeHtml(submission?.referred || '') || 'N/A'}</td></tr>
                <tr><td style="padding: 8px 0; font-weight: 700;">Submitted At</td><td style="padding: 8px 0;">${escapeHtml(submission?.submittedAtAu || '')}</td></tr>
                <tr><td style="padding: 8px 0; font-weight: 700;">CV Uploaded</td><td style="padding: 8px 0;">${escapeHtml(submission?.cvFilename || 'No')}</td></tr>
            </table>
        </div>
    </div>
</body>
</html>
    `;

    const attachments = Array.isArray(submission?.attachments) ? submission.attachments : [];

    return sendResendEmail({
        to: 'info@venancia.com.au',
        subject,
        html,
        attachments,
        from: assessmentAutoReplyFromEmail,
        replyTo: submission?.email
    });
}

async function sendAssessmentAutoReply(submission) {
    if (!resendApiKey) {
        return { skipped: true };
    }

    const recipientEmail = normalizeEmail(submission?.email);
    if (!recipientEmail || !recipientEmail.includes('@')) {
        throw new Error('A valid applicant email address is required for the auto-reply.');
    }

    const applicantName = String(submission?.name || 'Applicant').trim();
    const subject = 'We received your Eligibility Assessment request';
    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Eligibility Assessment Received</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@400;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; background-color: #F8F9FB; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F8F9FB; padding: 60px 20px;">
        <tr>
            <td align="center">
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 800px; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.04); border: 1px solid #E5E7EB;">
                    <!-- Header Logo Area -->
                    <tr>
                        <td align="center" style="padding: 50px 40px 30px;">
                            <div style="font-family: 'Outfit', sans-serif; font-size: 32px; font-weight: 700; color: #111827; letter-spacing: -1px;">
                                <span style="color: #FFB800;">Venancia</span> Consultancy
                            </div>
                        </td>
                    </tr>
                    <!-- Main Content -->
                    <tr>
                        <td style="padding: 0 60px 50px;">
                            <table width="100%" border="0" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td align="center" style="padding-bottom: 30px;">
                                        <div style="background-color: rgba(255, 184, 0, 0.08); width: 80px; height: 80px; border-radius: 50%; display: inline-block;">
                                            <table width="100%" height="100%" border="0" cellspacing="0" cellpadding="0">
                                                <tr><td align="center" valign="middle" style="color: #FF8A00; font-size: 40px; line-height: 1;">✓</td></tr>
                                            </table>
                                        </div>
                                    </td>
                                </tr>
                                <tr>
                                    <td align="center" style="padding-bottom: 40px;">
                                        <h1 style="margin: 0 0 14px; color: #111827; font-family: 'Outfit', sans-serif; font-size: 32px; font-weight: 700; line-height: 1.2;">Eligibility Assessment Received</h1>
                                        <p style="margin: 0; color: #6B7280; font-size: 18px; line-height: 1.6;">Your request has been successfully logged and is now being reviewed by our specialists.</p>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px 0 8px;">
                                        <p style="margin: 0 0 18px; color: #111827; font-size: 16px; font-weight: 600;">Dear ${escapeHtml(applicantName)},</p>
                                        <p style="margin: 0 0 18px; color: #374151; font-size: 16px; line-height: 1.7;">
                                            Thank you for submitting your application to <strong>Venancia Consultancy Pty Ltd</strong>.
                                        </p>
                                        <p style="margin: 0 0 18px; color: #374151; font-size: 16px; line-height: 1.7;">
                                            We have received your details, and our team is currently evaluating your profile for an initial eligibility assessment. This process ensures we identify the most suitable pathways for your specific goals.
                                        </p>
                                        <p style="margin: 0; color: #374151; font-size: 16px; line-height: 1.7;">
                                            Our consultants carefully assess every application. You can expect a detailed update within <strong>24–48 hours</strong> regarding your next steps.
                                        </p>
                                    </td>
                                </tr>
                                <tr>
                                    <td align="center" style="padding-top: 40px; padding-bottom: 20px;">
                                        <p style="margin: 0 0 10px; color: #6B7280; font-size: 15px;">If you have any urgent questions, reach out at:</p>
                                        <p style="margin: 0; color: #111827; font-size: 15px; font-weight: 600;">info@venancia.com.au</p>
                                    </td>
                                </tr>
                                <tr>
                                    <td align="center" style="padding-top: 16px;">
                                        <table border="0" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                                            <tr>
                                                <td align="center" style="border-radius: 10px; background-color: #FF8A00; background: linear-gradient(135deg, #FFB800, #FF8A00);">
                                                    <a href="${escapeHtml(publicSiteUrl.replace(/\/$/, ''))}" target="_blank" style="font-size: 14px; font-family: 'Outfit', sans-serif; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 10px; padding: 12px 28px; display: inline-block; box-shadow: 0 6px 14px rgba(255, 138, 0, 0.22);">Visit Our Website</a>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td align="center" style="padding: 40px; background-color: #F9FAFB; border-top: 1px solid #F3F4F6;">
                            <p style="margin: 0; color: #6B7280; font-size: 15px; font-weight: 500;">
                                Kind regards,<br>
                                <strong style="color: #111827;">Venancia Consultancy Office</strong>
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
        to: recipientEmail,
        subject,
        html,
        from: assessmentAutoReplyFromEmail,
        replyTo: 'info@venancia.com.au'
    });
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
                if (isActiveSubscriber(existing)) {
                    return { ...existing, created: false };
                }

                const revived = {
                    ...existing,
                    status: 'active',
                    updatedAt: new Date().toISOString()
                };
                subscribers.set(normalizedEmail, revived);
                return { ...revived, created: true, reactivated: true };
            }

            const subscriber = {
                email: normalizedEmail,
                unsubscribeToken: createPostId(),
                status: 'active',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            subscribers.set(normalizedEmail, subscriber);
            return { ...subscriber, created: true };
        },
        async removeSubscriberByEmail(email) {
            const normalizedEmail = normalizeEmail(email);
            const existing = subscribers.get(normalizedEmail);
            if (!existing) {
                return false;
            }

            subscribers.set(normalizedEmail, {
                ...existing,
                status: 'unsubscribed',
                updatedAt: new Date().toISOString()
            });
            return true;
        },
        async removeSubscriberByToken(token) {
            const normalizedToken = String(token || '').trim();
            if (!normalizedToken) return false;

            for (const [email, subscriber] of subscribers.entries()) {
                if (subscriber.unsubscribeToken === normalizedToken) {
                    subscribers.set(email, {
                        ...subscriber,
                        status: 'unsubscribed',
                        updatedAt: new Date().toISOString()
                    });
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
            const response = await supabaseRequest(`/subscribers?select=email,unsubscribe_token,created_at,updated_at,status&email=eq.${encodeURIComponent(normalizedEmail)}`, {
                method: 'GET'
            });

            if (!response.ok) {
                const body = await response.text();
                if (response.status === 400 && isMissingSubscriberStatusColumnError(body)) {
                    const fallbackResponse = await supabaseRequest(`/subscribers?select=email,unsubscribe_token,created_at,updated_at&email=eq.${encodeURIComponent(normalizedEmail)}`, {
                        method: 'GET'
                    });

                    if (!fallbackResponse.ok) {
                        const fallbackBody = await fallbackResponse.text();
                        if (fallbackResponse.status === 404 && isMissingSubscribersTableError(fallbackBody)) {
                            return fallbackSubscribers.get(normalizedEmail) || null;
                        }
                        throw new Error(`Supabase subscriber lookup failed: ${fallbackResponse.status} ${fallbackBody}`);
                    }

                    const fallbackRows = await fallbackResponse.json();
                    const fallbackRow = Array.isArray(fallbackRows) ? fallbackRows[0] : fallbackRows;
                    if (!fallbackRow) {
                        const fallbackSubscriber = fallbackSubscribers.get(normalizedEmail) || null;
                        return fallbackSubscriber ? normalizeSubscriberRecord(fallbackSubscriber) : null;
                    }

                    return normalizeSubscriberRecord(fallbackRow);
                }
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
            if (existing && isActiveSubscriber(existing)) {
                return { ...existing, created: false };
            }

            if (existing && !isActiveSubscriber(existing)) {
                const response = await supabaseRequest(`/subscribers?email=eq.${encodeURIComponent(normalizedEmail)}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        Prefer: 'return=representation'
                    },
                    body: JSON.stringify({
                        status: 'active'
                    })
                });

                if (!response.ok) {
                    const body = await response.text();
                    if (response.status === 404 && isMissingSubscribersTableError(body)) {
                        const subscriber = {
                            email: normalizedEmail,
                            unsubscribeToken: existing.unsubscribeToken || createPostId(),
                            status: 'active',
                            createdAt: existing.createdAt || new Date().toISOString(),
                            updatedAt: new Date().toISOString()
                        };
                        fallbackSubscribers.set(normalizedEmail, subscriber);
                        return { ...subscriber, created: true, reactivated: true };
                    }
                    throw new Error(`Supabase re-subscribe failed: ${response.status} ${body}`);
                }

                const rows = await response.json();
                const row = Array.isArray(rows) ? rows[0] : rows;
                const subscriber = {
                    email: normalizeEmail(row?.email || normalizedEmail),
                    unsubscribeToken: String(row?.unsubscribe_token || existing.unsubscribeToken || '').trim() || createPostId(),
                    status: normalizeSubscriberStatus(row?.status),
                    createdAt: String(row?.created_at || existing.createdAt || '').trim() || new Date().toISOString(),
                    updatedAt: String(row?.updated_at || '').trim() || new Date().toISOString(),
                    created: true,
                    reactivated: true
                };
                fallbackSubscribers.set(subscriber.email, subscriber);
                return subscriber;
            }

            const response = await supabaseRequest('/subscribers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Prefer: 'return=representation'
                },
                body: JSON.stringify([{
                    email: normalizedEmail,
                    status: 'active'
                }])
            });

            if (!response.ok) {
                const body = await response.text();
                if (response.status === 400 && isMissingSubscriberStatusColumnError(body)) {
                    const retryResponse = await supabaseRequest('/subscribers', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Prefer: 'return=representation'
                        },
                        body: JSON.stringify([{
                            email: normalizedEmail
                        }])
                    });

                    if (!retryResponse.ok) {
                        const retryBody = await retryResponse.text();
                        if (retryResponse.status === 404 && isMissingSubscribersTableError(retryBody)) {
                            const subscriber = {
                                email: normalizedEmail,
                                unsubscribeToken: createPostId(),
                                status: 'active',
                                createdAt: new Date().toISOString(),
                                updatedAt: new Date().toISOString()
                            };
                            fallbackSubscribers.set(normalizedEmail, subscriber);
                            return { ...subscriber, created: true };
                        }
                        if (retryResponse.status === 409) {
                            const existing = await this.getSubscriberByEmail(normalizedEmail);
                            if (existing) {
                                return { ...existing, created: false };
                            }
                        }
                        throw new Error(`Supabase subscribe failed: ${retryResponse.status} ${retryBody}`);
                    }

                    const retryRows = await retryResponse.json();
                    const retryRow = Array.isArray(retryRows) ? retryRows[0] : retryRows;
                    const retrySubscriber = {
                        email: normalizeEmail(retryRow?.email || normalizedEmail),
                        unsubscribeToken: String(retryRow?.unsubscribe_token || '').trim() || createPostId(),
                        status: normalizeSubscriberStatus(retryRow?.status),
                        createdAt: String(retryRow?.created_at || '').trim() || new Date().toISOString(),
                        updatedAt: String(retryRow?.updated_at || '').trim() || new Date().toISOString(),
                        created: true
                    };
                    fallbackSubscribers.set(retrySubscriber.email, retrySubscriber);
                    return retrySubscriber;
                }
                if (response.status === 404 && isMissingSubscribersTableError(body)) {
                    const subscriber = {
                        email: normalizedEmail,
                        unsubscribeToken: createPostId(),
                        status: 'active',
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
                status: normalizeSubscriberStatus(row?.status),
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
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Prefer: 'return=representation'
                },
                body: JSON.stringify({
                    status: 'unsubscribed'
                })
            });

            if (!response.ok) {
                const body = await response.text();
                if (response.status === 400 && isMissingSubscriberStatusColumnError(body)) {
                    const error = new Error('Supabase subscribers table is missing the status column. Apply supabase-schema.sql before using unsubscribe.');
                    error.statusCode = 500;
                    throw error;
                }
                if (response.status === 404 && isMissingSubscribersTableError(body)) {
                    const subscriber = fallbackSubscribers.get(normalizedEmail);
                    if (!subscriber) {
                        return false;
                    }
                    fallbackSubscribers.set(normalizedEmail, {
                        ...subscriber,
                        status: 'unsubscribed',
                        updatedAt: new Date().toISOString()
                    });
                    return true;
                }
                throw new Error(`Supabase unsubscribe failed: ${response.status} ${body}`);
            }

            const subscriber = fallbackSubscribers.get(normalizedEmail);
            if (subscriber) {
                fallbackSubscribers.set(normalizedEmail, {
                    ...subscriber,
                    status: 'unsubscribed',
                    updatedAt: new Date().toISOString()
                });
            }
            return true;
        },
        async removeSubscriberByToken(token) {
            const normalizedToken = String(token || '').trim();
            if (!normalizedToken) return false;

            const response = await supabaseRequest(`/subscribers?unsubscribe_token=eq.${encodeURIComponent(normalizedToken)}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Prefer: 'return=representation'
                },
                body: JSON.stringify({
                    status: 'unsubscribed'
                })
            });

            if (!response.ok) {
                const body = await response.text();
                if (response.status === 400 && isMissingSubscriberStatusColumnError(body)) {
                    const error = new Error('Supabase subscribers table is missing the status column. Apply supabase-schema.sql before using unsubscribe.');
                    error.statusCode = 500;
                    throw error;
                }
                if (response.status === 404 && isMissingSubscribersTableError(body)) {
                    for (const [email, subscriber] of fallbackSubscribers.entries()) {
                        if (subscriber.unsubscribeToken === normalizedToken) {
                            fallbackSubscribers.set(email, {
                                ...subscriber,
                                status: 'unsubscribed',
                                updatedAt: new Date().toISOString()
                            });
                            return true;
                        }
                    }
                    return false;
                }
                throw new Error(`Supabase unsubscribe by token failed: ${response.status} ${body}`);
            }

            for (const [email, subscriber] of fallbackSubscribers.entries()) {
                if (subscriber.unsubscribeToken === normalizedToken) {
                    fallbackSubscribers.set(email, {
                        ...subscriber,
                        status: 'unsubscribed',
                        updatedAt: new Date().toISOString()
                    });
                    break;
                }
            }
            return true;
        },
        async listSubscribers() {
            const response = await supabaseRequest('/subscribers?select=email,unsubscribe_token,created_at,updated_at,status', {
                method: 'GET'
            });

            if (!response.ok) {
                const body = await response.text();
                if (response.status === 400 && isMissingSubscriberStatusColumnError(body)) {
                    const fallbackResponse = await supabaseRequest('/subscribers?select=email,unsubscribe_token,created_at,updated_at', {
                        method: 'GET'
                    });

                    if (!fallbackResponse.ok) {
                        const fallbackBody = await fallbackResponse.text();
                        if (fallbackResponse.status === 404 && isMissingSubscribersTableError(fallbackBody)) {
                            return [...fallbackSubscribers.values()].map((subscriber) => ({ ...subscriber }));
                        }
                        throw new Error(`Supabase subscribers list failed: ${fallbackResponse.status} ${fallbackBody}`);
                    }

                    const fallbackRows = await fallbackResponse.json();
                    const fallbackMerged = new Map();
                    for (const row of (Array.isArray(fallbackRows) ? fallbackRows : [])) {
                        const normalized = normalizeSubscriberRecord(row);
                        if (normalized.email) {
                            fallbackMerged.set(normalized.email, normalized);
                        }
                    }
                    for (const subscriber of fallbackSubscribers.values()) {
                        const normalized = normalizeSubscriberRecord(subscriber);
                        if (normalized.email) {
                            fallbackMerged.set(normalized.email, normalized);
                        }
                    }
                    return sortSubscriberRecords([...fallbackMerged.values()]);
                }
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
        data = Buffer.from(String(data));
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

async function getNotificationRecipients() {
    const subscribers = await store.listSubscribers().catch(() => []);
    const fromEmail = extractEmailAddress(resendFromEmail);
    const activeEmails = new Set();

    for (const subscriber of subscribers) {
        const email = normalizeEmail(subscriber?.email);
        if (!email || email === fromEmail || isExcludedSubscriberEmail(email)) {
            continue;
        }

        if (!isActiveSubscriber(subscriber)) {
            continue;
        }

        activeEmails.add(email);
    }

    return [...activeEmails];
}

function buildPostNotificationHtml(post) {
    return `
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
                <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);">
                    <tr>
                        <td align="center" style="padding: 40px 40px 20px;">
                            <h2 style="margin: 0; color: #1A1A1A; font-family: 'Outfit', Helvetica, Arial, sans-serif; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
                                <span style="color: #FFB800;">Venancia</span> Consultancy
                            </h2>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding: 20px 40px 40px;">
                            <div style="background-color: rgba(255, 184, 0, 0.1); padding: 8px 16px; border-radius: 50px; display: inline-block; margin-bottom: 24px;">
                                <span style="color: #FFB800; font-size: 14px; font-weight: 600; font-family: 'Inter', Helvetica, Arial, sans-serif; text-transform: uppercase; letter-spacing: 1px;">
                                    New ${post.isAnnouncement ? 'Announcement' : 'Blog Post'}
                                </span>
                            </div>
                            <h1 style="margin: 0 0 16px; color: #1A1A1A; font-family: 'Outfit', Helvetica, Arial, sans-serif; font-size: 26px; font-weight: 700; line-height: 1.3;">${escapeHtml(post.title)}</h1>
                            <p style="margin: 0 0 24px; color: #666666; font-size: 14px; font-weight: 500;">
                                ${escapeHtml(post.category)} &nbsp;•&nbsp; ${escapeHtml(post.date)}
                            </p>
                            ${buildPostSummary(post)}
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding: 30px 40px; background-color: #f9f9f9; border-top: 1px solid #eeeeee;">
                            <p style="margin: 0 0 8px; color: #888888; font-size: 14px;">
                                © ${new Date().getFullYear()} Venancia Consultancy. All rights reserved.
                            </p>
                            <p style="margin: 0; color: #aaaaaa; font-size: 12px;">
                                You received this email because you subscribed to updates on our website.
                            </p>
                            <p style="margin: 8px 0 0; color: #aaaaaa; font-size: 12px;">
                                <a href="${escapeHtml(buildUnsubscribeUrl())}" style="color: #FF8A00; text-decoration: none;">Unsubscribe</a>
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
}

async function sendPostNotifications(post, emails) {
    if (!resendApiKey) {
        return { skipped: true, recipientCount: emails.length };
    }

    const subject = post.isAnnouncement
        ? `New announcement: ${post.title}`
        : `New blog post: ${post.title}`;
    const html = buildPostNotificationHtml(post);

    const results = [];
    for (const email of emails) {
        const result = await sendResendEmail({
            to: email,
            subject,
            html
        });
        results.push(result);
    }

    return { sent: true, recipientCount: emails.length, batches: results.length, mode: 'individual' };
}

async function notifySubscribers(post) {
    const emails = await getNotificationRecipients();
    if (emails.length === 0 || !resendApiKey) {
        return { skipped: true, recipientCount: emails.length };
    }

    return sendPostNotifications(post, emails);
}

async function resendPostToSubscribers(post, options = {}) {
    const recipientMode = String(options.recipientMode || 'all').toLowerCase();

    if (recipientMode === 'single') {
        const email = normalizeEmail(options.email);
        if (!email || !email.includes('@')) {
            const error = new Error('A valid email address is required.');
            error.statusCode = 400;
            throw error;
        }

        if (isExcludedSubscriberEmail(email)) {
            const error = new Error('That email address is excluded from subscriber sends.');
            error.statusCode = 400;
            throw error;
        }

        const subscriber = await store.getSubscriberByEmail(email).catch(() => null);
        if (subscriber && !isActiveSubscriber(subscriber)) {
            const error = new Error('That email address is unsubscribed.');
            error.statusCode = 400;
            throw error;
        }

        return sendPostNotifications(post, [email]);
    }

    const emails = await getNotificationRecipients();
    if (emails.length === 0 || !resendApiKey) {
        return { skipped: true, recipientCount: emails.length };
    }

    return sendPostNotifications(post, emails);
}

async function sendPostToAllSubscribers(post) {
    return resendPostToSubscribers(post, { recipientMode: 'all' });
}

async function sendPostToSingleSubscriber(post, email) {
    return resendPostToSubscribers(post, { recipientMode: 'single', email });
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

        if (url.pathname === '/api/assessment' && req.method === 'POST') {
            const submission = await parseAssessmentSubmission(req);

            if (!submission.name || !submission.email || !submission.phone || !submission.country || !submission.interest) {
                res.writeHead(400, {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Cache-Control': 'no-store',
                    ...corsHeaders(origin)
                });
                res.end(JSON.stringify({ error: 'Please complete all required fields.' }));
                return;
            }

            const notificationEmail = await sendAssessmentNotificationEmail(submission).catch((error) => {
                console.error('Assessment notification failed:', error);
                return { sent: false, error: error.message || 'Notification email failed.' };
            });

            const autoReplyEmail = await sendAssessmentAutoReply(submission).catch((error) => {
                console.error('Assessment auto-reply failed:', error);
                return { sent: false, error: error.message || 'Auto-reply failed.' };
            });

            res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
                ...corsHeaders(origin)
            });
            res.end(JSON.stringify({
                ok: true,
                notificationEmail,
                autoReplyEmail
            }));
            return;
        }

        if (url.pathname === '/api/assessment-reply' && req.method === 'POST') {
            const submission = await parseAssessmentSubmission(req);

            if (!submission.name || !submission.email || !submission.phone || !submission.country || !submission.interest) {
                res.writeHead(400, {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Cache-Control': 'no-store',
                    ...corsHeaders(origin)
                });
                res.end(JSON.stringify({ error: 'Please complete all required fields.' }));
                return;
            }

            const autoReplyEmail = await sendAssessmentAutoReply(submission).catch((error) => {
                console.error('Assessment auto-reply failed:', error);
                return { sent: false, error: error.message || 'Auto-reply failed.' };
            });

            res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
                ...corsHeaders(origin)
            });
            res.end(JSON.stringify({
                ok: true,
                autoReplyEmail
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
            if (!(await requireAdminAuth(req, res))) {
                return;
            }
            await store.ensureSeeded?.();
            const subscribers = (await store.listSubscribers()).filter((subscriber) => !isExcludedSubscriberEmail(subscriber?.email));
            res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
                ...corsHeaders(origin)
            });
            res.end(JSON.stringify({ subscribers }));
            return;
        }

        if (url.pathname === '/api/posts' && req.method === 'GET') {
            if (!(await requireAdminAuth(req, res))) {
                return;
            }
            await store.ensureSeeded();
            res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
                ...corsHeaders(origin)
            });
            res.end(JSON.stringify({ posts: await store.listPosts() }));
            return;
        }

        if (url.pathname.startsWith('/api/posts/') && url.pathname.endsWith('/send-all') && req.method === 'POST') {
            if (!(await requireAdminAuth(req, res))) {
                return;
            }
            await store.ensureSeeded();
            const id = decodeURIComponent(url.pathname.replace('/api/posts/', '').replace('/send-all', ''));
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

            const result = await sendPostToAllSubscribers(post);
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

        if (url.pathname.startsWith('/api/posts/') && url.pathname.endsWith('/send-single') && req.method === 'POST') {
            if (!(await requireAdminAuth(req, res))) {
                return;
            }
            await store.ensureSeeded();
            const id = decodeURIComponent(url.pathname.replace('/api/posts/', '').replace('/send-single', ''));
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

            const body = await parseBody(req);
            const result = await sendPostToSingleSubscriber(post, body.email);
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

        if (url.pathname.startsWith('/api/posts/') && url.pathname.endsWith('/resend') && req.method === 'POST') {
            if (!(await requireAdminAuth(req, res))) {
                return;
            }
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

            const body = await parseBody(req);
            const result = await resendPostToSubscribers(post, body);
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
                if (!(await requireAdminAuth(req, res))) {
                    return;
                }
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
                if (!(await requireAdminAuth(req, res))) {
                    return;
                }
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
                if (!(await requireAdminAuth(req, res))) {
                    return;
                }
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
            if (!(await requireAdminAuth(req, res))) {
                return;
            }
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
