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

    // 12. Dynamic Single Blog Post Logic
    const blogData = {
        'norway-intake-2026': {
            title: '2026 Norway Skilled Worker Intake: Official Quotas Released',
            category: 'Urgent',
            tagClass: 'gold',
            icon: 'fa-bell',
            date: 'May 24, 2026',
            readTime: '3 min read',
            content: `
                <p>The Norwegian Directorate of Immigration (UDI) has officially released the skilled worker quotas for the 2026 intake. This year sees a significant increase in available spots for international professionals.</p>
                <h3 style="margin: 30px 0 15px;">High Demand Sectors</h3>
                <p>Norway is actively seeking talent in the following areas:</p>
                <ul style="margin-bottom: 20px; padding-left: 20px;">
                    <li style="margin-bottom: 10px;"><strong>Healthcare:</strong> Nurses, specialized doctors, and elder care professionals.</li>
                    <li style="margin-bottom: 10px;"><strong>Engineering:</strong> Structural, renewable energy, and petroleum engineers.</li>
                    <li style="margin-bottom: 10px;"><strong>Technology:</strong> Software developers, cybersecurity experts, and data scientists.</li>
                </ul>
                <h3 style="margin: 30px 0 15px;">Why Apply Now?</h3>
                <p>Early applications are highly recommended as the quota is expected to be filled quickly. Norway offers some of the highest quality of life standards globally, alongside competitive salaries and extensive social benefits.</p>
                <p><strong>Contact Venancia Consultancy today to begin your assessment for the Norway 2026 intake.</strong></p>
            `
        },
        'poland-fast-track': {
            title: 'Poland Work Permit Fast-Track: 6-Week Processing Now Available',
            category: 'New Policy',
            tagClass: '',
            icon: 'fa-bolt',
            date: 'May 22, 2026',
            readTime: '2 min read',
            content: `
                <p>In an effort to address labor shortages, the Polish government has introduced a new fast-track processing system for work permits. This policy is specifically designed for verified employers and skilled international applicants.</p>
                <h3 style="margin: 30px 0 15px;">Key Highlights of the New Policy</h3>
                <ul style="margin-bottom: 20px; padding-left: 20px;">
                    <li style="margin-bottom: 10px;"><strong>Reduced Turnaround:</strong> Average processing time has been cut from 3-4 months down to just 6 weeks.</li>
                    <li style="margin-bottom: 10px;"><strong>Priority Categories:</strong> Skilled trades, logistics, and manufacturing roles are receiving top priority.</li>
                    <li style="margin-bottom: 10px;"><strong>Simplified Verification:</strong> Streamlined documentation requirements for applicants with recognized certifications.</li>
                </ul>
                <p>This is a major opportunity for those looking to start their European career quickly. Poland remains one of the most stable and welcoming environments for international workers in the EU.</p>
            `
        },
        'top-countries': {
            title: 'Top 5 Countries in Europe Hiring Skilled Workers in 2026',
            category: 'Work',
            tagClass: '',
            icon: 'fa-briefcase',
            iconClass: '',
            date: 'May 12, 2026',
            readTime: '5 min read',
            content: `
                <p>Europe continues to face significant labor shortages across multiple sectors. As we head into 2026, several countries have streamlined their immigration pathways to attract international talent.</p>
                <h3 style="margin: 30px 0 15px;">1. Germany</h3>
                <p>With the new Opportunity Card (Chancenkarte), Germany is making it easier than ever for non-EU professionals to enter the country to seek employment. IT specialists, engineers, and healthcare workers are in highest demand.</p>
                <h3 style="margin: 30px 0 15px;">2. Poland</h3>
                <p>Poland remains one of the fastest-growing economies in Europe. It serves as an excellent entry point, particularly for manufacturing, logistics, and IT professionals. The work permit process is straightforward and well-established.</p>
                <h3 style="margin: 30px 0 15px;">3. Norway</h3>
                <p>For those seeking high salaries and an incredible work-life balance, Norway is actively recruiting skilled tradespeople, engineers, and healthcare professionals. While the cost of living is high, the compensation and benefits are unmatched.</p>
                <h3 style="margin: 30px 0 15px;">4. Spain</h3>
                <p>Spain has recently introduced new visa categories for digital nomads and highly qualified professionals. It's an attractive destination for tech workers and entrepreneurs looking for a vibrant culture.</p>
                <h3 style="margin: 30px 0 15px;">5. The Netherlands</h3>
                <p>The highly skilled migrant scheme in the Netherlands offers a 30% tax ruling for eligible expats. There is a massive demand for tech, engineering, and finance professionals.</p>
            `
        },
        'poland-work': {
            title: 'How to Apply for Work in Poland – Step-by-Step Guide',
            category: 'Work',
            tagClass: '',
            icon: 'fa-building',
            iconClass: '',
            date: 'May 15, 2026',
            readTime: '8 min read',
            content: `
                <p>Securing a job in Poland is one of the most accessible pathways into the European Union. Here is a comprehensive guide to navigating the process.</p>
                <h3 style="margin: 30px 0 15px;">Step 1: Secure a Job Offer</h3>
                <p>You cannot apply for a work permit on your own. A Polish employer must be willing to hire you and initiate the process. At Venancia, we match your skills with our network of verified Polish employers.</p>
                <h3 style="margin: 30px 0 15px;">Step 2: Employer Applies for Work Permit</h3>
                <p>Once you accept an offer, the employer applies for a Type A Work Permit (Zezwolenie na pracę) at the local Voivodeship office. This process typically takes 1-3 months.</p>
                <h3 style="margin: 30px 0 15px;">Step 3: Apply for a National Visa (D-Type)</h3>
                <p>With the approved work permit in hand, you must apply for a D-Type National Visa at the Polish embassy or consulate in your home country. You will need your passport, permit, proof of accommodation, and travel insurance.</p>
                <h3 style="margin: 30px 0 15px;">Step 4: Arrive and Apply for a Residence Card</h3>
                <p>Upon arriving in Poland, you can begin working immediately. Before your visa expires, you should apply for a Temporary Residence Card (Karta Pobytu) to extend your stay seamlessly.</p>
            `
        },
        'spain-student': {
            title: 'Student Visa for Spain: Requirements and Process',
            category: 'Student',
            tagClass: 'gold',
            icon: 'fa-graduation-cap',
            iconClass: '',
            date: 'May 18, 2026',
            readTime: '6 min read',
            content: `
                <p>Spain is a top destination for international students, offering world-class education, affordable tuition, and an incredible cultural experience. Here is what you need to know about the student visa process.</p>
                <h3 style="margin: 30px 0 15px;">Key Requirements</h3>
                <ul style="margin-bottom: 20px; padding-left: 20px;">
                    <li style="margin-bottom: 10px;"><strong>Acceptance Letter:</strong> You must be officially accepted into an accredited public or private educational institution in Spain for a full-time program.</li>
                    <li style="margin-bottom: 10px;"><strong>Proof of Funds:</strong> You must demonstrate sufficient financial means to cover your living expenses and tuition without needing to work (though limited work is permitted).</li>
                    <li style="margin-bottom: 10px;"><strong>Medical Insurance:</strong> Comprehensive health insurance from a provider authorized to operate in Spain, with no copays or coverage limits.</li>
                    <li style="margin-bottom: 10px;"><strong>Medical Certificate:</strong> Proving you do not suffer from any diseases that could have serious public health repercussions.</li>
                    <li style="margin-bottom: 10px;"><strong>Police Clearance:</strong> A clean criminal record from the countries you have resided in for the past 5 years.</li>
                </ul>
                <p>If your program lasts longer than 6 months, you must apply for a TIE (Foreigner Identity Card) within 30 days of arriving in Spain.</p>
            `
        },
        'visa-mistakes': {
            title: 'Common Mistakes in Visa Applications and How to Avoid Them',
            category: 'Visa Updates',
            tagClass: 'dark',
            icon: 'fa-passport',
            iconClass: 'dark',
            date: 'May 20, 2026',
            readTime: '4 min read',
            content: `
                <p>Visa rejections can be devastating, delaying your European dreams by months or even years. However, most rejections stem from preventable errors. Here are the most common mistakes we see.</p>
                <h3 style="margin: 30px 0 15px;">1. Incomplete or Incorrect Documentation</h3>
                <p>Embassy officials are meticulous. Missing a single required document, submitting an expired passport, or providing documents without the necessary translations or apostilles will lead to an instant rejection. Always double-check the official embassy checklist.</p>
                <h3 style="margin: 30px 0 15px;">2. Insufficient Proof of Funds</h3>
                <p>Whether you are applying for a student visa or a job seeker visa, failing to prove you have enough money to support yourself is a major red flag. Ensure your bank statements are recent, properly stamped, and meet the exact financial thresholds required.</p>
                <h3 style="margin: 30px 0 15px;">3. Vague Intentions</h3>
                <p>During visa interviews or in your statement of purpose, you must clearly articulate your goals. For students, why did you choose this specific course and university? For workers, how does this role fit your career trajectory? Vague answers raise suspicions of fraudulent intent.</p>
                <h3 style="margin: 30px 0 15px;">4. Hiding Past Visa Rejections</h3>
                <p>Never lie on a visa application. Consulates share information. If you have been rejected by another Schengen country in the past, disclose it and explain what has changed since then.</p>
                <p><strong>Need help ensuring your application is flawless? Contact Venancia Consultancy for a thorough document review before you submit.</strong></p>
            `
        }
    };

    // Parse URL and populate Article Page
    if (window.location.pathname.includes('article.html') || window.location.href.includes('article.html')) {
        const urlParams = new URLSearchParams(window.location.search);
        const postId = urlParams.get('post') || 'top-countries';
        
        const post = blogData[postId];
        
        if (post) {
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
                if (post.tagClass) catEl.className = `category-tag ${post.tagClass}`;
            }
            if (imgPlaceholderEl) {
                imgPlaceholderEl.innerHTML = `<i class="fas ${post.icon}"></i>`;
                if (post.iconClass) imgPlaceholderEl.className = `blog-image-placeholder ${post.iconClass}`;
            }
            if (contentEl) {
                contentEl.innerHTML = post.content;
            }
        }
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
