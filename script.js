const initVenanciaSite = () => {
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

    const observeRevealElements = (scope = document) => {
        scope.querySelectorAll('[data-reveal]:not(.revealed)').forEach((el) => revealObserver.observe(el));
    };

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
    const formErrorMessage = formError?.querySelector('p');
    const fileInput = document.getElementById('cv');
    const fileInputText = document.querySelector('.file-input-text');
    const formSubjectInput = document.getElementById('form-subject');
    const submittedAtAuInput = document.getElementById('submitted-at-au');
    const assessmentSubmitFrame = document.getElementById('assessment-submit-frame');
    const defaultFileText = 'Choose your CV (PDF, DOC, DOCX)';
    const defaultFormErrorMessage = formErrorMessage?.textContent || '';

    if (assessmentForm) {
        let submitBtn = null;
        let originalBtnText = '';
        let waitingForFormSubmit = false;
        let formSubmitTimeout = null;

        const resetSubmitButton = () => {
            if (submitBtn) {
                submitBtn.innerText = originalBtnText;
                submitBtn.disabled = false;
            }
        };

        const finishSubmission = () => {
            waitingForFormSubmit = false;
            if (formSubmitTimeout) {
                window.clearTimeout(formSubmitTimeout);
                formSubmitTimeout = null;
            }

            assessmentForm.classList.add('hidden');
            formSuccess?.classList.remove('hidden');
            if (formError) {
                formError.classList.add('hidden');
                if (formErrorMessage && defaultFormErrorMessage) {
                    formErrorMessage.textContent = defaultFormErrorMessage;
                }
            }
            resetSubmitButton();
        };

        if (assessmentSubmitFrame) {
            assessmentSubmitFrame.addEventListener('load', () => {
                if (!waitingForFormSubmit) {
                    return;
                }

                finishSubmission();
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

            try {
                const response = await fetch('/api/assessment-reply', {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json().catch(() => ({}));

                if (!response.ok) {
                    throw new Error(result?.error || 'Submission failed.');
                }

                waitingForFormSubmit = true;
                formSubmitTimeout = window.setTimeout(() => {
                    if (!waitingForFormSubmit) {
                        return;
                    }

                    waitingForFormSubmit = false;
                    if (formError) {
                        if (formErrorMessage) {
                            formErrorMessage.textContent = 'We could not hand your submission to our mail system. Please try again.';
                        }
                        formError.classList.remove('hidden');
                    }
                    resetSubmitButton();
                }, 12000);

                assessmentForm.submit();
            } catch (error) {
                if (formError) {
                    formError.classList.remove('hidden');
                }
                resetSubmitButton();
            }
        });
    }

    // Reset Form function (global)
    window.resetForm = () => {
        assessmentForm.reset();
        assessmentForm.classList.remove('hidden');
        formSuccess.classList.add('hidden');
        if (formError) {
            formError.classList.add('hidden');
            if (formErrorMessage && defaultFormErrorMessage) {
                formErrorMessage.textContent = defaultFormErrorMessage;
            }
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
    const subscribeApiUrl = `${apiBaseUrl}/api/subscribe`;

    if (subscribeForm) {
        let subBtn = null;
        const originalBtnText = subscribeForm.querySelector('button[type="submit"]')?.innerText || 'Subscribe';

        subscribeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            subBtn = subscribeForm.querySelector('button[type="submit"]');
            if (subBtn) {
                subBtn.innerText = 'Subscribing...';
                subBtn.disabled = true;
            }

            if (subscribeError) {
                subscribeError.classList.add('hidden');
            }

            const email = document.getElementById('subscribe-email')?.value.trim();
            try {
                const response = await fetch(subscribeApiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email })
                });

                if (!response.ok) {
                    const data = await response.json().catch(() => ({}));
                    if (response.status === 409 && subscribeError) {
                        const titleEl = subscribeError.querySelector('h4');
                        const textEl = subscribeError.querySelector('p');
                        if (titleEl) titleEl.innerText = 'You’re already subscribed';
                        if (textEl) textEl.innerHTML = 'This email is already on the list. If you want to stop updates, use <a href="/unsubscribe.html">unsubscribe</a>.';
                        subscribeError.classList.remove('hidden');
                        if (subBtn) {
                            subBtn.innerText = originalBtnText;
                            subBtn.disabled = false;
                        }
                        return;
                    }
                    throw new Error(data.error || 'Unable to subscribe right now.');
                }

                subscribeForm.classList.add('hidden');
                if (subscribeSuccess) {
                    subscribeSuccess.classList.remove('hidden');
                }
            } catch (error) {
                if (subscribeError) {
                    subscribeError.classList.remove('hidden');
                }
                if (subBtn) {
                    subBtn.innerText = originalBtnText;
                    subBtn.disabled = false;
                }
            }
        });
    }

    // 12. Database-backed blog and announcement rendering
    let allPosts = Array.isArray(window.VENANCIA_CONTENT?.posts) ? window.VENANCIA_CONTENT.posts : [];

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

    const uniquePostsById = (posts) => {
        const seen = new Set();
        return posts.filter((post) => {
            if (!post?.id || seen.has(post.id)) {
                return false;
            }
            seen.add(post.id);
            return true;
        });
    };

    const uniquePostsByContent = (posts) => {
        const seen = new Set();
        return posts.filter((post) => {
            const key = [
                String(post?.title || '').trim().toLowerCase(),
                String(post?.category || '').trim().toLowerCase(),
                String(getExcerpt(post) || '').trim().toLowerCase()
            ].join('|');

            if (seen.has(key)) {
                return false;
            }

            seen.add(key);
            return true;
        });
    };

    const getVisiblePosts = () => sortPosts(allPosts.filter((post) => !post.isAnnouncement));
    const getAnnouncements = () => sortPosts(allPosts.filter((post) => post.isAnnouncement));

    const syncContentState = () => {
        allPosts = Array.isArray(window.VENANCIA_CONTENT?.posts) ? window.VENANCIA_CONTENT.posts : [];
    };

    const renderAnnouncementCards = (grid) => {
        if (!grid) return;

        const announcements = getAnnouncements();
        if (announcements.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; padding: 28px; border: 1px dashed rgba(255,255,255,0.25); border-radius: 18px; color: rgba(255,255,255,0.75); text-align: center;">
                    No announcement available yet.
                </div>
            `;
            return;
        }

        grid.innerHTML = announcements.map((post) => {
            const tagClass = post.tagClass || categoryTagClass(post.category);
            return `
                <a href="article.html?post=${encodeURIComponent(post.id)}" class="blog-card" style="background: white; padding: 25px; border-radius: 15px; border: 1px solid rgba(0,0,0,0.06); position: relative; transition: var(--transition); text-decoration: none; display: block; box-shadow: var(--shadow-light);" data-reveal="fade-up" data-category="${escapeHtml(post.category)}">
                    <div style="margin-bottom: 15px;">
                        <span class="category-tag ${tagClass}" style="display: inline-block;">${escapeHtml(post.category)}</span>
                    </div>
                    <h4 style="font-size: 1.25rem; margin-bottom: 8px; color: inherit;">${escapeHtml(post.title)}</h4>
                    <p style="font-size: 0.95rem; color: var(--dark-grey); line-height: 1.5;">${escapeHtml(getExcerpt(post))}</p>
                </a>
            `;
        }).join('');
    };

    const renderFeaturedPosts = (container, posts, variant) => {
        if (!container) return;

        if (!posts.length) {
            container.innerHTML = `
                <div style="padding: 32px; border-radius: 24px; border: 1px dashed rgba(0,0,0,0.15); color: var(--dark-grey); text-align: center; background: rgba(255,255,255,0.9);">
                    No content available yet.
                </div>
            `;
            return;
        }

        const cardStyle = 'background: white; padding: 26px 28px; border-radius: 20px; border: 1px solid rgba(0,0,0,0.06); position: relative; transition: var(--transition); text-decoration: none; display: block; box-shadow: var(--shadow-light);';

        container.innerHTML = posts.slice(0, 3).map((post) => {
            const tagClass = post.tagClass || categoryTagClass(post.category);
            const excerpt = escapeHtml(getExcerpt(post));

            return `
                <a href="article.html?post=${encodeURIComponent(post.id)}" class="blog-card featured-post-card" data-reveal="fade-up" data-category="${escapeHtml(post.category)}" style="${cardStyle}">
                    <div style="margin-bottom: 18px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
                        <span class="category-tag ${tagClass}" style="display: inline-block;">${escapeHtml(post.category)}</span>
                        <span style="font-size: 0.8rem; color: var(--dark-grey); opacity: 0.6;"><i class="far fa-clock"></i> ${escapeHtml(post.readTime)}</span>
                    </div>
                    <h3 style="font-size: 1.1rem; margin-bottom: 12px; color: inherit; line-height: 1.25;">${escapeHtml(post.title)}</h3>
                    <p style="font-size: 0.9rem; color: var(--dark-grey); line-height: 1.65; margin-bottom: 0;">${excerpt}</p>
                </a>
            `;
        }).join('');
    };

    const renderMergedFeaturedPosts = (container, posts) => {
        if (!container) return;

        const mergedPosts = posts.slice(0, 5);

        if (mergedPosts.length === 0) {
            container.innerHTML = `
                <div style="padding: 28px; border: 1px dashed rgba(0,0,0,0.15); border-radius: 18px; color: var(--dark-grey); text-align: center; background: rgba(255,255,255,0.8);">
                    No featured updates available yet.
                </div>
            `;
            return;
        }

        container.innerHTML = mergedPosts.map((post) => {
            const tagClass = post.tagClass || categoryTagClass(post.category);
            const cardStyle = 'background: white; padding: 26px 28px; border-radius: 20px; border: 1px solid rgba(0,0,0,0.06); position: relative; transition: var(--transition); text-decoration: none; display: block; box-shadow: var(--shadow-light);';
            const excerpt = escapeHtml(getExcerpt(post));

            return `
                <a href="article.html?post=${encodeURIComponent(post.id)}" class="blog-card featured-post-card" data-reveal="fade-up" data-category="${escapeHtml(post.category)}" style="${cardStyle}">
                    <div style="margin-bottom: 18px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
                        <span class="category-tag ${tagClass}" style="display: inline-block;">${escapeHtml(post.category)}</span>
                        <span style="font-size: 0.8rem; color: var(--dark-grey); opacity: 0.6;"><i class="far fa-clock"></i> ${escapeHtml(post.readTime)}</span>
                    </div>
                    <h3 style="font-size: 1.1rem; margin-bottom: 12px; color: inherit; line-height: 1.25;">${escapeHtml(post.title)}</h3>
                    <p style="font-size: 0.9rem; color: var(--dark-grey); line-height: 1.65; margin-bottom: 0;">${excerpt}</p>
                </a>
            `;
        }).join('');
    };

    const renderSidebarList = (container, posts, emptyText) => {
        if (!container) return;

        if (!posts.length) {
            container.innerHTML = `
                <div class="newsroom-list-empty">
                    ${escapeHtml(emptyText)}
                </div>
            `;
            return;
        }

        container.innerHTML = posts.map((post) => {
            const tagClass = post.tagClass || categoryTagClass(post.category);
            return `
                <a href="article.html?post=${encodeURIComponent(post.id)}" class="newsroom-list-item light" data-reveal="fade-up" data-category="${escapeHtml(post.category)}">
                    <span class="newsroom-list-meta">
                        <span class="category-tag ${tagClass}">${escapeHtml(post.category)}</span>
                        <span><i class="far fa-clock"></i> ${escapeHtml(post.readTime)}</span>
                    </span>
                    <span class="newsroom-list-title">${escapeHtml(post.title)}</span>
                    <span class="newsroom-list-submeta">
                        <span><i class="far fa-calendar"></i> ${escapeHtml(post.date)}</span>
                        <span><i class="fas ${escapeHtml(getPostIcon(post))}"></i></span>
                    </span>
                </a>
            `;
        }).join('');
    };

    const renderMergedSidebarList = (container, posts, emptyText, pageInfoEl, prevBtn, nextBtn, page = 0, pageSize = 6) => {
        if (!container) return;

        const totalPages = Math.max(1, Math.ceil(posts.length / pageSize));
        const safePage = Math.min(Math.max(page, 0), totalPages - 1);
        const pagePosts = posts.slice(safePage * pageSize, safePage * pageSize + pageSize);
        const hasMultiplePages = totalPages > 1;

        renderSidebarList(container, pagePosts, emptyText);

        if (pageInfoEl) {
            pageInfoEl.innerText = hasMultiplePages ? `Page ${safePage + 1} of ${totalPages}` : '';
            pageInfoEl.style.display = hasMultiplePages ? '' : 'none';
        }

        if (prevBtn) {
            prevBtn.disabled = safePage === 0 || !hasMultiplePages;
            prevBtn.style.display = hasMultiplePages ? '' : 'none';
        }

        if (nextBtn) {
            nextBtn.disabled = safePage >= totalPages - 1 || !hasMultiplePages;
            nextBtn.style.display = hasMultiplePages ? '' : 'none';
        }

        if (prevBtn?.parentElement) {
            prevBtn.parentElement.style.display = hasMultiplePages ? 'flex' : 'none';
        }

        return { safePage, totalPages };
    };

    const renderBlogCards = (grid) => {
        if (!grid) return;

        const posts = getVisiblePosts();
        if (posts.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; padding: 32px; border: 1px dashed rgba(0,0,0,0.15); border-radius: 18px; color: var(--dark-grey); text-align: center; background: rgba(255,255,255,0.8);">
                    No blog posts available yet.
                </div>
            `;
            return;
        }

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

        if (relatedPosts.length === 0) {
            grid.innerHTML = `
                <div style="padding: 28px; border: 1px dashed rgba(0,0,0,0.15); border-radius: 18px; background: white; color: var(--dark-grey); text-align: center;">
                    No related posts available yet.
                </div>
            `;
            return;
        }

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
            const titleEl = document.getElementById('post-title');
            const breadcrumbEl = document.getElementById('breadcrumb-title');
            const catEl = document.getElementById('post-category');
            const contentEl = document.getElementById('post-content');
            const relatedGrid = document.getElementById('related-posts-grid');

            if (titleEl) titleEl.innerText = 'No article available';
            if (breadcrumbEl) breadcrumbEl.innerText = 'No article available';
            if (catEl) {
                catEl.innerText = 'EMPTY';
                catEl.className = 'category-tag';
            }
            if (contentEl) {
                contentEl.innerHTML = `
                    <p>There are no published articles yet. Once an admin adds a blog post in the database, it will appear here automatically.</p>
                `;
            }
            if (relatedGrid) {
                relatedGrid.innerHTML = `
                    <div style="padding: 28px; border: 1px dashed rgba(0,0,0,0.15); border-radius: 18px; background: white; color: var(--dark-grey); text-align: center;">
                        Related posts will appear after articles are published.
                    </div>
                `;
            }
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
        const announcements = getAnnouncements();
        const blogs = getVisiblePosts();
        const featuredPosts = uniquePostsByContent(uniquePostsById(sortPosts(blogs)));
        const sidebarPosts = uniquePostsByContent(uniquePostsById(sortPosts(announcements)));
        let sidebarPage = 0;
        const sidebarPageSize = 6;
        const hasSidebarPagination = sidebarPosts.length > sidebarPageSize;
        const featuredGrid = document.getElementById('featured-updates-grid');
        const updatesList = document.getElementById('updates-list');
        const updatesPage = document.getElementById('updates-page');
        const updatesPrev = document.getElementById('updates-prev');
        const updatesNext = document.getElementById('updates-next');
        const updatesNav = updatesPrev?.parentElement || document.querySelector('.newsroom-sidebar-nav');

        renderMergedFeaturedPosts(
            featuredGrid,
            featuredPosts
        );

        const updateSidebar = () => {
            if (!hasSidebarPagination) {
                renderSidebarList(
                    updatesList,
                    sidebarPosts.slice(0, sidebarPageSize),
                    sidebarPosts.length ? 'No announcements yet.' : 'No announcements yet.'
                );

                if (updatesPage) {
                    updatesPage.innerText = '';
                    updatesPage.style.display = 'none';
                }

                if (updatesNav) {
                    updatesNav.style.display = 'none';
                }

                return;
            }

            if (updatesNav) {
                updatesNav.style.display = 'flex';
            }

            const result = renderMergedSidebarList(
                updatesList,
                sidebarPosts,
                'No announcements yet.',
                updatesPage,
                updatesPrev,
                updatesNext,
                sidebarPage,
                sidebarPageSize
            );

            sidebarPage = result ? result.safePage : 0;
        };

        if (updatesPrev && hasSidebarPagination) {
            updatesPrev.onclick = () => {
                sidebarPage = Math.max(0, sidebarPage - 1);
                updateSidebar();
            };
        }

        if (updatesNext && hasSidebarPagination) {
            updatesNext.onclick = () => {
                sidebarPage = Math.min(
                    Math.max(0, Math.ceil(sidebarPosts.length / sidebarPageSize) - 1),
                    sidebarPage + 1
                );
                updateSidebar();
            };
        }

        if (!hasSidebarPagination) {
            sidebarPage = 0;
            if (updatesPrev) updatesPrev.onclick = null;
            if (updatesNext) updatesNext.onclick = null;
        }

        updateSidebar();
        observeRevealElements();
    };

    const renderContentPages = () => {
        if (window.location.pathname.includes('article.html') || window.location.href.includes('article.html')) {
            renderArticlePage();
            observeRevealElements();
        }

        if (window.location.pathname.includes('blog.html') || window.location.href.includes('blog.html')) {
            renderBlogPage();
        }
    };

    renderContentPages();

    window.addEventListener('venancia:content-updated', () => {
        syncContentState();
        renderContentPages();
    });

    // 13. Blog Page Subscribe Form Handling
    const subscribeFormBlog = document.getElementById('subscribe-form-blog');
    const subscribeSuccessBlog = document.getElementById('subscribe-success-blog');
    const subscribeErrorBlog = document.getElementById('subscribe-error-blog');
    const subscribeApiUrlBlog = `${apiBaseUrl}/api/subscribe`;

    if (subscribeFormBlog) {
        let subBtnBlog = null;
        const originalBtnTextBlog = subscribeFormBlog.querySelector('button[type="submit"]')?.innerText || 'Subscribe';

        subscribeFormBlog.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            subBtnBlog = subscribeFormBlog.querySelector('button[type="submit"]');
            if (subBtnBlog) {
                subBtnBlog.innerText = 'Subscribing...';
                subBtnBlog.disabled = true;
            }

            if (subscribeErrorBlog) {
                subscribeErrorBlog.classList.add('hidden');
            }

            const email = document.getElementById('subscribe-email-blog')?.value.trim();
            try {
                const response = await fetch(subscribeApiUrlBlog, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email })
                });

                if (!response.ok) {
                    const data = await response.json().catch(() => ({}));
                    if (response.status === 409 && subscribeErrorBlog) {
                        const titleEl = subscribeErrorBlog.querySelector('h4');
                        const textEl = subscribeErrorBlog.querySelector('p');
                        if (titleEl) titleEl.innerText = 'You’re already subscribed';
                        if (textEl) textEl.innerHTML = 'This email is already on the list. If you want to stop updates, use <a href="/unsubscribe.html">unsubscribe</a>.';
                        subscribeErrorBlog.classList.remove('hidden');
                        if (subBtnBlog) {
                            subBtnBlog.innerText = originalBtnTextBlog;
                            subBtnBlog.disabled = false;
                        }
                        return;
                    }
                    throw new Error(data.error || 'Unable to subscribe right now.');
                }

                subscribeFormBlog.classList.add('hidden');
                if (subscribeSuccessBlog) {
                    subscribeSuccessBlog.classList.remove('hidden');
                }
            } catch (error) {
                if (subscribeErrorBlog) {
                    subscribeErrorBlog.classList.remove('hidden');
                }
                if (subBtnBlog) {
                    subBtnBlog.innerText = originalBtnTextBlog;
                    subBtnBlog.disabled = false;
                }
            }
        });
    }

    // 12. Hero Carousel Logic
    const heroSlides = document.querySelectorAll('.hero-slide');
    const heroDots = document.querySelectorAll('.dot');
    const prevBtn = document.querySelector('.hero-prev');
    const nextBtn = document.querySelector('.hero-next');
    let currentSlide = 0;
    let carouselInterval;

    const showSlide = (index) => {
        heroSlides.forEach(slide => slide.classList.remove('active'));
        heroDots.forEach(dot => dot.classList.remove('active'));

        heroSlides[index].classList.add('active');
        heroDots[index].classList.add('active');
        currentSlide = index;
    };

    const nextSlide = () => {
        let index = (currentSlide + 1) % heroSlides.length;
        showSlide(index);
    };

    const prevSlide = () => {
        let index = (currentSlide - 1 + heroSlides.length) % heroSlides.length;
        showSlide(index);
    };

    const startCarousel = () => {
        carouselInterval = setInterval(nextSlide, 6000);
    };

    const stopCarousel = () => {
        clearInterval(carouselInterval);
    };

    if (heroSlides.length > 0) {
        // Event Listeners
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                stopCarousel();
                nextSlide();
                startCarousel();
            });
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                stopCarousel();
                prevSlide();
                startCarousel();
            });
        }

        heroDots.forEach((dot, index) => {
            dot.addEventListener('click', () => {
                stopCarousel();
                showSlide(index);
                startCarousel();
            });
        });

        // Initialize
        startCarousel();
    }
    }

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVenanciaSite, { once: true });
} else {
    initVenanciaSite();
}
