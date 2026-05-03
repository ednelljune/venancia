// Admin Dashboard Logic for Venancia Consultancy

const initVenanciaAdmin = async () => {
    const auth = window.VenanciaSupabaseAuth;
    const resolveApiBaseUrl = () => {
        if (window.VenanciaApiBaseUrl) {
            return window.VenanciaApiBaseUrl;
        }

        const host = window.location.hostname;
        if (
            host === 'localhost' ||
            host === '127.0.0.1' ||
            host.endsWith('.local') ||
            host === 'venancia.onrender.com'
        ) {
            return '';
        }

        return 'https://venancia.onrender.com';
    };
    const apiBaseUrl = resolveApiBaseUrl();

    if (!auth || typeof auth.requireSession !== 'function') {
        window.location.href = 'admin-login.html';
        return;
    }

    const session = await auth.requireSession().catch(() => null);
    if (!session) {
        window.location.href = 'admin-login.html';
        return;
    }

    const authConfig = await auth.getConfig().catch(() => null);
    const authUser = await auth.getUser(session).catch(() => session.user || null);

    let posts = Array.isArray(window.VENANCIA_CONTENT?.posts) ? window.VENANCIA_CONTENT.posts : [];
    let activeTab = window.VENANCIA_ACTIVE_PAGE || 'overview';

    const overviewTableBody = document.getElementById('overview-table-body');
    const blogTableBody = document.getElementById('blog-table-body');
    const announcementsTableBody = document.getElementById('announcements-table-body');
    const postModal = document.getElementById('post-modal');
    const exportModal = document.getElementById('export-modal');
    const postForm = document.getElementById('post-form');
    const addPostBtn = document.getElementById('add-post-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const statPostsCount = document.getElementById('stat-posts-count');
    const statAnnounceCount = document.getElementById('stat-announcements-count');
    const tableTitle = document.getElementById('table-title');
    const tabTitle = document.getElementById('tab-title');
    const tabSubtitle = document.getElementById('tab-subtitle');
    const tableHead = document.getElementById('table-head');
    const modalTitle = document.getElementById('modal-title');
    const editIdInput = document.getElementById('edit-id');
    const postTitleInput = document.getElementById('post-title-input');
    const postCategoryInput = document.getElementById('post-category-input');
    const postReadTimeInput = document.getElementById('post-read-time-input');
    const postDateInput = document.getElementById('post-date-input');
    const postContentInput = document.getElementById('post-content-input');
    const postAnnouncementInput = document.getElementById('post-announcement-input');
    const resendPostBtn = document.getElementById('resend-post-btn');
    const sendOptionsModal = document.getElementById('send-options-modal');
    const sendOptionsTitle = document.getElementById('send-options-title');
    const sendOptionsSubtitle = document.getElementById('send-options-subtitle');
    const sendOptionsCloseBtn = document.getElementById('send-options-close-btn');
    const sendSpecificForm = document.getElementById('send-specific-form');
    const sendSpecificEmailInput = document.getElementById('send-specific-email');
    const sendSpecificPickerBtn = document.getElementById('send-specific-picker-btn');
    const sendSpecificPickerPanel = document.getElementById('send-specific-picker-panel');
    const sendSpecificPickerSearch = document.getElementById('send-specific-picker-search');
    const sendSpecificPickerTableBody = document.getElementById('send-specific-picker-table-body');
    const sendSpecificPickerStatus = document.getElementById('send-specific-picker-status');
    const sendAllBtn = document.getElementById('send-all-btn');
    const sendSpecificBtn = document.getElementById('send-specific-btn');
    const exportTextarea = document.getElementById('export-textarea');

    const closeModalButtons = document.querySelectorAll('.close-modal');
    const tabLinks = document.querySelectorAll('.nav-item[data-tab]');
    let pendingSendPostId = '';
    let subscriberPickerLoaded = false;
    let subscriberPickerLoading = false;
    let subscriberEmails = [];
    let subscriberPickerSearchQuery = '';

    const setInputValue = (input, value) => {
        if (input) {
            input.value = value ?? '';
        }
    };

    const getInputValue = (input, fallback = '') => {
        return input ? String(input.value || '').trim() : fallback;
    };

    const escapeHtml = (value) => String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const authHeaders = async (extraHeaders = {}) => {
        if (!auth || typeof auth.getAuthorizedHeaders !== 'function') {
            throw new Error('Please sign in again.');
        }

        return auth.getAuthorizedHeaders(extraHeaders);
    };

    const renderSubscriberPicker = () => {
        if (!sendSpecificPickerTableBody) {
            return;
        }

        if (subscriberPickerLoading) {
            if (sendSpecificPickerStatus) {
                sendSpecificPickerStatus.innerText = 'Loading subscribers...';
            }
            sendSpecificPickerTableBody.innerHTML = '';
            return;
        }

        const filteredEmails = subscriberEmails.filter((email) => {
            if (!subscriberPickerSearchQuery) {
                return true;
            }

            return email.toLowerCase().includes(subscriberPickerSearchQuery.toLowerCase());
        });

        if (sendSpecificPickerStatus) {
            sendSpecificPickerStatus.innerText = subscriberEmails.length
                ? `Showing ${filteredEmails.length} of ${subscriberEmails.length} active subscriber${subscriberEmails.length === 1 ? '' : 's'}.`
                : 'No active subscribers available.';
        }

        if (!subscriberEmails.length) {
            sendSpecificPickerTableBody.innerHTML = `
                <tr>
                    <td colspan="3" style="padding: 14px; color: var(--dark-grey); font-size: 0.9rem;">
                        No active subscribers available.
                    </td>
                </tr>
            `;
            return;
        }

        if (!filteredEmails.length) {
            sendSpecificPickerTableBody.innerHTML = `
                <tr>
                    <td colspan="3" style="padding: 14px; color: var(--dark-grey); font-size: 0.9rem;">
                        No subscribers match your search.
                    </td>
                </tr>
            `;
            return;
        }

        sendSpecificPickerTableBody.innerHTML = filteredEmails.map((email, index) => `
            <tr data-subscriber-email-row="${escapeHtml(email)}" style="cursor: pointer; ${index % 2 === 0 ? 'background: #fff;' : 'background: #fafafa;'}">
                <td style="padding: 12px 14px; border-bottom: 1px solid #eee; font-weight: 600; color: var(--dark);">
                    ${escapeHtml(email)}
                </td>
                <td style="padding: 12px 14px; border-bottom: 1px solid #eee; color: var(--dark-grey); font-size: 0.85rem;">
                    Subscriber
                </td>
                <td style="padding: 12px 14px; border-bottom: 1px solid #eee; text-align: right;">
                    <button type="button" class="btn btn-outline" style="padding: 8px 12px; font-size: 0.8rem;">
                        Select
                    </button>
                </td>
            </tr>
        `).join('');

        document.querySelectorAll('[data-subscriber-email-row]').forEach((row) => {
            row.addEventListener('click', () => {
                const email = row.getAttribute('data-subscriber-email-row') || '';
                if (sendSpecificEmailInput) {
                    sendSpecificEmailInput.value = email;
                    sendSpecificEmailInput.focus();
                    sendSpecificEmailInput.select();
                }
            });
        });
    };

    const loadSubscriberPicker = async () => {
        if (subscriberPickerLoaded || subscriberPickerLoading) {
            renderSubscriberPicker();
            return;
        }

        subscriberPickerLoading = true;
        renderSubscriberPicker();

        try {
            const response = await fetch(`${apiBaseUrl}/api/subscribers`, {
                cache: 'no-store',
                headers: await authHeaders()
            });
            if (!response.ok) {
                throw new Error('Unable to load subscribers.');
            }

            const data = await response.json().catch(() => ({}));
            subscriberEmails = Array.isArray(data.subscribers)
                ? data.subscribers
                    .filter((subscriber) => String(subscriber?.status || 'active').trim().toLowerCase() === 'active')
                    .map((subscriber) => String(subscriber?.email || '').trim())
                    .filter(Boolean)
                : [];
            subscriberPickerLoaded = true;
        } catch (error) {
            subscriberEmails = [];
            if (sendSpecificPickerStatus) {
                sendSpecificPickerStatus.innerText = error.message || 'Unable to load subscribers.';
            }
        } finally {
            subscriberPickerLoading = false;
            renderSubscriberPicker();
        }
    };

    const toDateInputValue = (value) => {
        if (!value) {
            return '';
        }

        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return value;
        }

        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
            return '';
        }

        return parsed.toISOString().slice(0, 10);
    };

    const toDisplayDateValue = (value) => {
        if (!value) {
            return '';
        }

        const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
            ? new Date(`${value}T00:00:00`)
            : new Date(value);

        if (Number.isNaN(parsed.getTime())) {
            return value;
        }

        return new Intl.DateTimeFormat('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        }).format(parsed);
    };

    const stripHtml = (value) => String(value || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const categoryTagClass = (category) => {
        if (category === 'Student') return 'gold';
        if (category === 'Visa Updates') return 'dark';
        if (category === 'Urgent') return 'gold';
        return '';
    };

    const sortPosts = (list) => [...list].sort((a, b) => {
        const sortDelta = (a.sortOrder || 0) - (b.sortOrder || 0);
        if (sortDelta !== 0) return sortDelta;
        return String(a.title || '').localeCompare(String(b.title || ''));
    });

    const isAnnouncementTab = () => activeTab === 'announcements';
    const isBlogTab = () => activeTab === 'blog';
    const isSettingsTab = () => activeTab === 'settings';

    const getTableBody = () => {
        if (isBlogTab()) return blogTableBody || overviewTableBody || announcementsTableBody;
        if (isAnnouncementTab()) return announcementsTableBody || overviewTableBody || blogTableBody;
        return overviewTableBody || blogTableBody || announcementsTableBody;
    };

    const getSettingsRows = () => {
        const backendBase = window.VenanciaApiBaseUrl || window.location.origin;
        return [
            {
                name: 'Signed-in admin',
                value: authUser?.email || session?.user?.email || 'Unknown',
                status: 'Active',
                notes: 'Current authenticated Supabase user'
            },
            {
                name: 'Authentication',
                value: authConfig?.authEnabled ? 'Supabase Auth' : 'Not configured',
                status: authConfig?.authEnabled ? 'Active' : 'Limited',
                notes: authConfig?.authEnabled ? 'Email/password login enabled' : 'Set SUPABASE_ANON_KEY to enable admin login'
            },
            {
                name: 'Content backend',
                value: backendBase,
                status: 'Connected',
                notes: 'API requests are routed here from the website'
            },
            {
                name: 'Posts table',
                value: 'public.posts',
                status: 'Required',
                notes: 'This table must exist in Supabase for content to load'
            }
        ];
    };

    const getVisiblePosts = () => {
        if (isAnnouncementTab()) {
            return sortPosts(posts.filter((post) => post.isAnnouncement));
        }

        if (isBlogTab()) {
            return sortPosts(posts.filter((post) => !post.isAnnouncement));
        }

        return sortPosts(posts);
    };

    const syncContentState = () => {
        posts = Array.isArray(window.VENANCIA_CONTENT?.posts) ? window.VENANCIA_CONTENT.posts : [];
    };

    const updateStats = () => {
        if (statPostsCount) {
            statPostsCount.innerText = posts.filter((post) => !post.isAnnouncement).length;
        }

        if (statAnnounceCount) {
            statAnnounceCount.innerText = posts.filter((post) => post.isAnnouncement).length;
        }
    };

    const syncTabUI = () => {
        if (isAnnouncementTab()) {
            if (tabTitle) tabTitle.innerText = 'Announcement Manager';
            if (tabSubtitle) tabSubtitle.innerText = 'Create and maintain featured announcements';
            if (tableTitle) tableTitle.innerText = 'Featured Announcements';
            if (addPostBtn) {
                addPostBtn.style.display = '';
                addPostBtn.innerHTML = '<i class="fas fa-plus"></i> New Announcement';
                addPostBtn.disabled = false;
            }
            if (tableHead) {
                tableHead.innerHTML = `
                    <th>Post Title</th>
                    <th>Type</th>
                    <th>Date Published</th>
                    <th>Read Time</th>
                    <th>Actions</th>
                `;
            }
            return;
        }

        if (isBlogTab()) {
            if (tabTitle) tabTitle.innerText = 'Blog Manager';
            if (tabSubtitle) tabSubtitle.innerText = 'Create and maintain blog posts';
            if (tableTitle) tableTitle.innerText = 'Blog Posts';
            if (addPostBtn) {
                addPostBtn.style.display = '';
                addPostBtn.innerHTML = '<i class="fas fa-plus"></i> New Post';
                addPostBtn.disabled = false;
            }
            if (tableHead) {
                tableHead.innerHTML = `
                    <th>Post Title</th>
                    <th>Type</th>
                    <th>Date Published</th>
                    <th>Read Time</th>
                    <th>Actions</th>
                `;
            }
            return;
        }

        if (tabTitle) tabTitle.innerText = 'Dashboard Overview';
        if (tabSubtitle) tabSubtitle.innerText = 'Welcome back, Admin';
        if (tableTitle) tableTitle.innerText = 'Recent Activity';
        if (addPostBtn) {
            addPostBtn.style.display = 'none';
        }
        if (tableHead) {
            tableHead.innerHTML = `
                <th>Title</th>
                <th>Type</th>
                <th>Date</th>
                <th>Actions</th>
            `;
        }
    };

    const renderPostsTable = () => {
        syncTabUI();

        const visiblePosts = getVisiblePosts();
        if (isSettingsTab()) {
            const settingsBody = getTableBody();
            if (!settingsBody) return;
            settingsBody.innerHTML = getSettingsRows().map((row) => `
                <tr>
                    <td class="post-title-cell">${escapeHtml(row.name)}</td>
                    <td>${escapeHtml(row.value)}</td>
                    <td><span class="status-badge active">${escapeHtml(row.status)}</span></td>
                    <td>${escapeHtml(row.notes)}</td>
                    <td>
                        <div class="action-btns">
                            <button class="btn-icon" type="button" title="Copy value" data-copy="${escapeHtml(row.value)}">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `).join('');

            document.querySelectorAll('[data-copy]').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    const value = btn.getAttribute('data-copy') || '';
                    try {
                        await navigator.clipboard.writeText(value);
                        btn.innerHTML = '<i class="fas fa-check"></i>';
                        setTimeout(() => {
                            btn.innerHTML = '<i class="fas fa-copy"></i>';
                        }, 1200);
                    } catch (error) {
                        alert('Unable to copy this value.');
                    }
                });
            });
            return;
        }

        const body = getTableBody();
        if (!body) {
            return;
        }

        if (visiblePosts.length === 0) {
            body.innerHTML = `
                <tr>
                    <td colspan="5" style="padding: 28px; text-align: center; color: var(--dark-grey);">
                        No ${isAnnouncementTab() ? 'announcements' : isBlogTab() ? 'blog posts' : 'entries'} available yet.
                    </td>
                </tr>
            `;
            return;
        }

        body.innerHTML = visiblePosts.map((post) => {
            const rowType = post.isAnnouncement ? 'Announcement' : 'Blog';
            const rowTypeClass = post.isAnnouncement ? 'gold' : '';
            const readTime = post.readTime || '';
            const actionButtons = `
                <button class="btn-icon edit-post" data-id="${escapeHtml(post.id)}"><i class="fas fa-edit"></i></button>
                <button class="btn-icon resend-post" data-id="${escapeHtml(post.id)}" title="Resend to subscribers"><i class="fas fa-paper-plane"></i></button>
                <button class="btn-icon delete delete-post" data-id="${escapeHtml(post.id)}"><i class="fas fa-trash-alt"></i></button>
            `;

            return `
                <tr>
                    <td class="post-title-cell">${escapeHtml(post.title)}</td>
                    <td><span class="category-tag ${rowTypeClass}">${escapeHtml(rowType)}</span></td>
                    <td>${escapeHtml(post.date)}</td>
                    <td>${escapeHtml(readTime)}</td>
                    <td>
                        <div class="action-btns">
                            ${actionButtons}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Re-attach event listeners for edit/delete buttons in any tab
        document.querySelectorAll('.edit-post').forEach((btn) => {
            btn.addEventListener('click', () => {
                openEditModal(btn.getAttribute('data-id'));
            });
        });

        document.querySelectorAll('.delete-post').forEach((btn) => {
            btn.addEventListener('click', async () => {
                try {
                    const id = btn.getAttribute('data-id');
                    const target = posts.find((post) => post.id === id);
                    if (!target || !confirm(`Are you sure you want to delete "${target.title}"?`)) return;

                    const response = await fetch(`${apiBaseUrl}/api/posts/${encodeURIComponent(id)}`, {
                        method: 'DELETE',
                        headers: await authHeaders()
                    });
                    if (!response.ok) { alert('Failed to delete the post.'); return; }

                    posts = posts.filter((post) => post.id !== id);
                    updateStats();
                    renderPostsTable();
                } catch (error) {
                    alert(error.message || 'Failed to delete the post.');
                }
            });
        });

        document.querySelectorAll('.resend-post').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const target = posts.find((post) => post.id === id);
                if (!target) return;
                openSendOptionsModal(id);
            });
        });
    };

    const openSendOptionsModal = (id) => {
        const target = posts.find((post) => post.id === id);
        if (!target || !sendOptionsModal) {
            return;
        }

        pendingSendPostId = id;
        if (sendOptionsTitle) {
            sendOptionsTitle.innerText = target.isAnnouncement ? 'Send Announcement' : 'Send Blog Post';
        }
        if (sendOptionsSubtitle) {
            sendOptionsSubtitle.innerText = `Choose whether to send "${target.title}" to all subscribers or a specific email address.`;
        }
        if (sendSpecificEmailInput) {
            sendSpecificEmailInput.value = '';
        }
        subscriberPickerSearchQuery = '';
        if (sendSpecificPickerSearch) {
            sendSpecificPickerSearch.value = '';
        }
        if (sendSpecificPickerPanel) {
            sendSpecificPickerPanel.style.display = 'none';
        }
        if (sendSpecificPickerBtn) {
            sendSpecificPickerBtn.innerHTML = '<i class="fas fa-plus"></i>';
        }
        sendOptionsModal.style.display = 'flex';
        sendSpecificEmailInput?.focus();
        loadSubscriberPicker();
    };

    const closeSendOptionsModal = () => {
        if (sendOptionsModal) {
            sendOptionsModal.style.display = 'none';
        }
        pendingSendPostId = '';
        if (sendSpecificEmailInput) {
            sendSpecificEmailInput.value = '';
        }
        subscriberPickerSearchQuery = '';
        if (sendSpecificPickerSearch) {
            sendSpecificPickerSearch.value = '';
        }
        if (sendSpecificPickerPanel) {
            sendSpecificPickerPanel.style.display = 'none';
        }
        if (sendSpecificPickerBtn) {
            sendSpecificPickerBtn.innerHTML = '<i class="fas fa-plus"></i>';
        }
    };

    const sendCurrentPost = async ({ recipientMode, email }) => {
        if (!pendingSendPostId) {
            throw new Error('No post selected.');
        }

        const modePath = recipientMode === 'single' ? 'send-single' : 'send-all';
        const response = await fetch(`${apiBaseUrl}/api/posts/${encodeURIComponent(pendingSendPostId)}/${modePath}`, {
            method: 'POST',
            headers: await authHeaders({
                'Content-Type': 'application/json'
            }),
            body: JSON.stringify({
                recipientMode,
                email
            })
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || 'Failed to send the post.');
        }

        const payload = await response.json().catch(() => ({}));
        const recipientCount = Number(payload.recipientCount || 0);
        closeSendOptionsModal();
        alert(`The post was sent to ${recipientCount} recipient${recipientCount === 1 ? '' : 's'}.`);
    };

    const openEditModal = (id) => {
        const post = posts.find((entry) => entry.id === id);
        if (!post) {
            return;
        }

        modalTitle.innerText = isAnnouncementTab() || post.isAnnouncement ? 'Edit Announcement' : 'Edit Blog Post';
        editIdInput.value = id;
        setInputValue(postTitleInput, post.title);
        setInputValue(postCategoryInput, post.category);
        setInputValue(postReadTimeInput, post.readTime);
        setInputValue(postDateInput, toDateInputValue(post.date));
        setInputValue(postContentInput, post.content);
        if (postAnnouncementInput) {
            postAnnouncementInput.checked = Boolean(post.isAnnouncement);
        }
        if (resendPostBtn) {
            resendPostBtn.style.display = 'inline-flex';
            resendPostBtn.onclick = async () => {
                const currentId = editIdInput.value.trim();
                if (!currentId) return;
                openSendOptionsModal(currentId);
            };
        }
        postModal.style.display = 'flex';
    };

    const openCreateModal = () => {
        modalTitle.innerText = isAnnouncementTab() ? 'Create New Announcement' : 'Create New Blog Post';
        postForm.reset();
        editIdInput.value = '';
        if (postAnnouncementInput) {
            postAnnouncementInput.checked = isAnnouncementTab();
        }
        if (resendPostBtn) {
            resendPostBtn.style.display = 'none';
            resendPostBtn.disabled = false;
            resendPostBtn.onclick = null;
            resendPostBtn.innerText = 'Send Post';
        }
        postModal.style.display = 'flex';
    };

    const savePost = async () => {
        const editId = editIdInput.value.trim();
        const payload = {
            title: getInputValue(postTitleInput),
            category: getInputValue(postCategoryInput),
            readTime: getInputValue(postReadTimeInput, isAnnouncementTab() ? '2 min read' : ''),
            date: toDisplayDateValue(getInputValue(postDateInput)),
            content: postContentInput ? postContentInput.value : '',
            isAnnouncement: Boolean(postAnnouncementInput?.checked)
        };

        if (!payload.readTime) {
            throw new Error('Read time is required.');
        }

        let response;
        if (editId) {
            response = await fetch(`${apiBaseUrl}/api/posts/${encodeURIComponent(editId)}`, {
                method: 'PUT',
                headers: await authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(payload)
            });
        } else {
            response = await fetch(`${apiBaseUrl}/api/posts`, {
                method: 'POST',
                headers: await authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(payload)
            });
        }

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Unable to save the post.');
        }

        const result = await response.json();
        const savedPost = result.post;

        posts = posts.filter((post) => post.id !== editId && post.id !== savedPost.id);
        posts.push(savedPost);
        posts = sortPosts(posts);
        updateStats();
        renderPostsTable();
        postModal.style.display = 'none';
        if (resendPostBtn) {
            resendPostBtn.style.display = 'none';
            resendPostBtn.disabled = false;
            resendPostBtn.onclick = null;
            resendPostBtn.innerText = 'Send Post';
        }
    };

    tabLinks.forEach((link) => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const tab = link.getAttribute('data-tab');
            activeTab = tab || 'overview';

            tabLinks.forEach((item) => item.classList.remove('active'));
            link.classList.add('active');
            renderPostsTable();
        });
    });

    document.querySelectorAll('.add-post-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (isSettingsTab()) {
                renderPostsTable();
                return;
            }
            openCreateModal();
        });
    });

    closeModalButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            postModal.style.display = 'none';
            exportModal.style.display = 'none';
            closeSendOptionsModal();
            if (resendPostBtn) {
                resendPostBtn.style.display = 'none';
                resendPostBtn.disabled = false;
                resendPostBtn.onclick = null;
                resendPostBtn.innerText = 'Send Post';
            }
        });
    });

    if (sendOptionsCloseBtn) {
        sendOptionsCloseBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            closeSendOptionsModal();
        });
    }

    if (postForm) {
        postForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            try {
                await savePost();
            } catch (error) {
                alert(error.message || 'Unable to save the post.');
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await auth.signOut().catch(() => null);
            window.location.href = 'admin-login.html';
        });
    }

    const exportBtn = document.getElementById('export-btn');
    if (exportBtn && exportTextarea && exportModal) {
        exportBtn.addEventListener('click', () => {
            const exportStr = `window.VENANCIA_CONTENT = ${JSON.stringify({ posts }, null, 4)};`;
            exportTextarea.value = exportStr;
            exportModal.style.display = 'flex';
        });
    }

    const copyExportBtn = document.getElementById('copy-export-btn');
    if (copyExportBtn && exportTextarea) {
        copyExportBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(exportTextarea.value);
                alert('Configuration copied to clipboard!');
            } catch (error) {
                exportTextarea.select();
                document.execCommand('copy');
                alert('Configuration copied to clipboard!');
            }
        });
    }

    if (sendAllBtn) {
        sendAllBtn.addEventListener('click', async () => {
            try {
                sendAllBtn.disabled = true;
                sendAllBtn.innerText = 'Sending...';
                await sendCurrentPost({ recipientMode: 'all' });
            } catch (error) {
                alert(error.message || 'Failed to send the post.');
            } finally {
                sendAllBtn.disabled = false;
                sendAllBtn.innerText = 'Send to All Subscribers';
            }
        });
    }

    if (sendSpecificPickerBtn) {
        sendSpecificPickerBtn.addEventListener('click', async () => {
            if (!sendSpecificPickerPanel) {
                return;
            }

            const isOpen = sendSpecificPickerPanel.style.display === 'block';
            sendSpecificPickerPanel.style.display = isOpen ? 'none' : 'block';
            sendSpecificPickerBtn.innerHTML = isOpen
                ? '<i class="fas fa-plus"></i>'
                : '<i class="fas fa-xmark"></i>';
            if (!isOpen) {
                await loadSubscriberPicker();
            }
        });
    }

    if (sendSpecificPickerSearch) {
        sendSpecificPickerSearch.addEventListener('input', () => {
            subscriberPickerSearchQuery = String(sendSpecificPickerSearch.value || '').trim();
            renderSubscriberPicker();
        });
    }

    if (sendSpecificForm) {
        sendSpecificForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const email = String(sendSpecificEmailInput?.value || '').trim();
            try {
                if (sendSpecificBtn) {
                    sendSpecificBtn.disabled = true;
                    sendSpecificBtn.innerText = 'Sending...';
                }
                await sendCurrentPost({ recipientMode: 'single', email });
            } catch (error) {
                alert(error.message || 'Failed to send the post.');
            } finally {
                if (sendSpecificBtn) {
                    sendSpecificBtn.disabled = false;
                    sendSpecificBtn.innerText = 'Send to Email';
                }
            }
        });
    }

    updateStats();
    renderPostsTable();

    window.addEventListener('venancia:content-updated', () => {
        syncContentState();
        renderPostsTable();
    });
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initVenanciaAdmin();
    }, { once: true });
} else {
    initVenanciaAdmin();
}
