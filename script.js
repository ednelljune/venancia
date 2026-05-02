document.addEventListener('DOMContentLoaded', () => {
    // 1. Mobile Menu Toggle
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    const menuClose = document.querySelector('.mobile-menu-close');
    const mobileMenu = document.querySelector('.mobile-menu');
    const mobileLinks = document.querySelectorAll('.mobile-menu a');

    if (menuToggle && mobileMenu) {
        menuToggle.addEventListener('click', () => {
            mobileMenu.classList.add('active');
            document.body.style.overflow = 'hidden';
        });

        menuClose.addEventListener('click', () => {
            mobileMenu.classList.remove('active');
            document.body.style.overflow = '';
        });

        mobileLinks.forEach(link => {
            link.addEventListener('click', () => {
                mobileMenu.classList.remove('active');
                document.body.style.overflow = '';
            });
        });
    }

    // 2. Sticky Header Effects
    const header = document.querySelector('.main-header');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.style.padding = '10px 0';
            header.style.background = '#FFFFFF';
        } else {
            header.style.padding = '15px 0';
            header.style.background = '#FFFFFF';
        }
    });

    // 3. Reveal Animations (Intersection Observer)
    const revealElements = document.querySelectorAll('[data-reveal]');
    
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const delay = entry.target.getAttribute('data-delay') || 0;
                setTimeout(() => {
                    entry.target.classList.add('revealed');
                }, delay);
                revealObserver.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.15,
        rootMargin: '0px 0px -50px 0px'
    });

    revealElements.forEach(el => revealObserver.observe(el));

    // 4. FAQ Accordion
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        question.addEventListener('click', () => {
            // Close other items
            faqItems.forEach(otherItem => {
                if (otherItem !== item) {
                    otherItem.classList.remove('active');
                }
            });
            // Toggle current item
            item.classList.toggle('active');
        });
    });

    // 5. Form Handling
    const assessmentForm = document.getElementById('assessment-form');
    const formSuccess = document.getElementById('form-success');
    const formError = document.getElementById('form-error');
    const fileInput = document.getElementById('cv');
    const fileInputText = document.querySelector('.file-input-text');
    const formSubjectInput = document.getElementById('form-subject');
    const formTarget = document.getElementById('formsubmit-target');
    const submittedAtAuInput = document.getElementById('submitted-at-au');
    const defaultFileText = 'Choose your CV (PDF, DOC, DOCX)';

    if (assessmentForm) {
        let pendingIframeResponse = false;
        let submitBtn = null;
        let originalBtnText = '';

        const resetSubmitButton = () => {
            if (submitBtn) {
                submitBtn.innerText = originalBtnText;
                submitBtn.disabled = false;
            }
        };

        if (formTarget) {
            formTarget.addEventListener('load', () => {
                if (!pendingIframeResponse) {
                    return;
                }

                pendingIframeResponse = false;
                assessmentForm.classList.add('hidden');
                formSuccess.classList.remove('hidden');
                if (formError) {
                    formError.classList.add('hidden');
                }
                resetSubmitButton();
            });
        }

        assessmentForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            submitBtn = assessmentForm.querySelector('button[type="submit"]');
            originalBtnText = submitBtn.innerText;
            submitBtn.innerText = 'Sending...';
            submitBtn.disabled = true;

            const formData = new FormData(assessmentForm);
            const name = formData.get('name')?.toString().trim() || '';
            const subject = `Request for Assessment - ${name}`;
            const selectedFile = fileInput?.files?.[0];
            const allowedFileTypes = [
                'application/pdf',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            ];
            const maxFileSizeBytes = 10 * 1024 * 1024;

            if (formSubjectInput) {
                formSubjectInput.value = subject;
            }

            if (submittedAtAuInput) {
                submittedAtAuInput.value = new Intl.DateTimeFormat('en-AU', {
                    timeZone: 'Australia/Melbourne',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true,
                    timeZoneName: 'short'
                }).format(new Date());
            }

            if (formError) {
                formError.classList.add('hidden');
            }

            if (selectedFile) {
                const hasValidType = allowedFileTypes.includes(selectedFile.type)
                    || /\.(pdf|doc|docx)$/i.test(selectedFile.name);

                if (!hasValidType || selectedFile.size > maxFileSizeBytes) {
                    if (formError) {
                        formError.classList.remove('hidden');
                    }
                    resetSubmitButton();
                    return;
                }
            }

            pendingIframeResponse = true;
            assessmentForm.submit();
        });
    }

    // Reset Form function (global)
    window.resetForm = () => {
        assessmentForm.reset();
        assessmentForm.classList.remove('hidden');
        formSuccess.classList.add('hidden');
        if (formError) {
            formError.classList.add('hidden');
        }
        if (fileInputText) {
            fileInputText.innerText = defaultFileText;
            fileInputText.style.color = '';
        }
    };

    // 6. Smooth Scroll for all anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            e.preventDefault();
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                const headerOffset = 80;
                const elementPosition = targetElement.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    // 7. CV File Input Listener
    if (fileInput && fileInputText) {
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length > 0) {
                fileInputText.innerText = fileInput.files[0].name;
                fileInputText.style.color = '#1A1A1A';
            } else {
                fileInputText.innerText = defaultFileText;
                fileInputText.style.color = '';
            }
        });
    }

    // 8. Language Switcher Logic
    const langLinks = document.querySelectorAll('[data-lang]');

    // Function to get cookie
    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
    }

    // Function to set language cookie
    function setLanguage(lang) {
        // Remove existing cookie first
        document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=" + document.domain;
        
        // Set new cookie
        const cookieValue = lang === 'en' ? '' : `/auto/${lang}`;
        document.cookie = `googtrans=${cookieValue}; path=/`;
        
        // Final fallback for domain-specific cookies if needed
        if (lang !== 'en') {
            document.cookie = `googtrans=${cookieValue}; path=/; domain=${window.location.hostname}`;
        }
        
        location.reload();
    }

    // Update UI based on current cookie
    const currentTrans = getCookie('googtrans');
    let currentLangCode = 'en';

    if (currentTrans) {
        const parts = currentTrans.split('/');
        currentLangCode = parts[parts.length - 1];
    }



    // Update active states
    langLinks.forEach(link => {
        const lang = link.getAttribute('data-lang');
        if (lang === currentLangCode) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }

        link.addEventListener('click', (e) => {
            e.preventDefault();
            const selectedLang = link.getAttribute('data-lang');
            if (selectedLang !== currentLangCode) {
                setLanguage(selectedLang);
            }
        });
    });

    // 9. Click-to-Toggle for Language Switchers
    const headerSwitcher = document.querySelector('.header-lang-switcher');
    const mobileLangHeader = document.querySelector('.mobile-lang-header');
    const mobileLangNav = document.querySelector('.mobile-lang-nav');

    if (headerSwitcher) {
        const langBtn = headerSwitcher.querySelector('.lang-btn');
        langBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            headerSwitcher.classList.toggle('active');
        });
    }

    if (mobileLangHeader && mobileLangNav) {
        mobileLangHeader.addEventListener('click', () => {
            mobileLangNav.classList.toggle('active');
        });
    }

    // Close floating switcher when clicking outside
    document.addEventListener('click', (e) => {
        if (headerSwitcher && !headerSwitcher.contains(e.target)) {
            headerSwitcher.classList.remove('active');
        }
    });

    // 10. Insights Category Filter
    const filterBtns = document.querySelectorAll('.filter-btn');
    const blogCards = document.querySelectorAll('.blog-card');

    if (filterBtns.length > 0 && blogCards.length > 0) {
        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // Remove active class from all buttons
                filterBtns.forEach(b => b.classList.remove('active'));
                // Add active class to clicked button
                btn.classList.add('active');

                const filterValue = btn.getAttribute('data-filter');

                blogCards.forEach(card => {
                    // Start transition by fading out
                    card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                    
                    if (filterValue === 'all' || card.getAttribute('data-category') === filterValue) {
                        card.style.display = 'flex';
                        // Small delay for browser reflow
                        setTimeout(() => {
                            card.style.opacity = '1';
                            card.style.transform = 'translateY(0)';
                        }, 50);
                    } else {
                        card.style.opacity = '0';
                        card.style.transform = 'scale(0.95)';
                        setTimeout(() => {
                            card.style.display = 'none';
                        }, 300); // Wait for transition
                    }
                });
            });
        });
    }

    // 11. Subscribe Form Handling
    const subscribeForm = document.getElementById('subscribe-form');
    const subscribeSuccess = document.getElementById('subscribe-success');
    const subscribeError = document.getElementById('subscribe-error');
    const subscribeTarget = document.getElementById('formsubmit-subscribe-target');

    if (subscribeForm) {
        let pendingSubscribeResponse = false;
        let subBtn = null;

        if (subscribeTarget) {
            subscribeTarget.addEventListener('load', () => {
                if (!pendingSubscribeResponse) {
                    return;
                }
                
                pendingSubscribeResponse = false;
                subscribeForm.classList.add('hidden');
                subscribeSuccess.classList.remove('hidden');
                if (subscribeError) {
                    subscribeError.classList.add('hidden');
                }
            });
        }

        subscribeForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            subBtn = subscribeForm.querySelector('button[type="submit"]');
            if (subBtn) {
                subBtn.innerText = 'Subscribing...';
                subBtn.disabled = true;
            }

            if (subscribeError) {
                subscribeError.classList.add('hidden');
            }

            pendingSubscribeResponse = true;
            subscribeForm.submit();
        });
    }

    // 12. Database-backed blog and announcement rendering
    const contentPayload = window.VENANCIA_CONTENT || {};
    const allPosts = Array.isArray(contentPayload.posts) ? contentPayload.posts : [];

    const sortPosts = (posts) => [...posts].sort((a, b) => {
        const sortDelta = (a.sortOrder || 0) - (b.sortOrder || 0);
        if (sortDelta !== 0) return sortDelta;
        return String(a.title || '').localeCompare(String(b.title || ''));
    });

    const categoryTagClass = (category) => {
        if (category === 'Student') return 'gold';
        if (category === 'Visa Updates') return 'dark';
        if (category === 'Urgent') return 'gold';
        return '';
    };

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

    const getExcerpt = (post) => {
        const text = post.excerpt || stripHtml(post.content);
        if (text.length <= 140) return text;
        return `${text.slice(0, 137).trim()}...`;
    };

    const getPostIcon = (post) => {
        if (post.icon) return post.icon;
        if (post.isAnnouncement) {
            if (post.category === 'Urgent') return 'fa-bell';
            if (post.category === 'New Policy') return 'fa-bolt';
        }
        if (post.category === 'Student') return 'fa-graduation-cap';
        if (post.category === 'Visa Updates') return 'fa-passport';
        return 'fa-briefcase';
    };

    const getVisiblePosts = () => sortPosts(allPosts.filter((post) => !post.isAnnouncement));
    const getAnnouncements = () => sortPosts(allPosts.filter((post) => post.isAnnouncement));

    const renderAnnouncementCards = (grid) => {
        if (!grid) return;

        const announcements = getAnnouncements();
        grid.innerHTML = announcements.map((post) => {
            const tagClass = post.tagClass || categoryTagClass(post.category);
            return `
                <a href="article.html?post=${encodeURIComponent(post.id)}" class="announcement-card" style="background: rgba(255,255,255,0.03); padding: 40px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.1); position: relative; transition: var(--transition); text-decoration: none; display: block;" data-reveal="fade-up" data-category="${escapeHtml(post.category)}">
                    <div style="margin-bottom: 20px;">
                        <span class="category-tag ${tagClass}" style="display: inline-block;">${escapeHtml(post.category)}</span>
                    </div>
                    <h4 style="font-size: 1.5rem; margin-bottom: 12px; color: var(--white);">${escapeHtml(post.title)}</h4>
                    <p style="font-size: 1rem; color: rgba(255,255,255,0.7); line-height: 1.6;">${escapeHtml(getExcerpt(post))}</p>
                </a>
            `;
        }).join('');
    };

    const renderBlogCards = (grid) => {
        if (!grid) return;

        const posts = getVisiblePosts();
        grid.innerHTML = posts.map((post) => {
            const tagClass = post.tagClass || categoryTagClass(post.category);
            return `
                <a href="article.html?post=${encodeURIComponent(post.id)}" class="blog-card" data-reveal="fade-up" data-category="${escapeHtml(post.category)}">
                    <div class="blog-content">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px;">
                            <span class="category-tag ${tagClass}">${escapeHtml(post.category)}</span>
                            <div style="display: flex; align-items: center; gap: 10px; color: var(--dark-grey); opacity: 0.6; font-size: 0.8rem;">
                                <span><i class="far fa-clock"></i> ${escapeHtml(post.readTime)}</span>
                            </div>
                        </div>
                        <h3>${escapeHtml(post.title)}</h3>
                        <p>${escapeHtml(getExcerpt(post))}</p>
                    </div>
                </a>
            `;
        }).join('');
    };

    const renderRelatedPosts = (grid, currentPostId) => {
        if (!grid) return;

        const relatedPosts = getVisiblePosts()
            .filter((post) => post.id !== currentPostId)
            .slice(0, 3);

        grid.innerHTML = relatedPosts.map((post) => {
            const tagClass = post.tagClass || categoryTagClass(post.category);
            return `
                <a href="article.html?post=${encodeURIComponent(post.id)}" class="blog-card">
                    <div class="blog-content">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px;">
                            <span class="category-tag ${tagClass}">${escapeHtml(post.category)}</span>
                            <div style="display: flex; align-items: center; gap: 10px; color: var(--dark-grey); opacity: 0.6; font-size: 0.8rem;">
                                <span><i class="far fa-clock"></i> ${escapeHtml(post.readTime)}</span>
                            </div>
                        </div>
                        <h3>${escapeHtml(post.title)}</h3>
                        <p>${escapeHtml(getExcerpt(post))}</p>
                    </div>
                </a>
            `;
        }).join('');
    };

    const renderArticlePage = () => {
        const urlParams = new URLSearchParams(window.location.search);
        const postId = urlParams.get('post') || getVisiblePosts()[0]?.id;
        const post = allPosts.find((entry) => entry.id === postId) || getVisiblePosts()[0];

        if (!post) {
            return;
        }

        document.title = `${post.title} | Venancia Consultancy Pty Ltd`;

        const titleEl = document.getElementById('post-title');
        const breadcrumbEl = document.getElementById('breadcrumb-title');
        const catEl = document.getElementById('post-category');
        const imgPlaceholderEl = document.getElementById('post-image-placeholder');
        const contentEl = document.getElementById('post-content');
        const dateEl = document.getElementById('post-date');
        const timeEl = document.getElementById('post-read-time');

        if (titleEl) titleEl.innerText = post.title;
        if (breadcrumbEl) breadcrumbEl.innerText = post.title;
        if (dateEl) dateEl.innerText = post.date;
        if (timeEl) timeEl.innerText = post.readTime;
        if (catEl) {
            catEl.innerText = post.category.toUpperCase();
            const tagClass = post.tagClass || categoryTagClass(post.category);
            catEl.className = tagClass ? `category-tag ${tagClass}` : 'category-tag';
        }
        if (imgPlaceholderEl) {
            imgPlaceholderEl.innerHTML = `<i class="fas ${getPostIcon(post)}"></i>`;
            imgPlaceholderEl.className = `blog-image-placeholder ${post.iconClass || ''}`.trim();
        }
        if (contentEl) {
            contentEl.innerHTML = post.content;
        }

        const relatedGrid = document.getElementById('related-posts-grid');
        renderRelatedPosts(relatedGrid, post.id);
    };

    const renderBlogPage = () => {
        const announcementsGrid = document.getElementById('announcements-grid');
        const blogGrid = document.getElementById('blog-grid');
        renderAnnouncementCards(announcementsGrid);
        renderBlogCards(blogGrid);
    };

    if (window.location.pathname.includes('article.html') || window.location.href.includes('article.html')) {
        renderArticlePage();
    }

    if (window.location.pathname.includes('blog.html') || window.location.href.includes('blog.html')) {
        renderBlogPage();
    }

    // 13. Blog Page Subscribe Form Handling
    const subscribeFormBlog = document.getElementById('subscribe-form-blog');
    const subscribeSuccessBlog = document.getElementById('subscribe-success-blog');
    const subscribeErrorBlog = document.getElementById('subscribe-error-blog');
    const subscribeTargetBlog = document.getElementById('formsubmit-subscribe-target-blog');

    if (subscribeFormBlog) {
        let pendingSubscribeResponseBlog = false;
        let subBtnBlog = null;

        if (subscribeTargetBlog) {
            subscribeTargetBlog.addEventListener('load', () => {
                if (!pendingSubscribeResponseBlog) {
                    return;
                }
                
                pendingSubscribeResponseBlog = false;
                subscribeFormBlog.classList.add('hidden');
                subscribeSuccessBlog.classList.remove('hidden');
                if (subscribeErrorBlog) {
                    subscribeErrorBlog.classList.add('hidden');
                }
            });
        }

        subscribeFormBlog.addEventListener('submit', (e) => {
            e.preventDefault();
            
            subBtnBlog = subscribeFormBlog.querySelector('button[type="submit"]');
            if (subBtnBlog) {
                subBtnBlog.innerText = 'Subscribing...';
                subBtnBlog.disabled = true;
            }

            if (subscribeErrorBlog) {
                subscribeErrorBlog.classList.add('hidden');
            }

            pendingSubscribeResponseBlog = true;
            subscribeFormBlog.submit();
        });
    }
});
