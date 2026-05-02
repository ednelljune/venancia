// Admin Dashboard Logic for Venancia Consultancy

document.addEventListener('DOMContentLoaded', async () => {
    const auth = window.VenanciaSupabaseAuth;
    if (!auth || typeof auth.requireSession !== 'function') {
        window.location.href = 'admin-login.html';
        return;
    }

    const session = await auth.requireSession().catch(() => null);
    if (!session) {
        window.location.href = 'admin-login.html';
        return;
    }

    const serverContent = window.VENANCIA_CONTENT || {};
    let posts = Array.isArray(serverContent.posts) ? serverContent.posts : [];
    let activeTab = 'overview';

    const postsTableBody = document.getElementById('posts-table-body');
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
    const postIdInput = document.getElementById('post-id-input');
    const postTitleInput = document.getElementById('post-title-input');
    const postCategoryInput = document.getElementById('post-category-input');
    const postReadTimeInput = document.getElementById('post-read-time-input');
    const postDateInput = document.getElementById('post-date-input');
    const postContentInput = document.getElementById('post-content-input');
    const postAnnouncementInput = document.getElementById('post-announcement-input');
    const exportTextarea = document.getElementById('export-textarea');

    const closeModalButtons = document.querySelectorAll('.close-modal');
    const tabLinks = document.querySelectorAll('.nav-item[data-tab]');

    const escapeHtml = (value) => String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

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
    const isSettingsTab = () => activeTab === 'settings';

    const getVisiblePosts = () => {
        if (activeTab === 'announcements') {
            return sortPosts(posts.filter((post) => post.isAnnouncement));
        }

        return sortPosts(posts.filter((post) => !post.isAnnouncement));
    };

    const updateStats = () => {
        statPostsCount.innerText = posts.filter((post) => !post.isAnnouncement).length;
        statAnnounceCount.innerText = posts.filter((post) => post.isAnnouncement).length;
    };

    const syncTabUI = () => {
        if (isAnnouncementTab()) {
            tabTitle.innerText = 'Announcement Manager';
            tabSubtitle.innerText = 'Create and maintain featured announcements';
            tableTitle.innerText = 'Featured Announcements';
            addPostBtn.innerHTML = '<i class="fas fa-plus"></i> New Announcement';
            addPostBtn.disabled = false;
            tableHead.innerHTML = `
                <th>Post Title</th>
                <th>Category</th>
                <th>Date Published</th>
                <th>Read Time</th>
                <th>Actions</th>
            `;
            return;
        }

        if (isSettingsTab()) {
            tabTitle.innerText = 'Settings';
            tabSubtitle.innerText = 'Content settings are managed through the database';
            tableTitle.innerText = 'Settings';
            addPostBtn.innerHTML = '<i class="fas fa-plus"></i> New Post';
            addPostBtn.disabled = true;
            tableHead.innerHTML = `
                <th>Setting</th>
                <th>Value</th>
                <th>Status</th>
                <th>Notes</th>
                <th>Actions</th>
            `;
            return;
        }

        tabTitle.innerText = activeTab === 'blog' ? 'Blog Manager' : 'Dashboard Overview';
        tabSubtitle.innerText = 'Welcome back, Admin';
        tableTitle.innerText = 'Recent Blog Posts';
        addPostBtn.innerHTML = '<i class="fas fa-plus"></i> New Post';
        addPostBtn.disabled = false;
        tableHead.innerHTML = `
            <th>Post Title</th>
            <th>Category</th>
            <th>Date Published</th>
            <th>Read Time</th>
            <th>Actions</th>
        `;
    };

    const renderPostsTable = () => {
        syncTabUI();

        const visiblePosts = getVisiblePosts();
        if (isSettingsTab()) {
            postsTableBody.innerHTML = `
                <tr>
                    <td colspan="5" style="padding: 32px; text-align: center; color: var(--dark-grey);">
                        Settings are managed directly through the database and API.
                    </td>
                </tr>
            `;
            return;
        }

        if (visiblePosts.length === 0) {
            postsTableBody.innerHTML = `
                <tr>
                    <td colspan="5" style="padding: 32px; text-align: center; color: var(--dark-grey);">
                        No posts found for this view.
                    </td>
                </tr>
            `;
            return;
        }

        postsTableBody.innerHTML = visiblePosts.map((post) => {
            const tagClass = post.tagClass || categoryTagClass(post.category);
            return `
                <tr>
                    <td class="post-title-cell">${escapeHtml(post.title)}</td>
                    <td><span class="category-tag ${tagClass}">${escapeHtml(post.category)}</span></td>
                    <td>${escapeHtml(post.date)}</td>
                    <td>${escapeHtml(post.readTime)}</td>
                    <td>
                        <div class="action-btns">
                            <button class="btn-icon edit-post" data-id="${escapeHtml(post.id)}"><i class="fas fa-edit"></i></button>
                            <button class="btn-icon delete delete-post" data-id="${escapeHtml(post.id)}"><i class="fas fa-trash-alt"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        document.querySelectorAll('.edit-post').forEach((btn) => {
            btn.addEventListener('click', () => {
                openEditModal(btn.getAttribute('data-id'));
            });
        });

        document.querySelectorAll('.delete-post').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const target = posts.find((post) => post.id === id);

                if (!target) {
                    return;
                }

                if (!confirm(`Are you sure you want to delete "${target.title}"?`)) {
                    return;
                }

                const response = await fetch(`/api/posts/${encodeURIComponent(id)}`, {
                    method: 'DELETE'
                });

                if (!response.ok) {
                    alert('Failed to delete the post.');
                    return;
                }

                posts = posts.filter((post) => post.id !== id);
                updateStats();
                renderPostsTable();
            });
        });
    };

    const openEditModal = (id) => {
        const post = posts.find((entry) => entry.id === id);
        if (!post) {
            return;
        }

        modalTitle.innerText = isAnnouncementTab() || post.isAnnouncement ? 'Edit Announcement' : 'Edit Blog Post';
        editIdInput.value = id;
        postIdInput.value = id;
        postTitleInput.value = post.title;
        postCategoryInput.value = post.category;
        postReadTimeInput.value = post.readTime;
        postDateInput.value = post.date;
        postContentInput.value = post.content;
        postAnnouncementInput.checked = Boolean(post.isAnnouncement);
        postModal.style.display = 'flex';
    };

    const openCreateModal = () => {
        modalTitle.innerText = isAnnouncementTab() ? 'Create New Announcement' : 'Create New Blog Post';
        postForm.reset();
        editIdInput.value = '';
        postAnnouncementInput.checked = isAnnouncementTab();
        postModal.style.display = 'flex';
    };

    const savePost = async () => {
        const id = postIdInput.value.trim();
        const editId = editIdInput.value.trim();
        const payload = {
            id,
            title: postTitleInput.value.trim(),
            category: postCategoryInput.value,
            readTime: postReadTimeInput.value.trim(),
            date: postDateInput.value.trim(),
            content: postContentInput.value,
            isAnnouncement: postAnnouncementInput.checked
        };

        let response;
        if (editId && editId !== id) {
            response = await fetch('/api/posts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else if (editId) {
            response = await fetch(`/api/posts/${encodeURIComponent(id)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            response = await fetch('/api/posts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Unable to save the post.');
        }

        const result = await response.json();
        const savedPost = result.post;

        if (editId && editId !== id) {
            const deleteResponse = await fetch(`/api/posts/${encodeURIComponent(editId)}`, {
                method: 'DELETE'
            });

            if (!deleteResponse.ok) {
                throw new Error('The new post was saved, but the old slug could not be removed.');
            }
        }

        posts = posts.filter((post) => post.id !== editId && post.id !== savedPost.id);
        posts.push(savedPost);
        posts = sortPosts(posts);
        updateStats();
        renderPostsTable();
        postModal.style.display = 'none';
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

    addPostBtn.addEventListener('click', () => {
        if (addPostBtn.disabled) {
            return;
        }

        openCreateModal();
    });

    closeModalButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            postModal.style.display = 'none';
            exportModal.style.display = 'none';
        });
    });

    postForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        try {
            await savePost();
        } catch (error) {
            alert(error.message || 'Unable to save the post.');
        }
    });

    logoutBtn.addEventListener('click', async () => {
        await auth.signOut().catch(() => null);
        window.location.href = 'admin-login.html';
    });

    document.getElementById('export-btn').addEventListener('click', () => {
        const exportStr = `window.VENANCIA_CONTENT = ${JSON.stringify({ posts }, null, 4)};`;
        exportTextarea.value = exportStr;
        exportModal.style.display = 'flex';
    });

    document.getElementById('copy-export-btn').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(exportTextarea.value);
            alert('Configuration copied to clipboard!');
        } catch (error) {
            exportTextarea.select();
            document.execCommand('copy');
            alert('Configuration copied to clipboard!');
        }
    });

    updateStats();
    renderPostsTable();
});
